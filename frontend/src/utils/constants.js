/** All supported field types with their metadata */
export const FIELD_TYPES = [
  // Basic Text
  { field_type: 'heading',      data_type: 'none',    label: 'Label',          icon: 'Heading',    group: 'Basic' },
  { field_type: 'divider',      data_type: 'none',    label: 'Divider',        icon: 'Minus',      group: 'Basic' },
  { field_type: 'text',         data_type: 'string',  label: 'Text',           icon: 'Type',       group: 'Basic' },
  { field_type: 'textarea',     data_type: 'string',  label: 'Text Area',      icon: 'AlignLeft',  group: 'Basic' },
  { field_type: 'rich_text',    data_type: 'string',  label: 'Rich Text',      icon: 'FileText',   group: 'Basic' },
  { field_type: 'number',       data_type: 'number',  label: 'Number',         icon: 'Hash',       group: 'Basic' },
  { field_type: 'email',        data_type: 'string',  label: 'Email',          icon: 'Mail',       group: 'Basic' },
  { field_type: 'phone',        data_type: 'string',  label: 'Phone',          icon: 'Phone',      group: 'Basic' },
  { field_type: 'url',          data_type: 'string',  label: 'URL',            icon: 'Link',       group: 'Basic' },

  // Selection
  { field_type: 'select',       data_type: 'string',  label: 'Dropdown',       icon: 'ChevronDown',group: 'Select' },
  { field_type: 'multi_select', data_type: 'array',   label: 'Multi-Select',   icon: 'List',       group: 'Select' },
  { field_type: 'radio',        data_type: 'string',  label: 'Radio Group',    icon: 'Circle',     group: 'Select' },
  { field_type: 'checkbox',     data_type: 'boolean', label: 'Checkbox',       icon: 'CheckSquare',group: 'Select' },

  // Date & Time
  { field_type: 'date',         data_type: 'date',    label: 'Date',           icon: 'Calendar',   group: 'Date & Time' },
  { field_type: 'datetime',     data_type: 'date',    label: 'Date & Time',    icon: 'Clock',      group: 'Date & Time' },
  { field_type: 'time',         data_type: 'string',  label: 'Time',           icon: 'Timer',      group: 'Date & Time' },

  // Numeric Special
  { field_type: 'currency',     data_type: 'number',  label: 'Currency',       icon: 'DollarSign', group: 'Numeric' },
  { field_type: 'percentage',   data_type: 'number',  label: 'Percentage',     icon: 'Percent',    group: 'Numeric' },
  { field_type: 'rating',       data_type: 'number',  label: 'Rating',         icon: 'Star',       group: 'Numeric' },

  // Special
  { field_type: 'color',        data_type: 'string',  label: 'Color Picker',   icon: 'Palette',    group: 'Special' },
  { field_type: 'file',         data_type: 'string',  label: 'File Upload',    icon: 'Upload',     group: 'Special' },
  { field_type: 'image',        data_type: 'string',  label: 'Image',          icon: 'Image',      group: 'Special' },
  { field_type: 'code',         data_type: 'string',  label: 'Code Editor',    icon: 'Code',       group: 'Special' },
  { field_type: 'lookup',       data_type: 'object',  label: 'Lookup',         icon: 'Search',     group: 'Special' },
  { field_type: 'formula',      data_type: 'string',  label: 'Formula',        icon: 'Function',   group: 'Special' },
  { field_type: 'auto_number',  data_type: 'string',  label: 'Auto Number',    icon: 'Zap',        group: 'Special' },
  { field_type: 'status_tracker', data_type: 'none',  label: 'Status Tracker', icon: 'Truck',      group: 'Special' },
];

export const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((f) => [f.field_type, f]));

export const FIELD_TYPE_GROUPS = FIELD_TYPES.reduce((acc, f) => {
  if (!acc[f.group]) acc[f.group] = [];
  acc[f.group].push(f);
  return acc;
}, {});

/** Standard color palettes for charts, stages, and UI elements */
export const COLORS = {
  // Primary color palette for charts and data visualization
  CHART: [
    '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
    '#10b981', '#3b82f6', '#f97316', '#84cc16', '#06b6d4',
  ],
  // Color palette for pipeline stages
  STAGE: [
    '#6366f1', '#3b82f6', '#14b8a6', '#8b5cf6',
    '#f59e0b', '#10b981', '#ef4444', '#ec4899',
    '#64748b', '#f97316',
  ],
  // Status colors
  STATUS: {
    success: '#10b981',
    error: '#ef4444', 
    warning: '#f59e0b',
    info: '#3b82f6',
    neutral: '#64748b',
  },
};

/** Validation types and their config */
export const VALIDATION_TYPES = [
  // group: Presence
  { type: 'required',   label: 'Required',              hasValue: false, group: 'Presence', hint: 'The field must have a value.' },
  { type: 'requires_field', label: 'Requires another field', hasValue: 'field', group: 'Presence', valueLabel: 'Other field', hint: 'When this field is filled, the other field must be too.' },
  // group: Text
  { type: 'minLength',  label: 'Min Length',            hasValue: true,  group: 'Text', valueLabel: 'Min characters', inputType: 'number' },
  { type: 'maxLength',  label: 'Max Length',            hasValue: true,  group: 'Text', valueLabel: 'Max characters', inputType: 'number' },
  { type: 'pattern',    label: 'Regex Pattern',         hasValue: true,  group: 'Text', valueLabel: 'Pattern (regex, e.g. ^[A-Z]{3}-\\d{4}$)' },
  { type: 'email',      label: 'Email format',          hasValue: false, group: 'Text' },
  { type: 'url',        label: 'URL format',            hasValue: false, group: 'Text', hint: 'Must start with http:// or https://' },
  { type: 'phone',      label: 'Phone format',          hasValue: false, group: 'Text' },
  { type: 'in',         label: 'One of (allow list)',   hasValue: true,  group: 'Text', valueLabel: 'Comma-separated values' },
  { type: 'not_in',     label: 'Not one of (block list)', hasValue: true, group: 'Text', valueLabel: 'Comma-separated values' },
  // group: Number
  { type: 'min',        label: 'Min Value',             hasValue: true,  group: 'Number', valueLabel: 'Min value', inputType: 'number' },
  { type: 'max',        label: 'Max Value',             hasValue: true,  group: 'Number', valueLabel: 'Max value', inputType: 'number' },
  { type: 'integer',    label: 'Whole number',          hasValue: false, group: 'Number' },
  { type: 'positive',   label: 'Greater than zero',     hasValue: false, group: 'Number' },
  { type: 'non_negative', label: 'Zero or more',        hasValue: false, group: 'Number' },
  // group: Date
  { type: 'min_date',   label: 'Not before',            hasValue: true,  group: 'Date', valueLabel: 'Date (YYYY-MM-DD) or "today"' },
  { type: 'max_date',   label: 'Not after',             hasValue: true,  group: 'Date', valueLabel: 'Date (YYYY-MM-DD) or "today"' },
  // group: Compare with another field
  { type: 'equals_field',     label: 'Equals another field',       hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  { type: 'not_equals_field', label: 'Differs from another field', hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  { type: 'gt_field',   label: 'Greater than another field', hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  { type: 'gte_field',  label: 'At least another field',     hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  { type: 'lt_field',   label: 'Less than another field',    hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  { type: 'lte_field',  label: 'At most another field',      hasValue: 'field', group: 'Compare', valueLabel: 'Other field' },
  // group: Data
  { type: 'unique',     label: 'Unique across records',  hasValue: false, group: 'Data', hint: 'Checked on the server when the record is saved.' },
  { type: 'custom',     label: 'Custom JS (browser only)', hasValue: true, group: 'Data', valueLabel: 'JS expression using `value` (returns true/false)', hint: 'Runs in the browser only — never enforced by the API. Prefer a built-in rule.' },
];

export const VALIDATION_GROUPS = ['Presence', 'Text', 'Number', 'Date', 'Compare', 'Data'];

/** Dependency condition types */
export const CONDITION_TYPES = [
  { value: 'equals',       label: 'Equals' },
  { value: 'not_equals',   label: 'Not Equals' },
  { value: 'contains',     label: 'Contains' },
  { value: 'not_contains', label: 'Does Not Contain' },
  { value: 'gt',           label: 'Greater Than' },
  { value: 'lt',           label: 'Less Than' },
  { value: 'gte',          label: 'Greater Than or Equal' },
  { value: 'lte',          label: 'Less Than or Equal' },
  { value: 'in',           label: 'Is One Of' },
  { value: 'not_in',       label: 'Is Not One Of' },
  { value: 'is_empty',     label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

/** Dependency action types */
export const ACTION_TYPES = [
  { value: 'show',      label: 'Show Field' },
  { value: 'hide',      label: 'Hide Field' },
  { value: 'enable',    label: 'Enable Field' },
  { value: 'disable',   label: 'Disable Field' },
  { value: 'require',   label: 'Make Required' },
  { value: 'unrequire', label: 'Make Optional' },
  { value: 'set_value', label: 'Set Value' },
  { value: 'clear',     label: 'Clear Value' },
];

/** All supported chart types */
export const CHART_TYPES = [
  { type: 'bar',          label: 'Bar Chart',        library: 'recharts', icon: 'BarChart2' },
  { type: 'bar_stacked',  label: 'Stacked Bar',      library: 'recharts', icon: 'BarChart2' },
  { type: 'line',         label: 'Line Chart',       library: 'recharts', icon: 'TrendingUp' },
  { type: 'area',         label: 'Area Chart',       library: 'recharts', icon: 'AreaChart' },
  { type: 'area_stacked', label: 'Stacked Area',     library: 'recharts', icon: 'AreaChart' },
  { type: 'pie',          label: 'Pie Chart',        library: 'recharts', icon: 'PieChart' },
  { type: 'donut',        label: 'Donut Chart',      library: 'recharts', icon: 'PieChart' },
  { type: 'scatter',      label: 'Scatter Plot',     library: 'recharts', icon: 'Activity' },
  { type: 'radar',        label: 'Radar Chart',      library: 'recharts', icon: 'Hexagon' },
  { type: 'radial_bar',   label: 'Radial Bar',       library: 'recharts', icon: 'CircleDot' },
  { type: 'treemap',      label: 'Treemap',          library: 'recharts', icon: 'Layers' },
  { type: 'funnel',       label: 'Funnel Chart',     library: 'recharts', icon: 'Filter' },
  { type: 'composed',     label: 'Composed Chart',   library: 'recharts', icon: 'GitMerge' },
  { type: 'heatmap',      label: 'Heatmap',          library: 'apexcharts', icon: 'Grid' },
  { type: 'candlestick',  label: 'Candlestick',      library: 'apexcharts', icon: 'CandlestickChart' },
  { type: 'gauge',        label: 'Gauge/Radial',     library: 'apexcharts', icon: 'Gauge' },
  { type: 'bubble',       label: 'Bubble Chart',     library: 'apexcharts', icon: 'Circles' },
  { type: 'timeline',     label: 'Timeline/Gantt',   library: 'apexcharts', icon: 'Clock' },
  { type: 'waterfall',    label: 'Waterfall Chart',  library: 'recharts', icon: 'TrendingDown' },
];

/** Widget types for dashboard palette */
export const WIDGET_TYPES = [
  { type: 'chart',      label: 'Chart / Graph',    icon: 'BarChart2',     defaultW: 6, defaultH: 4 },
  { type: 'metric',     label: 'Metric Card',      icon: 'TrendingUp',    defaultW: 3, defaultH: 2 },
  { type: 'table',      label: 'Data Table',       icon: 'Table',         defaultW: 8, defaultH: 5 },
  { type: 'list',       label: 'List View',        icon: 'List',          defaultW: 4, defaultH: 4 },
  { type: 'pipeline',   label: 'Pipeline Board',   icon: 'Columns',       defaultW: 12, defaultH: 6 },
  { type: 'custom_html',label: 'Custom HTML',      icon: 'Code',          defaultW: 4, defaultH: 3 },
];

/** Module categories — drives sidebar section grouping.
 *  `key` matches UiModule.category in the database.
 *  `label` is the sidebar section header.
 *  `order` controls the rendering sequence.
 */
export const MODULE_CATEGORIES = [
  { key: 'crm',       label: 'Modules',   order: 1 },
  { key: 'insurance', label: 'Insurance',  order: 2 },
  { key: 'tools',     label: 'Tools',      order: 3 },
];

export const MODULE_CATEGORY_OPTIONS = MODULE_CATEGORIES.map(c => ({ value: c.key, label: c.label }));
