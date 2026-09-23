import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import { MCP_TOOLS_HEADER, PROVIDER_NAME, ZED_ANTHROPIC_PROVIDER, ZED_OPENAI_PROVIDER } from "./defaults.ts";
import type { BifrostConfig, BuiltCatalog, PiModel } from "./types.ts";

export function acquireLock(path: string): string {
	const lock = `${path}.bifrost-update.lock`;
	try {
		mkdirSync(lock);
	} catch {
		throw new Error(`another update is already running (lock: ${lock})`);
	}
	return lock;
}

export function releaseLock(lock: string): void {
	rmSync(lock, { recursive: true, force: true });
}

export function atomicWrite(path: string, contents: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = join(dirname(path), `.${path.split("/").pop()}.bifrost.${process.pid}`);
	writeFileSync(tmp, contents, { mode: 0o600 });
	if (existsSync(path)) {
		const stamp = new Date().toISOString().replaceAll(":", "").replace(/\..+$/, "");
		copyFileSync(path, `${path}.bak-bifrost-${stamp}`);
	}
	renameSync(tmp, path);
}

export function piDocument(
	existing: Record<string, unknown>,
	catalog: BuiltCatalog,
	config: BifrostConfig,
	staticApiKey?: string,
): Record<string, unknown> {
	const providers =
		existing.providers && typeof existing.providers === "object"
			? { ...(existing.providers as Record<string, unknown>) }
			: {};
	const apiKey = staticApiKey ?? config.apiKey;
	const headers = { ...MCP_TOOLS_HEADER, ...config.headers };
	delete providers["bifrost-anthropic"];
	providers.bifrost = {
		name: PROVIDER_NAME,
		baseUrl: config.baseUrl.replace(/\/$/, "").replace(/\/v1$/, "").replace(/\/anthropic$/, ""),
		api: "openai-completions",
		apiKey,
		headers,
		models: [...catalog.openai, ...catalog.anthropic],
	};
	return { ...existing, providers };
}

export function formatPiList(catalog: BuiltCatalog): string {
	const models = [...catalog.openai, ...catalog.anthropic];
	const lines = [
		`Bifrost models (${models.length}):`,
		`  ${"MODEL".padEnd(42)} ${"CONTEXT".padStart(10)} ${"MAX-OUT".padStart(10)} ${"THINKING".padEnd(8)} INPUT API`,
	];
	for (const model of models) {
		const input = model.input.join("+");
		const thinking = model.reasoning ? "yes" : "no";
		const api = model.api ?? "default";
		lines.push(
			`  ${model.id.padEnd(42)} ${String(model.contextWindow).padStart(10)} ${String(model.maxTokens).padStart(10)} ${thinking.padEnd(8)} ${input} ${api}`,
		);
	}
	return lines.join("\n");
}

function zedCapabilities(model: PiModel): Record<string, unknown> {
	if (model.api === "anthropic-messages") return { tools: true, images: true, prompt_caching: false };
	const responses = model.api === "openai-responses";
	return {
		tools: true,
		images: true,
		parallel_tool_calls: true,
		prompt_cache_key: false,
		chat_completions: !responses,
		interleaved_reasoning: false,
		max_tokens_parameter: !responses,
	};
}

export function applyZedSettings(source: string, catalog: BuiltCatalog, config: BifrostConfig): string {
	const openaiName = config.zed?.openaiProvider ?? ZED_OPENAI_PROVIDER;
	const anthropicName = config.zed?.anthropicProvider ?? ZED_ANTHROPIC_PROVIDER;
	const parsed = parse(source) as Record<string, unknown> | undefined;
	if (!parsed || typeof parsed !== "object") throw new Error("Zed settings are not valid JSONC");
	const languageModels =
		parsed.language_models && typeof parsed.language_models === "object"
			? (parsed.language_models as Record<string, unknown>)
			: {};
	const openaiCompatible =
		languageModels.openai_compatible && typeof languageModels.openai_compatible === "object"
			? { ...(languageModels.openai_compatible as Record<string, unknown>) }
			: {};
	const anthropicCompatible =
		languageModels.anthropic_compatible && typeof languageModels.anthropic_compatible === "object"
			? { ...(languageModels.anthropic_compatible as Record<string, unknown>) }
			: {};

	const root = config.baseUrl.replace(/\/$/, "");
	const openaiProvider = {
		api_url: `${root}/v1`,
		custom_headers: { ...MCP_TOOLS_HEADER },
		available_models: catalog.openai.map((model) => zedOpenAi(model)),
	};
	const anthropicProvider = {
		api_url: `${root}/anthropic`,
		custom_headers: { ...MCP_TOOLS_HEADER },
		available_models: catalog.anthropic.map((model) => zedAnthropic(model)),
	};
	assignSameGateway(openaiCompatible, openaiName, openaiProvider);
	assignSameGateway(anthropicCompatible, anthropicName, anthropicProvider);

	let next = source;
	const formatting = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } };
	next = applyEdits(
		next,
		modify(next, ["language_models", "openai_compatible"], openaiCompatible, formatting),
	);
	next = applyEdits(
		next,
		modify(next, ["language_models", "anthropic_compatible"], anthropicCompatible, formatting),
	);
	return next;
}

function assignSameGateway(
	map: Record<string, unknown>,
	name: string,
	provider: Record<string, unknown>,
): void {
	const want = String(provider.api_url ?? "");
	map[name] = provider;
	for (const [key, value] of Object.entries(map)) {
		if (key === name || !value || typeof value !== "object") continue;
		const url = String((value as { api_url?: unknown }).api_url ?? "");
		if (!url || url === want) map[key] = provider;
	}
}

function zedOpenAi(model: PiModel): Record<string, unknown> {
	return {
		name: model.id,
		max_tokens: model.contextWindow,
		max_output_tokens: model.maxTokens,
		// Zed hides thinking unless this is a non-none effort.
		reasoning_effort: model.reasoning ? "high" : "none",
		capabilities: zedCapabilities(model),
	};
}

function zedAnthropic(model: PiModel): Record<string, unknown> {
	const haiku3 = /claude-3-haiku/i.test(`${model.id} ${model.name}`);
	return {
		name: model.id.split("/").pop() ?? model.id,
		max_tokens: model.contextWindow,
		max_output_tokens: model.maxTokens,
		...(model.reasoning && !haiku3 ? { mode: { type: "adaptive" } } : {}),
		capabilities: zedCapabilities(model),
	};
}

export function readJsonFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) return { providers: {} };
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`invalid JSON ${path}: ${reason}`);
	}
}
