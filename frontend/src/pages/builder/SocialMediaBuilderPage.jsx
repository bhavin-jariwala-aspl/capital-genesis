import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialMediaService } from '../../services/social-media.service';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Alert from '../../components/ui/Alert';
import { EmployeePicker, EmployeeMultiPicker } from '../../components/ui/EmployeePicker';
import {
  Plus, Edit2, Trash2, Power, ExternalLink, KeyRound, RefreshCw, Send, Clock, AlertTriangle,
  MessageSquare, Hash, Eye, Users, Target, Globe, Search, BarChart2, Route, UserCheck, Filter, Scale, Inbox, ThumbsUp,
} from 'lucide-react';
import { useCurrencyStore } from '../../store/currencyStore';
import {
  PLATFORMS, CAMPAIGN_TYPES, CONNECTION_BADGE, CAMPAIGN_BADGE, SENTIMENT_BADGE, PRIORITY_BADGE,
  platformLabel, PlatformIcon, PlatformChips, LoadingState, EmptyState, PostStatusBadge, StatTiles, BreakdownCard, ConnectorStrip,
  engagementTotal,
} from '../../components/social/shared';
import { PostForm, CampaignCard } from '../runtime/SocialMediaPage';

// ── Reusable delete-confirm hook (matches ModuleBuilder pattern) ──
function useDeleteConfirm() {
  const [target, setTarget] = useState(null);
  return { target, ask: setTarget, clear: () => setTarget(null) };
}

const apiError = (err, fallback) => err?.response?.data?.error?.message || fallback;

// ── Constants ──────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: 'business',     label: 'Business' },
  { value: 'organization', label: 'Organization' },
  { value: 'personal',     label: 'Personal' },
];

const SYNC_FREQUENCIES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily',  label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const KEYWORD_TYPES = [
  { value: 'brand',      label: 'Brand' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'industry',   label: 'Industry' },
  { value: 'product',    label: 'Product' },
  { value: 'hashtag',    label: 'Hashtag' },
];

const TABS = [
  { key: 'overview',  label: 'Overview',  icon: BarChart2 },
  { key: 'accounts',  label: 'Accounts',  icon: Users },
  { key: 'posts',     label: 'Posts',     icon: MessageSquare },
  { key: 'campaigns', label: 'Campaigns', icon: Target },
  { key: 'mentions',  label: 'Inbox',     icon: Eye },
  { key: 'routing',   label: 'Routing',   icon: Route },
  { key: 'keywords',  label: 'Listening', icon: Hash },
];

const EMPTY_ACCOUNT = {
  platform: 'facebook', account_name: '', account_id: '', display_name: '',
  profile_url: '', account_type: 'business', sync_frequency: 'daily',
  auto_monitoring: true, access_token: '', refresh_token: '', managed_by: '',
};

const EMPTY_POST = { account_id: '', post_type: 'post', content: '', status: 'draft', scheduled_for: '' };

// A factory, not a constant: the currency is read when a form is opened so a
// currency change in BUILDER > Settings applies without a reload.
const emptyCampaign = () => ({
  name: '', description: '', campaign_type: 'brand_awareness', objective: '',
  budget_total: '', budget_daily: '', currency: useCurrencyStore.getState().code,
  start_date: '', end_date: '', platforms: [], status: 'planning',
});

const EMPTY_KEYWORD = {
  keyword: '', keyword_type: 'brand', match_type: 'contains', platforms: [],
  priority: 'medium', is_active: true,
};

// ── Overview Tab ───────────────────────────────────────────────

function OverviewTab() {
  const qc = useQueryClient();
  const [message, setMessage] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['social-media-overview'],
    queryFn: () => socialMediaService.getOverview(),
  });
  const overview = data?.data ?? {};
  const totals = overview.totals ?? {};
  const engagement = overview.engagement ?? {};

  const invalidateAll = () => qc.invalidateQueries({ queryKey: ['social-media-overview'] });
  const syncAllMut = useMutation({
    mutationFn: () => socialMediaService.syncAll(),
    onSuccess: (r) => { invalidateAll(); setMessage({ tone: 'success', text: `Sync ran for ${r.data?.synced ?? 0} of ${r.data?.accounts ?? 0} account(s).` }); },
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Sync failed.') }),
  });
  const publishDueMut = useMutation({
    mutationFn: () => socialMediaService.publishDue(),
    onSuccess: (r) => { invalidateAll(); qc.invalidateQueries({ queryKey: ['social-media-posts'] }); setMessage({ tone: 'success', text: `Publish sweep: ${r.data?.published ?? 0} published, ${r.data?.failed ?? 0} failed, ${r.data?.due ?? 0} due.` }); },
    onError: (err) => setMessage({ tone: 'error', text: apiError(err, 'Sweep failed.') }),
  });

  if (isLoading) return <LoadingState />;

  const stats = [
    { label: 'Connected Accounts', value: totals.accounts ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50', hint: totals.expiring_tokens ? `${totals.expiring_tokens} token(s) expire within 7 days` : undefined },
    { label: 'Scheduled Posts',    value: totals.scheduled_posts ?? 0, icon: Clock, color: 'text-primary-600 bg-primary-50', hint: `${totals.posts ?? 0} posts in total` },
    { label: 'Failed Posts',       value: totals.failed_posts ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Open Mentions',      value: totals.open_mentions ?? 0, icon: Inbox, color: 'text-amber-600 bg-amber-50', hint: `${totals.mentions ?? 0} mentions in total` },
    { label: 'Engagement',         value: (engagement.likes ?? 0) + (engagement.comments ?? 0) + (engagement.shares ?? 0), icon: ThumbsUp, color: 'text-green-600 bg-green-50', hint: `${totals.campaigns ?? 0} campaigns · ${totals.keywords ?? 0} keywords` },
  ];

  return (
    <div className="space-y-6">
      {message && <Alert variant={message.tone} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <StatTiles stats={stats} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownCard
          title="Accounts by Platform" empty="No accounts connected yet."
          rows={(overview.accounts_by_platform ?? []).map((r) => ({ key: r.platform, count: r._count.id }))}
          renderKey={(r) => (
            <div className="flex items-center gap-2">
              <PlatformIcon platform={r.key} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{platformLabel(r.key)}</span>
            </div>
          )}
        />
        <BreakdownCard
          title="Mentions by Sentiment" empty="No mentions tracked yet."
          rows={(overview.mentions_by_sentiment ?? []).map((r) => ({ key: r.sentiment, count: r._count.id }))}
          renderKey={(r) => <Badge variant={SENTIMENT_BADGE[r.key] ?? 'default'}>{r.key}</Badge>}
        />
        <BreakdownCard
          title="Posts by Status" empty="No posts yet."
          rows={(overview.posts_by_status ?? []).map((r) => ({ key: r.status, count: r._count.id }))}
          renderKey={(r) => <PostStatusBadge post={{ status: r.key }} />}
        />
      </div>

      <ConnectorStrip status={overview.connector_status} />

      {/* Background automation */}
      <div className="card p-5 border-l-4 border-l-primary-500">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Background automation</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
              <li><strong>Scheduled publishing</strong> — every minute the server publishes posts whose time has come. A rejected post is marked <em>failed</em> and its author is notified.</li>
              <li><strong>Account sync</strong> — every 5 minutes, each account that is due under its own <em>Sync Frequency</em> gets its token refreshed if needed, profile metrics updated, new mentions pulled (keyword-matched and routed to the team), and post engagement refreshed.</li>
              <li><strong>Campaign roll-up</strong> — engagement on posts published inside an active campaign&apos;s window is summed onto the campaign after each sync.</li>
              <li><strong>Inbound routing</strong> — mentions needing a reply follow the <em>Routing</em> rules, or fall back to the least-loaded account manager.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" variant="outline" loading={publishDueMut.isPending} onClick={() => publishDueMut.mutate()}>
              <Send className="w-3.5 h-3.5" /> Run publish sweep now
            </Button>
            <Button size="sm" variant="outline" loading={syncAllMut.isPending} onClick={() => syncAllMut.mutate()}>
              <RefreshCw className="w-3.5 h-3.5" /> Sync all accounts now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Accounts Tab ───────────────────────────────────────────────

function AccountsTab({ oauthResult }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(oauthResult ?? null);
  const [search, setSearch] = useState('');
  const delConfirm = useDeleteConfirm();

  const { data, isLoading } = useQuery({
    queryKey: ['social-media-accounts'],
    queryFn: () => socialMediaService.getAccounts(),
  });
  const accounts = data?.data ?? [];

  const invalidateAccounts = () => {
    qc.invalidateQueries({ queryKey: ['social-media-accounts'] });
    qc.invalidateQueries({ queryKey: ['social-media-overview'] });
  };
  const onErr = (fallback) => (err) => setNotice({ tone: 'error', text: apiError(err, fallback) });
  const createMut = useMutation({
    mutationFn: (d) => socialMediaService.createAccount(d),
    onSuccess: () => { invalidateAccounts(); closeModal(); },
    onError: (err) => setFormError(apiError(err, 'Failed to connect account.')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => socialMediaService.updateAccount(id, d),
    onSuccess: () => { invalidateAccounts(); closeModal(); },
    onError: (err) => setFormError(apiError(err, 'Failed to update account.')),
  });
  const deleteMut = useMutation({ mutationFn: (id) => socialMediaService.deleteAccount(id), onSuccess: invalidateAccounts, onError: onErr('Failed to disconnect account.') });
  const toggleMut = useMutation({ mutationFn: ({ id, is_active }) => socialMediaService.toggleAccount(id, is_active), onSuccess: invalidateAccounts, onError: onErr('Failed to toggle account.') });
  const refreshMut = useMutation({
    mutationFn: (id) => socialMediaService.refreshToken(id),
    onSuccess: () => { invalidateAccounts(); setNotice({ tone: 'success', text: 'Token refreshed.' }); },
    onError: onErr('Token refresh failed.'),
  });
  const oauthMut = useMutation({
    mutationFn: (id) => socialMediaService.getOAuthUrl(id),
    onSuccess: (r) => { if (r.data?.url) window.location.assign(r.data.url); },
    onError: onErr('Could not start authorization.'),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_ACCOUNT); setFormError(null); setModalOpen(true); };
  const openEdit = (acct) => {
    setEditing(acct);
    setFormError(null);
    setForm({
      platform: acct.platform, account_name: acct.account_name, account_id: acct.account_id,
      display_name: acct.display_name, profile_url: acct.profile_url || '',
      account_type: acct.account_type, sync_frequency: acct.sync_frequency,
      auto_monitoring: acct.auto_monitoring, access_token: '', refresh_token: '', managed_by: acct.managed_by || '',
    });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null); };

  const handleSave = () => {
    if (!form.account_name.trim() || !form.account_id.trim() || !form.display_name.trim()) {
      setFormError('Account Name, Platform Account ID, and Display Name are required.');
      return;
    }
    setFormError(null);
    const payload = { ...form };
    if (!payload.access_token) delete payload.access_token;
    if (!payload.refresh_token) delete payload.refresh_token;
    if (!payload.managed_by) payload.managed_by = null;
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  };

  const filtered = accounts.filter((a) =>
    !search || a.display_name?.toLowerCase().includes(search.toLowerCase())
    || a.account_name?.toLowerCase().includes(search.toLowerCase())
    || a.platform?.toLowerCase().includes(search.toLowerCase()),
  );

  const tokenState = (acct) => {
    if (!acct.has_access_token) return { label: 'No token', variant: 'warning' };
    if (!acct.token_expires_at) return { label: 'Token set', variant: 'success' };
    const ms = new Date(acct.token_expires_at).getTime() - Date.now();
    if (ms <= 0) return { label: 'Token expired', variant: 'danger' };
    const days = Math.ceil(ms / 86400000);
    return { label: `Token expires in ${days}d`, variant: days <= 7 ? 'warning' : 'success' };
  };

  if (isLoading) return <LoadingState />;

  return (
    <div>
      {notice && <Alert variant={notice.tone} className="mb-4" onClose={() => setNotice(null)}>{notice.text}</Alert>}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="form-input pl-9 w-64" />
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Connect Account</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No social media accounts connected yet." action="Connect Account" onAction={openCreate} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((acct) => {
            const token = tokenState(acct);
            return (
              <div key={acct.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={acct.platform} />
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{acct.display_name}</h4>
                      <p className="text-xs text-gray-500">@{String(acct.account_name).replace(/^@/, '')}</p>
                    </div>
                  </div>
                  <Badge variant={CONNECTION_BADGE[acct.connection_status] ?? 'default'} dot>{acct.connection_status}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 py-2 border-y border-gray-100 dark:border-white/[0.06]">
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

                <div className="flex items-center justify-between text-xs text-gray-500 mb-2 flex-wrap gap-1">
                  <span>Sync: {acct.sync_frequency}{acct.auto_monitoring ? '' : ' · monitoring off'}</span>
                  <Badge variant={token.variant} dot>{token.label}</Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-3">
                  <span>{acct.managed_by ? `Managed by ${acct.managed_by}` : 'No manager — inbox routing needs one or a rule'}</span>
                  {acct.last_sync_at && <span>Synced {new Date(acct.last_sync_at).toLocaleString()}</span>}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="xs" variant="outline" onClick={() => openEdit(acct)}><Edit2 className="w-3 h-3" /> Edit</Button>
                  <Button size="xs" variant="outline" loading={oauthMut.isPending} onClick={() => oauthMut.mutate(acct.id)} title="Run the platform OAuth consent flow">
                    <KeyRound className="w-3 h-3" /> Authorize
                  </Button>
                  {acct.has_refresh_token && (
                    <Button size="xs" variant="outline" loading={refreshMut.isPending} onClick={() => refreshMut.mutate(acct.id)}>
                      <RefreshCw className="w-3 h-3" /> Refresh token
                    </Button>
                  )}
                  <Button size="xs" variant={acct.connection_status === 'active' ? 'outline' : 'primary'}
                    onClick={() => toggleMut.mutate({ id: acct.id, is_active: acct.connection_status !== 'active' })}>
                    <Power className="w-3 h-3" /> {acct.connection_status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                  {acct.profile_url && (
                    <a href={acct.profile_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <Button size="xs" variant="ghost" className="ml-auto text-red-500 hover:text-red-700" onClick={() => delConfirm.ask(acct)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!delConfirm.target} onClose={delConfirm.clear} title="Disconnect Account?" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={delConfirm.clear}>Cancel</Button>
            <Button variant="danger" loading={deleteMut.isPending}
              onClick={() => { deleteMut.mutate(delConfirm.target.id); delConfirm.clear(); }}>
              Disconnect
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Disconnect <strong>{delConfirm.target?.display_name}</strong> ({platformLabel(delConfirm.target?.platform)})? This disables the account; its posts and mentions are kept.
        </p>
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Account' : 'Connect Social Media Account'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>
              {editing ? 'Save Changes' : 'Connect Account'}
            </Button>
          </>
        }
      >
        {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Platform *</label>
            <select className="form-input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} disabled={!!editing}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Account Type *</label>
            <select className="form-input" value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Input label="Account Name / Handle" required placeholder="@acmecorp"
            value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          <Input label="Platform Account ID" required placeholder="Platform-specific ID"
            value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} disabled={!!editing} />
          <Input label="Display Name" required placeholder="Acme Corporation"
            value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <Input label="Profile URL" placeholder="https://..."
            value={form.profile_url} onChange={(e) => setForm({ ...form, profile_url: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sync Frequency</label>
            <select className="form-input" value={form.sync_frequency} onChange={(e) => setForm({ ...form, sync_frequency: e.target.value })}>
              {SYNC_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <p className="text-[11px] text-gray-400">How often the background sync pulls mentions and metrics for this account.</p>
          </div>
          <div>
            <EmployeePicker label="Account manager" value={form.managed_by} onChange={(v) => setForm({ ...form, managed_by: v })}
              help="Default recipient of inbound mentions when no routing rule applies." />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto_monitoring" checked={form.auto_monitoring}
              onChange={(e) => setForm({ ...form, auto_monitoring: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="auto_monitoring" className="text-sm text-gray-700 dark:text-gray-300">Auto-monitor mentions</label>
          </div>

          <div className="sm:col-span-2 border-t border-gray-100 dark:border-white/[0.06] pt-4 mt-2">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Credentials</h4>
            <p className="text-xs text-gray-500">
              {editing
                ? 'Leave blank to keep the existing tokens, or use Authorize on the account card to run the platform OAuth flow.'
                : 'Paste tokens from the platform’s developer console, or connect first and then click Authorize to run the OAuth flow.'}
            </p>
          </div>
          <Input label="Access Token" type="password" placeholder="Paste access token"
            value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} />
          <Input label="Refresh Token" type="password" placeholder="Paste refresh token"
            value={form.refresh_token} onChange={(e) => setForm({ ...form, refresh_token: e.target.value })} />
        </div>

        {form.platform === 'whatsapp' && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-1">WhatsApp Business Account</p>
            <p className="text-xs text-green-700 dark:text-green-400">
              This connects your organization&apos;s WhatsApp Business number. All employees share this number — incoming
              messages are routed via the Routing rules. Individual employees cannot connect personal numbers.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Posts Tab ──────────────────────────────────────────────────

function PostsTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_POST);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const delConfirm = useDeleteConfirm();

  const { data: accountsData } = useQuery({ queryKey: ['social-media-accounts'], queryFn: () => socialMediaService.getAccounts() });
  const accounts = accountsData?.data ?? [];

  const { data, isLoading } = useQuery({ queryKey: ['social-media-posts'], queryFn: () => socialMediaService.getPosts() });
  const posts = data?.data ?? [];

  const invalidatePosts = () => {
    qc.invalidateQueries({ queryKey: ['social-media-posts'] });
    qc.invalidateQueries({ queryKey: ['social-media-overview'] });
  };
  const createMut = useMutation({ mutationFn: (d) => socialMediaService.createPost(d), onSuccess: () => { invalidatePosts(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to create post.')) });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => socialMediaService.updatePost(id, d), onSuccess: () => { invalidatePosts(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to update post.')) });
  const deleteMut = useMutation({ mutationFn: (id) => socialMediaService.deletePost(id), onSuccess: invalidatePosts, onError: (err) => setActionError(apiError(err, 'Failed to delete post.')) });
  const publishMut = useMutation({ mutationFn: (id) => socialMediaService.publishPost(id), onSuccess: () => { invalidatePosts(); setActionError(null); }, onError: (err) => { invalidatePosts(); setActionError(apiError(err, 'Publish failed.')); } });

  const openCreate = () => { setEditing(null); setFormError(null); setForm({ ...EMPTY_POST, account_id: accounts.length > 0 ? accounts[0].id : '' }); setModalOpen(true); };
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{posts.length} post(s)</p>
        <Button onClick={openCreate} disabled={accounts.length === 0}><Plus className="w-4 h-4" /> Create Post</Button>
      </div>

      {accounts.length === 0 && (
        <div className="card p-5 text-center text-sm text-gray-500 mb-4">Connect a social media account first before creating posts.</div>
      )}

      {posts.length === 0 ? (
        <EmptyState message="No posts yet." action="Create Post" onAction={openCreate} />
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
                  {post.status === 'scheduled' && post.scheduled_for && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Publishes {new Date(post.scheduled_for).toLocaleString()}</span>}
                  {post.published_at && <span>Published {new Date(post.published_at).toLocaleString()}</span>}
                  {post.status === 'published' && <span>{engagementTotal(post)} engagements</span>}
                  {post.created_by && <span>by {post.created_by}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {['draft', 'scheduled', 'failed'].includes(post.status) && (
                  <Button size="xs" variant="primary" loading={publishMut.isPending} onClick={() => publishMut.mutate(post.id)}>
                    <Send className="w-3 h-3" /> {post.status === 'failed' ? 'Retry' : 'Publish now'}
                  </Button>
                )}
                {!['published', 'publishing'].includes(post.status) && (
                  <Button size="xs" variant="ghost" onClick={() => openEdit(post)}><Edit2 className="w-3 h-3" /></Button>
                )}
                <Button size="xs" variant="ghost" className="text-red-500" onClick={() => delConfirm.ask(post)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Post?" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={delConfirm.clear}>Cancel</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => { deleteMut.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {delConfirm.target?.status === 'published'
            ? 'This post is live. It will be removed from the platform first, then deleted here.'
            : 'Delete this post? This action cannot be undone.'}
        </p>
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Post' : 'Create Post'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </>
        }
      >
        {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
        <PostForm form={form} setForm={setForm} accounts={accounts} editing={!!editing} />
      </Modal>
    </div>
  );
}

// ── Campaigns Tab ─────────────────────────────────────────────

function CampaignsTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCampaign);
  const [formError, setFormError] = useState(null);
  const delConfirm = useDeleteConfirm();

  const { data, isLoading } = useQuery({ queryKey: ['social-media-campaigns'], queryFn: () => socialMediaService.getCampaigns() });
  const campaigns = data?.data ?? [];

  const invalidateCampaigns = () => qc.invalidateQueries({ queryKey: ['social-media-campaigns'] });
  const createMut = useMutation({ mutationFn: (d) => socialMediaService.createCampaign(d), onSuccess: () => { invalidateCampaigns(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to create campaign.')) });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => socialMediaService.updateCampaign(id, d), onSuccess: () => { invalidateCampaigns(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to update campaign.')) });
  const deleteMut = useMutation({ mutationFn: (id) => socialMediaService.deleteCampaign(id), onSuccess: invalidateCampaigns });

  const openCreate = () => { setEditing(null); setForm(emptyCampaign()); setFormError(null); setModalOpen(true); };
  const openEdit = (c) => {
    setEditing(c); setFormError(null);
    setForm({
      name: c.name, description: c.description || '', campaign_type: c.campaign_type,
      objective: c.objective, budget_total: c.budget_total ?? '', budget_daily: c.budget_daily ?? '',
      currency: c.currency, start_date: c.start_date?.slice(0, 10) || '',
      end_date: c.end_date?.slice(0, 10) || '', platforms: c.platforms || [], status: c.status,
    });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null); };

  const handleSave = () => {
    if (!form.name.trim()) { setFormError('Campaign name is required.'); return; }
    if (!form.objective.trim()) { setFormError('Objective is required.'); return; }
    if (!form.start_date || !form.end_date) { setFormError('Start and end dates are required.'); return; }
    if (new Date(form.end_date) <= new Date(form.start_date)) { setFormError('End date must be after start date.'); return; }
    setFormError(null);
    const payload = { ...form };
    if (payload.budget_total) payload.budget_total = Number(payload.budget_total);
    if (payload.budget_daily) payload.budget_daily = Number(payload.budget_daily);
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  };

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{campaigns.length} campaign(s)</p>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> New Campaign</Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState message="No campaigns yet." action="New Campaign" onAction={openCreate} />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} actions={
              <div className="flex items-center gap-1 shrink-0">
                <Button size="xs" variant="outline" onClick={() => openEdit(c)}><Edit2 className="w-3 h-3" /> Edit</Button>
                <Button size="xs" variant="ghost" className="text-red-500" onClick={() => delConfirm.ask(c)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            } />
          ))}
        </div>
      )}

      <Modal open={!!delConfirm.target} onClose={delConfirm.clear} title="Cancel Campaign?" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={delConfirm.clear}>Keep</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => { deleteMut.mutate(delConfirm.target.id); delConfirm.clear(); }}>Cancel Campaign</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">Cancel campaign <strong>{delConfirm.target?.name}</strong>? This will mark it as cancelled.</p>
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Campaign' : 'New Campaign'} size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editing ? 'Save' : 'Create'}</Button>
          </>
        }
      >
        {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Campaign Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Campaign Type *</label>
            <select className="form-input" value={form.campaign_type} onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}>
              {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Input label="Objective" required placeholder="What do you want to achieve?" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea className="form-input min-h-[80px]" placeholder="Campaign description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <Input label="Start Date *" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input label="End Date *" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <Input label="Total Budget" type="number" placeholder="10000" value={form.budget_total} onChange={(e) => setForm({ ...form, budget_total: e.target.value })} />
          <Input label="Daily Budget" type="number" placeholder="500" value={form.budget_daily} onChange={(e) => setForm({ ...form, budget_daily: e.target.value })} />
          {editing && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.keys(CAMPAIGN_BADGE).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Target Platforms</label>
            <PlatformChips value={form.platforms} onChange={(platforms) => setForm({ ...form, platforms })} />
            <p className="text-[11px] text-gray-400 mt-1">Engagement on posts published to these platforms inside the campaign window is rolled up onto the campaign.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Inbox (Mentions) Tab ──────────────────────────────────────

function MentionsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ platform: '', sentiment: '', open: 'true' });
  const [error, setError] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [assignee, setAssignee] = useState('');

  const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
  const { data, isLoading } = useQuery({ queryKey: ['social-media-mentions', params], queryFn: () => socialMediaService.getMentions(params) });
  const mentions = data?.data ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => socialMediaService.updateMention(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-media-mentions'] }); setError(null); setAssigning(null); },
    onError: (err) => setError(apiError(err, 'Failed to update mention.')),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      {error && <Alert variant="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select className="form-input w-44" value={filter.open} onChange={(e) => setFilter({ ...filter, open: e.target.value })}>
          <option value="true">Awaiting reply</option>
          <option value="">All mentions</option>
        </select>
        <select className="form-input w-40" value={filter.platform} onChange={(e) => setFilter({ ...filter, platform: e.target.value })}>
          <option value="">All Platforms</option>
          {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="form-input w-40" value={filter.sentiment} onChange={(e) => setFilter({ ...filter, sentiment: e.target.value })}>
          <option value="">All Sentiments</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
        <p className="text-sm text-gray-500 ml-auto">{mentions.length} mention(s)</p>
      </div>

      <p className="text-xs text-gray-500 mb-4">Reps reply from the Social Media inbox. Use this view to re-route conversations or change their priority.</p>

      {mentions.length === 0 ? (
        <EmptyState message="No mentions match these filters." />
      ) : (
        <div className="space-y-3">
          {mentions.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start gap-3">
                <PlatformIcon platform={m.platform} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.author_name}</span>
                    {m.author_handle && <span className="text-xs text-gray-500">@{String(m.author_handle).replace(/^@/, '')}</span>}
                    <Badge variant={SENTIMENT_BADGE[m.sentiment] ?? 'default'}>{m.sentiment}</Badge>
                    <Badge variant="default">{m.mention_type}</Badge>
                    {m.requires_response && !m.response_sent && <Badge variant={PRIORITY_BADGE[m.response_priority] ?? 'warning'} dot>{m.response_priority}</Badge>}
                    {m.response_sent && <Badge variant="success" dot>Responded</Badge>}
                    {m.lead_id && <Badge variant="primary">Lead #{m.lead_id}</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{m.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                    <span>{new Date(m.mentioned_at).toLocaleString()}</span>
                    <span>{m.assigned_to ? `Assigned to ${m.assigned_to}` : 'Unassigned'}</span>
                    {m.follower_count > 0 && <span>{m.follower_count.toLocaleString()} followers</span>}
                    {Array.isArray(m.keywords_matched) && m.keywords_matched.length > 0 && <span>Keywords: {m.keywords_matched.join(', ')}</span>}
                  </div>
                  {assigning === m.id && (
                    <div className="mt-3 flex items-end gap-2 max-w-md">
                      <div className="flex-1"><EmployeePicker label="Re-assign to" value={assignee} onChange={setAssignee} /></div>
                      <Button size="sm" loading={updateMut.isPending} onClick={() => assignee && updateMut.mutate({ id: m.id, assigned_to: assignee })}>Assign</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!m.response_sent && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => { setAssigning(m.id); setAssignee(m.assigned_to || ''); }}>
                        <UserCheck className="w-3 h-3" /> Re-assign
                      </Button>
                      <select className="form-input text-xs py-1" value={m.response_priority}
                        onChange={(e) => updateMut.mutate({ id: m.id, response_priority: e.target.value })}>
                        {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </>
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

// ── Routing Tab (inbound assignment rules) ────────────────────

const RULE_TYPES = [
  { value: 'fixed',         label: 'Fixed',         Icon: UserCheck, desc: 'Always one person' },
  { value: 'round_robin',   label: 'Round Robin',   Icon: RefreshCw, desc: 'Cycle through a pool' },
  { value: 'rule_based',    label: 'Rule Based',    Icon: Filter,    desc: 'Match mention fields' },
  { value: 'load_balanced', label: 'Load Balanced', Icon: Scale,     desc: 'Fewest open mentions wins' },
];

const MENTION_FIELDS = [
  'platform', 'mention_type', 'sentiment', 'sentiment_score', 'response_priority',
  'follower_count', 'influence_score', 'reach_estimate', 'requires_response', 'author_handle', 'content', 'keywords_matched',
];
const OPERATORS = ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'is_empty', 'is_not_empty'];

const emptyRule = () => ({ name: '', platform: '', rule_type: 'fixed', assignee_id: '', pool_ids: [], fallback_id: '', conditions: [], order_index: 0, is_active: true });

function ConditionsEditor({ conditions, onChange }) {
  const list = Array.isArray(conditions) ? conditions : [];
  const update = (i, key, val) => onChange(list.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <select className="form-input w-44 text-sm" value={c.field} onChange={(e) => update(i, 'field', e.target.value)}>
            <option value="">field…</option>
            {MENTION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="form-input w-36 text-sm" value={c.operator} onChange={(e) => update(i, 'operator', e.target.value)}>
            {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input className="form-input flex-1 text-sm" placeholder="value" value={c.value ?? ''} onChange={(e) => update(i, 'value', e.target.value)} />
          <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 p-1 rounded-lg">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { field: 'sentiment', operator: 'equals', value: '' }])}
        className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 mt-1">
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

function RuleForm({ rule, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(() => {
    const base = { ...emptyRule(), ...rule, platform: rule?.platform ?? '' };
    if (!Array.isArray(base.pool_ids)) base.pool_ids = [];
    if (!Array.isArray(base.conditions)) base.conditions = [];
    return base;
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="border border-primary-200 dark:border-primary-500/30 rounded-2xl p-5 bg-primary-50/30 dark:bg-primary-500/10 space-y-5">
      {error && <Alert variant="error" onClose={() => {}}>{error}</Alert>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Rule Name</label>
          <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Negative WhatsApp to senior rep" />
        </div>
        <div>
          <label className="form-label">Channel</label>
          <select className="form-input" value={form.platform} onChange={(e) => set('platform', e.target.value)}>
            <option value="">All channels</option>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Rule Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
          {RULE_TYPES.map((rt) => {
            const Icon = rt.Icon;
            const active = form.rule_type === rt.value;
            return (
              <button key={rt.value} type="button" onClick={() => set('rule_type', rt.value)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${active
                  ? 'border-primary-300 bg-primary-50 text-primary-700 ring-2 ring-primary-200 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/30'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                <Icon size={16} className={`mb-1.5 ${active ? '' : 'text-gray-400'}`} />
                <p className="text-xs font-semibold">{rt.label}</p>
                <p className={`text-xs mt-0.5 leading-tight ${active ? 'opacity-80' : 'text-gray-400'}`}>{rt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {form.rule_type === 'fixed' && (
        <EmployeePicker label="Assignee" value={form.assignee_id} onChange={(v) => set('assignee_id', v)} help="Every matching mention goes to this person." />
      )}
      {(form.rule_type === 'round_robin' || form.rule_type === 'load_balanced') && (
        <EmployeeMultiPicker label="Pool Members" value={form.pool_ids} onChange={(v) => set('pool_ids', v)} help="Mentions are distributed across these team members." />
      )}
      {form.rule_type === 'rule_based' && (
        <div className="space-y-4">
          <div>
            <label className="form-label">Conditions <span className="font-normal text-gray-400">(all must match)</span></label>
            <div className="mt-1.5"><ConditionsEditor conditions={form.conditions} onChange={(c) => set('conditions', c)} /></div>
          </div>
          <EmployeePicker label="Assignee (when conditions match)" value={form.assignee_id} onChange={(v) => set('assignee_id', v)} help="Leave blank to load-balance across the pool below." />
          <EmployeeMultiPicker label="Pool (used when no assignee is set)" value={form.pool_ids} onChange={(v) => set('pool_ids', v)} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EmployeePicker label="Fallback Assignee" value={form.fallback_id} onChange={(v) => set('fallback_id', v)} help="Used if no rule yields an assignee." />
        <div>
          <label className="form-label">Order</label>
          <input className="form-input" type="number" value={form.order_index} onChange={(e) => set('order_index', Number(e.target.value))} />
        </div>
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="rounded border-gray-300 text-primary-600" />
        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Active</span>
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button loading={saving} onClick={() => onSave({
          ...form,
          platform:    form.platform || null,
          assignee_id: form.assignee_id || null,
          fallback_id: form.fallback_id || null,
          conditions:  form.rule_type === 'rule_based' ? form.conditions : null,
        })}>
          Save Rule
        </Button>
      </div>
    </div>
  );
}

function RoutingTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const delConfirm = useDeleteConfirm();

  const { data, isLoading } = useQuery({ queryKey: ['social-assignment-rules'], queryFn: () => socialMediaService.getAssignmentRules() });
  const rules = data?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-assignment-rules'] });
  const done = () => { invalidate(); setShowForm(false); setEditing(null); setError(null); };
  const fail = (err) => setError(apiError(err, 'Could not save rule.'));
  const createMut = useMutation({ mutationFn: (d) => socialMediaService.createAssignmentRule(d), onSuccess: done, onError: fail });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => socialMediaService.updateAssignmentRule(id, d), onSuccess: done, onError: fail });
  const deleteMut = useMutation({ mutationFn: (id) => socialMediaService.deleteAssignmentRule(id), onSuccess: invalidate, onError: fail });
  const reorderMut = useMutation({ mutationFn: (ids) => socialMediaService.reorderAssignmentRules(ids), onSuccess: invalidate, onError: fail });

  const move = (idx, dir) => {
    const ids = rules.map((r) => r.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorderMut.mutate(ids);
  };

  if (isLoading) return <LoadingState />;

  const describe = (r) => {
    switch (r.rule_type) {
      case 'fixed':         return `→ ${r.assignee_id}`;
      case 'round_robin':   return `round robin over ${(r.pool_ids || []).length} member(s)`;
      case 'load_balanced': return `least-loaded of ${(r.pool_ids || []).length} member(s)`;
      case 'rule_based':    return `${(r.conditions || []).map((c) => `${c.field} ${c.operator} ${c.value ?? ''}`).join(' AND ')} → ${r.assignee_id || `pool of ${(r.pool_ids || []).length}`}`;
      default:              return r.rule_type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 border-l-4 border-l-primary-500">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">How inbound mentions are routed</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Rules run in order for every new mention that needs a reply; the first rule that yields a person wins, else the last
          rule&apos;s fallback. A rule with <em>All channels</em> applies everywhere. If no rule applies, the mention is load-balanced
          across the account managers. The assignee is notified in-app.
        </p>
      </div>

      {error && !showForm && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rules.length} rule(s)</p>
        {!showForm && <Button onClick={() => { setEditing(null); setShowForm(true); setError(null); }}><Plus className="w-4 h-4" /> New Rule</Button>}
      </div>

      {showForm && (
        <RuleForm
          rule={editing}
          saving={createMut.isPending || updateMut.isPending}
          error={error}
          onCancel={() => { setShowForm(false); setEditing(null); setError(null); }}
          onSave={(d) => (editing ? updateMut.mutate({ id: editing.id, ...d }) : createMut.mutate(d))}
        />
      )}

      {rules.length === 0 && !showForm ? (
        <EmptyState message="No routing rules yet — mentions go to the least-loaded account manager." action="New Rule" onAction={() => setShowForm(true)} />
      ) : (
        <div className="space-y-2">
          {rules.map((r, idx) => (
            <div key={r.id} className="card p-4 flex items-center gap-4">
              <div className="flex flex-col gap-0.5 text-gray-400">
                <button type="button" className="hover:text-gray-700 disabled:opacity-30" disabled={idx === 0} onClick={() => move(idx, -1)}>▲</button>
                <button type="button" className="hover:text-gray-700 disabled:opacity-30" disabled={idx === rules.length - 1} onClick={() => move(idx, 1)}>▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{r.name}</span>
                  <Badge variant="default">{r.rule_type.replace('_', ' ')}</Badge>
                  {r.platform ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500"><PlatformIcon platform={r.platform} size={12} /> {platformLabel(r.platform)}</span>
                  ) : <Badge variant="info">All channels</Badge>}
                  {!r.is_active && <Badge variant="danger">Inactive</Badge>}
                </div>
                <p className="text-xs text-gray-500 truncate">{describe(r)}{r.fallback_id ? ` · fallback ${r.fallback_id}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="xs" variant="ghost" onClick={() => { setEditing(r); setShowForm(true); setError(null); }}><Edit2 className="w-3 h-3" /></Button>
                <Button size="xs" variant="ghost" className="text-red-500" onClick={() => delConfirm.ask(r)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Rule?" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={delConfirm.clear}>Cancel</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => { deleteMut.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">Delete rule <strong>{delConfirm.target?.name}</strong>?</p>
      </Modal>
    </div>
  );
}

// ── Keywords / Listening Tab ──────────────────────────────────

function KeywordsTab() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_KEYWORD);
  const [formError, setFormError] = useState(null);
  const delConfirm = useDeleteConfirm();

  const { data, isLoading } = useQuery({ queryKey: ['social-media-keywords'], queryFn: () => socialMediaService.getKeywords() });
  const keywords = data?.data ?? [];

  const invalidateKeywords = () => qc.invalidateQueries({ queryKey: ['social-media-keywords'] });
  const createMut = useMutation({ mutationFn: (d) => socialMediaService.createKeyword(d), onSuccess: () => { invalidateKeywords(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to add keyword.')) });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => socialMediaService.updateKeyword(id, d), onSuccess: () => { invalidateKeywords(); closeModal(); }, onError: (err) => setFormError(apiError(err, 'Failed to update keyword.')) });
  const deleteMut = useMutation({ mutationFn: (id) => socialMediaService.deleteKeyword(id), onSuccess: invalidateKeywords });

  const openCreate = () => { setEditing(null); setForm(EMPTY_KEYWORD); setFormError(null); setModalOpen(true); };
  const openEdit = (kw) => {
    setEditing(kw); setFormError(null);
    setForm({ keyword: kw.keyword, keyword_type: kw.keyword_type, match_type: kw.match_type, platforms: kw.platforms || [], priority: kw.priority, is_active: kw.is_active });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null); };

  const handleSave = () => {
    if (!form.keyword.trim()) { setFormError('Keyword is required.'); return; }
    setFormError(null);
    if (editing) updateMut.mutate({ id: editing.id, ...form });
    else createMut.mutate(form);
  };

  const KW_PRIORITY_BADGE = { low: 'default', medium: 'info', high: 'warning' };
  const TYPE_BADGE = { brand: 'primary', competitor: 'danger', industry: 'info', product: 'success', hashtag: 'purple' };

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{keywords.length} keyword(s) · matched against every incoming mention; a <strong>high</strong> priority hit raises the mention&apos;s response priority</p>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Keyword</Button>
      </div>

      {keywords.length === 0 ? (
        <EmptyState message="No listening keywords configured yet." action="Add Keyword" onAction={openCreate} />
      ) : (
        <div className="space-y-2">
          {keywords.map((kw) => (
            <div key={kw.id} className="card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{kw.keyword}</span>
                  <Badge variant={TYPE_BADGE[kw.keyword_type] ?? 'default'}>{kw.keyword_type}</Badge>
                  <Badge variant={KW_PRIORITY_BADGE[kw.priority] ?? 'default'}>{kw.priority}</Badge>
                  {!kw.is_active && <Badge variant="danger">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Match: {kw.match_type}</span>
                  <span>{(kw.platforms || []).length ? (kw.platforms || []).map(platformLabel).join(', ') : 'all platforms'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="xs" variant="ghost" onClick={() => openEdit(kw)}><Edit2 className="w-3 h-3" /></Button>
                <Button size="xs" variant="ghost" className="text-red-500" onClick={() => delConfirm.ask(kw)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Keyword?" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={delConfirm.clear}>Cancel</Button>
            <Button variant="danger" loading={deleteMut.isPending} onClick={() => { deleteMut.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">Delete keyword <strong>{delConfirm.target?.keyword}</strong>? This will stop monitoring for this term.</p>
      </Modal>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Keyword' : 'Add Listening Keyword'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editing ? 'Save' : 'Add'}</Button>
          </>
        }
      >
        {formError && <Alert variant="error" className="mb-3" onClose={() => setFormError(null)}>{formError}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Keyword" required placeholder="e.g., acme, #acmecorp" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Type *</label>
            <select className="form-input" value={form.keyword_type} onChange={(e) => setForm({ ...form, keyword_type: e.target.value })}>
              {KEYWORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Match Type</label>
            <select className="form-input" value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })}>
              <option value="exact">Exact</option>
              <option value="contains">Contains</option>
              <option value="starts_with">Starts With</option>
              <option value="ends_with">Ends With</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
            <select className="form-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High — raises the response priority of matching mentions</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Monitor on Platforms <span className="font-normal text-gray-400">(none selected = all)</span></label>
            <PlatformChips value={form.platforms} onChange={(platforms) => setForm({ ...form, platforms })} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="kw_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="kw_active" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SocialMediaBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [oauthResult, setOauthResult] = useState(null);

  // Landing back from the OAuth callback: show the outcome and open Accounts.
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;
    setOauthResult(oauth === 'success'
      ? { tone: 'success', text: 'Account authorized — tokens stored and connection active.' }
      : { tone: 'error', text: `Authorization failed: ${searchParams.get('message') || 'unknown error'}` });
    setActiveTab('accounts');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div className="min-h-full bg-surface px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Globe}
          eyebrow="Builder"
          title="Social Media"
          subtitle="Connect accounts, schedule posts, route the inbox, and configure brand listening for your organization."
        />

      <BuilderGuide section="/builder/social-media" />

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
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'overview'  && <OverviewTab />}
        {activeTab === 'accounts'  && <AccountsTab oauthResult={oauthResult} />}
        {activeTab === 'posts'     && <PostsTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'mentions'  && <MentionsTab />}
        {activeTab === 'routing'   && <RoutingTab />}
        {activeTab === 'keywords'  && <KeywordsTab />}
      </div>
    </div>
  );
}
