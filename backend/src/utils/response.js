'use strict';

const ok = (data, meta = {}) => ({ success: true, data, ...meta });
const created = (data) => ({ success: true, data });
const list = (data, total, page, limit) => ({
  success: true,
  data,
  pagination: { total, page, limit, pages: Math.ceil(total / limit) },
});

module.exports = { ok, created, list };
