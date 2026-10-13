'use strict';

const SocialMediaService = require('../../services/social-media.service');
const SocialAssignmentService = require('../../services/social-assignment.service');
const { authenticate, requireAdmin, requireRole } = require('../../middleware/authenticate');
const { scopedHandler } = require('../../middleware/tenant-scope');
const { ok, created } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

const requireManager = requireRole('manager');

/**
 * Where to send the browser after an OAuth round-trip. `APP_URL` is the
 * frontend's public origin (the same variable password-reset links use); in
 * development the Vite dev server is the default.
 */
function frontendUrl() {
  return (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

/** Absolute URL of this API as the platform will reach it for the OAuth callback. */
function apiUrl(req) {
  if (process.env.API_URL) return process.env.API_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Social Media routes
 *
 * Permission tiers (matches industry CRM patterns):
 *
 *   authenticate  (any user)  — read all resources, respond to / convert mentions
 *   requireManager (manager+) — create/edit/publish posts, draft campaigns
 *   requireAdmin   (admin+)   — connect accounts, manage tokens, keywords,
 *                               routing rules, delete resources, run sweeps
 *
 * Every authenticated handler is wrapped in `scopedHandler` so the tenant
 * context reaches the service layer (see tenant-scope.js for why the
 * `authenticate` hook alone does not achieve that).
 *
 * Prefix: /api/social-media
 */
module.exports = async function socialMediaRoutes(fastify) {
  // The app decorates a single instance (the schedulers use the same one); the
  // fallback keeps the route file testable in isolation.
  const svc = fastify.socialMediaService
    ?? new SocialMediaService(fastify.prisma, { eventBus: fastify.eventBus });
  const assignSvc = new SocialAssignmentService(fastify.prisma);

  const route = (method, url, guards, handler) =>
    fastify[method](url, { preHandler: guards }, scopedHandler(handler));

  const id = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Invalid id');
    return n;
  };
  const stamp = (req, extra = {}) => ({
    ...req.body,
    ...extra,
    tenant_id: req.user?.tenant_id,
  });

  // ── OVERVIEW / DASHBOARD ─────────────────────────────────────

  route('get', '/overview', [authenticate], async () => ok(await svc.getOverview()));

  // ── ACCOUNTS ─────────────────────────────────────────────────
  // Read: any user (tokens are never returned) | Write: admin only

  route('get', '/accounts', [authenticate], async (req) => ok(await svc.listAccounts(req.query)));
  route('get', '/accounts/:id', [authenticate], async (req) => ok(await svc.getAccountPublic(id(req))));

  route('post', '/accounts', [requireAdmin], async (req, reply) => {
    const data = stamp(req, { managed_by: req.body?.managed_by ?? req.user?.employee_id });
    reply.code(201);
    return created(await svc.createAccount(data));
  });

  route('put', '/accounts/:id', [requireAdmin], async (req) => ok(await svc.updateAccount(id(req), req.body ?? {})));

  route('delete', '/accounts/:id', [requireAdmin], async (req, reply) => {
    await svc.deleteAccount(id(req));
    reply.code(204).send();
  });

  route('post', '/accounts/:id/toggle', [requireAdmin], async (req) => {
    const { is_active } = req.body ?? {};
    return ok(await svc.toggleAccount(id(req), Boolean(is_active)));
  });

  // Body with access_token = manual rotation; empty body = connector refresh.
  route('post', '/accounts/:id/refresh-token', [requireAdmin], async (req) =>
    ok(await svc.refreshAccountToken(id(req), req.body ?? {})));

  // Manual sync of one account — sequential, same path as the scheduler.
  route('post', '/accounts/:id/sync', [authenticate], async (req) => ok(await svc.syncAccount(id(req))));

  // ── OAUTH ────────────────────────────────────────────────────
  // authorize: admin asks for the platform consent URL. callback: the platform
  // (or the simulation connector) sends the browser back with code + signed state.

  route('get', '/oauth/:id/authorize', [requireAdmin], async (req) => {
    const redirectUri = `${apiUrl(req)}/api/social-media/oauth/callback`;
    return ok(await svc.getOAuthAuthorizeUrl(id(req), redirectUri));
  });

  fastify.get('/oauth/callback', async (req, reply) => {
    const { code, state, error } = req.query ?? {};
    const target = `${frontendUrl()}/builder/social-media`;
    if (error) return reply.redirect(`${target}?oauth=error&message=${encodeURIComponent(String(error))}`);
    try {
      const account = await svc.completeOAuth({ code, state });
      return reply.redirect(`${target}?oauth=success&account=${account.id}`);
    } catch (err) {
      return reply.redirect(`${target}?oauth=error&message=${encodeURIComponent(err.message)}`);
    }
  });

  // ── POSTS ────────────────────────────────────────────────────
  // Read: any user | Create/Edit/Publish: manager+ | Delete: admin only

  route('get', '/posts', [authenticate], async (req) => ok(await svc.listPosts(req.query)));
  route('get', '/posts/:id', [authenticate], async (req) => ok(await svc.getPost(id(req))));

  route('post', '/posts', [requireManager], async (req, reply) => {
    const data = stamp(req, { created_by: req.body?.created_by ?? req.user?.employee_id });
    reply.code(201);
    return created(await svc.createPost(data));
  });

  route('put', '/posts/:id', [requireManager], async (req) => ok(await svc.updatePost(id(req), req.body ?? {})));

  route('delete', '/posts/:id', [requireAdmin], async (req, reply) => {
    await svc.deletePost(id(req));
    reply.code(204).send();
  });

  // Publish now (draft / scheduled / failed). Same claim as the scheduler.
  route('post', '/posts/:id/publish', [requireManager], async (req) => ok(await svc.publishPost(id(req))));

  // Run the scheduled-publishing sweep on demand (admin diagnostics).
  route('post', '/posts/publish-due', [requireAdmin], async () => ok(await svc.publishDue()));

  // ── CAMPAIGNS ────────────────────────────────────────────────
  // Read: any user | Create/Edit: manager+ | Delete: admin only

  route('get', '/campaigns', [authenticate], async (req) => ok(await svc.listCampaigns(req.query)));
  route('get', '/campaigns/:id', [authenticate], async (req) => ok(await svc.getCampaign(id(req))));

  route('post', '/campaigns', [requireManager], async (req, reply) => {
    const data = stamp(req, { created_by: req.body?.created_by ?? req.user?.employee_id });
    reply.code(201);
    return created(await svc.createCampaign(data));
  });

  route('put', '/campaigns/:id', [requireManager], async (req) => ok(await svc.updateCampaign(id(req), req.body ?? {})));

  route('delete', '/campaigns/:id', [requireAdmin], async (req, reply) => {
    await svc.deleteCampaign(id(req));
    reply.code(204).send();
  });

  // ── MENTIONS ─────────────────────────────────────────────────
  // Read + Respond + Convert: any user (reps work the inbox)

  route('get', '/mentions', [authenticate], async (req) => {
    const filters = { ...req.query };
    if (filters.assigned_to === 'me') filters.assigned_to = req.user?.employee_id;
    return ok(await svc.listMentions(filters));
  });

  route('put', '/mentions/:id', [authenticate], async (req) =>
    ok(await svc.updateMention(id(req), req.body ?? {}, req.user)));

  route('post', '/mentions/:id/convert-to-lead', [authenticate], async (req, reply) => {
    reply.code(201);
    return created(await svc.convertMentionToLead(id(req), req.user));
  });

  // ── LISTENING KEYWORDS ───────────────────────────────────────
  // Read: any user | Write: admin only

  route('get', '/keywords', [authenticate], async (req) => ok(await svc.listKeywords(req.query)));

  route('post', '/keywords', [requireAdmin], async (req, reply) => {
    const data = stamp(req, { created_by: req.body?.created_by ?? req.user?.employee_id });
    reply.code(201);
    return created(await svc.createKeyword(data));
  });

  route('put', '/keywords/:id', [requireAdmin], async (req) => ok(await svc.updateKeyword(id(req), req.body ?? {})));

  route('delete', '/keywords/:id', [requireAdmin], async (req, reply) => {
    await svc.deleteKeyword(id(req));
    reply.code(204).send();
  });

  // ── ASSIGNMENT RULES ─────────────────────────────────────────
  // Configurable routing for inbound conversations (mentions / DMs).
  // Read: any user | Write: admin only (matches keywords / accounts config).

  route('get', '/assignment-rules', [authenticate], async (req) => ok(await assignSvc.getRules(req.query)));
  route('get', '/assignment-rules/:id', [authenticate], async (req) => ok(await assignSvc.getRule(id(req))));

  route('post', '/assignment-rules', [requireAdmin], async (req, reply) => {
    const data = stamp(req, { created_by: req.body?.created_by ?? req.user?.employee_id });
    reply.code(201);
    return created(await assignSvc.createRule(data));
  });

  route('put', '/assignment-rules/:id', [requireAdmin], async (req) =>
    ok(await assignSvc.updateRule(id(req), req.body ?? {})));

  route('delete', '/assignment-rules/:id', [requireAdmin], async (req, reply) => {
    await assignSvc.deleteRule(id(req));
    reply.code(204).send();
  });

  route('post', '/assignment-rules/reorder', [requireAdmin], async (req) =>
    ok(await assignSvc.reorderRules(req.body?.ordered_ids ?? req.body)));

  // ── CONNECTOR OPERATIONS ─────────────────────────────────────

  // Which platforms use a live connector vs the simulation.
  route('get', '/connector-status', [authenticate], async () => ok(svc.getConnectorStatus()));

  // Sync every account now, ignoring each account's sync_frequency (admin only).
  route('post', '/sync-all', [requireAdmin], async () => ok(await svc.runSyncCycle({ force: true })));
};
