-- Platform builder extensions (Genesis Capital PRD, Phase 0):
--   business units + employee membership, information barriers + wall-crossings,
--   tamper-evident audit chain, object/form/SLA config, record BU + barrier stamps,
--   public web-form keys. Additive only.

-- AlterTable
ALTER TABLE `records` ADD COLUMN `barrier_zone_id` INTEGER NULL,
    ADD COLUMN `business_unit_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `sla_policies` ADD COLUMN `config` JSON NULL,
    ADD COLUMN `object_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `ui_forms` ADD COLUMN `config` JSON NULL,
    ADD COLUMN `public_key` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `ui_objects` ADD COLUMN `config` JSON NULL;

-- CreateTable
CREATE TABLE `business_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `legal_name` VARCHAR(200) NULL,
    `regulator` VARCHAR(150) NULL,
    `licence` VARCHAR(200) NULL,
    `base_currency` CHAR(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `business_units_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `business_units_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_business_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(20) NOT NULL,
    `business_unit_id` INTEGER NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `employee_business_units_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `employee_business_units_employee_id_business_unit_id_key`(`employee_id`, `business_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barrier_zones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `barrier_zones_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `barrier_zones_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barrier_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zone_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'member',
    `valid_to` DATETIME(3) NULL,
    `granted_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `barrier_members_employee_id_idx`(`employee_id`),
    INDEX `barrier_members_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `barrier_members_zone_id_employee_id_key`(`zone_id`, `employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wall_crossings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zone_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `requested_by` VARCHAR(20) NULL,
    `decided_by` VARCHAR(20) NULL,
    `decided_at` DATETIME(3) NULL,
    `valid_to` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `wall_crossings_zone_id_status_idx`(`zone_id`, `status`),
    INDEX `wall_crossings_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_chain_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `seq` INTEGER NOT NULL,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `action` VARCHAR(60) NOT NULL,
    `actor` VARCHAR(20) NULL,
    `sensitivity` VARCHAR(20) NOT NULL DEFAULT 'normal',
    `payload` JSON NULL,
    `prev_hash` CHAR(64) NOT NULL,
    `hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `audit_chain_events_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    UNIQUE INDEX `audit_chain_events_tenant_id_seq_key`(`tenant_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `records_business_unit_id_idx` ON `records`(`business_unit_id`);

-- CreateIndex
CREATE INDEX `records_barrier_zone_id_idx` ON `records`(`barrier_zone_id`);

-- CreateIndex
CREATE UNIQUE INDEX `ui_forms_public_key_key` ON `ui_forms`(`public_key`);

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_barrier_zone_id_fkey` FOREIGN KEY (`barrier_zone_id`) REFERENCES `barrier_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_units` ADD CONSTRAINT `business_units_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_business_units` ADD CONSTRAINT `employee_business_units_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_business_units` ADD CONSTRAINT `employee_business_units_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_business_units` ADD CONSTRAINT `employee_business_units_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barrier_zones` ADD CONSTRAINT `barrier_zones_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barrier_members` ADD CONSTRAINT `barrier_members_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `barrier_zones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barrier_members` ADD CONSTRAINT `barrier_members_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barrier_members` ADD CONSTRAINT `barrier_members_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_crossings` ADD CONSTRAINT `wall_crossings_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `barrier_zones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_crossings` ADD CONSTRAINT `wall_crossings_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wall_crossings` ADD CONSTRAINT `wall_crossings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_chain_events` ADD CONSTRAINT `audit_chain_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

