-- AlterTable: add password-reset token columns to employees
ALTER TABLE `employees`
  ADD COLUMN `reset_token` VARCHAR(255) NULL,
  ADD COLUMN `reset_token_expires` DATETIME(3) NULL;
