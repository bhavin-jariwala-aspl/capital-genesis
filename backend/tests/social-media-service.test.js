'use strict';

/**
 * SocialMediaService — unit tests (all DB and connector calls mocked).
 *
 * Covers the behaviour that turned the module from a form over a table into
 * an engine: post lifecycle validation, the atomic publish claim, the
 * scheduled-publishing sweep, per-account sync frequency + claim, token
 * refresh/expiry, replying through the connector, keyword matching and
 * inbox routing on ingest, mention → lead conversion, and the signed OAuth
 * state.
 */

jest.mock('@prisma/client');

// The connector double lives inside the mock factory (jest forbids the factory
// from closing over test-file variables) and is re-exported for assertions.
jest.mock('../src/connectors/social', () => {
  const fake = {
    name: 'fake',
    getAuthUrl:        jest.fn((_a, { redirectUri, state }) => `${redirectUri}?code=c1&state=${state}`),
    handleCallback:    jest.fn().mockResolvedValue({ access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 }),
    refreshToken:      jest.fn().mockResolvedValue({ access_token: 'at-fresh', expires_in: 7200 }),
    publish:           jest.fn().mockResolvedValue({ platform_post_id: 'p_1', post_url: 'https://x/p_1', published_at: new Date('2026-09-01T10:00:00Z') }),
    deletePost:        jest.fn().mockResolvedValue({ deleted: true }),
    getPostEngagement: jest.fn().mockResolvedValue({ likes: 5, comments: 1, shares: 0, views: 40 }),
    getMentions:       jest.fn().mockResolvedValue([]),
    sendReply:         jest.fn().mockResolvedValue({ reply_id: 'r1', sent_at: new Date() }),
    getProfileMetrics: jest.fn().mockResolvedValue({ follower_count: 10, following_count: 2, post_count: 3 }),
  };
  return {
    PLATFORMS: ['facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'youtube', 'tiktok'],
    getConnector: () => fake,
    getConnectorStatus: () => ({ facebook: { connector: 'fake', mode: 'simulation' } }),
    _connector: fake,
  };
});

const { _connector: connector } = require('../src/connectors/social');
const SocialMediaService = require('../src/services/social-media.service');
const { AppError, ValidationError, ConflictError } = require('../src/utils/errors');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-05T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000);
const hoursAhead = (h) => new Date(NOW.getTime() + h * 3600 * 1000);

const account = (over = {}) => ({
  id: 1, tenant_id: 7, platform: 'facebook', account_name: '@acme', display_name: 'Acme',
  is_active: true, connection_status: 'active', auto_monitoring: true, sync_frequency: 'daily',
  last_sync_at: hoursAgo(1), access_token: 'at', refresh_token: null, token_expires_at: null,
  managed_by: 'E1', follower_count: 0, following_count: 0, post_count: 0, ...over,
});

const post = (over = {}) => ({
  id: 10, tenant_id: 7, account_id: 1, status: 'draft', content: 'Hello world', post_type: 'post',
  platform_post_id: 'draft_abc', scheduled_for: null, published_at: null, created_by: 'E9',
  engagement_metrics: null, ...over,
});

const mention = (over = {}) => ({
  id: 100, tenant_id: 7, account_id: 1, platform: 'facebook', mention_type: 'comment',
  content: 'Is Acme any good?', author_name: 'Jane Roe', author_handle: 'janeroe', post_url: null,
  sentiment: 'neutral', requires_response: true, response_sent: false, assigned_to: null,
  mentioned_at: hoursAgo(2), keywords_matched: null, ...over,
});

function makePrisma(seed = {}) {
  const accounts  = seed.accounts  ?? [account()];
  const posts     = seed.posts     ?? [];
  const mentions  = seed.mentions  ?? [];
  const keywords  = seed.keywords  ?? [];
  const campaigns = seed.campaigns ?? [];
  const leads     = seed.leads     ?? [];
  let nextId = 1000;

  const byId = (rows) => jest.fn(async ({ where }) => rows.find((r) => r.id === where.id) ?? null);
  const updateInto = (rows) => jest.fn(async ({ where, data }) => {
    const row = rows.find((r) => r.id === where.id);
    if (row) Object.assign(row, data);
    return { ...(row ?? { id: where.id }), ...data };
  });

  const db = {
    _rows: { accounts, posts, mentions, keywords, campaigns, leads },
    socialMediaAccount: {
      findMany:   jest.fn(async () => accounts),
      findUnique: byId(accounts),
      update:     updateInto(accounts),
      updateMany: jest.fn(async ({ where }) => {
        const row = accounts.find((r) => r.id === where.id);
        if (!row) return { count: 0 };
        const expect_ = where.last_sync_at;
        const same = (expect_ == null && row.last_sync_at == null)
          || (expect_ instanceof Date && row.last_sync_at instanceof Date && expect_.getTime() === row.last_sync_at.getTime());
        if (!same) return { count: 0 };
        return { count: 1 };
      }),
      create:     jest.fn(async ({ data }) => ({ id: ++nextId, ...data })),
      count:      jest.fn(async () => accounts.length),
      groupBy:    jest.fn(async () => []),
    },
    socialMediaPost: {
      findMany:   jest.fn(async ({ where } = {}) => posts.filter((p) => !where?.status || (typeof where.status === 'string' ? p.status === where.status : true))),
      findUnique: byId(posts),
      create:     jest.fn(async ({ data }) => { const r = { id: ++nextId, ...data }; posts.push(r); return r; }),
      update:     updateInto(posts),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = posts.find((r) => r.id === where.id && r.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      count:      jest.fn(async () => posts.length),
      groupBy:    jest.fn(async () => []),
    },
    socialMediaMention: {
      findMany:   jest.fn(async () => mentions),
      findUnique: byId(mentions),
      findFirst:  jest.fn(async ({ where }) => mentions.find((m) => m.account_id === where.account_id && m.post_url === where.post_url) ?? null),
      create:     jest.fn(async ({ data }) => { const r = { id: ++nextId, ...data }; mentions.push(r); return r; }),
      update:     updateInto(mentions),
      groupBy:    jest.fn(async () => []),
      count:      jest.fn(async () => mentions.length),
    },
    socialMediaCampaign: {
      findMany:   jest.fn(async () => campaigns),
      findUnique: byId(campaigns),
      update:     updateInto(campaigns),
      count:      jest.fn(async () => campaigns.length),
    },
    socialListeningKeyword: {
      findMany: jest.fn(async () => keywords),
      count:    jest.fn(async () => keywords.length),
    },
    socialAssignmentRule: { findMany: jest.fn(async () => []), update: jest.fn() },
    employee:     { findMany: jest.fn(async () => [{ employee_id: 'E1' }]) },
    notification: { create: jest.fn(async ({ data }) => ({ id: ++nextId, ...data })) },
    crmLead: {
      findMany:  jest.fn(async () => leads),
      findFirst: jest.fn(async ({ where }) => leads.find((l) => l.external_id === where.external_id) ?? null),
    },
  };
  db.$transaction = jest.fn((fn) => (typeof fn === 'function' ? fn(db) : Promise.all(fn)));
  return db;
}

function makeSvc(db, extra = {}) {
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
  const svc = new SocialMediaService(db, { eventBus, log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, ...extra });
  return { svc, eventBus };
}

beforeEach(() => {
  for (const fn of Object.values(connector)) if (typeof fn?.mockClear === 'function') fn.mockClear();
});

// ── Accounts ─────────────────────────────────────────────────────────────────

describe('accounts', () => {
  it('never returns OAuth tokens and only counts relations that exist', async () => {
    const db = makePrisma({ accounts: [account({ access_token: 'secret', refresh_token: 'r' })] });
    const { svc } = makeSvc(db);
    const [a] = await svc.listAccounts();
    expect(a.access_token).toBeUndefined();
    expect(a.refresh_token).toBeUndefined();
    expect(a.has_access_token).toBe(true);
    expect(a.has_refresh_token).toBe(true);

    // `engagements` was dropped from the schema in July 2026; asking Prisma to
    // count it made every account/post/campaign list 500.
    const include = db.socialMediaAccount.findMany.mock.calls[0][0].include;
    expect(Object.keys(include._count.select).sort()).toEqual(['campaigns', 'mentions', 'posts']);
  });

  it('validates platform, account type and sync frequency on create', async () => {
    const { svc } = makeSvc(makePrisma());
    const base = { account_name: 'a', account_id: '1', display_name: 'A', account_type: 'business', tenant_id: 7 };
    await expect(svc.createAccount({ ...base, platform: 'myspace' })).rejects.toThrow(/Invalid platform/);
    await expect(svc.createAccount({ ...base, platform: 'facebook', account_type: 'bot' })).rejects.toThrow(/account_type/);
    await expect(svc.createAccount({ ...base, platform: 'facebook', sync_frequency: 'minutely' })).rejects.toThrow(/sync_frequency/);
    const created = await svc.createAccount({ ...base, platform: 'facebook', access_token: 'tok' });
    expect(created.has_access_token).toBe(true);
    expect(created.access_token).toBeUndefined();
  });

  it('refreshes through the connector when no manual token is supplied', async () => {
    const db = makePrisma({ accounts: [account({ refresh_token: 'rt' })] });
    const { svc } = makeSvc(db);
    const a = await svc.refreshAccountToken(1, {});
    expect(connector.refreshToken).toHaveBeenCalledTimes(1);
    expect(a.has_access_token).toBe(true);
    expect(db._rows.accounts[0].access_token).toBe('at-fresh');
    expect(db._rows.accounts[0].token_expires_at).toBeInstanceOf(Date);
  });

  it('refuses a connector refresh when no refresh token is stored', async () => {
    const { svc } = makeSvc(makePrisma());
    await expect(svc.refreshAccountToken(1, {})).rejects.toThrow(ValidationError);
  });
});

// ── Posts: lifecycle validation ──────────────────────────────────────────────

describe('createPost / updatePost', () => {
  it('lets authors set only draft or scheduled — published is engine-owned', async () => {
    const { svc } = makeSvc(makePrisma());
    await expect(svc.createPost({ account_id: 1, status: 'published', content: 'x', tenant_id: 7 }))
      .rejects.toThrow(/Invalid status/);
  });

  it('requires a date and content to schedule', async () => {
    const { svc } = makeSvc(makePrisma());
    await expect(svc.createPost({ account_id: 1, status: 'scheduled', content: 'x', tenant_id: 7 }))
      .rejects.toThrow(/Schedule for/);
    await expect(svc.createPost({ account_id: 1, status: 'scheduled', scheduled_for: '2026-10-01T10:00:00Z', tenant_id: 7 }))
      .rejects.toThrow(/Content is required/);
    const p = await svc.createPost({ account_id: 1, status: 'scheduled', content: 'x', scheduled_for: '2026-10-01T10:00:00Z', tenant_id: 7 });
    expect(p.scheduled_for).toBeInstanceOf(Date);
    expect(p.platform_post_id).toMatch(/^draft_[0-9a-f]{16}$/);
  });

  it('rejects posting to a disabled account', async () => {
    const { svc } = makeSvc(makePrisma({ accounts: [account({ is_active: false })] }));
    await expect(svc.createPost({ account_id: 1, content: 'x', tenant_id: 7 })).rejects.toThrow(/disabled/);
  });

  it('locks content on a published post but still allows promotion settings', async () => {
    const db = makePrisma({ posts: [post({ status: 'published' })] });
    const { svc } = makeSvc(db);
    await expect(svc.updatePost(10, { content: 'edited' })).rejects.toThrow(ConflictError);
    await expect(svc.updatePost(10, { status: 'draft' })).rejects.toThrow(ConflictError);
    await expect(svc.updatePost(10, { is_promoted: true, promotion_budget: 50 })).resolves.toBeTruthy();
  });

  it('normalises an empty scheduled_for to null and re-validates the schedule', async () => {
    const db = makePrisma({ posts: [post({ status: 'scheduled', scheduled_for: hoursAhead(1) })] });
    const { svc } = makeSvc(db);
    await expect(svc.updatePost(10, { scheduled_for: '' })).rejects.toThrow(/Schedule for/);
    const p = await svc.updatePost(10, { status: 'draft', scheduled_for: '' });
    expect(p.scheduled_for).toBeNull();
  });
});

// ── Posts: publishing ────────────────────────────────────────────────────────

describe('publishPost', () => {
  it('claims the row, publishes, records the platform result and emits an event', async () => {
    const db = makePrisma({ posts: [post()] });
    const { svc, eventBus } = makeSvc(db);
    const out = await svc.publishPost(10);
    expect(db.socialMediaPost.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10, status: 'draft' }, data: { status: 'publishing' },
    }));
    expect(connector.publish).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('published');
    expect(out.platform_post_id).toBe('p_1');
    expect(eventBus.publish).toHaveBeenCalledWith('social.post.published', expect.objectContaining({ tenant_id: 7 }));
  });

  it('refuses when another worker already claimed the post', async () => {
    const db = makePrisma({ posts: [post({ status: 'scheduled', scheduled_for: hoursAgo(1) })] });
    db.socialMediaPost.updateMany.mockResolvedValueOnce({ count: 0 });
    const { svc } = makeSvc(db);
    await expect(svc.publishPost(10)).rejects.toThrow(ConflictError);
    expect(connector.publish).not.toHaveBeenCalled();
  });

  it('refuses published or deleted posts and empty content', async () => {
    const { svc } = makeSvc(makePrisma({ posts: [post({ id: 10, status: 'published' }), post({ id: 11, content: '   ' })] }));
    await expect(svc.publishPost(10)).rejects.toThrow(/only draft, scheduled or failed/);
    await expect(svc.publishPost(11)).rejects.toThrow(/no content/);
  });

  it('marks the post failed, notifies the author and surfaces a 502 when the platform rejects it', async () => {
    connector.publish.mockRejectedValueOnce(new Error('rate limited'));
    const db = makePrisma({ posts: [post()] });
    const { svc, eventBus } = makeSvc(db);
    const err = await svc.publishPost(10).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
    expect(db._rows.posts[0].status).toBe('failed');
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employee_id: 'E9', tenant_id: 7, type: 'social' }),
    }));
    expect(eventBus.publish).toHaveBeenCalledWith('social.post.failed', expect.anything());
  });

  it('fails a post whose account is disabled instead of calling the platform', async () => {
    const db = makePrisma({ accounts: [account({ connection_status: 'disabled' })], posts: [post()] });
    const { svc } = makeSvc(db);
    await expect(svc.publishPost(10)).rejects.toThrow(/disabled/);
    expect(connector.publish).not.toHaveBeenCalled();
    expect(db._rows.posts[0].status).toBe('failed');
  });

  it('a failed post can be published again', async () => {
    const db = makePrisma({ posts: [post({ status: 'failed' })] });
    const { svc } = makeSvc(db);
    await expect(svc.publishPost(10)).resolves.toMatchObject({ status: 'published' });
  });
});

describe('publishDue (scheduled publishing sweep)', () => {
  it('publishes only posts whose scheduled time has passed and reports counts', async () => {
    connector.publish.mockRejectedValueOnce(new Error('boom'));
    const db = makePrisma({ posts: [
      post({ id: 1, status: 'scheduled', scheduled_for: hoursAgo(1) }),
      post({ id: 2, status: 'scheduled', scheduled_for: hoursAgo(2) }),
    ] });
    // The sweep's own query: hand back the two due rows.
    db.socialMediaPost.findMany.mockResolvedValueOnce([{ id: 1, tenant_id: 7 }, { id: 2, tenant_id: 7 }]);
    const { svc } = makeSvc(db);
    const spy = jest.spyOn(svc, 'publishPost');
    const summary = await svc.publishDue({ now: NOW });
    expect(db.socialMediaPost.findMany.mock.calls[0][0].where).toEqual({
      status: 'scheduled', scheduled_for: { not: null, lte: NOW },
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ due: 2, published: 1, failed: 1, skipped: 0 });
    expect(summary.errors[0]).toMatchObject({ post_id: 1, error: expect.stringContaining('boom') });
  });

  it('counts a lost claim as skipped, not failed', async () => {
    const db = makePrisma({ posts: [post({ id: 1, status: 'scheduled', scheduled_for: hoursAgo(1) })] });
    db.socialMediaPost.findMany.mockResolvedValueOnce([{ id: 1, tenant_id: 7 }]);
    db.socialMediaPost.updateMany.mockResolvedValueOnce({ count: 0 });
    const { svc } = makeSvc(db);
    expect(await svc.publishDue({ now: NOW })).toMatchObject({ due: 1, published: 0, failed: 0, skipped: 1 });
  });
});

describe('deletePost', () => {
  it('removes a live post from the platform before soft-deleting it', async () => {
    const db = makePrisma({ posts: [post({ status: 'published', platform_post_id: 'p_1' })] });
    const { svc } = makeSvc(db);
    await svc.deletePost(10);
    expect(connector.deletePost).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'p_1');
    expect(db._rows.posts[0].status).toBe('deleted');
  });

  it('leaves the CRM row untouched when the platform refuses', async () => {
    connector.deletePost.mockRejectedValueOnce(new Error('gone'));
    const db = makePrisma({ posts: [post({ status: 'published' })] });
    const { svc } = makeSvc(db);
    await expect(svc.deletePost(10)).rejects.toMatchObject({ statusCode: 502 });
    expect(db._rows.posts[0].status).toBe('published');
  });

  it('does not call the platform for drafts', async () => {
    const db = makePrisma({ posts: [post()] });
    const { svc } = makeSvc(db);
    await svc.deletePost(10);
    expect(connector.deletePost).not.toHaveBeenCalled();
  });
});

// ── Sync cycle ───────────────────────────────────────────────────────────────

describe('isSyncDue', () => {
  it('honours the account sync_frequency', () => {
    expect(SocialMediaService.isSyncDue(account({ sync_frequency: 'daily',  last_sync_at: hoursAgo(1) }), NOW)).toBe(false);
    expect(SocialMediaService.isSyncDue(account({ sync_frequency: 'daily',  last_sync_at: hoursAgo(25) }), NOW)).toBe(true);
    expect(SocialMediaService.isSyncDue(account({ sync_frequency: 'hourly', last_sync_at: hoursAgo(1) }), NOW)).toBe(true);
    expect(SocialMediaService.isSyncDue(account({ sync_frequency: 'weekly', last_sync_at: hoursAgo(100) }), NOW)).toBe(false);
    expect(SocialMediaService.isSyncDue(account({ last_sync_at: null }), NOW)).toBe(true);
  });
});

describe('runSyncCycle', () => {
  it('syncs only due accounts, claims each one, and forces all when asked', async () => {
    const db = makePrisma({ accounts: [
      account({ id: 1, sync_frequency: 'daily',  last_sync_at: hoursAgo(1) }),   // not due
      account({ id: 2, sync_frequency: 'hourly', last_sync_at: hoursAgo(2) }),   // due
    ] });
    const { svc } = makeSvc(db);
    let r = await svc.runSyncCycle({ now: NOW });
    expect(r.results.map((x) => x.status)).toEqual(['skipped', 'ok']);
    expect(r.synced).toBe(1);
    expect(connector.getProfileMetrics).toHaveBeenCalledTimes(1);
    expect(connector.getMentions).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), hoursAgo(2));
    // Claim stamps last_sync_at up front so a second pod finds nothing to take.
    expect(db.socialMediaAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 2, last_sync_at: hoursAgo(2) }, data: { last_sync_at: NOW },
    }));

    r = await svc.runSyncCycle({ force: true, now: NOW });
    expect(r.synced).toBe(2);
  });

  it('skips an account another worker claimed first', async () => {
    const db = makePrisma({ accounts: [account({ sync_frequency: 'hourly', last_sync_at: hoursAgo(5) })] });
    db.socialMediaAccount.updateMany.mockResolvedValueOnce({ count: 0 });
    const { svc } = makeSvc(db);
    const r = await svc.runSyncCycle({ now: NOW });
    expect(r.results[0]).toMatchObject({ status: 'skipped', reason: expect.stringContaining('claimed') });
    expect(connector.getProfileMetrics).not.toHaveBeenCalled();
  });

  it('marks an account "error" when its connector fails, and keeps going', async () => {
    connector.getProfileMetrics.mockRejectedValueOnce(new Error('api down'));
    const db = makePrisma({ accounts: [
      account({ id: 1, last_sync_at: null }),
      account({ id: 2, last_sync_at: null }),
    ] });
    const { svc } = makeSvc(db);
    const r = await svc.runSyncCycle({ now: NOW });
    expect(r.results[0]).toMatchObject({ status: 'error', error: 'api down' });
    expect(r.results[1].status).toBe('ok');
    expect(db._rows.accounts[0].connection_status).toBe('error');
  });

  it('refreshes a token that is about to expire before syncing', async () => {
    const db = makePrisma({ accounts: [account({ last_sync_at: null, refresh_token: 'rt', token_expires_at: hoursAhead(2) })] });
    const { svc } = makeSvc(db);
    await svc.runSyncCycle({ now: NOW });
    expect(connector.refreshToken).toHaveBeenCalledTimes(1);
    expect(db._rows.accounts[0].access_token).toBe('at-fresh');
  });

  it('marks an expired account without a refresh token "expired" and skips it next time', async () => {
    const db = makePrisma({ accounts: [account({ last_sync_at: null, token_expires_at: hoursAgo(1) })] });
    const { svc } = makeSvc(db);
    let r = await svc.runSyncCycle({ now: NOW });
    expect(r.results[0].status).toBe('error');
    expect(db._rows.accounts[0].connection_status).toBe('expired');
    expect(connector.getProfileMetrics).not.toHaveBeenCalled();

    r = await svc.runSyncCycle({ force: true, now: NOW });
    expect(r.results[0]).toMatchObject({ status: 'skipped', reason: expect.stringContaining('re-authorize') });
  });

  it('does not run two cycles at once', async () => {
    const db = makePrisma({ accounts: [] });
    const { svc } = makeSvc(db);
    const [a, b] = await Promise.all([svc.runSyncCycle({ now: NOW }), svc.runSyncCycle({ now: NOW })]);
    expect(a.accounts).toBe(0);
    expect(b).toEqual({ skipped: true, reason: 'sync already running' });
  });

  it('rolls engagement up into active campaigns at the end of the cycle', async () => {
    const db = makePrisma({
      accounts: [],
      campaigns: [{ id: 5, tenant_id: 7, status: 'active', platforms: ['facebook'], start_date: hoursAgo(48), end_date: hoursAhead(48) }],
    });
    db.socialMediaPost.findMany.mockResolvedValueOnce([
      { engagement_metrics: { likes: 3, comments: 1, shares: 0, views: 20 } },
      { engagement_metrics: { likes: 2, comments: 0, shares: 1, views: 10 } },
      { engagement_metrics: null },
    ]);
    const { svc } = makeSvc(db);
    const r = await svc.runSyncCycle({ now: NOW });
    expect(r.campaigns_refreshed).toBe(1);
    expect(db._rows.campaigns[0].performance_summary).toMatchObject({ posts: 3, likes: 5, comments: 1, shares: 1, views: 30 });
  });
});

// ── Mentions: ingest ─────────────────────────────────────────────────────────

describe('matchKeywords', () => {
  const kws = [
    { keyword: 'Acme', match_type: 'contains', is_active: true, platforms: [], is_case_sensitive: false, priority: 'high' },
    { keyword: '#launch', match_type: 'contains', is_active: true, platforms: ['twitter'], priority: 'low' },
    { keyword: 'help', match_type: 'starts_with', is_active: true, platforms: [], priority: 'medium' },
    { keyword: 'old', match_type: 'contains', is_active: false, platforms: [] },
    { keyword: 'Exact', match_type: 'exact', is_active: true, platforms: [], is_case_sensitive: true },
  ];
  it('applies match type, platform scope, case sensitivity and active flag', () => {
    const names = (c, p) => SocialMediaService.matchKeywords(c, kws, p).map((k) => k.keyword);
    expect(names('love acme!', 'facebook')).toEqual(['Acme']);
    expect(names('#launch day', 'facebook')).toEqual([]);
    expect(names('#launch day', 'twitter')).toEqual(['#launch']);
    expect(names('help me', 'facebook')).toEqual(['help']);
    expect(names('need help', 'facebook')).toEqual([]);
    expect(names('old stuff', 'facebook')).toEqual([]);
    expect(names('Exact', 'facebook')).toEqual(['Exact']);
    expect(names('exact', 'facebook')).toEqual([]);
  });
});

describe('pullMentions', () => {
  it('skips the account\'s own posts, dedupes on post_url, tags keywords and raises priority', async () => {
    connector.getMentions.mockResolvedValueOnce([
      { content: 'we love it', author_name: 'Acme', author_handle: '@acme' },                        // own → skipped
      { content: 'seen before', author_name: 'A', post_url: 'https://fb/1' },                        // dup → skipped
      { content: 'Is Acme worth it?', author_name: 'B', sentiment: 'neutral', requires_response: false },
      { content: 'terrible service', author_name: 'C', sentiment: 'negative' },
    ]);
    const db = makePrisma({
      mentions: [mention({ id: 1, post_url: 'https://fb/1' })],
      keywords: [{ keyword: 'acme', match_type: 'contains', is_active: true, platforms: [], priority: 'high' }],
      accounts: [account({ managed_by: null })],
    });
    const { svc } = makeSvc(db);
    const r = await svc.pullMentions(1, { since: hoursAgo(3) });
    expect(r).toMatchObject({ mentions_created: 2, mentions_skipped: 2 });

    const created = db.socialMediaMention.create.mock.calls.map((c) => c[0].data);
    expect(created[0]).toMatchObject({ keywords_matched: ['acme'], response_priority: 'high', mention_type: 'keyword', requires_response: false });
    // Negative sentiment → needs a response, high priority, even with no keyword hit.
    expect(created[1]).toMatchObject({ keywords_matched: null, response_priority: 'high', requires_response: true, sentiment: 'negative' });
  });

  it('pulls nothing when auto-monitoring is off for the account', async () => {
    const db = makePrisma({ accounts: [account({ auto_monitoring: false })] });
    const { svc } = makeSvc(db);
    const r = await svc.pullMentions(1);
    expect(r).toMatchObject({ mentions_created: 0, monitoring: 'off' });
    expect(connector.getMentions).not.toHaveBeenCalled();
  });

  it('notifies the employee a mention is routed to', async () => {
    connector.getMentions.mockResolvedValueOnce([{ content: 'hi', author_name: 'Z', requires_response: true }]);
    const db = makePrisma({ accounts: [account({ managed_by: 'E1' })] });
    const { svc } = makeSvc(db);
    const r = await svc.pullMentions(1, { since: hoursAgo(1) });
    expect(r.mentions_assigned).toBe(1);
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ employee_id: 'E1', type: 'mention' }),
    }));
  });
});

// ── Mentions: inbox actions ──────────────────────────────────────────────────

describe('updateMention', () => {
  it('delivers the reply through the connector before marking it responded', async () => {
    const db = makePrisma({ mentions: [mention({ post_url: 'https://fb/c/9' })] });
    const { svc, eventBus } = makeSvc(db);
    const out = await svc.updateMention(100, { response_content: 'Thanks Jane!' }, { employee_id: 'E5' });
    expect(connector.sendReply).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'https://fb/c/9', 'Thanks Jane!');
    expect(out).toMatchObject({ response_sent: true, response_content: 'Thanks Jane!', assigned_to: 'E5' });
    expect(eventBus.publish).toHaveBeenCalledWith('social.mention.responded', expect.anything());
  });

  it('does not mark responded when the platform rejects the reply', async () => {
    connector.sendReply.mockRejectedValueOnce(new Error('403'));
    const db = makePrisma({ mentions: [mention()] });
    const { svc } = makeSvc(db);
    await expect(svc.updateMention(100, { response_content: 'x' })).rejects.toMatchObject({ statusCode: 502 });
    expect(db.socialMediaMention.update).not.toHaveBeenCalled();
  });

  it('rejects empty replies and double replies', async () => {
    const db = makePrisma({ mentions: [mention({ id: 100 }), mention({ id: 101, response_sent: true })] });
    const { svc } = makeSvc(db);
    await expect(svc.updateMention(100, { response_content: '  ' })).rejects.toThrow(ValidationError);
    await expect(svc.updateMention(101, { response_content: 'again' })).rejects.toThrow(ConflictError);
  });

  it('records a reply to an organic mention (no account) without a connector call', async () => {
    const db = makePrisma({ mentions: [mention({ account_id: null })] });
    const { svc } = makeSvc(db);
    await svc.updateMention(100, { response_content: 'noted' });
    expect(connector.sendReply).not.toHaveBeenCalled();
  });

  it('notifies a newly assigned employee', async () => {
    const db = makePrisma({ mentions: [mention()] });
    const { svc } = makeSvc(db);
    await svc.updateMention(100, { assigned_to: 'E2' }, { employee_id: 'E1' });
    expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ employee_id: 'E2' }) }));
  });
});

describe('convertMentionToLead', () => {
  const crm = () => ({ createLead: jest.fn(async (data, owner) => ({ id: 55, record: { id: 900 }, owner_id: owner, ...data })) });

  it('creates a lead keyed to the mention and assigns the mention to the owner', async () => {
    const db = makePrisma({ mentions: [mention()] });
    const crmService = crm();
    const { svc, eventBus } = makeSvc(db, { crmService });
    const r = await svc.convertMentionToLead(100, { employee_id: 'E3' });
    expect(r).toEqual({ mention_id: 100, lead_id: 55, record_id: 900 });
    const [data, owner, creator] = crmService.createLead.mock.calls[0];
    expect(data).toMatchObject({ first_name: 'Jane', last_name: 'Roe', lead_source: 'social_media', external_id: 'social:facebook:100' });
    expect(data.description).toContain('Is Acme any good?');
    expect(owner).toBe('E3');
    expect(creator).toBe('E3');
    expect(db._rows.mentions[0].assigned_to).toBe('E3');
    expect(eventBus.publish).toHaveBeenCalledWith('social.mention.converted', expect.objectContaining({ lead_id: 55 }));
  });

  it('is idempotent per mention', async () => {
    const db = makePrisma({ mentions: [mention()], leads: [{ id: 1, external_id: 'social:facebook:100' }] });
    const { svc } = makeSvc(db, { crmService: crm() });
    await expect(svc.convertMentionToLead(100)).rejects.toThrow(ConflictError);
  });

  it('explains when the CRM service is not wired', async () => {
    const { svc } = makeSvc(makePrisma({ mentions: [mention()] }));
    await expect(svc.convertMentionToLead(100)).rejects.toThrow(ValidationError);
  });

  it('listMentions decorates each mention with its lead, if converted', async () => {
    const db = makePrisma({
      mentions: [mention({ id: 100 }), mention({ id: 101 })],
      leads: [{ id: 9, record_id: 90, external_id: 'social:facebook:101', lead_status: 'new' }],
    });
    const { svc } = makeSvc(db);
    const rows = await svc.listMentions({ open: 'true' });
    expect(db.socialMediaMention.findMany.mock.calls[0][0].where).toMatchObject({ requires_response: true, response_sent: false });
    expect(rows[0].lead_id).toBeNull();
    expect(rows[1]).toMatchObject({ lead_id: 9, lead_record_id: 90, lead_status: 'new' });
  });
});

// ── OAuth ────────────────────────────────────────────────────────────────────

describe('OAuth state', () => {
  it('signs a state the callback can verify, and rejects tampering', async () => {
    const { svc } = makeSvc(makePrisma());
    const { url, state } = await svc.getOAuthAuthorizeUrl(1, 'https://api.example/api/social-media/oauth/callback');
    expect(url).toContain(`state=${state}`);
    expect(svc.verifyOAuthState(state)).toMatchObject({ account_id: 1, tenant_id: 7 });

    const [body, sig] = state.split('.');
    expect(() => svc.verifyOAuthState(`${body}.${sig.slice(0, -2)}xx`)).toThrow(/Invalid OAuth state/);
    const forged = Buffer.from(JSON.stringify({ account_id: 2, tenant_id: 1, exp: Date.now() + 1e6 })).toString('base64url');
    expect(() => svc.verifyOAuthState(`${forged}.${sig}`)).toThrow(/Invalid OAuth state/);
    expect(() => svc.verifyOAuthState('garbage')).toThrow(/Invalid OAuth state/);
  });

  it('completes the round-trip by persisting the exchanged tokens', async () => {
    const db = makePrisma();
    const { svc } = makeSvc(db);
    const { state } = await svc.getOAuthAuthorizeUrl(1, 'https://api/cb');
    const a = await svc.completeOAuth({ code: 'c1', state });
    expect(connector.handleCallback).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 1 }));
    expect(a.has_access_token).toBe(true);
    expect(db._rows.accounts[0]).toMatchObject({ access_token: 'at2', refresh_token: 'rt2', connection_status: 'active' });
    await expect(svc.completeOAuth({ state })).rejects.toThrow(/authorization code/);
  });
});

// ── Overview ─────────────────────────────────────────────────────────────────

describe('getOverview', () => {
  it('reports inbox and queue health alongside the raw totals', async () => {
    const db = makePrisma();
    db.socialMediaPost.findMany.mockResolvedValueOnce([{ engagement_metrics: { likes: 4, comments: 2 } }]);
    const { svc } = makeSvc(db);
    const o = await svc.getOverview();
    expect(Object.keys(o.totals).sort()).toEqual([
      'accounts', 'campaigns', 'expiring_tokens', 'failed_posts', 'keywords', 'mentions', 'open_mentions', 'posts', 'scheduled_posts',
    ]);
    expect(o.engagement).toMatchObject({ likes: 4, comments: 2, shares: 0, views: 0, posts_sampled: 1 });
    expect(o.connector_status.facebook.mode).toBe('simulation');
  });
});
