'use strict';

jest.mock('@prisma/client');

const ReportLibraryService = require('../src/services/report-library.service');

const AUTHOR = { employeeId: 'E1', role: 'user', role_level: 5 };
const PEER = { employeeId: 'E9', role: 'user', role_level: 5 };
const MANAGER = { employeeId: 'E2', role: 'manager', role_level: 4 };
const ADMIN = { employeeId: 'E0', role: 'admin', role_level: 3 };

const report = (over = {}) => ({ id: 1, created_by: 'E1', visibility: 'private', shared_with: [], ...over });

function makePrisma({ hierarchy = [], reports = [], favorites = [] } = {}) {
  return {
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue(hierarchy) },
    customReport: {
      findMany: jest.fn().mockResolvedValue(reports),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    reportFavorite: { findMany: jest.fn().mockResolvedValue(favorites) },
    reportFolder: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('visibility', () => {
  const svc = () => new ReportLibraryService(makePrisma());

  it('keeps a private report to its author', () => {
    expect(svc().canView(report(), AUTHOR)).toBe(true);
    expect(svc().canView(report(), PEER)).toBe(false);
  });

  it('lets an admin view any report, so they can support the people building them', () => {
    expect(svc().canView(report(), ADMIN)).toBe(true);
  });

  it('shows an "everyone" report to everyone', () => {
    expect(svc().canView(report({ visibility: 'everyone' }), PEER)).toBe(true);
  });

  it('shows a team report only to people in the author’s reporting line', () => {
    const r = report({ visibility: 'team' });
    expect(svc().canView(r, MANAGER, ['E1', 'E2'])).toBe(true);
    expect(svc().canView(r, PEER, ['E9'])).toBe(false);
  });

  it('matches a role-shared report by role name or by employee id', () => {
    expect(svc().canView(report({ visibility: 'shared', shared_with: ['manager'] }), MANAGER)).toBe(true);
    expect(svc().canView(report({ visibility: 'shared', shared_with: ['E9'] }), PEER)).toBe(true);
    expect(svc().canView(report({ visibility: 'shared', shared_with: ['admin'] }), PEER)).toBe(false);
  });

  it('treats a legacy is_shared report as visible, so nothing vanishes on upgrade', () => {
    const legacy = { id: 2, created_by: 'E1', is_shared: true, visibility: null };
    expect(svc().canView(legacy, PEER)).toBe(true);
  });

  it('only lets the author or an admin edit', () => {
    const svcI = svc();
    expect(() => svcI.assertCanEdit(report(), AUTHOR)).not.toThrow();
    expect(() => svcI.assertCanEdit(report(), ADMIN)).not.toThrow();
    expect(() => svcI.assertCanEdit(report(), PEER)).toThrow(/created this report/);
  });
});

describe('scope clamping', () => {
  it('never lets a plain user widen their scope to all records', async () => {
    const svc = new ReportLibraryService(makePrisma({ hierarchy: [] }));
    const ctx = await svc.resolveScope({ employeeId: 'E1', role_level: 5 }, 'all');
    expect(ctx.scope).toBe('me');
  });

  it('clamps a manager asking for all records down to their team', async () => {
    const svc = new ReportLibraryService(makePrisma({ hierarchy: [{ descendant_id: 'E1' }, { descendant_id: 'E3' }] }));
    const ctx = await svc.resolveScope({ employeeId: 'E2', role_level: 4 }, 'all');
    expect(ctx.scope).toBe('team');
    expect(ctx.teamIds).toEqual(['E1', 'E3']);
  });

  it('lets an admin see everything', async () => {
    const svc = new ReportLibraryService(makePrisma());
    expect((await svc.resolveScope({ employeeId: 'E0', role_level: 3 }, 'all')).scope).toBe('all');
  });

  it('defaults to the widest scope the role allows when none is requested', async () => {
    const svc = new ReportLibraryService(makePrisma());
    expect((await svc.resolveScope({ employeeId: 'E1', role_level: 5 })).scope).toBe('me');
    expect((await svc.resolveScope({ employeeId: 'E0', role_level: 3 })).scope).toBe('all');
  });
});

describe('report list', () => {
  it('filters out reports the viewer may not see, and stamps favourites', async () => {
    const prisma = makePrisma({
      reports: [
        report({ id: 1, visibility: 'everyone' }),
        report({ id: 2, visibility: 'private' }),
      ],
      favorites: [{ report_id: 1 }],
    });
    const list = await new ReportLibraryService(prisma).visibleReports(PEER, {});
    expect(list.map((r) => r.id)).toEqual([1]);
    expect(list[0].is_favorite).toBe(true);
  });

  it('searches across name, description and category', async () => {
    const prisma = makePrisma({
      reports: [
        report({ id: 1, visibility: 'everyone', name: 'Pipeline by stage', description: null, category: 'sales' }),
        report({ id: 2, visibility: 'everyone', name: 'Open cases by priority', description: null, category: 'support' }),
      ],
    });
    const list = await new ReportLibraryService(prisma).visibleReports(PEER, { search: 'pipeline' });
    expect(list.map((r) => r.id)).toEqual([1]);
  });

  it('can narrow to the uncategorised folder', async () => {
    const prisma = makePrisma({
      reports: [
        report({ id: 1, visibility: 'everyone', folder_id: null }),
        report({ id: 2, visibility: 'everyone', folder_id: 4 }),
      ],
    });
    const list = await new ReportLibraryService(prisma).visibleReports(PEER, { folderId: null });
    expect(list.map((r) => r.id)).toEqual([1]);
  });
});

describe('sharing payload', () => {
  const svc = () => new ReportLibraryService(makePrisma());

  it('drops the role list when the report is not role-shared', () => {
    expect(svc().serializeSharing({ visibility: 'private', shared_with: ['admin'] }))
      .toMatchObject({ visibility: 'private', shared_with: [], is_shared: false });
  });

  it('keeps the role list for a role-shared report and marks it shared', () => {
    expect(svc().serializeSharing({ visibility: 'shared', shared_with: ['manager'] }))
      .toMatchObject({ visibility: 'shared', shared_with: ['manager'], is_shared: true });
  });

  it('falls back to private for an unrecognised visibility', () => {
    expect(svc().serializeSharing({ visibility: 'public-internet' }).visibility).toBe('private');
  });
});

describe('folders', () => {
  it('refuses to nest a folder inside its own sub-folder', async () => {
    const prisma = makePrisma();
    prisma.reportFolder.findUnique = jest.fn()
      .mockResolvedValueOnce({ id: 1, parent_id: null, color: 'indigo' }) // the folder being moved
      .mockResolvedValueOnce({ parent_id: 1 });                            // proposed parent's parent
    const svc = new ReportLibraryService(prisma);
    await expect(svc.updateFolder(1, { parent_id: 2 })).rejects.toThrow(/sub-folders/);
  });

  it('refuses to make a folder its own parent', async () => {
    const prisma = makePrisma();
    prisma.reportFolder.findUnique = jest.fn().mockResolvedValue({ id: 1, parent_id: null });
    const svc = new ReportLibraryService(prisma);
    await expect(svc.updateFolder(1, { parent_id: 1 })).rejects.toThrow(/own parent/);
  });

  it('never deletes reports when a folder is deleted', async () => {
    const prisma = makePrisma();
    prisma.reportFolder.findUnique = jest.fn().mockResolvedValue({ id: 3, parent_id: null });
    prisma.reportFolder.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    prisma.reportFolder.delete = jest.fn().mockResolvedValue({});
    await new ReportLibraryService(prisma).deleteFolder(3);
    expect(prisma.customReport.updateMany).toHaveBeenCalledWith({ where: { folder_id: 3 }, data: { folder_id: null } });
  });
});
