'use strict';

const { StorageProvider } = require('./StorageProvider');
const { toObjectKey } = require('./objectKey');

/**
 * AzureBlobStorageProvider — stores document blobs in an Azure Blob Storage
 * container. Objects use the same canonical tenant-first relative key as every
 * other driver, under an optional key prefix.
 *
 * The `@azure/storage-blob` SDK is lazily required so deployments on other
 * drivers never need it installed.
 *
 * Auth: a connection string, or an account name + account key.
 */
class AzureBlobStorageProvider extends StorageProvider {
  /**
   * @param {object} opts
   * @param {string} opts.container
   * @param {string} [opts.connectionString]
   * @param {string} [opts.account]
   * @param {string} [opts.accountKey]
   * @param {string} [opts.prefix]
   */
  constructor(opts = {}) {
    super();
    if (!opts.container) throw new Error('AzureBlobStorageProvider requires a container');

    let Azure;
    try {
      // eslint-disable-next-line global-require
      Azure = require('@azure/storage-blob');
    } catch {
      throw new Error("STORAGE_DRIVER=azure requires the '@azure/storage-blob' package. Run: npm install @azure/storage-blob");
    }

    this.prefix = opts.prefix || '';
    const { BlobServiceClient, StorageSharedKeyCredential } = Azure;

    let service;
    if (opts.connectionString) {
      service = BlobServiceClient.fromConnectionString(opts.connectionString);
    } else if (opts.account && opts.accountKey) {
      const cred = new StorageSharedKeyCredential(opts.account, opts.accountKey);
      service = new BlobServiceClient(`https://${opts.account}.blob.core.windows.net`, cred);
    } else {
      throw new Error('Azure storage requires either a connection string or an account name + account key');
    }
    this.container = service.getContainerClient(opts.container);
  }

  #blob(key) {
    return this.container.getBlockBlobClient(toObjectKey(this.prefix, key));
  }

  async put(key, buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('put() requires a Buffer');
    await this.#blob(key).uploadData(buffer);
    return { key, size: buffer.length };
  }

  async get(key) {
    return this.#blob(key).downloadToBuffer();
  }

  async getStream(key) {
    const res = await this.#blob(key).download();
    return res.readableStreamBody; // Node Readable
  }

  async delete(key) {
    await this.#blob(key).deleteIfExists(); // idempotent
  }

  async exists(key) {
    return this.#blob(key).exists();
  }
}

module.exports = { AzureBlobStorageProvider };
