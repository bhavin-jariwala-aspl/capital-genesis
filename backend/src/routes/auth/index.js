'use strict';

const bcrypt           = require('bcryptjs');
const { authenticate, requireAdmin, PLATFORM_ADMIN_ROLE, BUILTIN_ROLE_LEVEL } = require('../../middleware/authenticate');
const { routeSchemas, schemas } = require('../../utils/schemas');
const AuthService      = require('../../services/auth.service');
const HierarchyService = require('../../services/hierarchy.service');
const EmailTemplateService = require('../../services/email-template.service');
const EmailSendService     = require('../../services/email-send.service');
const { ok }           = require('../../utils/response');
const { ValidationError, ConflictError, NotFoundError, RateLimitedError } = require('../../utils/errors');
const { RateLimiter, AUTH_LIMITS, clientIp } = require('../../utils/rate-limit');
const { tenantContext } = require('../../middleware/tenant-scope');
const { invalidateRoleLevels } = require('../../services/role-level');
const EntitlementService = require('../../services/platform/entitlement.service');

// Build the absolute base URL the reset link should point at. Prefers an
// explicit APP_URL, otherwise reconstructs it from the incoming request.
function resolveAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Fields a tenant admin may set on an employee.
 *
 * Both employee routes used to spread `req.body` straight into the Prisma
 * `data`, which made them a privilege-escalation and tenant-hopping route:
 * `PUT /employees/:id { role: "platform_admin" }` re-badged the caller as a
 * platform admin (the `platform_admin` row is system-wide, so the level-1
 * lookup at next sign-in succeeded), and `{ tenant_id: 7 }` moved an employee —
 * or the caller themself — into someone else's workspace. Anything not on this
 * list is now dropped, so adding a column to `employees` cannot silently widen
 * what an admin can write.
 */
const EMPLOYEE_WRITABLE = Object.freeze([
  'employee_name', 'email', 'phone', 'role', 'branch_id', 'region_id', 'is_active',
]);

/** The same list plus the immutable identity, for creates. */
const EMPLOYEE_CREATABLE = Object.freeze(['employee_id', ...EMPLOYEE_WRITABLE]);

/** Keep only `allowed` keys, ignoring undefined values. */
function pick(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body?.[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/**
 * Resolve the role an admin asked for into a role this tenant may actually
 * assign, or throw.
 *
 * Two things are being prevented. First, `platform_admin` is reserved: the
 * platform console is cross-tenant, so no tenant-level route may hand it out.
 * Second, a role name with no row at all used to be accepted, and the employee
 * then signed in with an unresolvable role — which the old `?? 1` default read
 * as full platform authority.
 */
async function assertAssignableRole(prisma, roleName) {
  if (!roleName) throw new ValidationError('role is required');
  if (roleName === PLATFORM_ADMIN_ROLE) {
    throw new ValidationError('The platform_admin role is reserved and cannot be assigned from workspace settings');
  }
  // Tenant-scoped read: the extension narrows this to "my rows OR system rows".
  const role = await prisma.role.findFirst({
    where:  { name: roleName, is_active: true },
    select: { name: true, level: true },
  });
  if (!role) throw new ValidationError(`Unknown role "${roleName}"`);
  if (role.level < BUILTIN_ROLE_LEVEL.super_admin) {
    throw new ValidationError(`Role "${roleName}" is reserved and cannot be assigned`);
  }
  return role;
}

/** The plan name a tenant is on. The token carries only the tenant id. */
async function planOf(prisma, tenantId) {
  if (!tenantId || typeof prisma?.tenant?.findUnique !== 'function') return null;
  const t = await prisma.tenant.findUnique({ where: { id: Number(tenantId) }, select: { plan: true } }).catch(() => null);
  return t?.plan ?? null;
}

module.exports = async function authRoutes(fastify) {
  const authSvc = new AuthService(fastify.prisma, fastify.jwt);
  const hierSvc = new HierarchyService(fastify.prisma);
  const emailSvc = new EmailSendService(fastify.prisma, new EmailTemplateService(fastify.prisma));

  // POST /api/auth/login
  // Brute-force protection for the public endpoints. Counts are keyed by the
  // targeted account AND by client IP; a successful login clears the account key.
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });
  const enforce = async (key, rule, what) => {
    const r = await limiter.hit(key, rule);
    if (r.limited) {
      const mins = Math.max(1, Math.ceil(r.retryAfterSec / 60));
      throw new RateLimitedError(`Too many ${what}. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, r.retryAfterSec);
    }
  };

  fastify.post('/login', {
    schema: routeSchemas.create(schemas.loginRequest),
  }, async (req) => {
    const { employee_id, password } = req.body;
    const ip = clientIp(req);
    const accountKey = `login:acct:${String(employee_id).toLowerCase()}`;
    await enforce(`login:ip:${ip}`, AUTH_LIMITS.loginIp, 'login attempts from this network');
    await enforce(accountKey, AUTH_LIMITS.loginAccount, 'failed sign-in attempts for this account');
    const result = await authSvc.login(employee_id, password, sessionMeta(req));
    await limiter.reset(accountKey);
    return ok(result);
  });

  const sessionMeta = (req) => ({ userAgent: req.headers['user-agent'], ip: clientIp(req) });

  // POST /api/auth/refresh — exchange a refresh token for a new session (rotates it).
  fastify.post('/refresh', {
    schema: { body: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string', minLength: 20, maxLength: 200 } }, additionalProperties: false } },
  }, async (req) => {
    await enforce(`refresh:ip:${clientIp(req)}`, AUTH_LIMITS.loginIp, 'session refreshes from this network');
    return ok(await authSvc.refresh(req.body.refresh_token, sessionMeta(req)));
  });

  // POST /api/auth/logout — end this device's session, or every session.
  fastify.post('/logout', {
    preHandler: [authenticate],
    schema: { body: { type: 'object', properties: { refresh_token: { type: 'string', maxLength: 200 }, everywhere: { type: 'boolean' } }, additionalProperties: false } },
  }, async (req) => ok(await authSvc.logout(req.body?.refresh_token, { everywhere: Boolean(req.body?.everywhere), employeeId: req.user?.employee_id })));

  // ── Two-factor authentication (PRD E-02) ─────────────────────────────────
  const mfaCode = { type: 'string', minLength: 6, maxLength: 20 };
  const mfaToken = { type: 'string', minLength: 20, maxLength: 2000 };

  // POST /api/auth/mfa/verify — second sign-in step: authenticator or recovery code.
  fastify.post('/mfa/verify', {
    schema: { body: { type: 'object', required: ['mfa_token', 'code'], properties: { mfa_token: mfaToken, code: mfaCode }, additionalProperties: false } },
  }, async (req) => {
    await enforce(`mfa:ip:${clientIp(req)}`, AUTH_LIMITS.loginIp, 'code attempts from this network');
    return ok(await authSvc.verifyMfa(req.body.mfa_token, req.body.code, sessionMeta(req)));
  });

  // POST /api/auth/mfa/setup — start enrolment (signed in, or during a policy-required sign-in).
  fastify.post('/mfa/setup', {
    schema: { body: { type: ['object', 'null'], properties: { mfa_token: mfaToken }, additionalProperties: false } },
  }, async (req) => {
    if (req.body?.mfa_token) return ok(await authSvc.mfaSetup({ mfaToken: req.body.mfa_token }));
    await authenticate(req);
    return ok(await authSvc.mfaSetup({ employeeId: req.user.employee_id }));
  });

  // POST /api/auth/mfa/enable — confirm enrolment with a first code; returns recovery codes once.
  fastify.post('/mfa/enable', {
    schema: { body: { type: 'object', required: ['code'], properties: { code: mfaCode, mfa_token: mfaToken }, additionalProperties: false } },
  }, async (req) => {
    if (req.body.mfa_token) {
      await enforce(`mfa:ip:${clientIp(req)}`, AUTH_LIMITS.loginIp, 'code attempts from this network');
      return ok(await authSvc.mfaEnable({ mfaToken: req.body.mfa_token, code: req.body.code }, sessionMeta(req)));
    }
    await authenticate(req);
    return ok(await authSvc.mfaEnable({ employeeId: req.user.employee_id, code: req.body.code }));
  });

  // POST /api/auth/mfa/disable — turn MFA off (not allowed where policy requires it).
  fastify.post('/mfa/disable', {
    preHandler: [authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: mfaCode }, additionalProperties: false } },
  }, async (req) => ok(await authSvc.mfaDisable(req.user.employee_id, req.body.code)));

  // POST /api/auth/forgot-password — public. Emails a reset link if the account
  // exists. Always responds generically so account existence isn't leaked.
  fastify.post('/forgot-password', {
    schema: { body: schemas.forgotPasswordRequest },
  }, async (req) => {
    await enforce(`forgot:ip:${clientIp(req)}`, AUTH_LIMITS.forgotIp, 'password reset requests');
    const genericResponse = ok({
      message: 'If an account matches, a password reset link has been sent to its email address.',
    });

    const result = await authSvc.createResetToken(req.body.identifier);
    if (!result) return genericResponse;

    const { employee, rawToken } = result;
    const resetUrl = `${resolveAppUrl(req)}/reset-password?token=${rawToken}`;

    try {
      await emailSvc.sendRaw({
        to_email:  employee.email,
        subject:   'Reset your Genesis CRM password',
        body_html: `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
            <h2 style="color:#4f46e5">Reset your password</h2>
            <p>Hi ${employee.employee_name},</p>
            <p>We received a request to reset the password for your Genesis CRM account
               (<strong>${employee.employee_id}</strong>). Click the button below to choose a new password.
               This link expires in 1 hour.</p>
            <p style="margin:28px 0">
              <a href="${resetUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;font-weight:600">Reset password</a>
            </p>
            <p style="font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link:<br>
              <a href="${resetUrl}" style="color:#4f46e5">${resetUrl}</a></p>
            <p style="font-size:13px;color:#6b7280">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          </div>`,
        body_text: `Hi ${employee.employee_name},\n\nReset your Genesis CRM password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      });
    } catch (err) {
      // Don't surface send failures to the caller (avoids leaking existence);
      // the send service already logs failures internally.
      req.log?.error?.({ err }, '[auth] password-reset email send failed');
    }

    return genericResponse;
  });

  // POST /api/auth/reset-password — public. Consumes the emailed token.
  fastify.post('/reset-password', {
    schema: { body: schemas.resetPasswordRequest },
  }, async (req) => {
    await enforce(`reset:ip:${clientIp(req)}`, AUTH_LIMITS.resetIp, 'password reset attempts');
    const result = await authSvc.resetPassword(req.body.token, req.body.new_password);
    return ok(result);
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [authenticate] }, async (req) => {
    const profile = await authSvc.getProfile(req.user.employeeId);
    return ok(profile);
  });

  // GET /api/auth/entitlements — the features this workspace may use.
  //
  // What the client needs to hide what it cannot use and to say why: the
  // enabled keys, plus the reason for each disabled one so an "upgrade" prompt
  // can name the tier. Platform admins get everything — they have no tenant.
  fastify.get('/entitlements', { preHandler: [authenticate] }, async (req) => {
    const tenantId = req.user?.tenant_id;
    if (!tenantId || req.user?.role === 'platform_admin') {
      const { FEATURE_KEYS } = require('../../services/platform/feature-catalogue');
      return ok({ plan: null, features: FEATURE_KEYS, locked: {} });
    }
    const svc = new EntitlementService(fastify.prisma);
    const map = await svc.resolve(tenantId);
    const features = Object.values(map).filter((s) => s.enabled).map((s) => s.key);
    const locked = Object.fromEntries(
      Object.values(map).filter((s) => !s.enabled).map((s) => [s.key, { source: s.source, reason: s.reason }]),
    );
    return ok({ plan: await planOf(fastify.prisma, req.user?.tenant_id), features, locked });
  });

  // POST /api/auth/change-password
  fastify.post('/change-password', { preHandler: [authenticate] }, async (req) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      throw new ValidationError('current_password and new_password are required');
    }
    const result = await authSvc.changePassword(req.user.employeeId, current_password, new_password);
    return ok(result);
  });

  // GET /api/auth/hierarchy — get reporter tree for current user
  fastify.get('/hierarchy', { preHandler: [authenticate] }, async (req) => {
    const tree = await hierSvc.getTree(req.user.employeeId);
    return ok(tree);
  });

  // GET /api/auth/hierarchy/:id — admin can view any employee's tree
  fastify.get('/hierarchy/:id', { preHandler: [requireAdmin] }, async (req) => {
    const tree = await hierSvc.getTree(req.params.id);
    return ok(tree);
  });

  // GET /api/auth/org-hierarchy — full org graph for admin visualization (admin only)
  fastify.get('/org-hierarchy', { preHandler: [requireAdmin] }, async () => {
    const graph = await hierSvc.getOrgGraph();
    return ok(graph);
  });

  // GET /api/auth/direct-reports
  fastify.get('/direct-reports', { preHandler: [authenticate] }, async (req) => {
    const reports = await hierSvc.getDirectReports(req.user.employeeId);
    return ok(reports);
  });

  // GET /api/auth/employees — list all employees (admin only)
  fastify.get('/employees', { preHandler: [requireAdmin] }, async (req) => {
    const employees = await fastify.prisma.employee.findMany({
      select: {
        employee_id: true, employee_name: true, role: true,
        email: true, phone: true, is_active: true,
        branch: { select: { branch_id: true, branch_name: true } },
        region: { select: { region_id: true, region_name: true } },
      },
      orderBy: { employee_name: 'asc' },
    });
    return ok(employees);
  });

  // PUT /api/auth/employees/:id — update employee (admin only)
  // Only EMPLOYEE_WRITABLE fields are honoured; see the note on that list.
  fastify.put('/employees/:id', { preHandler: [requireAdmin] }, async (req) => {
    const { password, parent_id } = req.body ?? {};
    const updateData = pick(req.body, EMPLOYEE_WRITABLE);
    if (updateData.role) await assertAssignableRole(fastify.prisma, updateData.role);
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }
    // Tenant-scoped: the extension ANDs `tenant_id` into the WHERE, so this
    // 404s rather than touching another workspace's employee.
    const target = await fastify.prisma.employee.findFirst({
      where:  { employee_id: req.params.id },
      select: { employee_id: true, role: true },
    });
    if (!target) throw new NotFoundError('Employee');
    if (target.role === PLATFORM_ADMIN_ROLE) {
      throw new ValidationError('Platform administrators are managed from the platform console');
    }
    const employee = await fastify.prisma.employee.update({
      where: { employee_id: req.params.id },
      data: updateData,
    });
    // If parent_id is provided, re-attach in hierarchy
    if (parent_id !== undefined) {
      await hierSvc.moveEmployee(req.params.id, parent_id || null);
    }
    const { password: _p, ...safe } = employee;
    return ok(safe);
  });

  // PATCH /api/auth/employees/:id/deactivate — deactivate employee (admin only)
  fastify.patch('/employees/:id/deactivate', { preHandler: [requireAdmin] }, async (req) => {
    const employee = await fastify.prisma.employee.update({
      where: { employee_id: req.params.id },
      data: { is_active: false },
    });
    // Deactivation ends every session at once, not when tokens expire (E-01).
    await authSvc.revokeAll(req.params.id);
    const { password: _p, ...safe } = employee;
    return ok(safe);
  });

  // PATCH /api/auth/employees/:id/reactivate — reactivate employee (admin only)
  fastify.patch('/employees/:id/reactivate', { preHandler: [requireAdmin] }, async (req) => {
    const employee = await fastify.prisma.employee.update({
      where: { employee_id: req.params.id },
      data: { is_active: true },
    });
    const { password: _p, ...safe } = employee;
    return ok(safe);
  });

  // ── Role CRUD (tenant-scoped) ───────────────────────────

  // GET /api/auth/roles — list roles for this tenant with employee counts
  fastify.get('/roles', { preHandler: [authenticate] }, async (req) => {
    const [roles, empCounts] = await Promise.all([
      fastify.prisma.role.findMany({
        where: { is_active: true },
        orderBy: { level: 'asc' },
      }),
      fastify.prisma.employee.groupBy({
        by: ['role'],
        _count: true,
      }),
    ]);
    const countMap = Object.fromEntries(empCounts.map(r => [r.role, r._count]));
    const result = roles.map(r => ({ ...r, employee_count: countMap[r.name] || 0 }));
    return ok(result);
  });

  // POST /api/auth/roles — create custom role (admin only)
  // If a role already exists at the requested level, all roles at that level
  // and below are shifted down by 1 (like inserting a row in a spreadsheet).
  fastify.post('/roles', { preHandler: [requireAdmin] }, async (req) => {
    const { name, label, description, level } = req.body;
    if (!name || !label) throw new ValidationError('name and label are required');
    const lvl = Number(level);
    if (!Number.isFinite(lvl) || lvl < BUILTIN_ROLE_LEVEL.super_admin) {
      throw new ValidationError('level must be 2 or higher (level 1 is reserved for platform admin)');
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    // The name matters as much as the level: authorization gates key off the
    // reserved name, and a tenant row called `platform_admin` would shadow the
    // system row in the sign-in lookup.
    if (slug === PLATFORM_ADMIN_ROLE) {
      throw new ValidationError('The name "platform_admin" is reserved by the platform');
    }

    const role = await fastify.prisma.$transaction(async (tx) => {
      // Shift existing roles at this level or below down by 1
      const conflicting = await tx.role.findMany({
        where: { level: { gte: lvl }, is_active: true },
        orderBy: { level: 'desc' },
      });
      if (conflicting.some(r => r.level === lvl)) {
        for (const r of conflicting) {
          await tx.role.update({ where: { id: r.id }, data: { level: r.level + 1 } });
        }
      }

      return tx.role.create({
        data: {
          name: slug,
          label,
          description: description || null,
          level: lvl,
        },
      });
    });

    invalidateRoleLevels(req.user?.tenant_id);
    return ok(role);
  });

  // GET /api/auth/roles/preview-shift — preview what shifts when inserting at a level
  fastify.get('/roles/preview-shift', { preHandler: [requireAdmin] }, async (req) => {
    const lvl = Number(req.query.level);
    if (!lvl || lvl < 2) return ok({ shifts: [] });
    const affected = await fastify.prisma.role.findMany({
      where: { level: { gte: lvl }, is_active: true },
      orderBy: { level: 'asc' },
      select: { id: true, name: true, label: true, level: true },
    });
    // Only shift if there's a conflict at the requested level
    if (!affected.some(r => r.level === lvl)) return ok({ shifts: [] });
    const shifts = affected.map(r => ({ ...r, new_level: r.level + 1 }));
    return ok({ shifts });
  });

  // PUT /api/auth/roles/:id — update role (admin only)
  fastify.put('/roles/:id', { preHandler: [requireAdmin] }, async (req) => {
    const { label, description, level, is_active } = req.body;
    const data = {};
    if (label !== undefined) data.label = label;
    if (description !== undefined) data.description = description;
    if (level !== undefined) {
      if (level < 2) throw new ValidationError('level must be 2 or higher (level 1 is reserved for platform admin)');
      data.level = Number(level);
    }
    if (is_active !== undefined) data.is_active = is_active;
    const role = await fastify.prisma.role.update({
      where: { id: Number(req.params.id) },
      data,
    });
    // Permission checks memoise a role's level briefly; a level edit must not
    // wait out that memo.
    invalidateRoleLevels(req.user?.tenant_id);
    return ok(role);
  });

  // DELETE /api/auth/roles/:id — delete role (admin only, only if no employees use it)
  // After deletion, roles below the deleted level shift up by 1 to close the gap.
  fastify.delete('/roles/:id', { preHandler: [requireAdmin] }, async (req) => {
    const role = await fastify.prisma.role.findUnique({ where: { id: Number(req.params.id) } });
    if (!role) throw new ValidationError('Role not found');
    if (role.level < BUILTIN_ROLE_LEVEL.super_admin || role.name === PLATFORM_ADMIN_ROLE) {
      throw new ValidationError('Cannot delete the platform admin role');
    }
    const empCount = await fastify.prisma.employee.count({ where: { role: role.name } });
    if (empCount > 0) throw new ValidationError(`Cannot delete role "${role.label}" — ${empCount} employee(s) are using it`);

    await fastify.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: role.id } });

      // Close the gap: shift roles below the deleted level up by 1
      const below = await tx.role.findMany({
        where: { level: { gt: role.level }, is_active: true },
        orderBy: { level: 'asc' },
      });
      for (const r of below) {
        await tx.role.update({ where: { id: r.id }, data: { level: r.level - 1 } });
      }
    });

    invalidateRoleLevels(req.user?.tenant_id);
    return ok({ message: 'Role deleted' });
  });

  // GET /api/auth/regions — list regions for the tenant
  fastify.get('/regions', { preHandler: [authenticate] }, async () => {
    const regions = await fastify.prisma.region.findMany({
      where: { is_active: true },
      orderBy: { region_name: 'asc' },
    });
    return ok(regions);
  });

  // GET /api/auth/branches — list branches for the tenant
  fastify.get('/branches', { preHandler: [authenticate] }, async () => {
    const branches = await fastify.prisma.branch.findMany({
      where: { is_active: true },
      include: { region: { select: { region_name: true } } },
      orderBy: { branch_name: 'asc' },
    });
    return ok(branches);
  });

  // POST /api/auth/employees — create employee (admin only)
  // Transaction covers: validation → max_users check → employee create → hierarchy insert
  // If any step fails, everything rolls back.
  fastify.post('/employees', { preHandler: [requireAdmin] }, async (req) => {
    const { password, parent_id } = req.body ?? {};
    const data = pick(req.body, EMPLOYEE_CREATABLE);

    // ── Input validation ─────────────────────────────────
    if (!data.employee_id || !data.employee_id.trim()) throw new ValidationError('employee_id is required');
    if (!data.employee_name || !data.employee_name.trim()) throw new ValidationError('employee_name is required');
    if (!password) throw new ValidationError('password is required');
    await assertAssignableRole(fastify.prisma, data.role);

    // `employees.employee_id` and `employees.email` are unique across the whole
    // deployment, not per tenant (see DATABASE_SCHEMA.md). The probe therefore
    // has to run unscoped to be meaningful — a tenant-scoped check would miss
    // the clash and let the insert fail as a bare P2002 "already exists". Only
    // the two identity columns are read, and the unique constraint reveals the
    // same collision anyway; the win is an error message that says what to do.
    const clash = await tenantContext.run({ tenantId: null }, () => fastify.prisma.employee.findFirst({
      where:  { OR: [{ employee_id: data.employee_id }, ...(data.email ? [{ email: data.email }] : [])] },
      select: { employee_id: true, email: true },
    }));
    if (clash) {
      throw new ConflictError(clash.employee_id === data.employee_id
        ? `Employee ID "${data.employee_id}" is already taken. IDs are unique across the platform — try prefixing it.`
        : `Email "${data.email}" is already registered to another account.`);
    }

    const hashed = await bcrypt.hash(password, 12);
    const tenantId = req.user?.tenant_id;

    const employee = await fastify.prisma.$transaction(async (tx) => {
      // 1. Enforce max_users
      if (tenantId) {
        const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
        if (tenant) {
          const currentCount = await tx.employee.count({ where: { tenant_id: tenantId, is_active: true } });
          if (currentCount >= tenant.max_users) {
            throw new ValidationError(`User limit reached (${tenant.max_users}). Upgrade your plan to add more users.`);
          }
        }
      }

      // 2. Validate parent exists (if specified)
      if (parent_id) {
        const parentWhere = { employee_id: parent_id };
        if (tenantId) parentWhere.tenant_id = tenantId;
        const parent = await tx.employee.findFirst({ where: parentWhere });
        if (!parent) throw new ValidationError(`Manager "${parent_id}" not found`);
      }

      // 3. Create employee
      const emp = await tx.employee.create({
        data: { ...data, password: hashed, ...(tenantId ? { tenant_id: tenantId } : {}) },
      });

      // 4. Build hierarchy entries (self-row + ancestor chain)
      const tenantData = tenantId ? { tenant_id: tenantId } : {};
      const hierarchyEntries = [
        { ancestor_id: emp.employee_id, descendant_id: emp.employee_id, depth: 0, ...tenantData },
      ];
      if (parent_id) {
        const ancestorWhere = { descendant_id: parent_id };
        if (tenantId) ancestorWhere.tenant_id = tenantId;
        const ancestorsOfParent = await tx.employeeHierarchy.findMany({ where: ancestorWhere });
        for (const row of ancestorsOfParent) {
          hierarchyEntries.push({
            ancestor_id: row.ancestor_id,
            descendant_id: emp.employee_id,
            depth: row.depth + 1,
            ...tenantData,
          });
        }
      }
      await tx.employeeHierarchy.createMany({ data: hierarchyEntries, skipDuplicates: true });

      return emp;
    });

    const { password: _p, ...safeEmployee } = employee;
    return ok(safeEmployee);
  });
};
