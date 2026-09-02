import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';

interface GlassProps extends PropsWithChildren {
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'header' | 'article' | 'aside';
  strong?: boolean;
  hoverable?: boolean;
}

export function Glass({
  children,
  className = '',
  style,
  as: Tag = 'div',
  strong,
  hoverable,
}: GlassProps) {
  const classes = [
    strong ? 'glass-strong' : 'glass',
    hoverable ? 'glass-hoverable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={classes} style={style}>
      {children}
    </Tag>
  );
}

export function GlassSection({
  title,
  action,
  children,
  className = '',
}: PropsWithChildren<{ title?: ReactNode; action?: ReactNode; className?: string }>) {
  return (
    <section className={`glass ${className}`}>
      {(title || action) && (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          {title && <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{title}</h2>}
          {action}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}