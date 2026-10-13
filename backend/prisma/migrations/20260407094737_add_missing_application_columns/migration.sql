-- AlterTable
ALTER TABLE `insurance_applications` ADD COLUMN `date_of_birth` DATE NULL,
    ADD COLUMN `health_class` VARCHAR(30) NULL,
    ADD COLUMN `payment_frequency` VARCHAR(20) NULL,
    ADD COLUMN `term_years` INTEGER NULL;

-- CreateTable
CREATE TABLE `application_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `record_id` INTEGER NULL,
    `document_ref` VARCHAR(100) NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `stored_filename` VARCHAR(255) NULL,
    `category` VARCHAR(50) NOT NULL,
    `mime_type` VARCHAR(100) NULL,
    `file_size` INTEGER NULL,
    `file_path` VARCHAR(500) NULL,
    `file_hash` VARCHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(30) NOT NULL DEFAULT 'uploaded',
    `uploaded_by` VARCHAR(20) NULL,
    `uploaded_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_by` VARCHAR(20) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `application_documents_record_id_key`(`record_id`),
    INDEX `application_documents_application_id_idx`(`application_id`),
    INDEX `application_documents_status_idx`(`status`),
    INDEX `application_documents_category_idx`(`category`),
    INDEX `application_documents_file_hash_idx`(`file_hash`),
    INDEX `application_documents_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
