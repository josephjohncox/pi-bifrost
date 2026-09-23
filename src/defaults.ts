import { defaultInput, defaultReasoning, isAnthropic, thinkingLevelMap, wireApi } from "./classify.ts";
import type { BifrostRecord, PiModel } from "./types.ts";

export const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;
export const DEFAULT_BASE_URL = process.env.BIFROST_BASE_URL ?? "";
export const DEFAULT_API_KEY = "!/usr/local/bin/vkh get";
export const MCP_TOOLS_HEADER = { "x-bf-mcp-include-tools": "" } as const;
export const PROVIDER_NAME = "Bifrost";
export const PROVIDER_NAME_ANTHROPIC = "Bifrost (Anthropic)";
export const ZED_OPENAI_PROVIDER = "Bifrost - OpenAI";
export const ZED_ANTHROPIC_PROVIDER = "Bifrost - Anthropic";

export { defaultInput, defaultReasoning, isAnthropic, wireApi } from "./classify.ts";

function perMillion(value: unknown, fallback: number): number {
	if (value === undefined || value === null) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return n * 1_000_000;
}

export function defaultCost(record: BifrostRecord): PiModel["cost"] {
	const pricing = record.pricing;
	if (!pricing) return { ...ZERO_COST };
	return {
		input: perMillion(pricing.prompt, 0),
		output: perMillion(pricing.completion, 0),
		cacheRead: perMillion(pricing.input_cache_read, 0),
		cacheWrite: perMillion(pricing.input_cache_write, 0),
	};
}

export function defaultModel(record: BifrostRecord): PiModel {
	const api = wireApi(record);
	const model: PiModel = {
		id: record.id,
		name: record.name || record.normalized_name || record.id,
		api,
		reasoning: defaultReasoning(record),
		input: defaultInput(record),
		contextWindow: record.context_length || record.max_input_tokens || 128_000,
		maxTokens: record.max_output_tokens || 16_384,
		cost: defaultCost(record),
	};
	if (api === "openai-responses") {
		model.compat = { supportsStrictMode: true, supportsOpenAIGrammarTools: true };
	} else if (api === "anthropic-messages") {
		model.compat = { requiresThinkingAsText: true };
	}
	const thinking = thinkingLevelMap(record);
	if (thinking) model.thinkingLevelMap = thinking;
	return model;
}
