-- CreateTable
CREATE TABLE `sla_business_hours` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `timezone_label` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `utc_offset_minutes` INTEGER NOT NULL DEFAULT 0,
    `weekly` JSON NOT NULL,
    `holidays` JSON NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `sla_business_hours_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sla_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `conditions` JSON NULL,
    `pause_statuses` JSON NULL,
    `business_hours_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `sla_policies_tenant_id_entity_type_is_active_order_index_idx`(`tenant_id`, `entity_type`, `is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sla_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `metric` VARCHAR(30) NOT NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT '*',
    `target_minutes` INTEGER NOT NULL,
    `warning_pct` INTEGER NOT NULL DEFAULT 80,

    INDEX `sla_targets_policy_id_idx`(`policy_id`),
    UNIQUE INDEX `sla_targets_policy_id_metric_priority_key`(`policy_id`, `metric`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sla_escalations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `metric` VARCHAR(30) NOT NULL,
    `trigger` VARCHAR(20) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `config` JSON NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `sla_escalations_policy_id_idx`(`policy_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sla_instances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `metric` VARCHAR(30) NOT NULL,
    `priority` VARCHAR(20) NOT NULL,
    `owner_id` VARCHAR(20) NULL,
    `target_minutes` INTEGER NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `warning_at` DATETIME(3) NOT NULL,
    `paused_at` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'running',
    `warned` BOOLEAN NOT NULL DEFAULT false,
    `breached` BOOLEAN NOT NULL DEFAULT false,
    `completed_at` DATETIME(3) NULL,
    `breached_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `sla_instances_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `sla_instances_status_due_at_idx`(`status`, `due_at`),
    INDEX `sla_instances_owner_id_idx`(`owner_id`),
    INDEX `sla_instances_policy_id_idx`(`policy_id`),
    UNIQUE INDEX `sla_instances_entity_type_entity_id_metric_key`(`entity_type`, `entity_id`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sla_business_hours` ADD CONSTRAINT `sla_business_hours_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_policies` ADD CONSTRAINT `sla_policies_business_hours_id_fkey` FOREIGN KEY (`business_hours_id`) REFERENCES `sla_business_hours`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_policies` ADD CONSTRAINT `sla_policies_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_targets` ADD CONSTRAINT `sla_targets_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `sla_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_escalations` ADD CONSTRAINT `sla_escalations_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `sla_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_instances` ADD CONSTRAINT `sla_instances_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `sla_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sla_instances` ADD CONSTRAINT `sla_instances_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
