'use strict';

/**
 * Every report also leaves out rows of records in the Trash. Tests about the
 * user's own filters and scopes take that clause off before comparing.
 */
const isLive = (c) => (Array.isArray(c?.OR) && c.OR.some((o) => o?.record?.is?.deleted_at === null))
  || (c && Object.keys(c).length === 1 && c.record?.deleted_at === null);

function stripLive(where) {
  if (!where || !Array.isArray(where.AND)) return where;
  // Drill-downs nest the report's where inside another AND: strip at every level.
  const AND = where.AND.filter((c) => !isLive(c)).map(stripLive);
  const { AND: _drop, ...rest } = where;
  return AND.length ? { ...rest, AND } : rest;
}

module.exports = { stripLive };
