'use strict';

/**
 * Best-effort plain-text extraction for full-text search.
 *
 * Extracts searchable text from a document buffer based on its MIME type:
 *   - text/*, csv, json   → decoded as UTF-8
 *   - application/pdf     → pdf-parse
 *   - .docx               → mammoth
 *   - everything else     → null (e.g. images; OCR is a future enhancement)
 *
 * Heavy parsers (pdf-parse, mammoth) are lazy-required so they are only loaded
 * when a matching document is actually uploaded. Extraction is advisory — any
 * failure resolves to null and never blocks an upload.
 */

// Cap stored text so a huge document can't bloat the row / FULLTEXT index.
const MAX_CHARS = 200_000;
// Skip extraction for very large buffers to bound upload latency.
const MAX_EXTRACT_BYTES = 20 * 1024 * 1024;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function clamp(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;
}

/**
 * @param {Buffer} buffer
 * @param {string} [mimeType]
 * @returns {Promise<string|null>} extracted text, or null when not extractable
 */
async function extractText(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.length > MAX_EXTRACT_BYTES) return null;
  const mime = (mimeType || '').toLowerCase();

  try {
    if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv') {
      return clamp(buffer.toString('utf8'));
    }

    if (mime === 'application/pdf') {
      // eslint-disable-next-line global-require
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      try {
        const res = await parser.getText();
        return clamp(res?.text);
      } finally {
        await parser.destroy?.().catch(() => {});
      }
    }

    if (mime === DOCX_MIME) {
      // eslint-disable-next-line global-require
      const mammoth = require('mammoth');
      const res = await mammoth.extractRawText({ buffer });
      return clamp(res?.value);
    }
  } catch {
    // Best-effort: never let extraction failure surface to the caller.
    return null;
  }

  return null;
}

module.exports = { extractText, MAX_CHARS };
