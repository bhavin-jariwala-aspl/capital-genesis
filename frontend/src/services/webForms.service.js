import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

/** Published web forms (/f/<key>) and sharing them with clients. */
export const webFormsService = {
  list: () => wrap(api.get('/web-forms')),
  link: (id, prod = null) => wrap(api.post(`/web-forms/${id}/link`, { prod: prod || null })),
  send: (id, body) => wrap(api.post(`/web-forms/${id}/send`, body)),
};
