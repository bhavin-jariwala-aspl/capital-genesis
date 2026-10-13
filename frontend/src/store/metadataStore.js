import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildValidationRules } from '../utils/helpers';

const STORE_KEY = 'genesis-metadata';
const STALE_MS = 30 * 60 * 1000; // 30 minutes

/** Convert raw field_layouts → FormRenderer shape */
function normaliseFormMeta(rawForm) {
  if (!rawForm) return null;
  const unitWidth = 12 / (rawForm.columns || 2);
  const fields = (rawForm.field_layouts || [])
    .sort((a, b) => a.order_index - b.order_index)
    .filter(fl => fl.is_visible !== false)
    .map(fl => {
      // A layout may override how the field appears on THIS form only
      // (label, placeholder, help text, read-only) without touching the field.
      const o = fl.config && typeof fl.config === 'object' ? fl.config : {};
      return {
        ...fl.field,
        ...(o.label ? { label: o.label } : {}),
        ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
        ...(o.help_text !== undefined ? { help_text: o.help_text } : {}),
        config:     { ...(fl.field.config || {}), ...(o.read_only ? { always_disabled: true } : {}), ...(o.appearance || {}) },
        field_name: fl.field.name,
        col_span:   Math.round(fl.col_span * unitWidth),
        position:   fl.order_index,
        row:        fl.row,
        col:        fl.col,
      };
    });
  return { ...rawForm, fields, dependencies: rawForm.dependencies || [] };
}

/** Pre-compile validation rules for a form's fields */
function compileFormValidations(formMeta) {
  if (!formMeta?.fields) return {};
  const rules = {};
  for (const field of formMeta.fields) {
    rules[field.field_name ?? field.name] = buildValidationRules(field);
  }
  return rules;
}

/**
 * MetadataStore — persisted Zustand store for all UI metadata.
 * Eliminates cascading API calls by caching modules, objects, forms,
 * wizards, resolved names, and pre-compiled validation rules locally.
 */
export const useMetadataStore = create(
  persist(
    (set, get) => ({
      // ── Cached data ─────────────────────────────────────
      modules:        [],          // All modules with nested objects
      objects:        {},          // Keyed by object_id
      forms:          {},          // Keyed by form_id → normalised form meta
      rawForms:       {},          // Keyed by form_id → raw server response (for re-normalisation)
      wizards:        {},          // Keyed by wizard_id
      pipelines:      {},          // Keyed by pipeline_id
      resolvedNames:  {},          // Keyed by object name → { object_id, module_id, first_stage_id, wizard_id }
      validationCache:{},          // Keyed by form_id → { fieldName: rules }

      // ── Sync tracking ───────────────────────────────────
      lastSyncedAt:   null,        // Timestamp of last full bootstrap
      syncing:        false,       // True while bootstrap is in progress
      syncError:      null,        // Last sync error message

      // ── Queries ─────────────────────────────────────────

      /** Get all modules (instant, from cache) */
      getModules: () => get().modules,

      /** Get a single module by ID */
      getModule: (moduleId) =>
        get().modules.find(m => m.id === Number(moduleId)) ?? null,

      /** Get an object by ID (with fields, pipelines) */
      getObject: (objectId) => get().objects[objectId] ?? null,

      /** Get the first object of a module */
      getFirstObject: (moduleId) => {
        const mod = get().getModule(moduleId);
        return mod?.objects?.[0] ?? null;
      },

      /** Find an object by name across all modules */
      getObjectByName: (name) => {
        const resolved = get().resolvedNames[name];
        if (resolved?.object_id) return get().objects[resolved.object_id] ?? null;
        // Fallback: scan all modules
        for (const mod of get().modules) {
          const obj = mod.objects?.find(o => o.name === name);
          if (obj) return get().objects[obj.id] ?? obj;
        }
        return null;
      },

      /** Get resolved name data (replaces runtimeService.resolveObject) */
      getResolved: (objectName) => get().resolvedNames[objectName] ?? null,

      /** Get normalised form meta by ID (instant) */
      getForm: (formId) => get().forms[formId] ?? null,

      /** Get raw form data by ID */
      getRawForm: (formId) => get().rawForms[formId] ?? null,

      /** Find the create/edit form for an object */
      getFormForObject: (objectId, formType = 'create') => {
        const obj = get().objects[objectId];
        if (!obj?.forms) return null;
        const form = obj.forms.find(f => f.form_type === formType) ?? obj.forms[0];
        return form ? get().forms[form.id] ?? null : null;
      },

      /** Get pre-compiled validation rules for a form */
      getCompiledValidation: (formId) => get().validationCache[formId] ?? null,

      /** Get wizard by ID */
      getWizard: (wizardId) => get().wizards[wizardId] ?? null,

      /** Get pipeline by ID */
      getPipeline: (pipelineId) => get().pipelines[pipelineId] ?? null,

      /** Check if metadata needs refresh */
      isStale: () => {
        const { lastSyncedAt } = get();
        if (!lastSyncedAt) return true;
        return Date.now() - lastSyncedAt > STALE_MS;
      },

      // ── Mutations (called by bootstrap/sync) ────────────

      /** Store full bootstrap payload */
      setBootstrapData: (data) => {
        const {
          modules = [],
          objects = {},
          forms = {},
          wizards = {},
          pipelines = {},
          resolvedNames = {},
          // What the workspace's plan allows. Read by useEntitlements; absent
          // (older server) means "do not gate on the client".
          entitlements = null,
        } = data;

        // Normalise all forms and pre-compile validations
        const normalisedForms = {};
        const rawForms = {};
        const validationCache = {};

        for (const [formId, rawForm] of Object.entries(forms)) {
          rawForms[formId] = rawForm;
          const normalised = normaliseFormMeta(rawForm);
          if (normalised) {
            normalisedForms[formId] = normalised;
            validationCache[formId] = compileFormValidations(normalised);
          }
        }

        set({
          modules,
          objects,
          forms: normalisedForms,
          rawForms,
          wizards,
          pipelines,
          resolvedNames,
          validationCache,
          entitlements,
          lastSyncedAt: Date.now(),
          syncing: false,
          syncError: null,
        });
      },

      /** Store a single resolved object name */
      setResolved: (name, data) => {
        set((s) => ({
          resolvedNames: { ...s.resolvedNames, [name]: data },
        }));
      },

      /** Store a single form (e.g. after fetching one that wasn't in bootstrap) */
      setForm: (formId, rawForm) => {
        const normalised = normaliseFormMeta(rawForm);
        if (!normalised) return;
        set((s) => ({
          forms:          { ...s.forms, [formId]: normalised },
          rawForms:       { ...s.rawForms, [formId]: rawForm },
          validationCache:{ ...s.validationCache, [formId]: compileFormValidations(normalised) },
        }));
      },

      /** Store a single object */
      setObject: (objectId, objectData) => {
        set((s) => ({
          objects: { ...s.objects, [objectId]: objectData },
        }));
      },

      /** Store a single wizard */
      setWizard: (wizardId, wizardData) => {
        set((s) => ({
          wizards: { ...s.wizards, [wizardId]: wizardData },
        }));
      },

      /** Mark sync as in progress */
      setSyncing: (syncing) => set({ syncing }),

      /** Set sync error */
      setSyncError: (error) => set({ syncError: error, syncing: false }),

      /** Clear all cached metadata (e.g. on logout) */
      clearMetadata: () => set({
        modules:        [],
        objects:        {},
        forms:          {},
        rawForms:       {},
        wizards:        {},
        pipelines:      {},
        resolvedNames:  {},
        validationCache:{},
        lastSyncedAt:   null,
        syncing:        false,
        syncError:      null,
      }),
    }),
    {
      name: STORE_KEY,
      partialize: (state) => ({
        // Only persist the data, not transient state
        modules:        state.modules,
        objects:        state.objects,
        forms:          state.forms,
        rawForms:       state.rawForms,
        wizards:        state.wizards,
        pipelines:      state.pipelines,
        resolvedNames:  state.resolvedNames,
        validationCache:state.validationCache,
        lastSyncedAt:   state.lastSyncedAt,
      }),
    }
  )
);
