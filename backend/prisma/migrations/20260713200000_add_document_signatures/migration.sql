-- Native e-signature: signature requests + signatories.
--
-- Adds:
--   * `document_signature_requests` — a signing request against a document.
--   * `document_signatories`        — individual signers with public tokens.
--
-- Purely additive.

-- CreateTable
CREATE TABLE `document_signature_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `title` VARCHAR(200) NULL,
    `message` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'sent',
    `ordered` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `certificate_doc_id` INTEGER NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `document_signature_requests_tenant_id_idx`(`tenant_id`),
    INDEX `document_signature_requests_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_signatories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `token` VARCHAR(64) NOT NULL,
    `signature_type` VARCHAR(20) NULL,
    `signature_data` MEDIUMTEXT NULL,
    `decline_reason` TEXT NULL,
    `viewer_ip` VARCHAR(64) NULL,
    `viewed_at` DATETIME(3) NULL,
    `signed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `document_signatories_token_key`(`token`),
    INDEX `document_signatories_tenant_id_idx`(`tenant_id`),
    INDEX `document_signatories_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_signature_requests` ADD CONSTRAINT `document_signature_requests_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_signature_requests` ADD CONSTRAINT `document_signature_requests_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_signatories` ADD CONSTRAINT `document_signatories_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `document_signature_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_signatories` ADD CONSTRAINT `document_signatories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
