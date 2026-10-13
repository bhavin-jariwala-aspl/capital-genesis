import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

/**
 * Status timeline events for a record — backs the `status_tracker` fieldtype.
 * Events are auto-appended on pipeline stage changes and can also be added
 * manually (e.g. a courier scan with a location).
 */
export const statusEventService = {
  // GET /api/runtime/records/:id/status-events  → newest-first array
  getStatusEvents: (recordId) =>
    wrap(api.get(`/runtime/records/${recordId}/status-events`)),

  // POST /api/runtime/records/:id/status-events
  // data: { status, title?, description?, location?, event_type?, occurred_at? }
  addStatusEvent: (recordId, data) =>
    wrap(api.post(`/runtime/records/${recordId}/status-events`, data)),
};
