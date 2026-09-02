import { getSecret } from './settings.js';

export interface ProfileClaim {
  text: string;
  sources: string[];
}

export interface DistilledProfile {
  summary: string;
  strengths: ProfileClaim[];
  weaknesses: ProfileClaim[];
  usecase_signals: Record<string, { signal: number; confidence: number; evidence: ProfileClaim[] }>;
  researched_at: string;
  trusted: boolean; // false if any claim lacks a source
  untrusted_claims: string[];
}

const ENDPOINT = 'https://inference-api.nousresearch.com/v1/chat/completions';

/** Raw evidence we already hold for a model (Tier 1/2). Fed to the distiller as facts. */
export interface RawEvidence {
  description?: string;
  hf_downloads?: number;
  hf_likes?: number;
  metrics: Record<string, number>; // researched metric -> value
}

function buildPrompt(modelId: string, name: string, evidence: RawEvidence): string {
  const metricLines = Object.entries(evidence.metrics)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return `You are a research analyst building a profile for an AI model sold on the Nous Portal.

MODEL: ${name} (${modelId})
${evidence.description ? `CATALOG DESCRIPTION: ${evidence.description}` : ''}
${evidence.hf_downloads !== undefined ? `HUGGING FACE DOWNLOADS: ${evidence.hf_downloads}` : ''}
${evidence.hf_likes !== undefined ? `HUGGING FACE LIKES: ${evidence.hf_likes}` : ''}
${metricLines ? `RESEARCHED METRICS:\n${metricLines}` : ''}

HARD RULES:
1. ONLY make claims supported by the evidence above or by widely known public facts about this exact model family. Never invent benchmark scores, numbers, or capabilities.
2. Every single claim MUST carry a source. Use "https://huggingface.co/<hfid>" style URLs when the claim comes from HF stats, "https://portal.nousresearch.com/models" for catalog facts, or a real public source you are certain about. NEVER fabricate a URL.
3. If you cannot support a claim, do not include it.
4. Return STRICT JSON only, no markdown, no commentary:
{
  "summary": "2-3 sentence honest assessment",
  "strengths": [{"text": "...", "sources": ["url1"]}],
  "weaknesses": [{"text": "...", "sources": ["url1"]}],
  "usecase_signals": {
    "coding": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]},
    "research": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]},
    "frontend": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]},
    "backend": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]},
    "python": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]},
    "rust": {"signal": -2..2, "confidence": 0..1, "evidence": [{"text": "...", "sources": ["url"]}]}
  }
}
Where a use case has no supportable signal, use signal 0, confidence 0, and an empty evidence array — never guess.`;
}

function parseProfile(raw: string): DistilledProfile | null {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const j = JSON.parse(cleaned) as {
      summary?: string;
      strengths?: ProfileClaim[];
      weaknesses?: ProfileClaim[];
      usecase_signals?: Record<string, { signal?: number; confidence?: number; evidence?: ProfileClaim[] }>;
    };
    if (!j.summary && !j.strengths) return null;

    const claims = [...(j.strengths ?? []), ...(j.weaknesses ?? [])];
    const untrusted: string[] = claims.filter((c) => !c.sources || c.sources.length === 0).map((c) => c.text);
    const signals: DistilledProfile['usecase_signals'] = {};
    for (const [uc, v] of Object.entries(j.usecase_signals ?? {})) {
      signals[uc] = {
        signal: Math.max(-2, Math.min(2, Math.round(v.signal ?? 0))),
        confidence: Math.max(0, Math.min(1, v.confidence ?? 0)),
        evidence: v.evidence ?? [],
      };
    }
    return {
      summary: j.summary ?? '',
      strengths: j.strengths ?? [],
      weaknesses: j.weaknesses ?? [],
      usecase_signals: signals,
      researched_at: new Date().toISOString(),
      trusted: untrusted.length === 0,
      untrusted_claims: untrusted,
    };
  } catch {
    return null;
  }
}

/**
 * Tier 3 distillation: compress raw evidence into a cited profile using the
 * configured distiller model (default: ling-3.0-flash-fin:free). Requires the
 * user's Nous API key (settings). Returns null when no key is set or the call
 * fails — the pipeline degrades gracefully and retries on a later batch.
 */
export async function distillProfile(
  modelId: string,
  name: string,
  evidence: RawEvidence,
  apiKey?: string | null,
  distillerModel?: string,
): Promise<DistilledProfile | null> {
  const key = apiKey ?? getSecret('nous_api_key');
  if (!key) return null;
  const model = distillerModel ?? 'inclusionai/ling-3.0-flash-fin:free';

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(modelId, name, evidence) }],
        temperature: 0.2,
        max_tokens: 2000,
        // Ling-3.0-Flash-Fin is a thinking model; without this it spends its
        // whole budget on reasoning and returns empty content.
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.error('[research] distiller HTTP', res.status);
      return null;
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseProfile(content);
  } catch (e) {
    console.error('[research] distiller failed', (e as Error).message);
    return null;
  }
}
