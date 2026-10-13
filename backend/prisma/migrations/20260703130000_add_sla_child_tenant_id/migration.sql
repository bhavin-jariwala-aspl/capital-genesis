-- Add tenant_id to SLA child tables (sla_targets, sla_escalations) so they
-- match the tenant-scoping convention used by every other model. Backfill from
-- the parent policy, then enforce NOT NULL + FK.

-- ── sla_targets ─────────────────────────────────────────────────────────────
ALTER TABLE `sla_targets` ADD COLUMN `tenant_id` INTEGER NULL;
UPDATE `sla_targets` t JOIN `sla_policies` p ON t.`policy_id` = p.`id` SET t.`tenant_id` = p.`tenant_id`;
ALTER TABLE `sla_targets` MODIFY COLUMN `tenant_id` INTEGER NOT NULL;
CREATE INDEX `sla_targets_tenant_id_idx` ON `sla_targets`(`tenant_id`);
ALTER TABLE `sla_targets` ADD CONSTRAINT `sla_targets_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── sla_escalations ─────────────────────────────────────────────────────────
ALTER TABLE `sla_escalations` ADD COLUMN `tenant_id` INTEGER NULL;
UPDATE `sla_escalations` e JOIN `sla_policies` p ON e.`policy_id` = p.`id` SET e.`tenant_id` = p.`tenant_id`;
ALTER TABLE `sla_escalations` MODIFY COLUMN `tenant_id` INTEGER NOT NULL;
CREATE INDEX `sla_escalations_tenant_id_idx` ON `sla_escalations`(`tenant_id`);
ALTER TABLE `sla_escalations` ADD CONSTRAINT `sla_escalations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
