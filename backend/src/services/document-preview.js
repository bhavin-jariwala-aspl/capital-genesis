'use strict';

/**
 * document-preview — build an in-browser previewable representation of a
 * document so users can view it before downloading.
 *
 * Types are grouped into four render "kinds":
 *   - native       : the browser renders the original bytes as-is
 *                    (application/pdf, image/*). Served inline; no conversion.
 *   - text         : text/plain, csv, json — served inline as UTF-8 text.
 *   - convert      : Office formats that don't render natively in a browser are
 *                    converted server-side to sanitisable HTML:
 *                      · .docx  → mammoth (raw → styled HTML)
 *                      · .xlsx/.xls → SheetJS (sheets → HTML tables)
 *   - unsupported  : anything else (e.g. .pptx) — a small notice page is
 *                    returned so the preview surface degrades gracefully.
 *
 * Heavy parsers (mammoth, xlsx) are lazy-required so they load only when a
 * matching document is actually previewed. Any conversion failure resolves to
 * the unsupported notice rather than throwing — a preview must never 500.
 *
 * Everything this module emits for the `convert`/`text`/`unsupported` kinds is
 * meant to be served with `Content-Security-Policy: sandbox` and rendered inside
 * a sandboxed iframe, so converted markup can never execute script.
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME  = 'application/vnd.ms-excel';

// Bound conversion work so a huge Office file can't stall the request.
const MAX_CONVERT_BYTES = 20 * 1024 * 1024;

function isNative(mime) {
  return mime === 'application/pdf' || mime.startsWith('image/');
}

function isTextual(mime) {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv';
}

function isConvertible(mime) {
  return mime === DOCX_MIME || mime === XLSX_MIME || mime === XLS_MIME;
}

/**
 * Classify a MIME type into a render kind.
 * @param {string} [mimeType]
 * @returns {'native'|'text'|'convert'|'unsupported'}
 */
function classify(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (isNative(mime)) return 'native';
  if (isTextual(mime)) return 'text';
  if (isConvertible(mime)) return 'convert';
  return 'unsupported';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Wrap an HTML fragment in a minimal, self-contained, print-friendly document. */
function htmlDocument(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${escapeHtml(title || 'Preview')}</title><style>`
    + `*{box-sizing:border-box}`
    + `body{margin:0;padding:24px;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2430;background:#fff}`
    + `img{max-width:100%;height:auto}`
    + `table{border-collapse:collapse;width:100%;font-size:13px;margin:0 0 16px}`
    + `th,td{border:1px solid #e2e4ea;padding:6px 10px;text-align:left;vertical-align:top}`
    + `th{background:#f6f7f9;font-weight:600}`
    + `h1,h2,h3{line-height:1.25}`
    + `.preview-empty{color:#8a8f9c;text-align:center;padding:48px 0}`
    + `</style></head><body>${bodyHtml}</body></html>`;
}

/** A graceful notice page for file types that cannot be previewed inline. */
function unsupportedHtml(filename, mimeType) {
  const body = `<div class="preview-empty">`
    + `<p style="font-size:15px;font-weight:600;color:#4b5160;margin-bottom:6px">Preview isn't available for this file type.</p>`
    + `<p>${escapeHtml(filename || 'This document')}${mimeType ? ` (${escapeHtml(mimeType)})` : ''} can't be shown in the browser.<br>Download the file to view it.</p>`
    + `</div>`;
  return htmlDocument(filename || 'Preview', body);
}

/**
 * Convert an Office document buffer into a sandbox-safe HTML string.
 * @returns {Promise<string|null>} HTML document, or null when conversion isn't possible.
 */
async function convertToHtml(buffer, mimeType, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.length > MAX_CONVERT_BYTES) return null;
  const mime = String(mimeType || '').toLowerCase();

  try {
    if (mime === DOCX_MIME) {
      // eslint-disable-next-line global-require
      const mammoth = require('mammoth');
      const res = await mammoth.convertToHtml({ buffer });
      const inner = res?.value?.trim();
      return htmlDocument(filename, inner || `<div class="preview-empty">This document has no visible content.</div>`);
    }

    if (mime === XLSX_MIME || mime === XLS_MIME) {
      // eslint-disable-next-line global-require
      const xlsx = require('xlsx');
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const sheets = wb.SheetNames.map((name) => {
        const table = xlsx.utils.sheet_to_html(wb.Sheets[name], { editable: false });
        return `<h3>${escapeHtml(name)}</h3>${table}`;
      });
      const inner = sheets.length ? sheets.join('\n') : `<div class="preview-empty">This workbook has no sheets.</div>`;
      return htmlDocument(filename, inner);
    }
  } catch {
    // Best-effort: fall back to the unsupported notice rather than failing.
    return null;
  }

  return null;
}

/**
 * Build a safe `Content-Disposition` header value. `filename` is user-supplied,
 * so a raw interpolation would let a quote or CRLF corrupt the header. Emit an
 * ASCII-only quoted fallback plus an RFC 5987 `filename*` for Unicode fidelity.
 */
function contentDisposition(filename, type = 'attachment') {
  const name = String(filename || 'download');
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Whether the tenant's "Show Document Preview Button" toggle
 * (BUILDER > Document Management) is on. Defaults to true (unset = enabled).
 */
async function previewEnabled(prisma, tenantId) {
  if (tenantId == null) return true;
  try {
    // eslint-disable-next-line global-require
    const SettingsService = require('./settings.service');
    const { values } = await new SettingsService(prisma).getSettings(tenantId);
    return values['documents.show_preview_button'] !== false;
  } catch {
    return true;
  }
}

/**
 * Stream an in-browser previewable representation of `doc` onto `reply`.
 *   - native (pdf/image) → original bytes, inline
 *   - text               → UTF-8 text, inline
 *   - convert (docx/xlsx) → sandbox-safe HTML
 *   - unsupported / failed conversion → a graceful HTML notice
 * Converted/text/notice responses carry `Content-Security-Policy: sandbox` so
 * they are inert when a public link renders them straight into an iframe.
 *
 * @param {import('fastify').FastifyReply} reply
 * @param {import('./document.service')} service  a DocumentService instance
 * @param {object} doc                            a document row
 */
async function sendPreview(reply, service, doc) {
  const mime = String(doc.mime_type || '').toLowerCase();
  const kind = classify(mime);
  const sandboxed = (r) => r
    .header('Content-Security-Policy', 'sandbox')
    .header('X-Content-Type-Options', 'nosniff');

  if (kind === 'native') {
    try {
      const { stream, mimeType, filename } = await service.openStream(doc);
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', contentDisposition(filename, 'inline'))
        .send(stream);
    } catch {
      return reply.code(404).send({ error: 'File not found in storage' });
    }
  }

  let buffer;
  try {
    buffer = await service.readBuffer(doc);
  } catch {
    return reply.code(404).send({ error: 'File not found in storage' });
  }

  if (kind === 'text') {
    return sandboxed(reply)
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', contentDisposition(doc.original_filename, 'inline'))
      .send(buffer);
  }

  if (kind === 'convert') {
    const html = await convertToHtml(buffer, mime, doc.original_filename);
    if (html) {
      return sandboxed(reply)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    }
  }

  return sandboxed(reply)
    .header('Content-Type', 'text/html; charset=utf-8')
    .send(unsupportedHtml(doc.original_filename, doc.mime_type));
}

module.exports = {
  classify,
  convertToHtml,
  htmlDocument,
  unsupportedHtml,
  contentDisposition,
  previewEnabled,
  sendPreview,
  MAX_CONVERT_BYTES,
};
