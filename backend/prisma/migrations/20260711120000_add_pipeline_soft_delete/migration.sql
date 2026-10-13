-- Soft-delete / Trash support for pipelines.
-- `deleted_at` NULL  → live pipeline; NOT NULL → in Trash (recoverable).
-- `deleted_by` records the actor who moved it to Trash.
ALTER TABLE `ui_pipelines`
  ADD COLUMN `deleted_at` DATETIME(3) NULL,
  ADD COLUMN `deleted_by` VARCHAR(100) NULL;

CREATE INDEX `ui_pipelines_deleted_at_idx` ON `ui_pipelines`(`deleted_at`);
