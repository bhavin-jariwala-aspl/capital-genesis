-- Soft-delete / Trash support for records (Leads, Prospects, and every other
-- object's rows). `deleted_at` NULL → live; NOT NULL → in Trash (hidden from
-- users, recoverable by an admin). `deleted_by` records who deleted it.
ALTER TABLE `records`
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by` VARCHAR(100) NULL;

CREATE INDEX `records_deleted_at_idx` ON `records`(`deleted_at`);
