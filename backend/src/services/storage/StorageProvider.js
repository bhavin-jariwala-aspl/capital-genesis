'use strict';

/**
 * StorageProvider — abstract blob-storage interface.
 *
 * All document I/O in the backend goes through an implementation of this
 * interface, so the physical backend (local disk, S3, Azure Blob, …) can be
 * swapped without touching any route or service. Callers deal only in
 * *relative keys* — never absolute filesystem paths — which keeps the database
 * portable across deploys and prevents server-layout leakage.
 *
 * A "key" is a POSIX-style relative path, e.g.
 *   "12/application/5/proof_of_income/9f3c…_passport.pdf"
 *
 * Implementations MUST:
 *   - treat writes as atomic (a reader never sees a half-written object)
 *   - reject keys that escape the storage root (path traversal)
 *   - be safe to call concurrently
 */
class StorageProvider {
  /**
   * Persist a buffer at `key`, overwriting any existing object atomically.
   * @param {string} key      relative storage key
   * @param {Buffer} buffer   file contents
   * @returns {Promise<{ key: string, size: number }>}
   */
  async put(key, buffer) { // eslint-disable-line no-unused-vars
    throw new Error('StorageProvider.put() not implemented');
  }

  /**
   * Read an object fully into memory.
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async get(key) { // eslint-disable-line no-unused-vars
    throw new Error('StorageProvider.get() not implemented');
  }

  /**
   * Open a readable stream for an object (preferred for large downloads).
   * @param {string} key
   * @returns {Promise<import('stream').Readable>}
   */
  async getStream(key) { // eslint-disable-line no-unused-vars
    throw new Error('StorageProvider.getStream() not implemented');
  }

  /**
   * Remove an object. Missing objects resolve successfully (idempotent).
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) { // eslint-disable-line no-unused-vars
    throw new Error('StorageProvider.delete() not implemented');
  }

  /**
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) { // eslint-disable-line no-unused-vars
    throw new Error('StorageProvider.exists() not implemented');
  }
}

module.exports = { StorageProvider };
