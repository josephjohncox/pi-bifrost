export type ApiKind = "openai-completions" | "openai-responses" | "anthropic-messages";
export type InputModality = "text" | "image";

export interface BifrostRecord {
	id: string;
	alias?: string;
	name?: string;
	normalized_name?: string;
	reasoning?: boolean;
	context_length?: number;
	max_input_tokens?: number;
	max_output_tokens?: number;
	pricing?: {
		prompt?: number;
		completion?: number;
		input_cache_read?: number;
		input_cache_write?: number;
	};
	architecture?: {
		input_modalities?: string[];
	};
}

export interface ModelCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface ThinkingLevelMap {
	off?: string | null;
	minimal?: string | null;
	low?: string | null;
	medium?: string | null;
	high?: string | null;
	xhigh?: string | null;
	max?: string | null;
}

export interface PiModel {
	id: string;
	name: string;
	api?: ApiKind;
	reasoning: boolean;
	input: InputModality[];
	contextWindow: number;
	maxTokens: number;
	cost: ModelCost;
	compat?: Record<string, unknown>;
	thinkingLevelMap?: ThinkingLevelMap;
}

export interface ModelOverride {
	name?: string;
	api?: ApiKind;
	reasoning?: boolean;
	input?: InputModality[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: Partial<ModelCost>;
	compat?: Record<string, unknown>;
	thinkingLevelMap?: ThinkingLevelMap;
	exclude?: boolean;
}

export interface BifrostConfig {
	baseUrl: string;
	modelsUrl: string;
	apiKey: string;
	headers: Record<string, string>;
	exclude: string[];
	include?: string[];
	models: Record<string, ModelOverride>;
	timeoutMs: number;
	zed?: {
		openaiProvider: string;
		anthropicProvider: string;
		settingsFile?: string;
	};
}

export interface BuiltCatalog {
	openai: PiModel[];
	anthropic: PiModel[];
}
