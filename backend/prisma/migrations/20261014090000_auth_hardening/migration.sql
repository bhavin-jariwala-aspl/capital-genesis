-- Session hardening (SWAN PRD E-01 refresh tokens + revocation, E-02 MFA).
-- Additive only.

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `tokens_valid_after` DATETIME(3) NULL,
    ADD COLUMN `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfa_secret` VARCHAR(255) NULL,
    ADD COLUMN `mfa_recovery` JSON NULL;

-- CreateTable
CREATE TABLE `auth_refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(20) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `family` CHAR(32) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by` INTEGER NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NULL,

    UNIQUE INDEX `auth_refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `auth_refresh_tokens_employee_id_idx`(`employee_id`),
    INDEX `auth_refresh_tokens_family_idx`(`family`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
