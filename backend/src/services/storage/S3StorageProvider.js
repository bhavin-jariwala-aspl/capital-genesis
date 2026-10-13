'use strict';

const { StorageProvider } = require('./StorageProvider');
const { toObjectKey } = require('./objectKey');

/**
 * S3StorageProvider — stores document blobs in an Amazon S3 (or S3-compatible,
 * e.g. MinIO / Cloudflare R2) bucket. Objects are keyed by the same canonical
 * tenant-first key the local driver uses, under an optional key prefix.
 *
 * The AWS SDK is *lazily* required inside the constructor so that deployments
 * running the default `local` driver never need `@aws-sdk/client-s3` installed
 * or loaded.
 *
 * Guarantees mirrored from the interface contract:
 *   - put() is atomic from a reader's perspective — S3 PutObject only exposes
 *     the object once fully written, so no half-write is ever visible.
 *   - delete() is idempotent (S3 DeleteObject succeeds for missing keys).
 *   - Keys are relative; the provider prepends the configured prefix and never
 *     exposes absolute paths to callers.
 */
class S3StorageProvider extends StorageProvider {
  /**
   * @param {object} opts
   * @param {string} opts.bucket
   * @param {string} [opts.region]
   * @param {string} [opts.endpoint]        custom endpoint (MinIO/R2)
   * @param {string} [opts.accessKeyId]     omit to use the default AWS credential chain
   * @param {string} [opts.secretAccessKey]
   * @param {boolean}[opts.forcePathStyle]  required by MinIO / some S3-compatibles
   * @param {string} [opts.prefix]          key prefix inside the bucket
   */
  constructor(opts = {}) {
    super();
    if (!opts.bucket) throw new Error('S3StorageProvider requires a bucket');

    // Lazy import — only pulled in when the s3 driver is actually selected.
    let S3;
    try {
      // eslint-disable-next-line global-require
      S3 = require('@aws-sdk/client-s3');
    } catch {
      throw new Error(
        "STORAGE_DRIVER=s3 requires the '@aws-sdk/client-s3' package. Run: npm install @aws-sdk/client-s3",
      );
    }
    this._S3 = S3;

    this.bucket = opts.bucket;
    // Normalise prefix to at most one trailing slash and no leading slash.
    this.prefix = (opts.prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');

    const clientConfig = {};
    if (opts.region)   clientConfig.region = opts.region;
    if (opts.endpoint) clientConfig.endpoint = opts.endpoint;
    if (opts.forcePathStyle) clientConfig.forcePathStyle = true;
    if (opts.accessKeyId && opts.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      };
    }
    this.client = new S3.S3Client(clientConfig);
  }

  /** Map a relative storage key to the full object key inside the bucket. */
  #objectKey(key) {
    return toObjectKey(this.prefix, key);
  }

  async put(key, buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('put() requires a Buffer');
    const { PutObjectCommand } = this._S3;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.#objectKey(key),
      Body: buffer,
      ContentLength: buffer.length,
    }));
    return { key, size: buffer.length };
  }

  async get(key) {
    const { GetObjectCommand } = this._S3;
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.#objectKey(key),
    }));
    // Body is a Readable in Node — collect it into a Buffer.
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async getStream(key) {
    const { GetObjectCommand } = this._S3;
    const res = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.#objectKey(key),
    }));
    return res.Body; // Node Readable stream
  }

  async delete(key) {
    const { DeleteObjectCommand } = this._S3;
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.#objectKey(key),
      }));
    } catch (err) {
      // Idempotent: a missing object is not an error.
      if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) throw err;
    }
  }

  async exists(key) {
    const { HeadObjectCommand } = this._S3;
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.#objectKey(key),
      }));
      return true;
    } catch (err) {
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }
}

module.exports = { S3StorageProvider };
