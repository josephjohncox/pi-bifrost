import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildCatalog, CatalogError, fetchRecords } from "./catalog.ts";
import { loadConfig } from "./config.ts";
import { PROVIDER_NAME } from "./defaults.ts";
import { endpointFor, gatewayRoot, routeApi } from "./route.ts";
import { streamBifrost } from "./stream.ts";
import type { BifrostConfig, BuiltCatalog, PiModel } from "./types.ts";

const CACHE = join(homedir(), ".pi/agent/bifrost-catalog.json");

function toProviderModels(models: PiModel[], root: string) {
	return models.map((model) => {
		const api = routeApi(model);
		return {
			id: model.id,
			name: model.name,
			reasoning: model.reasoning,
			input: model.input,
			cost: model.cost,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
			api,
			baseUrl: endpointFor(api, root),
			...(model.compat ? { compat: model.compat } : {}),
			...(model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
		};
	});
}

function allModels(catalog: BuiltCatalog): PiModel[] {
	return [...catalog.openai, ...catalog.anthropic];
}

function readCache(): BuiltCatalog | undefined {
	if (!existsSync(CACHE)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(CACHE, "utf8")) as BuiltCatalog;
		if (!Array.isArray(parsed.openai) || !Array.isArray(parsed.anthropic)) return undefined;
		return parsed;
	} catch {
		return undefined;
	}
}

function writeCache(catalog: BuiltCatalog): void {
	mkdirSync(dirname(CACHE), { recursive: true });
	writeFileSync(CACHE, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 });
}

export async function loadCatalog(config: BifrostConfig, allowNetwork: boolean): Promise<BuiltCatalog> {
	if (allowNetwork) {
		try {
			const catalog = buildCatalog(await fetchRecords(config), config);
			writeCache(catalog);
			return catalog;
		} catch (error) {
			const cached = readCache();
			if (cached) return cached;
			throw error;
		}
	}
	return readCache() ?? { openai: [], anthropic: [] };
}

export function registerProviders(pi: ExtensionAPI, catalog: BuiltCatalog, config: BifrostConfig): void {
	const headers = config.headers;
	const apiKey = config.apiKey;
	const root = gatewayRoot(config.baseUrl);
	const models = toProviderModels(allModels(catalog), root);

	pi.unregisterProvider("bifrost-anthropic");
	pi.registerProvider("bifrost", {
		name: PROVIDER_NAME,
		baseUrl: root,
		api: "openai-completions",
		apiKey,
		headers,
		models,
		refreshModels: async (context) => {
			const next = await loadCatalog(loadConfig(), context.allowNetwork);
			return toProviderModels(allModels(next), root);
		},
		streamSimple: (model, context, options) => streamBifrost(model, context, options, root, headers),
	});
}

export async function bootProviders(pi: ExtensionAPI): Promise<void> {
	const config = loadConfig();
	let catalog: BuiltCatalog = readCache() ?? { openai: [], anthropic: [] };
	try {
		catalog = await loadCatalog(config, true);
	} catch (error) {
		const message = error instanceof CatalogError || error instanceof Error ? error.message : String(error);
		console.error(`pi-bifrost: live catalog unavailable (${message}); using cache`);
	}
	registerProviders(pi, catalog, config);

	pi.on("session_start", async () => {
		try {
			const next = await loadCatalog(loadConfig(), true);
			registerProviders(pi, next, loadConfig());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`pi-bifrost: session refresh failed (${message})`);
		}
	});

	pi.registerCommand("bifrost-refresh", {
		description: "Refetch the Bifrost catalog and reregister providers",
		handler: async (_args: string, ctx: { ui: { notify: (message: string, kind: string) => void } }) => {
			const next = await loadCatalog(loadConfig(), true);
			registerProviders(pi, next, loadConfig());
			ctx.ui.notify(`Bifrost: ${allModels(next).length} models`, "info");
		},
	});
}
