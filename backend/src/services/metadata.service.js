'use strict';

const { NotFoundError, ValidationError } = require('../utils/errors');
const PermissionService = require('./permission.service');
const { ADMIN_THRESHOLD } = require('../middleware/authenticate');
const { roleLevelFor } = require('./role-level');
const { check: checkFormula } = require('./formula');

// Columns an admin may write on modules / objects. Anything else in the body —
// tenant_id above all, but also id and timestamps — is dropped, so a crafted
// request cannot move a module or object into another tenant.
const MODULE_WRITABLE = ['name', 'label', 'description', 'icon', 'color', 'category', 'order_index', 'is_active'];
const OBJECT_WRITABLE = ['module_id', 'name', 'label', 'plural_label', 'description', 'icon', 'order_index', 'is_active', 'config'];
// `config` / `public_key` are deliberately absent: publishing a form (and the
// key it is published under) goes through PublicFormService only, so the key
// is always random and the action is on the audit chain.
const FORM_WRITABLE = ['object_id', 'name', 'label', 'description', 'form_type', 'columns', 'is_active'];

function _pick(data, keys) {
  const out = {};
  for (const k of keys) if (data?.[k] !== undefined) out[k] = data[k];
  if (out.is_active !== undefined) out.is_active = out.is_active === 'true' || out.is_active === true;
  if (out.order_index !== undefined) out.order_index = Number(out.order_index) || 0;
  if (out.module_id !== undefined) out.module_id = Number(out.module_id);
  if (out.object_id !== undefined) out.object_id = Number(out.object_id);
  if (out.columns !== undefined) out.columns = Number(out.columns) || 2;
  return out;
}

/**
 * Builder-time checks for the field types whose config the engine depends on:
 * a formula that does not parse would silently compute nothing, and a lookup
 * without a target object would store ids that resolve to nothing.
 */
function _assertFieldConfig(fieldType, config) {
  if (fieldType === 'formula') {
    if (!config?.expression) throw new ValidationError('A formula field needs an expression (config.expression)');
    const err = checkFormula(config.expression);
    if (err) throw new ValidationError(`Formula error: ${err}`);
  }
  if (fieldType === 'lookup' && !config?.target_object) {
    throw new ValidationError('A lookup field must name the object it points at (config.target_object)');
  }
}

/**
 * A field's `name` is interpolated into JSON_EXTRACT paths and used as a record
 * data key. Restrict it to a safe identifier grammar so a crafted name can never
 * break out into SQL. Enforced on create so every stored name is safe.
 */
const SAFE_FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function _assertSafeFieldName(name) {
  if (typeof name !== 'string' || !SAFE_FIELD_NAME.test(name) || name.length > 64) {
    throw new ValidationError(
      `Invalid field name "${name}". Names must start with a letter or underscore and contain only letters, numbers, and underscores (max 64 chars).`,
    );
  }
}

/**
 * MetadataService — the core metadata engine.
 * All reads go through CacheService first (Redis), falling back to Prisma.
 * All writes invalidate the relevant cache keys.
 */
class MetadataService {
  constructor(prisma, cache) {
    this.db    = prisma;
    this.cache = cache;
    this.perm  = new PermissionService(prisma);
  }

  // ════════════════════════════════════════════════
  // MODULES
  // ════════════════════════════════════════════════

  async getModules() {
    return this.cache.remember(
      this.cache.key('modules', 'all'),
      () => this.db.uiModule.findMany({
        where:   { is_active: true },
        orderBy: { order_index: 'asc' },
        include: { objects: { where: { is_active: true }, orderBy: { order_index: 'asc' } } },
      }),
    );
  }

  async getModule(id) {
    return this.cache.remember(
      this.cache.key('module', id),
      async () => {
        const mod = await this.db.uiModule.findUnique({
          where:   { id },
          include: { objects: { where: { is_active: true }, orderBy: { order_index: 'asc' } } },
        });
        if (!mod) throw new NotFoundError('Module');
        return mod;
      },
    );
  }

  async createModule(data) {
    const fields = _pick(data, MODULE_WRITABLE);
    // Ensure required `label` is present; fall back to `name` if UI only sends one
    const mod = await this.db.uiModule.create({ data: { label: fields.name, ...fields } });
    await this.cache.del(this.cache.key('modules', 'all'));
    return mod;
  }

  async updateModule(id, data) {
    const mod = await this.db.uiModule.update({ where: { id }, data: _pick(data, MODULE_WRITABLE) });
    await this.cache.invalidateModule(id);
    return mod;
  }

  async deleteModule(id) {
    const existing = await this.db.uiModule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Module');
    // Cascade through objects before deleting the module
    const objects = await this.db.uiObject.findMany({ where: { module_id: id }, select: { id: true } });
    for (const obj of objects) {
      await this.deleteObject(obj.id);
    }
    await this.db.uiModule.delete({ where: { id } });
    await this.cache.invalidateModule(id);
  }

  // ════════════════════════════════════════════════
  // OBJECTS
  // ════════════════════════════════════════════════

  async getObjects(moduleId) {
    return this.cache.remember(
      this.cache.key('objects', 'module', moduleId),
      () => this.db.uiObject.findMany({
        where:   { module_id: moduleId, is_active: true },
        orderBy: { order_index: 'asc' },
      }),
    );
  }

  async getObject(id) {
    return this.cache.remember(
      this.cache.key('object', id),
      async () => {
        const obj = await this.db.uiObject.findUnique({
          where: { id },
          include: {
            module: true,
            fields: { where: { is_active: true }, orderBy: { order_index: 'asc' } },
          },
        });
        if (!obj) throw new NotFoundError('Object');
        return obj;
      },
    );
  }

  async createObject(data) {
    // Ensure required `label` is present; fall back to `name` if UI only sends one
    const fields = _pick(data, OBJECT_WRITABLE);
    const obj = await this.db.uiObject.create({ data: { label: fields.name, ...fields } });
    await this.cache.del(this.cache.key('objects', 'module', fields.module_id));
    return obj;
  }

  async updateObject(id, data) {
    const existing = await this.db.uiObject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Object');
    const obj = await this.db.uiObject.update({ where: { id }, data: _pick(data, OBJECT_WRITABLE) });
    await this.cache.invalidateObject(id, existing.module_id);
    return obj;
  }

  async deleteObject(id) {
    const existing = await this.db.uiObject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Object');

    // Collect child IDs (done outside the transaction to keep the tx short)
    const forms  = await this.db.uiForm.findMany({ where: { object_id: id }, select: { id: true } });
    const fields = await this.db.uiField.findMany({ where: { object_id: id }, select: { id: true } });
    const formIds  = forms.map((f) => f.id);
    const fieldIds = fields.map((f) => f.id);

    const pipelines = await this.db.uiPipeline.findMany({ where: { object_id: id }, select: { id: true } });
    const workflows = await this.db.uiWorkflow.findMany({ where: { object_id: id }, select: { id: true } });
    const wizards   = await this.db.uiWizard.findMany({ where: { object_id: id }, select: { id: true } });

    // RC-15 fix: Wrap the entire cascade in a single transaction so that a
    // concurrent create of a field/form between delete steps cannot leave
    // orphaned rows, and a mid-cascade server crash cannot leave the object
    // in a partially-deleted state.
    await this.db.$transaction(async (tx) => {
      // 1. WizardSteps that reference forms of this object (no cascade from UiForm side)
      if (formIds.length) {
        await tx.uiWizardStep.deleteMany({ where: { form_id: { in: formIds } } });
      }
      // 2. FormFieldLayouts that reference fields of this object (no cascade from UiField side)
      if (fieldIds.length) {
        await tx.uiFormFieldLayout.deleteMany({ where: { field_id: { in: fieldIds } } });
      }
      // 3. Fields (cascades: validations, deps)
      if (fieldIds.length) {
        await tx.uiField.deleteMany({ where: { object_id: id } });
      }
      // 4. Forms (cascades: remaining form_field_layouts)
      if (formIds.length) {
        await tx.uiForm.deleteMany({ where: { object_id: id } });
      }
      // 5. Pages
      await tx.uiPage.deleteMany({ where: { object_id: id } });
      // 6. Pipelines (cascades: stages)
      if (pipelines.length) {
        await tx.uiPipelineStage.deleteMany({ where: { pipeline_id: { in: pipelines.map((p) => p.id) } } });
        await tx.uiPipeline.deleteMany({ where: { object_id: id } });
      }
      // 7. Workflows (cascades: steps)
      if (workflows.length) {
        await tx.uiWorkflow.deleteMany({ where: { object_id: id } });
      }
      // 8. Wizards (cascades: wizard_steps)
      if (wizards.length) {
        await tx.uiWizard.deleteMany({ where: { object_id: id } });
      }
      // 9. Assignment rules for this object
      await tx.assignmentRule.deleteMany({ where: { object_id: id } });
      // 10. Object itself
      await tx.uiObject.delete({ where: { id } });
    });

    await this.cache.invalidateObject(id, existing.module_id);
  }

  // ════════════════════════════════════════════════
  // FIELDS
  // ════════════════════════════════════════════════

  async getFields(objectId) {
    return this.cache.remember(
      this.cache.key('fields', 'object', objectId),
      () => this.db.uiField.findMany({
        where:   { object_id: objectId, is_active: true },
        orderBy: { order_index: 'asc' },
        include: {
          validations:    { orderBy: { order_index: 'asc' } },
          dependencies_as_source: true,
          dependencies_as_target: true,
        },
      }),
    );
  }

  async getField(id) {
    return this.cache.remember(
      this.cache.key('field', id),
      async () => {
        const field = await this.db.uiField.findUnique({
          where:   { id },
          include: {
            validations:    { orderBy: { order_index: 'asc' } },
            dependencies_as_source: true,
            dependencies_as_target: true,
          },
        });
        if (!field) throw new NotFoundError('Field');
        return field;
      },
    );
  }

  async createField(data) {
    const { validations, col_span, position, is_readonly, show_in_list, ...rawData } = data;
    _assertSafeFieldName(rawData.name);
    _assertFieldConfig(rawData.field_type, rawData.config);
    // Coerce boolean fields that might arrive as strings from HTML selects
    for (const key of ['is_required', 'is_active', 'is_unique', 'is_searchable', 'is_filterable', 'is_sortable', 'is_indexed']) {
      if (rawData[key] !== undefined) rawData[key] = rawData[key] === 'true' || rawData[key] === true;
    }
    // Normalise UI-sent extras that don't map to UiField columns:
    //   position    → order_index (UiField has order_index, not position)
    //   col_span    → belongs to UiFormFieldLayout, not UiField — strip it
    //   is_readonly → stored in config.always_disabled
    const fieldData = { ...rawData };
    if (position !== undefined) fieldData.order_index = Number(position);
    if (is_readonly !== undefined) {
      const existing_config = fieldData.config ?? {};
      fieldData.config = { ...existing_config, always_disabled: Boolean(is_readonly) };
    }
    if (show_in_list !== undefined) {
      fieldData.config = { ...(fieldData.config ?? {}), show_in_list: Boolean(show_in_list) };
    }
    if (!fieldData.data_type) {
      // Derive a sensible data_type default from field_type when not provided
      const numericTypes  = ['number', 'currency', 'percentage', 'rating', 'auto_number'];
      const booleanTypes  = ['checkbox'];
      const arrayTypes    = ['multi_select'];
      const dateTypes     = ['date', 'datetime', 'time'];
      if (numericTypes.includes(fieldData.field_type))      fieldData.data_type = 'number';
      else if (booleanTypes.includes(fieldData.field_type)) fieldData.data_type = 'boolean';
      else if (arrayTypes.includes(fieldData.field_type))   fieldData.data_type = 'array';
      else if (dateTypes.includes(fieldData.field_type))    fieldData.data_type = 'date';
      else                                                   fieldData.data_type = 'string';
    }
    // Create the field first, then attach validations as a SEPARATE top-level
    // createMany. A nested `validations: { createMany }` write is not seen by the
    // tenant-scope Prisma extension (it only injects tenant_id into the top-level
    // create.data), so nested rows would fail the required UiValidation.tenant_id
    // column. Mirrors the createForm → uiFormFieldLayout.createMany pattern.
    const field = await this.db.uiField.create({ data: fieldData });
    if (validations?.length) {
      await this.db.uiValidation.createMany({
        data: validations.map((v) => ({ ...v, field_id: field.id })),
      });
      await this.cache.invalidateField(field.id, field.object_id);
      // Re-fetch to return the field with its persisted validations attached.
      return this.db.uiField.findUnique({
        where: { id: field.id },
        include: { validations: true },
      });
    }
    await this.cache.invalidateField(field.id, field.object_id);
    return { ...field, validations: [] };
  }

  async updateField(id, data) {
    const existing = await this.db.uiField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Field');
    if (data.field_type !== undefined || data.config !== undefined) {
      _assertFieldConfig(data.field_type ?? existing.field_type, data.config ?? existing.config);
    }
    // Coerce boolean fields that might arrive as strings from HTML selects
    for (const key of ['is_required', 'is_active', 'is_unique', 'is_searchable', 'is_filterable', 'is_sortable', 'is_indexed']) {
      if (data[key] !== undefined) data = { ...data, [key]: data[key] === 'true' || data[key] === true };
    }

    // `is_indexed` is stored as a flag only. It used to run ALTER TABLE on the
    // shared `records` table from a Builder request: DDL any tenant admin could
    // trigger, in MariaDB-only syntax MySQL rejects, adding columns nothing read.

    const { validations, col_span, position, is_readonly, show_in_list,
            id: _fid, created_at, updated_at,
            dependencies_as_source, dependencies_as_target,
            ...rawData } = data;
    const fieldData = { ...rawData };
    if (position !== undefined) fieldData.order_index = Number(position);
    // Always merge config so partial updates (e.g. computed-only) don't wipe other config keys
    const base_config  = existing.config ?? {};
    const input_config = fieldData.config ?? {};
    fieldData.config = { ...base_config, ...input_config };
    if (is_readonly !== undefined) {
      fieldData.config.always_disabled = Boolean(is_readonly);
    }
    if (show_in_list !== undefined) {
      fieldData.config.show_in_list = Boolean(show_in_list);
    }
    const field = await this.db.uiField.update({ where: { id }, data: fieldData });

    // Replace the field's validation rules when the caller sent a list. The
    // builder always sends the full list, so "replace" is the right semantic;
    // an omitted key leaves the stored rules untouched. Top-level writes (not a
    // nested relation write) so the tenant-scope extension stamps tenant_id.
    if (Array.isArray(validations)) {
      await this.db.uiValidation.deleteMany({ where: { field_id: id } });
      const rows = validations
        .filter((v) => v && v.validation_type)
        .map((v, i) => ({
          field_id:        id,
          validation_type: String(v.validation_type),
          value:           v.value === undefined || v.value === null || v.value === '' ? null : String(v.value),
          error_message:   String(v.error_message || '').trim() || `${fieldData.label ?? existing.label} is invalid`,
          order_index:     Number.isFinite(Number(v.order_index)) ? Number(v.order_index) : i,
        }));
      if (rows.length) await this.db.uiValidation.createMany({ data: rows });
    }

    await this.cache.invalidateField(id, existing.object_id);
    if (Array.isArray(validations)) {
      return this.db.uiField.findUnique({ where: { id }, include: { validations: { orderBy: { order_index: 'asc' } } } });
    }
    return field;
  }

  async deleteField(id) {
    const existing = await this.db.uiField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Field');
    // FormFieldLayouts referencing this field have no cascade — delete first
    await this.db.uiFormFieldLayout.deleteMany({ where: { field_id: id } });
    await this.db.uiField.delete({ where: { id } });
    await this.cache.invalidateField(id, existing.object_id);
  }

  // ════════════════════════════════════════════════
  // FORMS
  // ════════════════════════════════════════════════

  async getForms(objectId) {
    return this.db.uiForm.findMany({
      where:   objectId ? { object_id: objectId, is_active: true } : { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  /** Returns full form metadata including all field layouts with embedded field definitions */
  async getFormFull(id) {
    return this.cache.remember(
      this.cache.key('form', 'full', id),
      async () => {
        const form = await this.db.uiForm.findUnique({
          where: { id },
          include: {
            object: true,
            field_layouts: {
              where:   { is_visible: true },
              orderBy: [{ row: 'asc' }, { col: 'asc' }, { order_index: 'asc' }],
              include: {
                field: {
                  include: {
                    validations:             { orderBy: { order_index: 'asc' } },
                    dependencies_as_source:  true,
                    dependencies_as_target:  true,
                  },
                },
              },
            },
          },
        });
        if (!form) throw new NotFoundError('Form');
        return form;
      },
    );
  }

  /**
   * Role-filtered form — wraps getFormFull but removes hidden fields and marks
   * read-only fields based on UiPermission rows for the viewer's role.
   *
   * For each field layout:
   *   can_view=false  → field is omitted entirely
   *   can_edit=false  → field.config.always_disabled is set to true (read-only)
   *
   * This method is NOT cached because the response is role-scoped.
   */
  /**
   * The role's field permission rows keyed by field id, read once for many
   * forms (the runtime bootstrap); null for an admin, who bypasses them.
   * Pass the result to getFormForViewer as `fieldPerms`.
   */
  async fieldPermsForRole(roleName) {
    if ((await roleLevelFor(this.db, roleName, null)) <= ADMIN_THRESHOLD) return null;
    const perms = await this.db.uiPermission.findMany({ where: { entity_type: 'field', role_name: roleName } });
    return Object.fromEntries(perms.map(p => [p.entity_id, p]));
  }

  async getFormForViewer(id, roleName, fieldPerms = undefined) {
    const form = await this.getFormFull(id);
    if (!form) return form;

    // Admins always see and can edit everything. Level from the tenant's own
    // roles table, so a custom admin-level role keeps its bypass.
    if (fieldPerms === null) return form;
    if (fieldPerms === undefined && (await roleLevelFor(this.db, roleName, null)) <= ADMIN_THRESHOLD) {
      return form;
    }

    let permMap = fieldPerms;
    if (!permMap) {
      const fieldIds = form.field_layouts.map(fl => fl.field_id);
      const perms = await this.db.uiPermission.findMany({
        where: { entity_type: 'field', entity_id: { in: fieldIds }, role_name: roleName },
      });
      permMap = Object.fromEntries(perms.map(p => [p.entity_id, p]));
    }

    const filteredLayouts = form.field_layouts
      .filter(fl => {
        const p = permMap[fl.field_id];
        return p ? p.can_view : true; // default: visible
      })
      .map(fl => {
        const p = permMap[fl.field_id];
        const canEdit = p ? p.can_edit : true; // default: editable when no explicit permission row exists
        if (canEdit) return fl;
        // Mark field read-only via config flag (same mechanism as always_disabled)
        return {
          ...fl,
          field: {
            ...fl.field,
            config: { ...(fl.field?.config ?? {}), always_disabled: true },
          },
        };
      });

    return { ...form, field_layouts: filteredLayouts };
  }

  async createForm(data) {
    const { field_layouts } = data;
    const form = await this.db.uiForm.create({ data: _pick(data, FORM_WRITABLE) });
    if (field_layouts?.length) {
      await this.db.uiFormFieldLayout.createMany({
        data: field_layouts.map((fl) => ({ ...fl, form_id: form.id })),
        skipDuplicates: true,
      });
    }
    return this.getFormFull(form.id);
  }

  async updateForm(id, data) {
    const form = await this.db.uiForm.update({ where: { id }, data: _pick(data, FORM_WRITABLE) });
    await this.cache.invalidateForm(id);
    return form;
  }

  async deleteForm(id) {
    await this.db.uiForm.delete({ where: { id } });
    await this.cache.invalidateForm(id);
  }

  async upsertFormLayout(formId, fieldLayouts) {
    // Remove any layouts that are no longer present (i.e. field was deleted from the canvas)
    const incomingFieldIds = fieldLayouts.map((l) => l.field_id);
    await this.db.uiFormFieldLayout.deleteMany({
      where: {
        form_id:  formId,
        field_id: { notIn: incomingFieldIds },
      },
    });

    for (const layout of fieldLayouts) {
      await this.db.uiFormFieldLayout.upsert({
        where: { form_id_field_id: { form_id: formId, field_id: layout.field_id } },
        update: layout,
        create: { ...layout, form_id: formId },
      });
    }
    await this.cache.invalidateForm(formId);
  }

  // ════════════════════════════════════════════════
  // VALIDATIONS
  // ════════════════════════════════════════════════

  async getValidations(fieldId) {
    return this.db.uiValidation.findMany({
      where:   { field_id: fieldId },
      orderBy: { order_index: 'asc' },
    });
  }

  async createValidation(data) {
    const v = await this.db.uiValidation.create({ data });
    await this.cache.invalidateField(data.field_id, null);
    return v;
  }

  async updateValidation(id, data) {
    const v = await this.db.uiValidation.update({ where: { id }, data });
    await this.cache.invalidateField(v.field_id, null);
    return v;
  }

  async deleteValidation(id) {
    const v = await this.db.uiValidation.findUnique({ where: { id } });
    if (!v) throw new NotFoundError('Validation');
    await this.db.uiValidation.delete({ where: { id } });
    await this.cache.invalidateField(v.field_id, null);
  }

  // ════════════════════════════════════════════════
  // FIELD DEPENDENCIES
  // ════════════════════════════════════════════════

  async getDependencies(fieldId) {
    return this.db.uiFieldDependency.findMany({
      where: {
        OR: [{ source_field_id: fieldId }, { target_field_id: fieldId }],
      },
      include: {
        source_field: { select: { id: true, name: true, label: true } },
        target_field: { select: { id: true, name: true, label: true } },
      },
    });
  }

  async getDependenciesForForm(formId) {
    // The cached full form already carries each field's dependencies, so the
    // runtime bootstrap (every form of every object, on each page load) needs
    // no extra queries here. Same shape as the query below.
    const form = await this.getFormFull(formId).catch(() => null);
    if (form?.field_layouts) {
      const byId = new Map(form.field_layouts.filter((fl) => fl.field).map((fl) => [fl.field.id, fl.field]));
      const brief = (f) => ({ id: f.id, name: f.name, label: f.label });
      const out = [];
      for (const target of byId.values()) {
        for (const dep of target.dependencies_as_target ?? []) {
          const source = byId.get(dep.source_field_id);
          if (source) out.push({ ...dep, source_field: brief(source), target_field: brief(target) });
        }
      }
      return out;
    }
    // Get all fields in this form, then get all dependencies involving those fields
    const layouts = await this.db.uiFormFieldLayout.findMany({
      where:  { form_id: formId },
      select: { field_id: true },
    });
    const fieldIds = layouts.map((l) => l.field_id);
    if (!fieldIds.length) return [];

    return this.db.uiFieldDependency.findMany({
      where: {
        source_field_id: { in: fieldIds },
        target_field_id: { in: fieldIds },
      },
      include: {
        source_field: { select: { id: true, name: true, label: true } },
        target_field: { select: { id: true, name: true, label: true } },
      },
    });
  }

  async createDependency(data) {
    const dep = await this.db.uiFieldDependency.create({
      data,
      include: {
        source_field: { select: { id: true, name: true, label: true } },
        target_field: { select: { id: true, name: true, label: true } },
      },
    });
    await this.cache.delPattern('form:*');
    return dep;
  }

  async updateDependency(id, data) {
    const dep = await this.db.uiFieldDependency.update({ where: { id }, data });
    await this.cache.delPattern('form:*');
    return dep;
  }

  async deleteDependency(id) {
    await this.db.uiFieldDependency.delete({ where: { id } });
    await this.cache.delPattern('form:*');
  }

}

module.exports = MetadataService;
