import api from './api';

const wrap = (promise) => promise.then((r) => ({ data: r.data?.data ?? r.data }));

/**
 * Social Media API client — `/api/social-media`.
 *
 * Accounts never carry OAuth tokens in responses (`has_access_token` /
 * `has_refresh_token` booleans instead). Mentions carry `lead_id` when they
 * have been converted to a CRM lead.
 */
export const socialMediaService = {
  // Overview
  getOverview: () => wrap(api.get('/social-media/overview')),

  // Accounts
  getAccounts:      (params)  => wrap(api.get('/social-media/accounts', { params })),
  getAccount:       (id)      => wrap(api.get(`/social-media/accounts/${id}`)),
  createAccount:    (d)       => wrap(api.post('/social-media/accounts', d)),
  updateAccount:    (id, d)   => wrap(api.put(`/social-media/accounts/${id}`, d)),
  deleteAccount:    (id)      => api.delete(`/social-media/accounts/${id}`),
  toggleAccount:    (id, isActive) => wrap(api.post(`/social-media/accounts/${id}/toggle`, { is_active: isActive })),
  /** Body with `access_token` = manual rotation; empty body = connector refresh. */
  refreshToken:     (id, d = {}) => wrap(api.post(`/social-media/accounts/${id}/refresh-token`, d)),
  /** Returns `{ url }` — navigate the browser there to run the OAuth consent flow. */
  getOAuthUrl:      (id)      => wrap(api.get(`/social-media/oauth/${id}/authorize`)),

  // Posts
  getPosts:         (params)  => wrap(api.get('/social-media/posts', { params })),
  getPost:          (id)      => wrap(api.get(`/social-media/posts/${id}`)),
  createPost:       (d)       => wrap(api.post('/social-media/posts', d)),
  updatePost:       (id, d)   => wrap(api.put(`/social-media/posts/${id}`, d)),
  deletePost:       (id)      => api.delete(`/social-media/posts/${id}`),
  publishPost:      (id)      => wrap(api.post(`/social-media/posts/${id}/publish`)),
  /** Admin: run the scheduled-publishing sweep now. */
  publishDue:       ()        => wrap(api.post('/social-media/posts/publish-due')),

  // Campaigns
  getCampaigns:     (params)  => wrap(api.get('/social-media/campaigns', { params })),
  getCampaign:      (id)      => wrap(api.get(`/social-media/campaigns/${id}`)),
  createCampaign:   (d)       => wrap(api.post('/social-media/campaigns', d)),
  updateCampaign:   (id, d)   => wrap(api.put(`/social-media/campaigns/${id}`, d)),
  deleteCampaign:   (id)      => api.delete(`/social-media/campaigns/${id}`),

  // Mentions — `assigned_to: 'me'` and `open: 'true'` are accepted filters.
  getMentions:      (params)  => wrap(api.get('/social-media/mentions', { params })),
  updateMention:    (id, d)   => wrap(api.put(`/social-media/mentions/${id}`, d)),
  convertMentionToLead: (id)  => wrap(api.post(`/social-media/mentions/${id}/convert-to-lead`)),

  // Listening Keywords
  getKeywords:      (params)  => wrap(api.get('/social-media/keywords', { params })),
  createKeyword:    (d)       => wrap(api.post('/social-media/keywords', d)),
  updateKeyword:    (id, d)   => wrap(api.put(`/social-media/keywords/${id}`, d)),
  deleteKeyword:    (id)      => api.delete(`/social-media/keywords/${id}`),

  // Inbound routing rules (admin)
  getAssignmentRules:   (params) => wrap(api.get('/social-media/assignment-rules', { params })),
  createAssignmentRule: (d)      => wrap(api.post('/social-media/assignment-rules', d)),
  updateAssignmentRule: (id, d)  => wrap(api.put(`/social-media/assignment-rules/${id}`, d)),
  deleteAssignmentRule: (id)     => api.delete(`/social-media/assignment-rules/${id}`),
  reorderAssignmentRules: (orderedIds) => wrap(api.post('/social-media/assignment-rules/reorder', { ordered_ids: orderedIds })),

  // Connector operations
  getConnectorStatus: ()      => wrap(api.get('/social-media/connector-status')),
  syncAccount:      (id)      => wrap(api.post(`/social-media/accounts/${id}/sync`)),
  syncAll:          ()        => wrap(api.post('/social-media/sync-all')),
};
