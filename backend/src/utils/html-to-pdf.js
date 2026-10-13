'use strict';

/**
 * html-to-pdf.js
 *
 * Converts an HTML string to a PDF buffer using Google Chrome / Chromium in
 * headless mode.  No extra npm packages required — uses the system-installed
 * browser and Node's built-in `child_process`.
 *
 * Falls back gracefully: if Chrome is not found, returns null so the caller
 * can fall back to sending the HTML inline.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs            = require('fs');
const fsp           = require('fs/promises');
const os            = require('os');
const path          = require('path');

const execFileAsync = promisify(execFile);

// ── Detect the Chrome / Chromium executable ──────────────────────────────────

const CHROME_CANDIDATES = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  'google-chrome',
  'google-chrome-stable',
  'chromium-browser',
  'chromium',
  // Windows (common paths)
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function detectChrome() {
  const envChrome = process.env.CHROME_EXECUTABLE;
  if (envChrome && fs.existsSync(envChrome)) return envChrome;

  for (const candidate of CHROME_CANDIDATES) {
    // For absolute paths, check existence directly
    if (candidate.startsWith('/') || candidate.includes('\\')) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      // For PATH-relative names, return as-is and let execFile resolve them
      // (execFile will throw if not found — caught by caller)
      return candidate;
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Convert an HTML string to a PDF buffer.
 *
 * @param {string} html          – Full HTML document string
 * @param {object} [opts]
 * @param {string} [opts.format] – Paper format: 'A4' (default) | 'Letter'
 * @param {number} [opts.timeoutMs] – Max wait for Chrome (default 30 000 ms)
 * @returns {Promise<Buffer|null>} PDF bytes, or null if Chrome not available
 */
async function htmlToPdf(html, opts = {}) {
  const chrome = detectChrome();
  if (!chrome) return null;

  const format    = opts.format    || 'A4';
  const timeout   = opts.timeoutMs || 30_000;

  // Write HTML to a temp file (Chrome needs a file:// URL or data URL)
  const tmpDir  = os.tmpdir();
  const tmpHtml = path.join(tmpDir, `genesis-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  const tmpPdf  = tmpHtml.replace('.html', '.pdf');

  try {
    await fsp.writeFile(tmpHtml, html, 'utf8');

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--no-pdf-header-footer',
      `--print-to-pdf=${tmpPdf}`,
      '--virtual-time-budget=5000',
      `file://${tmpHtml}`,
    ];

    await execFileAsync(chrome, args, { timeout });

    try {
      const pdfBuffer = await fsp.readFile(tmpPdf);
      return pdfBuffer;
    } catch {
      return null;
    }
  } catch (err) {
    // Chrome not in PATH or crashed — fail gracefully
    const { logger } = require('../services/logging.service');
    logger?.warn?.('[html-to-pdf] Chrome PDF generation failed:', err.message);
    return null;
  } finally {
    // Clean up temp files asynchronously
    await Promise.allSettled([
      fsp.unlink(tmpHtml),
      fsp.unlink(tmpPdf),
    ]);
  }
}

module.exports = { htmlToPdf, detectChrome };
