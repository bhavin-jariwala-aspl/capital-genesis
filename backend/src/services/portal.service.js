'use strict';

const crypto = require('crypto');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors');
const { fromTypedRow } = require('./crm-storage-map');
const { logger } = require('./logging.service');

/**
 * Client & introducer portal (PRD M23, M19 INT-FR-02, PRT-FR-01…07).
 *
 * A separate authentication realm: portal users are parties (clients) or
 * introducers, never employees. They sign in with a one-time code sent to the
 * email on their record, and receive a portal token — an HMAC-signed token in
 * a format the staff JWT middleware cannot accept, so a portal token can never
 * reach a staff route (and vice versa).
 *
 * What a portal user sees is Builder metadata: any object whose
 * `config.portal.<realm>` is set is exposed, filtered to the user's own
 * records through its `link` lookup field, showing the listed `fields`, and —
 * where `create` is configured — accepting new records (service requests,
 * consents, fund orders, referrals). Nothing here names a Genesis object.
 *
 *   config.portal.client = {
 *     title, link: 'party', fields: [...], order?: 'field',
 *     create?: { fields: [...], defaults: {...}, stage?, lookups?: { field: object } },
 *     uploads?: true,                // documents can be uploaded to these records
 *     row_actions?: [{               // a button on each row that creates a record in another
 *       key, label, object,          //   exposed section (e.g. Redeem on a holding → a fund order)
 *       fields: [...],               //   what the user fills in
 *       prefill?: { targetField: sourceField },  // copied from the row, not from the request
 *       defaults?: {...}, stage?,
 *     }],
 *     consent_gate?: 'field',        // introducer realm: show the stage only when true
 *   }
 */

const REALMS = new Set(['client', 'introducer']);
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_S = 8 * 60 * 60;
const SKIP_TYPES = new Set(['heading']);
/** File signatures for the upload types a client may send. */
const MAGIC = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

// ── Token (realm 'portal') ───────────────────────────────────────────────────
const secret = () => crypto.createHash('sha256').update(`genesis-portal|${process.env.PORTAL_SECRET || process.env.JWT_SECRET || 'dev'}`).digest();
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, realm: 'portal', exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }));
  const sig = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  return `gp1.${body}.${sig}`;
}

function verifyToken(token) {
  const [prefix, body, sig] = String(token ?? '').split('.');
  if (prefix !== 'gp1' || !body || !sig) return null;
  const expected = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (payload.realm !== 'portal' || !payload.exp || payload.exp < Date.now() / 1000) return null;
  return payload;
}

// ── One-time codes (Redis when available, memory otherwise) ─────────────────
class OtpStore {
  constructor(redis) { this.redis = redis; this.mem = new Map(); }
  key(tenantId, realm, email) { return `portal:otp:${tenantId}:${realm}:${String(email).toLowerCase()}`; }
  async put(k, v) {
    if (this.redis) { await this.redis.set(k, JSON.stringify(v), 'PX', OTP_TTL_MS); return; }
    this.mem.set(k, { v, at: Date.now() });
  }
  async get(k) {
    if (this.redis) { const raw = await this.redis.get(k); return raw ? JSON.parse(raw) : null; }
    const e = this.mem.get(k);
    if (!e || Date.now() - e.at > OTP_TTL_MS) { this.mem.delete(k); return null; }
    return e.v;
  }
  async del(k) { if (this.redis) await this.redis.del(k); else this.mem.delete(k); }
}

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

class PortalService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {{ recordService, emailSender?, redis?, documentService?, notificationService? }} deps
   */
  constructor(prisma, { recordService, emailSender = null, redis = null, documentService = null, notificationService = null } = {}) {
    this.db = prisma;
    this.records = recordService;
    this.email = emailSender;
    this.docs = documentService;
    this.notify = notificationService;
    this.otp = new OtpStore(redis);
  }

  static verifyToken(token) { return verifyToken(token); }

  /** How portal activity is attributed (fits the 20-char employee-id columns). */
  static actor(session) { return `portal:${String(session.realm_kind)[0]}:${session.subject_id}`; }

  // ── Sign-in ────────────────────────────────────────────────────────────────

  /** Resolve a tenant by slug (portal URLs carry the workspace slug). */
  async tenantBySlug(slug) {
    const t = await this.db.tenant.findUnique({ where: { slug: String(slug) }, select: { id: true, name: true, slug: true, status: true, logo_url: true, primary_color: true } });
    if (!t || t.status !== 'active') throw new NotFoundError('Workspace');
    return t;
  }

  /** The record a portal identity maps to: a party by email, or an introducer by portal email. */
  async #identity(realm, email) {
    const em = String(email ?? '').trim().toLowerCase();
    if (!em) return null;
    if (realm === 'client') {
      const party = await this.#objectId('party');
      const row = party && await this.db.recordFieldValue.findFirst({
        where: { field_name: 'email', str_value: em, record: { object_id: party, deleted_at: null } }, select: { record_id: true },
      });
      return row ? { id: row.record_id, kind: 'client' } : null;
    }
    const intro = await this.#objectId('introducer');
    // `config.portal_signin_stages` on the introducer object: only records in one of these stages may sign in
    // (an applicant or a suspended introducer cannot). Unset → any stage.
    const cfg = intro && await this.db.uiObject.findUnique({ where: { id: intro }, select: { config: true } });
    const stages = Array.isArray(cfg?.config?.portal_signin_stages) && cfg.config.portal_signin_stages.length ? cfg.config.portal_signin_stages : null;
    const row = intro && await this.db.recordFieldValue.findFirst({
      where: {
        field_name: 'portal_email', str_value: em,
        record: { object_id: intro, deleted_at: null, ...(stages ? { pipeline_stage: { name: { in: stages } } } : {}) },
      },
      select: { record_id: true },
    });
    return row ? { id: row.record_id, kind: 'introducer' } : null;
  }

  /**
   * Send a one-time code. Always answers the same way, whether or not the
   * email is known, so the endpoint cannot be used to probe for clients.
   * Outside production, when no mail server is configured, the code is
   * returned in the response so a demo can be run end to end.
   */
  async requestCode(tenant, realm, email) {
    if (!REALMS.has(realm)) throw new ValidationError('Unknown portal');
    const who = await this.#identity(realm, email);
    const generic = { sent: true, message: 'If this email is registered, a sign-in code has been sent.' };
    if (!who) return generic;
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await this.otp.put(this.otp.key(tenant.id, realm, email), { h: hashCode(code), id: who.id, attempts: 0 });
    let delivered = false;
    try {
      const tpl = await this.db.emailTemplate.findFirst({ where: { name: 'portal_login_code', is_active: true }, select: { id: true } });
      if (tpl && this.email) {
        await this.email.sendWithTemplate({ template_id: tpl.id, variables: { code, workspace: tenant.name }, to_email: String(email).trim(), related_record_id: who.id, related_type: 'record' });
        delivered = Boolean(process.env.SMTP_HOST);
      }
    } catch (err) {
      logger?.warn?.('[portal] login code email failed', { error: err.message });
    }
    if (!delivered && process.env.NODE_ENV !== 'production') return { ...generic, dev_code: code };
    return generic;
  }

  async verifyCode(tenant, realm, email, code) {
    const k = this.otp.key(tenant.id, realm, email);
    const entry = await this.otp.get(k);
    if (!entry) throw new AuthorizationError('The code has expired — request a new one');
    if (entry.attempts >= OTP_MAX_ATTEMPTS) { await this.otp.del(k); throw new AuthorizationError('Too many attempts — request a new code'); }
    const ok = crypto.timingSafeEqual(Buffer.from(entry.h), Buffer.from(hashCode(code)));
    if (!ok) { await this.otp.put(k, { ...entry, attempts: entry.attempts + 1 }); throw new AuthorizationError('Incorrect code'); }
    await this.otp.del(k);
    return { token: signToken({ tenant_id: tenant.id, realm_kind: realm, subject_id: entry.id }), expires_in: TOKEN_TTL_S };
  }

  // ── Metadata ───────────────────────────────────────────────────────────────

  async #objectId(name) {
    const o = await this.db.uiObject.findFirst({ where: { name, is_active: true }, select: { id: true } });
    return o?.id ?? null;
  }

  /** Objects exposed to a realm, with their field metadata. */
  async views(realm) {
    const all = await this.db.uiObject.findMany({
      where: { is_active: true },
      select: { id: true, name: true, label: true, plural_label: true, icon: true, config: true, order_index: true, fields: { where: { is_active: true }, select: { name: true, label: true, field_type: true, data_type: true, options: true, config: true } } },
    });
    const objects = all.filter((o) => o.config?.portal?.[realm]);
    const metaFor = (o) => {
      const byName = Object.fromEntries(o.fields.map((f) => [f.name, f]));
      return (n) => {
        const f = byName[n];
        return f ? { name: f.name, label: f.label, field_type: f.field_type, data_type: f.data_type, options: f.options ?? null, config: { format: f.config?.format ?? null, target_object: f.config?.target_object ?? null } } : null;
      };
    };
    return objects
      .map((o) => {
        const cfg = o.config.portal[realm];
        const meta = metaFor(o);
        // A row action may only create records in another section of the same realm.
        const rowActions = (cfg.row_actions ?? []).map((a) => {
          const target = objects.find((t) => t.name === a.object && t.config.portal[realm]?.link);
          if (!target || !a.key) return null;
          return { key: a.key, label: a.label ?? a.key, object: a.object, fields: (a.fields ?? []).map(metaFor(target)).filter(Boolean) };
        }).filter(Boolean);
        return {
          object: o.name, object_id: o.id, title: cfg.title ?? o.plural_label ?? o.label, icon: o.icon, order: cfg.order_index ?? o.order_index,
          link: cfg.link, fields: (cfg.fields ?? []).map(meta).filter(Boolean),
          create: cfg.create ? { label: cfg.create.label ?? `New ${o.label}`, fields: (cfg.create.fields ?? []).map(meta).filter(Boolean), lookups: cfg.create.lookups ?? {} } : null,
          row_actions: rowActions, uploads: Boolean(cfg.uploads), consent_gate: cfg.consent_gate ?? null,
        };
      })
      .filter((v) => v.link)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async #view(realm, objectName) {
    const v = (await this.views(realm)).find((x) => x.object === objectName);
    if (!v) throw new NotFoundError('Section');
    return v;
  }

  /** The subject's own records of one exposed object. */
  async list(session, objectName) {
    const v = await this.#view(session.realm_kind, objectName);
    const links = await this.db.recordFieldValue.findMany({
      where: { field_name: v.link, str_value: String(session.subject_id), record: { object_id: v.object_id, deleted_at: null } },
      select: { record_id: true }, orderBy: { record_id: 'desc' }, take: 200,
    });
    const ids = links.map((l) => l.record_id);
    if (!ids.length) return { view: v, records: [] };
    const want = [...new Set([...v.fields.map((f) => f.name), ...(v.consent_gate ? [v.consent_gate] : [])])];
    const [anchors, values] = await Promise.all([
      this.db.record.findMany({ where: { id: { in: ids } }, select: { id: true, created_at: true, pipeline_stage: { select: { name: true, label: true, color: true } } } }),
      this.db.recordFieldValue.findMany({ where: { record_id: { in: ids }, field_name: { in: want } } }),
    ]);
    const data = new Map(ids.map((id) => [id, {}]));
    for (const row of values) data.get(row.record_id)[row.field_name] = fromTypedRow(row);
    const labels = await this.#lookupLabels(v.fields, values);
    const anchor = new Map(anchors.map((a) => [a.id, a]));
    return {
      view: v,
      records: ids.map((id) => {
        const d = data.get(id);
        // Introducer realm: the stage is shown only where the client consented (INT-FR-02).
        const showStage = !v.consent_gate || d[v.consent_gate] === true || d[v.consent_gate] === 'true';
        const { [v.consent_gate]: _gate, ...shown } = d;
        return { id, created_at: anchor.get(id)?.created_at, stage: showStage ? anchor.get(id)?.pipeline_stage ?? null : { label: 'Submitted', color: '#94a3b8' }, data: v.consent_gate ? shown : d, labels: labels(d) };
      }),
    };
  }

  /** Titles for lookup values shown in a portal list (e.g. the share class name). */
  async #lookupLabels(fields, values) {
    const lookups = fields.filter((f) => f.field_type === 'lookup');
    if (!lookups.length) return () => ({});
    const ids = [...new Set(values.filter((v) => lookups.some((f) => f.name === v.field_name)).map((v) => Number(v.str_value)).filter(Boolean))];
    const titles = ids.length ? await this.db.recordFieldValue.findMany({ where: { record_id: { in: ids }, field_name: { in: ['name', 'display_name', 'code_name', 'title'] } }, select: { record_id: true, field_name: true, str_value: true } }) : [];
    const byId = new Map();
    for (const t of titles) if (!byId.has(t.record_id) || t.field_name === 'name') byId.set(t.record_id, t.str_value);
    return (d) => Object.fromEntries(lookups.filter((f) => d[f.name] != null).map((f) => [f.name, byId.get(Number(d[f.name])) ?? `#${d[f.name]}`]));
  }

  /** Options for a lookup on a create form (e.g. the share classes on offer). */
  async lookupOptions(session, objectName, fieldName) {
    const v = await this.#view(session.realm_kind, objectName);
    const target = v.create?.lookups?.[fieldName];
    if (!target) throw new NotFoundError('Options');
    const oid = await this.#objectId(target);
    const rows = await this.db.recordFieldValue.findMany({ where: { field_name: 'name', record: { object_id: oid, deleted_at: null } }, select: { record_id: true, str_value: true }, take: 200 });
    return rows.map((r) => ({ value: r.record_id, label: r.str_value })).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  /**
   * Run a row action: create a record in another section from one of the
   * subject's own rows (Redeem on a fund holding → a redemption order). Values
   * named in `prefill` come from the row and `defaults` from the config, never
   * from the request, so a client cannot redeem someone else's holding or turn
   * the action into a different order type.
   */
  async act(session, objectName, recordId, actionKey, body) {
    const v = await this.#view(session.realm_kind, objectName);
    const action = v.row_actions.find((a) => a.key === actionKey);
    if (!action) throw new NotFoundError('Action');
    const own = await this.db.recordFieldValue.findFirst({
      where: { record_id: Number(recordId), field_name: v.link, str_value: String(session.subject_id), record: { object_id: v.object_id, deleted_at: null } },
      select: { record_id: true },
    });
    if (!own) throw new NotFoundError('Record');
    const obj = await this.db.uiObject.findUnique({ where: { id: v.object_id }, select: { config: true } });
    const cfg = obj.config.portal[session.realm_kind].row_actions.find((a) => a.key === actionKey);
    const target = await this.#view(session.realm_kind, action.object);

    const values = {};
    for (const f of action.fields) if (body?.[f.name] !== undefined && body[f.name] !== '') values[f.name] = body[f.name];
    const prefill = Object.entries(cfg.prefill ?? {});
    if (prefill.length) {
      const rows = await this.db.recordFieldValue.findMany({ where: { record_id: own.record_id, field_name: { in: prefill.map(([, src]) => src) } } });
      const src = Object.fromEntries(rows.map((r) => [r.field_name, fromTypedRow(r)]));
      for (const [to, from] of prefill) if (src[from] != null) values[to] = src[from];
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [k, val] of Object.entries(cfg.defaults ?? {})) values[k] = val === '{{today}}' ? today : val;
    values[target.link] = session.subject_id;
    let stageId = null;
    if (cfg.stage) {
      const st = await this.db.uiPipelineStage.findFirst({ where: { name: cfg.stage, pipeline: { object_id: target.object_id } }, select: { id: true } });
      stageId = st?.id ?? null;
    }
    const created = await this.records.createRecord(target.object_id, stageId, PortalService.actor(session), null, null, values);
    return { id: created.id, object: target.object };
  }

  /** Create a record from the portal (a request, a consent, an order, a referral). */
  async create(session, objectName, body) {
    const v = await this.#view(session.realm_kind, objectName);
    if (!v.create) throw new AuthorizationError('This section is read-only');
    const obj = await this.db.uiObject.findUnique({ where: { id: v.object_id }, select: { config: true } });
    const cfg = obj.config.portal[session.realm_kind].create;
    const values = {};
    for (const f of v.create.fields) if (body?.[f.name] !== undefined && body[f.name] !== '') values[f.name] = body[f.name];
    // Lookups must point at something the portal offered (no id guessing).
    for (const [field, target] of Object.entries(v.create.lookups ?? {})) {
      if (values[field] == null) continue;
      const allowed = (await this.lookupOptions(session, objectName, field)).some((o) => Number(o.value) === Number(values[field]));
      if (!allowed) throw new ValidationError(`Choose a valid ${field}`);
      void target;
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const [k, val] of Object.entries(cfg.defaults ?? {})) values[k] = val === '{{today}}' ? today : val;
    values[v.link] = session.subject_id;
    let stageId = null;
    if (cfg.stage) {
      const st = await this.db.uiPipelineStage.findFirst({ where: { name: cfg.stage, pipeline: { object_id: v.object_id } }, select: { id: true } });
      stageId = st?.id ?? null;
    }
    const created = await this.records.createRecord(v.object_id, stageId, PortalService.actor(session), null, null, values);
    return { id: created.id };
  }

  /** Documents on the subject's own records, in categories marked portal-visible. */
  async documents(session) {
    const ids = await this.#ownRecordIds(session);
    if (!ids.length) return [];
    const cats = await this.db.uiDocumentCategory.findMany({ where: { is_active: true }, select: { code: true, label: true, config: true } });
    const visible = new Set(cats.filter((c) => c.config?.portal_visible).map((c) => c.code));
    const docs = await this.db.document.findMany({
      where: { entity_id: { in: ids }, deleted_at: null },
      select: { id: true, original_filename: true, category: true, created_at: true, entity_id: true, mime_type: true, uploaded_by: true },
      orderBy: { created_at: 'desc' }, take: 200,
    });
    const label = Object.fromEntries(cats.map((c) => [c.code, c.label]));
    return docs
      .filter((d) => visible.has(d.category) || String(d.uploaded_by ?? '').startsWith('portal:'))
      .map((d) => ({ id: d.id, filename: d.original_filename, category: d.category, category_label: label[d.category] ?? d.category, created_at: d.created_at, record_id: Number(d.entity_id) }));
  }

  /** Record ids the subject owns, across every exposed object (plus the subject itself). */
  async #ownRecordIds(session) {
    const views = await this.views(session.realm_kind);
    const ids = new Set([Number(session.subject_id)]);
    // Independent lookups — one round trip per view, in parallel.
    const perView = await Promise.all(views.map((v) => this.db.recordFieldValue.findMany({
      where: { field_name: v.link, str_value: String(session.subject_id), record: { object_id: v.object_id, deleted_at: null } }, select: { record_id: true }, take: 500,
    })));
    for (const rows of perView) rows.forEach((r) => ids.add(r.record_id));
    return [...ids];
  }

  async openDocument(session, documentId) {
    const doc = await this.db.document.findFirst({ where: { id: Number(documentId), deleted_at: null } });
    if (!doc) throw new NotFoundError('Document');
    const visible = (await this.documents(session)).some((d) => d.id === doc.id);
    if (!visible) throw new NotFoundError('Document');
    return this.docs.openStream(doc);
  }

  /** Upload a document to one of the subject's records (checklist evidence, new ID). */
  async upload(session, recordId, { filename, mime_type, data, category }) {
    const views = await this.views(session.realm_kind);
    const rec = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { id: true, object_id: true, deleted_at: true, object: { select: { name: true } } } });
    const v = rec && !rec.deleted_at && views.find((x) => x.object_id === rec.object_id && x.uploads);
    const own = v && Number(recordId) !== Number(session.subject_id)
      ? await this.db.recordFieldValue.findFirst({ where: { record_id: rec.id, field_name: v.link, str_value: String(session.subject_id) } })
      : null;
    if (!v || !own) throw new NotFoundError('Record');
    if (!filename || !data) throw new ValidationError('filename and data are required');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(mime_type)) throw new ValidationError('Upload a PDF, JPEG or PNG');
    const buffer = Buffer.from(String(data), 'base64');
    if (buffer.length > 10 * 1024 * 1024) throw new ValidationError('Files must be under 10 MB');
    // The declared type must match the content, so a renamed executable or HTML page is refused.
    if (!MAGIC[mime_type](buffer)) throw new ValidationError('The file content does not match its type — upload a PDF, JPEG or PNG');
    const doc = await this.docs.upload({
      tenantId: session.tenant_id, buffer, filename: String(filename).slice(0, 200), mimeType: mime_type,
      entityType: rec.object.name, entityId: rec.id, category: category || null, uploadedBy: PortalService.actor(session),
      description: 'Uploaded by the client on the portal',
    });
    return { id: doc.id, duplicate: Boolean(doc.duplicate) };
  }

  /** A secure message to the client's relationship manager (PRT-FR-04). */
  async message(session, text) {
    const msg = String(text ?? '').trim();
    if (msg.length < 2) throw new ValidationError('Write a message');
    const subject = await this.db.record.findUnique({ where: { id: Number(session.subject_id) }, select: { id: true, assigned_to: true } });
    if (!subject) throw new NotFoundError('Record');
    if (!subject.assigned_to) throw new ValidationError('No relationship manager is assigned yet — please call us');
    await this.db.activity.create({ data: { record_id: subject.id, employee_id: subject.assigned_to, type: 'note', subject: 'Portal message from the client', description: msg.slice(0, 5000) } });
    await this.notify?.createNotification(subject.assigned_to, { type: 'info', title: 'New portal message', body: msg.slice(0, 200), link: null }).catch(() => {});
    return { sent: true };
  }

  async messages(session) {
    return this.db.activity.findMany({
      where: { record_id: Number(session.subject_id), type: 'note' },
      select: { id: true, subject: true, description: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 50,
    });
  }

  /** Who is signed in. */
  async me(session) {
    const rows = await this.db.recordFieldValue.findMany({ where: { record_id: Number(session.subject_id) } });
    const d = Object.fromEntries(rows.map((r) => [r.field_name, fromTypedRow(r)]));
    const pick = ['display_name', 'name', 'email', 'portal_email', 'segment', 'kyc_status', 'preferred_language', 'total_relationship_value', 'introducer_no', 'commission_earned', 'referrals', 'profile_valid_until'];
    return { kind: session.realm_kind, id: Number(session.subject_id), ...Object.fromEntries(pick.filter((k) => d[k] != null).map((k) => [k, d[k]])) };
  }
}

module.exports = PortalService;
module.exports.signToken = signToken;
module.exports.verifyToken = verifyToken;
