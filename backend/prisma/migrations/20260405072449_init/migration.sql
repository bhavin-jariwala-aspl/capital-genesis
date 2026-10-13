-- CreateTable
CREATE TABLE `regions` (
    `region_id` INTEGER NOT NULL AUTO_INCREMENT,
    `region_name` VARCHAR(100) NOT NULL,
    `region_code` VARCHAR(10) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `regions_region_code_key`(`region_code`),
    INDEX `regions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`region_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `branch_id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_name` VARCHAR(100) NOT NULL,
    `branch_code` VARCHAR(10) NOT NULL,
    `region_id` INTEGER NOT NULL,
    `address` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `branches_branch_code_key`(`branch_code`),
    INDEX `branches_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NULL,

    INDEX `roles_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `roles_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `employee_id` VARCHAR(20) NOT NULL,
    `employee_name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `password` VARCHAR(255) NOT NULL,
    `branch_id` INTEGER NULL,
    `region_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `employees_email_key`(`email`),
    INDEX `employees_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_hierarchy` (
    `ancestor_id` VARCHAR(20) NOT NULL,
    `descendant_id` VARCHAR(20) NOT NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL,

    INDEX `employee_hierarchy_descendant_id_idx`(`descendant_id`),
    INDEX `employee_hierarchy_depth_idx`(`depth`),
    INDEX `employee_hierarchy_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`ancestor_id`, `descendant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_modules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(50) NULL,
    `color` VARCHAR(20) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_modules_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_objects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `module_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `plural_label` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(50) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_objects_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_fields` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `field_type` VARCHAR(50) NOT NULL,
    `data_type` VARCHAR(50) NOT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `is_unique` BOOLEAN NOT NULL DEFAULT false,
    `is_searchable` BOOLEAN NOT NULL DEFAULT true,
    `is_sortable` BOOLEAN NOT NULL DEFAULT true,
    `is_indexed` BOOLEAN NOT NULL DEFAULT false,
    `default_value` TEXT NULL,
    `placeholder` VARCHAR(200) NULL,
    `help_text` TEXT NULL,
    `options` JSON NULL,
    `config` JSON NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_fields_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_forms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `form_type` VARCHAR(50) NOT NULL,
    `columns` INTEGER NOT NULL DEFAULT 2,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_forms_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_form_field_layouts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `form_id` INTEGER NOT NULL,
    `field_id` INTEGER NOT NULL,
    `row` INTEGER NOT NULL DEFAULT 0,
    `col` INTEGER NOT NULL DEFAULT 0,
    `col_span` INTEGER NOT NULL DEFAULT 1,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_form_field_layouts_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `ui_form_field_layouts_form_id_field_id_key`(`form_id`, `field_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_validations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `field_id` INTEGER NOT NULL,
    `validation_type` VARCHAR(50) NOT NULL,
    `value` VARCHAR(500) NULL,
    `error_message` VARCHAR(500) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_validations_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_field_dependencies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_field_id` INTEGER NOT NULL,
    `target_field_id` INTEGER NOT NULL,
    `condition_type` VARCHAR(50) NOT NULL,
    `condition_value` TEXT NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `action_value` TEXT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_field_dependencies_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `page_type` VARCHAR(50) NOT NULL,
    `config` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_pages_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_dashboards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `min_role` VARCHAR(50) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_dashboards_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_dashboard_widgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dashboard_id` INTEGER NOT NULL,
    `widget_type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NULL,
    `x` INTEGER NOT NULL DEFAULT 0,
    `y` INTEGER NOT NULL DEFAULT 0,
    `w` INTEGER NOT NULL DEFAULT 6,
    `h` INTEGER NOT NULL DEFAULT 4,
    `chart_id` INTEGER NULL,
    `config` JSON NULL,
    `data_source` JSON NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_dashboard_widgets_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_charts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `chart_type` VARCHAR(50) NOT NULL,
    `config` JSON NULL,
    `data_source` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_charts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_workflows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `trigger_type` VARCHAR(50) NOT NULL,
    `trigger_config` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_workflows_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_workflow_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `step_type` VARCHAR(50) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,
    `on_true_id` INTEGER NULL,
    `on_false_id` INTEGER NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_workflow_steps_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_pending_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workflow_id` INTEGER NOT NULL,
    `resume_step_id` INTEGER NULL,
    `record_id` INTEGER NULL,
    `actor_id` VARCHAR(100) NULL,
    `context` JSON NULL,
    `resume_after` DATETIME(3) NULL,
    `approval_token` VARCHAR(255) NULL,
    `approval_status` VARCHAR(20) NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `workflow_pending_steps_approval_token_key`(`approval_token`),
    INDEX `workflow_pending_steps_resume_after_idx`(`resume_after`),
    INDEX `workflow_pending_steps_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_wizards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `submit_label` VARCHAR(100) NULL,
    `success_message` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_wizards_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_wizard_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wizard_id` INTEGER NOT NULL,
    `form_id` INTEGER NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_wizard_steps_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_pipelines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_pipelines_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_pipeline_stages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pipeline_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_pipeline_stages_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `pipeline_stage_id` INTEGER NULL,
    `assigned_to` VARCHAR(20) NULL,
    `created_by` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `records_assigned_to_idx`(`assigned_to`),
    INDEX `records_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `outcome` VARCHAR(500) NULL,
    `duration_min` INTEGER NULL,
    `scheduled_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `activities_record_id_idx`(`record_id`),
    INDEX `activities_employee_id_idx`(`employee_id`),
    INDEX `activities_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `assigned_to` VARCHAR(20) NOT NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'open',
    `priority` VARCHAR(20) NOT NULL DEFAULT 'normal',
    `due_date` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `tasks_record_id_idx`(`record_id`),
    INDEX `tasks_assigned_to_idx`(`assigned_to`),
    INDEX `tasks_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(20) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NULL,
    `link` VARCHAR(500) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `notifications_employee_id_is_read_idx`(`employee_id`, `is_read`),
    INDEX `notifications_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `changes` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `audit_logs_record_id_idx`(`record_id`),
    INDEX `audit_logs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ui_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `role_name` VARCHAR(50) NOT NULL,
    `can_view` BOOLEAN NOT NULL DEFAULT true,
    `can_edit` BOOLEAN NOT NULL DEFAULT false,
    `updated_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `ui_permissions_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `ui_permissions_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `ui_permissions_entity_type_entity_id_role_name_tenant_id_key`(`entity_type`, `entity_id`, `role_name`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operational_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(30) NOT NULL,
    `role_name` VARCHAR(50) NOT NULL,
    `view_scope` VARCHAR(20) NOT NULL DEFAULT 'own',
    `create_scope` VARCHAR(20) NOT NULL DEFAULT 'own',
    `edit_scope` VARCHAR(20) NOT NULL DEFAULT 'own',
    `delete_scope` VARCHAR(20) NOT NULL DEFAULT 'own',
    `assign_scope` VARCHAR(20) NOT NULL DEFAULT 'none',
    `updated_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `operational_permissions_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `operational_permissions_entity_type_role_name_tenant_id_key`(`entity_type`, `role_name`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `rule_type` VARCHAR(30) NOT NULL,
    `conditions` JSON NULL,
    `assignee_id` VARCHAR(20) NULL,
    `pool_ids` JSON NULL,
    `fallback_id` VARCHAR(20) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `assignment_rules_object_id_is_active_order_index_idx`(`object_id`, `is_active`, `order_index`),
    INDEX `assignment_rules_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `round_robin_states` (
    `rule_id` INTEGER NOT NULL,
    `pool_ids` JSON NOT NULL,
    `last_index` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `round_robin_states_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`rule_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `object_id` INTEGER NOT NULL,
    `rule_id` INTEGER NULL,
    `assigned_to` VARCHAR(20) NOT NULL,
    `method` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `assignment_logs_record_id_idx`(`record_id`),
    INDEX `assignment_logs_object_id_idx`(`object_id`),
    INDEX `assignment_logs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(20) NOT NULL,
    `object_id` INTEGER NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `period_key` VARCHAR(20) NOT NULL,
    `target_value` DECIMAL(18, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `quotas_employee_id_idx`(`employee_id`),
    INDEX `quotas_object_id_idx`(`object_id`),
    INDEX `quotas_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `quotas_employee_id_object_id_period_type_period_key_key`(`employee_id`, `object_id`, `period_type`, `period_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `object_id` INTEGER NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `field_mapping` JSON NULL,
    `dedupe_keys` JSON NULL,
    `strategy` VARCHAR(20) NOT NULL DEFAULT 'skip',
    `stats` JSON NULL,
    `error_rows` JSON NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `import_jobs_object_id_idx`(`object_id`),
    INDEX `import_jobs_status_idx`(`status`),
    INDEX `import_jobs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `config` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_run_at` DATETIME(3) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `integrations_name_key`(`name`),
    INDEX `integrations_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `integration_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `request_body` JSON NULL,
    `response_body` JSON NULL,
    `error` TEXT NULL,
    `duration_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `integration_logs_integration_id_idx`(`integration_id`),
    INDEX `integration_logs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `website` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `industry` VARCHAR(100) NULL,
    `account_type` VARCHAR(50) NULL,
    `annual_revenue` DECIMAL(18, 2) NULL,
    `employee_count` INTEGER NULL,
    `billing_street` VARCHAR(255) NULL,
    `billing_city` VARCHAR(100) NULL,
    `billing_state` VARCHAR(100) NULL,
    `billing_country` VARCHAR(100) NULL,
    `billing_zip` VARCHAR(20) NULL,
    `description` TEXT NULL,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_accounts_record_id_key`(`record_id`),
    INDEX `crm_accounts_name_idx`(`name`),
    INDEX `crm_accounts_owner_id_idx`(`owner_id`),
    INDEX `crm_accounts_external_id_idx`(`external_id`),
    INDEX `crm_accounts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `title` VARCHAR(100) NULL,
    `department` VARCHAR(100) NULL,
    `lead_source` VARCHAR(100) NULL,
    `mailing_street` VARCHAR(255) NULL,
    `mailing_city` VARCHAR(100) NULL,
    `mailing_state` VARCHAR(100) NULL,
    `mailing_country` VARCHAR(100) NULL,
    `mailing_zip` VARCHAR(20) NULL,
    `birthdate` DATE NULL,
    `description` TEXT NULL,
    `do_not_contact` BOOLEAN NOT NULL DEFAULT false,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_contacts_record_id_key`(`record_id`),
    INDEX `crm_contacts_email_idx`(`email`),
    INDEX `crm_contacts_account_id_idx`(`account_id`),
    INDEX `crm_contacts_owner_id_idx`(`owner_id`),
    INDEX `crm_contacts_external_id_idx`(`external_id`),
    INDEX `crm_contacts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `company` VARCHAR(255) NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `job_title` VARCHAR(100) NULL,
    `lead_source` VARCHAR(100) NULL,
    `lead_status` VARCHAR(50) NOT NULL DEFAULT 'new',
    `rating` VARCHAR(20) NULL,
    `industry` VARCHAR(100) NULL,
    `annual_revenue` DECIMAL(18, 2) NULL,
    `website` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `is_converted` BOOLEAN NOT NULL DEFAULT false,
    `converted_at` DATETIME(3) NULL,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_leads_record_id_key`(`record_id`),
    INDEX `crm_leads_email_idx`(`email`),
    INDEX `crm_leads_company_idx`(`company`),
    INDEX `crm_leads_lead_status_idx`(`lead_status`),
    INDEX `crm_leads_owner_id_idx`(`owner_id`),
    INDEX `crm_leads_external_id_idx`(`external_id`),
    INDEX `crm_leads_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_opportunities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `contact_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `stage` VARCHAR(50) NOT NULL DEFAULT 'prospecting',
    `probability` INTEGER NOT NULL DEFAULT 0,
    `close_date` DATE NULL,
    `lead_source` VARCHAR(100) NULL,
    `type` VARCHAR(100) NULL,
    `next_step` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `is_won` BOOLEAN NOT NULL DEFAULT false,
    `forecast_category` VARCHAR(50) NULL,
    `pipeline_stage_id` INTEGER NULL,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_opportunities_record_id_key`(`record_id`),
    INDEX `crm_opportunities_account_id_idx`(`account_id`),
    INDEX `crm_opportunities_stage_idx`(`stage`),
    INDEX `crm_opportunities_owner_id_idx`(`owner_id`),
    INDEX `crm_opportunities_close_date_idx`(`close_date`),
    INDEX `crm_opportunities_amount_idx`(`amount`),
    INDEX `crm_opportunities_external_id_idx`(`external_id`),
    INDEX `crm_opportunities_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `contact_id` INTEGER NULL,
    `subject` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'new',
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `type` VARCHAR(100) NULL,
    `origin` VARCHAR(50) NULL,
    `contact_email` VARCHAR(100) NULL,
    `contact_name` VARCHAR(200) NULL,
    `resolution` TEXT NULL,
    `owner_id` VARCHAR(20) NULL,
    `external_id` VARCHAR(255) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_cases_record_id_key`(`record_id`),
    INDEX `crm_cases_account_id_idx`(`account_id`),
    INDEX `crm_cases_status_idx`(`status`),
    INDEX `crm_cases_owner_id_idx`(`owner_id`),
    INDEX `crm_cases_external_id_idx`(`external_id`),
    INDEX `crm_cases_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_lead_conversions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `account_id` INTEGER NULL,
    `contact_id` INTEGER NULL,
    `opportunity_id` INTEGER NULL,
    `converted_by` VARCHAR(20) NULL,
    `converted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `crm_lead_conversions_lead_id_key`(`lead_id`),
    UNIQUE INDEX `crm_lead_conversions_opportunity_id_key`(`opportunity_id`),
    INDEX `crm_lead_conversions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `crm_associations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `from_type` VARCHAR(50) NOT NULL,
    `from_id` INTEGER NOT NULL,
    `to_type` VARCHAR(50) NOT NULL,
    `to_id` INTEGER NOT NULL,
    `assoc_type` VARCHAR(100) NOT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `crm_associations_from_type_from_id_idx`(`from_type`, `from_id`),
    INDEX `crm_associations_to_type_to_id_idx`(`to_type`, `to_id`),
    INDEX `crm_associations_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `crm_associations_from_type_from_id_to_type_to_id_assoc_type_key`(`from_type`, `from_id`, `to_type`, `to_id`, `assoc_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(100) NULL,
    `category` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `unit_price` DECIMAL(18, 2) NOT NULL,
    `cost_price` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `tax_rate` DECIMAL(5, 4) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_service` BOOLEAN NOT NULL DEFAULT false,
    `min_quantity` INTEGER NOT NULL DEFAULT 1,
    `max_quantity` INTEGER NULL,
    `vendor_name` VARCHAR(255) NULL,
    `vendor_sku` VARCHAR(100) NULL,
    `dimensions` VARCHAR(100) NULL,
    `weight` DECIMAL(8, 2) NULL,
    `warranty_months` INTEGER NULL,
    `image_url` VARCHAR(500) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `products_record_id_key`(`record_id`),
    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_name_idx`(`name`),
    INDEX `products_category_idx`(`category`),
    INDEX `products_is_active_idx`(`is_active`),
    INDEX `products_sku_idx`(`sku`),
    INDEX `products_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `opportunity_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `contact_id` INTEGER NULL,
    `quote_number` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `valid_until` DATE NULL,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `terms` TEXT NULL,
    `notes` TEXT NULL,
    `billing_street` VARCHAR(255) NULL,
    `billing_city` VARCHAR(100) NULL,
    `billing_state` VARCHAR(100) NULL,
    `billing_country` VARCHAR(100) NULL,
    `billing_zip` VARCHAR(20) NULL,
    `shipping_street` VARCHAR(255) NULL,
    `shipping_city` VARCHAR(100) NULL,
    `shipping_state` VARCHAR(100) NULL,
    `shipping_country` VARCHAR(100) NULL,
    `shipping_zip` VARCHAR(20) NULL,
    `accepted_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `owner_id` VARCHAR(20) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `quotes_record_id_key`(`record_id`),
    UNIQUE INDEX `quotes_quote_number_key`(`quote_number`),
    INDEX `quotes_quote_number_idx`(`quote_number`),
    INDEX `quotes_status_idx`(`status`),
    INDEX `quotes_opportunity_id_idx`(`opportunity_id`),
    INDEX `quotes_owner_id_idx`(`owner_id`),
    INDEX `quotes_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_line_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quote_id` INTEGER NOT NULL,
    `product_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `unit_price` DECIMAL(18, 2) NOT NULL,
    `discount` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(18, 2) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `tenant_id` INTEGER NOT NULL,

    INDEX `quote_line_items_quote_id_idx`(`quote_id`),
    INDEX `quote_line_items_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `object_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NULL,
    `subject` VARCHAR(255) NOT NULL,
    `body_html` MEDIUMTEXT NULL,
    `body_text` TEXT NULL,
    `variables` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `usage_count` INTEGER NOT NULL DEFAULT 0,
    `language` VARCHAR(10) NOT NULL DEFAULT 'en',
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `email_templates_record_id_key`(`record_id`),
    INDEX `email_templates_object_id_idx`(`object_id`),
    INDEX `email_templates_category_idx`(`category`),
    INDEX `email_templates_is_active_idx`(`is_active`),
    INDEX `email_templates_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER NULL,
    `related_record_id` INTEGER NULL,
    `related_type` VARCHAR(50) NULL,
    `to_email` VARCHAR(255) NOT NULL,
    `from_email` VARCHAR(255) NULL,
    `cc_emails` JSON NULL,
    `bcc_emails` JSON NULL,
    `subject` VARCHAR(255) NOT NULL,
    `body_html` MEDIUMTEXT NULL,
    `body_text` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'sent',
    `opened_at` DATETIME(3) NULL,
    `clicked_at` DATETIME(3) NULL,
    `bounced_at` DATETIME(3) NULL,
    `bounce_reason` TEXT NULL,
    `sent_by` VARCHAR(20) NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `email_logs_to_email_idx`(`to_email`),
    INDEX `email_logs_status_idx`(`status`),
    INDEX `email_logs_related_record_id_related_type_idx`(`related_record_id`, `related_type`),
    INDEX `email_logs_sent_at_idx`(`sent_at`),
    INDEX `email_logs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `related_to_id` INTEGER NULL,
    `related_to_type` VARCHAR(50) NULL,
    `filename` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NULL,
    `mime_type` VARCHAR(100) NULL,
    `category` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `uploaded_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `documents_record_id_key`(`record_id`),
    INDEX `documents_related_to_id_related_to_type_idx`(`related_to_id`, `related_to_type`),
    INDEX `documents_category_idx`(`category`),
    INDEX `documents_filename_idx`(`filename`),
    INDEX `documents_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_scoring_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `field_name` VARCHAR(100) NOT NULL,
    `operator` VARCHAR(50) NOT NULL,
    `field_value` TEXT NULL,
    `points` INTEGER NOT NULL,
    `rule_type` VARCHAR(50) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `lead_scoring_rules_is_active_order_index_idx`(`is_active`, `order_index`),
    INDEX `lead_scoring_rules_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_scores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lead_id` INTEGER NOT NULL,
    `total_score` INTEGER NOT NULL DEFAULT 0,
    `scoring_details` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `lead_scores_lead_id_idx`(`lead_id`),
    INDEX `lead_scores_total_score_idx`(`total_score`),
    INDEX `lead_scores_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `record_field_values` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `field_name` VARCHAR(100) NOT NULL,
    `str_value` TEXT NULL,
    `num_value` DOUBLE NULL,
    `bool_value` BOOLEAN NULL,
    `date_value` DATETIME(3) NULL,
    `json_value` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `record_field_values_record_id_idx`(`record_id`),
    INDEX `record_field_values_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `record_field_values_record_id_field_name_key`(`record_id`, `field_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `campaign_type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `email_template_id` INTEGER NULL,
    `sender_name` VARCHAR(255) NOT NULL,
    `sender_email` VARCHAR(255) NOT NULL,
    `reply_to_email` VARCHAR(255) NULL,
    `subject` VARCHAR(255) NOT NULL,
    `email_html` MEDIUMTEXT NULL,
    `email_text` TEXT NULL,
    `send_date` DATETIME(3) NULL,
    `time_zone` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurring_config` JSON NULL,
    `segment_filter` JSON NULL,
    `total_recipients` INTEGER NOT NULL DEFAULT 0,
    `sent_count` INTEGER NOT NULL DEFAULT 0,
    `delivered_count` INTEGER NOT NULL DEFAULT 0,
    `opened_count` INTEGER NOT NULL DEFAULT 0,
    `clicked_count` INTEGER NOT NULL DEFAULT 0,
    `bounced_count` INTEGER NOT NULL DEFAULT 0,
    `unsubscribed_count` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `email_campaigns_status_idx`(`status`),
    INDEX `email_campaigns_send_date_idx`(`send_date`),
    INDEX `email_campaigns_campaign_type_idx`(`campaign_type`),
    INDEX `email_campaigns_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `recipient_type` VARCHAR(50) NOT NULL,
    `recipient_id` INTEGER NULL,
    `email` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NULL,
    `last_name` VARCHAR(100) NULL,
    `company` VARCHAR(255) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `send_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `personalization` JSON NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `campaign_recipients_campaign_id_status_idx`(`campaign_id`, `status`),
    INDEX `campaign_recipients_email_idx`(`email`),
    INDEX `campaign_recipients_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `campaign_recipients_campaign_id_recipient_type_recipient_id_key`(`campaign_id`, `recipient_type`, `recipient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_email_sends` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `recipient_id` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `email_html` MEDIUMTEXT NULL,
    `email_text` TEXT NULL,
    `send_status` VARCHAR(50) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `opened_at` DATETIME(3) NULL,
    `first_opened_at` DATETIME(3) NULL,
    `clicked_at` DATETIME(3) NULL,
    `first_clicked_at` DATETIME(3) NULL,
    `bounced_at` DATETIME(3) NULL,
    `bounce_reason` TEXT NULL,
    `unsubscribed_at` DATETIME(3) NULL,
    `spam_reported_at` DATETIME(3) NULL,
    `open_count` INTEGER NOT NULL DEFAULT 0,
    `click_count` INTEGER NOT NULL DEFAULT 0,
    `user_agent` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `tracking_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `campaign_email_sends_campaign_id_idx`(`campaign_id`),
    INDEX `campaign_email_sends_recipient_id_idx`(`recipient_id`),
    INDEX `campaign_email_sends_email_idx`(`email`),
    INDEX `campaign_email_sends_send_status_idx`(`send_status`),
    INDEX `campaign_email_sends_sent_at_idx`(`sent_at`),
    INDEX `campaign_email_sends_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `list_type` VARCHAR(50) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `total_contacts` INTEGER NOT NULL DEFAULT 0,
    `active_contacts` INTEGER NOT NULL DEFAULT 0,
    `segment_criteria` JSON NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `email_lists_list_type_idx`(`list_type`),
    INDEX `email_lists_is_active_idx`(`is_active`),
    INDEX `email_lists_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_list_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `list_id` INTEGER NOT NULL,
    `subscriber_type` VARCHAR(50) NOT NULL,
    `subscriber_id` INTEGER NULL,
    `email` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NULL,
    `last_name` VARCHAR(100) NULL,
    `company` VARCHAR(255) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'subscribed',
    `source` VARCHAR(100) NULL,
    `subscribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unsubscribed_at` DATETIME(3) NULL,
    `tags` JSON NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `email_list_subscriptions_list_id_status_idx`(`list_id`, `status`),
    INDEX `email_list_subscriptions_email_idx`(`email`),
    INDEX `email_list_subscriptions_subscriber_type_subscriber_id_idx`(`subscriber_type`, `subscriber_id`),
    INDEX `email_list_subscriptions_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `email_list_subscriptions_list_id_email_key`(`list_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_list_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `list_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `campaign_list_assignments_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `campaign_list_assignments_campaign_id_list_id_key`(`campaign_id`, `list_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_click_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email_send_id` INTEGER NOT NULL,
    `link_url` TEXT NOT NULL,
    `link_text` VARCHAR(255) NULL,
    `clicked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `referrer` TEXT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `email_click_events_email_send_id_idx`(`email_send_id`),
    INDEX `email_click_events_clicked_at_idx`(`clicked_at`),
    INDEX `email_click_events_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_unsubscribes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `unsubscribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unsubscribe_reason` VARCHAR(255) NULL,
    `campaign_id` INTEGER NULL,
    `feedback` TEXT NULL,
    `is_global` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `email_unsubscribes_email_key`(`email`),
    INDEX `email_unsubscribes_email_idx`(`email`),
    INDEX `email_unsubscribes_unsubscribed_at_idx`(`unsubscribed_at`),
    INDEX `email_unsubscribes_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `start_datetime` DATETIME(3) NOT NULL,
    `end_datetime` DATETIME(3) NOT NULL,
    `all_day` BOOLEAN NOT NULL DEFAULT false,
    `time_zone` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `location` VARCHAR(255) NULL,
    `meeting_link` VARCHAR(500) NULL,
    `related_record_id` INTEGER NULL,
    `related_type` VARCHAR(50) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    `visibility` VARCHAR(50) NOT NULL DEFAULT 'private',
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `reminder_minutes` INTEGER NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurring_config` JSON NULL,
    `external_id` VARCHAR(255) NULL,
    `organizer_id` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `calendar_events_start_datetime_end_datetime_idx`(`start_datetime`, `end_datetime`),
    INDEX `calendar_events_organizer_id_idx`(`organizer_id`),
    INDEX `calendar_events_related_record_id_related_type_idx`(`related_record_id`, `related_type`),
    INDEX `calendar_events_status_idx`(`status`),
    INDEX `calendar_events_event_type_idx`(`event_type`),
    INDEX `calendar_events_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_attendees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `attendee_type` VARCHAR(50) NOT NULL,
    `attendee_id` VARCHAR(20) NULL,
    `external_name` VARCHAR(255) NULL,
    `external_email` VARCHAR(255) NULL,
    `response_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `is_organizer` BOOLEAN NOT NULL DEFAULT false,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `responded_at` DATETIME(3) NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `calendar_attendees_event_id_idx`(`event_id`),
    INDEX `calendar_attendees_attendee_type_attendee_id_idx`(`attendee_type`, `attendee_id`),
    INDEX `calendar_attendees_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `calendar_attendees_event_id_attendee_type_attendee_id_key`(`event_id`, `attendee_type`, `attendee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `action_items` JSON NULL,
    `outcomes` VARCHAR(500) NULL,
    `follow_up` VARCHAR(500) NULL,
    `recorded_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `meeting_notes_event_id_idx`(`event_id`),
    INDEX `meeting_notes_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_rooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NULL,
    `capacity` INTEGER NULL,
    `equipment` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `booking_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `meeting_rooms_is_active_idx`(`is_active`),
    INDEX `meeting_rooms_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `room_id` INTEGER NOT NULL,
    `event_id` INTEGER NULL,
    `booked_by` VARCHAR(20) NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `purpose` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `room_bookings_room_id_idx`(`room_id`),
    INDEX `room_bookings_start_time_end_time_idx`(`start_time`, `end_time`),
    INDEX `room_bookings_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `room_bookings_room_id_start_time_end_time_key`(`room_id`, `start_time`, `end_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `call_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `related_to_id` INTEGER NULL,
    `related_to_type` VARCHAR(50) NULL,
    `phone_number` VARCHAR(50) NOT NULL,
    `direction` VARCHAR(20) NOT NULL,
    `duration_seconds` INTEGER NULL,
    `call_result` VARCHAR(100) NULL,
    `summary` TEXT NULL,
    `next_action` VARCHAR(255) NULL,
    `recording_url` VARCHAR(500) NULL,
    `caller_name` VARCHAR(255) NULL,
    `logged_by` VARCHAR(20) NULL,
    `called_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `call_logs_related_to_id_related_to_type_idx`(`related_to_id`, `related_to_type`),
    INDEX `call_logs_phone_number_idx`(`phone_number`),
    INDEX `call_logs_direction_idx`(`direction`),
    INDEX `call_logs_called_at_idx`(`called_at`),
    INDEX `call_logs_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `report_type` VARCHAR(50) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `data_source` JSON NOT NULL,
    `fields` JSON NOT NULL,
    `filters` JSON NULL,
    `grouping` JSON NULL,
    `sorting` JSON NULL,
    `chart_config` JSON NULL,
    `is_scheduled` BOOLEAN NOT NULL DEFAULT false,
    `schedule_config` JSON NULL,
    `is_shared` BOOLEAN NOT NULL DEFAULT false,
    `shared_with` JSON NULL,
    `refresh_frequency` VARCHAR(50) NULL,
    `last_run_at` DATETIME(3) NULL,
    `cached_result` JSON NULL,
    `cache_expires_at` DATETIME(3) NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `custom_reports_report_type_category_idx`(`report_type`, `category`),
    INDEX `custom_reports_created_by_idx`(`created_by`),
    INDEX `custom_reports_is_shared_idx`(`is_shared`),
    INDEX `custom_reports_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_executions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER NOT NULL,
    `executed_by` VARCHAR(20) NULL,
    `execution_time` INTEGER NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `result_rows` INTEGER NULL,
    `error_message` TEXT NULL,
    `filters_used` JSON NULL,
    `cache_hit` BOOLEAN NOT NULL DEFAULT false,
    `executed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `report_executions_report_id_idx`(`report_id`),
    INDEX `report_executions_executed_at_idx`(`executed_at`),
    INDEX `report_executions_status_idx`(`status`),
    INDEX `report_executions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `report_id` INTEGER NOT NULL,
    `subscriber_id` VARCHAR(20) NOT NULL,
    `delivery_method` VARCHAR(50) NOT NULL,
    `delivery_format` VARCHAR(50) NOT NULL,
    `schedule` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_sent_at` DATETIME(3) NULL,
    `next_send_at` DATETIME(3) NULL,
    `delivery_config` JSON NULL,
    `subscribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `report_subscriptions_subscriber_id_idx`(`subscriber_id`),
    INDEX `report_subscriptions_is_active_next_send_at_idx`(`is_active`, `next_send_at`),
    INDEX `report_subscriptions_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `report_subscriptions_report_id_subscriber_id_key`(`report_id`, `subscriber_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpi_definitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `metric_type` VARCHAR(50) NOT NULL,
    `calculation` JSON NOT NULL,
    `target_value` DECIMAL(18, 4) NULL,
    `target_period` VARCHAR(50) NULL,
    `unit` VARCHAR(50) NULL,
    `threshold` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `update_frequency` VARCHAR(50) NOT NULL DEFAULT 'daily',
    `description` TEXT NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `kpi_definitions_category_idx`(`category`),
    INDEX `kpi_definitions_is_active_idx`(`is_active`),
    INDEX `kpi_definitions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kpi_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kpi_id` INTEGER NOT NULL,
    `value` DECIMAL(18, 4) NOT NULL,
    `target` DECIMAL(18, 4) NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `period_type` VARCHAR(50) NOT NULL,
    `calculation_meta` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `kpi_values_kpi_id_period_start_idx`(`kpi_id`, `period_start`),
    INDEX `kpi_values_period_type_calculated_at_idx`(`period_type`, `calculated_at`),
    INDEX `kpi_values_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytic_dashboards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(100) NOT NULL,
    `layout` JSON NOT NULL,
    `filters` JSON NULL,
    `refresh_rate` INTEGER NOT NULL DEFAULT 300,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `access_roles` JSON NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `analytic_dashboards_category_idx`(`category`),
    INDEX `analytic_dashboards_is_public_idx`(`is_public`),
    INDEX `analytic_dashboards_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytic_widgets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dashboard_id` INTEGER NOT NULL,
    `widget_type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `position_x` INTEGER NOT NULL DEFAULT 0,
    `position_y` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NOT NULL DEFAULT 4,
    `height` INTEGER NOT NULL DEFAULT 3,
    `data_source` JSON NOT NULL,
    `visualization` JSON NOT NULL,
    `filters` JSON NULL,
    `refresh_rate` INTEGER NULL,
    `is_real_time` BOOLEAN NOT NULL DEFAULT false,
    `drill_down` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `analytic_widgets_dashboard_id_idx`(`dashboard_id`),
    INDEX `analytic_widgets_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dashboard_kpis` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dashboard_id` INTEGER NOT NULL,
    `kpi_id` INTEGER NOT NULL,
    `position_x` INTEGER NOT NULL DEFAULT 0,
    `position_y` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NOT NULL DEFAULT 2,
    `height` INTEGER NOT NULL DEFAULT 2,
    `style_config` JSON NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `dashboard_kpis_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `dashboard_kpis_dashboard_id_kpi_id_key`(`dashboard_id`, `kpi_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dashboard_shares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dashboard_id` INTEGER NOT NULL,
    `shared_with` VARCHAR(20) NOT NULL,
    `permission` VARCHAR(20) NOT NULL,
    `shared_by` VARCHAR(20) NOT NULL,
    `shared_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `dashboard_shares_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `dashboard_shares_dashboard_id_shared_with_key`(`dashboard_id`, `shared_with`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_exports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `export_type` VARCHAR(50) NOT NULL,
    `object_types` JSON NOT NULL,
    `format` VARCHAR(20) NOT NULL,
    `file_path` VARCHAR(500) NULL,
    `file_size` BIGINT NULL,
    `record_count` INTEGER NULL,
    `filters` JSON NULL,
    `columns` JSON NULL,
    `status` VARCHAR(50) NOT NULL,
    `download_count` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `requested_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `data_exports_requested_by_idx`(`requested_by`),
    INDEX `data_exports_status_idx`(`status`),
    INDEX `data_exports_expires_at_idx`(`expires_at`),
    INDEX `data_exports_export_type_idx`(`export_type`),
    INDEX `data_exports_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contracts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_number` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `contract_type` VARCHAR(100) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `related_opportunity_id` INTEGER NULL,
    `related_account_id` INTEGER NULL,
    `related_contact_id` INTEGER NULL,
    `value` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `auto_renewal` BOOLEAN NOT NULL DEFAULT false,
    `renewal_period` VARCHAR(50) NULL,
    `renewal_notice_days` INTEGER NULL DEFAULT 30,
    `payment_terms` VARCHAR(100) NULL,
    `billing_frequency` VARCHAR(50) NULL,
    `contract_terms` TEXT NULL,
    `legal_review_required` BOOLEAN NOT NULL DEFAULT true,
    `legal_reviewer_id` VARCHAR(20) NULL,
    `legal_review_status` VARCHAR(50) NULL,
    `legal_review_notes` TEXT NULL,
    `template_id` INTEGER NULL,
    `document_url` VARCHAR(500) NULL,
    `signature_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `signed_date` DATETIME(3) NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `owner_id` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `contracts_contract_number_key`(`contract_number`),
    INDEX `contracts_status_idx`(`status`),
    INDEX `contracts_related_opportunity_id_idx`(`related_opportunity_id`),
    INDEX `contracts_related_account_id_idx`(`related_account_id`),
    INDEX `contracts_owner_id_idx`(`owner_id`),
    INDEX `contracts_start_date_end_date_idx`(`start_date`, `end_date`),
    INDEX `contracts_signature_status_idx`(`signature_status`),
    INDEX `contracts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `template_content` LONGTEXT NOT NULL,
    `variables` JSON NULL,
    `approval_required` BOOLEAN NOT NULL DEFAULT true,
    `default_terms` JSON NULL,
    `legal_approved` BOOLEAN NOT NULL DEFAULT false,
    `version` VARCHAR(20) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_templates_category_idx`(`category`),
    INDEX `contract_templates_is_active_idx`(`is_active`),
    INDEX `contract_templates_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_approvals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_id` INTEGER NOT NULL,
    `approver_id` VARCHAR(20) NOT NULL,
    `approval_stage` VARCHAR(100) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `approval_level` INTEGER NOT NULL DEFAULT 1,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `comments` TEXT NULL,
    `conditions` JSON NULL,
    `approved_at` DATETIME(3) NULL,
    `due_date` DATETIME(3) NULL,
    `delegated_to_id` VARCHAR(20) NULL,
    `notification_sent` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_approvals_contract_id_approval_level_idx`(`contract_id`, `approval_level`),
    INDEX `contract_approvals_approver_id_status_idx`(`approver_id`, `status`),
    INDEX `contract_approvals_due_date_idx`(`due_date`),
    INDEX `contract_approvals_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_signatures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_id` INTEGER NOT NULL,
    `signer_name` VARCHAR(255) NOT NULL,
    `signer_email` VARCHAR(255) NOT NULL,
    `signer_role` VARCHAR(100) NOT NULL,
    `signature_order` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `signature_method` VARCHAR(50) NULL,
    `signature_url` VARCHAR(500) NULL,
    `ip_address` VARCHAR(45) NULL,
    `signature_data` TEXT NULL,
    `invited_at` DATETIME(3) NULL,
    `viewed_at` DATETIME(3) NULL,
    `signed_at` DATETIME(3) NULL,
    `declined_reason` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_signatures_contract_id_signature_order_idx`(`contract_id`, `signature_order`),
    INDEX `contract_signatures_signer_email_idx`(`signer_email`),
    INDEX `contract_signatures_status_idx`(`status`),
    INDEX `contract_signatures_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_milestones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `due_date` DATETIME(3) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `completion_criteria` TEXT NULL,
    `deliverables` JSON NULL,
    `assigned_to` VARCHAR(20) NULL,
    `completion_notes` TEXT NULL,
    `payment_trigger` BOOLEAN NOT NULL DEFAULT false,
    `payment_amount` DECIMAL(18, 2) NULL,
    `completed_at` DATETIME(3) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_milestones_contract_id_order_index_idx`(`contract_id`, `order_index`),
    INDEX `contract_milestones_due_date_idx`(`due_date`),
    INDEX `contract_milestones_status_idx`(`status`),
    INDEX `contract_milestones_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_amendments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_id` INTEGER NOT NULL,
    `amendment_number` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `change_type` VARCHAR(100) NOT NULL,
    `effective_date` DATETIME(3) NULL,
    `old_values` JSON NULL,
    `new_values` JSON NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `requested_by` VARCHAR(20) NOT NULL,
    `approved_by` VARCHAR(20) NULL,
    `document_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_amendments_contract_id_idx`(`contract_id`),
    INDEX `contract_amendments_status_idx`(`status`),
    INDEX `contract_amendments_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_renewals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contract_id` INTEGER NOT NULL,
    `renewal_type` VARCHAR(50) NOT NULL,
    `renewal_period` VARCHAR(50) NOT NULL,
    `new_start_date` DATETIME(3) NULL,
    `new_end_date` DATETIME(3) NULL,
    `new_value` DECIMAL(18, 2) NULL,
    `rate_change_percent` DECIMAL(5, 2) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `terms_changed` BOOLEAN NOT NULL DEFAULT false,
    `new_terms` TEXT NULL,
    `approval_required` BOOLEAN NOT NULL DEFAULT true,
    `notice_sent_date` DATETIME(3) NULL,
    `decision_due_date` DATETIME(3) NULL,
    `executed_date` DATETIME(3) NULL,
    `new_contract_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `contract_renewals_contract_id_idx`(`contract_id`),
    INDEX `contract_renewals_status_idx`(`status`),
    INDEX `contract_renewals_decision_due_date_idx`(`decision_due_date`),
    INDEX `contract_renewals_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deal_stages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `stage_order` INTEGER NOT NULL,
    `probability` INTEGER NOT NULL DEFAULT 0,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `is_won` BOOLEAN NOT NULL DEFAULT false,
    `required_fields` JSON NULL,
    `typical_duration` INTEGER NULL,
    `stage_criteria` TEXT NULL,
    `exit_criteria` TEXT NULL,
    `category` VARCHAR(50) NOT NULL,
    `color` VARCHAR(20) NOT NULL DEFAULT '#6366f1',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `deal_stages_name_key`(`name`),
    UNIQUE INDEX `deal_stages_stage_order_key`(`stage_order`),
    INDEX `deal_stages_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deal_stage_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opportunity_id` INTEGER NOT NULL,
    `from_stage_id` INTEGER NULL,
    `to_stage_id` INTEGER NOT NULL,
    `from_probability` INTEGER NULL,
    `to_probability` INTEGER NOT NULL,
    `days_in_prev_stage` INTEGER NULL,
    `changed_by` VARCHAR(20) NOT NULL,
    `change_reason` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `deal_stage_history_opportunity_id_changed_at_idx`(`opportunity_id`, `changed_at`),
    INDEX `deal_stage_history_to_stage_id_idx`(`to_stage_id`),
    INDEX `deal_stage_history_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deal_competitors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opportunity_id` INTEGER NOT NULL,
    `competitor_name` VARCHAR(255) NOT NULL,
    `product_solution` VARCHAR(255) NULL,
    `strength` TEXT NULL,
    `weakness` TEXT NULL,
    `pricing_intel` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `win_probability` INTEGER NULL,
    `threat_level` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `last_activity` VARCHAR(255) NULL,
    `intelligence_source` VARCHAR(255) NULL,
    `added_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `deal_competitors_opportunity_id_idx`(`opportunity_id`),
    INDEX `deal_competitors_competitor_name_idx`(`competitor_name`),
    INDEX `deal_competitors_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `territories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `territory_code` VARCHAR(20) NOT NULL,
    `territory_type` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `parent_territory_id` INTEGER NULL,
    `geographic_data` JSON NULL,
    `industry_focus` JSON NULL,
    `account_criteria` JSON NULL,
    `annual_quota` DECIMAL(18, 2) NULL,
    `quota_currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `manager_id` VARCHAR(20) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `effective_from` DATE NULL,
    `effective_to` DATE NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `territories_territory_code_key`(`territory_code`),
    INDEX `territories_territory_type_idx`(`territory_type`),
    INDEX `territories_manager_id_idx`(`manager_id`),
    INDEX `territories_is_active_idx`(`is_active`),
    INDEX `territories_parent_territory_id_idx`(`parent_territory_id`),
    INDEX `territories_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `territory_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `territory_id` INTEGER NOT NULL,
    `record_type` VARCHAR(50) NOT NULL,
    `record_id` INTEGER NOT NULL,
    `assignment_method` VARCHAR(50) NOT NULL,
    `assignment_rule_id` INTEGER NULL,
    `confidence_score` DECIMAL(5, 2) NULL,
    `assigned_by` VARCHAR(20) NULL,
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effective_to` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `territory_assignments_record_type_record_id_idx`(`record_type`, `record_id`),
    INDEX `territory_assignments_territory_id_is_active_idx`(`territory_id`, `is_active`),
    INDEX `territory_assignments_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `territory_assignments_territory_id_record_type_record_id_eff_key`(`territory_id`, `record_type`, `record_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `territory_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `territory_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `member_role` VARCHAR(50) NOT NULL,
    `role_type` VARCHAR(50) NOT NULL,
    `quota_percentage` DECIMAL(5, 2) NULL,
    `commission_rate` DECIMAL(5, 4) NULL,
    `start_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `can_reassign` BOOLEAN NOT NULL DEFAULT false,
    `permissions` JSON NULL,
    `added_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `territory_members_employee_id_idx`(`employee_id`),
    INDEX `territory_members_is_active_idx`(`is_active`),
    INDEX `territory_members_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `territory_members_territory_id_employee_id_start_date_key`(`territory_id`, `employee_id`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `territory_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `territory_id` INTEGER NOT NULL,
    `rule_name` VARCHAR(255) NOT NULL,
    `object_type` VARCHAR(50) NOT NULL,
    `conditions` JSON NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `effective_from` DATE NULL,
    `effective_to` DATE NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `territory_rules_territory_id_is_active_priority_idx`(`territory_id`, `is_active`, `priority`),
    INDEX `territory_rules_object_type_idx`(`object_type`),
    INDEX `territory_rules_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `territory_performances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `territory_id` INTEGER NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `quota_amount` DECIMAL(18, 2) NULL,
    `revenue_actual` DECIMAL(18, 2) NULL,
    `revenue_pipeline` DECIMAL(18, 2) NULL,
    `deals_won` INTEGER NULL DEFAULT 0,
    `deals_lost` INTEGER NULL DEFAULT 0,
    `new_accounts` INTEGER NULL DEFAULT 0,
    `activities_completed` INTEGER NULL DEFAULT 0,
    `lead_conversion_rate` DECIMAL(5, 2) NULL,
    `avg_deal_size` DECIMAL(18, 2) NULL,
    `sales_cycle_days` DECIMAL(5, 1) NULL,
    `quota_attainment` DECIMAL(5, 2) NULL,
    `rank` INTEGER NULL,
    `metrics_data` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `territory_performances_period_start_period_end_idx`(`period_start`, `period_end`),
    INDEX `territory_performances_period_type_idx`(`period_type`),
    INDEX `territory_performances_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `territory_performances_territory_id_period_type_period_start_key`(`territory_id`, `period_type`, `period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `team_code` VARCHAR(20) NOT NULL,
    `team_type` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `manager_id` VARCHAR(20) NOT NULL,
    `parent_team_id` INTEGER NULL,
    `territory_focus` JSON NULL,
    `product_focus` JSON NULL,
    `market_segment` VARCHAR(100) NULL,
    `annual_quota` DECIMAL(18, 2) NULL,
    `quota_currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `commission_plan` JSON NULL,
    `meeting_cadence` VARCHAR(50) NULL,
    `kpi_targets` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `sales_teams_team_code_key`(`team_code`),
    INDEX `sales_teams_manager_id_idx`(`manager_id`),
    INDEX `sales_teams_team_type_idx`(`team_type`),
    INDEX `sales_teams_is_active_idx`(`is_active`),
    INDEX `sales_teams_parent_team_id_idx`(`parent_team_id`),
    INDEX `sales_teams_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_team_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `team_id` INTEGER NOT NULL,
    `employee_id` VARCHAR(20) NOT NULL,
    `member_role` VARCHAR(50) NOT NULL,
    `is_team_lead` BOOLEAN NOT NULL DEFAULT false,
    `individual_quota` DECIMAL(18, 2) NULL,
    `commission_rate` DECIMAL(5, 4) NULL,
    `start_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `performance_tier` VARCHAR(50) NULL,
    `mentoring_role` VARCHAR(50) NULL,
    `specializations` JSON NULL,
    `added_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `sales_team_members_employee_id_idx`(`employee_id`),
    INDEX `sales_team_members_is_active_idx`(`is_active`),
    INDEX `sales_team_members_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `sales_team_members_team_id_employee_id_start_date_key`(`team_id`, `employee_id`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_meetings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `team_id` INTEGER NOT NULL,
    `meeting_type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `meeting_date` DATETIME(3) NOT NULL,
    `duration_minutes` INTEGER NULL DEFAULT 60,
    `location` VARCHAR(255) NULL,
    `meeting_link` VARCHAR(500) NULL,
    `agenda` TEXT NULL,
    `notes` TEXT NULL,
    `action_items` JSON NULL,
    `attendees` JSON NULL,
    `metrics_reviewed` JSON NULL,
    `decisions_made` TEXT NULL,
    `next_meeting` DATETIME(3) NULL,
    `organizer_id` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `team_meetings_team_id_meeting_date_idx`(`team_id`, `meeting_date`),
    INDEX `team_meetings_meeting_type_idx`(`meeting_type`),
    INDEX `team_meetings_meeting_date_idx`(`meeting_date`),
    INDEX `team_meetings_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_performances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `team_id` INTEGER NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `quota_amount` DECIMAL(18, 2) NULL,
    `revenue_actual` DECIMAL(18, 2) NULL,
    `revenue_pipeline` DECIMAL(18, 2) NULL,
    `deals_won` INTEGER NULL DEFAULT 0,
    `deals_lost` INTEGER NULL DEFAULT 0,
    `activities_logged` INTEGER NULL DEFAULT 0,
    `avg_deal_size` DECIMAL(18, 2) NULL,
    `sales_velocity` DECIMAL(8, 2) NULL,
    `quota_attainment` DECIMAL(5, 2) NULL,
    `activity_score` DECIMAL(5, 1) NULL,
    `collaboration_score` DECIMAL(5, 1) NULL,
    `top_performer_id` VARCHAR(20) NULL,
    `improvement_areas` JSON NULL,
    `achievements` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `team_performances_period_start_period_end_idx`(`period_start`, `period_end`),
    INDEX `team_performances_quota_attainment_idx`(`quota_attainment`),
    INDEX `team_performances_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `team_performances_team_id_period_type_period_start_period_en_key`(`team_id`, `period_type`, `period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_portal_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contact_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `company` VARCHAR(255) NULL,
    `job_title` VARCHAR(100) NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'user',
    `permissions` JSON NULL,
    `last_login_at` DATETIME(3) NULL,
    `login_attempts` INTEGER NOT NULL DEFAULT 0,
    `is_locked` BOOLEAN NOT NULL DEFAULT false,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verification_token` VARCHAR(255) NULL,
    `reset_token` VARCHAR(255) NULL,
    `reset_token_expires` DATETIME(3) NULL,
    `preferences` JSON NULL,
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `language` VARCHAR(10) NOT NULL DEFAULT 'en',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `customer_portal_users_contact_id_key`(`contact_id`),
    UNIQUE INDEX `customer_portal_users_email_key`(`email`),
    UNIQUE INDEX `customer_portal_users_verification_token_key`(`verification_token`),
    UNIQUE INDEX `customer_portal_users_reset_token_key`(`reset_token`),
    INDEX `customer_portal_users_email_idx`(`email`),
    INDEX `customer_portal_users_account_id_idx`(`account_id`),
    INDEX `customer_portal_users_contact_id_idx`(`contact_id`),
    INDEX `customer_portal_users_is_active_idx`(`is_active`),
    INDEX `customer_portal_users_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `portal_sessions` (
    `id` VARCHAR(128) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `login_method` VARCHAR(50) NOT NULL,
    `location` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NOT NULL,
    `last_activity` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `portal_sessions_user_id_idx`(`user_id`),
    INDEX `portal_sessions_expires_at_idx`(`expires_at`),
    INDEX `portal_sessions_last_activity_idx`(`last_activity`),
    INDEX `portal_sessions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_number` VARCHAR(50) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `related_crm_case_id` INTEGER NULL,
    `subject` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(100) NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `status` VARCHAR(50) NOT NULL DEFAULT 'open',
    `source` VARCHAR(50) NOT NULL DEFAULT 'portal',
    `product_area` VARCHAR(100) NULL,
    `attachment_urls` JSON NULL,
    `internal_notes` TEXT NULL,
    `resolution` TEXT NULL,
    `satisfaction_rating` INTEGER NULL,
    `satisfaction_feedback` TEXT NULL,
    `assigned_to` VARCHAR(20) NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `escalated_at` DATETIME(3) NULL,
    `sla_due_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `customer_cases_case_number_key`(`case_number`),
    UNIQUE INDEX `customer_cases_related_crm_case_id_key`(`related_crm_case_id`),
    INDEX `customer_cases_user_id_idx`(`user_id`),
    INDEX `customer_cases_status_idx`(`status`),
    INDEX `customer_cases_assigned_to_idx`(`assigned_to`),
    INDEX `customer_cases_sla_due_date_idx`(`sla_due_date`),
    INDEX `customer_cases_category_idx`(`category`),
    INDEX `customer_cases_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_id` INTEGER NOT NULL,
    `sender_type` VARCHAR(20) NOT NULL,
    `sender_id` VARCHAR(50) NULL,
    `sender_name` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `is_internal` BOOLEAN NOT NULL DEFAULT false,
    `attachments` JSON NULL,
    `message_type` VARCHAR(50) NOT NULL DEFAULT 'text',
    `read_by_customer` BOOLEAN NOT NULL DEFAULT false,
    `read_by_support` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `case_messages_case_id_idx`(`case_id`),
    INDEX `case_messages_created_at_idx`(`created_at`),
    INDEX `case_messages_is_internal_idx`(`is_internal`),
    INDEX `case_messages_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_escalations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_id` INTEGER NOT NULL,
    `escalated_from` VARCHAR(20) NULL,
    `escalated_to` VARCHAR(20) NOT NULL,
    `escalation_reason` VARCHAR(255) NOT NULL,
    `escalation_level` VARCHAR(50) NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `resolved_at` DATETIME(3) NULL,
    `escalated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `case_escalations_case_id_idx`(`case_id`),
    INDEX `case_escalations_escalated_to_idx`(`escalated_to`),
    INDEX `case_escalations_status_idx`(`status`),
    INDEX `case_escalations_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `request_type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `details` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `approval_required` BOOLEAN NOT NULL DEFAULT false,
    `approved_by` VARCHAR(20) NULL,
    `processed_by` VARCHAR(20) NULL,
    `approval_notes` TEXT NULL,
    `completion_data` JSON NULL,
    `completed_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `service_requests_user_id_idx`(`user_id`),
    INDEX `service_requests_request_type_idx`(`request_type`),
    INDEX `service_requests_status_idx`(`status`),
    INDEX `service_requests_expires_at_idx`(`expires_at`),
    INDEX `service_requests_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_articles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `summary` TEXT NULL,
    `category_id` INTEGER NOT NULL,
    `tags` JSON NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `is_internal` BOOLEAN NOT NULL DEFAULT false,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `helpful_votes` INTEGER NOT NULL DEFAULT 0,
    `unhelpful_votes` INTEGER NOT NULL DEFAULT 0,
    `search_keywords` TEXT NULL,
    `related_articles` JSON NULL,
    `author_id` VARCHAR(20) NOT NULL,
    `last_reviewed` DATETIME(3) NULL,
    `review_due` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `meta_title` VARCHAR(255) NULL,
    `meta_description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `knowledge_articles_slug_key`(`slug`),
    INDEX `knowledge_articles_category_id_idx`(`category_id`),
    INDEX `knowledge_articles_is_published_is_featured_idx`(`is_published`, `is_featured`),
    INDEX `knowledge_articles_slug_idx`(`slug`),
    INDEX `knowledge_articles_tenant_id_idx`(`tenant_id`),
    FULLTEXT INDEX `knowledge_articles_title_summary_content_idx`(`title`, `summary`, `content`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `parent_id` INTEGER NULL,
    `icon` VARCHAR(50) NULL,
    `color` VARCHAR(20) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `knowledge_categories_slug_key`(`slug`),
    INDEX `knowledge_categories_parent_id_idx`(`parent_id`),
    INDEX `knowledge_categories_is_visible_sort_order_idx`(`is_visible`, `sort_order`),
    INDEX `knowledge_categories_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `article_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `rating` INTEGER NOT NULL,
    `is_helpful` BOOLEAN NULL,
    `feedback` TEXT NULL,
    `visitor_id` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `article_feedback_article_id_idx`(`article_id`),
    INDEX `article_feedback_user_id_idx`(`user_id`),
    INDEX `article_feedback_created_at_idx`(`created_at`),
    INDEX `article_feedback_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `article_id` INTEGER NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NULL,
    `mime_type` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `is_downloadable` BOOLEAN NOT NULL DEFAULT true,
    `download_count` INTEGER NOT NULL DEFAULT 0,
    `uploaded_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `article_attachments_article_id_idx`(`article_id`),
    INDEX `article_attachments_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `feedback_type` VARCHAR(50) NOT NULL,
    `related_id` INTEGER NULL,
    `related_type` VARCHAR(50) NULL,
    `rating_overall` INTEGER NULL,
    `rating_quality` INTEGER NULL,
    `rating_speed` INTEGER NULL,
    `rating_ease` INTEGER NULL,
    `comments` TEXT NULL,
    `improvement_suggestions` TEXT NULL,
    `would_recommend` BOOLEAN NULL,
    `contact_permission` BOOLEAN NOT NULL DEFAULT false,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `sentiment` VARCHAR(20) NULL,
    `follow_up_required` BOOLEAN NOT NULL DEFAULT false,
    `follow_up_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `customer_feedback_user_id_idx`(`user_id`),
    INDEX `customer_feedback_feedback_type_idx`(`feedback_type`),
    INDEX `customer_feedback_rating_overall_idx`(`rating_overall`),
    INDEX `customer_feedback_would_recommend_idx`(`would_recommend`),
    INDEX `customer_feedback_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `portal_downloads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `item_type` VARCHAR(50) NOT NULL,
    `item_id` VARCHAR(255) NOT NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` BIGINT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `portal_downloads_user_id_idx`(`user_id`),
    INDEX `portal_downloads_item_type_idx`(`item_type`),
    INDEX `portal_downloads_created_at_idx`(`created_at`),
    INDEX `portal_downloads_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(50) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `account_id` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `profile_url` VARCHAR(500) NULL,
    `follower_count` INTEGER NULL DEFAULT 0,
    `following_count` INTEGER NULL DEFAULT 0,
    `post_count` INTEGER NULL DEFAULT 0,
    `account_type` VARCHAR(50) NOT NULL,
    `verification_status` VARCHAR(50) NULL,
    `connection_status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `access_token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `token_expires_at` DATETIME(3) NULL,
    `last_sync_at` DATETIME(3) NULL,
    `sync_frequency` VARCHAR(50) NOT NULL DEFAULT 'daily',
    `auto_monitoring` BOOLEAN NOT NULL DEFAULT true,
    `managed_by` VARCHAR(20) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_media_accounts_platform_idx`(`platform`),
    INDEX `social_media_accounts_managed_by_idx`(`managed_by`),
    INDEX `social_media_accounts_connection_status_idx`(`connection_status`),
    INDEX `social_media_accounts_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `social_media_accounts_platform_account_id_key`(`platform`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NOT NULL,
    `platform_post_id` VARCHAR(255) NOT NULL,
    `post_type` VARCHAR(50) NOT NULL,
    `content` TEXT NULL,
    `media_urls` JSON NULL,
    `hashtags` JSON NULL,
    `mentions` JSON NULL,
    `engagement_metrics` JSON NULL,
    `post_url` VARCHAR(500) NULL,
    `is_promoted` BOOLEAN NOT NULL DEFAULT false,
    `promotion_budget` DECIMAL(10, 2) NULL,
    `target_audience` JSON NULL,
    `reach` INTEGER NULL,
    `impressions` INTEGER NULL,
    `click_through_rate` DECIMAL(5, 4) NULL,
    `lead_generated` BOOLEAN NOT NULL DEFAULT false,
    `published_at` DATETIME(3) NULL,
    `scheduled_for` DATETIME(3) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_media_posts_status_idx`(`status`),
    INDEX `social_media_posts_published_at_idx`(`published_at`),
    INDEX `social_media_posts_lead_generated_idx`(`lead_generated`),
    INDEX `social_media_posts_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `social_media_posts_account_id_platform_post_id_key`(`account_id`, `platform_post_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_mentions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NULL,
    `platform` VARCHAR(50) NOT NULL,
    `mention_type` VARCHAR(50) NOT NULL,
    `content` TEXT NOT NULL,
    `author_name` VARCHAR(255) NOT NULL,
    `author_handle` VARCHAR(255) NULL,
    `author_profile` VARCHAR(500) NULL,
    `follower_count` INTEGER NULL,
    `post_url` VARCHAR(500) NULL,
    `sentiment` VARCHAR(20) NOT NULL,
    `sentiment_score` DECIMAL(3, 2) NULL,
    `influence_score` INTEGER NULL,
    `reach_estimate` INTEGER NULL,
    `keywords_matched` JSON NULL,
    `is_verified_author` BOOLEAN NOT NULL DEFAULT false,
    `requires_response` BOOLEAN NOT NULL DEFAULT false,
    `response_priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `assigned_to` VARCHAR(20) NULL,
    `response_sent` BOOLEAN NOT NULL DEFAULT false,
    `response_content` TEXT NULL,
    `response_sent_at` DATETIME(3) NULL,
    `mentioned_at` DATETIME(3) NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_media_mentions_platform_idx`(`platform`),
    INDEX `social_media_mentions_sentiment_idx`(`sentiment`),
    INDEX `social_media_mentions_requires_response_idx`(`requires_response`),
    INDEX `social_media_mentions_assigned_to_idx`(`assigned_to`),
    INDEX `social_media_mentions_mentioned_at_idx`(`mentioned_at`),
    INDEX `social_media_mentions_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_engagements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `account_id` INTEGER NULL,
    `post_id` INTEGER NULL,
    `platform` VARCHAR(50) NOT NULL,
    `engagement_type` VARCHAR(50) NOT NULL,
    `user_handle` VARCHAR(255) NULL,
    `user_name` VARCHAR(255) NULL,
    `user_profile` VARCHAR(500) NULL,
    `content` TEXT NULL,
    `engagement_url` VARCHAR(500) NULL,
    `is_lead_potential` BOOLEAN NOT NULL DEFAULT false,
    `lead_score` INTEGER NULL,
    `user_follower_count` INTEGER NULL,
    `engagement_value` DECIMAL(5, 2) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_media_engagements_account_id_idx`(`account_id`),
    INDEX `social_media_engagements_engagement_type_idx`(`engagement_type`),
    INDEX `social_media_engagements_is_lead_potential_idx`(`is_lead_potential`),
    INDEX `social_media_engagements_occurred_at_idx`(`occurred_at`),
    INDEX `social_media_engagements_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `campaign_type` VARCHAR(50) NOT NULL,
    `objective` VARCHAR(255) NOT NULL,
    `target_audience` JSON NOT NULL,
    `budget_total` DECIMAL(10, 2) NULL,
    `budget_daily` DECIMAL(8, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `platforms` JSON NOT NULL,
    `content_themes` JSON NULL,
    `hashtag_strategy` JSON NULL,
    `posting_schedule` JSON NULL,
    `success_metrics` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'planning',
    `performance_summary` JSON NULL,
    `lessons_learned` TEXT NULL,
    `roi` DECIMAL(8, 4) NULL,
    `lead_conversion_rate` DECIMAL(5, 2) NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `manager_id` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_media_campaigns_status_idx`(`status`),
    INDEX `social_media_campaigns_start_date_end_date_idx`(`start_date`, `end_date`),
    INDEX `social_media_campaigns_campaign_type_idx`(`campaign_type`),
    INDEX `social_media_campaigns_manager_id_idx`(`manager_id`),
    INDEX `social_media_campaigns_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_media_leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NULL,
    `platform` VARCHAR(50) NOT NULL,
    `source_type` VARCHAR(50) NOT NULL,
    `source_url` VARCHAR(500) NULL,
    `user_handle` VARCHAR(255) NULL,
    `user_profile` VARCHAR(500) NULL,
    `display_name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `company` VARCHAR(255) NULL,
    `job_title` VARCHAR(255) NULL,
    `location` VARCHAR(255) NULL,
    `bio_keywords` JSON NULL,
    `follower_count` INTEGER NULL,
    `verified_account` BOOLEAN NOT NULL DEFAULT false,
    `engagement_history` JSON NULL,
    `lead_score` INTEGER NULL DEFAULT 0,
    `interest_indicators` JSON NULL,
    `conversion_action` VARCHAR(255) NULL,
    `utm_source` VARCHAR(100) NULL,
    `utm_medium` VARCHAR(100) NULL,
    `utm_campaign` VARCHAR(100) NULL,
    `utm_content` VARCHAR(255) NULL,
    `crm_lead_id` INTEGER NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'new',
    `qualification_notes` TEXT NULL,
    `assigned_to` VARCHAR(20) NULL,
    `converted_at` DATETIME(3) NULL,
    `discovered_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `social_media_leads_crm_lead_id_key`(`crm_lead_id`),
    INDEX `social_media_leads_platform_idx`(`platform`),
    INDEX `social_media_leads_status_idx`(`status`),
    INDEX `social_media_leads_lead_score_idx`(`lead_score`),
    INDEX `social_media_leads_assigned_to_idx`(`assigned_to`),
    INDEX `social_media_leads_discovered_at_idx`(`discovered_at`),
    INDEX `social_media_leads_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_listening_keywords` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keyword` VARCHAR(255) NOT NULL,
    `keyword_type` VARCHAR(50) NOT NULL,
    `category` VARCHAR(100) NULL,
    `match_type` VARCHAR(50) NOT NULL DEFAULT 'contains',
    `platforms` JSON NOT NULL,
    `is_case_sensitive` BOOLEAN NOT NULL DEFAULT false,
    `exclude_own_mentions` BOOLEAN NOT NULL DEFAULT true,
    `alert_threshold` INTEGER NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `social_listening_keywords_keyword_type_idx`(`keyword_type`),
    INDEX `social_listening_keywords_is_active_idx`(`is_active`),
    INDEX `social_listening_keywords_category_idx`(`category`),
    INDEX `social_listening_keywords_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competitor_social_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `competitor_name` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(50) NOT NULL,
    `account_handle` VARCHAR(255) NOT NULL,
    `activity_type` VARCHAR(50) NOT NULL,
    `content_summary` TEXT NULL,
    `content_url` VARCHAR(500) NULL,
    `engagement_metrics` JSON NULL,
    `campaign_insights` JSON NULL,
    `competitive_impact` VARCHAR(255) NULL,
    `response_needed` BOOLEAN NOT NULL DEFAULT false,
    `response_plan` TEXT NULL,
    `detected_at` DATETIME(3) NOT NULL,
    `analyzed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `competitor_social_activities_competitor_name_idx`(`competitor_name`),
    INDEX `competitor_social_activities_platform_idx`(`platform`),
    INDEX `competitor_social_activities_activity_type_idx`(`activity_type`),
    INDEX `competitor_social_activities_detected_at_idx`(`detected_at`),
    INDEX `competitor_social_activities_response_needed_idx`(`response_needed`),
    INDEX `competitor_social_activities_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_code` VARCHAR(20) NOT NULL,
    `company_name` VARCHAR(255) NOT NULL,
    `legal_name` VARCHAR(255) NULL,
    `partner_type` VARCHAR(50) NOT NULL,
    `partner_tier` VARCHAR(50) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'prospect',
    `business_model` VARCHAR(100) NULL,
    `primary_industry` VARCHAR(100) NULL,
    `geographic_coverage` JSON NULL,
    `website` VARCHAR(500) NULL,
    `headquarters_country` VARCHAR(100) NULL,
    `headquarters_city` VARCHAR(100) NULL,
    `employee_count` INTEGER NULL,
    `annual_revenue` DECIMAL(18, 2) NULL,
    `revenue_currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `partnership_start_date` DATE NULL,
    `contract_end_date` DATE NULL,
    `contract_terms` TEXT NULL,
    `commission_rate` DECIMAL(5, 4) NULL,
    `discount_level` DECIMAL(5, 2) NULL,
    `credit_limit` DECIMAL(18, 2) NULL,
    `payment_terms` VARCHAR(100) NULL,
    `certifications` JSON NULL,
    `specializations` JSON NULL,
    `portal_access` BOOLEAN NOT NULL DEFAULT false,
    `marketing_enabled` BOOLEAN NOT NULL DEFAULT false,
    `lead_sharing_enabled` BOOLEAN NOT NULL DEFAULT false,
    `performance_score` DECIMAL(3, 1) NULL,
    `last_activity_date` DATETIME(3) NULL,
    `account_manager_id` VARCHAR(20) NULL,
    `onboarding_status` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `partners_partner_code_key`(`partner_code`),
    INDEX `partners_partner_type_idx`(`partner_type`),
    INDEX `partners_partner_tier_idx`(`partner_tier`),
    INDEX `partners_status_idx`(`status`),
    INDEX `partners_account_manager_id_idx`(`account_manager_id`),
    INDEX `partners_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `job_title` VARCHAR(100) NULL,
    `department` VARCHAR(100) NULL,
    `role_type` VARCHAR(50) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `decision_maker` BOOLEAN NOT NULL DEFAULT false,
    `portal_access` BOOLEAN NOT NULL DEFAULT false,
    `communication_preferences` JSON NULL,
    `specializations` JSON NULL,
    `last_contacted` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `partner_contacts_email_idx`(`email`),
    INDEX `partner_contacts_is_primary_idx`(`is_primary`),
    INDEX `partner_contacts_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `partner_contacts_partner_id_email_key`(`partner_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_opportunities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `opportunity_id` INTEGER NULL,
    `deal_registration_id` VARCHAR(100) NULL,
    `customer_name` VARCHAR(255) NOT NULL,
    `customer_contact` VARCHAR(255) NULL,
    `estimated_value` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `partner_role` VARCHAR(50) NOT NULL,
    `collaboration_type` VARCHAR(50) NOT NULL,
    `revenue_split` JSON NULL,
    `expected_close_date` DATE NULL,
    `stage` VARCHAR(100) NOT NULL,
    `probability` INTEGER NULL,
    `competitive_situation` TEXT NULL,
    `partner_investment` TEXT NULL,
    `support_needed` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `win_reason` TEXT NULL,
    `loss_reason` TEXT NULL,
    `lessons_learned` TEXT NULL,
    `registered_by` VARCHAR(20) NULL,
    `approved_by` VARCHAR(20) NULL,
    `registered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closed_at` DATETIME(3) NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `partner_opportunities_opportunity_id_key`(`opportunity_id`),
    UNIQUE INDEX `partner_opportunities_deal_registration_id_key`(`deal_registration_id`),
    INDEX `partner_opportunities_partner_id_idx`(`partner_id`),
    INDEX `partner_opportunities_status_idx`(`status`),
    INDEX `partner_opportunities_expected_close_date_idx`(`expected_close_date`),
    INDEX `partner_opportunities_partner_role_idx`(`partner_role`),
    INDEX `partner_opportunities_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_performances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `deals_registered` INTEGER NULL DEFAULT 0,
    `deals_won` INTEGER NULL DEFAULT 0,
    `deals_lost` INTEGER NULL DEFAULT 0,
    `revenue_generated` DECIMAL(18, 2) NULL,
    `revenue_influenced` DECIMAL(18, 2) NULL,
    `commission_earned` DECIMAL(18, 2) NULL,
    `certification_count` INTEGER NULL DEFAULT 0,
    `training_hours` INTEGER NULL DEFAULT 0,
    `marketing_activities` INTEGER NULL DEFAULT 0,
    `lead_referrals_sent` INTEGER NULL DEFAULT 0,
    `lead_referrals_converted` INTEGER NULL DEFAULT 0,
    `customer_satisfaction` DECIMAL(3, 2) NULL,
    `partner_satisfaction` DECIMAL(3, 2) NULL,
    `activity_score` DECIMAL(5, 2) NULL,
    `engagement_level` VARCHAR(50) NULL,
    `performance_trend` VARCHAR(50) NULL,
    `ranking` INTEGER NULL,
    `goal_attainment` DECIMAL(5, 2) NULL,
    `key_achievements` JSON NULL,
    `improvement_areas` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `partner_performances_performance_trend_idx`(`performance_trend`),
    INDEX `partner_performances_ranking_idx`(`ranking`),
    INDEX `partner_performances_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `partner_performances_partner_id_period_type_period_start_per_key`(`partner_id`, `period_type`, `period_start`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_certifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `contact_id` INTEGER NULL,
    `certification_name` VARCHAR(255) NOT NULL,
    `certification_type` VARCHAR(100) NOT NULL,
    `certification_level` VARCHAR(50) NOT NULL,
    `issuing_body` VARCHAR(255) NULL,
    `badge_url` VARCHAR(500) NULL,
    `earned_date` DATE NOT NULL,
    `expiry_date` DATE NULL,
    `renewal_required` BOOLEAN NOT NULL DEFAULT true,
    `credits_earned` INTEGER NULL,
    `score_achieved` DECIMAL(5, 2) NULL,
    `training_hours` INTEGER NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `verified_by` VARCHAR(20) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `partner_certifications_partner_id_idx`(`partner_id`),
    INDEX `partner_certifications_certification_type_idx`(`certification_type`),
    INDEX `partner_certifications_expiry_date_idx`(`expiry_date`),
    INDEX `partner_certifications_status_idx`(`status`),
    INDEX `partner_certifications_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_marketing_activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `activity_name` VARCHAR(255) NOT NULL,
    `activity_type` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `target_audience` VARCHAR(255) NULL,
    `geographic_scope` JSON NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `budget_total` DECIMAL(10, 2) NULL,
    `budget_partner_share` DECIMAL(10, 2) NULL,
    `budget_our_share` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `expected_leads` INTEGER NULL,
    `expected_revenue` DECIMAL(18, 2) NULL,
    `actual_leads` INTEGER NULL,
    `actual_revenue` DECIMAL(18, 2) NULL,
    `partner_satisfaction` DECIMAL(3, 2) NULL,
    `our_satisfaction` DECIMAL(3, 2) NULL,
    `success_metrics` JSON NULL,
    `lessons_learned` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'planned',
    `approval_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `approved_by` VARCHAR(20) NULL,
    `managed_by` VARCHAR(20) NULL,
    `created_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `partner_marketing_activities_partner_id_idx`(`partner_id`),
    INDEX `partner_marketing_activities_activity_type_idx`(`activity_type`),
    INDEX `partner_marketing_activities_status_idx`(`status`),
    INDEX `partner_marketing_activities_start_date_end_date_idx`(`start_date`, `end_date`),
    INDEX `partner_marketing_activities_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_portal_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `contact_id` INTEGER NULL,
    `username` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `permissions` JSON NULL,
    `is_approved` BOOLEAN NOT NULL DEFAULT false,
    `approved_by` VARCHAR(20) NULL,
    `approved_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `login_count` INTEGER NOT NULL DEFAULT 0,
    `is_locked` BOOLEAN NOT NULL DEFAULT false,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `portal_preferences` JSON NULL,
    `notification_settings` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `partner_portal_users_contact_id_key`(`contact_id`),
    UNIQUE INDEX `partner_portal_users_username_key`(`username`),
    UNIQUE INDEX `partner_portal_users_email_key`(`email`),
    INDEX `partner_portal_users_partner_id_idx`(`partner_id`),
    INDEX `partner_portal_users_email_idx`(`email`),
    INDEX `partner_portal_users_is_approved_idx`(`is_approved`),
    INDEX `partner_portal_users_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_lead_shares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `partner_id` INTEGER NOT NULL,
    `lead_id` INTEGER NOT NULL,
    `share_type` VARCHAR(50) NOT NULL,
    `lead_source` VARCHAR(100) NULL,
    `customer_industry` VARCHAR(100) NULL,
    `deal_size_estimate` DECIMAL(18, 2) NULL,
    `partner_role` VARCHAR(50) NOT NULL,
    `exclusivity` VARCHAR(50) NOT NULL DEFAULT 'none',
    `exclusivity_expires` DATE NULL,
    `revenue_split` JSON NULL,
    `requirements` TEXT NULL,
    `acceptance_deadline` DATETIME(3) NULL,
    `acceptance_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `acceptance_reason` TEXT NULL,
    `follow_up_required` BOOLEAN NOT NULL DEFAULT true,
    `last_activity` DATETIME(3) NULL,
    `outcome` VARCHAR(50) NULL,
    `outcome_revenue` DECIMAL(18, 2) NULL,
    `commission_paid` DECIMAL(18, 2) NULL,
    `feedback_score` DECIMAL(3, 2) NULL,
    `feedback_notes` TEXT NULL,
    `shared_by` VARCHAR(20) NOT NULL,
    `shared_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `partner_lead_shares_partner_id_idx`(`partner_id`),
    INDEX `partner_lead_shares_acceptance_status_idx`(`acceptance_status`),
    INDEX `partner_lead_shares_share_type_idx`(`share_type`),
    INDEX `partner_lead_shares_exclusivity_expires_idx`(`exclusivity_expires`),
    INDEX `partner_lead_shares_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_conflicts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conflict_type` VARCHAR(100) NOT NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `status` VARCHAR(50) NOT NULL DEFAULT 'reported',
    `customer_name` VARCHAR(255) NULL,
    `deal_value` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `primary_partner_id` INTEGER NULL,
    `secondary_partner_id` INTEGER NULL,
    `territory_disputed` VARCHAR(255) NULL,
    `reported_by` VARCHAR(20) NOT NULL,
    `assigned_to` VARCHAR(20) NOT NULL,
    `description` TEXT NOT NULL,
    `impact_assessment` TEXT NULL,
    `resolution_strategy` TEXT NULL,
    `resolution_details` TEXT NULL,
    `escalation_level` INTEGER NOT NULL DEFAULT 1,
    `escalation_reason` TEXT NULL,
    `sla_due_date` DATETIME(3) NULL,
    `customer_impact` VARCHAR(100) NULL,
    `prevention_measures` TEXT NULL,
    `lessons_learned` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `channel_conflicts_conflict_type_idx`(`conflict_type`),
    INDEX `channel_conflicts_status_idx`(`status`),
    INDEX `channel_conflicts_priority_idx`(`priority`),
    INDEX `channel_conflicts_assigned_to_idx`(`assigned_to`),
    INDEX `channel_conflicts_sla_due_date_idx`(`sla_due_date`),
    INDEX `channel_conflicts_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `domain` VARCHAR(255) NULL,
    `industry` VARCHAR(50) NULL,
    `plan` VARCHAR(50) NOT NULL DEFAULT 'free',
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `trial_ends_at` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `suspended_reason` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,
    `max_users` INTEGER NOT NULL DEFAULT 5,
    `max_storage_mb` INTEGER NOT NULL DEFAULT 500,
    `max_api_calls` INTEGER NOT NULL DEFAULT 10000,
    `logo_url` VARCHAR(500) NULL,
    `primary_color` VARCHAR(20) NULL,
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `locale` VARCHAR(10) NOT NULL DEFAULT 'en',
    `billing_email` VARCHAR(255) NULL,
    `billing_address` JSON NULL,
    `metadata` JSON NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    UNIQUE INDEX `tenants_domain_key`(`domain`),
    INDEX `tenants_status_idx`(`status`),
    INDEX `tenants_plan_idx`(`plan`),
    INDEX `tenants_slug_idx`(`slug`),
    INDEX `tenants_industry_idx`(`industry`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `config_key` VARCHAR(100) NOT NULL,
    `config_value` TEXT NULL,
    `updated_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_configs_tenant_id_config_key_key`(`tenant_id`, `config_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_usage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `metric` VARCHAR(50) NOT NULL,
    `value` DECIMAL(18, 2) NOT NULL,
    `period` VARCHAR(20) NOT NULL,
    `period_type` VARCHAR(20) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_usage_tenant_id_idx`(`tenant_id`),
    INDEX `tenant_usage_metric_idx`(`metric`),
    INDEX `tenant_usage_period_idx`(`period`),
    UNIQUE INDEX `tenant_usage_tenant_id_metric_period_period_type_key`(`tenant_id`, `metric`, `period`, `period_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `price_monthly` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `price_annual` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
    `max_users` INTEGER NOT NULL DEFAULT 5,
    `max_storage_mb` INTEGER NOT NULL DEFAULT 500,
    `max_api_calls` INTEGER NOT NULL DEFAULT 10000,
    `max_records` INTEGER NOT NULL DEFAULT 10000,
    `max_workflows` INTEGER NOT NULL DEFAULT 5,
    `max_dashboards` INTEGER NOT NULL DEFAULT 3,
    `features` JSON NULL,
    `limits` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `trial_days` INTEGER NOT NULL DEFAULT 14,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_name_key`(`name`),
    INDEX `subscription_plans_is_active_idx`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'general',
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `rollout_percent` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_flags_name_key`(`name`),
    INDEX `feature_flags_category_idx`(`category`),
    INDEX `feature_flags_is_enabled_idx`(`is_enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_feature_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NOT NULL,
    `flag_id` INTEGER NOT NULL,
    `is_enabled` BOOLEAN NOT NULL,
    `config` JSON NULL,
    `updated_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_feature_overrides_tenant_id_flag_id_key`(`tenant_id`, `flag_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` VARCHAR(20) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `target_type` VARCHAR(50) NULL,
    `target_id` VARCHAR(100) NULL,
    `details` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_audit_logs_admin_id_idx`(`admin_id`),
    INDEX `platform_audit_logs_action_idx`(`action`),
    INDEX `platform_audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    INDEX `platform_audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_announcements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `severity` VARCHAR(20) NOT NULL DEFAULT 'info',
    `type` VARCHAR(50) NOT NULL DEFAULT 'banner',
    `target` VARCHAR(50) NOT NULL DEFAULT 'all',
    `target_ids` JSON NULL,
    `action_url` VARCHAR(500) NULL,
    `action_label` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_dismissible` BOOLEAN NOT NULL DEFAULT true,
    `active_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `active_to` DATETIME(3) NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `system_announcements_is_active_idx`(`is_active`),
    INDEX `system_announcements_active_from_active_to_idx`(`active_from`, `active_to`),
    INDEX `system_announcements_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `impersonation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` VARCHAR(20) NOT NULL,
    `target_user_id` VARCHAR(20) NOT NULL,
    `target_tenant_id` INTEGER NULL,
    `reason` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `actions_taken` JSON NULL,
    `ip_address` VARCHAR(45) NULL,

    INDEX `impersonation_logs_admin_id_idx`(`admin_id`),
    INDEX `impersonation_logs_target_user_id_idx`(`target_user_id`),
    INDEX `impersonation_logs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_rate_limits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `plan_name` VARCHAR(50) NULL,
    `tenant_id` INTEGER NULL,
    `endpoint_pattern` VARCHAR(255) NULL,
    `requests_per_minute` INTEGER NOT NULL DEFAULT 60,
    `requests_per_hour` INTEGER NOT NULL DEFAULT 1000,
    `requests_per_day` INTEGER NOT NULL DEFAULT 10000,
    `burst_limit` INTEGER NOT NULL DEFAULT 100,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `api_rate_limits_plan_name_idx`(`plan_name`),
    INDEX `api_rate_limits_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `security_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NULL,
    `require_mfa` BOOLEAN NOT NULL DEFAULT false,
    `password_min_length` INTEGER NOT NULL DEFAULT 8,
    `password_require_upper` BOOLEAN NOT NULL DEFAULT true,
    `password_require_number` BOOLEAN NOT NULL DEFAULT true,
    `password_require_special` BOOLEAN NOT NULL DEFAULT false,
    `password_expiry_days` INTEGER NOT NULL DEFAULT 0,
    `max_login_attempts` INTEGER NOT NULL DEFAULT 5,
    `lockout_duration_min` INTEGER NOT NULL DEFAULT 30,
    `session_timeout_min` INTEGER NOT NULL DEFAULT 480,
    `ip_allowlist` JSON NULL,
    `ip_blocklist` JSON NULL,
    `allowed_domains` JSON NULL,
    `force_password_reset` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `updated_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `security_policies_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_export_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenant_id` INTEGER NULL,
    `requested_by` VARCHAR(20) NOT NULL,
    `export_type` VARCHAR(50) NOT NULL,
    `scope` JSON NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `file_path` VARCHAR(500) NULL,
    `file_size` BIGINT NULL,
    `error` TEXT NULL,
    `expires_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `data_export_requests_tenant_id_idx`(`tenant_id`),
    INDEX `data_export_requests_status_idx`(`status`),
    INDEX `data_export_requests_requested_by_idx`(`requested_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_notification_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NULL,
    `link` VARCHAR(500) NULL,
    `target_type` VARCHAR(20) NOT NULL,
    `target_value` JSON NULL,
    `recipient_count` INTEGER NOT NULL DEFAULT 0,
    `sent_by` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `push_notification_logs_tenant_id_idx`(`tenant_id`),
    INDEX `push_notification_logs_sent_by_idx`(`sent_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_carriers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `naic_code` VARCHAR(10) NULL,
    `am_best_rating` VARCHAR(10) NULL,
    `carrier_type` VARCHAR(50) NOT NULL DEFAULT 'life',
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `website` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `insurance_carriers_is_active_idx`(`is_active`),
    INDEX `insurance_carriers_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `insurance_carriers_code_tenant_id_key`(`code`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carrier_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carrier_id` INTEGER NOT NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `plan_code` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `min_coverage` DECIMAL(18, 2) NULL,
    `max_coverage` DECIMAL(18, 2) NULL,
    `min_age` INTEGER NULL,
    `max_age` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `carrier_products_carrier_id_idx`(`carrier_id`),
    INDEX `carrier_products_product_type_idx`(`product_type`),
    INDEX `carrier_products_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `policy_number` VARCHAR(100) NOT NULL,
    `carrier_id` INTEGER NULL,
    `carrier_product_id` INTEGER NULL,
    `contact_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `agent_id` VARCHAR(20) NULL,
    `application_id` INTEGER NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `product_name` VARCHAR(255) NULL,
    `coverage_amount` DECIMAL(18, 2) NOT NULL,
    `premium_amount` DECIMAL(18, 2) NOT NULL,
    `premium_frequency` VARCHAR(20) NOT NULL DEFAULT 'monthly',
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `effective_date` DATE NOT NULL,
    `expiry_date` DATE NULL,
    `renewal_due_date` DATE NULL,
    `is_lapsed` BOOLEAN NOT NULL DEFAULT false,
    `lapsed_at` DATETIME(3) NULL,
    `reinstated_at` DATETIME(3) NULL,
    `surrender_value` DECIMAL(18, 2) NULL,
    `death_benefit` DECIMAL(18, 2) NULL,
    `last_payment_date` DATE NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `insurance_policies_record_id_key`(`record_id`),
    UNIQUE INDEX `insurance_policies_application_id_key`(`application_id`),
    INDEX `insurance_policies_contact_id_idx`(`contact_id`),
    INDEX `insurance_policies_agent_id_idx`(`agent_id`),
    INDEX `insurance_policies_status_idx`(`status`),
    INDEX `insurance_policies_carrier_id_idx`(`carrier_id`),
    INDEX `insurance_policies_renewal_due_date_idx`(`renewal_due_date`),
    INDEX `insurance_policies_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `insurance_policies_policy_number_tenant_id_key`(`policy_number`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_policy_beneficiaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `relationship` VARCHAR(100) NULL,
    `beneficiary_type` VARCHAR(20) NOT NULL DEFAULT 'primary',
    `allocation_pct` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `contact_id` INTEGER NULL,
    `date_of_birth` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `insurance_policy_beneficiaries_policy_id_idx`(`policy_id`),
    INDEX `insurance_policy_beneficiaries_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_policy_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `policy_id` INTEGER NOT NULL,
    `from_status` VARCHAR(30) NULL,
    `to_status` VARCHAR(30) NOT NULL,
    `reason` TEXT NULL,
    `changed_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `insurance_policy_status_history_policy_id_idx`(`policy_id`),
    INDEX `insurance_policy_status_history_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `app_number` VARCHAR(100) NOT NULL,
    `contact_id` INTEGER NULL,
    `account_id` INTEGER NULL,
    `agent_id` VARCHAR(20) NULL,
    `carrier_id` INTEGER NULL,
    `carrier_product_id` INTEGER NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `product_name` VARCHAR(255) NULL,
    `coverage_amount` DECIMAL(18, 2) NOT NULL,
    `premium_amount` DECIMAL(18, 2) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'submitted',
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `age` INTEGER NULL,
    `gender` VARCHAR(20) NULL,
    `is_smoker` BOOLEAN NOT NULL DEFAULT false,
    `height_in` INTEGER NULL,
    `weight_lbs` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `insurance_applications_record_id_key`(`record_id`),
    INDEX `insurance_applications_contact_id_idx`(`contact_id`),
    INDEX `insurance_applications_agent_id_idx`(`agent_id`),
    INDEX `insurance_applications_status_idx`(`status`),
    INDEX `insurance_applications_carrier_id_idx`(`carrier_id`),
    INDEX `insurance_applications_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `insurance_applications_app_number_tenant_id_key`(`app_number`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `underwriting_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_number` VARCHAR(100) NOT NULL,
    `application_id` INTEGER NOT NULL,
    `assigned_underwriter` VARCHAR(20) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `risk_class` VARCHAR(30) NULL,
    `bmi` DOUBLE NULL,
    `blood_pressure` VARCHAR(30) NULL,
    `cholesterol` INTEGER NULL,
    `medical_conditions` TEXT NULL,
    `medications` TEXT NULL,
    `family_history` TEXT NULL,
    `decision_notes` TEXT NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `underwriting_cases_application_id_key`(`application_id`),
    INDEX `underwriting_cases_status_idx`(`status`),
    INDEX `underwriting_cases_assigned_underwriter_idx`(`assigned_underwriter`),
    INDEX `underwriting_cases_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `underwriting_cases_case_number_tenant_id_key`(`case_number`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `underwriting_requirements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `case_id` INTEGER NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `requirement_type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `due_date` DATE NULL,
    `received_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `underwriting_requirements_case_id_idx`(`case_id`),
    INDEX `underwriting_requirements_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `insurance_claims` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NULL,
    `claim_number` VARCHAR(100) NOT NULL,
    `policy_id` INTEGER NOT NULL,
    `contact_id` INTEGER NULL,
    `claim_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'filed',
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `adjuster_id` VARCHAR(20) NULL,
    `filed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `description` TEXT NULL,
    `paid_at` DATETIME(3) NULL,
    `paid_amount` DECIMAL(18, 2) NULL,
    `denial_reason` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    UNIQUE INDEX `insurance_claims_record_id_key`(`record_id`),
    INDEX `insurance_claims_policy_id_idx`(`policy_id`),
    INDEX `insurance_claims_status_idx`(`status`),
    INDEX `insurance_claims_claim_type_idx`(`claim_type`),
    INDEX `insurance_claims_adjuster_id_idx`(`adjuster_id`),
    INDEX `insurance_claims_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `insurance_claims_claim_number_tenant_id_key`(`claim_number`, `tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claim_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claim_id` INTEGER NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` INTEGER NOT NULL,

    INDEX `claim_events_claim_id_idx`(`claim_id`),
    INDEX `claim_events_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agent_id` VARCHAR(20) NOT NULL,
    `policy_id` INTEGER NULL,
    `application_id` INTEGER NULL,
    `carrier_id` INTEGER NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `source_premium` DECIMAL(18, 2) NOT NULL,
    `commission_rate` DECIMAL(5, 2) NOT NULL,
    `commission_amount` DECIMAL(18, 2) NOT NULL,
    `commission_period` VARCHAR(7) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `paid_at` DATETIME(3) NULL,
    `clawback_reason` TEXT NULL,
    `split_agent_id` VARCHAR(20) NULL,
    `split_percent` DECIMAL(5, 2) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(20) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `tenant_id` INTEGER NOT NULL,

    INDEX `commission_entries_agent_id_idx`(`agent_id`),
    INDEX `commission_entries_policy_id_idx`(`policy_id`),
    INDEX `commission_entries_application_id_idx`(`application_id`),
    INDEX `commission_entries_status_idx`(`status`),
    INDEX `commission_entries_commission_period_idx`(`commission_period`),
    INDEX `commission_entries_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_SocialMediaAccountToSocialMediaCampaign` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_SocialMediaAccountToSocialMediaCampaign_AB_unique`(`A`, `B`),
    INDEX `_SocialMediaAccountToSocialMediaCampaign_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`region_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`region_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_hierarchy` ADD CONSTRAINT `employee_hierarchy_ancestor_id_fkey` FOREIGN KEY (`ancestor_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_hierarchy` ADD CONSTRAINT `employee_hierarchy_descendant_id_fkey` FOREIGN KEY (`descendant_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_hierarchy` ADD CONSTRAINT `employee_hierarchy_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_modules` ADD CONSTRAINT `ui_modules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_objects` ADD CONSTRAINT `ui_objects_module_id_fkey` FOREIGN KEY (`module_id`) REFERENCES `ui_modules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_objects` ADD CONSTRAINT `ui_objects_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_fields` ADD CONSTRAINT `ui_fields_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_fields` ADD CONSTRAINT `ui_fields_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_forms` ADD CONSTRAINT `ui_forms_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_forms` ADD CONSTRAINT `ui_forms_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_form_field_layouts` ADD CONSTRAINT `ui_form_field_layouts_form_id_fkey` FOREIGN KEY (`form_id`) REFERENCES `ui_forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_form_field_layouts` ADD CONSTRAINT `ui_form_field_layouts_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `ui_fields`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_form_field_layouts` ADD CONSTRAINT `ui_form_field_layouts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_validations` ADD CONSTRAINT `ui_validations_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `ui_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_validations` ADD CONSTRAINT `ui_validations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_field_dependencies` ADD CONSTRAINT `ui_field_dependencies_source_field_id_fkey` FOREIGN KEY (`source_field_id`) REFERENCES `ui_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_field_dependencies` ADD CONSTRAINT `ui_field_dependencies_target_field_id_fkey` FOREIGN KEY (`target_field_id`) REFERENCES `ui_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_field_dependencies` ADD CONSTRAINT `ui_field_dependencies_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pages` ADD CONSTRAINT `ui_pages_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pages` ADD CONSTRAINT `ui_pages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_dashboards` ADD CONSTRAINT `ui_dashboards_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_dashboard_widgets` ADD CONSTRAINT `ui_dashboard_widgets_dashboard_id_fkey` FOREIGN KEY (`dashboard_id`) REFERENCES `ui_dashboards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_dashboard_widgets` ADD CONSTRAINT `ui_dashboard_widgets_chart_id_fkey` FOREIGN KEY (`chart_id`) REFERENCES `ui_charts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_dashboard_widgets` ADD CONSTRAINT `ui_dashboard_widgets_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_charts` ADD CONSTRAINT `ui_charts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_workflows` ADD CONSTRAINT `ui_workflows_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_workflows` ADD CONSTRAINT `ui_workflows_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_workflow_steps` ADD CONSTRAINT `ui_workflow_steps_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `ui_workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_workflow_steps` ADD CONSTRAINT `ui_workflow_steps_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_pending_steps` ADD CONSTRAINT `workflow_pending_steps_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `ui_workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_pending_steps` ADD CONSTRAINT `workflow_pending_steps_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_wizards` ADD CONSTRAINT `ui_wizards_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_wizards` ADD CONSTRAINT `ui_wizards_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_wizard_steps` ADD CONSTRAINT `ui_wizard_steps_wizard_id_fkey` FOREIGN KEY (`wizard_id`) REFERENCES `ui_wizards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_wizard_steps` ADD CONSTRAINT `ui_wizard_steps_form_id_fkey` FOREIGN KEY (`form_id`) REFERENCES `ui_forms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_wizard_steps` ADD CONSTRAINT `ui_wizard_steps_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pipelines` ADD CONSTRAINT `ui_pipelines_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pipelines` ADD CONSTRAINT `ui_pipelines_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pipeline_stages` ADD CONSTRAINT `ui_pipeline_stages_pipeline_id_fkey` FOREIGN KEY (`pipeline_id`) REFERENCES `ui_pipelines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_pipeline_stages` ADD CONSTRAINT `ui_pipeline_stages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_pipeline_stage_id_fkey` FOREIGN KEY (`pipeline_stage_id`) REFERENCES `ui_pipeline_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `records` ADD CONSTRAINT `records_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ui_permissions` ADD CONSTRAINT `ui_permissions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operational_permissions` ADD CONSTRAINT `operational_permissions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_rules` ADD CONSTRAINT `assignment_rules_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_rules` ADD CONSTRAINT `assignment_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `round_robin_states` ADD CONSTRAINT `round_robin_states_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `assignment_rules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `round_robin_states` ADD CONSTRAINT `round_robin_states_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_logs` ADD CONSTRAINT `assignment_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotas` ADD CONSTRAINT `quotas_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotas` ADD CONSTRAINT `quotas_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotas` ADD CONSTRAINT `quotas_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_jobs` ADD CONSTRAINT `import_jobs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integrations` ADD CONSTRAINT `integrations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integration_logs` ADD CONSTRAINT `integration_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_accounts` ADD CONSTRAINT `crm_accounts_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_accounts` ADD CONSTRAINT `crm_accounts_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_accounts` ADD CONSTRAINT `crm_accounts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_contacts` ADD CONSTRAINT `crm_contacts_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_contacts` ADD CONSTRAINT `crm_contacts_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_contacts` ADD CONSTRAINT `crm_contacts_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_contacts` ADD CONSTRAINT `crm_contacts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_leads` ADD CONSTRAINT `crm_leads_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_pipeline_stage_id_fkey` FOREIGN KEY (`pipeline_stage_id`) REFERENCES `ui_pipeline_stages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_opportunities` ADD CONSTRAINT `crm_opportunities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_cases` ADD CONSTRAINT `crm_cases_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_cases` ADD CONSTRAINT `crm_cases_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_cases` ADD CONSTRAINT `crm_cases_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_cases` ADD CONSTRAINT `crm_cases_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_cases` ADD CONSTRAINT `crm_cases_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_conversions` ADD CONSTRAINT `crm_lead_conversions_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_conversions` ADD CONSTRAINT `crm_lead_conversions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_conversions` ADD CONSTRAINT `crm_lead_conversions_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_conversions` ADD CONSTRAINT `crm_lead_conversions_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_lead_conversions` ADD CONSTRAINT `crm_lead_conversions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `crm_associations` ADD CONSTRAINT `crm_associations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_line_items` ADD CONSTRAINT `quote_line_items_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_line_items` ADD CONSTRAINT `quote_line_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_line_items` ADD CONSTRAINT `quote_line_items_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_templates` ADD CONSTRAINT `email_templates_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_templates` ADD CONSTRAINT `email_templates_object_id_fkey` FOREIGN KEY (`object_id`) REFERENCES `ui_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_templates` ADD CONSTRAINT `email_templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_logs` ADD CONSTRAINT `email_logs_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_logs` ADD CONSTRAINT `email_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_scoring_rules` ADD CONSTRAINT `lead_scoring_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_scores` ADD CONSTRAINT `lead_scores_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_scores` ADD CONSTRAINT `lead_scores_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `record_field_values` ADD CONSTRAINT `record_field_values_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `record_field_values` ADD CONSTRAINT `record_field_values_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_campaigns` ADD CONSTRAINT `email_campaigns_email_template_id_fkey` FOREIGN KEY (`email_template_id`) REFERENCES `email_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_campaigns` ADD CONSTRAINT `email_campaigns_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `email_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_recipients` ADD CONSTRAINT `campaign_recipients_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_email_sends` ADD CONSTRAINT `campaign_email_sends_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `email_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_email_sends` ADD CONSTRAINT `campaign_email_sends_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `campaign_recipients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_email_sends` ADD CONSTRAINT `campaign_email_sends_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_lists` ADD CONSTRAINT `email_lists_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_list_subscriptions` ADD CONSTRAINT `email_list_subscriptions_list_id_fkey` FOREIGN KEY (`list_id`) REFERENCES `email_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_list_subscriptions` ADD CONSTRAINT `email_list_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_list_assignments` ADD CONSTRAINT `campaign_list_assignments_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `email_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_list_assignments` ADD CONSTRAINT `campaign_list_assignments_list_id_fkey` FOREIGN KEY (`list_id`) REFERENCES `email_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_list_assignments` ADD CONSTRAINT `campaign_list_assignments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_click_events` ADD CONSTRAINT `email_click_events_email_send_id_fkey` FOREIGN KEY (`email_send_id`) REFERENCES `campaign_email_sends`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_click_events` ADD CONSTRAINT `email_click_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_unsubscribes` ADD CONSTRAINT `email_unsubscribes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_events` ADD CONSTRAINT `calendar_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_attendees` ADD CONSTRAINT `calendar_attendees_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendar_attendees` ADD CONSTRAINT `calendar_attendees_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_notes` ADD CONSTRAINT `meeting_notes_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_notes` ADD CONSTRAINT `meeting_notes_recorded_by_fkey` FOREIGN KEY (`recorded_by`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_notes` ADD CONSTRAINT `meeting_notes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_rooms` ADD CONSTRAINT `meeting_rooms_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_bookings` ADD CONSTRAINT `room_bookings_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `meeting_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_bookings` ADD CONSTRAINT `room_bookings_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_bookings` ADD CONSTRAINT `room_bookings_booked_by_fkey` FOREIGN KEY (`booked_by`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_bookings` ADD CONSTRAINT `room_bookings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `call_logs` ADD CONSTRAINT `call_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_reports` ADD CONSTRAINT `custom_reports_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_executions` ADD CONSTRAINT `report_executions_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `custom_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_executions` ADD CONSTRAINT `report_executions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_subscriptions` ADD CONSTRAINT `report_subscriptions_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `custom_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_subscriptions` ADD CONSTRAINT `report_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kpi_definitions` ADD CONSTRAINT `kpi_definitions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kpi_values` ADD CONSTRAINT `kpi_values_kpi_id_fkey` FOREIGN KEY (`kpi_id`) REFERENCES `kpi_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kpi_values` ADD CONSTRAINT `kpi_values_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytic_dashboards` ADD CONSTRAINT `analytic_dashboards_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytic_widgets` ADD CONSTRAINT `analytic_widgets_dashboard_id_fkey` FOREIGN KEY (`dashboard_id`) REFERENCES `analytic_dashboards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytic_widgets` ADD CONSTRAINT `analytic_widgets_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_kpis` ADD CONSTRAINT `dashboard_kpis_dashboard_id_fkey` FOREIGN KEY (`dashboard_id`) REFERENCES `analytic_dashboards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_kpis` ADD CONSTRAINT `dashboard_kpis_kpi_id_fkey` FOREIGN KEY (`kpi_id`) REFERENCES `kpi_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_kpis` ADD CONSTRAINT `dashboard_kpis_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_shares` ADD CONSTRAINT `dashboard_shares_dashboard_id_fkey` FOREIGN KEY (`dashboard_id`) REFERENCES `analytic_dashboards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_shares` ADD CONSTRAINT `dashboard_shares_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_exports` ADD CONSTRAINT `data_exports_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_related_opportunity_id_fkey` FOREIGN KEY (`related_opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_related_account_id_fkey` FOREIGN KEY (`related_account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_related_contact_id_fkey` FOREIGN KEY (`related_contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `contract_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_templates` ADD CONSTRAINT `contract_templates_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_approvals` ADD CONSTRAINT `contract_approvals_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_approvals` ADD CONSTRAINT `contract_approvals_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_signatures` ADD CONSTRAINT `contract_signatures_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_signatures` ADD CONSTRAINT `contract_signatures_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_milestones` ADD CONSTRAINT `contract_milestones_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_milestones` ADD CONSTRAINT `contract_milestones_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_amendments` ADD CONSTRAINT `contract_amendments_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_amendments` ADD CONSTRAINT `contract_amendments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_renewals` ADD CONSTRAINT `contract_renewals_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_renewals` ADD CONSTRAINT `contract_renewals_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deal_stages` ADD CONSTRAINT `deal_stages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deal_stage_history` ADD CONSTRAINT `deal_stage_history_to_stage_id_fkey` FOREIGN KEY (`to_stage_id`) REFERENCES `deal_stages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deal_stage_history` ADD CONSTRAINT `deal_stage_history_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deal_competitors` ADD CONSTRAINT `deal_competitors_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territories` ADD CONSTRAINT `territories_parent_territory_id_fkey` FOREIGN KEY (`parent_territory_id`) REFERENCES `territories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territories` ADD CONSTRAINT `territories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_assignments` ADD CONSTRAINT `territory_assignments_territory_id_fkey` FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_assignments` ADD CONSTRAINT `territory_assignments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_members` ADD CONSTRAINT `territory_members_territory_id_fkey` FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_members` ADD CONSTRAINT `territory_members_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_members` ADD CONSTRAINT `territory_members_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_rules` ADD CONSTRAINT `territory_rules_territory_id_fkey` FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_rules` ADD CONSTRAINT `territory_rules_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_performances` ADD CONSTRAINT `territory_performances_territory_id_fkey` FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `territory_performances` ADD CONSTRAINT `territory_performances_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_teams` ADD CONSTRAINT `sales_teams_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_teams` ADD CONSTRAINT `sales_teams_parent_team_id_fkey` FOREIGN KEY (`parent_team_id`) REFERENCES `sales_teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_teams` ADD CONSTRAINT `sales_teams_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_team_members` ADD CONSTRAINT `sales_team_members_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `sales_teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_team_members` ADD CONSTRAINT `sales_team_members_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_team_members` ADD CONSTRAINT `sales_team_members_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_meetings` ADD CONSTRAINT `team_meetings_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `sales_teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_meetings` ADD CONSTRAINT `team_meetings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_performances` ADD CONSTRAINT `team_performances_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `sales_teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_performances` ADD CONSTRAINT `team_performances_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_portal_users` ADD CONSTRAINT `customer_portal_users_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_portal_users` ADD CONSTRAINT `customer_portal_users_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_portal_users` ADD CONSTRAINT `customer_portal_users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_sessions` ADD CONSTRAINT `portal_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_sessions` ADD CONSTRAINT `portal_sessions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_cases` ADD CONSTRAINT `customer_cases_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_cases` ADD CONSTRAINT `customer_cases_related_crm_case_id_fkey` FOREIGN KEY (`related_crm_case_id`) REFERENCES `crm_cases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_cases` ADD CONSTRAINT `customer_cases_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_messages` ADD CONSTRAINT `case_messages_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `customer_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_messages` ADD CONSTRAINT `case_messages_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_escalations` ADD CONSTRAINT `case_escalations_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `customer_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_escalations` ADD CONSTRAINT `case_escalations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `knowledge_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_articles` ADD CONSTRAINT `knowledge_articles_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_categories` ADD CONSTRAINT `knowledge_categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `knowledge_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_categories` ADD CONSTRAINT `knowledge_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_feedback` ADD CONSTRAINT `article_feedback_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `knowledge_articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_feedback` ADD CONSTRAINT `article_feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_feedback` ADD CONSTRAINT `article_feedback_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_attachments` ADD CONSTRAINT `article_attachments_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `knowledge_articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_attachments` ADD CONSTRAINT `article_attachments_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_feedback` ADD CONSTRAINT `customer_feedback_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_feedback` ADD CONSTRAINT `customer_feedback_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_downloads` ADD CONSTRAINT `portal_downloads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `customer_portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_downloads` ADD CONSTRAINT `portal_downloads_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_accounts` ADD CONSTRAINT `social_media_accounts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_posts` ADD CONSTRAINT `social_media_posts_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `social_media_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_posts` ADD CONSTRAINT `social_media_posts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_mentions` ADD CONSTRAINT `social_media_mentions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `social_media_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_mentions` ADD CONSTRAINT `social_media_mentions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_engagements` ADD CONSTRAINT `social_media_engagements_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `social_media_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_engagements` ADD CONSTRAINT `social_media_engagements_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `social_media_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_engagements` ADD CONSTRAINT `social_media_engagements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_campaigns` ADD CONSTRAINT `social_media_campaigns_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_leads` ADD CONSTRAINT `social_media_leads_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `social_media_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_leads` ADD CONSTRAINT `social_media_leads_crm_lead_id_fkey` FOREIGN KEY (`crm_lead_id`) REFERENCES `crm_leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_media_leads` ADD CONSTRAINT `social_media_leads_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_listening_keywords` ADD CONSTRAINT `social_listening_keywords_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competitor_social_activities` ADD CONSTRAINT `competitor_social_activities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partners` ADD CONSTRAINT `partners_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_contacts` ADD CONSTRAINT `partner_contacts_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_contacts` ADD CONSTRAINT `partner_contacts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_opportunities` ADD CONSTRAINT `partner_opportunities_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_opportunities` ADD CONSTRAINT `partner_opportunities_opportunity_id_fkey` FOREIGN KEY (`opportunity_id`) REFERENCES `crm_opportunities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_opportunities` ADD CONSTRAINT `partner_opportunities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_performances` ADD CONSTRAINT `partner_performances_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_performances` ADD CONSTRAINT `partner_performances_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_certifications` ADD CONSTRAINT `partner_certifications_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_certifications` ADD CONSTRAINT `partner_certifications_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `partner_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_certifications` ADD CONSTRAINT `partner_certifications_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_marketing_activities` ADD CONSTRAINT `partner_marketing_activities_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_marketing_activities` ADD CONSTRAINT `partner_marketing_activities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_portal_users` ADD CONSTRAINT `partner_portal_users_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_portal_users` ADD CONSTRAINT `partner_portal_users_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `partner_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_portal_users` ADD CONSTRAINT `partner_portal_users_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_lead_shares` ADD CONSTRAINT `partner_lead_shares_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_lead_shares` ADD CONSTRAINT `partner_lead_shares_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_conflicts` ADD CONSTRAINT `channel_conflicts_primary_partner_id_fkey` FOREIGN KEY (`primary_partner_id`) REFERENCES `partners`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_conflicts` ADD CONSTRAINT `channel_conflicts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_configs` ADD CONSTRAINT `tenant_configs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_usage` ADD CONSTRAINT `tenant_usage_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_feature_overrides` ADD CONSTRAINT `tenant_feature_overrides_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_feature_overrides` ADD CONSTRAINT `tenant_feature_overrides_flag_id_fkey` FOREIGN KEY (`flag_id`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_notification_logs` ADD CONSTRAINT `push_notification_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_carriers` ADD CONSTRAINT `insurance_carriers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carrier_products` ADD CONSTRAINT `carrier_products_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carrier_products` ADD CONSTRAINT `carrier_products_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_carrier_product_id_fkey` FOREIGN KEY (`carrier_product_id`) REFERENCES `carrier_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policies` ADD CONSTRAINT `insurance_policies_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policy_beneficiaries` ADD CONSTRAINT `insurance_policy_beneficiaries_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policy_beneficiaries` ADD CONSTRAINT `insurance_policy_beneficiaries_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policy_beneficiaries` ADD CONSTRAINT `insurance_policy_beneficiaries_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policy_status_history` ADD CONSTRAINT `insurance_policy_status_history_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_policy_status_history` ADD CONSTRAINT `insurance_policy_status_history_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_carrier_product_id_fkey` FOREIGN KEY (`carrier_product_id`) REFERENCES `carrier_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_applications` ADD CONSTRAINT `insurance_applications_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `underwriting_cases` ADD CONSTRAINT `underwriting_cases_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `underwriting_cases` ADD CONSTRAINT `underwriting_cases_assigned_underwriter_fkey` FOREIGN KEY (`assigned_underwriter`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `underwriting_cases` ADD CONSTRAINT `underwriting_cases_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `underwriting_requirements` ADD CONSTRAINT `underwriting_requirements_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `underwriting_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `underwriting_requirements` ADD CONSTRAINT `underwriting_requirements_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_claims` ADD CONSTRAINT `insurance_claims_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_claims` ADD CONSTRAINT `insurance_claims_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_claims` ADD CONSTRAINT `insurance_claims_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_claims` ADD CONSTRAINT `insurance_claims_adjuster_id_fkey` FOREIGN KEY (`adjuster_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `insurance_claims` ADD CONSTRAINT `insurance_claims_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_events` ADD CONSTRAINT `claim_events_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `insurance_claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_events` ADD CONSTRAINT `claim_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_split_agent_id_fkey` FOREIGN KEY (`split_agent_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `insurance_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_carrier_id_fkey` FOREIGN KEY (`carrier_id`) REFERENCES `insurance_carriers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_entries` ADD CONSTRAINT `commission_entries_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SocialMediaAccountToSocialMediaCampaign` ADD CONSTRAINT `_SocialMediaAccountToSocialMediaCampaign_A_fkey` FOREIGN KEY (`A`) REFERENCES `social_media_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SocialMediaAccountToSocialMediaCampaign` ADD CONSTRAINT `_SocialMediaAccountToSocialMediaCampaign_B_fkey` FOREIGN KEY (`B`) REFERENCES `social_media_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
