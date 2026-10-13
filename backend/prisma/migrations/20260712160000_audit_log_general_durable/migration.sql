-- Make audit_logs durable and general:
--  * record_id nullable + FK SET NULL, so an audit entry survives a hard-delete
--    / purge of its record (the trail must outlive the data).
--  * entity_type / entity_id for actions on non-record entities (pipeline config).
--  * widen action to fit namespaced actions (pipeline.create, …).
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_record_id_fkey`;

ALTER TABLE `audit_logs`
  MODIFY `record_id` INTEGER NULL,
  MODIFY `action` VARCHAR(40) NOT NULL,
  ADD COLUMN `entity_type` VARCHAR(50) NULL,
  ADD COLUMN `entity_id` INTEGER NULL;

ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_record_id_fkey`
  FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `audit_logs_entity_type_entity_id_idx` ON `audit_logs`(`entity_type`, `entity_id`);
