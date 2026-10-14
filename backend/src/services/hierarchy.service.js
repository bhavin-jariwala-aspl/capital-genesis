'use strict';

const { NotFoundError } = require('../utils/errors');

/**
 * HierarchyService — manages the employee closure table.
 *
 * Closure table semantics:
 *   (ancestor_id, descendant_id, depth)
 *   Every employee has a self-row at depth=0.
 *   (A, B, 1) means B is a direct report of A.
 *   (A, C, 2) means C is 2 levels below A.
 */
class HierarchyService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Insert a new employee under a parent manager.
   * Inserts the self-row (depth=0) plus all ancestor paths.
   *
   * @param {string} employeeId
   * @param {string|null} parentId
   * @param {object} [client] Prisma client or transaction, so callers that are
   *   already inside a `$transaction` keep this write in the same atomic unit.
   */
  async addEmployee(employeeId, parentId = null, client = this.prisma) {
    const entries = [
      { ancestor_id: employeeId, descendant_id: employeeId, depth: 0 },
    ];

    if (parentId) {
      // Copy all ancestor rows of the parent, increment depth by 1
      const ancestorsOfParent = await client.employeeHierarchy.findMany({
        where: { descendant_id: parentId },
      });

      for (const row of ancestorsOfParent) {
        entries.push({
          ancestor_id:   row.ancestor_id,
          descendant_id: employeeId,
          depth:         row.depth + 1,
        });
      }
    }

    await client.employeeHierarchy.createMany({
      data:           entries,
      skipDuplicates: true,
    });
  }

  /**
   * Move an employee (and their whole subtree) under a new parent.
   *
   * Runs inside a transaction: the closure table is deleted and rebuilt in
   * several steps, and a failure part-way through would leave the hierarchy
   * describing a tree that does not exist — reports and manager escalation both
   * read it, so a partial rebuild is worse than no move at all.
   */
  async moveEmployee(employeeId, newParentId) {
    await this.prisma.$transaction(async (tx) => {
      // The subtree, with each member's depth below employeeId. Read once,
      // before any delete, and reused throughout: carrying `depth` on this one
      // query saves a per-descendant lookup further down.
      const subtree = await tx.employeeHierarchy.findMany({
        where:  { ancestor_id: employeeId, depth: { gt: 0 } },
        select: { descendant_id: true, depth: true },
      });
      const descendantIds = subtree.map((r) => r.descendant_id);

      // Remove all rows where this employee is the descendant (except self-row)
      await tx.employeeHierarchy.deleteMany({
        where: { descendant_id: employeeId, depth: { gt: 0 } },
      });

      // Also remove all rows where descendants-of-employeeId are listed under
      // old ancestors that are NOT ancestors of the employee itself
      if (descendantIds.length > 0) {
        await tx.employeeHierarchy.deleteMany({
          where: {
            descendant_id: { in: descendantIds },
            ancestor_id:   { notIn: descendantIds, not: employeeId },
          },
        });
      }

      if (!newParentId) return;

      await this.addEmployee(employeeId, newParentId, tx);

      // The employee's own ancestor set is the same for every descendant, so it
      // is fetched once here rather than re-read on each loop iteration — that
      // inner read was the dominant cost when moving a manager with a large
      // team (one query per report, all returning identical rows).
      const ancestorsOfEmployee = await tx.employeeHierarchy.findMany({
        where: { descendant_id: employeeId },
      });
      if (!ancestorsOfEmployee.length) return;

      for (const { descendant_id: descId, depth } of subtree) {
        if (descId === employeeId) continue;
        for (const row of ancestorsOfEmployee) {
          await tx.employeeHierarchy.upsert({
            where:  { ancestor_id_descendant_id: { ancestor_id: row.ancestor_id, descendant_id: descId } },
            update: { depth: row.depth + depth },
            create: { ancestor_id: row.ancestor_id, descendant_id: descId, depth: row.depth + depth },
          });
        }
      }
    });
  }

  /** Get all direct reports (depth=1) */
  async getDirectReports(employeeId) {
    const rows = await this.prisma.employeeHierarchy.findMany({
      where: { ancestor_id: employeeId, depth: 1 },
      include: {
        descendant: {
          select: {
            employee_id: true, employee_name: true, role: true,
            email: true, branch: true, region: true,
          },
        },
      },
    });
    return rows.map((r) => r.descendant);
  }

  /** Get all descendants (everyone below, at any depth) */
  async getAllDescendants(employeeId, includeItself = false) {
    const rows = await this.prisma.employeeHierarchy.findMany({
      where: {
        ancestor_id: employeeId,
        depth:       includeItself ? { gte: 0 } : { gt: 0 },
      },
      include: {
        descendant: {
          select: {
            employee_id: true, employee_name: true, role: true,
            email: true, depth: false,
          },
        },
      },
      orderBy: { depth: 'asc' },
    });
    return rows.map((r) => ({ ...r.descendant, depth: r.depth }));
  }

  /** Get all ancestors (chain up: manager, manager's manager, …) */
  async getAncestors(employeeId, includeSelf = false) {
    const rows = await this.prisma.employeeHierarchy.findMany({
      where: {
        descendant_id: employeeId,
        depth:         includeSelf ? { gte: 0 } : { gt: 0 },
      },
      include: {
        ancestor: {
          select: {
            employee_id: true, employee_name: true, role: true, email: true,
          },
        },
      },
      orderBy: { depth: 'asc' },
    });
    return rows.map((r) => ({ ...r.ancestor, depth: r.depth }));
  }

  /** Build a full tree rooted at an employee */
  async getTree(rootId) {
    const descendants = await this.prisma.employeeHierarchy.findMany({
      where: { ancestor_id: rootId, depth: { gt: 0 } },
      include: {
        descendant: {
          select: {
            employee_id: true, employee_name: true, role: true, email: true,
          },
        },
      },
      orderBy: { depth: 'asc' },
    });

    // Every descendant's direct manager in one query (this used to be one
    // query per descendant).
    const ids = descendants.map((r) => r.descendant_id);
    const [root, edges] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { employee_id: rootId },
        select: { employee_id: true, employee_name: true, role: true, email: true },
      }),
      ids.length
        ? this.prisma.employeeHierarchy.findMany({
          where: { descendant_id: { in: ids }, depth: 1 },
          select: { ancestor_id: true, descendant_id: true },
        })
        : [],
    ]);

    if (!root) throw new NotFoundError('Employee');

    const parentOf = new Map(edges.map((e) => [e.descendant_id, e.ancestor_id]));
    const directMap = {};
    for (const row of descendants) {
      const parentId = parentOf.get(row.descendant_id) ?? (row.depth === 1 ? rootId : null);
      if (!parentId) continue;
      (directMap[parentId] ??= []).push(row.descendant);
    }

    const buildNode = (emp) => ({
      ...emp,
      children: (directMap[emp.employee_id] || []).map(buildNode),
    });

    return buildNode(root);
  }

  /**
   * Full organization graph for admin visualization.
   * Returns ALL employees (tenant-scoped via Prisma middleware), the set of
   * direct-report edges (depth=1), and the tenant's active roles with their
   * levels. The frontend builds the interactive multi-root org chart from this
   * — a single round-trip instead of N per-employee tree calls.
   */
  async getOrgGraph() {
    const [employees, edges, roles] = await Promise.all([
      this.prisma.employee.findMany({
        select: {
          employee_id:   true,
          employee_name: true,
          role:          true,
          email:         true,
          phone:         true,
          is_active:     true,
          branch: { select: { branch_id: true, branch_name: true } },
          region: { select: { region_id: true, region_name: true } },
        },
        orderBy: { employee_name: 'asc' },
      }),
      this.prisma.employeeHierarchy.findMany({
        where:  { depth: 1 },
        select: { ancestor_id: true, descendant_id: true },
      }),
      this.prisma.role.findMany({
        where:   { is_active: true },
        select:  { name: true, label: true, level: true },
        orderBy: { level: 'asc' },
      }),
    ]);

    return {
      employees,
      edges: edges.map((e) => ({ parent_id: e.ancestor_id, child_id: e.descendant_id })),
      roles,
    };
  }
}

module.exports = HierarchyService;
