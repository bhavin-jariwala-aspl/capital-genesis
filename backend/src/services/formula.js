'use strict';

/**
 * Formula engine — the safe expression language behind `formula` fields,
 * `expression` validations and `expression` workflow conditions.
 *
 * ── Why a parser and not eval ────────────────────────────────────────────────
 * Formulas are typed by tenant admins in the Builder. Anything that reaches
 * `eval` / `new Function` would hand an admin of one tenant code execution on a
 * server shared by every tenant. So expressions are tokenised and parsed into
 * a small AST, and the evaluator only knows arithmetic, comparison, logic and
 * the whitelisted functions below. There is no member access, no assignment,
 * no loops and no way to reach a JavaScript object.
 *
 * ── Language ─────────────────────────────────────────────────────────────────
 *   literals     12  3.5  'text'  "text"  true  false  null
 *   fields       amount   tenure_months   party.date_of_birth (via a lookup)
 *   arithmetic   + - * / % ^      (string + string concatenates)
 *   comparison   = == != <> < <= > >=
 *   logic        AND OR NOT   && || !
 *   functions    IF(cond, a, b)  ROUND(x, dp)  PMT(rate, n, pv)  AGE(date) …
 *
 * Unknown fields read as null; null propagates through arithmetic (so a
 * half-filled form yields an empty formula rather than a wrong number).
 *
 * Evaluation is async because LOOKUP / SUM_RELATED / COUNT_RELATED and dotted
 * lookup paths read other records. The caller supplies those capabilities in
 * the context, which keeps this module free of Prisma and easy to unit test.
 */

class FormulaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormulaError';
  }
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

const TWO_CHAR_OPS = new Set(['==', '!=', '<>', '<=', '>=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '^', '<', '>', '=', '!', '(', ')', ',']);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = String(src ?? '');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const text = s.slice(i, j);
      const value = Number(text);
      if (Number.isNaN(value)) throw new FormulaError(`Bad number "${text}"`);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = '';
      while (j < s.length && s[j] !== ch) {
        if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; continue; }
        out += s[j++];
      }
      if (j >= s.length) throw new FormulaError('Unterminated string');
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++;
      const word = s.slice(i, j);
      const upper = word.toUpperCase();
      if (upper === 'AND' || upper === 'OR' || upper === 'NOT') tokens.push({ type: 'op', value: upper });
      else if (upper === 'TRUE' || upper === 'FALSE') tokens.push({ type: 'lit', value: upper === 'TRUE' });
      else if (upper === 'NULL') tokens.push({ type: 'lit', value: null });
      else tokens.push({ type: 'id', value: word });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
    if (ONE_CHAR_OPS.has(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

// ── Parser (precedence climbing) ─────────────────────────────────────────────

const NORMALISE = { '&&': 'AND', '||': 'OR', '!': 'NOT', '==': '=', '<>': '!=' };
const BINARY = {
  OR: 1, AND: 2,
  '=': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 7,
};

function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const opOf = (t) => (t && t.type === 'op' ? (NORMALISE[t.value] ?? t.value) : null);
  const expect = (value) => {
    const t = tokens[pos++];
    if (!t || t.type !== 'op' || t.value !== value) throw new FormulaError(`Expected "${value}"`);
  };

  function primary() {
    const t = tokens[pos++];
    if (!t) throw new FormulaError('Unexpected end of formula');
    if (t.type === 'num' || t.type === 'str' || t.type === 'lit') return { k: 'lit', v: t.value };
    if (t.type === 'id') {
      if (opOf(peek()) === '(') {
        pos++;
        const args = [];
        if (opOf(peek()) !== ')') {
          do { args.push(expr(0)); } while (opOf(peek()) === ',' && ++pos);
        }
        expect(')');
        return { k: 'call', name: t.value.toUpperCase(), args };
      }
      return { k: 'ref', name: t.value };
    }
    const op = opOf(t);
    // AND(a, b, …) / OR(a, b, …) — spreadsheet-style function form of the
    // infix operators, which admins coming from Excel naturally write.
    if ((op === 'AND' || op === 'OR') && opOf(peek()) === '(') {
      pos++;
      const args = [];
      if (opOf(peek()) !== ')') {
        do { args.push(expr(0)); } while (opOf(peek()) === ',' && ++pos);
      }
      expect(')');
      return { k: 'call', name: op, args };
    }
    if (op === '(') { const e = expr(0); expect(')'); return e; }
    if (op === '-') return { k: 'neg', e: unary() };
    if (op === '+') return unary();
    if (op === 'NOT') return { k: 'not', e: unary() };
    throw new FormulaError(`Unexpected "${t.value}"`);
  }

  function unary() { return primary(); }

  function expr(minPrec) {
    let left = unary();
    for (;;) {
      const op = opOf(peek());
      const prec = op ? BINARY[op] : undefined;
      if (prec === undefined || prec < minPrec) break;
      pos++;
      // ^ is right-associative; everything else is left-associative.
      const right = expr(op === '^' ? prec : prec + 1);
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
  }

  const ast = expr(0);
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${tokens[pos].value}"`);
  return ast;
}

// ── Values ───────────────────────────────────────────────────────────────────

const isBlank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function toNumber(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v) {
  if (isBlank(v)) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function truthy(v) {
  if (isBlank(v)) return false;
  if (typeof v === 'string') return !['false', '0', 'no'].includes(v.trim().toLowerCase());
  return Boolean(v);
}

function compare(op, a, b) {
  // Numbers compare numerically when both sides look numeric; dates as dates;
  // everything else as case-insensitive text. Blank equals blank only.
  if (op === '=' || op === '!=') {
    let eq;
    if (isBlank(a) || isBlank(b)) eq = isBlank(a) && isBlank(b);
    else if (toNumber(a) !== null && toNumber(b) !== null && typeof a !== 'boolean' && typeof b !== 'boolean') eq = toNumber(a) === toNumber(b);
    else eq = String(a).toLowerCase() === String(b).toLowerCase();
    return op === '=' ? eq : !eq;
  }
  if (isBlank(a) || isBlank(b)) return false;
  let x = toNumber(a);
  let y = toNumber(b);
  if (x === null || y === null) {
    const da = toDate(a); const db = toDate(b);
    if (da && db) { x = da.getTime(); y = db.getTime(); } else { x = String(a); y = String(b); }
  }
  switch (op) {
    case '<': return x < y;
    case '<=': return x <= y;
    case '>': return x > y;
    case '>=': return x >= y;
    default: return false;
  }
}

function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
}

const isoDay = (d) => d.toISOString().slice(0, 10);

// ── Function library ─────────────────────────────────────────────────────────
// Each entry receives already-evaluated arguments, except the lazy ones (IF,
// AND, OR, COALESCE) which receive thunks so the untaken branch never runs.

const LAZY = new Set(['IF', 'AND', 'OR', 'COALESCE', 'IFBLANK']);

const FUNCTIONS = {
  IF: async ([c, a, b]) => (truthy(await c()) ? a() : (b ? b() : null)),
  AND: async (args) => { for (const a of args) if (!truthy(await a())) return false; return true; },
  OR: async (args) => { for (const a of args) if (truthy(await a())) return true; return false; },
  COALESCE: async (args) => { for (const a of args) { const v = await a(); if (!isBlank(v)) return v; } return null; },
  IFBLANK: async ([v, alt]) => { const x = await v(); return isBlank(x) ? alt() : x; },
  NOT: ([v]) => !truthy(v),
  ISBLANK: ([v]) => isBlank(v),

  ROUND: ([v, dp]) => (toNumber(v) === null ? null : round(toNumber(v), toNumber(dp) ?? 0)),
  FLOOR: ([v]) => (toNumber(v) === null ? null : Math.floor(toNumber(v))),
  CEIL: ([v]) => (toNumber(v) === null ? null : Math.ceil(toNumber(v))),
  ABS: ([v]) => (toNumber(v) === null ? null : Math.abs(toNumber(v))),
  MIN: (args) => { const n = args.map(toNumber).filter((x) => x !== null); return n.length ? Math.min(...n) : null; },
  MAX: (args) => { const n = args.map(toNumber).filter((x) => x !== null); return n.length ? Math.max(...n) : null; },
  SUM: (args) => args.map(toNumber).filter((x) => x !== null).reduce((a, b) => a + b, 0),
  NUMBER: ([v]) => toNumber(v),
  // Loan maths: payment per period for rate-per-period r over n periods on pv.
  PMT: ([rate, n, pv]) => {
    const r = toNumber(rate); const k = toNumber(n); const p = toNumber(pv);
    if (r === null || k === null || p === null || k <= 0) return null;
    if (r === 0) return round(p / k, 2);
    return round((p * r) / (1 - (1 + r) ** -k), 2);
  },
  // Pick the value paired with the first matching key; last odd arg is the default.
  CASE: ([v, ...pairs]) => {
    for (let i = 0; i + 1 < pairs.length; i += 2) if (compare('=', v, pairs[i])) return pairs[i + 1];
    return pairs.length % 2 ? pairs[pairs.length - 1] : null;
  },

  CONCAT: (args) => args.filter((a) => !isBlank(a)).map(String).join(''),
  UPPER: ([v]) => (isBlank(v) ? null : String(v).toUpperCase()),
  LOWER: ([v]) => (isBlank(v) ? null : String(v).toLowerCase()),
  LEN: ([v]) => (isBlank(v) ? 0 : String(v).length),
  CONTAINS: ([hay, needle]) => !isBlank(hay) && !isBlank(needle) && String(hay).toLowerCase().includes(String(needle).toLowerCase()),
  IN: ([v, ...options]) => options.some((o) => compare('=', v, o)),
  TEXT: ([v]) => (isBlank(v) ? null : String(v)),

  TODAY: () => isoDay(new Date()),
  NOW: () => new Date().toISOString(),
  YEAR: ([d]) => { const x = toDate(d); return x ? x.getFullYear() : null; },
  AGE: ([d, at]) => {
    const born = toDate(d); const ref = toDate(at) ?? new Date();
    if (!born) return null;
    return Math.floor(monthsBetween(born, ref) / 12);
  },
  YEARS_BETWEEN: ([a, b]) => { const x = toDate(a); const y = toDate(b); return x && y ? Math.floor(monthsBetween(x, y) / 12) : null; },
  MONTHS_BETWEEN: ([a, b]) => { const x = toDate(a); const y = toDate(b); return x && y ? monthsBetween(x, y) : null; },
  DAYS_BETWEEN: ([a, b]) => { const x = toDate(a); const y = toDate(b); return x && y ? Math.round((y - x) / 86_400_000) : null; },
  ADD_DAYS: ([d, n]) => { const x = toDate(d); const k = toNumber(n); if (!x || k === null) return null; x.setDate(x.getDate() + k); return isoDay(x); },
  ADD_MONTHS: ([d, n]) => { const x = toDate(d); const k = toNumber(n); if (!x || k === null) return null; x.setMonth(x.getMonth() + k); return isoDay(x); },
  ADD_YEARS: ([d, n]) => { const x = toDate(d); const k = toNumber(n); if (!x || k === null) return null; x.setFullYear(x.getFullYear() + k); return isoDay(x); },

  // ── Cross-record (need ctx.lookup / ctx.related) ──────────────────────────
  // LOOKUP('product', 'code', product_code, 'margin') → margin of the matching
  // record; with an optional 5th arg naming a date field, the latest row whose
  // date is on or before today wins (rate tables with effective dates).
  LOOKUP: async ([object, matchField, matchValue, returnField, dateField], ctx) => {
    if (!ctx.lookup) return null;
    return ctx.lookup({ object, matchField, matchValue, returnField, dateField });
  },
  // LATEST('plr_rate', 'rate', 'effective_from') → value from the newest row
  // already in effect.
  LATEST: async ([object, returnField, dateField], ctx) => {
    if (!ctx.lookup) return null;
    return ctx.lookup({ object, returnField, dateField });
  },
  COUNT_RELATED: async ([object, linkField, whereField, whereValue], ctx) => {
    if (!ctx.related) return null;
    return ctx.related({ object, linkField, agg: 'count', whereField, whereValue });
  },
  SUM_RELATED: async ([object, linkField, field, whereField, whereValue], ctx) => {
    if (!ctx.related) return null;
    return ctx.related({ object, linkField, agg: 'sum', field, whereField, whereValue });
  },
};

const FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS).sort());

// ── Evaluator ────────────────────────────────────────────────────────────────

async function evalNode(node, ctx) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'ref': return ctx.resolve ? ctx.resolve(node.name) : null;
    case 'neg': { const v = toNumber(await evalNode(node.e, ctx)); return v === null ? null : -v; }
    case 'not': return !truthy(await evalNode(node.e, ctx));
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(`Unknown function ${node.name}()`);
      if (LAZY.has(node.name)) return fn(node.args.map((a) => () => evalNode(a, ctx)), ctx);
      const args = [];
      for (const a of node.args) args.push(await evalNode(a, ctx));
      return fn(args, ctx);
    }
    case 'bin': {
      if (node.op === 'AND') return truthy(await evalNode(node.l, ctx)) && truthy(await evalNode(node.r, ctx));
      if (node.op === 'OR') return truthy(await evalNode(node.l, ctx)) || truthy(await evalNode(node.r, ctx));
      const l = await evalNode(node.l, ctx);
      const r = await evalNode(node.r, ctx);
      if (['=', '!=', '<', '<=', '>', '>='].includes(node.op)) return compare(node.op, l, r);
      if (node.op === '+' && (typeof l === 'string' || typeof r === 'string') && (toNumber(l) === null || toNumber(r) === null)) {
        return `${l ?? ''}${r ?? ''}`;
      }
      const x = toNumber(l); const y = toNumber(r);
      if (x === null || y === null) return null;
      switch (node.op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': return y === 0 ? null : x / y;
        case '%': return y === 0 ? null : x % y;
        case '^': return x ** y;
        default: throw new FormulaError(`Unknown operator ${node.op}`);
      }
    }
    default: throw new FormulaError('Malformed formula');
  }
}

const AST_CACHE = new Map();
const AST_CACHE_MAX = 500;

/** Parse once, reuse: formulas run on every save of every record. */
function compile(expression) {
  const key = String(expression ?? '');
  let ast = AST_CACHE.get(key);
  if (!ast) {
    ast = parse(key);
    if (AST_CACHE.size >= AST_CACHE_MAX) AST_CACHE.delete(AST_CACHE.keys().next().value);
    AST_CACHE.set(key, ast);
  }
  return ast;
}

/**
 * Evaluate an expression.
 *
 * @param {string} expression
 * @param {object} ctx
 * @param {object}   [ctx.values]   field name → value (used when no resolve)
 * @param {Function} [ctx.resolve]  name → value; may be async (dotted lookup paths)
 * @param {Function} [ctx.lookup]   ({object, matchField, matchValue, returnField, dateField}) → value
 * @param {Function} [ctx.related]  ({object, linkField, agg, field, whereField, whereValue}) → number
 */
async function evaluate(expression, ctx = {}) {
  const ast = compile(expression);
  const values = ctx.values ?? {};
  const full = { ...ctx, resolve: ctx.resolve ?? ((name) => (name in values ? values[name] : null)) };
  return evalNode(ast, full);
}

/** Parse-only check for the Builder: null when valid, else the error message. */
function check(expression) {
  try {
    compile(expression);
    const unknown = [];
    (function walk(n) {
      if (!n) return;
      if (n.k === 'call') { if (!FUNCTIONS[n.name]) unknown.push(n.name); n.args.forEach(walk); }
      if (n.k === 'bin') { walk(n.l); walk(n.r); }
      if (n.k === 'neg' || n.k === 'not') walk(n.e);
    }(compile(expression)));
    return unknown.length ? `Unknown function ${unknown[0]}()` : null;
  } catch (err) {
    return err.message;
  }
}

/** Field names an expression reads (first path segment), for dependency ordering. */
function references(expression) {
  const out = new Set();
  (function walk(n) {
    if (!n) return;
    if (n.k === 'ref') out.add(n.name.split('.')[0]);
    if (n.k === 'call') n.args.forEach(walk);
    if (n.k === 'bin') { walk(n.l); walk(n.r); }
    if (n.k === 'neg' || n.k === 'not') walk(n.e);
  }(compile(expression)));
  return [...out];
}

module.exports = { evaluate, check, references, compile, truthy, isBlank, FormulaError, FUNCTION_NAMES };
