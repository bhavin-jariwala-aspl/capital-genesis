-- CreateTable
CREATE TABLE `status_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `status` VARCHAR(60) NOT NULL,
    `title` VARCHAR(200) NULL,
    `description` TEXT NULL,
    `location` VARCHAR(200) NULL,
    `event_type` VARCHAR(30) NOT NULL DEFAULT 'milestone',
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `changed_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `status_events_record_id_occurred_at_idx`(`record_id`, `occurred_at`),
    INDEX `status_events_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `status_events` ADD CONSTRAINT `status_events_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `status_events` ADD CONSTRAINT `status_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
