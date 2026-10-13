-- Document share links + view tracking (engagement analytics).
--
-- Adds:
--   * `document_share_links`  — shareable, optionally-expiring public links.
--   * `document_view_events`  — per-open/download engagement events.
--
-- Purely additive.

-- CreateTable
CREATE TABLE `document_share_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `allow_download` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `last_viewed_at` DATETIME(3) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `document_share_links_token_key`(`token`),
    INDEX `document_share_links_tenant_id_idx`(`tenant_id`),
    INDEX `document_share_links_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_view_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `share_link_id` INTEGER NOT NULL,
    `document_id` INTEGER NOT NULL,
    `event_type` VARCHAR(20) NOT NULL DEFAULT 'view',
    `viewer_ip` VARCHAR(64) NULL,
    `user_agent` TEXT NULL,
    `referrer` VARCHAR(500) NULL,
    `duration_secs` INTEGER NULL,
    `viewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `document_view_events_tenant_id_idx`(`tenant_id`),
    INDEX `document_view_events_share_link_id_idx`(`share_link_id`),
    INDEX `document_view_events_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_share_links` ADD CONSTRAINT `document_share_links_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_share_links` ADD CONSTRAINT `document_share_links_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_view_events` ADD CONSTRAINT `document_view_events_share_link_id_fkey` FOREIGN KEY (`share_link_id`) REFERENCES `document_share_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_view_events` ADD CONSTRAINT `document_view_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
