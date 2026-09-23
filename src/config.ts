import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	DEFAULT_API_KEY,
	DEFAULT_BASE_URL,
	MCP_TOOLS_HEADER,
	ZED_ANTHROPIC_PROVIDER,
	ZED_OPENAI_PROVIDER,
} from "./defaults.ts";
import type { BifrostConfig, ModelOverride } from "./types.ts";

const modelOverrideSchema = z.object({
	name: z.string().optional(),
	api: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]).optional(),
	reasoning: z.boolean().optional(),
	input: z.array(z.enum(["text", "image"])).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxTokens: z.number().int().positive().optional(),
	cost: z
		.object({
			input: z.number().optional(),
			output: z.number().optional(),
			cacheRead: z.number().optional(),
			cacheWrite: z.number().optional(),
		})
		.optional(),
	compat: z.record(z.string(), z.unknown()).optional(),
	thinkingLevelMap: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
	exclude: z.boolean().optional(),
});

const configSchema = z.object({
	baseUrl: z.string().default(DEFAULT_BASE_URL),
	modelsUrl: z.string().optional(),
	apiKey: z.string().default(DEFAULT_API_KEY),
	headers: z.record(z.string(), z.string()).default({ ...MCP_TOOLS_HEADER }),
	exclude: z.array(z.string()).default([]),
	include: z.array(z.string()).optional(),
	models: z.record(z.string(), modelOverrideSchema).default({}),
	timeoutMs: z.number().int().positive().default(8000),
	zed: z
		.object({
			openaiProvider: z.string().default(ZED_OPENAI_PROVIDER),
			anthropicProvider: z.string().default(ZED_ANTHROPIC_PROVIDER),
			settingsFile: z.string().optional(),
		})
		.optional(),
});

export const DEFAULT_MODELS_PATH = join(homedir(), ".pi/agent/models.json");

export function configPath(): string {
	return process.env.PI_BIFROST_CONFIG ?? process.env.PI_MODELS_FILE ?? DEFAULT_MODELS_PATH;
}

export function rootUrl(baseUrl: string): string {
	return baseUrl.replace(/\/$/, "").replace(/\/v1$/, "").replace(/\/anthropic$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Accept a flat override object or a models.json document. */
export function fromModelsDocument(raw: unknown): unknown {
	const doc = asRecord(raw);
	if (!("providers" in doc)) return raw ?? {};
	const providers = asRecord(doc.providers);
	const openai = asRecord(providers.bifrost);
	const anthropic = asRecord(providers["bifrost-anthropic"]);
	const baseUrl = rootUrl(String(openai.baseUrl ?? anthropic.baseUrl ?? DEFAULT_BASE_URL));
	return {
		baseUrl,
		modelsUrl: openai.modelsUrl ?? anthropic.modelsUrl,
		apiKey: openai.apiKey ?? anthropic.apiKey ?? DEFAULT_API_KEY,
		headers: { ...asRecord(anthropic.headers), ...asRecord(openai.headers) },
		exclude: openai.exclude ?? anthropic.exclude ?? [],
		include: openai.include ?? anthropic.include,
		models: { ...asRecord(anthropic.modelOverrides), ...asRecord(openai.modelOverrides) },
		timeoutMs: openai.timeoutMs ?? anthropic.timeoutMs,
	};
}

export function parseConfig(raw: unknown): BifrostConfig {
	const parsed = configSchema.parse(fromModelsDocument(raw) ?? {});
	const baseUrl = rootUrl(parsed.baseUrl);
	return {
		baseUrl,
		modelsUrl: parsed.modelsUrl ?? (baseUrl ? `${baseUrl}/v1/models` : ""),
		apiKey: parsed.apiKey,
		headers: { ...MCP_TOOLS_HEADER, ...parsed.headers },
		exclude: parsed.exclude,
		include: parsed.include,
		models: parsed.models as Record<string, ModelOverride>,
		timeoutMs: parsed.timeoutMs,
		zed: parsed.zed,
	};
}

export function loadConfig(path = configPath()): BifrostConfig {
	if (!existsSync(path)) return parseConfig({});
	const text = readFileSync(path, "utf8");
	if (text.trim() === "") return parseConfig({});
	try {
		return parseConfig(JSON.parse(text));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`invalid models.json ${path}: ${reason}`);
	}
}
