import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** disabled + shown with a pending '…' (waiting for research data) */
  pending?: boolean;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: DropdownOption<T>[];
  label?: ReactNode;
  placeholder?: string;
  width?: number;
}

export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Any',
  width,
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
    <div className={`dropdown glass-dd ${open ? 'open' : ''}`} ref={ref} style={width ? { width } : undefined}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label && <span className="dd-label">{label}</span>}
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
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`dropdown-item ${opt.value === value ? 'active' : ''}${opt.pending ? ' pending' : ''}`}
              role="option"
              aria-selected={opt.value === value}
              disabled={opt.pending}
              title={opt.pending ? 'Waiting for research data — unlocks when the background research completes' : undefined}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
              {opt.pending && <span className="chip-wait" aria-hidden="true">…</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
