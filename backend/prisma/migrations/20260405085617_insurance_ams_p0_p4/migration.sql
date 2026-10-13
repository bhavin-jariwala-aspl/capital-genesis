-- AlterTable
ALTER TABLE `commission_entries` ADD COLUMN `commission_type` VARCHAR(30) NOT NULL DEFAULT 'first_year',
    ADD COLUMN `expected_amount` DECIMAL(18, 2) NULL,
    ADD COLUMN `statement_id` INTEGER NULL,
    ADD COLUMN `variance` DECIMAL(18, 2) NULL;

-- AlterTable
ALTER TABLE `insurance_claims` ADD COLUMN `fnol_received_at` DATETIME(3) NULL,
    ADD COLUMN `is_fraud_flagged` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_litigation` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `litigation_details` TEXT NULL,
    ADD COLUMN `loss_date` DATE NULL,
    ADD COLUMN `loss_description` TEXT NULL,
    ADD COLUMN `loss_location` VARCHAR(500) NULL,
    ADD COLUMN `reporter_name` VARCHAR(255) NULL,
    ADD COLUMN `reporter_phone` VARCHAR(50) NULL,
    ADD COLUMN `reporter_relationship` VARCHAR(100) NULL,
    ADD COLUMN `reserve_amount` DECIMAL(18, 2) NULL;

-- CreateTable
CREATE TABLE `quote_scenarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scenario_ref` VARCHAR(100) NOT NULL,
    `contact_id` INTEGER NULL,
    `application_id` INTEGER NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `coverage_amount` DECIMAL(18, 2) NOT NULL,
    `term_years` INTEGER NULL,
    `payment_frequency` VARCHAR(20) NOT NULL DEFAULT 'monthly',
    `applicant_data` JSON NOT NULL,
    `riders` JSON NULL,
    `rate_source` VARCHAR(50) NOT NULL DEFAULT 'internal',
    `rate_source_meta` JSON NULL,
    `quote_result` JSON NOT NULL,
    `monthly_premium` DECIMAL(18, 2) NOT NULL,
    `annual_premium` DECIMAL(18, 2) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `valid_until` DATETIME(3) NOT NULL,
    `comparison_group` VARCHAR(100) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `quote_scenarios_contact_id_idx`(`contact_id`),
    INDEX `quote_scenarios_application_id_idx`(`application_id`),
    INDEX `quote_scenarios_product_type_idx`(`product_type`),
    INDEX `quote_scenarios_status_idx`(`status`),
    INDEX `quote_scenarios_comparison_group_idx`(`comparison_group`),
    INDEX `quote_scenarios_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `quote_scenarios_scenario_ref_tenant_id_key`(`scenario_ref`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compliance_artifacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `artifact_type` VARCHAR(50) NOT NULL,
    `contact_id` INTEGER NULL,
    `application_id` INTEGER NULL,
    `policy_id` INTEGER NULL,
    `document_id` INTEGER NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `completed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `signed_by` VARCHAR(255) NULL,
    `signature_ip` VARCHAR(45) NULL,
    `retention_until` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `compliance_artifacts_contact_id_idx`(`contact_id`),
    INDEX `compliance_artifacts_application_id_idx`(`application_id`),
    INDEX `compliance_artifacts_policy_id_idx`(`policy_id`),
    INDEX `compliance_artifacts_artifact_type_idx`(`artifact_type`),
    INDEX `compliance_artifacts_status_idx`(`status`),
    INDEX `compliance_artifacts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_checklists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `item_type` VARCHAR(50) NOT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `document_id` INTEGER NULL,
    `received_at` DATETIME(3) NULL,
    `waived_by` VARCHAR(20) NULL,
    `waived_reason` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `submission_checklists_application_id_idx`(`application_id`),
    INDEX `submission_checklists_status_idx`(`status`),
    INDEX `submission_checklists_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_endorsements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `endorsement_ref` VARCHAR(100) NOT NULL,
    `policy_id` INTEGER NOT NULL,
    `endorsement_type` VARCHAR(50) NOT NULL,
    `description` TEXT NOT NULL,
    `effective_date` DATE NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `premium_impact` DECIMAL(18, 2) NULL,
    `approved_by` VARCHAR(20) NULL,
    `applied_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `policy_endorsements_policy_id_idx`(`policy_id`),
    INDEX `policy_endorsements_status_idx`(`status`),
    INDEX `policy_endorsements_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `policy_endorsements_endorsement_ref_tenant_id_key`(`endorsement_ref`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `renewal_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `agent_id` VARCHAR(20) NULL,
    `renewal_date` DATE NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'upcoming',
    `outreach_count` INTEGER NOT NULL DEFAULT 0,
    `last_contacted` DATETIME(3) NULL,
    `renewal_premium` DECIMAL(18, 2) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `renewal_tasks_policy_id_idx`(`policy_id`),
    INDEX `renewal_tasks_agent_id_idx`(`agent_id`),
    INDEX `renewal_tasks_renewal_date_idx`(`renewal_date`),
    INDEX `renewal_tasks_status_idx`(`status`),
    INDEX `renewal_tasks_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `frequency` VARCHAR(20) NOT NULL,
    `amount_due` DECIMAL(18, 2) NOT NULL,
    `next_due_date` DATE NOT NULL,
    `auto_pay` BOOLEAN NOT NULL DEFAULT false,
    `grace_period_days` INTEGER NOT NULL DEFAULT 31,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `billing_schedules_policy_id_key`(`policy_id`),
    INDEX `billing_schedules_next_due_date_idx`(`next_due_date`),
    INDEX `billing_schedules_status_idx`(`status`),
    INDEX `billing_schedules_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_number` VARCHAR(100) NOT NULL,
    `billing_schedule_id` INTEGER NOT NULL,
    `policy_id` INTEGER NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `due_date` DATE NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `policy_invoices_billing_schedule_id_idx`(`billing_schedule_id`),
    INDEX `policy_invoices_policy_id_idx`(`policy_id`),
    INDEX `policy_invoices_status_idx`(`status`),
    INDEX `policy_invoices_due_date_idx`(`due_date`),
    INDEX `policy_invoices_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `policy_invoices_invoice_number_tenant_id_key`(`invoice_number`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `payment_ref` VARCHAR(100) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `payment_method` VARCHAR(50) NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `policy_payments_invoice_id_idx`(`invoice_id`),
    INDEX `policy_payments_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claim_reserves` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claim_id` INTEGER NOT NULL,
    `reserve_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `running_total` DECIMAL(18, 2) NOT NULL,
    `reason` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `claim_reserves_claim_id_idx`(`claim_id`),
    INDEX `claim_reserves_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claim_payment_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claim_id` INTEGER NOT NULL,
    `payment_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `payee_name` VARCHAR(255) NULL,
    `payment_ref` VARCHAR(100) NULL,
    `payment_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `claim_payment_events_claim_id_idx`(`claim_id`),
    INDEX `claim_payment_events_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `producer_appointments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agent_id` VARCHAR(20) NOT NULL,
    `carrier_id` INTEGER NOT NULL,
    `state_code` VARCHAR(5) NOT NULL,
    `license_number` VARCHAR(100) NULL,
    `license_type` VARCHAR(50) NULL,
    `appointment_status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `appointed_at` DATE NULL,
    `expires_at` DATE NULL,
    `terminated_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `producer_appointments_agent_id_idx`(`agent_id`),
    INDEX `producer_appointments_carrier_id_idx`(`carrier_id`),
    INDEX `producer_appointments_appointment_status_idx`(`appointment_status`),
    INDEX `producer_appointments_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `producer_appointments_agent_id_carrier_id_state_code_tenant__key`(`agent_id`, `carrier_id`, `state_code`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_statements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `statement_ref` VARCHAR(100) NOT NULL,
    `carrier_id` INTEGER NOT NULL,
    `statement_period` VARCHAR(7) NOT NULL,
    `received_date` DATE NOT NULL,
    `total_expected` DECIMAL(18, 2) NOT NULL,
    `total_actual` DECIMAL(18, 2) NOT NULL,
    `variance` DECIMAL(18, 2) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `reconciled_at` DATETIME(3) NULL,
    `reconciled_by` VARCHAR(20) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `commission_statements_carrier_id_idx`(`carrier_id`),
    INDEX `commission_statements_statement_period_idx`(`statement_period`),
    INDEX `commission_statements_status_idx`(`status`),
    INDEX `commission_statements_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `commission_statements_statement_ref_tenant_id_key`(`statement_ref`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `commission_entries_statement_id_idx` ON `commission_entries`(`statement_id`);

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_statement_id_fkey` FOREIGN KEY (`statement_id`) REFERENCES `commission_statements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_scenarios` ADD CONSTRAINT `quote_scenarios_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_scenarios` ADD CONSTRAINT `quote_scenarios_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_scenarios` ADD CONSTRAINT `quote_scenarios_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compliance_artifacts` ADD CONSTRAINT `compliance_artifacts_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compliance_artifacts` ADD CONSTRAINT `compliance_artifacts_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compliance_artifacts` ADD CONSTRAINT `compliance_artifacts_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compliance_artifacts` ADD CONSTRAINT `compliance_artifacts_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compliance_artifacts` ADD CONSTRAINT `compliance_artifacts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_checklists` ADD CONSTRAINT `submission_checklists_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_checklists` ADD CONSTRAINT `submission_checklists_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_checklists` ADD CONSTRAINT `submission_checklists_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_endorsements` ADD CONSTRAINT `policy_endorsements_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_endorsements` ADD CONSTRAINT `policy_endorsements_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_endorsements` ADD CONSTRAINT `policy_endorsements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `renewal_tasks` ADD CONSTRAINT `renewal_tasks_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `renewal_tasks` ADD CONSTRAINT `renewal_tasks_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `renewal_tasks` ADD CONSTRAINT `renewal_tasks_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_schedules` ADD CONSTRAINT `billing_schedules_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_schedules` ADD CONSTRAINT `billing_schedules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_invoices` ADD CONSTRAINT `policy_invoices_billing_schedule_id_fkey` FOREIGN KEY (`billing_schedule_id`) REFERENCES `billing_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_invoices` ADD CONSTRAINT `policy_invoices_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_invoices` ADD CONSTRAINT `policy_invoices_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_payments` ADD CONSTRAINT `policy_payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `policy_invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_payments` ADD CONSTRAINT `policy_payments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_reserves` ADD CONSTRAINT `claim_reserves_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `insurance_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_reserves` ADD CONSTRAINT `claim_reserves_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_payment_events` ADD CONSTRAINT `claim_payment_events_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `insurance_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_payment_events` ADD CONSTRAINT `claim_payment_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producer_appointments` ADD CONSTRAINT `producer_appointments_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producer_appointments` ADD CONSTRAINT `producer_appointments_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `producer_appointments` ADD CONSTRAINT `producer_appointments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_statements` ADD CONSTRAINT `commission_statements_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_statements` ADD CONSTRAINT `commission_statements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
