import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

/** A record's document checklist, and secure client upload links for it. */
export const uploadLinksService = {
  checklist: (recordId) => wrap(api.get(`/upload-links/records/${recordId}/checklist`)),
  create: (recordId, body = {}) => wrap(api.post(`/upload-links/records/${recordId}`, body)),
  // Public (no sign-in): the token is the key.
  describe: (token) => wrap(api.get(`/upload-links/${token}`)),
  upload: (token, body) => wrap(api.post(`/upload-links/${token}`, body)),
};
