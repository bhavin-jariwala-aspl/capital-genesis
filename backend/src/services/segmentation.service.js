'use strict';

const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const AuditChainService = require('./audit-chain.service');

/**
 * Administration of business units and information barriers.
 *
 * The enforcement lives in AccessScopeService; this is the write side: unit
 * and zone masters, who belongs to which, and the wall-crossing workflow that
 * brings a public-side person over a barrier for a limited time.
 *
 * Every membership change is appended to the tamper-evident audit chain —
 * "who could see the deal, since when, approved by whom" is exactly what a
 * regulator asks for, and it must not be editable after the fact.
 */

const CODE_RE = /^[A-Z0-9_-]{2,40}$/;

class SegmentationService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {import('./access-scope.service')|null} accessScope cache to invalidate on change
   */
  constructor(prisma, accessScope = null, auditChain = null) {
    this.db = prisma;
    this.scope = accessScope;
    this.audit = auditChain ?? new AuditChainService(prisma);
  }

  #invalidate(employeeId = null) {
    this.scope?.invalidate(employeeId);
  }

  // ── Business units ──────────────────────────────────────────────────────

  async listUnits() {
    return this.db.businessUnit.findMany({
      orderBy: { code: 'asc' },
      include: { members: { select: { employee_id: true, is_primary: true } } },
    });
  }

  async saveUnit(data, actor, id = null) {
    const code = String(data.code ?? '').trim().toUpperCase();
    if (!id && !CODE_RE.test(code)) throw new ValidationError('Code must be 2–40 characters: A–Z, 0–9, _ or -');
    if (!String(data.name ?? '').trim() && !id) throw new ValidationError('Name is required');
    const fields = {
      ...(id ? {} : { code }),
      ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
      ...(data.legal_name !== undefined ? { legal_name: data.legal_name || null } : {}),
      ...(data.regulator !== undefined ? { regulator: data.regulator || null } : {}),
      ...(data.licence !== undefined ? { licence: data.licence || null } : {}),
      ...(data.base_currency !== undefined ? { base_currency: data.base_currency ? String(data.base_currency).toUpperCase().slice(0, 3) : null } : {}),
      ...(data.is_active !== undefined ? { is_active: Boolean(data.is_active) } : {}),
      ...(data.config !== undefined ? { config: data.config } : {}),
    };
    const unit = id
      ? await this.db.businessUnit.update({ where: { id: Number(id) }, data: fields })
      : await this.db.businessUnit.create({ data: fields });
    await this.audit.append({ entityType: 'business_unit', entityId: unit.id, action: id ? 'update' : 'create', actor, payload: fields });
    return unit;
  }

  /** Replace a unit's membership with `employeeIds` (first one flagged primary if none given). */
  async setUnitMembers(unitId, employeeIds, actor, primaryIds = []) {
    const unit = await this.db.businessUnit.findUnique({ where: { id: Number(unitId) }, select: { id: true } });
    if (!unit) throw new NotFoundError('Business unit');
    const ids = [...new Set((employeeIds ?? []).map(String))];
    await this.db.$transaction([
      this.db.employeeBusinessUnit.deleteMany({ where: { business_unit_id: unit.id, employee_id: { notIn: ids } } }),
      ...ids.map((eid) => this.db.employeeBusinessUnit.upsert({
        where:  { employee_id_business_unit_id: { employee_id: eid, business_unit_id: unit.id } },
        create: { employee_id: eid, business_unit_id: unit.id, is_primary: primaryIds.includes(eid) },
        update: { is_primary: primaryIds.includes(eid) },
      })),
    ]);
    this.#invalidate();
    await this.audit.append({ entityType: 'business_unit', entityId: unit.id, action: 'members.set', actor, sensitivity: 'sensitive', payload: { employee_ids: ids } });
    return this.db.employeeBusinessUnit.findMany({ where: { business_unit_id: unit.id } });
  }

  // ── Barrier zones ───────────────────────────────────────────────────────

  async listZones() {
    return this.db.barrierZone.findMany({
      orderBy: { code: 'asc' },
      include: { members: { select: { employee_id: true, source: true, valid_to: true } } },
    });
  }

  async saveZone(data, actor, id = null) {
    const code = String(data.code ?? '').trim().toUpperCase();
    if (!id && !CODE_RE.test(code)) throw new ValidationError('Code must be 2–40 characters: A–Z, 0–9, _ or -');
    const fields = {
      ...(id ? {} : { code }),
      ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.is_active !== undefined ? { is_active: Boolean(data.is_active) } : {}),
    };
    if (!id && !fields.name) throw new ValidationError('Name is required');
    const zone = id
      ? await this.db.barrierZone.update({ where: { id: Number(id) }, data: fields })
      : await this.db.barrierZone.create({ data: fields });
    await this.audit.append({ entityType: 'barrier_zone', entityId: zone.id, action: id ? 'update' : 'create', actor, payload: fields });
    return zone;
  }

  async addZoneMember(zoneId, employeeId, actor) {
    const zone = await this.db.barrierZone.findUnique({ where: { id: Number(zoneId) }, select: { id: true } });
    if (!zone) throw new NotFoundError('Barrier zone');
    const member = await this.db.barrierMember.upsert({
      where:  { zone_id_employee_id: { zone_id: zone.id, employee_id: String(employeeId) } },
      create: { zone_id: zone.id, employee_id: String(employeeId), source: 'member', granted_by: actor ?? null },
      update: { source: 'member', valid_to: null, granted_by: actor ?? null },
    });
    this.#invalidate(employeeId);
    await this.audit.append({ entityType: 'barrier_zone', entityId: zone.id, action: 'member.add', actor, sensitivity: 'sensitive', payload: { employee_id: String(employeeId) } });
    return member;
  }

  async removeZoneMember(zoneId, employeeId, actor) {
    await this.db.barrierMember.deleteMany({ where: { zone_id: Number(zoneId), employee_id: String(employeeId) } });
    this.#invalidate(employeeId);
    await this.audit.append({ entityType: 'barrier_zone', entityId: Number(zoneId), action: 'member.remove', actor, sensitivity: 'sensitive', payload: { employee_id: String(employeeId) } });
  }

  /** Everyone currently inside a zone — the insider list for its records. */
  async insiders(zoneId) {
    const now = new Date();
    return this.db.barrierMember.findMany({
      where:   { zone_id: Number(zoneId), OR: [{ valid_to: null }, { valid_to: { gt: now } }] },
      include: { employee: { select: { employee_id: true, employee_name: true, role: true, email: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  // ── Wall-crossings ──────────────────────────────────────────────────────

  async requestCrossing({ zoneId, employeeId, reason }, requestedBy) {
    if (!String(reason ?? '').trim()) throw new ValidationError('A reason is required to cross a wall');
    const zone = await this.db.barrierZone.findUnique({ where: { id: Number(zoneId) }, select: { id: true, is_active: true } });
    if (!zone?.is_active) throw new NotFoundError('Barrier zone');
    const crossing = await this.db.wallCrossing.create({
      data: { zone_id: zone.id, employee_id: String(employeeId ?? requestedBy), reason: String(reason).trim(), requested_by: requestedBy ?? null },
    });
    await this.audit.append({ entityType: 'wall_crossing', entityId: crossing.id, action: 'request', actor: requestedBy, sensitivity: 'sensitive', payload: { zone_id: zone.id, employee_id: crossing.employee_id, reason: crossing.reason } });
    return crossing;
  }

  async listCrossings({ status } = {}) {
    return this.db.wallCrossing.findMany({
      where:   status ? { status } : {},
      include: { zone: { select: { code: true, name: true } }, employee: { select: { employee_name: true } } },
      orderBy: { created_at: 'desc' },
      take:    200,
    });
  }

  /**
   * Approve or reject a pending crossing. Approval grants time-bound zone
   * membership (default 30 days). The approver may not approve their own
   * request — four eyes on every crossing.
   */
  async decideCrossing(id, { approve, validDays = 30 }, decidedBy) {
    const crossing = await this.db.wallCrossing.findUnique({ where: { id: Number(id) } });
    if (!crossing) throw new NotFoundError('Wall-crossing');
    if (crossing.status !== 'pending') throw new ValidationError(`Already ${crossing.status}`);
    if (crossing.requested_by && crossing.requested_by === decidedBy) {
      throw new AuthorizationError('A wall-crossing cannot be approved by the person who requested it');
    }
    const days = Math.min(Math.max(Number(validDays) || 30, 1), 365);
    const validTo = approve ? new Date(Date.now() + days * 86_400_000) : null;
    const updated = await this.db.wallCrossing.update({
      where: { id: crossing.id },
      data:  { status: approve ? 'approved' : 'rejected', decided_by: decidedBy ?? null, decided_at: new Date(), valid_to: validTo },
    });
    if (approve) {
      const key = { zone_id_employee_id: { zone_id: crossing.zone_id, employee_id: crossing.employee_id } };
      const existing = await this.db.barrierMember.findUnique({ where: key });
      // A standing member stays standing — never put an expiry on it.
      if (!existing || existing.source === 'wall_crossing') {
        await this.db.barrierMember.upsert({
          where:  key,
          create: { zone_id: crossing.zone_id, employee_id: crossing.employee_id, source: 'wall_crossing', valid_to: validTo, granted_by: decidedBy ?? null },
          update: { valid_to: validTo, granted_by: decidedBy ?? null },
        });
      }
      this.#invalidate(crossing.employee_id);
    }
    await this.audit.append({
      entityType: 'wall_crossing', entityId: crossing.id, action: approve ? 'approve' : 'reject', actor: decidedBy, sensitivity: 'sensitive',
      payload: { zone_id: crossing.zone_id, employee_id: crossing.employee_id, valid_to: validTo },
    });
    return updated;
  }
}

module.exports = SegmentationService;
