-- Remove the pipeline soft-delete / Trash feature (reverts
-- `20260711120000_add_pipeline_soft_delete`). Pipelines are hard-deleted again.
DROP INDEX `ui_pipelines_deleted_at_idx` ON `ui_pipelines`;

ALTER TABLE `ui_pipelines`
  DROP COLUMN `deleted_at`,
  DROP COLUMN `deleted_by`;
