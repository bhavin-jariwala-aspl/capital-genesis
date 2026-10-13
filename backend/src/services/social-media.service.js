'use strict';

const crypto = require('node:crypto');
const config = require('../config');
const { AppError, NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { getConnector, getConnectorStatus, PLATFORMS } = require('../connectors/social');
const { tenantContext } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');
const AssignmentService = require('./assignment.service');
const SocialAssignmentService = require('./social-assignment.service');

/**
 * Social Media Service
 *
 * Manages the tenant's social presence: connected accounts, outbound posts
 * (draft → scheduled → published), campaigns, the inbound mention inbox,
 * listening keywords, and the two background jobs that make the module more
 * than a form over a table:
 *
 *   publishDue()    — every minute: publishes posts whose `scheduled_for` has
 *                     passed, with an atomic claim so multiple pods never
 *                     double-post, and an in-app notification to the author
 *                     when the platform rejects a post.
 *   runSyncCycle()  — every 5 minutes: for each account that is *due* under
 *                     its own `sync_frequency`, refreshes an expiring OAuth
 *                     token, pulls profile metrics, ingests new mentions
 *                     (keyword-matched, deduplicated, routed to the social
 *                     team), refreshes post engagement, and rolls post
 *                     engagement up into active campaigns.
 *
 * Accounts are connected at the tenant level; employees interact through
 * RBAC and never connect their own accounts. Platform APIs are reached through
 * the connector registry (`connectors/social`), which serves
 * `SimulationConnector` until a live connector is registered.
 */

const VALID_ACCOUNT_TYPES  = ['personal', 'business', 'organization'];
const VALID_SYNC_FREQ      = ['hourly', 'daily', 'weekly'];
const VALID_POST_TYPES     = ['post', 'story', 'reel', 'video', 'carousel', 'live'];
const VALID_CAMPAIGN_TYPES = ['brand_awareness', 'lead_generation', 'promotion', 'engagement', 'traffic'];
const VALID_CAMPAIGN_STATUS = ['planning', 'active', 'paused', 'completed', 'cancelled'];
const VALID_KEYWORD_TYPES  = ['brand', 'competitor', 'industry', 'product', 'hashtag'];
const VALID_MATCH_TYPES    = ['exact', 'contains', 'starts_with', 'ends_with'];
const VALID_PRIORITIES     = ['low', 'medium', 'high'];
const VALID_MENTION_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/** Post statuses an author may set directly. Everything else is engine-owned. */
const AUTHOR_POST_STATUSES = ['draft', 'scheduled'];
/** Statuses from which a publish may start. */
const PUBLISHABLE_STATUSES = ['draft', 'scheduled', 'failed'];

/** How often an account is synced, by its `sync_frequency`. */
const SYNC_INTERVAL_MS = {
  hourly: 60 * 60 * 1000,
  daily:  24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};
/** Refresh a token this long before it expires so a sync never starts with a dead one. */
const TOKEN_REFRESH_LEAD_MS = 24 * 60 * 60 * 1000;
/** Signed OAuth `state` values are valid for this long. */
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

const ENGAGEMENT_KEYS = ['likes', 'comments', 'shares', 'views'];

const normaliseHandle = (h) => String(h ?? '').trim().replace(/^@/, '').toLowerCase();
const parseBool = (v) => v === true || v === 'true';
const toDateOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid date: ${v}`);
  return d;
};
const assertOneOf = (value, list, label) => {
  if (!list.includes(value)) {
    throw new ValidationError(`Invalid ${label}: ${value}. Must be one of: ${list.join(', ')}`);
  }
};
const assertPlatforms = (platforms) => {
  if (platforms === undefined) return;
  if (!Array.isArray(platforms)) throw new ValidationError('platforms must be an array');
  for (const p of platforms) assertOneOf(p, PLATFORMS, 'platform');
};

class SocialMediaService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {object} [deps]
   * @param {import('./events.service').DomainEventBus} [deps.eventBus] publishes `social.*` domain events
   * @param {import('./crm.service')} [deps.crmService] used to turn a mention into a CRM lead
   * @param {object} [deps.log] logger with info/warn/error(message, context)
   */
  constructor(prisma, { eventBus = null, crmService = null, log = logger } = {}) {
    this.db = prisma;
    this.eventBus = eventBus;
    this.crm = crmService;
    this.log = log;
    // Reused for its load-balanced selection policy when routing inbound
    // conversations (mentions / DMs / comments) to the social team.
    this.assignmentSvc = new AssignmentService(prisma);
    // Admin-configurable routing rules for inbound conversations; when none
    // are configured, routing falls back to the default managed-by team.
    this.socialAssignmentSvc = new SocialAssignmentService(prisma);
    this._syncInFlight = null;
  }

  // ── Shared helpers ─────────────────────────────────────────────

  /** Fire-and-forget domain event; consumers (workflows, webhooks) subscribe on the bus. */
  #emit(event, payload) {
    this.eventBus?.publish?.(event, payload)?.catch?.(() => {});
  }

  /** Best-effort in-app notification — never fails the caller. */
  async #notify(employeeId, tenantId, { type, title, body, link }) {
    if (!employeeId || !tenantId || !this.db.notification?.create) return;
    try {
      await this.db.notification.create({
        data: { employee_id: employeeId, type, title, body: body ?? null, link: link ?? null, tenant_id: tenantId },
      });
    } catch (err) {
      this.log.warn?.('[social] notification failed', { error: err.message });
    }
  }

  /**
   * OAuth credentials never leave the server. Every account returned to a
   * client passes through here: tokens are replaced by booleans so the UI can
   * still show "connected via OAuth" and the expiry date.
   */
  #publicAccount(account) {
    if (!account) return account;
    const { access_token, refresh_token, ...rest } = account;
    return { ...rest, has_access_token: !!access_token, has_refresh_token: !!refresh_token };
  }

  #engagementTotals(posts) {
    const totals = Object.fromEntries(ENGAGEMENT_KEYS.map((k) => [k, 0]));
    for (const p of posts) {
      const m = p.engagement_metrics;
      if (!m || typeof m !== 'object') continue;
      for (const k of ENGAGEMENT_KEYS) totals[k] += Number(m[k]) || 0;
    }
    return totals;
  }

  // ── ACCOUNTS ────────────────────────────────────────────────

  async listAccounts(filters = {}) {
    const where = {};
    if (!parseBool(filters.include_inactive)) where.is_active = true;
    if (filters.platform) where.platform = filters.platform;
    if (filters.connection_status) where.connection_status = filters.connection_status;

    const rows = await this.db.socialMediaAccount.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { posts: true, mentions: true, campaigns: true } } },
    });
    return rows.map((a) => this.#publicAccount(a));
  }

  /** Internal: full row including tokens. Route handlers use `getAccountPublic`. */
  async getAccount(id) {
    const account = await this.db.socialMediaAccount.findUnique({
      where: { id },
      include: { _count: { select: { posts: true, mentions: true, campaigns: true } } },
    });
    if (!account) throw new NotFoundError('Social media account');
    return account;
  }

  async getAccountPublic(id) {
    return this.#publicAccount(await this.getAccount(id));
  }

  async createAccount(data) {
    if (!data.account_name?.trim()) throw new ValidationError('account_name is required');
    if (!data.account_id?.trim())   throw new ValidationError('account_id is required');
    if (!data.display_name?.trim()) throw new ValidationError('display_name is required');
    assertOneOf(data.platform, PLATFORMS, 'platform');
    assertOneOf(data.account_type, VALID_ACCOUNT_TYPES, 'account_type');
    if (data.sync_frequency !== undefined) assertOneOf(data.sync_frequency, VALID_SYNC_FREQ, 'sync_frequency');

    const account = await this.db.socialMediaAccount.create({
      data: {
        platform:            data.platform,
        account_name:        data.account_name.trim(),
        account_id:          data.account_id.trim(),
        display_name:        data.display_name.trim(),
        profile_url:         data.profile_url || null,
        account_type:        data.account_type,
        verification_status: data.verification_status ?? 'pending',
        connection_status:   data.connection_status ?? 'active',
        access_token:        data.access_token || null,
        refresh_token:       data.refresh_token || null,
        token_expires_at:    toDateOrNull(data.token_expires_at),
        sync_frequency:      data.sync_frequency ?? 'daily',
        auto_monitoring:     data.auto_monitoring ?? true,
        managed_by:          data.managed_by ?? null,
        tenant_id:           data.tenant_id,
      },
    });
    return this.#publicAccount(account);
  }

  async updateAccount(id, data) {
    await this.getAccount(id);

    const update = {};
    const ALLOWED = [
      'account_name', 'display_name', 'profile_url', 'account_type',
      'verification_status', 'connection_status', 'sync_frequency',
      'auto_monitoring', 'managed_by', 'is_active',
    ];
    for (const key of ALLOWED) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    // A blank token in the edit form means "keep the existing one".
    if (data.access_token)  update.access_token  = data.access_token;
    if (data.refresh_token) update.refresh_token = data.refresh_token;
    if (data.token_expires_at !== undefined) update.token_expires_at = toDateOrNull(data.token_expires_at);

    if (update.account_type !== undefined)   assertOneOf(update.account_type, VALID_ACCOUNT_TYPES, 'account_type');
    if (update.sync_frequency !== undefined) assertOneOf(update.sync_frequency, VALID_SYNC_FREQ, 'sync_frequency');

    const account = await this.db.socialMediaAccount.update({ where: { id }, data: update });
    return this.#publicAccount(account);
  }

  async deleteAccount(id) {
    await this.getAccount(id);
    const account = await this.db.socialMediaAccount.update({
      where: { id },
      data: { is_active: false, connection_status: 'disabled' },
    });
    return this.#publicAccount(account);
  }

  async toggleAccount(id, isActive) {
    await this.getAccount(id);
    const account = await this.db.socialMediaAccount.update({
      where: { id },
      data: { is_active: isActive, connection_status: isActive ? 'active' : 'disabled' },
    });
    return this.#publicAccount(account);
  }

  /**
   * Rotate an account's credentials.
   *
   * With a body carrying `access_token` this is a manual rotation (an admin
   * pasted a new token). Without one, the platform connector's
   * `refreshToken()` is called using the stored refresh token — the same path
   * the sync cycle uses automatically when a token is about to expire.
   */
  async refreshAccountToken(id, tokenData = {}) {
    const account = await this.getAccount(id);
    if (tokenData?.access_token) {
      const updated = await this.db.socialMediaAccount.update({
        where: { id },
        data: {
          access_token:      tokenData.access_token,
          refresh_token:     tokenData.refresh_token ?? undefined,
          token_expires_at:  tokenData.token_expires_at !== undefined ? toDateOrNull(tokenData.token_expires_at) : undefined,
          connection_status: 'active',
        },
      });
      return this.#publicAccount(updated);
    }
    if (!account.refresh_token) {
      throw new ValidationError('No refresh token is stored for this account — paste a new access token or re-authorize via OAuth');
    }
    return this.#publicAccount(await this.#refreshToken(account));
  }

  /** Call the connector to refresh; persist; mark expired on failure. */
  async #refreshToken(account) {
    const connector = getConnector(account.platform);
    try {
      const t = await connector.refreshToken(account);
      const expiresAt = t.expires_in
        ? new Date(Date.now() + Number(t.expires_in) * 1000)
        : toDateOrNull(t.token_expires_at);
      const updated = await this.db.socialMediaAccount.update({
        where: { id: account.id },
        data: {
          access_token:      t.access_token,
          refresh_token:     t.refresh_token ?? account.refresh_token,
          token_expires_at:  expiresAt,
          connection_status: 'active',
        },
      });
      this.#emit('social.account.token_refreshed', { account_id: account.id, platform: account.platform, tenant_id: account.tenant_id });
      return updated;
    } catch (err) {
      await this.db.socialMediaAccount.update({
        where: { id: account.id },
        data: { connection_status: 'expired' },
      }).catch(() => {});
      throw new AppError(`Token refresh failed for ${account.display_name}: ${err.message}`, 502, 'TOKEN_REFRESH_FAILED');
    }
  }

  /**
   * Make sure the account's access token will outlive the operation about to
   * run. Returns the (possibly refreshed) account row, or throws with the
   * account marked `expired` when nothing can be done automatically.
   */
  async #ensureFreshToken(account, now = Date.now()) {
    if (!account.token_expires_at) return account;
    const expiresAt = new Date(account.token_expires_at).getTime();
    if (expiresAt - now > TOKEN_REFRESH_LEAD_MS) return account;

    if (account.refresh_token) return this.#refreshToken(account);

    if (expiresAt <= now) {
      await this.db.socialMediaAccount.update({
        where: { id: account.id },
        data: { connection_status: 'expired' },
      }).catch(() => {});
      throw new ConflictError(`Access token for ${account.display_name} has expired and no refresh token is stored — re-authorize the account`);
    }
    // Expiring within the lead window but still valid and nothing to refresh
    // with: proceed, the overview surfaces it under `expiring_tokens`.
    return account;
  }

  // ── OAUTH ───────────────────────────────────────────────────
  // Genesis owns the callback URL; the connector supplies the platform's
  // authorization page. `state` is HMAC-signed so the public callback cannot be
  // pointed at an arbitrary account.

  #signState(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig  = crypto.createHmac('sha256', config.jwt.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** @returns {{ account_id: number, tenant_id: number, exp: number }} */
  verifyOAuthState(state) {
    const [body, sig] = String(state ?? '').split('.');
    if (!body || !sig) throw new ValidationError('Invalid OAuth state');
    const expected = crypto.createHmac('sha256', config.jwt.secret).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ValidationError('Invalid OAuth state');
    let payload;
    try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
    catch { throw new ValidationError('Invalid OAuth state'); }
    if (!payload.exp || payload.exp < Date.now()) throw new ValidationError('OAuth state has expired — start the authorization again');
    return payload;
  }

  /**
   * Build the platform authorization URL for an account.
   * @param {number} accountId
   * @param {string} redirectUri absolute URL of Genesis' `/oauth/callback`
   */
  async getOAuthAuthorizeUrl(accountId, redirectUri) {
    const account = await this.getAccount(accountId);
    const state = this.#signState({ account_id: account.id, tenant_id: account.tenant_id, exp: Date.now() + OAUTH_STATE_TTL_MS });
    const url = getConnector(account.platform).getAuthUrl(account, { redirectUri, state });
    return { url, state, platform: account.platform, connector: getConnector(account.platform).name };
  }

  /**
   * Complete the OAuth round-trip: exchange the code, persist the tokens.
   * Runs inside the tenant context recovered from the signed state, because
   * the callback request itself is unauthenticated.
   */
  async completeOAuth({ code, state }) {
    if (!code) throw new ValidationError('Missing authorization code');
    const { account_id, tenant_id } = this.verifyOAuthState(state);
    return tenantContext.run({ tenantId: tenant_id }, async () => {
      const account = await this.getAccount(Number(account_id));
      const connector = getConnector(account.platform);
      const t = await connector.handleCallback(code, account);
      const updated = await this.db.socialMediaAccount.update({
        where: { id: account.id },
        data: {
          access_token:      t.access_token,
          refresh_token:     t.refresh_token ?? account.refresh_token,
          token_expires_at:  t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000) : toDateOrNull(t.token_expires_at),
          connection_status: 'active',
        },
      });
      this.#emit('social.account.connected', { account_id: account.id, platform: account.platform, tenant_id });
      return this.#publicAccount(updated);
    });
  }

  // ── POSTS ───────────────────────────────────────────────────

  async listPosts(filters = {}) {
    const where = {};
    if (filters.account_id) where.account_id = Number(filters.account_id);
    if (filters.post_type)  where.post_type = filters.post_type;
    if (filters.status)     where.status = filters.status;
    else if (!parseBool(filters.include_deleted)) where.status = { not: 'deleted' };

    // The scheduled queue reads best in publish order; everything else newest first.
    const orderBy = filters.status === 'scheduled'
      ? [{ scheduled_for: 'asc' }]
      : [{ created_at: 'desc' }];

    return this.db.socialMediaPost.findMany({
      where,
      orderBy,
      take: Math.min(Number(filters.limit) || 50, 200),
      include: {
        account: { select: { id: true, platform: true, account_name: true, display_name: true } },
      },
    });
  }

  async getPost(id) {
    const post = await this.db.socialMediaPost.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, platform: true, account_name: true, display_name: true } },
      },
    });
    if (!post) throw new NotFoundError('Social media post');
    return post;
  }

  /**
   * Authors create posts as `draft` or `scheduled`. `published` is never set
   * by hand — it is the outcome of `publishPost`, which is what makes the
   * status trustworthy as "this exists on the platform".
   */
  async createPost(data) {
    if (!data.account_id) throw new ValidationError('account_id is required');
    const account = await this.getAccount(Number(data.account_id));
    if (!account.is_active) throw new ValidationError(`Account ${account.display_name} is disabled`);

    const status = data.status || 'draft';
    assertOneOf(status, AUTHOR_POST_STATUSES, 'status');
    const postType = data.post_type || 'post';
    assertOneOf(postType, VALID_POST_TYPES, 'post_type');
    const scheduledFor = toDateOrNull(data.scheduled_for);
    this.#assertSchedulable(status, scheduledFor, data.content);

    return this.db.socialMediaPost.create({
      data: {
        account_id:       account.id,
        platform_post_id: data.platform_post_id || `draft_${crypto.randomBytes(8).toString('hex')}`,
        post_type:        postType,
        content:          data.content ?? null,
        media_urls:       data.media_urls ?? null,
        hashtags:         data.hashtags ?? null,
        mentions:         data.mentions ?? null,
        status,
        scheduled_for:    scheduledFor,
        created_by:       data.created_by ?? null,
        tenant_id:        data.tenant_id,
      },
    });
  }

  #assertSchedulable(status, scheduledFor, content) {
    if (status === 'scheduled') {
      if (!scheduledFor) throw new ValidationError('A scheduled post needs a "Schedule for" date and time');
      if (!String(content ?? '').trim()) throw new ValidationError('Content is required to schedule a post');
    }
  }

  async updatePost(id, data) {
    const post = await this.getPost(id);

    const update = {};
    const CONTENT_FIELDS   = ['content', 'media_urls', 'hashtags', 'mentions', 'post_type'];
    const PROMOTION_FIELDS = ['is_promoted', 'promotion_budget', 'target_audience'];
    const locked = post.status === 'published' || post.status === 'publishing';

    for (const key of [...CONTENT_FIELDS, ...PROMOTION_FIELDS]) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (data.status !== undefined) update.status = data.status;
    if (data.scheduled_for !== undefined) update.scheduled_for = toDateOrNull(data.scheduled_for);

    if (locked) {
      const touched = Object.keys(update).filter((k) => !PROMOTION_FIELDS.includes(k));
      if (touched.length) {
        throw new ConflictError(`A ${post.status} post cannot be edited (${touched.join(', ')}); only promotion settings may change`);
      }
    } else if (update.status !== undefined) {
      assertOneOf(update.status, AUTHOR_POST_STATUSES, 'status');
    }
    if (update.post_type !== undefined) assertOneOf(update.post_type, VALID_POST_TYPES, 'post_type');

    const nextStatus  = update.status ?? post.status;
    const nextSched   = update.scheduled_for !== undefined ? update.scheduled_for : post.scheduled_for;
    const nextContent = update.content !== undefined ? update.content : post.content;
    if (!locked) this.#assertSchedulable(nextStatus, nextSched, nextContent);

    return this.db.socialMediaPost.update({ where: { id }, data: update });
  }

  /**
   * Soft-delete. A post that is live on the platform is removed there first;
   * if the platform refuses, the CRM row is left untouched so the two never
   * disagree about what the audience can see.
   */
  async deletePost(id) {
    const post = await this.getPost(id);
    if (post.status === 'deleted') return post;
    if (post.status === 'published') {
      const account = await this.getAccount(post.account_id);
      try {
        await getConnector(account.platform).deletePost(account, post.platform_post_id);
      } catch (err) {
        throw new AppError(`Platform refused to delete the post: ${err.message}`, 502, 'PLATFORM_DELETE_FAILED');
      }
    }
    const deleted = await this.db.socialMediaPost.update({ where: { id }, data: { status: 'deleted' } });
    this.#emit('social.post.deleted', { post: deleted, tenant_id: post.tenant_id });
    return deleted;
  }

  /**
   * Publish a post through the platform connector.
   *
   * The status flip to `publishing` is an atomic conditional update: whoever
   * wins it owns the publish, so a manual "Publish now" racing the scheduler
   * (or two pods running the scheduler) can never post twice. Failure marks
   * the post `failed`, notifies its author, and re-throws so a manual caller
   * sees the reason; the author can fix the post and publish again.
   */
  async publishPost(postId) {
    const post = await this.getPost(postId);
    if (!PUBLISHABLE_STATUSES.includes(post.status)) {
      throw new ConflictError(`Post is ${post.status}; only draft, scheduled or failed posts can be published`);
    }
    if (!String(post.content ?? '').trim()) throw new ValidationError('Post has no content to publish');

    const claim = await this.db.socialMediaPost.updateMany({
      where: { id: postId, status: post.status },
      data:  { status: 'publishing' },
    });
    if (claim.count !== 1) throw new ConflictError('Post is already being published');

    let account = null;
    try {
      account = await this.getAccount(post.account_id);
      if (!account.is_active || account.connection_status !== 'active') {
        throw new Error(`account ${account.display_name} is ${account.connection_status}`);
      }
      account = await this.#ensureFreshToken(account);
      const result = await getConnector(account.platform).publish(account, post);

      const published = await this.db.socialMediaPost.update({
        where: { id: postId },
        data: {
          platform_post_id: result.platform_post_id,
          post_url:         result.post_url ?? null,
          published_at:     result.published_at ?? new Date(),
          status:           'published',
        },
      });
      this.#emit('social.post.published', {
        post: published, account_id: post.account_id, platform: account.platform, tenant_id: post.tenant_id,
      });
      return published;
    } catch (err) {
      await this.db.socialMediaPost.update({ where: { id: postId }, data: { status: 'failed' } }).catch(() => {});
      await this.#notify(post.created_by, post.tenant_id, {
        type:  'social',
        title: 'Social post failed to publish',
        body:  `${account?.display_name ?? `Account #${post.account_id}`}: ${err.message}`,
        link:  '/social-media?tab=posts',
      });
      this.#emit('social.post.failed', { post_id: postId, account_id: post.account_id, error: err.message, tenant_id: post.tenant_id });
      if (err instanceof AppError) throw err;
      throw new AppError(`Publish failed: ${err.message}`, 502, 'PUBLISH_FAILED');
    }
  }

  /**
   * Publish every post whose scheduled time has passed. Run by the scheduler
   * every minute; also callable by an admin. Each post runs in its own tenant
   * context and its own try/catch, so one bad post never blocks the queue.
   */
  async publishDue({ now = new Date(), limit = 50 } = {}) {
    const due = await this.db.socialMediaPost.findMany({
      where:   { status: 'scheduled', scheduled_for: { not: null, lte: now } },
      select:  { id: true, tenant_id: true },
      orderBy: { scheduled_for: 'asc' },
      take:    limit,
    });

    const summary = { due: due.length, published: 0, failed: 0, skipped: 0, errors: [] };
    for (const row of due) {
      await tenantContext.run({ tenantId: row.tenant_id }, async () => {
        try {
          await this.publishPost(row.id);
          summary.published += 1;
        } catch (err) {
          if (err instanceof ConflictError) summary.skipped += 1; // claimed by another pod / manual publish
          else {
            summary.failed += 1;
            summary.errors.push({ post_id: row.id, error: err.message });
          }
        }
      });
    }
    if (summary.due) this.log.info?.('[social] publish sweep', summary);
    return summary;
  }

  // ── CAMPAIGNS ───────────────────────────────────────────────

  async listCampaigns(filters = {}) {
    const where = {};
    if (filters.campaign_type) where.campaign_type = filters.campaign_type;
    if (filters.status)        where.status = filters.status;
    else if (!parseBool(filters.include_cancelled)) where.status = { not: 'cancelled' };

    return this.db.socialMediaCampaign.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  async getCampaign(id) {
    const campaign = await this.db.socialMediaCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundError('Social media campaign');
    return campaign;
  }

  async createCampaign(data) {
    if (!data.name?.trim())      throw new ValidationError('Campaign name is required');
    if (!data.objective?.trim()) throw new ValidationError('Campaign objective is required');
    if (!data.start_date)        throw new ValidationError('Start date is required');
    if (!data.end_date)          throw new ValidationError('End date is required');
    const start = toDateOrNull(data.start_date), end = toDateOrNull(data.end_date);
    if (end <= start) throw new ValidationError('End date must be after start date');
    assertOneOf(data.campaign_type, VALID_CAMPAIGN_TYPES, 'campaign_type');
    const status = data.status || 'planning';
    assertOneOf(status, VALID_CAMPAIGN_STATUS, 'status');
    assertPlatforms(data.platforms);

    return this.db.socialMediaCampaign.create({
      data: {
        name:            data.name.trim(),
        description:     data.description ?? null,
        campaign_type:   data.campaign_type,
        objective:       data.objective.trim(),
        target_audience: data.target_audience || {},
        budget_total:    data.budget_total ?? null,
        budget_daily:    data.budget_daily ?? null,
        currency:        data.currency || 'USD',
        start_date:      start,
        end_date:        end,
        platforms:       data.platforms || [],
        content_themes:  data.content_themes ?? null,
        hashtag_strategy: data.hashtag_strategy ?? null,
        posting_schedule: data.posting_schedule ?? null,
        success_metrics: data.success_metrics ?? null,
        status,
        created_by:      data.created_by,
        manager_id:      data.manager_id ?? null,
        tenant_id:       data.tenant_id,
      },
    });
  }

  async updateCampaign(id, data) {
    const campaign = await this.getCampaign(id);
    const update = {};
    const ALLOWED = [
      'name', 'description', 'campaign_type', 'objective', 'target_audience',
      'budget_total', 'budget_daily', 'currency', 'platforms', 'content_themes',
      'hashtag_strategy', 'posting_schedule', 'success_metrics', 'status',
      'performance_summary', 'lessons_learned', 'roi', 'lead_conversion_rate', 'manager_id',
    ];
    for (const key of ALLOWED) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (data.start_date) update.start_date = toDateOrNull(data.start_date);
    if (data.end_date)   update.end_date   = toDateOrNull(data.end_date);
    const start = update.start_date ?? campaign.start_date, end = update.end_date ?? campaign.end_date;
    if (end <= start) throw new ValidationError('End date must be after start date');
    if (update.campaign_type !== undefined) assertOneOf(update.campaign_type, VALID_CAMPAIGN_TYPES, 'campaign_type');
    if (update.status !== undefined)        assertOneOf(update.status, VALID_CAMPAIGN_STATUS, 'status');
    assertPlatforms(update.platforms);

    return this.db.socialMediaCampaign.update({ where: { id }, data: update });
  }

  async deleteCampaign(id) {
    await this.getCampaign(id);
    return this.db.socialMediaCampaign.update({ where: { id }, data: { status: 'cancelled' } });
  }

  /**
   * Roll post engagement up into each active campaign's `performance_summary`:
   * every published post on an account of one of the campaign's platforms,
   * published inside the campaign window. Called at the end of each sync
   * cycle so the Campaigns tab shows live numbers without a schema change.
   */
  async refreshCampaignPerformance({ now = new Date() } = {}) {
    const campaigns = await this.db.socialMediaCampaign.findMany({
      where:  { status: 'active' },
      select: { id: true, tenant_id: true, platforms: true, start_date: true, end_date: true },
    });
    let refreshed = 0;
    for (const c of campaigns) {
      await tenantContext.run({ tenantId: c.tenant_id }, async () => {
        try {
          const platforms = Array.isArray(c.platforms) ? c.platforms : [];
          if (!platforms.length) return;
          const windowEnd = new Date(new Date(c.end_date).getTime() + 24 * 60 * 60 * 1000);
          const posts = await this.db.socialMediaPost.findMany({
            where: {
              status:       'published',
              published_at: { gte: new Date(c.start_date), lt: windowEnd },
              account:      { platform: { in: platforms } },
            },
            select: { engagement_metrics: true },
          });
          const totals = this.#engagementTotals(posts);
          await this.db.socialMediaCampaign.update({
            where: { id: c.id },
            data:  { performance_summary: { posts: posts.length, ...totals, computed_at: now.toISOString() } },
          });
          refreshed += 1;
        } catch (err) {
          this.log.warn?.('[social] campaign performance refresh failed', { campaign_id: c.id, error: err.message });
        }
      });
    }
    return refreshed;
  }

  // ── MENTIONS ────────────────────────────────────────────────

  /**
   * @param {object} filters  platform | sentiment | mention_type | requires_response |
   *                          assigned_to | account_id | open ('true' = awaiting a response) | limit
   */
  async listMentions(filters = {}) {
    const where = {};
    if (filters.platform)     where.platform = filters.platform;
    if (filters.sentiment)    where.sentiment = filters.sentiment;
    if (filters.mention_type) where.mention_type = filters.mention_type;
    if (filters.account_id)   where.account_id = Number(filters.account_id);
    if (filters.assigned_to)  where.assigned_to = filters.assigned_to;
    if (filters.requires_response !== undefined) where.requires_response = parseBool(filters.requires_response);
    if (parseBool(filters.open)) { where.requires_response = true; where.response_sent = false; }

    const mentions = await this.db.socialMediaMention.findMany({
      where,
      orderBy: { mentioned_at: 'desc' },
      take: Math.min(Number(filters.limit) || 50, 200),
      include: { account: { select: { id: true, platform: true, account_name: true } } },
    });
    return this.#attachLeads(mentions);
  }

  /**
   * A mention converted to a lead is linked through the lead's `external_id`
   * (`social:<platform>:<mention id>`), so no social column was needed.
   */
  async #attachLeads(mentions) {
    if (!mentions.length || !this.db.crmLead?.findMany) return mentions;
    const keys = mentions.map((m) => this.#leadKey(m));
    let leads = [];
    try {
      leads = await this.db.crmLead.findMany({
        where:  { external_id: { in: keys } },
        select: { id: true, record_id: true, external_id: true, lead_status: true },
      });
    } catch { return mentions; }
    const byKey = new Map(leads.map((l) => [l.external_id, l]));
    return mentions.map((m) => {
      const lead = byKey.get(this.#leadKey(m));
      return { ...m, lead_id: lead?.id ?? null, lead_record_id: lead?.record_id ?? null, lead_status: lead?.lead_status ?? null };
    });
  }

  #leadKey(mention) {
    return `social:${mention.platform}:${mention.id}`;
  }

  /**
   * Update triage fields and/or send a reply.
   *
   * A reply is delivered through the platform connector *before* the mention
   * is marked responded, so "Responded" in the inbox means the audience saw
   * it. Organic mentions with no linked account are recorded only.
   */
  async updateMention(id, data, actor = null) {
    const mention = await this.db.socialMediaMention.findUnique({ where: { id } });
    if (!mention) throw new NotFoundError('Social media mention');
    const previousAssignee = mention.assigned_to;

    const update = {};
    if (data.assigned_to !== undefined)       update.assigned_to = data.assigned_to || null;
    if (data.requires_response !== undefined) update.requires_response = parseBool(data.requires_response);
    if (data.response_priority !== undefined) {
      assertOneOf(data.response_priority, VALID_MENTION_PRIORITIES, 'response_priority');
      update.response_priority = data.response_priority;
    }

    if (data.response_content !== undefined) {
      const content = String(data.response_content ?? '').trim();
      if (!content) throw new ValidationError('Reply text is required');
      if (mention.response_sent) throw new ConflictError('This mention has already been responded to');

      if (mention.account_id) {
        const account = await this.getAccount(mention.account_id);
        try {
          await this.#ensureFreshToken(account);
          await getConnector(account.platform).sendReply(account, mention.post_url ?? String(mention.id), content);
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(`Reply could not be delivered to ${account.platform}: ${err.message}`, 502, 'REPLY_FAILED');
        }
      }
      update.response_content = content;
      update.response_sent    = true;
      update.response_sent_at = new Date();
      if (!mention.assigned_to && actor?.employee_id) update.assigned_to = actor.employee_id;
    }

    const updated = await this.db.socialMediaMention.update({ where: { id }, data: update });

    if (update.assigned_to && update.assigned_to !== previousAssignee && update.assigned_to !== actor?.employee_id) {
      await this.#notify(update.assigned_to, mention.tenant_id, {
        type: 'mention', title: 'Social mention assigned to you',
        body: `${mention.author_name}: ${String(mention.content).slice(0, 140)}`,
        link: '/social-media?tab=mentions&assigned=me',
      });
    }
    if (update.response_sent) {
      this.#emit('social.mention.responded', { mention: updated, actor_id: actor?.employee_id ?? null, tenant_id: mention.tenant_id });
    }
    return updated;
  }

  /**
   * Turn a mention into a CRM lead (social lead capture). Idempotent per
   * mention via the lead's `external_id`. Must run inside the caller's tenant
   * context because `CrmService.createLead` reads the tenant from it.
   */
  async convertMentionToLead(id, actor = null) {
    if (!this.crm?.createLead) throw new ValidationError('Lead conversion is not available in this deployment');
    const mention = await this.db.socialMediaMention.findUnique({ where: { id } });
    if (!mention) throw new NotFoundError('Social media mention');

    const key = this.#leadKey(mention);
    const existing = await this.db.crmLead.findFirst({ where: { external_id: key }, select: { id: true, record_id: true } });
    if (existing) throw new ConflictError(`This mention is already lead #${existing.id}`);

    const [first, ...rest] = String(mention.author_name || mention.author_handle || 'Social contact').trim().split(/\s+/);
    const ownerId = mention.assigned_to ?? actor?.employee_id ?? null;
    const lead = await this.crm.createLead({
      first_name:  first,
      last_name:   rest.join(' ') || (mention.author_handle ? `@${normaliseHandle(mention.author_handle)}` : ''),
      lead_source: 'social_media',
      lead_status: 'new',
      rating:      mention.sentiment === 'positive' ? 'warm' : null,
      description: [
        `From ${mention.platform} (${mention.mention_type}) on ${new Date(mention.mentioned_at).toISOString()}`,
        mention.author_handle ? `Handle: @${normaliseHandle(mention.author_handle)}` : null,
        mention.post_url ? `Link: ${mention.post_url}` : null,
        '',
        mention.content,
      ].filter((l) => l !== null).join('\n'),
      external_id: key,
    }, ownerId, actor?.employee_id ?? null);

    if (!mention.assigned_to && ownerId) {
      await this.db.socialMediaMention.update({ where: { id }, data: { assigned_to: ownerId } }).catch(() => {});
    }
    this.#emit('social.mention.converted', { mention_id: id, lead_id: lead.id, record_id: lead.record?.id ?? null, tenant_id: mention.tenant_id });
    return { mention_id: id, lead_id: lead.id, record_id: lead.record?.id ?? lead.record_id ?? null };
  }

  // ── LISTENING KEYWORDS ──────────────────────────────────────

  async listKeywords(filters = {}) {
    const where = {};
    if (filters.keyword_type) where.keyword_type = filters.keyword_type;
    if (filters.is_active !== undefined) where.is_active = parseBool(filters.is_active);
    return this.db.socialListeningKeyword.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  #validateKeyword(data, { partial }) {
    if (!partial && !data.keyword?.trim()) throw new ValidationError('Keyword is required');
    if (data.keyword_type !== undefined) assertOneOf(data.keyword_type, VALID_KEYWORD_TYPES, 'keyword_type');
    if (data.match_type !== undefined)   assertOneOf(data.match_type, VALID_MATCH_TYPES, 'match_type');
    if (data.priority !== undefined)     assertOneOf(data.priority, VALID_PRIORITIES, 'priority');
    assertPlatforms(data.platforms);
  }

  async createKeyword(data) {
    this.#validateKeyword(data, { partial: false });
    return this.db.socialListeningKeyword.create({
      data: {
        keyword:              data.keyword.trim(),
        keyword_type:         data.keyword_type || 'brand',
        category:             data.category ?? null,
        match_type:           data.match_type || 'contains',
        platforms:            data.platforms || [],
        is_case_sensitive:    data.is_case_sensitive ?? false,
        exclude_own_mentions: data.exclude_own_mentions ?? true,
        alert_threshold:      data.alert_threshold ?? null,
        priority:             data.priority || 'medium',
        is_active:            data.is_active ?? true,
        created_by:           data.created_by,
        tenant_id:            data.tenant_id,
      },
    });
  }

  async updateKeyword(id, data) {
    const kw = await this.db.socialListeningKeyword.findUnique({ where: { id } });
    if (!kw) throw new NotFoundError('Listening keyword');
    this.#validateKeyword(data, { partial: true });

    const update = {};
    const ALLOWED = [
      'keyword', 'keyword_type', 'category', 'match_type', 'platforms',
      'is_case_sensitive', 'exclude_own_mentions', 'alert_threshold', 'priority', 'is_active',
    ];
    for (const key of ALLOWED) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (update.keyword !== undefined) update.keyword = String(update.keyword).trim();
    return this.db.socialListeningKeyword.update({ where: { id }, data: update });
  }

  async deleteKeyword(id) {
    const kw = await this.db.socialListeningKeyword.findUnique({ where: { id } });
    if (!kw) throw new NotFoundError('Listening keyword');
    return this.db.socialListeningKeyword.delete({ where: { id } });
  }

  /**
   * Which active keywords does this text hit on this platform? A keyword with
   * an empty `platforms` list applies everywhere. Pure; exported for tests.
   */
  static matchKeywords(content, keywords, platform) {
    const text = String(content ?? '');
    const hits = [];
    for (const kw of keywords) {
      if (!kw.is_active) continue;
      const platforms = Array.isArray(kw.platforms) ? kw.platforms : [];
      if (platforms.length && !platforms.includes(platform)) continue;
      const hay = kw.is_case_sensitive ? text : text.toLowerCase();
      const needle = kw.is_case_sensitive ? kw.keyword : String(kw.keyword).toLowerCase();
      if (!needle) continue;
      let matched = false;
      switch (kw.match_type) {
        case 'exact':       matched = hay.trim() === needle.trim(); break;
        case 'starts_with': matched = hay.trimStart().startsWith(needle); break;
        case 'ends_with':   matched = hay.trimEnd().endsWith(needle); break;
        default:            matched = hay.includes(needle);
      }
      if (matched) hits.push(kw);
    }
    return hits;
  }

  // ── DASHBOARD / ANALYTICS ──────────────────────────────────

  async getOverview() {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [accounts, posts, scheduledPosts, failedPosts, mentions, openMentions, campaigns, keywords, expiringTokens] =
      await Promise.all([
        this.db.socialMediaAccount.count({ where: { is_active: true } }),
        this.db.socialMediaPost.count({ where: { status: { not: 'deleted' } } }),
        this.db.socialMediaPost.count({ where: { status: 'scheduled' } }),
        this.db.socialMediaPost.count({ where: { status: 'failed' } }),
        this.db.socialMediaMention.count(),
        this.db.socialMediaMention.count({ where: { requires_response: true, response_sent: false } }),
        this.db.socialMediaCampaign.count({ where: { status: { not: 'cancelled' } } }),
        this.db.socialListeningKeyword.count({ where: { is_active: true } }),
        this.db.socialMediaAccount.count({ where: { is_active: true, token_expires_at: { not: null, lte: soon } } }),
      ]);

    const [accountsByPlatform, mentionsBySentiment, postsByStatus, recentPublished] = await Promise.all([
      this.db.socialMediaAccount.groupBy({ by: ['platform'], where: { is_active: true }, _count: { id: true } }),
      this.db.socialMediaMention.groupBy({ by: ['sentiment'], _count: { id: true } }),
      this.db.socialMediaPost.groupBy({ by: ['status'], where: { status: { not: 'deleted' } }, _count: { id: true } }),
      this.db.socialMediaPost.findMany({
        where:   { status: 'published' },
        select:  { engagement_metrics: true },
        orderBy: { published_at: 'desc' },
        take:    200,
      }),
    ]);

    return {
      totals: {
        accounts, posts, scheduled_posts: scheduledPosts, failed_posts: failedPosts,
        mentions, open_mentions: openMentions, campaigns, keywords, expiring_tokens: expiringTokens,
      },
      accounts_by_platform:  accountsByPlatform,
      mentions_by_sentiment: mentionsBySentiment,
      posts_by_status:       postsByStatus,
      engagement:            { ...this.#engagementTotals(recentPublished), posts_sampled: recentPublished.length },
      connector_status:      getConnectorStatus(),
    };
  }

  // ── CONNECTOR OPERATIONS ───────────────────────────────────

  /**
   * Refresh engagement metrics for the account's most recent published posts.
   */
  async syncPostEngagement(accountId) {
    const account = await this.getAccount(accountId);
    const connector = getConnector(account.platform);

    const posts = await this.db.socialMediaPost.findMany({
      where:   { account_id: accountId, status: 'published' },
      take:    50,
      orderBy: { published_at: 'desc' },
    });

    let synced = 0;
    for (const post of posts) {
      const metrics = await connector.getPostEngagement(account, post.platform_post_id);
      await this.db.socialMediaPost.update({ where: { id: post.id }, data: { engagement_metrics: metrics } });
      synced++;
    }
    return { account_id: accountId, posts_synced: synced };
  }

  /**
   * Pull new mentions from the platform and file them in the inbox.
   *
   * On the way in each mention is: dropped if the account itself authored it,
   * deduplicated on `post_url` when the connector supplies one, matched
   * against the tenant's active listening keywords (a high-priority keyword
   * raises the response priority), flagged for response when negative, routed
   * to the social team, and the assignee notified.
   *
   * @param {number} accountId
   * @param {{ since?: Date }} [opts] default: account.last_sync_at, else 24h ago
   */
  async pullMentions(accountId, { since } = {}) {
    const account = await this.getAccount(accountId);
    if (account.auto_monitoring === false) {
      return { account_id: accountId, mentions_created: 0, mentions_assigned: 0, mentions_skipped: 0, monitoring: 'off' };
    }
    const connector = getConnector(account.platform);
    const from = since ?? account.last_sync_at ?? new Date(Date.now() - 86400000);
    const incoming = await connector.getMentions(account, from);

    const keywords = await this.db.socialListeningKeyword.findMany({
      where: { tenant_id: account.tenant_id, is_active: true },
    });
    const ownHandle = normaliseHandle(account.account_name);

    const createdMentions = [];
    let skipped = 0;
    for (const m of incoming) {
      if (ownHandle && normaliseHandle(m.author_handle) === ownHandle) { skipped++; continue; }
      if (m.post_url) {
        const dup = await this.db.socialMediaMention.findFirst({
          where: { account_id: accountId, post_url: m.post_url }, select: { id: true },
        });
        if (dup) { skipped++; continue; }
      }

      const hits = SocialMediaService.matchKeywords(m.content, keywords, account.platform);
      const sentiment = m.sentiment || 'neutral';
      let priority = m.response_priority || (sentiment === 'negative' ? 'high' : 'medium');
      if (hits.some((k) => k.priority === 'high') && priority !== 'urgent') priority = 'high';

      const rec = await this.db.socialMediaMention.create({
        data: {
          account_id:         accountId,
          platform:           account.platform,
          mention_type:       m.mention_type || (hits.length ? 'keyword' : 'mention'),
          content:            m.content,
          author_name:        m.author_name,
          author_handle:      m.author_handle ?? null,
          author_profile:     m.author_profile ?? null,
          follower_count:     m.follower_count ?? null,
          post_url:           m.post_url ?? null,
          sentiment,
          sentiment_score:    m.sentiment_score ?? null,
          influence_score:    m.influence_score ?? null,
          reach_estimate:     m.reach_estimate ?? null,
          keywords_matched:   hits.length ? hits.map((k) => k.keyword) : null,
          is_verified_author: m.is_verified_author ?? false,
          requires_response:  m.requires_response ?? (sentiment === 'negative'),
          response_priority:  priority,
          mentioned_at:       m.mentioned_at || new Date(),
          tenant_id:          account.tenant_id,
        },
      });
      createdMentions.push(rec);
    }

    // Route inbound conversations that need a human response to the social
    // team — uniformly across every channel. Best-effort: assignment never
    // blocks or fails ingestion.
    const assignments = await this.#assignInboundMentions(account, createdMentions);
    for (const { mention, assignee } of assignments) {
      await this.#notify(assignee, account.tenant_id, {
        type:  'mention',
        title: `New ${account.platform} mention assigned to you`,
        body:  `${mention.author_name}: ${String(mention.content).slice(0, 140)}`,
        link:  '/social-media?tab=mentions&assigned=me',
      });
    }
    if (createdMentions.length) {
      this.#emit('social.mentions.received', {
        account_id: accountId, platform: account.platform, count: createdMentions.length, tenant_id: account.tenant_id,
      });
    }

    return {
      account_id:        accountId,
      mentions_created:  createdMentions.length,
      mentions_assigned: assignments.length,
      mentions_skipped:  skipped,
    };
  }

  /**
   * Auto-assign freshly ingested mentions that require a response.
   *
   * Routing precedence:
   *   1. Admin-configured social assignment rules (fixed / round_robin /
   *      rule_based / load_balanced, scoped per platform). If any active rule
   *      applies to this platform, those rules govern routing exclusively.
   *   2. Otherwise the default: load-balanced across the managed-by social team.
   *
   * Returns `[{ mention, assignee }]` for every mention it assigned. Swallows
   * errors — a routing failure must not abort the sync that already persisted
   * the mentions.
   */
  async #assignInboundMentions(account, createdMentions) {
    try {
      const pending = createdMentions.filter((m) => m.requires_response && !m.assigned_to);
      if (!pending.length) return [];

      const rules = await this.socialAssignmentSvc.activeRulesFor(account.tenant_id, account.platform);
      const assigned = [];

      if (rules.length) {
        const poolUnion = [...new Set(rules.flatMap((r) => (Array.isArray(r.pool_ids) ? r.pool_ids : [])))];
        const load = poolUnion.length ? await this.#inboundLoad(account.tenant_id, poolUnion) : {};
        for (const mention of pending) {
          const assignee = await this.socialAssignmentSvc.route(rules, { mentionData: this.#mentionFields(mention), load });
          if (!assignee) continue;
          await this.db.socialMediaMention.update({ where: { id: mention.id }, data: { assigned_to: assignee } });
          assigned.push({ mention, assignee });
        }
        return assigned;
      }

      const pool = await this.#resolveInboundPool(account);
      if (!pool.length) return [];
      const load = await this.#inboundLoad(account.tenant_id, pool);
      for (const mention of pending) {
        const assignee = this.assignmentSvc.leastLoaded(pool, load);
        if (!assignee) break;
        await this.db.socialMediaMention.update({ where: { id: mention.id }, data: { assigned_to: assignee } });
        load[assignee] = (load[assignee] ?? 0) + 1;
        assigned.push({ mention, assignee });
      }
      return assigned;
    } catch (err) {
      this.log.warn?.('[social] inbound routing failed', { account_id: account.id, error: err.message });
      return [];
    }
  }

  /** Flatten a mention into the field map rule_based conditions evaluate against. */
  #mentionFields(mention) {
    return {
      platform:          mention.platform,
      mention_type:      mention.mention_type,
      sentiment:         mention.sentiment,
      sentiment_score:   mention.sentiment_score,
      response_priority: mention.response_priority,
      follower_count:    mention.follower_count,
      influence_score:   mention.influence_score,
      reach_estimate:    mention.reach_estimate,
      requires_response: mention.requires_response,
      author_handle:     mention.author_handle,
      content:           mention.content,
      keywords_matched:  Array.isArray(mention.keywords_matched) ? mention.keywords_matched.join(',') : '',
    };
  }

  /**
   * The social team: active employees who manage any active social account,
   * always including the manager of the account the mention arrived on.
   */
  async #resolveInboundPool(account) {
    const managers = await this.db.socialMediaAccount.findMany({
      where:  { tenant_id: account.tenant_id, is_active: true, managed_by: { not: null } },
      select: { managed_by: true },
    });
    const ids = new Set(managers.map((a) => a.managed_by).filter(Boolean));
    if (account.managed_by) ids.add(account.managed_by);
    if (ids.size === 0) return [];

    const active = await this.db.employee.findMany({
      where:  { employee_id: { in: [...ids] }, is_active: true },
      select: { employee_id: true },
    });
    return active.map((e) => e.employee_id).sort();
  }

  /** Open-conversation load per employee: mentions awaiting a response. */
  async #inboundLoad(tenantId, pool) {
    if (!pool.length) return {};
    const grouped = await this.db.socialMediaMention.groupBy({
      by:    ['assigned_to'],
      where: { tenant_id: tenantId, assigned_to: { in: pool }, requires_response: true, response_sent: false },
      _count: { id: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.assigned_to, g._count.id]));
  }

  /** Refresh follower/following/post counts from the platform. */
  async syncAccountMetrics(accountId) {
    const account = await this.getAccount(accountId);
    const metrics = await getConnector(account.platform).getProfileMetrics(account);
    const updated = await this.db.socialMediaAccount.update({
      where: { id: accountId },
      data: {
        follower_count:  metrics.follower_count,
        following_count: metrics.following_count,
        post_count:      metrics.post_count,
      },
    });
    return this.#publicAccount(updated);
  }

  /**
   * Full sync of one account, in series: token check → profile metrics →
   * mentions → post engagement → stamp `last_sync_at`. Used by the manual
   * "Sync now" button and, per due account, by `runSyncCycle`.
   *
   * @param {number} accountId
   * @param {{ since?: Date, stamp?: boolean, now?: Date }} [opts]
   */
  async syncAccount(accountId, { since, stamp = true, now = new Date() } = {}) {
    let account = await this.getAccount(accountId);
    account = await this.#ensureFreshToken(account, now.getTime());
    const metrics    = await this.syncAccountMetrics(account.id);
    const mentions   = await this.pullMentions(account.id, { since: since ?? account.last_sync_at ?? undefined });
    const engagement = await this.syncPostEngagement(account.id);
    if (stamp) {
      await this.db.socialMediaAccount.update({ where: { id: account.id }, data: { last_sync_at: new Date() } });
    }
    return { metrics, mentions, engagement };
  }

  /** Is this account due under its own `sync_frequency`? */
  static isSyncDue(account, now = new Date(), toleranceMs = 150_000) {
    if (!account.last_sync_at) return true;
    const interval = SYNC_INTERVAL_MS[account.sync_frequency] ?? SYNC_INTERVAL_MS.daily;
    return now.getTime() - new Date(account.last_sync_at).getTime() >= interval - toleranceMs;
  }

  /**
   * One scheduler tick over every connectable account.
   *
   * An account is synced only when due under its own `sync_frequency`
   * (`force` overrides — the admin's Sync All button). Claiming an account is
   * a conditional update on `last_sync_at`, so two pods ticking together split
   * the work instead of duplicating it. Each account runs inside its own
   * tenant context; a failure marks the account `error` (visible on its card)
   * and never stops the loop. Ends by rolling engagement up into active
   * campaigns.
   */
  async runSyncCycle({ force = false, now = new Date() } = {}) {
    if (this._syncInFlight) return { skipped: true, reason: 'sync already running' };
    this._syncInFlight = this.#runSyncCycleInner({ force, now }).finally(() => { this._syncInFlight = null; });
    return this._syncInFlight;
  }

  async #runSyncCycleInner({ force, now }) {
    const accounts = await this.db.socialMediaAccount.findMany({
      where: { is_active: true, connection_status: { in: ['active', 'expired'] } },
    });

    const results = [];
    let campaignsRefreshed = 0;
    for (const account of accounts) {
      const base = { account_id: account.id, platform: account.platform };
      if (account.connection_status === 'expired' && !account.refresh_token) {
        results.push({ ...base, status: 'skipped', reason: 'token expired — re-authorize' });
        continue;
      }
      if (!force && !SocialMediaService.isSyncDue(account, now)) {
        results.push({ ...base, status: 'skipped', reason: `not due (${account.sync_frequency})` });
        continue;
      }
      const claim = await this.db.socialMediaAccount.updateMany({
        where: { id: account.id, last_sync_at: account.last_sync_at },
        data:  { last_sync_at: now },
      });
      if (claim.count !== 1) {
        results.push({ ...base, status: 'skipped', reason: 'claimed by another worker' });
        continue;
      }

      await tenantContext.run({ tenantId: account.tenant_id }, async () => {
        try {
          const r = await this.syncAccount(account.id, { since: account.last_sync_at ?? undefined, stamp: false, now });
          results.push({
            ...base,
            status:            'ok',
            mentions_created:  r.mentions.mentions_created,
            mentions_assigned: r.mentions.mentions_assigned,
            posts_synced:      r.engagement.posts_synced,
          });
        } catch (err) {
          results.push({ ...base, status: 'error', error: err.message });
          this.log.warn?.('[social] account sync failed', { account_id: account.id, error: err.message });
          // Token problems already set `expired`; anything else is a connector/API error.
          if (!(err instanceof AppError && ['TOKEN_REFRESH_FAILED', 'CONFLICT_ERROR'].includes(err.code))) {
            await this.db.socialMediaAccount.update({ where: { id: account.id }, data: { connection_status: 'error' } }).catch(() => {});
          }
        }
      });
    }

    try {
      campaignsRefreshed = await this.refreshCampaignPerformance({ now });
    } catch (err) {
      this.log.warn?.('[social] campaign roll-up failed', { error: err.message });
    }

    const synced = results.filter((r) => r.status === 'ok').length;
    return { ran_at: now.toISOString(), accounts: results.length, synced, campaigns_refreshed: campaignsRefreshed, results };
  }

  /** Get connector status for all platforms. */
  getConnectorStatus() {
    return getConnectorStatus();
  }
}

SocialMediaService.SYNC_INTERVAL_MS = SYNC_INTERVAL_MS;
SocialMediaService.PUBLISHABLE_STATUSES = PUBLISHABLE_STATUSES;

module.exports = SocialMediaService;
