import type { ModelEntry } from '../lib/types';
import { perMillion } from '../lib/pricing';

const RING_LEN = 126; // 2πr, r=20

function fmt(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  if (n === 0) return '0';
  return n.toFixed(4);
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function Ring({
  label,
  value,
  max,
  showAsIs,
  index,
}: {
  label: string;
  value: number | null;
  max: number;
  showAsIs?: boolean;
  index: number;
}) {
  if (value == null) return null;
  const pct = Math.min(1, value / max);
  const off = RING_LEN * (1 - pct);
  return (
    <div>
      <div className="ring">
        <svg width="46" height="46">
          <circle className="track" cx="23" cy="23" r="20" />
          <circle
            className="fillc"
            style={{ ['--off' as string]: off, animationDelay: `${0.5 + index * 0.05}s` }}
            cx="23"
            cy="23"
            r="20"
          />
        </svg>
        <span className="rv">{showAsIs ? value.toFixed(0) : value.toFixed(0)}</span>
      </div>
      <div className="rlbl">{label}</div>
    </div>
  );
}

/**
 * Showpiece card — 3D tilt on hover, light sweep, gradient border ignition,
 * animated benchmark rings.
 */
export function ShowpieceCard({
  model,
  index,
  onOpen,
}: {
  model: ModelEntry;
  index: number;
  onOpen: () => void;
}) {
  const aa = model.benchmarks?.artificial_analysis ?? null;
  const da = model.benchmarks?.design_arena ?? [];
  const elo = da.length > 0 ? da[0].elo : null;
  const ci = aa?.coding_index ?? null;
  const ii = aa?.intelligence_index ?? null;
  const vision = (model.architecture?.input_modalities ?? []).includes('image');

  const hasBench = ci != null || ii != null || elo != null;
  const prompt = perMillion(model.pricing.prompt);
  const completion = perMillion(model.pricing.completion);
  const origPrompt = model.pricing.original ? perMillion(model.pricing.original.prompt) : 0;
  const disc = origPrompt > 0 && prompt > 0 && prompt < origPrompt
    ? Math.round((1 - prompt / origPrompt) * 100)
    : 0;
  const isFree = prompt === 0 && completion === 0;
  const prov = model.id.split('/')[0];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-3px)`;
  };
  const onLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = '';
  };

  return (
    <div
      className="card"
      style={{ ['--i' as string]: index }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="card-top">
        <div className="ava">{prov[0]?.toUpperCase() ?? '?'}</div>
        <div className="cmeta">
          <div className="cname">{model.name}</div>
          <div className="cprov">{prov}</div>
        </div>
        {disc > 0 && <span className="disc-badge">−{disc}%</span>}
      </div>

      <div className="prices">
        <div className="pr">
          <div className="l">In / 1M</div>
          <div className={`v${prompt === 0 ? ' free' : ''}`}>{prompt === 0 ? 'FREE' : `$${fmt(prompt)}`}</div>
        </div>
        <div className="pr">
          <div className="l">Out / 1M</div>
          <div className={`v${completion === 0 ? ' free' : ''}`}>{completion === 0 ? 'FREE' : `$${fmt(completion)}`}</div>
        </div>
      </div>

      <div className="rings">
        {hasBench ? (
          <>
            <Ring label="Coding" value={ci} max={100} index={index} />
            <Ring label="Intel" value={ii} max={100} index={index} />
            <Ring label="Elo" value={elo} max={1400} showAsIs index={index} />
          </>
        ) : (
          <div className="nobench">Benchmarks pending</div>
        )}
      </div>

      <div className="cfoot">
        <span className="tag">{fmtCtx(model.context_length)} ctx</span>
        {vision && <span className="tag blue">VISION</span>}
        {isFree && <span className="tag gold">FREE</span>}
      </div>
    </div>
  );
}
