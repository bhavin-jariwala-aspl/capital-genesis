'use strict';

/**
 * Folder names become segments of the materialised `path`, so a name may not
 * contain the `/` (or `\`) separator or control characters — otherwise it would
 * inject fake path levels and defeat the descendant/cycle guards. Slashes and
 * control chars are collapsed to spaces before the name is trusted.
 */
function sanitizeFolderName(name) {
  return String(name ?? '').replace(/[\\/\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * DocumentFolderService — hierarchical folders for the standalone DMS.
 *
 * Folders form a self-referential tree per tenant with a materialised `path`
 * (e.g. "/Contracts/2026") so breadcrumbs and subtree moves are cheap. tenant_id
 * is injected by the Prisma tenant-scope extension; this service never sets it.
 *
 * Deletion relies on the DB: deleting a folder cascades to its children and
 * NULLs `documents.folder_id` (documents are never destroyed with a folder).
 */
class DocumentFolderService {
  constructor(prisma) {
    this.db = prisma;
  }

  /** Flat, path-ordered list — the frontend assembles the tree. */
  listFolders() {
    return this.db.documentFolder.findMany({
      orderBy: [{ path: 'asc' }],
    });
  }

  getFolder(id) {
    return this.db.documentFolder.findFirst({ where: { id: Number(id) } });
  }

  async createFolder({ name, parentId = null, createdBy = null }) {
    const clean = sanitizeFolderName(name);
    if (!clean) throw Object.assign(new Error('name is required'), { statusCode: 400 });

    let parentPath = '';
    const pid = parentId != null ? Number(parentId) : null;
    if (pid != null) {
      const parent = await this.db.documentFolder.findFirst({ where: { id: pid } });
      if (!parent) throw Object.assign(new Error('Parent folder not found'), { statusCode: 400 });
      parentPath = parent.path;
    }
    return this.db.documentFolder.create({
      data: {
        name: clean,
        parent_id: pid,
        path: `${parentPath}/${clean}`,
        created_by: createdBy != null ? String(createdBy) : null,
      },
    });
  }

  async updateFolder(id, { name, parentId } = {}) {
    const folder = await this.db.documentFolder.findFirst({ where: { id: Number(id) } });
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });

    const newName = name != null ? sanitizeFolderName(name) : folder.name;
    if (!newName) throw Object.assign(new Error('name cannot be empty'), { statusCode: 400 });

    let newParentId = parentId === undefined ? folder.parent_id : (parentId != null ? Number(parentId) : null);
    let parentPath = '';
    if (newParentId != null) {
      if (newParentId === folder.id) throw Object.assign(new Error('A folder cannot be its own parent'), { statusCode: 400 });
      const parent = await this.db.documentFolder.findFirst({ where: { id: newParentId } });
      if (!parent) throw Object.assign(new Error('Parent folder not found'), { statusCode: 400 });
      // Prevent moving a folder into one of its own descendants (would orphan the subtree).
      if (parent.path === folder.path || parent.path.startsWith(`${folder.path}/`)) {
        throw Object.assign(new Error('Cannot move a folder into its own descendant'), { statusCode: 400 });
      }
      parentPath = parent.path;
    }

    const oldPath = folder.path;
    const newPath = `${parentPath}/${newName}`;

    // The folder row and every descendant's materialised path must move
    // together. Outside a transaction a failure part-way through the descendant
    // loop leaves children pointing at a path their parent no longer has, and
    // `startsWith` lookups then miss them permanently — the tree silently loses
    // a subtree with no error surfaced to the caller.
    return this.db.$transaction(async (tx) => {
      const updated = await tx.documentFolder.update({
        where: { id: folder.id },
        data: { name: newName, parent_id: newParentId, path: newPath },
      });

      // Re-materialise descendant paths when this folder moved or was renamed.
      if (newPath !== oldPath) {
        const descendants = await tx.documentFolder.findMany({
          where:  { path: { startsWith: `${oldPath}/` } },
          select: { id: true, path: true },
        });
        // Each descendant needs a different value, so this cannot collapse into
        // one `updateMany` — but inside the transaction it is a single round
        // trip and either all paths move or none do.
        for (const d of descendants) {
          await tx.documentFolder.update({
            where: { id: d.id },
            data:  { path: `${newPath}${d.path.slice(oldPath.length)}` },
          });
        }
      }
      return updated;
    });
  }

  async deleteFolder(id) {
    const folder = await this.db.documentFolder.findFirst({ where: { id: Number(id) } });
    if (!folder) return null;
    await this.db.documentFolder.delete({ where: { id: folder.id } });
    return folder;
  }
}

module.exports = DocumentFolderService;
