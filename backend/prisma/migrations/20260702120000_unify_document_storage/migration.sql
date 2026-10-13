-- Unify document storage.
--
-- Consolidates the separate `application_documents` table into the single
-- `documents` table, enriches `documents` with integrity/versioning/review
-- columns, replaces the absolute `file_path` with a relative `stored_key`, and
-- generalises the owner link to `entity_type` / `entity_id` / `application_id`.
--
-- NOTE: this assumes no production document bytes exist yet (the uploads
-- directory is empty). If a live deployment already has rows in
-- `application_documents`, copy them into `documents` BEFORE running the
-- DropTable below, and re-key their files into the new tenant-first layout —
-- their old `file_path` values are absolute and are NOT valid `stored_key`s.

-- DropForeignKey
ALTER TABLE `application_documents` DROP FOREIGN KEY `application_documents_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `application_documents` DROP FOREIGN KEY `application_documents_tenant_id_fkey`;

-- DropIndex
DROP INDEX `documents_filename_idx` ON `documents`;

-- DropIndex
DROP INDEX `documents_related_to_id_related_to_type_idx` ON `documents`;

-- AlterTable
ALTER TABLE `documents` DROP COLUMN `file_path`,
    DROP COLUMN `filename`,
    DROP COLUMN `related_to_id`,
    DROP COLUMN `related_to_type`,
    ADD COLUMN `application_id` INTEGER NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `document_ref` VARCHAR(100) NULL,
    ADD COLUMN `entity_id` INTEGER NULL,
    ADD COLUMN `entity_type` VARCHAR(50) NULL,
    ADD COLUMN `file_hash` VARCHAR(64) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `original_filename` VARCHAR(255) NOT NULL,
    ADD COLUMN `rejection_reason` TEXT NULL,
    ADD COLUMN `reviewed_at` DATETIME(3) NULL,
    ADD COLUMN `reviewed_by` VARCHAR(20) NULL,
    ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'uploaded',
    ADD COLUMN `stored_key` VARCHAR(500) NOT NULL,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    ADD COLUMN `uploaded_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    MODIFY `file_size` INTEGER NULL;

-- DropTable
DROP TABLE `application_documents`;

-- CreateIndex
CREATE INDEX `documents_entity_type_entity_id_idx` ON `documents`(`entity_type`, `entity_id`);

-- CreateIndex
CREATE INDEX `documents_application_id_idx` ON `documents`(`application_id`);

-- CreateIndex
CREATE INDEX `documents_status_idx` ON `documents`(`status`);

-- CreateIndex
CREATE INDEX `documents_file_hash_idx` ON `documents`(`file_hash`);

-- CreateIndex
CREATE INDEX `documents_original_filename_idx` ON `documents`(`original_filename`);

-- CreateIndex
CREATE INDEX `documents_deleted_at_idx` ON `documents`(`deleted_at`);

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
