-- AlterTable
ALTER TABLE `custom_reports` ADD COLUMN `folder_id` INTEGER NULL,
    ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'private';

-- CreateTable
CREATE TABLE `report_folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `color` VARCHAR(20) NULL,
    `parent_id` INTEGER NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `report_folders_parent_id_idx`(`parent_id`),
    INDEX `report_folders_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `frequency` VARCHAR(20) NOT NULL,
    `hour` INTEGER NOT NULL DEFAULT 8,
    `day_of_week` INTEGER NULL,
    `day_of_month` INTEGER NULL,
    `format` VARCHAR(10) NOT NULL DEFAULT 'xlsx',
    `recipients` JSON NULL,
    `scope` VARCHAR(10) NOT NULL DEFAULT 'all',
    `subject` VARCHAR(255) NULL,
    `message` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_sent_at` DATETIME(3) NULL,
    `last_status` VARCHAR(20) NULL,
    `last_error` TEXT NULL,
    `next_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `report_subscriptions_report_id_idx`(`report_id`),
    INDEX `report_subscriptions_employee_id_idx`(`employee_id`),
    INDEX `report_subscriptions_is_active_next_run_at_idx`(`is_active`, `next_run_at`),
    INDEX `report_subscriptions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `report_favorites_employee_id_idx`(`employee_id`),
    INDEX `report_favorites_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `report_favorites_report_id_employee_id_key`(`report_id`, `employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `custom_reports_folder_id_idx` ON `custom_reports`(`folder_id`);

-- AddForeignKey
ALTER TABLE `custom_reports` ADD CONSTRAINT `custom_reports_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `report_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_folders` ADD CONSTRAINT `report_folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `report_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_folders` ADD CONSTRAINT `report_folders_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_subscriptions` ADD CONSTRAINT `report_subscriptions_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `custom_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_subscriptions` ADD CONSTRAINT `report_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_favorites` ADD CONSTRAINT `report_favorites_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `custom_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_favorites` ADD CONSTRAINT `report_favorites_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

