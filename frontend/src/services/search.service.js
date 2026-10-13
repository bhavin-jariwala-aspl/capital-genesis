import api from './api';

export const searchService = {
  search: (query, limit = 20) =>
    api.get('/search', { params: { q: query, limit } }),
};
