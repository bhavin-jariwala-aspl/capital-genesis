'use strict';

const { ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');

const VISIBILITIES = [
  { key: 'private',  label: 'Only me',            description: 'Nobody else can see this report.' },
  { key: 'team',     label: 'My team',            description: 'Me, my manager chain, and everyone who reports to me.' },
  { key: 'shared',   label: 'Specific roles',     description: 'Only the roles I choose below.' },
  { key: 'everyone', label: 'Everyone in my org', description: 'Any signed-in user can view it.' },
];

const CATEGORIES = [
  { key: 'sales',        label: 'Sales' },
  { key: 'insurance',    label: 'Insurance' },
  { key: 'finance',      label: 'Finance' },
  { key: 'support',      label: 'Support' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'custom',       label: 'Other' },
];

const FOLDER_COLORS = ['indigo', 'sky', 'emerald', 'amber', 'rose', 'violet', 'slate'];

/** The only data scopes a report may run under. */
const SCOPES = ['me', 'team', 'all'];

/**
 * ReportLibraryService — who can see which report, and how the report list is
 * organised (folders, favourites, categories).
 *
 * Sharing is expressed in the words a business user thinks in — "Only me",
 * "My team", "Specific roles", "Everyone" — rather than as an ACL. `shared_with`
 * holds role names and/or employee IDs and is only consulted for the
 * "Specific roles" visibility.
 *
 * Legacy rows created before `visibility` existed fall back to the old
 * `is_shared` boolean, so nothing disappears from anyone's list on upgrade.
 */
class ReportLibraryService {
  constructor(prisma) {
    this.db = prisma;
  }

  static get VISIBILITIES() { return VISIBILITIES; }
  static get CATEGORIES() { return CATEGORIES; }

  getOptions() {
    return { visibilities: VISIBILITIES, categories: CATEGORIES, folder_colors: FOLDER_COLORS };
  }

  // ── Folders ──────────────────────────────────────────────────────────────

  async listFolders() {
    const [folders, counts] = await Promise.all([
      this.db.reportFolder.findMany({ orderBy: [{ order_index: 'asc' }, { name: 'asc' }] }),
      this.db.customReport.groupBy({ by: ['folder_id'], _count: { _all: true } }),
    ]);
    const countBy = new Map(counts.map((c) => [c.folder_id, c._count._all]));
    return folders.map((f) => ({ ...f, report_count: countBy.get(f.id) ?? 0 }));
  }

  async createFolder(body, employeeId) {
    const name = String(body?.name || '').trim();
    if (!name) throw new ValidationError('Folder name is required');
    return this.db.reportFolder.create({
      data: {
        name: name.slice(0, 150),
        description: body.description ? String(body.description) : null,
        color: FOLDER_COLORS.includes(body.color) ? body.color : 'indigo',
        parent_id: body.parent_id ? Number(body.parent_id) : null,
        order_index: Number(body.order_index) || 0,
        created_by: employeeId ? String(employeeId) : null,
      },
    });
  }

  /** A folder may be renamed, moved or deleted by whoever made it, or an admin. */
  assertCanEditFolder(folder, viewer) {
    const level = viewer?.role_level ?? 99;
    if (level <= ADMIN_THRESHOLD) return;
    if (folder.created_by && String(folder.created_by) === String(viewer?.employeeId)) return;
    throw new AuthorizationError('Only the person who created this folder — or an administrator — can change it.');
  }

  async updateFolder(id, body, viewer) {
    const folder = await this.db.reportFolder.findUnique({ where: { id: Number(id) } });
    if (!folder) throw new NotFoundError('Folder');
    if (viewer) this.assertCanEditFolder(folder, viewer);

    const parentId = body.parent_id === null || body.parent_id === '' ? null : Number(body.parent_id);
    if (parentId !== undefined && parentId !== null) {
      if (parentId === folder.id) throw new ValidationError('A folder cannot be its own parent');
      if (await this.#isDescendant(parentId, folder.id)) {
        throw new ValidationError('That would put the folder inside one of its own sub-folders');
      }
    }

    return this.db.reportFolder.update({
      where: { id: folder.id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim().slice(0, 150) }),
        ...(body.description !== undefined && { description: body.description ? String(body.description) : null }),
        ...(body.color !== undefined && { color: FOLDER_COLORS.includes(body.color) ? body.color : folder.color }),
        ...(body.parent_id !== undefined && { parent_id: parentId }),
        ...(body.order_index !== undefined && { order_index: Number(body.order_index) || 0 }),
      },
    });
  }

  /** Deleting a folder never deletes reports — they fall back to "Uncategorised". */
  async deleteFolder(id, viewer) {
    const folder = await this.db.reportFolder.findUnique({ where: { id: Number(id) } });
    if (!folder) throw new NotFoundError('Folder');
    if (viewer) this.assertCanEditFolder(folder, viewer);
    await this.db.customReport.updateMany({ where: { folder_id: folder.id }, data: { folder_id: null } });
    await this.db.reportFolder.updateMany({ where: { parent_id: folder.id }, data: { parent_id: folder.parent_id } });
    await this.db.reportFolder.delete({ where: { id: folder.id } });
  }

  async #isDescendant(candidateId, ancestorId) {
    let cursor = candidateId;
    for (let depth = 0; depth < 20 && cursor; depth += 1) {
      if (cursor === ancestorId) return true;
      const row = await this.db.reportFolder.findUnique({
        where: { id: cursor }, select: { parent_id: true },
      });
      cursor = row?.parent_id ?? null;
    }
    return false;
  }

  // ── Visibility ───────────────────────────────────────────────────────────

  /**
   * The set of reports a viewer may open. Filtering happens in application code
   * because "my team" needs the hierarchy closure, which is not expressible as a
   * single Prisma where clause.
   */
  async visibleReports(viewer, { folderId, search, favoritesOnly, mineOnly } = {}) {
    const [reports, favorites] = await Promise.all([
      this.db.customReport.findMany({
        orderBy: { updated_at: 'desc' },
        include: { folder: { select: { id: true, name: true, color: true } } },
      }),
      this.db.reportFavorite.findMany({
        where: { employee_id: String(viewer.employeeId) },
        select: { report_id: true },
      }),
    ]);

    const favoriteIds = new Set(favorites.map((f) => f.report_id));
    const teamIds = await this.#teamIds(viewer);
    const term = search ? String(search).toLowerCase() : null;

    return reports
      .filter((r) => this.canView(r, viewer, teamIds))
      .filter((r) => (folderId === undefined ? true : (folderId === null ? r.folder_id === null : r.folder_id === Number(folderId))))
      .filter((r) => (favoritesOnly ? favoriteIds.has(r.id) : true))
      .filter((r) => (mineOnly ? r.created_by === viewer.employeeId : true))
      .filter((r) => (term
        ? `${r.name} ${r.description || ''} ${r.category || ''}`.toLowerCase().includes(term)
        : true))
      .map((r) => ({ ...r, is_favorite: favoriteIds.has(r.id) }));
  }

  /**
   * Can this viewer open this report? Admins always can (they support the users
   * who build them); otherwise the report's own visibility decides.
   */
  canView(report, viewer, teamIds = null) {
    const level = viewer.role_level ?? 99;
    if (level <= ADMIN_THRESHOLD) return true;
    if (report.created_by === viewer.employeeId) return true;

    const visibility = report.visibility || (report.is_shared ? 'everyone' : 'private');
    switch (visibility) {
      case 'everyone':
        return true;
      case 'team':
        return !!teamIds && teamIds.includes(report.created_by);
      case 'shared': {
        const list = (Array.isArray(report.shared_with) ? report.shared_with : []).map(String);
        return list.includes(String(viewer.employeeId)) || list.includes(String(viewer.role));
      }
      default:
        return false;
    }
  }

  /** Only the author and admins can change or delete a report. */
  assertCanEdit(report, viewer) {
    const level = viewer.role_level ?? 99;
    if (report.created_by === viewer.employeeId || level <= ADMIN_THRESHOLD) return;
    throw new AuthorizationError('Only the person who created this report — or an administrator — can change it.');
  }

  async assertCanView(report, viewer) {
    if (this.canView(report, viewer, await this.#teamIds(viewer))) return;
    throw new AuthorizationError('This report has not been shared with you.');
  }

  /**
   * Everyone in the viewer's reporting line: their subtree plus their managers.
   * Used for "My team" visibility, so a manager sees what their reports build and
   * a team member sees what their manager published to the team.
   */
  async #teamIds(viewer) {
    if (!viewer?.employeeId) return [];
    const rows = await this.db.employeeHierarchy.findMany({
      where: {
        OR: [
          { ancestor_id: viewer.employeeId, depth: { gte: 0 } },
          { descendant_id: viewer.employeeId, depth: { gte: 0 } },
        ],
      },
      select: { ancestor_id: true, descendant_id: true },
    });
    const ids = new Set([viewer.employeeId]);
    for (const r of rows) { ids.add(r.ancestor_id); ids.add(r.descendant_id); }
    return [...ids];
  }

  /**
   * Clamp the requested data scope to what the viewer's role allows, so a
   * shared report never leaks rows the viewer could not see on the record page.
   */
  async resolveScope(viewer, requested) {
    const level = viewer?.role_level ?? 99;
    // Anything that is not one of the three known scopes is treated as "no scope
    // requested" — an unrecognised value must never travel down to the engine,
    // where it would match neither branch and so apply no restriction at all.
    const asked = SCOPES.includes(requested) ? requested : null;
    let scope = asked || (level <= ADMIN_THRESHOLD ? 'all' : level <= MANAGER_THRESHOLD ? 'team' : 'me');
    if (scope === 'all' && level > ADMIN_THRESHOLD) scope = 'team';
    if (scope === 'team' && level > MANAGER_THRESHOLD) scope = 'me';

    let teamIds;
    if (scope === 'team') {
      const rows = await this.db.employeeHierarchy.findMany({
        where: { ancestor_id: viewer.employeeId, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      teamIds = rows.map((r) => r.descendant_id);
    }
    return { scope, employeeId: viewer.employeeId, teamIds };
  }

  // ── Favourites ───────────────────────────────────────────────────────────

  async setFavorite(reportId, employeeId, on) {
    const id = Number(reportId);
    if (on) {
      await this.db.reportFavorite.upsert({
        where: { report_id_employee_id: { report_id: id, employee_id: String(employeeId) } },
        create: { report_id: id, employee_id: String(employeeId) },
        update: {},
      });
    } else {
      await this.db.reportFavorite.deleteMany({ where: { report_id: id, employee_id: String(employeeId) } });
    }
    return { report_id: id, is_favorite: !!on };
  }

  /** Normalise the visibility half of a report payload. */
  serializeSharing(body) {
    const visibility = VISIBILITIES.some((v) => v.key === body.visibility) ? body.visibility : 'private';
    const sharedWith = visibility === 'shared'
      ? (Array.isArray(body.shared_with) ? body.shared_with.map(String).slice(0, 100) : [])
      : [];
    return {
      visibility,
      shared_with: sharedWith,
      // Kept in step for any older code path still reading the boolean.
      is_shared: visibility !== 'private',
      folder_id: body.folder_id ? Number(body.folder_id) : null,
    };
  }
}

module.exports = ReportLibraryService;
