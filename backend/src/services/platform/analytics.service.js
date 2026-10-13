'use strict';

class PlatformAnalyticsService {
  constructor(prisma) {
    this.db = prisma;
  }

  /**
   * Platform overview dashboard — key metrics at a glance.
   */
  async getOverview() {
    const [
      totalTenants,
      activeTenants,
      totalEmployees,
      activeEmployees,
      totalRecords,
      totalActivities,
      totalTasks,
      tenantsByPlan,
      tenantsByStatus,
    ] = await Promise.all([
      this.db.tenant.count(),
      this.db.tenant.count({ where: { status: 'active' } }),
      this.db.employee.count(),
      this.db.employee.count({ where: { is_active: true } }),
      this.db.record.count(),
      this.db.activity.count(),
      this.db.task.count(),
      this.db.tenant.groupBy({ by: ['plan'], _count: true }),
      this.db.tenant.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        by_plan: Object.fromEntries(tenantsByPlan.map(r => [r.plan, r._count])),
        by_status: Object.fromEntries(tenantsByStatus.map(r => [r.status, r._count])),
      },
      users: {
        total: totalEmployees,
        active: activeEmployees,
      },
      data: {
        records: totalRecords,
        activities: totalActivities,
        tasks: totalTasks,
      },
    };
  }

  /**
   * Tenant growth over time — new tenants per month.
   */
  async getTenantGrowth(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const tenants = await this.db.tenant.findMany({
      where: { created_at: { gte: since } },
      select: { created_at: true, plan: true },
      orderBy: { created_at: 'asc' },
    });

    const monthly = {};
    for (const t of tenants) {
      const key = t.created_at.toISOString().slice(0, 7); // YYYY-MM
      if (!monthly[key]) monthly[key] = { total: 0, by_plan: {} };
      monthly[key].total++;
      monthly[key].by_plan[t.plan] = (monthly[key].by_plan[t.plan] || 0) + 1;
    }

    return monthly;
  }

  /**
   * Feature usage heatmap — which features are most used.
   */
  async getFeatureUsage() {
    const [
      modulesCount,
      objectsCount,
      workflowsCount,
      dashboardsCount,
      pipelinesCount,
      wizardsCount,
      emailTemplatesCount,
      integrationCount,
    ] = await Promise.all([
      this.db.uiModule.count({ where: { is_active: true } }),
      this.db.uiObject.count({ where: { is_active: true } }),
      this.db.uiWorkflow.count({ where: { is_active: true } }),
      this.db.uiDashboard.count({ where: { is_active: true } }),
      this.db.uiPipeline.count({ where: { is_active: true } }),
      this.db.uiWizard.count({ where: { is_active: true } }),
      this.db.emailTemplate.count({ where: { is_active: true } }),
      this.db.integration.count({ where: { is_active: true } }),
    ]);

    return {
      modules: modulesCount,
      objects: objectsCount,
      workflows: workflowsCount,
      dashboards: dashboardsCount,
      pipelines: pipelinesCount,
      wizards: wizardsCount,
      email_templates: emailTemplatesCount,
      integrations: integrationCount,
    };
  }

  /**
   * User activity metrics — logins, records created, tasks completed.
   */
  async getUserActivity(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      recordsCreated,
      activitiesCreated,
      tasksCompleted,
    ] = await Promise.all([
      this.db.record.count({ where: { created_at: { gte: since } } }),
      this.db.activity.count({ where: { created_at: { gte: since } } }),
      this.db.task.count({ where: { completed_at: { gte: since } } }),
    ]);

    return {
      period_days: days,
      records_created: recordsCreated,
      activities_created: activitiesCreated,
      tasks_completed: tasksCompleted,
    };
  }

  /**
   * System health metrics — database stats, cache, uptime info.
   */
  async getSystemHealth() {
    let dbStatus = 'connected';
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await this.db.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'unreachable';
    }

    // Table row counts for capacity planning
    const [recordCount, employeeCount, auditCount] = await Promise.all([
      this.db.record.count(),
      this.db.employee.count(),
      this.db.auditLog.count(),
    ]);

    return {
      database: {
        status: dbStatus,
        latency_ms: dbLatencyMs,
      },
      capacity: {
        records: recordCount,
        employees: employeeCount,
        audit_logs: auditCount,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
    };
  }

  /**
   * Revenue / plan distribution for MRR/ARR dashboards.
   */
  async getRevenueMetrics() {
    const plans = await this.db.subscriptionPlan.findMany({ where: { is_active: true } });
    const tenantCounts = await this.db.tenant.groupBy({
      by: ['plan'],
      where: { status: { in: ['active', 'trial'] } },
      _count: true,
    });

    const countMap = Object.fromEntries(tenantCounts.map(r => [r.plan, r._count]));
    let totalMRR = 0;

    const breakdown = plans.map(p => {
      const count = countMap[p.name] || 0;
      const mrr = count * Number(p.price_monthly);
      totalMRR += mrr;
      return {
        plan: p.name,
        label: p.label,
        tenants: count,
        price_monthly: Number(p.price_monthly),
        mrr,
      };
    });

    return {
      mrr: totalMRR,
      arr: totalMRR * 12,
      breakdown,
    };
  }

  /**
   * Churn indicators — suspended/deleted tenants.
   */
  async getChurnMetrics(months = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const [suspended, deleted, trials] = await Promise.all([
      this.db.tenant.count({
        where: { status: 'suspended', suspended_at: { gte: since } },
      }),
      this.db.tenant.count({
        where: { status: 'deleted', deleted_at: { gte: since } },
      }),
      this.db.tenant.count({
        where: { status: 'trial', trial_ends_at: { lte: new Date() } },
      }),
    ]);

    return {
      period_months: months,
      suspended,
      deleted,
      expired_trials: trials,
      total_churned: suspended + deleted,
    };
  }
}

module.exports = PlatformAnalyticsService;
