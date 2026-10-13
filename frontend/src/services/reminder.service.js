import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap, delete: del } = apiWrapper;

export const reminderService = {
  getReminders: (params = {}) =>
    wrap(api.get('/reminders', { params })),

  getMyReminders: (scope = 'open') =>
    wrap(api.get('/reminders/my', { params: { scope } })),

  createReminder: (data) =>
    wrap(api.post('/reminders', data)),

  updateReminder: (id, data) =>
    wrap(api.put(`/reminders/${id}`, data)),

  snoozeReminder: (id, body) =>
    wrap(api.post(`/reminders/${id}/snooze`, body)),

  completeReminder: (id) =>
    wrap(api.post(`/reminders/${id}/complete`)),

  dismissReminder: (id) =>
    wrap(api.post(`/reminders/${id}/dismiss`)),

  deleteReminder: (id) =>
    del(api.delete(`/reminders/${id}`)),
};
