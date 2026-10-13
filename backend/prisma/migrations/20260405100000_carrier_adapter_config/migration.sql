-- Migration: 20260405_carrier_adapter_config
-- Adds per-carrier adapter integration configuration table.
-- API secrets are stored as env-var NAMES only, never as values.

-- CreateTable
CREATE TABLE `carrier_adapter_configs` (
    `id`                    INTEGER NOT NULL AUTO_INCREMENT,
    `carrier_id`            INTEGER NOT NULL,
    `adapter_type`          VARCHAR(30) NOT NULL DEFAULT 'simulated',
    `api_base_url`          VARCHAR(500) NULL,
    `api_key_env_var`       VARCHAR(100) NULL,
    `timeout_ms`            INTEGER NOT NULL DEFAULT 10000,
    `is_enabled`            BOOLEAN NOT NULL DEFAULT true,
    `environment`           VARCHAR(20) NOT NULL DEFAULT 'sandbox',
    `supported_products`    JSON NULL,
    `notes`                 TEXT NULL,
    `last_health_check_at`  DATETIME(3) NULL,
    `health_status`         VARCHAR(20) NULL,
    `health_detail`         TEXT NULL,
    `updated_at`            DATETIME(3) NOT NULL,
    `created_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `carrier_adapter_configs_carrier_id_key`(`carrier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `carrier_adapter_configs` ADD CONSTRAINT `carrier_adapter_configs_carrier_id_fkey`
    FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
