import api from './api';

export const notificationService = {
  getNotifications: (unreadOnly = false) =>
    api.get('/notifications', { params: unreadOnly ? { unread_only: 'true' } : {} }),

  getUnreadCount: () =>
    api.get('/notifications/count'),

  markRead: (ids) =>
    api.patch('/notifications/read', { ids }),

  markAllRead: () =>
    api.patch('/notifications/read-all'),
};
