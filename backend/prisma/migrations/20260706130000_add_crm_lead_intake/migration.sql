-- CreateTable
CREATE TABLE `crm_lead_intake` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `company` VARCHAR(255) NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `job_title` VARCHAR(100) NULL,
    `lead_source` VARCHAR(100) NULL,
    `lead_status` VARCHAR(50) NOT NULL DEFAULT 'new',
    `rating` VARCHAR(20) NULL,
    `industry` VARCHAR(100) NULL,
    `annual_revenue` DECIMAL(18, 2) NULL,
    `website` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `is_converted` BOOLEAN NOT NULL DEFAULT false,
    `converted_at` DATETIME(3) NULL,
    `converted_prospect_id` INTEGER NULL,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_lead_intake_record_id_key`(`record_id`),
    INDEX `crm_lead_intake_email_idx`(`email`),
    INDEX `crm_lead_intake_lead_status_idx`(`lead_status`),
    INDEX `crm_lead_intake_owner_id_idx`(`owner_id`),
    INDEX `crm_lead_intake_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `crm_lead_intake` ADD CONSTRAINT `crm_lead_intake_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_intake` ADD CONSTRAINT `crm_lead_intake_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_intake` ADD CONSTRAINT `crm_lead_intake_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

