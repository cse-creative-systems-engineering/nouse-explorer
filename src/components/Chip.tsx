import type { PropsWithChildren, ReactNode } from 'react';

interface ChipProps extends PropsWithChildren {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}

export function Chip({ active, onClick, icon, children }: ChipProps) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  );
}