import type { PropsWithChildren, ReactNode } from 'react';

interface TooltipProps extends PropsWithChildren {
  label: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="tooltip-wrap" tabIndex={0}>
      {children}
      <span className="tooltip" role="tooltip">{label}</span>
    </span>
  );
}