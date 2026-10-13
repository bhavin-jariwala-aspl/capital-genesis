// Theme utility functions and class generators for consistent styling
// Reduces duplication of dark mode patterns and provides standardized classes

/**
 * Color utilities for consistent theming
 */
export const colors = {
  // Background colors
  bg: {
    primary: 'bg-white dark:bg-gray-800',
    secondary: 'bg-gray-50 dark:bg-gray-900',
    tertiary: 'bg-gray-100 dark:bg-gray-700',
    accent: 'bg-primary-50 dark:bg-primary-900/20',
    card: 'bg-white dark:bg-night-2',
    surface: 'bg-white dark:bg-white/5',
    overlay: 'bg-white dark:bg-white/[0.02]',
    hover: 'hover:bg-gray-50 dark:hover:bg-white/[0.05]',
    selected: 'bg-blue-50 dark:bg-blue-900/20',
  },

  // Text colors
  text: {
    primary: 'text-gray-900 dark:text-white',
    secondary: 'text-gray-700 dark:text-white/80',
    tertiary: 'text-gray-500 dark:text-white/60',
    muted: 'text-gray-400 dark:text-white/40',
    subtle: 'text-gray-300 dark:text-white/30',
    disabled: 'text-gray-400 dark:text-white/20',
    accent: 'text-primary-600 dark:text-primary-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    error: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400',
  },

  // Border colors
  border: {
    primary: 'border-gray-200 dark:border-white/10',
    secondary: 'border-gray-300 dark:border-white/20',
    muted: 'border-gray-100 dark:border-white/[0.07]',
    subtle: 'border-gray-50 dark:border-white/[0.05]',
    accent: 'border-primary-200 dark:border-primary-800',
    success: 'border-green-200 dark:border-green-800',
    warning: 'border-amber-200 dark:border-amber-800',
    error: 'border-red-200 dark:border-red-800',
    focus: 'border-primary-500 focus:border-primary-500',
    hover: 'hover:border-gray-300 dark:hover:border-white/[0.12]',
  },

  // Ring/outline colors
  ring: {
    primary: 'ring-primary-500/50',
    focus: 'focus:ring-1 focus:ring-primary-500/50',
    error: 'ring-red-500/50',
    success: 'ring-green-500/50',
  },
}

/**
 * Component style builders
 */
export const components = {
  // Card component styles
  card: (variant = 'default') => {
    const variants = {
      default: `${colors.bg.card} ${colors.border.primary} border rounded-lg shadow-sm`,
      elevated: `${colors.bg.card} ${colors.border.primary} border rounded-lg shadow-md hover:shadow-lg transition-shadow`,
      flat: `${colors.bg.card} ${colors.border.muted} border rounded-lg`,
      accent: `${colors.bg.accent} ${colors.border.accent} border rounded-lg`,
    };
    return variants[variant] || variants.default;
  },

  // Button styles
  button: (variant = 'primary', size = 'md') => {
    const variants = {
      primary: 'bg-primary-600 hover:bg-primary-700 text-on-primary border-transparent',
      secondary: `${colors.bg.surface} ${colors.text.secondary} ${colors.border.primary} border hover:${colors.bg.hover}`,
      outline: `bg-transparent ${colors.text.primary} ${colors.border.primary} border hover:${colors.bg.hover}`,
      ghost: `bg-transparent ${colors.text.secondary} border-transparent hover:${colors.bg.hover}`,
      danger: 'bg-red-600 hover:bg-red-700 text-white border-transparent',
      success: 'bg-green-600 hover:bg-green-700 text-white border-transparent',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
      xl: 'px-8 py-4 text-lg',
    };

    return `${variants[variant]} ${sizes[size]} rounded-lg font-medium transition-colors focus:outline-none ${colors.ring.focus} disabled:opacity-50 disabled:cursor-not-allowed`;
  },

  // Input styles
  input: (_state = 'default') => {
    const states = {
      default: `${colors.bg.surface} ${colors.text.primary} ${colors.border.primary}`,
      focus: `${colors.border.focus} ${colors.ring.focus}`,
      error: `${colors.border.error} ${colors.ring.error}`,
      success: `${colors.border.success} ${colors.ring.success}`,
      disabled: `${colors.bg.overlay} ${colors.text.disabled} cursor-not-allowed`,
    };

    return `${states.default} border rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none ${colors.ring.focus} placeholder:${colors.text.muted}`;
  },

  // Select dropdown styles
  select: `block w-full rounded-lg border ${colors.border.primary} ${colors.bg.surface} px-3 py-2 text-sm ${colors.text.primary} focus:${colors.border.focus} focus:outline-none focus:ring-1 ${colors.ring.focus} disabled:${colors.bg.overlay} disabled:${colors.text.disabled}`,

  // Alert styles
  alert: (variant = 'info') => {
    const variants = {
      info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
      success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
      warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
      error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
    };

    return `${variants[variant]} border rounded-lg p-4`;
  },

  // Badge styles
  badge: (variant = 'default', size = 'sm') => {
    const variants = {
      default: `${colors.bg.tertiary} ${colors.text.secondary}`,
      primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200',
      secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
      success: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
      warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
      error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
      outline: `bg-transparent ${colors.text.secondary} ${colors.border.primary} border`,
    };

    const sizes = {
      xs: 'px-2 py-0.5 text-xs',
      sm: 'px-2.5 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
    };

    return `${variants[variant]} ${sizes[size]} rounded-full font-medium inline-flex items-center`;
  },

  // Modal/Dropdown overlay
  overlay: 'fixed inset-0 bg-black/50 dark:bg-black/70 z-50',
  
  // Modal content
  modal: `${colors.bg.primary} rounded-lg shadow-xl border ${colors.border.primary} max-w-md w-full mx-4`,

  // Dropdown menu
  dropdown: `${colors.bg.primary} rounded-lg shadow-lg border ${colors.border.primary} py-1 min-w-[12rem] z-50`,
  
  // Dropdown item
  dropdownItem: `block w-full text-left px-4 py-2 text-sm ${colors.text.secondary} hover:${colors.bg.hover} transition-colors`,

  // Table styles
  table: {
    wrapper: `${colors.bg.card} rounded-lg border ${colors.border.primary} overflow-hidden`,
    header: `${colors.bg.tertiary} ${colors.text.secondary} text-sm font-medium`,
    row: `${colors.border.muted} border-b last:border-b-0 hover:${colors.bg.hover} transition-colors`,
    cell: `px-4 py-3 text-sm ${colors.text.primary}`,
  },

  // Form field wrapper
  field: 'space-y-1',
  
  // Label styles
  label: `block text-sm font-medium ${colors.text.secondary} mb-1`,

  // Helper text
  helperText: `text-xs ${colors.text.muted} mt-1`,

  // Error text
  errorText: `text-xs ${colors.text.error} mt-1`,

  // Loading spinner container
  spinner: `inline-flex items-center justify-center w-4 h-4`,

  // Skeleton loading
  skeleton: `animate-pulse ${colors.bg.tertiary} rounded`,

  // Divider
  divider: `border-t ${colors.border.muted}`,

  // Sidebar
  sidebar: `${colors.bg.primary} ${colors.border.primary} border-r`,

  // Header
  header: `${colors.bg.primary} ${colors.border.primary} border-b`,

  // Content area
  content: `${colors.bg.secondary} min-h-screen`,
}

/**
 * Utility functions
 */
export const utils = {
  // Conditional class application
  cn: (...classes) => classes.filter(Boolean).join(' '),

  // Responsive utilities
  responsive: {
    sm: 'sm:',
    md: 'md:',
    lg: 'lg:',
    xl: 'xl:',
    '2xl': '2xl:',
  },

  // State utilities
  states: {
    hover: 'hover:',
    focus: 'focus:',
    active: 'active:',
    disabled: 'disabled:',
    selected: 'aria-selected:',
  },

  // Animation utilities
  transitions: {
    default: 'transition-all duration-200 ease-in-out',
    fast: 'transition-all duration-150 ease-in-out',
    slow: 'transition-all duration-300 ease-in-out',
    colors: 'transition-colors duration-200 ease-in-out',
    transform: 'transition-transform duration-200 ease-in-out',
  },

  // Shadow utilities
  shadows: {
    sm: 'shadow-sm',
    default: 'shadow',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    inner: 'shadow-inner',
    none: 'shadow-none',
  },

  // Focus management
  focus: {
    ring: `focus:outline-none focus:ring-2 ${colors.ring.primary}`,
    visible: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
  },
}

/**
 * Pre-built class combinations for common patterns
 */
export const patterns = {
  // Common container styles
  container: 'container mx-auto px-4 sm:px-6 lg:px-8',
  
  // Flex utilities
  flexCenter: 'flex items-center justify-center',
  flexBetween: 'flex items-center justify-between',
  flexCol: 'flex flex-col',
  flexRow: 'flex flex-row',

  // Grid utilities
  gridCols: {
    1: 'grid grid-cols-1',
    2: 'grid grid-cols-1 md:grid-cols-2',
    3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  },

  // Common layout patterns
  pageLayout: `${colors.bg.secondary} min-h-screen`,
  pageHeader: `${colors.bg.primary} ${colors.border.primary} border-b px-6 py-4`,
  pageContent: 'flex-1 p-6',
  pageTitle: `text-2xl font-bold ${colors.text.primary}`,
  
  // Form patterns
  formGroup: 'space-y-6',
  formRow: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  formActions: 'flex items-center gap-3 pt-6',

  // Status indicators
  statusDot: (color = 'gray') => `w-2 h-2 rounded-full bg-${color}-500`,
  
  // Loading states
  loadingOverlay: `absolute inset-0 ${colors.bg.primary} bg-opacity-75 flex items-center justify-center`,
  
  // Empty states
  emptyState: `text-center py-12 px-6 ${colors.text.muted}`,

  // Responsive text sizes
  textSize: {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  },
}

// Export commonly used class strings for direct usage
export const classes = {
  // Pre-built component classes
  selectInput: components.select,
  cardDefault: components.card(),
  cardElevated: components.card('elevated'),
  buttonPrimary: components.button('primary'),
  buttonSecondary: components.button('secondary'),
  inputDefault: components.input(),
  
  // Common utility classes
  transition: utils.transitions.default,
  focusRing: utils.focus.ring,
  flexCenter: patterns.flexCenter,
  container: patterns.container,
}

export default {
  colors,
  components,
  utils,
  patterns,
  classes,
};