-- Document Management builder configuration.
--
-- Adds two tenant-scoped config tables that back the standalone DMS builder:
--   * `ui_document_categories`  — configurable document categories with
--     per-category MIME allow-list, size cap, retention and review policy.
--   * `ui_document_checklists`  — required-document checklists per owner
--     entity type (items reference category codes as JSON).
--
-- Purely additive: no existing table is altered or dropped.

-- CreateTable
CREATE TABLE `ui_document_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `allowed_mime` JSON NULL,
    `max_file_mb` INTEGER NULL,
    `retention_days` INTEGER NULL,
    `review_required` BOOLEAN NOT NULL DEFAULT false,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `color` VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_document_categories_tenant_id_idx`(`tenant_id`),
    INDEX `ui_document_categories_is_active_order_index_idx`(`is_active`, `order_index`),
    UNIQUE INDEX `ui_document_categories_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_document_checklists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(50) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `items` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_document_checklists_tenant_id_idx`(`tenant_id`),
    INDEX `ui_document_checklists_entity_type_idx`(`entity_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ui_document_categories` ADD CONSTRAINT `ui_document_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_document_checklists` ADD CONSTRAINT `ui_document_checklists_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
