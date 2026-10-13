import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

export const documentService = {
  /** Upload a file (base64 encoded). */
  upload: ({ filename, mime_type, data, category, description, folder_id,
             related_record_id, related_type }) =>
    wrap(api.post('/documents/upload', {
      filename, mime_type, data,
      category, description, folder_id,
      related_record_id, related_type,
    })),

  /** List documents, optionally filtered (category, folder_id, search, …). */
  list: (params = {}) =>
    wrap(api.get('/documents', { params })),

  // Folders
  listFolders:  ()        => wrap(api.get('/documents/folders')),
  createFolder: (d)       => wrap(api.post('/documents/folders', d)),
  updateFolder: (id, d)   => wrap(api.put(`/documents/folders/${id}`, d)),
  deleteFolder: (id)      => api.delete(`/documents/folders/${id}`),

  /** Get a single document's metadata. */
  get: (id) =>
    wrap(api.get(`/documents/${id}`)),

  /** Get all documents attached to a record. */
  getForRecord: (recordId) =>
    wrap(api.get(`/documents/record/${recordId}`)),

  /** Download file — returns blob. */
  download: (id) =>
    api.get(`/documents/${id}/download`, { responseType: 'blob' }),

  /** Preview file inline — returns a blob (pdf/image bytes, or converted HTML/text). */
  preview: (id) =>
    api.get(`/documents/${id}/preview`, { responseType: 'blob' }),

  /** Update document metadata. */
  update: (id, data) =>
    wrap(api.put(`/documents/${id}`, data)),

  /** Delete a document. */
  remove: (id) =>
    api.delete(`/documents/${id}`),

  // Share links + engagement analytics
  createShareLink: (id, d)  => wrap(api.post(`/documents/${id}/share`, d)),
  listShareLinks:  (id)     => wrap(api.get(`/documents/${id}/shares`)),
  revokeShareLink: (linkId) => api.delete(`/documents/shares/${linkId}`),
  getAnalytics:    (id)     => wrap(api.get(`/documents/${id}/analytics`)),

  // Public (unauthenticated) share access — records engagement
  getPublic:      (token) => wrap(api.get(`/documents/public/${token}`)),
  downloadPublic: (token) => api.get(`/documents/public/${token}/download`, { responseType: 'blob' }),
  /** Absolute-ish path to the public inline preview — use directly as an <iframe src>. */
  publicPreviewUrl: (token) => `/api/documents/public/${token}/preview`,

  // E-signature — request management
  createSignatureRequest: (id, d) => wrap(api.post(`/documents/${id}/signature-requests`, d)),
  listSignatureRequests:  (id)    => wrap(api.get(`/documents/${id}/signature-requests`)),
  cancelSignatureRequest: (reqId) => wrap(api.delete(`/documents/signature-requests/${reqId}`)),

  // E-signature — public signing surface
  getSignRequest:   (token)       => wrap(api.get(`/documents/sign/${token}`)),
  submitSignature:  (token, d)    => wrap(api.post(`/documents/sign/${token}`, d)),
  declineSignature: (token, d)    => wrap(api.post(`/documents/sign/${token}/decline`, d)),
};
