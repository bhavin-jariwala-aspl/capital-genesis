import { useState, useMemo } from 'react';
import clsx from 'clsx';

/**
 * TabbedWorkspace — a generic, metadata-driven tabbed container.
 *
 * Useful for any multi-section page that needs tab-based navigation.
 *
 * Props:
 *   tabs         — array of { key, label, icon?, badge?, disabled? }
 *   activeTab    — controlled active tab key (optional — uncontrolled by default)
 *   defaultTab   — default active tab key for uncontrolled mode
 *   onTabChange  — (key) => void callback
 *   children     — function (activeKey) => ReactNode, OR a map of { [key]: ReactNode }
 *   variant      — 'underline' | 'pills' | 'boxed' (default 'underline')
 *   size         — 'sm' | 'md' (default 'md')
 *   className    — wrapper classes
 *   tabBarExtra  — ReactNode placed at right end of tab bar
 */
export default function TabbedWorkspace({
  tabs = [],
  activeTab: controlledActive,
  defaultTab,
  onTabChange,
  children,
  variant = 'underline',
  size = 'md',
  className,
  tabBarExtra,
}) {
  const [internalActive, setInternalActive] = useState(defaultTab || tabs[0]?.key || '');
  const activeKey = controlledActive ?? internalActive;

  const handleTabClick = (key) => {
    if (controlledActive === undefined) setInternalActive(key);
    onTabChange?.(key);
  };

  const content = useMemo(() => {
    if (typeof children === 'function') return children(activeKey);
    if (children && typeof children === 'object' && !Array.isArray(children) && !(children.$$typeof)) {
      return children[activeKey] || null;
    }
    return children;
  }, [children, activeKey]);

  if (!tabs.length) return null;

  return (
    <div className={className}>
      {/* Tab bar */}
      <div className={clsx(
        'flex items-center gap-1',
        variant === 'underline' && 'border-b border-gray-200 dark:border-white/10',
        variant === 'boxed' && 'bg-gray-100 dark:bg-white/5 rounded-lg p-1',
        variant === 'pills' && 'gap-2',
      )}>
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const isActive = tab.key === activeKey;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => !tab.disabled && handleTabClick(tab.key)}
                disabled={tab.disabled}
                className={clsx(
                  'flex items-center gap-1.5 font-medium whitespace-nowrap transition-all',
                  tab.disabled && 'opacity-40 cursor-not-allowed',
                  !tab.disabled && 'cursor-pointer',

                  // Size
                  size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',

                  // Variants
                  variant === 'underline' && [
                    '-mb-px border-b-2',
                    isActive
                      ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                      : 'border-transparent text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70 hover:border-gray-300 dark:hover:border-white/20',
                  ],

                  variant === 'pills' && [
                    'rounded-lg',
                    isActive
                      ? 'bg-primary-600 text-on-primary shadow-sm'
                      : 'text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5',
                  ],

                  variant === 'boxed' && [
                    'rounded-md',
                    isActive
                      ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70',
                  ],
                )}
              >
                {Icon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
                {tab.label}
                {tab.badge != null && (
                  <span className={clsx(
                    'rounded-full px-1.5 font-bold',
                    size === 'sm' ? 'text-[9px]' : 'text-[10px]',
                    isActive
                      ? variant === 'pills'
                        ? 'bg-white/20 text-white'
                        : 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400'
                      : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40',
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {tabBarExtra && (
          <div className="ml-auto shrink-0 pl-4">
            {tabBarExtra}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {content}
      </div>
    </div>
  );
}
