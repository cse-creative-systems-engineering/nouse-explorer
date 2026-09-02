import { useLayoutEffect, useRef, useState } from 'react';

export interface UsecaseDef {
  id: string;
  label: string;
}

interface Props {
  options: UsecaseDef[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Morphing pill selector — a gold-glowing slide that physically moves
 * and resizes between options. The showpiece's signature control.
 */
export function UsecasePills({ options, value, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [slide, setSlide] = useState<{ left: number; width: number } | null>(null);

  const measure = (id: string) => {
    const btn = btnRefs.current.get(id);
    const wrap = wrapRef.current;
    if (!btn || !wrap) return;
    setSlide({ left: btn.offsetLeft, width: btn.offsetWidth });
  };

  useLayoutEffect(() => {
    measure(value);
    const onResize = () => measure(value);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value, options]);

  return (
    <div className="ucwrap" ref={wrapRef}>
      {slide && (
        <div
          className="ucslide"
          style={{ left: slide.left, width: slide.width }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          ref={(el) => {
            if (el) btnRefs.current.set(o.id, el);
            else btnRefs.current.delete(o.id);
          }}
          className={`uc${o.id === value ? ' active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
