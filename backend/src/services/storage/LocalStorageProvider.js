'use strict';

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { StorageProvider } = require('./StorageProvider');

/**
 * LocalStorageProvider — stores blobs on the local filesystem under a single
 * configurable root directory.
 *
 * Guarantees:
 *   - Atomic writes: contents are streamed to a temp file, fsync'd, then
 *     renamed into place. A concurrent reader sees either the old object or
 *     the complete new one — never a partial write.
 *   - Path containment: every resolved absolute path is asserted to live
 *     inside the root, so a malicious/buggy key (".." segments, absolute
 *     paths) can never read or write outside the storage area.
 */
class LocalStorageProvider extends StorageProvider {
  /** @param {{ root: string }} opts */
  constructor({ root }) {
    super();
    if (!root) throw new Error('LocalStorageProvider requires a root directory');
    this.root = path.resolve(root);
  }

  /**
   * Resolve a relative key to an absolute path, asserting it stays under root.
   * @param {string} key
   * @returns {string} absolute path
   */
  resolveKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
      throw Object.assign(new Error('Invalid storage key'), { statusCode: 400 });
    }
    // Normalise to POSIX separators, strip any leading slashes so the key is
    // always treated as relative to the root.
    const normalised = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const abs = path.resolve(this.root, normalised);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (abs !== this.root && !abs.startsWith(rootWithSep)) {
      throw Object.assign(new Error('Resolved path escapes storage root'), { statusCode: 400 });
    }
    return abs;
  }

  async put(key, buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('put() requires a Buffer');
    const abs = this.resolveKey(key);
    const dir = path.dirname(abs);
    await fsp.mkdir(dir, { recursive: true });

    // Write to a unique temp file in the same directory (so rename is atomic
    // on the same filesystem), fsync, then atomically rename into place.
    const tmp = path.join(dir, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
    let handle;
    try {
      handle = await fsp.open(tmp, 'wx');
      await handle.writeFile(buffer);
      await handle.sync();
      await handle.close();
      handle = null;
      await fsp.rename(tmp, abs);
    } catch (err) {
      if (handle) { try { await handle.close(); } catch { /* ignore */ } }
      try { await fsp.unlink(tmp); } catch { /* ignore */ }
      throw err;
    }
    return { key, size: buffer.length };
  }

  async get(key) {
    return fsp.readFile(this.resolveKey(key));
  }

  async getStream(key) {
    const abs = this.resolveKey(key);
    // Surface a missing file as an error before returning the stream.
    await fsp.access(abs);
    return fs.createReadStream(abs);
  }

  async delete(key) {
    try {
      await fsp.unlink(this.resolveKey(key));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // idempotent: missing = success
    }
  }

  async exists(key) {
    try {
      await fsp.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { LocalStorageProvider };
