'use client';
import { useState, forwardRef } from 'react';
import { IconEye, IconEyeOff } from './icons';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** When true, the toggle button is hidden (e.g., for read-only fields). */
  hideToggle?: boolean;
};

/**
 * Password input with an eye/eye-off toggle to show or hide the value.
 * Drop-in replacement for `<input type="password" className="input" />`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = '', hideToggle, ...rest }, ref,
) {
  const [show, setShow] = useState(false);
  const Icon = show ? IconEyeOff : IconEye;
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        className={`input pr-10 ${className}`}
        {...rest}
      />
      {!hideToggle && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-brand-navy dark:hover:text-brand-gold"
          tabIndex={-1}
        >
          <Icon size={16} />
        </button>
      )}
    </div>
  );
});
