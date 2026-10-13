-- Remove the insurance domain (INSURANCE sidebar section) and CRM quotes.
-- Metadata rows (ui_modules with category 'insurance', their objects, records,
-- workflows, dashboards, reports, roles) are removed by
-- scripts/remove-insurance-domain.js, which must run after this migration.


-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_opportunity_id_fkey`;

-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_owner_id_fkey`;

-- DropForeignKey
ALTER TABLE `quotes` DROP FOREIGN KEY `quotes_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_line_items` DROP FOREIGN KEY `quote_line_items_quote_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_line_items` DROP FOREIGN KEY `quote_line_items_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_line_items` DROP FOREIGN KEY `quote_line_items_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `documents` DROP FOREIGN KEY `documents_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_carriers` DROP FOREIGN KEY `insurance_carriers_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `carrier_adapter_configs` DROP FOREIGN KEY `carrier_adapter_configs_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `carrier_products` DROP FOREIGN KEY `carrier_products_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `carrier_products` DROP FOREIGN KEY `carrier_products_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_carrier_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policies` DROP FOREIGN KEY `insurance_policies_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policy_beneficiaries` DROP FOREIGN KEY `insurance_policy_beneficiaries_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policy_beneficiaries` DROP FOREIGN KEY `insurance_policy_beneficiaries_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policy_beneficiaries` DROP FOREIGN KEY `insurance_policy_beneficiaries_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policy_status_history` DROP FOREIGN KEY `insurance_policy_status_history_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_policy_status_history` DROP FOREIGN KEY `insurance_policy_status_history_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_carrier_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_applications` DROP FOREIGN KEY `insurance_applications_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `underwriting_cases` DROP FOREIGN KEY `underwriting_cases_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `underwriting_cases` DROP FOREIGN KEY `underwriting_cases_assigned_underwriter_fkey`;

-- DropForeignKey
ALTER TABLE `underwriting_cases` DROP FOREIGN KEY `underwriting_cases_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `underwriting_requirements` DROP FOREIGN KEY `underwriting_requirements_case_id_fkey`;

-- DropForeignKey
ALTER TABLE `underwriting_requirements` DROP FOREIGN KEY `underwriting_requirements_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_claims` DROP FOREIGN KEY `insurance_claims_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_claims` DROP FOREIGN KEY `insurance_claims_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_claims` DROP FOREIGN KEY `insurance_claims_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_claims` DROP FOREIGN KEY `insurance_claims_adjuster_id_fkey`;

-- DropForeignKey
ALTER TABLE `insurance_claims` DROP FOREIGN KEY `insurance_claims_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_events` DROP FOREIGN KEY `claim_events_claim_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_events` DROP FOREIGN KEY `claim_events_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_split_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_statement_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_entries` DROP FOREIGN KEY `commission_entries_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_scenarios` DROP FOREIGN KEY `quote_scenarios_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_scenarios` DROP FOREIGN KEY `quote_scenarios_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `quote_scenarios` DROP FOREIGN KEY `quote_scenarios_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `compliance_artifacts` DROP FOREIGN KEY `compliance_artifacts_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `compliance_artifacts` DROP FOREIGN KEY `compliance_artifacts_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `compliance_artifacts` DROP FOREIGN KEY `compliance_artifacts_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `compliance_artifacts` DROP FOREIGN KEY `compliance_artifacts_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `compliance_artifacts` DROP FOREIGN KEY `compliance_artifacts_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `submission_checklists` DROP FOREIGN KEY `submission_checklists_application_id_fkey`;

-- DropForeignKey
ALTER TABLE `submission_checklists` DROP FOREIGN KEY `submission_checklists_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `submission_checklists` DROP FOREIGN KEY `submission_checklists_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_endorsements` DROP FOREIGN KEY `policy_endorsements_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_endorsements` DROP FOREIGN KEY `policy_endorsements_approved_by_fkey`;

-- DropForeignKey
ALTER TABLE `policy_endorsements` DROP FOREIGN KEY `policy_endorsements_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `renewal_tasks` DROP FOREIGN KEY `renewal_tasks_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `renewal_tasks` DROP FOREIGN KEY `renewal_tasks_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `renewal_tasks` DROP FOREIGN KEY `renewal_tasks_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `billing_schedules` DROP FOREIGN KEY `billing_schedules_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `billing_schedules` DROP FOREIGN KEY `billing_schedules_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_invoices` DROP FOREIGN KEY `policy_invoices_billing_schedule_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_invoices` DROP FOREIGN KEY `policy_invoices_policy_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_invoices` DROP FOREIGN KEY `policy_invoices_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_payments` DROP FOREIGN KEY `policy_payments_invoice_id_fkey`;

-- DropForeignKey
ALTER TABLE `policy_payments` DROP FOREIGN KEY `policy_payments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_reserves` DROP FOREIGN KEY `claim_reserves_claim_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_reserves` DROP FOREIGN KEY `claim_reserves_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_payment_events` DROP FOREIGN KEY `claim_payment_events_claim_id_fkey`;

-- DropForeignKey
ALTER TABLE `claim_payment_events` DROP FOREIGN KEY `claim_payment_events_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `producer_appointments` DROP FOREIGN KEY `producer_appointments_agent_id_fkey`;

-- DropForeignKey
ALTER TABLE `producer_appointments` DROP FOREIGN KEY `producer_appointments_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `producer_appointments` DROP FOREIGN KEY `producer_appointments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_statements` DROP FOREIGN KEY `commission_statements_carrier_id_fkey`;

-- DropForeignKey
ALTER TABLE `commission_statements` DROP FOREIGN KEY `commission_statements_tenant_id_fkey`;

-- DropIndex
DROP INDEX `documents_application_id_idx` ON `documents`;

-- AlterTable
ALTER TABLE `documents` DROP COLUMN `application_id`;

-- DropTable
DROP TABLE `quotes`;

-- DropTable
DROP TABLE `quote_line_items`;

-- DropTable
DROP TABLE `insurance_carriers`;

-- DropTable
DROP TABLE `carrier_adapter_configs`;

-- DropTable
DROP TABLE `carrier_products`;

-- DropTable
DROP TABLE `insurance_policies`;

-- DropTable
DROP TABLE `insurance_policy_beneficiaries`;

-- DropTable
DROP TABLE `insurance_policy_status_history`;

-- DropTable
DROP TABLE `insurance_applications`;

-- DropTable
DROP TABLE `underwriting_cases`;

-- DropTable
DROP TABLE `underwriting_requirements`;

-- DropTable
DROP TABLE `insurance_claims`;

-- DropTable
DROP TABLE `claim_events`;

-- DropTable
DROP TABLE `commission_entries`;

-- DropTable
DROP TABLE `quote_scenarios`;

-- DropTable
DROP TABLE `compliance_artifacts`;

-- DropTable
DROP TABLE `submission_checklists`;

-- DropTable
DROP TABLE `policy_endorsements`;

-- DropTable
DROP TABLE `renewal_tasks`;

-- DropTable
DROP TABLE `billing_schedules`;

-- DropTable
DROP TABLE `policy_invoices`;

-- DropTable
DROP TABLE `policy_payments`;

-- DropTable
DROP TABLE `claim_reserves`;

-- DropTable
DROP TABLE `claim_payment_events`;

-- DropTable
DROP TABLE `producer_appointments`;

-- DropTable
DROP TABLE `commission_statements`;

