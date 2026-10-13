/**
 * Genesis CRM — Backend Configuration
 */
'use strict';

const config = {
  env:    process.env.NODE_ENV || 'development',
  port:   parseInt(process.env.PORT || '3001', 10),
  host:   process.env.HOST || '0.0.0.0',

  jwt: {
    secret: process.env.JWT_SECRET || 'genesis-default-dev-secret-replace-in-prod',
    expiry: process.env.JWT_EXPIRY  || '8h',
  },

  redis: {
    host:     process.env.REDIS_HOST     || '127.0.0.1',
    port:     parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db:       parseInt(process.env.REDIS_DB || '0', 10),
  },

  cache: {
    ttlMetadata: parseInt(process.env.CACHE_TTL_METADATA || '3600', 10), // 1 hour
    ttlSession:  parseInt(process.env.CACHE_TTL_SESSION  || '28800', 10), // 8 hours
    prefix:      'genesis:',
  },

  storage: {
    // Blob-storage backend for documents. 'local' (default) or 's3'.
    driver: process.env.STORAGE_DRIVER || 'local',
    // Root directory for the local driver. Absolute, or relative to backend/.
    root: process.env.STORAGE_ROOT
      ? require('path').resolve(process.env.STORAGE_ROOT)
      : require('path').join(__dirname, '..', '..', 'uploads'),
    maxFileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || String(25 * 1024 * 1024), 10), // 25 MB
    // S3 (or S3-compatible: MinIO, Cloudflare R2, Backblaze B2, DO Spaces,
    // Wasabi). Used only when driver='s3'. Credentials may be omitted to use the
    // default AWS credential chain (IAM role / instance profile / shared config).
    s3: {
      bucket:          process.env.STORAGE_S3_BUCKET || '',
      region:          process.env.STORAGE_S3_REGION || process.env.AWS_REGION || 'us-east-1',
      endpoint:        process.env.STORAGE_S3_ENDPOINT || undefined,
      accessKeyId:     process.env.STORAGE_S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle:  process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true',
      prefix:          process.env.STORAGE_S3_PREFIX || '',
    },
    // Azure Blob Storage. Used only when driver='azure'. Provide a connection
    // string, or an account name + account key.
    azure: {
      container:        process.env.STORAGE_AZURE_CONTAINER || '',
      connectionString: process.env.STORAGE_AZURE_CONNECTION_STRING || undefined,
      account:          process.env.STORAGE_AZURE_ACCOUNT || undefined,
      accountKey:       process.env.STORAGE_AZURE_ACCOUNT_KEY || undefined,
      prefix:           process.env.STORAGE_AZURE_PREFIX || '',
    },
    // Google Cloud Storage. Used only when driver='gcs'. Omit projectId/keyFile
    // to use Application Default Credentials (Workload Identity, gcloud auth).
    gcs: {
      bucket:      process.env.STORAGE_GCS_BUCKET || '',
      projectId:   process.env.STORAGE_GCS_PROJECT_ID || undefined,
      keyFilename: process.env.STORAGE_GCS_KEY_FILE || undefined,
      prefix:      process.env.STORAGE_GCS_PREFIX || '',
    },
  },

  isDev:  process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
};

module.exports = config;
