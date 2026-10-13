'use strict';

const { tenantContext } = require('../middleware/tenant-scope');

/**
 * SlaService — the configurable SLA engine.
 *
 * A background reconciler (`reconcile`, called every 60 s from app.js) scans
 * open cases / leads / tasks, attaches the first matching active policy, and
 * maintains one `SlaInstance` timer per (record, metric). Due dates are
 * business-hours aware (see the calendar math below). When a running timer
 * crosses its warning threshold or its deadline, the configured escalations
 * fire (notify owner/manager, raise priority, create a follow-up task).
 *
 * Terminology
 *   metric      — first_response | resolution
 *   dimension   — the per-record value targets are keyed by:
 *                 case → priority, lead → rating, task → priority
 *   status      — running | paused | met | breached | canceled
 */

// ── Entity configuration ────────────────────────────────────────────────────
const ENTITY = {
  case: {
    model:         'crmCase',
    statusField:   'status',
    dimField:      'priority',
    ownerField:    'owner_id',
    openWhere:     { status: { notIn: ['resolved', 'closed'] } },
    priorityLadder: ['low', 'medium', 'high', 'critical'],
    label:         (r) => r.subject || `Case #${r.id}`,
    metricStatus: {
      first_response: (r) => (r.status === 'new' ? 'running' : 'met'),
      resolution:     (r) => (['resolved', 'closed'].includes(r.status) ? 'met' : 'running'),
    },
  },
  lead: {
    model:         'crmLead',
    statusField:   'lead_status',
    dimField:      'rating',
    ownerField:    'owner_id',
    openWhere:     { is_converted: false, lead_status: { notIn: ['converted'] } },
    priorityLadder: ['cold', 'warm', 'hot'],
    label:         (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Lead #${r.id}`,
    metricStatus: {
      first_response: (r) => (r.lead_status === 'new' ? 'running' : 'met'),
    },
  },
  task: {
    model:         'task',
    statusField:   'status',
    dimField:      'priority',
    ownerField:    'assigned_to',
    dueField:      'due_date',
    openWhere:     { status: { notIn: ['completed', 'cancelled'] } },
    priorityLadder: ['low', 'normal', 'high', 'urgent'],
    label:         (r) => r.title || `Task #${r.id}`,
    metricStatus: {
      resolution: (r) =>
        r.status === 'completed' ? 'met' : r.status === 'cancelled' ? 'canceled' : 'running',
    },
  },
};

const METRIC_LABEL = { first_response: 'First response', resolution: 'Resolution' };

// ── Business-hours calendar math (offset-based, DST-free) ───────────────────
// A calendar is { utc_offset_minutes, weekly: { mon:[["09:00","17:00"]] }, holidays:[...] }
// "wall time" = the local clock in the calendar's timezone, represented as a
// Date whose UTC getters read the local values.
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

function hmToMin(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toWall(utcDate, offsetMin) {
  return new Date(utcDate.getTime() + offsetMin * 60000);
}
function fromWall(wallDate, offsetMin) {
  return new Date(wallDate.getTime() - offsetMin * 60000);
}
function wallYmd(w) {
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}`;
}
function wallMinOfDay(w) {
  return w.getUTCHours() * 60 + w.getUTCMinutes() + w.getUTCSeconds() / 60;
}
function startOfWallDay(w) {
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
}
function dayIntervals(cal, wall) {
  const holidays = Array.isArray(cal.holidays) ? cal.holidays : [];
  if (holidays.includes(wallYmd(wall))) return [];
  const spec = (cal.weekly && cal.weekly[WEEKDAYS[wall.getUTCDay()]]) || [];
  return spec
    .map((iv) => [hmToMin(iv[0]), hmToMin(iv[1])])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
}
function isValidCalendar(cal) {
  if (!cal || !cal.weekly) return false;
  return WEEKDAYS.some((d) => Array.isArray(cal.weekly[d]) && cal.weekly[d].length);
}

/** Instant that is `minutes` of working time after `start`. */
function addBusinessMinutes(start, minutes, cal) {
  if (!isValidCalendar(cal)) return new Date(start.getTime() + minutes * 60000); // 24/7 fallback
  if (minutes <= 0) return new Date(start);
  const offset = cal.utc_offset_minutes || 0;
  let wall = toWall(start, offset);
  let cursor = wallMinOfDay(wall);
  let remaining = minutes;
  for (let i = 0; i < 732 && remaining > 0; i++) {
    for (const [s, e] of dayIntervals(cal, wall)) {
      const from = Math.max(cursor, s);
      if (from >= e) continue;
      const avail = e - from;
      if (avail >= remaining) {
        const dueWall = new Date(startOfWallDay(wall).getTime() + (from + remaining) * 60000);
        return fromWall(dueWall, offset);
      }
      remaining -= avail;
    }
    wall = new Date(startOfWallDay(wall).getTime() + DAY_MS);
    cursor = 0;
  }
  return new Date(start.getTime() + minutes * 60000);
}

/** Minutes of working time between two instants. */
function businessMinutesBetween(from, to, cal) {
  if (to <= from) return 0;
  if (!isValidCalendar(cal)) return (to - from) / 60000;
  const offset = cal.utc_offset_minutes || 0;
  let wall = toWall(from, offset);
  const endWall = toWall(to, offset);
  const endYmd = wallYmd(endWall);
  let cursor = wallMinOfDay(wall);
  let total = 0;
  for (let i = 0; i < 732; i++) {
    const sameDay = wallYmd(wall) === endYmd;
    const cap = sameDay ? wallMinOfDay(endWall) : 24 * 60;
    for (const [s, e] of dayIntervals(cal, wall)) {
      const a = Math.max(cursor, s);
      const b = Math.min(cap, e);
      if (b > a) total += b - a;
    }
    if (sameDay) break;
    wall = new Date(startOfWallDay(wall).getTime() + DAY_MS);
    cursor = 0;
  }
  return total;
}

// ── Condition + target matching ─────────────────────────────────────────────
/** Operators a policy condition may use. Kept in step with the Builder's list. */
const CONDITION_OPS = Object.freeze(['equals', 'not_equals', 'in', 'not_in', 'contains', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty']);

/**
 * Does a policy's condition set match this record?
 *
 * An empty condition list matches everything — that is the documented way to
 * write a catch-all policy, and it is deliberate.
 *
 * An operator we do not recognise does **not** match. It used to `return true`,
 * so a typo in a condition silently widened the policy to every record of the
 * entity — the opposite of what the author asked for, and invisible until
 * someone noticed the wrong records carrying timers. The workflow and
 * assignment engines both fail closed here; this one was the outlier.
 */
function conditionsMatch(conditions, rec) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((c) => {
    const actual = rec[c.field];
    const expected = c.value;
    const list = () => (Array.isArray(expected) ? expected : String(expected ?? '').split(',').map((v) => v.trim()));
    switch (c.op) {
      case 'equals':       return String(actual) === String(expected);
      case 'not_equals':   return String(actual) !== String(expected);
      case 'in':           return list().map(String).includes(String(actual));
      case 'not_in':       return !list().map(String).includes(String(actual));
      case 'contains':     return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
      case 'gt':           return Number(actual) >  Number(expected);
      case 'gte':          return Number(actual) >= Number(expected);
      case 'lt':           return Number(actual) <  Number(expected);
      case 'lte':          return Number(actual) <= Number(expected);
      case 'is_empty':     return actual == null || String(actual).trim() === '';
      case 'is_not_empty': return actual != null && String(actual).trim() !== '';
      default:             return false; // unknown operator never matches
    }
  });
}
function pickTarget(targets, metric, dim) {
  const forMetric = targets.filter((t) => t.metric === metric);
  return forMetric.find((t) => t.priority === dim) || forMetric.find((t) => t.priority === '*') || null;
}

// ── Service ─────────────────────────────────────────────────────────────────
class SlaService {
  #running = false;

  constructor(prisma, logger = console) {
    this.db = prisma;
    this.log = logger;
  }

  /** Scheduler entry point — safe against overlapping ticks. */
  async reconcile() {
    if (this.#running) return { skipped: true };
    this.#running = true;
    const summary = { case: 0, lead: 0, task: 0 };
    try {
      for (const type of Object.keys(ENTITY)) {
        summary[type] = await this.#reconcileEntity(type);
      }
    } catch (err) {
      this.log.error?.({ err }, '[sla] reconcile error');
    } finally {
      this.#running = false;
    }
    return summary;
  }

  async #reconcileEntity(type) {
    const cfg = ENTITY[type];
    const metricNames = Object.keys(cfg.metricStatus);

    const policies = await this.db.slaPolicy.findMany({
      where:   { entity_type: type, is_active: true },
      include: { targets: true, escalations: true, business_hours: true },
      orderBy: [{ tenant_id: 'asc' }, { order_index: 'asc' }],
    });
    if (policies.length === 0) return 0;
    const policiesByTenant = {};
    for (const p of policies) (policiesByTenant[p.tenant_id] ||= []).push(p);

    const openRecords = await this.db[cfg.model].findMany({ where: cfg.openWhere });
    const openIds = new Set(openRecords.map((r) => r.id));

    // Records that left the open set but still have live timers → finalize them.
    const live = await this.db.slaInstance.findMany({
      where:  { entity_type: type, status: { in: ['running', 'paused', 'breached'] } },
      select: { entity_id: true },
    });
    const missingIds = [...new Set(live.map((i) => i.entity_id))].filter((id) => !openIds.has(id));
    const closedRecords = missingIds.length
      ? await this.db[cfg.model].findMany({ where: { id: { in: missingIds } } })
      : [];

    let processed = 0;
    for (const rec of [...openRecords, ...closedRecords]) {
      const tenantPolicies = policiesByTenant[rec.tenant_id] || [];
      await tenantContext.run({ tenantId: rec.tenant_id }, async () => {
        try {
          await this.#processRecord(type, cfg, metricNames, rec, tenantPolicies);
          processed++;
        } catch (err) {
          this.log.error?.({ err, type, id: rec.id }, '[sla] record error');
        }
      });
    }
    return processed;
  }

  async #processRecord(type, cfg, metricNames, rec, tenantPolicies) {
    const now = new Date();
    const ownerId = rec[cfg.ownerField] || null;
    const dim = String(rec[cfg.dimField] ?? '*');
    const policy = tenantPolicies.find((p) => conditionsMatch(p.conditions, rec));

    for (const metric of metricNames) {
      const existing = await this.db.slaInstance.findUnique({
        where: { entity_type_entity_id_metric: { entity_type: type, entity_id: rec.id, metric } },
      });
      if (existing && ['met', 'canceled'].includes(existing.status)) continue; // terminal

      const target = policy ? pickTarget(policy.targets, metric, dim) : null;
      if (!existing && !target) continue;                 // nothing to track
      if (existing && !target) {                          // policy/target removed → cancel
        await this.db.slaInstance.update({ where: { id: existing.id }, data: { status: 'canceled' } });
        continue;
      }

      const mStatus = cfg.metricStatus[metric](rec);
      const cal = policy.business_hours || null;

      if (!existing) {
        await this.#createInstance({ type, cfg, rec, metric, dim, ownerId, target, cal, mStatus, now });
      } else {
        await this.#updateInstance({ type, cfg, rec, policy, metric, ownerId, existing, cal, mStatus, now });
      }
    }
  }

  async #createInstance({ type, cfg, rec, metric, dim, ownerId, target, cal, mStatus, now }) {
    const started = rec.created_at || now;
    let dueAt, warnAt;
    const explicitDue = cfg.dueField && metric === 'resolution' && rec[cfg.dueField];
    if (explicitDue) {
      dueAt = new Date(rec[cfg.dueField]);
      warnAt = new Date(started.getTime() + (dueAt - started) * (target.warning_pct / 100));
    } else {
      dueAt = addBusinessMinutes(started, target.target_minutes, cal);
      warnAt = addBusinessMinutes(started, target.target_minutes * (target.warning_pct / 100), cal);
    }

    // Backfill flags to reflect reality, but do NOT fire escalations on creation.
    let status = 'running';
    let completed_at = null, breached_at = null, warned = false, breached = false;
    if (mStatus === 'canceled') {
      status = 'canceled';
    } else if (mStatus === 'met') {
      status = 'met';
      completed_at = rec.updated_at || now;
      breached = completed_at > dueAt;
      breached_at = breached ? dueAt : null;
      warned = true;
    } else {
      warned = now >= warnAt;
      if (now > dueAt) { breached = true; breached_at = dueAt; status = 'breached'; }
    }

    await this.db.slaInstance.create({
      data: {
        policy_id: target.policy_id, entity_type: type, entity_id: rec.id, metric,
        priority: dim, owner_id: ownerId, target_minutes: target.target_minutes,
        started_at: started, due_at: dueAt, warning_at: warnAt,
        status, warned, breached, completed_at, breached_at,
      },
    });
  }

  async #updateInstance({ type, cfg, rec, policy, metric, ownerId, existing, cal, mStatus, now }) {
    const data = { owner_id: ownerId };
    let dueAt = existing.due_at;
    let warnAt = existing.warning_at;

    // ── Pause / resume ──
    const pauseStatuses = Array.isArray(policy.pause_statuses) ? policy.pause_statuses : [];
    const recStatus = rec[cfg.statusField];
    const shouldPause = pauseStatuses.includes(recStatus);
    if (shouldPause && !existing.paused_at && mStatus === 'running') {
      data.paused_at = now;
      data.status = 'paused';
    } else if (!shouldPause && existing.paused_at) {
      const pausedMins = businessMinutesBetween(existing.paused_at, now, cal);
      dueAt = addBusinessMinutes(existing.due_at, pausedMins, cal);
      warnAt = addBusinessMinutes(existing.warning_at, pausedMins, cal);
      data.due_at = dueAt; data.warning_at = warnAt; data.paused_at = null;
      data.status = existing.breached ? 'breached' : 'running';
    }

    if (mStatus === 'canceled') {
      data.status = 'canceled';
      await this.db.slaInstance.update({ where: { id: existing.id }, data });
      return;
    }
    if (mStatus === 'met') {
      data.status = 'met';
      data.completed_at = now;
      if (existing.breached || now > dueAt) { data.breached = true; data.breached_at = existing.breached_at || dueAt; }
      await this.db.slaInstance.update({ where: { id: existing.id }, data });
      return;
    }

    // Running (and not paused this tick): evaluate thresholds → fire escalations.
    const paused = data.status === 'paused' || (existing.paused_at && data.paused_at !== null);
    if (!paused) {
      if (!existing.warned && now >= warnAt) {
        data.warned = true;
        await this.#runEscalations(policy, existing, rec, cfg, metric, 'warning');
      }
      if (!existing.breached && now > dueAt) {
        data.breached = true;
        data.breached_at = now;
        data.status = 'breached';
        await this.#runEscalations(policy, existing, rec, cfg, metric, 'breach');
      } else if (!existing.breached) {
        data.status = 'running';
      }
    }
    await this.db.slaInstance.update({ where: { id: existing.id }, data });
  }

  async #runEscalations(policy, instance, rec, cfg, metric, trigger) {
    const escs = (policy.escalations || [])
      .filter((e) => (e.metric === metric || e.metric === '*') && e.trigger === trigger)
      .sort((a, b) => a.order_index - b.order_index);
    if (escs.length === 0) return;

    const ownerId = rec[cfg.ownerField] || null;
    const label = cfg.label(rec);
    const link = `/sla?focus=${instance.entity_type}:${rec.id}`;
    const verb = trigger === 'breach' ? 'breached' : 'is at risk';
    const title = `SLA ${trigger === 'breach' ? 'breach' : 'warning'}: ${METRIC_LABEL[metric] || metric}`;
    const body = `${label} — ${METRIC_LABEL[metric] || metric} SLA ${verb}.`;

    for (const esc of escs) {
      try {
        switch (esc.action) {
          case 'notify_owner':
            if (ownerId) await this.#notify(ownerId, title, body, link);
            break;
          case 'notify_manager': {
            const mgr = await this.#managerOf(ownerId);
            if (mgr) await this.#notify(mgr, title, body, link);
            break;
          }
          case 'raise_priority':
            await this.#raisePriority(cfg, rec);
            break;
          case 'create_task':
            if (ownerId) await this.#createFollowupTask(ownerId, rec, cfg, title, label);
            break;
          default:
            break;
        }
      } catch (err) {
        this.log.error?.({ err, action: esc.action }, '[sla] escalation action failed');
      }
    }
  }

  async #notify(employeeId, title, body, link) {
    await this.db.notification.create({
      data: { employee_id: employeeId, type: 'sla', title, body, link },
    });
  }

  async #managerOf(employeeId) {
    if (!employeeId) return null;
    const row = await this.db.employeeHierarchy.findFirst({
      where: { descendant_id: employeeId, depth: 1 },
      select: { ancestor_id: true },
    });
    return row?.ancestor_id || null;
  }

  async #raisePriority(cfg, rec) {
    const ladder = cfg.priorityLadder;
    const field = cfg.dimField;
    if (cfg.model === 'crmLead') return; // don't rewrite lead ratings
    const cur = rec[field];
    const idx = ladder.indexOf(cur);
    if (idx < 0 || idx >= ladder.length - 1) return;
    await this.db[cfg.model].update({ where: { id: rec.id }, data: { [field]: ladder[idx + 1] } });
  }

  async #createFollowupTask(ownerId, rec, cfg, title, label) {
    await this.db.task.create({
      data: {
        assigned_to: ownerId,
        created_by:  ownerId,
        title:       `${title} — ${label}`.slice(0, 200),
        description: `Auto-created by the SLA engine. Please action ${label} to meet its service-level agreement.`,
        status:      'open',
        priority:    'high',
        due_date:    new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  }

  // ── Dashboard queries (called inside a request → tenant-scoped) ────────────
  async getDashboard({ employeeId, scope = 'me' }) {
    const where = { status: { in: ['running', 'paused', 'breached', 'met'] } };
    if (scope === 'me') {
      where.owner_id = employeeId;
    } else if (scope === 'team') {
      const ids = await this.#teamIds(employeeId);
      where.owner_id = { in: ids };
    } // scope === 'all' → no owner filter

    const instances = await this.db.slaInstance.findMany({
      where,
      orderBy: { due_at: 'asc' },
      take: 2000,
    });

    const now = Date.now();
    const active = [];
    let onTrack = 0, atRisk = 0, breachedOpen = 0, metOnTime = 0, metLate = 0;
    const byPriority = {}, byEntity = {}, byPolicy = {};

    for (const i of instances) {
      const due = new Date(i.due_at).getTime();
      const warn = new Date(i.warning_at).getTime();
      let bucket;
      if (i.status === 'met') {
        if (i.breached) { metLate++; bucket = 'met_late'; } else { metOnTime++; bucket = 'met'; }
      } else if (i.status === 'breached' || i.breached || now > due) {
        breachedOpen++; bucket = 'breached'; active.push(i);
      } else if (now >= warn) {
        atRisk++; bucket = 'at_risk'; active.push(i);
      } else {
        onTrack++; bucket = 'on_track'; active.push(i);
      }
      (byEntity[i.entity_type] ||= { total: 0, breached: 0, at_risk: 0 });
      byEntity[i.entity_type].total++;
      (byPriority[i.priority] ||= { total: 0, breached: 0, at_risk: 0 });
      byPriority[i.priority].total++;
      (byPolicy[i.policy_id] ||= { total: 0, breached: 0, at_risk: 0 });
      byPolicy[i.policy_id].total++;
      if (bucket === 'breached') { byEntity[i.entity_type].breached++; byPriority[i.priority].breached++; byPolicy[i.policy_id].breached++; }
      if (bucket === 'at_risk')  { byEntity[i.entity_type].at_risk++;  byPriority[i.priority].at_risk++;  byPolicy[i.policy_id].at_risk++; }
    }

    const completed = metOnTime + metLate;
    const compliance = completed ? Math.round((metOnTime / completed) * 1000) / 10 : null;

    // Enrich the most-urgent open timers (breached + at-risk first, soonest due).
    const urgent = active
      .sort((a, b) => {
        const rank = (x) => (x.status === 'breached' || x.breached ? 0 : new Date(x.warning_at).getTime() <= now ? 1 : 2);
        return rank(a) - rank(b) || new Date(a.due_at) - new Date(b.due_at);
      })
      .slice(0, 60);
    const enriched = await this.#enrich(urgent);

    const policyNames = await this.#policyNames(Object.keys(byPolicy).map(Number));

    return {
      summary: {
        active: onTrack + atRisk + breachedOpen,
        on_track: onTrack, at_risk: atRisk, breached: breachedOpen,
        met_on_time: metOnTime, met_late: metLate, completed,
        compliance,
      },
      breakdown: {
        by_entity: byEntity,
        by_priority: byPriority,
        by_policy: Object.entries(byPolicy).map(([id, v]) => ({ policy_id: Number(id), name: policyNames[id] || `Policy ${id}`, ...v })),
      },
      timers: enriched,
    };
  }

  async #teamIds(employeeId) {
    const rows = await this.db.employeeHierarchy.findMany({
      where: { ancestor_id: employeeId, depth: { gte: 0 } },
      select: { descendant_id: true },
    });
    const ids = rows.map((r) => r.descendant_id);
    return ids.length ? ids : [employeeId];
  }

  async #policyNames(ids) {
    if (!ids.length) return {};
    const rows = await this.db.slaPolicy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  async #enrich(instances) {
    const byType = { case: [], lead: [], task: [] };
    for (const i of instances) byType[i.entity_type]?.push(i.entity_id);

    const [cases, leads, tasks] = await Promise.all([
      byType.case.length ? this.db.crmCase.findMany({ where: { id: { in: byType.case } }, select: { id: true, subject: true, priority: true, status: true } }) : [],
      byType.lead.length ? this.db.crmLead.findMany({ where: { id: { in: byType.lead } }, select: { id: true, first_name: true, last_name: true, company: true, lead_status: true } }) : [],
      byType.task.length ? this.db.task.findMany({ where: { id: { in: byType.task } }, select: { id: true, title: true, priority: true, status: true } }) : [],
    ]);
    const caseMap = Object.fromEntries(cases.map((r) => [r.id, r]));
    const leadMap = Object.fromEntries(leads.map((r) => [r.id, r]));
    const taskMap = Object.fromEntries(tasks.map((r) => [r.id, r]));

    const ownerIds = [...new Set(instances.map((i) => i.owner_id).filter(Boolean))];
    const owners = ownerIds.length
      ? await this.db.employee.findMany({ where: { employee_id: { in: ownerIds } }, select: { employee_id: true, employee_name: true } })
      : [];
    const ownerMap = Object.fromEntries(owners.map((o) => [o.employee_id, o.employee_name]));

    return instances.map((i) => {
      let label = `#${i.entity_id}`, sub = null;
      if (i.entity_type === 'case' && caseMap[i.entity_id]) { label = caseMap[i.entity_id].subject || label; sub = caseMap[i.entity_id].status; }
      if (i.entity_type === 'lead' && leadMap[i.entity_id]) { const l = leadMap[i.entity_id]; label = `${l.first_name || ''} ${l.last_name || ''}`.trim() || label; sub = l.company || l.lead_status; }
      if (i.entity_type === 'task' && taskMap[i.entity_id]) { label = taskMap[i.entity_id].title || label; sub = taskMap[i.entity_id].status; }
      return {
        id: i.id, entity_type: i.entity_type, entity_id: i.entity_id, metric: i.metric,
        metric_label: METRIC_LABEL[i.metric] || i.metric,
        priority: i.priority, status: i.status, breached: i.breached,
        due_at: i.due_at, warning_at: i.warning_at, started_at: i.started_at,
        owner_id: i.owner_id, owner_name: ownerMap[i.owner_id] || null,
        label, sub, link: `/sla?focus=${i.entity_type}:${i.entity_id}`,
      };
    });
  }
}

module.exports = SlaService;
module.exports.ENTITY = ENTITY;
module.exports.CONDITION_OPS = CONDITION_OPS;
module.exports.METRIC_LABEL = METRIC_LABEL;
module.exports.conditionsMatch = conditionsMatch;
/**
 * Which metrics an entity can actually be measured on.
 *
 * Derived from `ENTITY[type].metricStatus`, which is what the reconciler
 * iterates — so this is the truth, not a parallel list that can drift. The
 * Builder used to offer both metrics for all three entities, and a target on an
 * unsupported pair (resolution on a lead, first response on a task) was written
 * to the database and then silently never evaluated.
 */
module.exports.metricsFor = (entityType) => Object.keys(ENTITY[entityType]?.metricStatus ?? {});
module.exports.supportedMetrics = Object.fromEntries(
  Object.entries(ENTITY).map(([type, cfg]) => [type, Object.keys(cfg.metricStatus)]),
);
