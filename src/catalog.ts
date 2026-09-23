import { spawnSync } from "node:child_process";
import type { BifrostConfig, BifrostRecord, BuiltCatalog, ModelOverride, PiModel } from "./types.ts";
import { isAnthropic } from "./classify.ts";
import { defaultModel } from "./defaults.ts";

export class CatalogError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CatalogError";
	}
}

export function resolveApiKey(spec: string): string {
	const env = process.env.BIFROST_API_KEY;
	if (env && env.trim() !== "") return env.trim();
	if (spec.startsWith("!")) {
		const command = spec.slice(1).trim();
		const result = spawnSync("sh", ["-c", command], { encoding: "utf8" });
		if (result.status !== 0) {
			throw new CatalogError(`apiKey command failed (${command}): ${result.stderr || result.status}`);
		}
		const token = result.stdout.trim();
		if (token === "") throw new CatalogError(`apiKey command returned empty output (${command})`);
		return token;
	}
	if (spec.startsWith("$")) {
		const name = spec.replace(/^\$\{?/, "").replace(/\}$/, "");
		const value = process.env[name];
		if (!value) throw new CatalogError(`environment variable ${name} is empty`);
		return value;
	}
	if (spec.trim() === "") throw new CatalogError("apiKey is empty");
	return spec;
}

export async function fetchRecords(config: BifrostConfig, fetchImpl: typeof fetch = fetch): Promise<BifrostRecord[]> {
	const token = resolveApiKey(config.apiKey);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.timeoutMs);
	try {
		const response = await fetchImpl(config.modelsUrl, {
			headers: { Authorization: `Bearer ${token}`, ...config.headers },
			signal: controller.signal,
		});
		if (!response.ok) throw new CatalogError(`Bifrost ${response.status} from ${config.modelsUrl}`);
		const payload = (await response.json()) as { data?: unknown };
		const records = payload.data;
		if (!Array.isArray(records) || records.length === 0) {
			throw new CatalogError("Bifrost returned an invalid or empty model list");
		}
		const parsed: BifrostRecord[] = [];
		const seen = new Set<string>();
		for (const record of records) {
			if (!record || typeof record !== "object" || typeof (record as BifrostRecord).id !== "string") {
				throw new CatalogError("Bifrost returned an invalid model record");
			}
			const id = (record as BifrostRecord).id;
			if (seen.has(id)) throw new CatalogError(`Bifrost returned duplicate model ID ${id}`);
			seen.add(id);
			parsed.push(record as BifrostRecord);
		}
		return parsed.sort((a, b) => a.id.localeCompare(b.id));
	} catch (error) {
		if (error instanceof CatalogError) throw error;
		const reason = error instanceof Error ? error.message : String(error);
		throw new CatalogError(`could not fetch Bifrost models: ${reason}`);
	} finally {
		clearTimeout(timer);
	}
}

function globToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`, "i");
}

function matchesAny(id: string, patterns: string[]): boolean {
	return patterns.some((pattern) => globToRegExp(pattern).test(id));
}

function overrideFor(id: string, models: Record<string, ModelOverride>): ModelOverride | undefined {
	if (models[id]) return models[id];
	for (const [pattern, override] of Object.entries(models)) {
		if (pattern.includes("*") && globToRegExp(pattern).test(id)) return override;
	}
	return undefined;
}

function applyOverride(model: PiModel, override: ModelOverride): PiModel {
	return {
		...model,
		...("name" in override && override.name !== undefined ? { name: override.name } : {}),
		...("api" in override ? { api: override.api } : {}),
		...("reasoning" in override && override.reasoning !== undefined ? { reasoning: override.reasoning } : {}),
		...("input" in override && override.input !== undefined ? { input: override.input } : {}),
		...("contextWindow" in override && override.contextWindow !== undefined
			? { contextWindow: override.contextWindow }
			: {}),
		...("maxTokens" in override && override.maxTokens !== undefined ? { maxTokens: override.maxTokens } : {}),
		...("compat" in override ? { compat: { ...model.compat, ...override.compat } } : {}),
		...("thinkingLevelMap" in override ? { thinkingLevelMap: override.thinkingLevelMap } : {}),
		cost: { ...model.cost, ...override.cost },
	};
}

export function buildCatalog(records: BifrostRecord[], config: BifrostConfig): BuiltCatalog {
	const openai: PiModel[] = [];
	const anthropic: PiModel[] = [];
	for (const record of records) {
		if (config.include && !matchesAny(record.id, config.include)) continue;
		if (matchesAny(record.id, config.exclude)) continue;
		const override = overrideFor(record.id, config.models);
		if (override?.exclude) continue;
		const model = applyOverride(defaultModel(record), override ?? {});
		if (isAnthropic(record)) anthropic.push(model);
		else openai.push(model);
	}
	return { openai, anthropic };
}
