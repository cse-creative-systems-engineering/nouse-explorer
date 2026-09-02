import { useState } from 'react';

/** Custom glass toggle with gold glow — no browser checkbox. */
export function GlassToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="tgwrap">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`toggle${on ? ' on' : ''}`}
        style={focused ? { outline: '2px solid rgba(245,166,35,.4)', outlineOffset: 2 } : undefined}
        onClick={() => onChange(!on)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
