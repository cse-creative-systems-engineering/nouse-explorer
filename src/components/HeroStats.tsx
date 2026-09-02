import { useCountUp } from '../hooks/useCountUp';

function HeroStat({
  n,
  label,
  gold,
  index,
}: {
  n: number;
  label: string;
  gold?: boolean;
  index: number;
}) {
  const v = useCountUp(n);
  return (
    <div className="hstat" style={{ animationDelay: `${0.15 + index * 0.1}s` }}>
      <div className={`hnum${gold ? ' gold' : ''}`}>{v}</div>
      <div className="hlbl">{label}</div>
    </div>
  );
}

export function HeroStats({
  total,
  discounted,
  benchmarked,
  free,
}: {
  total: number;
  discounted: number;
  benchmarked: number;
  free: number;
}) {
  return (
    <div className="hstats">
      <HeroStat n={total} label="Models" index={0} />
      <HeroStat n={discounted} label="Discounted" index={1} />
      <HeroStat n={benchmarked} label="Benchmarked" gold index={2} />
      <HeroStat n={free} label="Free" index={3} />
    </div>
  );
}
