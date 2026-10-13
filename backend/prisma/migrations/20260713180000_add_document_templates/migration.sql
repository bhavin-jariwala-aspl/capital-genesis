-- Document merge templates.
--
-- Adds `document_templates` — reusable HTML/text templates with {{placeholder}}
-- tokens, rendered against an entity's data to generate documents.
--
-- Purely additive.

-- CreateTable
CREATE TABLE `document_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `entity_type` VARCHAR(50) NULL,
    `body` MEDIUMTEXT NOT NULL,
    `format` VARCHAR(20) NOT NULL DEFAULT 'html',
    `output_category` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `document_templates_tenant_id_idx`(`tenant_id`),
    INDEX `document_templates_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_templates` ADD CONSTRAINT `document_templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
