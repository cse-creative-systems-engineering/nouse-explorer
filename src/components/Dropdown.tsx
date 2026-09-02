import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: DropdownOption<T>[];
  label?: ReactNode;
  placeholder?: string;
}

export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Any',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`dropdown ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label && <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ? current.label : placeholder}
          </span>
        </span>
        <svg className="dropdown-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="dropdown-menu" role="listbox">
          <button
            type="button"
            className={`dropdown-item ${value === ('' as T) ? 'active' : ''}`}
            onClick={() => {
              onChange('' as T);
              setOpen(false);
            }}
          >
            <span>{placeholder}</span>
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dropdown-item ${opt.value === value ? 'active' : ''}`}
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}