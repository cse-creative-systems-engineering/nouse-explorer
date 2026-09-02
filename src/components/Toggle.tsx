import type { ButtonHTMLAttributes } from 'react';

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  on: boolean;
  onToggle: (next: boolean) => void;
  label?: string;
}

export function Toggle({ on, onToggle, label, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onToggle(!on)}
      {...rest}
    />
  );
}