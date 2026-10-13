import clsx from 'clsx';

export default function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10', xl: 'h-14 w-14' };
  return (
    <div className={clsx('relative flex items-center justify-center', sizes[size] || size, className)} data-testid="spinner">
      {/* Track */}
      <svg className="absolute inset-0" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-white/10" />
      </svg>
      {/* Spinning arc */}
      <svg className="animate-spin absolute inset-0" viewBox="0 0 36 36" fill="none">
        <circle
          cx="18" cy="18" r="15"
          stroke="url(#spin-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="60 40"
        />
        <defs>
          <linearGradient id="spin-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
