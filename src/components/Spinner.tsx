/**
 * Tiny CSS-driven spinner. Uses currentColor so it inherits the parent text color.
 * Sizes: sm (12px), md (16px, default), lg (20px), xl (28px).
 */
type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<Size, string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-7 h-7',
};

export function Spinner({ size = 'md', className = '' }: { size?: Size; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`spinner ${SIZE[size]} ${className}`}
    />
  );
}
