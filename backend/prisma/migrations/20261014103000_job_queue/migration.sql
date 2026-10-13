-- Durable job queue (PRD E-03). Additive only.

-- CreateTable
CREATE TABLE `job_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(60) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 6,
    `run_after` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `dedupe_key` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NULL,

    INDEX `job_queue_status_run_after_idx`(`status`, `run_after`),
    INDEX `job_queue_dedupe_key_idx`(`dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
