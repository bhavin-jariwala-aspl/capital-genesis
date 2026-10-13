import { create } from 'zustand';

// Minimal uid helper — no external dependency needed
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const useBuilderStore = create((set, get) => ({
  // ── Form Builder ─────────────────────────────
  currentForm:   null,
  formFields:    [],          // UiFormFieldLayout[] enriched with field definition
  selectedFieldId: null,

  setCurrentForm:    (form)   => set({ currentForm: form, formFields: form?.field_layouts || [], selectedFieldId: null }),
  setFormFields:     (fields) => set({ formFields: fields }),
  setSelectedField:  (id)     => set({ selectedFieldId: id == null ? null : String(id) }),

  getSelectedField: () => {
    const id = get().selectedFieldId;
    if (!id) return null;
    return get().formFields.find((f) => String(f._tempId || f.field_id || f.id) === String(id)) || null;
  },

  addFieldToCanvas: (fieldType) => {
    const tempField = {
      _isNew:      true,
      _tempId:     uid(),
      field_id:    null,
      field: {
        id:           null,
        name:         `field_${uid()}`,
        label:        fieldType.label || fieldType.field_type,
        field_type:   fieldType.field_type,
        data_type:    fieldType.data_type || 'string',
        is_required:  false,
        placeholder:  '',
        help_text:    '',
        options:      null,
        config:       {},
        validations:  [],
        dependencies_as_source: [],
        dependencies_as_target: [],
      },
      row:         get().formFields.length,
      col:         0,
      col_span:    1,
      order_index: get().formFields.length,
      is_visible:  true,
    };
    set((s) => ({ formFields: [...s.formFields, tempField], selectedFieldId: tempField._tempId }));
    return tempField;
  },

  removeFieldFromCanvas: (tempIdOrFieldId) => {
    set((s) => ({
      formFields: s.formFields.filter(
        (f) => f._tempId !== tempIdOrFieldId && f.field_id !== tempIdOrFieldId,
      ),
      selectedFieldId: s.selectedFieldId === tempIdOrFieldId ? null : s.selectedFieldId,
    }));
  },

  updateFieldConfig: (tempIdOrFieldId, updates) => {
    set((s) => ({
      formFields: s.formFields.map((f) => {
        const matches = f._tempId === tempIdOrFieldId || f.field_id === tempIdOrFieldId;
        if (!matches) return f;
        return { ...f, field: { ...f.field, ...updates } };
      }),
    }));
  },

  reorderFields: (newOrder) => set({ formFields: newOrder }),

  // ── Dashboard Builder ────────────────────────
  currentDashboard: null,
  dashboardWidgets: [],
  selectedWidgetId:  null,

  setCurrentDashboard:  (dash)    => set({ currentDashboard: dash, dashboardWidgets: dash?.widgets || [] }),
  setDashboardWidgets:  (widgets) => set({ dashboardWidgets: widgets }),
  setSelectedWidget:    (id)      => set({ selectedWidgetId: id }),

  addWidget: (widgetData) => {
    const widget = {
      _isNew:   true,
      _tempId:  uid(),
      x: 0, y: Infinity, w: 6, h: 4,
      ...widgetData,
    };
    set((s) => ({
      dashboardWidgets: [...s.dashboardWidgets, widget],
      selectedWidgetId: widget._tempId,
    }));
    return widget;
  },

  updateWidget: (tempIdOrId, updates) => {
    set((s) => ({
      dashboardWidgets: s.dashboardWidgets.map((w) => {
        const matches = w._tempId === tempIdOrId || w.id === tempIdOrId;
        return matches ? { ...w, ...updates } : w;
      }),
    }));
  },

  removeWidget: (tempIdOrId) => {
    set((s) => ({
      dashboardWidgets: s.dashboardWidgets.filter(
        (w) => w._tempId !== tempIdOrId && w.id !== tempIdOrId,
      ),
      selectedWidgetId: null,
    }));
  },

  updateWidgetPositions: (layout) => {
    set((s) => ({
      dashboardWidgets: s.dashboardWidgets.map((w) => {
        const item = layout.find((l) => l.i === String(w._tempId || w.id));
        if (!item) return w;
        return { ...w, x: item.x, y: item.y, w: item.w, h: item.h };
      }),
    }));
  },
}));
