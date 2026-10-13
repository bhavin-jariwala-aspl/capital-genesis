import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap, delete: del } = apiWrapper;

export const activityService = {
  getActivities: (recordId) =>
    wrap(api.get('/activities', { params: { record_id: recordId } })),

  createActivity: (recordId, data) =>
    wrap(api.post('/activities', { record_id: recordId, ...data })),

  updateActivity: (id, data) =>
    wrap(api.put(`/activities/${id}`, data)),

  deleteActivity: (id) =>
    del(api.delete(`/activities/${id}`)),
};
