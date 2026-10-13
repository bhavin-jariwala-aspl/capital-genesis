import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap, delete: del } = apiWrapper;

export const taskService = {
  getTasks: (params = {}) =>
    wrap(api.get('/tasks', { params })),

  getMyTasks: () =>
    wrap(api.get('/tasks/my')),

  createTask: (data) =>
    wrap(api.post('/tasks', data)),

  updateTask: (id, data) =>
    wrap(api.put(`/tasks/${id}`, data)),

  deleteTask: (id) =>
    del(api.delete(`/tasks/${id}`)),
};
