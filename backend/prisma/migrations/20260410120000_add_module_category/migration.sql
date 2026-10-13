-- AlterTable: Add `category` column to ui_modules for sidebar grouping
ALTER TABLE `ui_modules` ADD COLUMN `category` VARCHAR(50) NOT NULL DEFAULT 'crm';

-- Backfill existing insurance-related modules
UPDATE `ui_modules` SET `category` = 'insurance' WHERE `name` IN (
  'quotes', 'applications', 'policies', 'claims',
  'underwriting', 'commissions', 'declarations', 'document_collection'
);

-- Backfill settings module
UPDATE `ui_modules` SET `category` = 'settings' WHERE `name` = 'settings';
