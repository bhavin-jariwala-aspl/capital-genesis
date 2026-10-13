-- CreateTable
CREATE TABLE `social_assignment_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(50) NULL,
    `name` VARCHAR(100) NOT NULL,
    `rule_type` VARCHAR(30) NOT NULL,
    `conditions` JSON NULL,
    `assignee_id` VARCHAR(20) NULL,
    `pool_ids` JSON NULL,
    `fallback_id` VARCHAR(20) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_index` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_assign_rules_lookup_idx`(`tenant_id`, `platform`, `is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_assignment_rules` ADD CONSTRAINT `social_assignment_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
