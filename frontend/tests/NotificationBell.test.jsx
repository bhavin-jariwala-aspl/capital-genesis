import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../src/services/notification.service', () => ({
  notificationService: {
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import NotificationBell from '../src/components/ui/NotificationBell';
import { notificationService } from '../src/services/notification.service';

const UNREAD = [
  { id: 1, title: 'Alpha', body: 'first',  is_read: false, created_at: '2026-07-08T10:00:00Z' },
  { id: 2, title: 'Beta',  body: 'second', is_read: false, created_at: '2026-07-08T09:00:00Z' },
];
const READ = UNREAD.map((n) => ({ ...n, is_read: true }));

function renderBell() {
  const qc = new QueryClient({
    defaultOptions: {
      queries:   { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationService.getUnreadCount.mockResolvedValue({ data: { data: { count: 2 } } });
    // First load returns unread; after markRead → invalidate → refetch, they come back read.
    notificationService.getNotifications
      .mockResolvedValueOnce({ data: { data: UNREAD } })
      .mockResolvedValue({ data: { data: READ } });
    notificationService.markRead.mockResolvedValue({ data: { data: {} } });
    notificationService.markAllRead.mockResolvedValue({ data: { data: {} } });
  });

  it('opens the panel and lists notifications', async () => {
    renderBell();
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('auto-marks unread as read exactly once — the memoised effect converges without looping', async () => {
    renderBell();
    fireEvent.click(screen.getByTitle('Notifications'));

    // The auto-mark effect fires with the unread ids once the list has loaded.
    await waitFor(() => expect(notificationService.markRead).toHaveBeenCalledWith([1, 2]));

    // After mark → invalidate → refetch (2nd getNotifications) returns the items as read,
    // so the effect re-runs but finds nothing to mark. If `notifications` weren't memoised
    // (or a dep were wrong), this would loop and markRead would fire repeatedly.
    await waitFor(() => expect(notificationService.getNotifications).toHaveBeenCalledTimes(2));
    expect(notificationService.markRead).toHaveBeenCalledTimes(1);
  });
});
