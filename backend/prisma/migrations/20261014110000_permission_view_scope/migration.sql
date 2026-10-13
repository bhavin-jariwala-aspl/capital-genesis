-- Per-role record visibility on object permissions. Additive.
ALTER TABLE `ui_permissions` ADD COLUMN `view_scope` VARCHAR(10) NULL;
