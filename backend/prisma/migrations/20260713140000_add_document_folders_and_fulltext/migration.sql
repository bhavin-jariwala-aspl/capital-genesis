-- Document folders + full-text search.
--
-- Adds:
--   * `document_folders`  — hierarchical, self-referential folders (per tenant).
--   * `documents.folder_id`     — optional link to an organising folder.
--   * `documents.content_text`  — extracted plain text (pdf/docx/txt) for search.
--   * a FULLTEXT index over filename/description/content_text.
--
-- Additive: existing columns and data are untouched.

-- CreateTable
CREATE TABLE `document_folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `parent_id` INTEGER NULL,
    `path` VARCHAR(1000) NOT NULL DEFAULT '/',
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `document_folders_tenant_id_idx`(`tenant_id`),
    INDEX `document_folders_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `documents`
    ADD COLUMN `folder_id` INTEGER NULL,
    ADD COLUMN `content_text` MEDIUMTEXT NULL;

-- CreateIndex
CREATE INDEX `documents_folder_id_idx` ON `documents`(`folder_id`);

-- CreateIndex (full-text)
CREATE FULLTEXT INDEX `documents_fulltext` ON `documents`(`original_filename`, `description`, `content_text`);

-- AddForeignKey
ALTER TABLE `document_folders` ADD CONSTRAINT `document_folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `document_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_folders` ADD CONSTRAINT `document_folders_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `document_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
