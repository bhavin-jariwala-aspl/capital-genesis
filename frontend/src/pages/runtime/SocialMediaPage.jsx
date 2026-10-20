import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialMediaService } from '../../services/social-media.service';
import { useAuthStore } from '../../store/authStore';
import { invalidateRecordData } from '../../utils/invalidate';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Alert from '../../components/ui/Alert';
import {
  Plus, Edit2, ExternalLink, Send, RefreshCw, UserPlus, Clock, AlertTriangle,
  MessageSquare, Hash, Users, Target, BarChart2, Settings, Inbox, ThumbsUp,
} from 'lucide-react';
import {
  PLATFORMS, POST_TYPES, AUTHOR_POST_STATUSES, CAMPAIGN_TYPES,
  CONNECTION_BADGE, CAMPAIGN_BADGE, SENTIMENT_BADGE, PRIORITY_BADGE,
  engagementTotal, platformLabel, PlatformIcon, PlatformChips,
  LoadingState, EmptyState, PostStatusBadge, StatTiles, BreakdownCard, ConnectorStrip,
} from '../../components/social/shared';

const TABS = [
  { key: 'feed',      label: 'Feed',      icon: BarChart2 },
  { key: 'posts',     label: 'Posts',     icon: MessageSquare },
  { key: 'campaigns', label: 'Campaigns', icon: Target },
  { key: 'mentions',  label: 'Inbox',     icon: Inbox },
  { key: 'accounts',  label: 'Accounts',  icon: Users },
];

const apiError = (err, fallback) => err?.response?.data?.error?.message || fallback;

// ── Feed Tab (Overview) ───────────────────────────────────────

function FeedTab({ onGo }) {
  const { data, isLoading } = useQuery({
    queryKey: ['social-media-overview'],
    queryFn: () => socialMediaService.getOverview(),
  });
  const overview = data?.data ?? {};
  const totals = overview.totals ?? {};
  const engagement = overview.engagement ?? {};

  if (isLoading) return <LoadingState />;

  const stats = [
    { label: 'Needs a reply',  value: totals.open_mentions ?? 0,   icon: Inbox,         color: 'text-amber-600 bg-amber-50',   hint: 'open mentions awaiting response' },
    { label: 'Scheduled',      value: totals.scheduled_posts ?? 0, icon: Clock,         color: 'text-primary-600 bg-primary-50', hint: 'posts queued to publish' },
    { label: 'Failed posts',   value: totals.failed_posts ?? 0,    icon: AlertTriangle, color: 'text-red-600 bg-red-50',       hint: 'need attention' },
    { label: 'Engagement',     value: (engagement.likes ?? 0) + (engagement.comments ?? 0) + (engagement.shares ?? 0), icon: ThumbsUp, color: 'text-green-600 bg-green-50', hint: `across last ${engagement.posts_sampled ?? 0} published posts` },
    { label: 'Accounts',       value: totals.accounts ?? 0,        icon: Users,         color: 'text-blue-600 bg-blue-50',     hint: `${totals.posts ?? 0} posts · ${totals.campaigns ?? 0} campaigns · ${totals.keywords ?? 0} keywords` },
  ];

  return (
    <div className="space-y-6">
      <StatTiles stats={stats} />

      {(totals.open_mentions > 0 || totals.failed_posts > 0) && (
        <div className="flex flex-wrap gap-2">
          {totals.open_mentions > 0 && (
            <Button size="sm" variant="outline" onClick={() => onGo('mentions')}>
              <Inbox className="w-3.5 h-3.5" /> Work the inbox ({totals.open_mentions})
            </Button>
          )}
          {totals.failed_posts > 0 && (
            <Button size="sm" variant="outline" onClick={() => onGo('posts')}>
              <AlertTriangle className="w-3.5 h-3.5" /> Review failed posts ({totals.failed_posts})
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownCard
          title="Accounts by Platform"
          empty="No accounts connected yet. Ask your admin to connect accounts."
          rows={(overview.accounts_by_platform ?? []).map((r) => ({ key: r.platform, count: r._count.id }))}
          renderKey={(r) => (
            <div className="flex items-center gap-2">
              <PlatformIcon platform={r.key} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{platformLabel(r.key)}</span>
            </div>
          )}
        />
        <BreakdownCard
          title="Mention Sentiment"
          empty="No mentions tracked yet."
          rows={(overview.mentions_by_sentiment ?? []).map((r) => ({ key: r.sentiment, count: r._count.id }))}
          renderKey={(r) => <Badge variant={SENTIMENT_BADGE[r.key] ?? 'default'}>{r.key}</Badge>}
        />
        <BreakdownCard
          title="Posts by Status"
          empty="No posts yet."
          rows={(overview.posts_by_status ?? []).map((r) => ({ key: r.status, count: r._count.id }))}
          renderKey={(r) => <PostStatusBadge post={{ status: r.key }} />}
        />
      </div>

      <ConnectorStrip status={overview.connector_status} />
    </div>
  );
}

// ── Posts Tab ──────────────────────────────────────────────────

const EMPTY_POST = { account_id: '', post_type: 'post', content: '', status: 'draft', scheduled_for: '' };

function PostsTab({ canWrite }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_POST);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: accountsData } = useQuery({ queryKey: ['social-media-accounts'], queryFn: () => socialMediaService.getAccounts() });
  const accounts = accountsData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['social-media-posts', statusFilter],
    queryFn: () => socialMediaService.getPosts(statusFilter ? { status: statusFilter } : undefined),
  });
  const posts = data?.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['social-media-posts'] });
    qc.invalidateQueries({ queryKey: ['social-media-overview'] });
  };
  const createMut = useMutation({
    mutationFn: (d) => socialMediaService.createPost(d),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (err) => setFormError(apiError(err, 'Failed to create post.')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => socialMediaService.updatePost(id, d),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (err) => setFormError(apiError(err, 'Failed to update post.')),
  });
  const publishMut = useMutation({
    mutationFn: (id) => socialMediaService.publishPost(id),
    onSuccess: () => { invalidate(); setActionError(null); },
    onError: (err) => { invalidate(); setActionError(apiError(err, 'Publish failed.')); },
  });

  const openCreate = () => {
    setEditing(null); setFormError(null);
    setForm({ ...EMPTY_POST, account_id: accounts.length > 0 ? accounts[0].id : '' });
    setModalOpen(true);
  };
  const openEdit = (post) => {
    setEditing(post); setFormError(null);
    setForm({ account_id: post.account_id, post_type: post.post_type, content: post.content || '', status: post.status === 'failed' ? 'draft' : post.status, scheduled_for: post.scheduled_for?.slice(0, 16) || '' });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null); };

  const handleSave = () => {
    if (!form.account_id) { setFormError('Please select an account.'); return; }
    if (!form.content?.trim() && form.status !== 'draft') { setFormError('Content is required to schedule a post.'); return; }
    if (form.status === 'scheduled' && !form.scheduled_for) { setFormError('Pick a date and time to schedule the post.'); return; }
    setFormError(null);
    if (editing) updateMut.mutate({ id: editing.id, ...form });
    else createMut.mutate(form);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div>
      {actionError && <Alert variant="error" className="mb-4" onClose={() => setActionError(null)}>{actionError}</Alert>}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select className="form-input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All posts</option>
            <option value="scheduled">Scheduled queue</option>
            <option value="draft">Drafts</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
          </select>
          <p className="text-sm text-gray-500">{posts.length} post(s)</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} disabled={accounts.length === 0}>
            <Plus className="w-4 h-4" /> Create Post
          </Button>
        )}
      </div>

      {posts.length === 0 ? (
        <EmptyState message={statusFilter ? `No ${statusFilter} posts.` : 'No posts yet.'} />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="card p-4 flex items-start gap-4">
              <PlatformIcon platform={post.account?.platform} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{post.account?.display_name}</span>
                  <PostStatusBadge post={post} />
                  <Badge variant="default">{post.post_type}</Badge>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{post.content || '(no content)'}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                  {post.status === 'scheduled' && post.scheduled_for && (
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Publishes {new Date(post.scheduled_for).toLocaleString()}</span>
                  )}
                  {post.published_at && <span>Published {new Date(post.published_at).toLocaleString()}</span>}
                  {post.status === 'published' && <span>{engagementTotal(post)} engagements</span>}
                  {post.post_url && (
                    <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700">
                      <ExternalLink className="w-3 h-3" /> View
                    </a>
                  )}
                  {post.created_by && <span>by {post.created_by}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canWrite && ['draft', 'scheduled', 'failed'].includes(post.status) && (
                  <Button size="xs" variant="primary" loading={publishMut.isPending}
                    onClick={() => publishMut.mutate(post.id)}>
                    <Send className="w-3 h-3" /> {post.status === 'failed' ? 'Retry' : 'Publish now'}
                  </Button>
                )}
                {canWrite && !['published', 'publishing'].includes(post.status) && (
                  <Button size="xs" variant="ghost" onClick={() => openEdit(post)}><Edit2 className="w-3 h-3" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Post' : 'Create Post'} size="lg"
          footer={
            <>
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Save' : 'Create'}
              </Button>
            </>
          }
        >
          {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
          <PostForm form={form} setForm={setForm} accounts={accounts} editing={!!editing} />
        </Modal>
      )}
    </div>
  );
}

/** Shared by the runtime page and the builder. */
export function PostForm({ form, setForm, accounts, editing }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Account *</label>
          <select className="form-input" value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: Number(e.target.value) })} disabled={editing}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name} ({platformLabel(a.platform)})</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Post Type</label>
          <select className="form-input" value={form.post_type}
            onChange={(e) => setForm({ ...form, post_type: e.target.value })}>
            {POST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Content</label>
        <textarea className="form-input min-h-[120px]" placeholder="Write your post content..."
          value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <select className="form-input" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {AUTHOR_POST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Input label={form.status === 'scheduled' ? 'Publish at *' : 'Publish at'} type="datetime-local"
          value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} />
      </div>
      <p className="text-xs text-gray-500">
        Scheduled posts are published automatically by the server within a minute of the chosen time. If the platform
        rejects a post, it is marked <strong>failed</strong> and the author is notified.
      </p>
    </div>
  );
}

// ── Campaigns Tab ─────────────────────────────────────────────

function CampaignsTab({ canWrite }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', campaign_type: 'brand_awareness', objective: '', budget_total: '', start_date: '', end_date: '', platforms: [], status: 'planning' });
  const [formError, setFormError] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['social-media-campaigns'], queryFn: () => socialMediaService.getCampaigns() });
  const campaigns = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (d) => socialMediaService.createCampaign(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-media-campaigns'] }); setModalOpen(false); },
    onError: (err) => setFormError(apiError(err, 'Failed to create campaign.')),
  });

  const openCreate = () => {
    setFormError(null);
    setForm({ name: '', description: '', campaign_type: 'brand_awareness', objective: '', budget_total: '', start_date: '', end_date: '', platforms: [], status: 'planning' });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError('Campaign name is required.'); return; }
    if (!form.objective.trim()) { setFormError('Objective is required.'); return; }
    if (!form.start_date || !form.end_date) { setFormError('Start and end dates are required.'); return; }
    setFormError(null);
    const payload = { ...form };
    if (payload.budget_total) payload.budget_total = Number(payload.budget_total);
    createMut.mutate(payload);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{campaigns.length} campaign(s)</p>
        {canWrite && <Button onClick={openCreate}><Plus className="w-4 h-4" /> Draft Campaign</Button>}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState message="No campaigns yet." />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      )}

      {canWrite && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Draft Campaign" size="xl"
          footer={
            <>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} loading={createMut.isPending}>Create</Button>
            </>
          }
        >
          {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Campaign Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
              <select className="form-input" value={form.campaign_type} onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}>
                {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Input label="Objective *" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
            </div>
            <Input label="Start Date *" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="End Date *" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            <Input label="Total Budget" type="number" value={form.budget_total} onChange={(e) => setForm({ ...form, budget_total: e.target.value })} />
            <div />
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Platforms</label>
              <PlatformChips value={form.platforms} onChange={(platforms) => setForm({ ...form, platforms })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Campaign summary card with the live engagement roll-up. Shared with the builder. */
export function CampaignCard({ campaign: c, actions }) {
  const perf = c.performance_summary && typeof c.performance_summary === 'object' ? c.performance_summary : null;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</h4>
            <Badge variant={CAMPAIGN_BADGE[c.status] ?? 'default'}>{c.status}</Badge>
            <Badge variant="default">{c.campaign_type?.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{c.objective}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
            <span>{c.start_date?.slice(0, 10)} — {c.end_date?.slice(0, 10)}</span>
            {c.budget_total && <span>Budget: {c.currency} {Number(c.budget_total).toLocaleString()}</span>}
            {c.roi != null && <span>ROI: {Number(c.roi).toFixed(1)}x</span>}
            {c.lead_conversion_rate != null && <span>Lead conversion: {Number(c.lead_conversion_rate).toFixed(1)}%</span>}
            {(c.platforms || []).map((p) => <PlatformIcon key={p} platform={p} size={14} />)}
          </div>
          {perf && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-300 flex-wrap">
              <span className="font-medium">Performance:</span>
              <span>{perf.posts ?? 0} posts</span>
              <span>{perf.likes ?? 0} likes</span>
              <span>{perf.comments ?? 0} comments</span>
              <span>{perf.shares ?? 0} shares</span>
              <span>{perf.views ?? 0} views</span>
              {perf.computed_at && <span className="text-gray-400">as of {new Date(perf.computed_at).toLocaleString()}</span>}
            </div>
          )}
        </div>
        {actions}
      </div>
    </div>
  );
}

// ── Inbox (Mentions) Tab ──────────────────────────────────────

function MentionsTab({ initialAssigned }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ platform: '', sentiment: '', open: true, mine: initialAssigned === 'me' });
  const [error, setError] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState('');

  const params = {
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...(filter.sentiment ? { sentiment: filter.sentiment } : {}),
    ...(filter.open ? { open: 'true' } : {}),
    ...(filter.mine ? { assigned_to: 'me' } : {}),
  };
  const { data, isLoading } = useQuery({
    queryKey: ['social-media-mentions', params],
    queryFn: () => socialMediaService.getMentions(params),
  });
  const mentions = data?.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['social-media-mentions'] });
    qc.invalidateQueries({ queryKey: ['social-media-overview'] });
  };
  const replyMut = useMutation({
    mutationFn: ({ id, response_content }) => socialMediaService.updateMention(id, { response_content }),
    onSuccess: () => { invalidate(); setReplyTarget(null); setReplyText(''); setError(null); },
    onError: (err) => setError(apiError(err, 'Failed to send response.')),
  });
  const convertMut = useMutation({
    mutationFn: (id) => socialMediaService.convertMentionToLead(id),
    // The new lead belongs in the Leads list and dashboards.
    onSuccess: () => { invalidate(); invalidateRecordData(qc); setError(null); },
    onError: (err) => setError(apiError(err, 'Could not convert this mention to a lead.')),
  });

  if (isLoading) return <LoadingState />;

  const toggleClass = (on) => `px-3 py-1.5 rounded-lg text-sm border transition-colors ${on
    ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-300'
    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-gray-400'}`;

  return (
    <div>
      {error && <Alert variant="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button type="button" className={toggleClass(filter.mine)} onClick={() => setFilter({ ...filter, mine: !filter.mine })}>Assigned to me</button>
        <button type="button" className={toggleClass(filter.open)} onClick={() => setFilter({ ...filter, open: !filter.open })}>Needs reply</button>
        <select className="form-input w-40" value={filter.platform}
          onChange={(e) => setFilter({ ...filter, platform: e.target.value })}>
          <option value="">All Platforms</option>
          {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="form-input w-40" value={filter.sentiment}
          onChange={(e) => setFilter({ ...filter, sentiment: e.target.value })}>
          <option value="">All Sentiments</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <p className="text-sm text-gray-500 ml-auto">{mentions.length} mention(s)</p>
      </div>

      {mentions.length === 0 ? (
        <EmptyState message={filter.open || filter.mine ? 'Nothing waiting — the inbox is clear.' : 'No mentions found.'} />
      ) : (
        <div className="space-y-3">
          {mentions.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start gap-3">
                <PlatformIcon platform={m.platform} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.author_name}</span>
                    {m.author_handle && <span className="text-xs text-gray-500">@{m.author_handle.replace(/^@/, '')}</span>}
                    <Badge variant={SENTIMENT_BADGE[m.sentiment] ?? 'default'}>{m.sentiment}</Badge>
                    <Badge variant="default">{m.mention_type}</Badge>
                    {m.requires_response && !m.response_sent && (
                      <Badge variant={PRIORITY_BADGE[m.response_priority] ?? 'warning'} dot>Needs reply · {m.response_priority}</Badge>
                    )}
                    {m.response_sent && <Badge variant="success" dot>Responded</Badge>}
                    {m.lead_id && <Badge variant="primary">Lead #{m.lead_id}</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{m.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                    <span>{new Date(m.mentioned_at).toLocaleString()}</span>
                    {m.assigned_to && <span>Assigned to {m.assigned_to}</span>}
                    {m.follower_count > 0 && <span>{m.follower_count.toLocaleString()} followers</span>}
                    {m.influence_score > 0 && <span>Influence: {m.influence_score}/100</span>}
                    {Array.isArray(m.keywords_matched) && m.keywords_matched.length > 0 && (
                      <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />{m.keywords_matched.join(', ')}</span>
                    )}
                    {m.post_url && (
                      <a href={m.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700">
                        <ExternalLink className="w-3 h-3" /> Open
                      </a>
                    )}
                  </div>

                  {m.response_sent && m.response_content && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-700 dark:text-green-400"><strong>Your reply:</strong> {m.response_content}</p>
                    </div>
                  )}

                  {replyTarget === m.id && (
                    <div className="mt-3 flex gap-2">
                      <input className="form-input flex-1 text-sm" placeholder="Type your reply — it is posted to the channel…"
                        value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && replyText.trim()) replyMut.mutate({ id: m.id, response_content: replyText }); }} />
                      <Button size="sm" onClick={() => { if (replyText.trim()) replyMut.mutate({ id: m.id, response_content: replyText }); }}
                        loading={replyMut.isPending}>
                        <Send className="w-3 h-3" /> Send
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setReplyTarget(null); setReplyText(''); }}>Cancel</Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!m.response_sent && replyTarget !== m.id && (
                    <Button size="xs" variant="outline" onClick={() => { setReplyTarget(m.id); setReplyText(''); }}>
                      <Send className="w-3 h-3" /> Reply
                    </Button>
                  )}
                  {!m.lead_id && (
                    <Button size="xs" variant="ghost" loading={convertMut.isPending} onClick={() => convertMut.mutate(m.id)}>
                      <UserPlus className="w-3 h-3" /> Convert to lead
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Accounts Tab (read-only for non-admins) ───────────────────

function AccountsTab() {
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['social-media-accounts'],
    queryFn: () => socialMediaService.getAccounts(),
  });
  const accounts = data?.data ?? [];

  const syncMut = useMutation({
    mutationFn: (id) => socialMediaService.syncAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-media-accounts'] }); qc.invalidateQueries({ queryKey: ['social-media-mentions'] }); setError(null); },
    onError: (err) => setError(apiError(err, 'Sync failed.')),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      {error && <Alert variant="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}
      <p className="text-sm text-gray-500 mb-4">
        {accounts.length} connected account(s). Contact your admin to connect or modify accounts.
      </p>
      {accounts.length === 0 ? (
        <EmptyState message="No social media accounts connected. Ask your administrator to set up accounts in Builder." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acct) => (
            <div key={acct.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={acct.platform} />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{acct.display_name}</h4>
                    <p className="text-xs text-gray-500">@{String(acct.account_name).replace(/^@/, '')}</p>
                  </div>
                </div>
                <Badge variant={CONNECTION_BADGE[acct.connection_status] ?? 'default'} dot>
                  {acct.connection_status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 border-y border-gray-100 dark:border-white/[0.06]">
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{acct.follower_count ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Followers</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{acct._count?.posts ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Posts</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{acct._count?.mentions ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Mentions</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                <span>Type: <span className="capitalize">{acct.account_type}</span></span>
                <span>Sync: {acct.sync_frequency}{acct.auto_monitoring ? '' : ' · monitoring off'}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button size="xs" variant="outline" loading={syncMut.isPending}
                  onClick={() => syncMut.mutate(acct.id)}>
                  <RefreshCw className="w-3 h-3" /> Sync Now
                </Button>
                {acct.profile_url && (
                  <a href={acct.profile_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700">
                    <ExternalLink className="w-3 h-3" /> Profile
                  </a>
                )}
                {acct.last_sync_at && (
                  <span className="text-[10px] text-gray-400 ml-auto">
                    Synced: {new Date(acct.last_sync_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SocialMediaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.key === requested) ? requested : 'feed';
  const setActiveTab = (key) => setSearchParams(key === 'feed' ? {} : { tab: key });
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isManager = useAuthStore((s) => s.isManager());
  const canWrite = isAdmin || isManager;

  return (
    <div className="min-h-full bg-surface px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Social Media</h1>
            <p className="text-sm text-gray-500 mt-1">
              Schedule posts, track campaigns, and work the inbox of mentions routed to your team.
            </p>
          </div>
          {isAdmin && (
            <a href="/builder/social-media"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:border-white/10 dark:hover:bg-white/5 transition-colors">
              <Settings className="w-3.5 h-3.5" /> Admin Settings
            </a>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-white/[0.06] mb-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'feed'      && <FeedTab onGo={setActiveTab} />}
        {activeTab === 'posts'     && <PostsTab canWrite={canWrite} />}
        {activeTab === 'campaigns' && <CampaignsTab canWrite={canWrite} />}
        {activeTab === 'mentions'  && <MentionsTab initialAssigned={searchParams.get('assigned')} />}
        {activeTab === 'accounts'  && <AccountsTab />}
      </div>
    </div>
  );
}
