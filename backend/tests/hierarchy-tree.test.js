'use strict';

const HierarchyService = require('../src/services/hierarchy.service');

// Closure table for COO → { LMGR → { LOAN1, LOAN2 }, RM1 }.
const EMP = (id) => ({ employee_id: id, employee_name: id, role: 'user', email: null });
const CLOSURE = [
  ['COO', 'LMGR', 1], ['COO', 'RM1', 1], ['COO', 'LOAN1', 2], ['COO', 'LOAN2', 2],
  ['LMGR', 'LOAN1', 1], ['LMGR', 'LOAN2', 1],
].map(([a, d, depth]) => ({ ancestor_id: a, descendant_id: d, depth }));

function prisma() {
  return {
    employee: { findUnique: jest.fn(async ({ where }) => EMP(where.employee_id)) },
    employeeHierarchy: {
      findMany: jest.fn(async ({ where }) => CLOSURE
        .filter((r) => (where.ancestor_id ? r.ancestor_id === where.ancestor_id && r.depth > 0 : true))
        .filter((r) => (where.descendant_id ? where.descendant_id.in.includes(r.descendant_id) && r.depth === where.depth : true))
        .map((r) => ({ ...r, descendant: EMP(r.descendant_id) }))),
      findFirst: jest.fn(),
    },
  };
}

describe('HierarchyService.getTree', () => {
  it('nests every descendant under its direct manager in two queries', async () => {
    const db = prisma();
    const tree = await new HierarchyService(db).getTree('COO');
    const shape = (n) => ({ [n.employee_id]: n.children.map(shape) });
    expect(shape(tree)).toEqual({ COO: [{ LMGR: [{ LOAN1: [] }, { LOAN2: [] }] }, { RM1: [] }] });
    expect(db.employeeHierarchy.findMany).toHaveBeenCalledTimes(2);
    expect(db.employeeHierarchy.findFirst).not.toHaveBeenCalled();
  });

  it('returns a leaf without querying edges', async () => {
    const db = prisma();
    const tree = await new HierarchyService(db).getTree('LOAN1');
    expect(tree).toMatchObject({ employee_id: 'LOAN1', children: [] });
    expect(db.employeeHierarchy.findMany).toHaveBeenCalledTimes(1);
  });
});
