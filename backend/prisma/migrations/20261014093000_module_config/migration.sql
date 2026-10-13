-- Module-level config (e.g. French label for the sidebar). Additive only.

-- AlterTable
ALTER TABLE `ui_modules` ADD COLUMN `config` JSON NULL;
