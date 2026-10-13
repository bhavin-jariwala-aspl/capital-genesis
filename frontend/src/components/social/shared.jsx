import {
  Facebook, Instagram, Linkedin, Twitter, Youtube, Phone, Globe, Plus,
} from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

/**
 * Constants and small presentational pieces shared by the runtime Social
 * Media page and the admin Social Media builder. Both pages used to carry
 * their own copies, which had already drifted (one offered "Published" as an
 * author-selectable status, the other did not).
 */

export const PLATFORMS = [
  { value: 'facebook',  label: 'Facebook',    icon: Facebook,  color: 'bg-blue-500' },
  { value: 'instagram', label: 'Instagram',   icon: Instagram, color: 'bg-pink-500' },
  { value: 'linkedin',  label: 'LinkedIn',    icon: Linkedin,  color: 'bg-blue-700' },
  { value: 'twitter',   label: 'X (Twitter)', icon: Twitter,   color: 'bg-gray-800' },
  { value: 'whatsapp',  label: 'WhatsApp',    icon: Phone,     color: 'bg-green-500' },
  { value: 'youtube',   label: 'YouTube',     icon: Youtube,   color: 'bg-red-600' },
  { value: 'tiktok',    label: 'TikTok',      icon: Globe,     color: 'bg-gray-900' },
];

export const POST_TYPES = [
  { value: 'post', label: 'Post' }, { value: 'story', label: 'Story' },
  { value: 'reel', label: 'Reel' }, { value: 'video', label: 'Video' },
  { value: 'carousel', label: 'Carousel' }, { value: 'live', label: 'Live' },
];

/** Authors pick draft or scheduled; `published`/`failed`/`publishing` are set by the engine. */
export const AUTHOR_POST_STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled — publishes automatically at the chosen time' },
];

export const CAMPAIGN_TYPES = [
  { value: 'brand_awareness', label: 'Brand Awareness' }, { value: 'lead_generation', label: 'Lead Generation' },
  { value: 'promotion', label: 'Promotion' }, { value: 'engagement', label: 'Engagement' },
  { value: 'traffic', label: 'Traffic' },
];

export const CONNECTION_BADGE = { active: 'success', expired: 'warning', error: 'danger', disabled: 'default' };
export const POST_BADGE = {
  draft: 'default', scheduled: 'info', publishing: 'info', published: 'success', deleted: 'danger', failed: 'danger',
};
export const CAMPAIGN_BADGE = { planning: 'info', active: 'success', paused: 'warning', completed: 'primary', cancelled: 'danger' };
export const SENTIMENT_BADGE = { positive: 'success', neutral: 'default', negative: 'danger' };
export const PRIORITY_BADGE = { low: 'default', medium: 'info', high: 'warning', urgent: 'danger' };

/** Total of the engagement counters the platform reported for a post. */
export function engagementTotal(post) {
  const m = post?.engagement_metrics;
  if (!m || typeof m !== 'object') return 0;
  return ['likes', 'comments', 'shares'].reduce((sum, k) => sum + (Number(m[k]) || 0), 0);
}

export function platformLabel(value) {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

export function PlatformIcon({ platform, size = 16 }) {
  const p = PLATFORMS.find((pl) => pl.value === platform);
  if (!p) return <Globe size={size} />;
  const Icon = p.icon;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-white ${p.color}`}>
      <Icon size={size - 2} />
    </span>
  );
}

/** Toggle chips for choosing a set of platforms. */
export function PlatformChips({ value = [], onChange, exclude = [] }) {
  const toggle = (p) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.filter((p) => !exclude.includes(p.value)).map((p) => {
        const Icon = p.icon;
        const selected = value.includes(p.value);
        return (
          <button key={p.value} type="button" onClick={() => toggle(p.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              selected
                ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-300'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-gray-400'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full" />
    </div>
  );
}

export function EmptyState({ message, action, onAction }) {
  return (
    <div className="card p-10 text-center">
      <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      {action && onAction && (
        <Button variant="outline" onClick={onAction}><Plus className="w-4 h-4" /> {action}</Button>
      )}
    </div>
  );
}

/** Status badge for a post, with the failure hint the author needs to act on. */
export function PostStatusBadge({ post }) {
  return (
    <>
      <Badge variant={POST_BADGE[post.status] ?? 'default'}>{post.status}</Badge>
      {post.status === 'failed' && (
        <span className="text-xs text-red-600 dark:text-red-400">
          publish failed — see your notifications, fix and publish again
        </span>
      )}
    </>
  );
}

/** Stat tile grid used by both overview tabs. */
export function StatTiles({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="card p-4">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 ${s.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            {s.hint && <p className="text-[11px] text-gray-400 mt-1">{s.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Platform / sentiment / status breakdown card. */
export function BreakdownCard({ title, rows, empty, renderKey }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              {renderKey(item)}
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Live-vs-demo connector strip shown on both overviews. */
export function ConnectorStrip({ status }) {
  const entries = Object.entries(status ?? {});
  if (!entries.length) return null;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Platform Connectors</h3>
      <div className="flex flex-wrap gap-3">
        {entries.map(([platform, info]) => (
          <div key={platform} className="flex items-center gap-2">
            <PlatformIcon platform={platform} size={14} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{platformLabel(platform)}</span>
            <Badge variant={info.mode === 'live' ? 'success' : 'default'} dot>
              {info.mode === 'live' ? 'Live' : 'Demo'}
            </Badge>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Demo mode simulates the platform API end to end (publishing, mentions, metrics). Live mode is enabled per
        platform by registering a connector on the server.
      </p>
    </div>
  );
}
