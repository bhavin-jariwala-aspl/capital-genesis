'use strict';

const { StorageProvider } = require('./StorageProvider');
const { toObjectKey } = require('./objectKey');

/**
 * GcsStorageProvider — stores document blobs in a Google Cloud Storage bucket.
 * Uses the same canonical tenant-first relative key as every other driver,
 * under an optional key prefix.
 *
 * The `@google-cloud/storage` SDK is lazily required so deployments on other
 * drivers never need it installed.
 *
 * Auth: a service-account key file, or Application Default Credentials (ADC)
 * when neither projectId nor keyFilename is supplied (e.g. Workload Identity).
 */
class GcsStorageProvider extends StorageProvider {
  /**
   * @param {object} opts
   * @param {string} opts.bucket
   * @param {string} [opts.projectId]
   * @param {string} [opts.keyFilename] path to a service-account JSON key
   * @param {string} [opts.prefix]
   */
  constructor(opts = {}) {
    super();
    if (!opts.bucket) throw new Error('GcsStorageProvider requires a bucket');

    let GCS;
    try {
      // eslint-disable-next-line global-require
      GCS = require('@google-cloud/storage');
    } catch {
      throw new Error("STORAGE_DRIVER=gcs requires the '@google-cloud/storage' package. Run: npm install @google-cloud/storage");
    }

    this.prefix = opts.prefix || '';
    const cfg = {};
    if (opts.projectId) cfg.projectId = opts.projectId;
    if (opts.keyFilename) cfg.keyFilename = opts.keyFilename;
    this.bucket = new GCS.Storage(cfg).bucket(opts.bucket);
  }

  #file(key) {
    return this.bucket.file(toObjectKey(this.prefix, key));
  }

  async put(key, buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('put() requires a Buffer');
    await this.#file(key).save(buffer, { resumable: false });
    return { key, size: buffer.length };
  }

  async get(key) {
    const [buf] = await this.#file(key).download();
    return buf;
  }

  async getStream(key) {
    return this.#file(key).createReadStream(); // Node Readable
  }

  async delete(key) {
    await this.#file(key).delete({ ignoreNotFound: true }); // idempotent
  }

  async exists(key) {
    const [exists] = await this.#file(key).exists();
    return exists;
  }
}

module.exports = { GcsStorageProvider };
