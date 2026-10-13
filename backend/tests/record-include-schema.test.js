'use strict';

/**
 * The record hydration paths include each typed CRM relation by name. Prisma
 * rejects an include of a relation that no longer exists at query time, and
 * mocked tests never see it — that is how a leftover `quote: true` (after the
 * Quotes object was deleted) broke every single-record fetch. This reads the
 * include blocks from source and checks every key against the real schema.
 */

const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');

const recordRelations = new Set(
  Prisma.dmmf.datamodel.models.find((m) => m.name === 'Record').fields
    .filter((f) => f.kind === 'object').map((f) => f.name),
);

/** Top-level keys of the `include: { … }` that follows `record.findUnique(`. */
function includeKeys(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', file), 'utf8');
  const blocks = [];
  let at = 0;
  while ((at = src.indexOf('record.findUnique(', at)) !== -1) {
    const inc = src.indexOf('include:', at);
    const open = src.indexOf('{', inc);
    let depth = 0; let end = open;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}' && --depth === 0) break;
    }
    const body = src.slice(open + 1, end);
    const keys = [];
    let d = 0;
    for (const line of body.split('\n')) {
      const m = d === 0 && line.match(/^\s*(\w+)\s*:/);
      if (m) keys.push(m[1]);
      d += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    }
    blocks.push(keys);
    at = end;
  }
  return blocks;
}

describe('record includes match the schema', () => {
  it('email-send.service.js includes only relations Record has', () => {
    const blocks = includeKeys('email-send.service.js').filter((k) => k.includes('crm_lead'));
    expect(blocks.length).toBeGreaterThan(0);
    for (const keys of blocks) {
      expect(keys.filter((k) => !recordRelations.has(k))).toEqual([]);
    }
  });

  it('record.service.js hydrates only relations Record has', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'record.service.js'), 'utf8');
    const block = /const ENTITY_RELATION = \{([\s\S]*?)\};/.exec(src)?.[1];
    expect(block).toBeTruthy();
    const relations = [...block.matchAll(/:\s*'(\w+)'/g)].map((m) => m[1]);
    expect(relations.length).toBeGreaterThan(5);
    expect(relations.filter((r) => !recordRelations.has(r))).toEqual([]);
  });
});
