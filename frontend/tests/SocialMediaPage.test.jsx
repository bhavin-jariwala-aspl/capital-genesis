import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authState = { admin: false, manager: true };
vi.mock('../src/store/authStore', () => ({
  useAuthStore: (selector) => selector({
    employee: { employee_id: 'E1', role: 'manager' },
    isAdmin: () => authState.admin,
    isManager: () => authState.manager,
    isPlatformAdmin: () => false,
  }),
}));

vi.mock('../src/services/social-media.service', () => ({
  socialMediaService: {
    getOverview:          vi.fn(),
    getAccounts:          vi.fn(),
    getPosts:             vi.fn(),
    getCampaigns:         vi.fn(),
    getMentions:          vi.fn(),
    publishPost:          vi.fn(),
    updateMention:        vi.fn(),
    convertMentionToLead: vi.fn(),
  },
}));

import SocialMediaPage from '../src/pages/runtime/SocialMediaPage';
import { socialMediaService as svc } from '../src/services/social-media.service';

const ACCOUNT = { id: 1, platform: 'facebook', display_name: 'Acme', account_name: '@acme', connection_status: 'active', sync_frequency: 'daily', auto_monitoring: true, _count: { posts: 2, mentions: 1 } };

function renderAt(path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SocialMediaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SocialMediaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getAccounts.mockResolvedValue({ data: [ACCOUNT] });
    svc.getOverview.mockResolvedValue({ data: { totals: {}, engagement: {}, connector_status: {} } });
    svc.getCampaigns.mockResolvedValue({ data: [] });
    svc.getMentions.mockResolvedValue({ data: [] });
    svc.getPosts.mockResolvedValue({ data: [] });
  });

  /**
   * The old page rendered `post._count.engagements` — a relation dropped from
   * the schema — so every post showed "0 engagements" (and the API 500ed).
   * Engagement now comes from the metrics the platform reported.
   */
  it('shows engagement computed from the post metrics, and the failed-post hint', async () => {
    svc.getPosts.mockResolvedValue({ data: [
      { id: 1, account_id: 1, account: ACCOUNT, status: 'published', post_type: 'post', content: 'Live one',
        published_at: '2026-09-01T10:00:00Z', engagement_metrics: { likes: 3, comments: 2, shares: 1, views: 99 } },
      { id: 2, account_id: 1, account: ACCOUNT, status: 'failed', post_type: 'post', content: 'Broken one' },
    ] });
    renderAt('/social-media?tab=posts');

    expect(await screen.findByText('6 engagements')).toBeInTheDocument();       // 3 + 2 + 1, views excluded
    expect(screen.getByText(/publish failed — see your notifications/)).toBeInTheDocument();
    // A failed post offers Retry; a published one offers nothing to publish.
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish now/ })).not.toBeInTheDocument();
  });

  it('opens the inbox from a notification deep link with the "assigned to me" filter on', async () => {
    svc.getMentions.mockResolvedValue({ data: [
      { id: 7, platform: 'instagram', author_name: 'Jane', content: 'Question?', sentiment: 'neutral', mention_type: 'comment',
        requires_response: true, response_sent: false, response_priority: 'high', mentioned_at: '2026-09-05T09:00:00Z', assigned_to: 'E1', lead_id: null },
    ] });
    renderAt('/social-media?tab=mentions&assigned=me');

    expect(await screen.findByText('Jane')).toBeInTheDocument();
    // The request carried both inbox filters the deep link implies.
    expect(svc.getMentions).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: 'me', open: 'true' }));
    expect(screen.getByText(/Needs reply · high/)).toBeInTheDocument();

    // Every user can turn a mention into a CRM lead.
    svc.convertMentionToLead.mockResolvedValue({ data: { lead_id: 55 } });
    fireEvent.click(screen.getByRole('button', { name: /Convert to lead/ }));
    await waitFor(() => expect(svc.convertMentionToLead).toHaveBeenCalledWith(7));
  });

  it('hides the Convert button once a mention is a lead, and shows the lead badge', async () => {
    svc.getMentions.mockResolvedValue({ data: [
      { id: 8, platform: 'facebook', author_name: 'Sam', content: 'Hi', sentiment: 'positive', mention_type: 'mention',
        requires_response: false, response_sent: true, response_content: 'Thanks!', mentioned_at: '2026-09-05T09:00:00Z', lead_id: 42 },
    ] });
    renderAt('/social-media?tab=mentions');
    expect(await screen.findByText('Lead #42')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Convert to lead/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reply/ })).not.toBeInTheDocument();
  });

  it('only offers draft and scheduled when composing — published is set by the engine', async () => {
    renderAt('/social-media?tab=posts');
    fireEvent.click(await screen.findByRole('button', { name: /Create Post/ }));
    const statusSelect = await screen.findByDisplayValue('Draft');
    const options = Array.from(statusSelect.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['draft', 'scheduled']);
  });
});
