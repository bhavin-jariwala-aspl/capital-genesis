'use strict';

const CrmService  = require('./crm.service');
const RecordService = require('./record.service');

/**
 * ImportService — CSV import pipeline with field mapping, validation, and deduplication.
 *
 * Flow:
 *   1. createJob(...)         — create an ImportJob record (status: pending)
 *   2. previewImport(...)     — parse CSV, map fields, validate, detect dups → status: previewing
 *   3. executeImport(...)     — write records using strategy (skip|create|merge) → status: done/failed
 *
 * CRM object types (lead|contact|account|opportunity|case) write to the crm_* relational
 * tables via CrmService.  Non-CRM / custom objects create a thin Record anchor row only.
 */

const STATUS = { PENDING: 'pending', PREVIEWING: 'previewing', IMPORTING: 'importing', DONE: 'done', FAILED: 'failed' };
const STRATEGY = { SKIP: 'skip', CREATE: 'create', MERGE: 'merge' };

class ImportService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {object} [deps] what an imported record needs to behave like one
   *   entered by hand: the event bus (on-create workflows, SLA clocks,
   *   integrations), permissions, assignment rules and lead scoring.
   */
  constructor(prisma, { eventBus = null, permService = null, assignService = null, scoringService = null } = {}) {
    this.db     = prisma;
    this.crmSvc = new CrmService(prisma, eventBus);
    // Each run gets its own RecordService: an import defers parent roll-up
    // refreshes to the end of the run, which is per-instance state.
    this._newRecordSvc = () => new RecordService(prisma, eventBus, permService, assignService, scoringService);
  }

  // ── Job lifecycle ─────────────────────────────────────────────────────────

  async createJob({ object_id, filename, created_by }) {
    return this.db.importJob.create({
      data: {
        object_id:  Number(object_id),
        filename,
        status:     STATUS.PENDING,
        created_by: created_by ?? null,
      },
    });
  }

  async getJob(id) {
    return this.db.importJob.findUnique({ where: { id } });
  }

  async listJobs(objectId) {
    return this.db.importJob.findMany({
      where:   objectId ? { object_id: Number(objectId) } : {},
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Parse a CSV buffer, apply field mapping, validate, deduplicate, and save stats.
   *
   * @param {number}   jobId
   * @param {Buffer}   csvBuffer    raw CSV bytes
   * @param {object}   fieldMapping { csvColumnName: targetFieldName }
   * @param {string[]} dedupeKeys   fields to use for duplicate detection
   * @param {string}   strategy     'skip' | 'create' | 'merge'
   * @returns {object} preview stats + sample rows
   */
  async previewImport(jobId, csvBuffer, fieldMapping, dedupeKeys, strategy = STRATEGY.SKIP) {
    const job = await this.#requireJob(jobId, [STATUS.PENDING, STATUS.PREVIEWING]);
    this.#validateStrategy(strategy);

    const { headers, rows } = this.parseCsv(csvBuffer);
    const mapped             = this.mapFields(rows, fieldMapping);
    const { valid, errors }  = this.validate(mapped, job.object_id);
    const { unique, dupes }  = await this.detectDuplicates(mapped, dedupeKeys, job.object_id);

    const stats = {
      total_rows:    rows.length,
      valid_rows:    valid.length,
      error_rows:    errors.length,
      duplicate_rows: dupes.length,
      unique_rows:   unique.length,
    };

    await this.db.importJob.update({
      where: { id: jobId },
      data: {
        status:        STATUS.PREVIEWING,
        field_mapping: fieldMapping,
        dedupe_keys:   dedupeKeys,
        strategy,
        stats,
        error_rows:    errors.slice(0, 100), // store first 100 error rows
      },
    });

    return {
      headers,
      stats,
      sample_rows:   valid.slice(0, 10),
      error_sample:  errors.slice(0, 10),
      duplicate_sample: dupes.slice(0, 10),
    };
  }

  /**
   * Execute the import using the strategy recorded on the job.
   *
   * @param {number}   jobId
   * @param {Buffer}   csvBuffer  raw CSV (re-upload required; not stored server-side)
   * @returns {object} execution stats
   */
  async executeImport(jobId, csvBuffer, viewer = null) {
    const job = await this.#requireJob(jobId, [STATUS.PREVIEWING]);
    const { field_mapping, dedupe_keys, strategy, object_id } = job;

    await this.db.importJob.update({ where: { id: jobId }, data: { status: STATUS.IMPORTING } });

    try {
      const { rows }              = this.parseCsv(csvBuffer);
      const mapped                = this.mapFields(rows, field_mapping);
      const { valid }             = this.validate(mapped, object_id);
      const { unique, dupes }     = await this.detectDuplicates(valid, dedupe_keys ?? [], object_id);

      let created = 0, merged = 0, skipped = 0;
      const failed = [];
      const crmType = await this.#resolveCrmType(object_id);
      const ops = [];

      if (crmType) {
        // Write CRM entity to the relational table via CrmService
        for (const row of unique) ops.push(this.#createCrmEntity(crmType, row, job.created_by).then(() => { created++; }));
      } else if (unique.length) {
        // Builder objects go through the record engine, one row at a time (auto-
        // numbers are allocated in sequence), so an imported row gets what a row
        // entered by hand gets: validation, defaults, formulas, auto-numbers, the
        // first pipeline stage, encryption, assignment, audit and workflows. The
        // parents' roll-ups are recomputed once, after the last row.
        const recs = this._newRecordSvc();
        recs.deferParentRefresh();
        try {
          for (const [i, row] of unique.entries()) {
            try {
              await this.#createCustomRecord(recs, object_id, row, job.created_by, viewer);
              created++;
            } catch (err) {
              failed.push({ row: i + 1, reason: err.message });
            }
          }
        } finally {
          for (const pid of recs.takeDeferredParents()) await recs.recompute(pid).catch(() => {});
        }
      }

      if (strategy === STRATEGY.MERGE && crmType) {
        // Merge via CrmService updates on the matched relational entity
        for (const { row, match_id } of dupes) {
          ops.push(
            this.#updateCrmEntity(crmType, match_id, row).then(() => { merged++; }),
          );
        }
      } else {
        skipped = dupes.length;
      }

      await Promise.all(ops);

      const stats = { created, merged, skipped, failed: failed.length, total: valid.length + (strategy !== STRATEGY.MERGE ? dupes.length : 0) };
      await this.db.importJob.update({
        where: { id: jobId },
        data:  { status: STATUS.DONE, stats, ...(failed.length ? { error_rows: failed.slice(0, 100) } : {}) },
      });

      return stats;
    } catch (err) {
      await this.db.importJob.update({
        where: { id: jobId },
        data:  { status: STATUS.FAILED, stats: { error: err.message } },
      });
      throw err;
    }
  }

  // ── Utilities (exported for testing) ─────────────────────────────────────

  /**
   * Pure synchronous CSV parser using only Node.js builtins.
   * Handles quoted fields, embedded commas, embedded newlines (basic).
   */
  parseCsv(buffer) {
    const text  = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return { headers: [], rows: [] };

    const headers = this.#splitCsvLine(lines[0]);
    const rows    = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.#splitCsvLine(lines[i]);
      if (values.length === 0) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
      rows.push(row);
    }
    return { headers, rows };
  }

  /** Apply { csvColumn: fieldName } mapping to rows; keys become fieldName keys */
  mapFields(rows, mapping) {
    return rows.map(row => {
      const out = {};
      for (const [csvCol, fieldName] of Object.entries(mapping)) {
        if (fieldName) out[fieldName] = row[csvCol] ?? '';
      }
      return out;
    });
  }

  /**
   * Basic validation: strip out rows that are entirely empty.
   * Returns { valid, errors } where errors = [{ row, reason }].
   */
  validate(rows, _objectId) {
    const valid  = [];
    const errors = [];
    for (const row of rows) {
      const isEmpty = Object.values(row).every(v => String(v ?? '').trim() === '');
      if (isEmpty) {
        errors.push({ row, reason: 'Empty row' });
      } else {
        valid.push(row);
      }
    }
    return { valid, errors };
  }

  /**
   * Detect duplicates.
   *
   * For CRM object types delegates to CrmService.detectDuplicatesRelational()
   * which uses indexed columns (email, company, etc.)
   * For non-CRM / custom objects no deduplication is performed (no data column
   * to match against).
   *
   * Returns { unique, dupes: [{ row, match_id, match_record_id }] }
   */
  async detectDuplicates(rows, dedupeKeys, objectId) {
    if (!dedupeKeys?.length) return { unique: rows, dupes: [] };

    const crmType = await this.#resolveCrmType(objectId);
    if (crmType) {
      const relResult = await this.crmSvc.detectDuplicatesRelational(crmType, rows, dedupeKeys);
      return {
        unique: relResult.unique,
        dupes:  relResult.dupes.map(d => ({
          row:             d.row,
          match_id:        d.match_id,
          match_record_id: d.match_record_id ?? null,
        })),
      };
    }

    // Non-CRM custom objects: no data column to scan, treat all rows as unique
    return { unique: rows, dupes: [] };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Map a UiObject.id to its CRM type name, or null if not a CRM entity. */
  async #resolveCrmType(objectId) {
    try {
      const obj = await this.db.uiObject.findUnique({
        where:  { id: Number(objectId) },
        select: { name: true },
      });
      const CRM_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'case']);
      return obj && CRM_TYPES.has(obj.name) ? obj.name : null;
    } catch {
      return null;
    }
  }

  async #requireJob(jobId, allowedStatuses) {
    const job = await this.db.importJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`ImportJob ${jobId} not found`);
    if (!allowedStatuses.includes(job.status)) {
      throw new Error(`ImportJob ${jobId} has status "${job.status}"; expected one of: ${allowedStatuses.join(', ')}`);
    }
    return job;
  }

  #validateStrategy(strategy) {
    if (!Object.values(STRATEGY).includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}. Must be skip|create|merge`);
    }
  }

  /** Minimal RFC 4180-ish CSV line splitter */
  #splitCsvLine(line) {
    const fields = [];
    let   cur    = '';
    let   inQ    = false;

    for (let i = 0; i < line.length; i++) {
      const ch   = line[i];
      const next = line[i + 1];

      if (inQ) {
        if (ch === '"' && next === '"') { cur += '"'; i++; } // escaped quote
        else if (ch === '"')            { inQ = false; }
        else                            { cur += ch; }
      } else {
        if (ch === '"')       { inQ = true; }
        else if (ch === ',')  { fields.push(cur.trim()); cur = ''; }
        else                  { cur += ch; }
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  async #createCrmEntity(crmType, row, createdBy) {
    switch (crmType) {
      case 'lead':        return this.crmSvc.createLead(row, null, createdBy);
      case 'contact':     return this.crmSvc.createContact(row, null, createdBy);
      case 'account':     return this.crmSvc.createAccount(row, null, createdBy);
      case 'opportunity': return this.crmSvc.createOpportunity(row, null, createdBy);
      case 'case':        return this.crmSvc.createCase(row, null, createdBy);
      default: throw new Error(`Unknown CRM type: ${crmType}`);
    }
  }

  async #updateCrmEntity(crmType, crmId, row) {
    switch (crmType) {
      case 'lead':        return this.crmSvc.updateLead(crmId, row);
      case 'contact':     return this.crmSvc.updateContact(crmId, row);
      case 'account':     return this.crmSvc.updateAccount(crmId, row);
      case 'opportunity': return this.crmSvc.updateOpportunity(crmId, row);
      case 'case':        return this.crmSvc.updateCase(crmId, row);
      default: throw new Error(`Unknown CRM type: ${crmType}`);
    }
  }

  /**
   * Create one record of a Builder object through RecordService.
   *
   * @param {RecordService} recs — the run's record service
   * @param {number} objectId
   * @param {object} row       — field-name → value map from field mapping step
   * @param {string} createdBy
   * @param {object|null} viewer — the importing user (permissions, tenant)
   */
  async #createCustomRecord(recs, objectId, row, createdBy, viewer = null) {
    const data = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== ''));
    return recs.createRecord(Number(objectId), null, createdBy ?? null, null, viewer, data);
  }
}

module.exports = ImportService;
