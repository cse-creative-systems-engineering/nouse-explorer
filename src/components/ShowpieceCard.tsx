import type { ModelEntry } from '../lib/types';
import { perMillion } from '../lib/pricing';

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

function score(v: number | null | undefined, digits = 1): string {
  return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '—';
}

/**
 * Compact smart card — denser than the original showpiece card:
 * two-line header, inline prices, score chips (embedded + researched),
 * footer tags. Keeps hover glow + staggered entrance; drops the heavy tilt.
 */
export function ShowpieceCard({
  model,
  index,
  onOpen,
  extra,
}: {
  model: ModelEntry;
  index: number;
  onOpen: () => void;
  extra?: Record<string, number>;
}) {
  const aa = model.benchmarks?.artificial_analysis ?? null;
  const da = model.benchmarks?.design_arena ?? [];
  const elo = da.length > 0 ? da[0].elo : null;
  // AA indices: prefer embedded catalog value, fall back to researched data
  const ci = aa?.coding_index ?? extra?.artificial_analysis_coding_index ?? null;
  const ii = aa?.intelligence_index ?? extra?.artificial_analysis_intelligence_index ?? null;
  const ai = aa?.agentic_index ?? extra?.['artificial_analysis_agentic_index'] ?? null;
  const vision = (model.architecture?.input_modalities ?? []).includes('image');

  const speed = extra?.median_output_tokens_per_second;
  const scicode = extra?.scicode;
  const hfDownloads = extra?.hf_downloads;

  const hasData = ci != null || ii != null || ai != null || elo != null || speed != null || scicode != null
    || extra?.artificial_analysis_coding_index != null || extra?.artificial_analysis_intelligence_index != null;

  const prompt = perMillion(model.pricing.prompt);
  const completion = perMillion(model.pricing.completion);
  const origPrompt = model.pricing.original ? perMillion(model.pricing.original.prompt) : 0;
  const disc = origPrompt > 0 && prompt > 0 && prompt < origPrompt
    ? Math.round((1 - prompt / origPrompt) * 100)
    : 0;
  const isFree = prompt === 0 && completion === 0;
  const prov = model.id.split('/')[0];

  return (
    <div
      className="card card-compact"
      style={{ ['--i' as string]: index }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      role="button"
      tabIndex={0}
      title={`${model.name} — click for details`}
    >
      <div className="cc-head">
        <div className="ava" title={`Provider: ${prov}`}>{prov[0]?.toUpperCase() ?? '?'}</div>
        <div className="cc-title">
          <div className="cc-name" title={model.name}>{model.name}</div>
          <div className="cc-prov" title={`${prov} · ${model.id}`}>{prov}</div>
        </div>
        {disc > 0 && (
          <span className="disc-badge" title={`Discounted ${disc}% off list price`}>−{disc}%</span>
        )}
      </div>

      <div className="cc-prices" title="Price per 1M tokens (input / output)">
        <span className={`cc-price${prompt === 0 ? ' free' : ''}`}>{prompt === 0 ? 'Free' : `$${fmt(prompt)}`}</span>
        <span className="cc-price-sep">/</span>
        <span className={`cc-price${completion === 0 ? ' free' : ''}`}>{completion === 0 ? 'Free' : `$${fmt(completion)}`}</span>
        <span className="cc-perm" title="USD per 1M tokens">per 1M</span>
      </div>

      {hasData ? (
        <div className="cc-scores" title="Benchmark scores (embedded + researched)">
          {ci != null && <span className="cc-score" title="Artificial Analysis coding index (embedded)">⌘ {score(ci)}</span>}
          {ii != null && <span className="cc-score" title="Artificial Analysis intelligence index (embedded)">◉ {score(ii)}</span>}
          {ai != null && <span className="cc-score" title="Artificial Analysis agentic index (embedded)">⚡ {score(ai)}</span>}
          {elo != null && <span className="cc-score" title="Design Arena Elo (embedded)">Elo {Math.round(elo)}</span>}
          {speed != null && <span className="cc-score" title="Output speed, tokens/sec (researched via Artificial Analysis)">⏩ {Math.round(speed)} t/s</span>}
          {scicode != null && <span className="cc-score" title="SciCode score (researched via Artificial Analysis)">SciCode {scicode.toFixed(2)}</span>}
        </div>
      ) : (
        <div className="nobench" title="No benchmark data yet — research engine will fetch it">
          Benchmarks pending
        </div>
      )}

      <div className="cc-foot">
        <span className="tag" title={`Context window: ${model.context_length.toLocaleString()} tokens`}>{fmtCtx(model.context_length)} ctx</span>
        {vision && <span className="tag blue" title="Accepts image input">Vision</span>}
        {isFree && <span className="tag gold" title="Free model — $0 per token">Free</span>}
        {model.id.endsWith(':batch') && <span className="tag" title="Batch/offline variant">Batch</span>}
        {hfDownloads != null && (
          <span className="tag" title={`Hugging Face downloads: ${hfDownloads.toLocaleString()}`}>
            {hfDownloads >= 1_000_000 ? `${(hfDownloads / 1_000_000).toFixed(1)}M` : `${Math.round(hfDownloads / 1000)}K`} ⬇
          </span>
        )}
        <span className="cc-arrow" title="Open details">→</span>
      </div>
    </div>
  );
}
