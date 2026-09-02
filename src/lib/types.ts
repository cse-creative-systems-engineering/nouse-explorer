export type Modality =
  | 'text'
  | 'text->text'
  | 'text->embeddings'
  | 'text+image->text'
  | 'text+image->text+image'
  | 'text+image->embeddings'
  | 'text+image+file->text'
  | 'text+image+video->text'
  | 'text+image+file+video->text'
  | 'text+image+file+audio->text'
  | 'text+audio->text+audio'
  | 'text+file->text'
  | 'text+file+audio->text'
  | 'text+image+audio->text'
  | 'text+image+audio+video->text'
  | 'text+image+file+audio+video->text'
  | 'text+image+file+audio+video->embeddings'
  | string;

export interface Architecture {
  modality: Modality;
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  instruct_type: string | null;
}

export interface PricingOverride {
  utc_days?: string[];
  utc_start?: number;
  utc_end?: number;
  prompt: string;
  completion: string;
  input_cache_read?: string;
  input_cache_write?: string;
  input_cache_write_1h?: string;
  web_search?: string;
  image?: string;
  request?: string;
}

export interface OriginalPricing {
  prompt: string;
  completion: string;
  web_search?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  input_cache_write_1h?: string;
  request?: string;
  image?: string;
}

export interface Pricing {
  prompt: string;
  completion: string;
  web_search?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  input_cache_write_1h?: string;
  request?: string;
  image?: string;
  original?: OriginalPricing;
  overrides?: PricingOverride[];
}

export interface TopProvider {
  context_length: number;
  max_completion_tokens: number;
  is_moderated: boolean;
}

export interface DesignArenaEntry {
  arena: string;
  category: string;
  elo: number;
  win_rate: number;
  rank: number;
}

export interface ArtificialAnalysis {
  intelligence_index?: number;
  coding_index?: number;
  agentic_index?: number;
}

export interface Benchmarks {
  design_arena: DesignArenaEntry[];
  artificial_analysis?: ArtificialAnalysis;
}

export interface ModelEntry {
  id: string;
  canonical_slug: string;
  hugging_face_id: string | null;
  name: string;
  created: number;
  description: string | null;
  context_length: number;
  architecture: Architecture;
  pricing: Pricing;
  top_provider: TopProvider;
  benchmarks?: Benchmarks;
}

export interface ModelsResponse {
  data: ModelEntry[];
}

export type SortKey =
  | 'name'
  | 'provider'
  | 'prompt'
  | 'completion'
  | 'discount'
  | 'context'
  | 'coding'
  | 'intelligence'
  | 'agentic';

export type SortDir = 'asc' | 'desc';

export type ViewMode = 'table' | 'cards';