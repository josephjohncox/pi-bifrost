import type { ApiKind, BifrostRecord, InputModality, ThinkingLevelMap } from "./types.ts";

const REGION = /^(us-gov|us|eu|apac)\./;
const PLATFORMS = new Set(["bedrock", "bedrock_mantle"]);

/** Vendors whose Bifrost wire is Anthropic Messages on /anthropic. */
const ANTHROPIC = new Set(["anthropic"]);

/** Vendors whose Bifrost wire is OpenAI Responses on /v1. New GPT/Grok ids inherit this. */
const RESPONSES = new Set(["openai", "xai"]);

/** Vendors whose models commonly accept images. Others stay text unless the catalog says otherwise. */
const VISION = new Set(["anthropic", "openai", "xai", "google"]);

/** Vendors whose current lineup is reasoning-capable when the catalog omits the flag. */
const REASONING = new Set(["anthropic", "openai", "xai"]);

export function normalizedAlias(record: Pick<BifrostRecord, "alias">): string {
	return String(record.alias ?? "").replace(REGION, "");
}

/** Vendor from alias first (`anthropic.claude-…`, `us-gov.xai.grok-…`), then id (`openai/gpt-6-sol`). */
export function vendorOf(record: Pick<BifrostRecord, "id" | "alias">): string | undefined {
	const alias = normalizedAlias(record);
	if (alias.includes(".")) {
		const head = alias.split(".")[0];
		if (head && !PLATFORMS.has(head)) return head.toLowerCase();
	}
	const parts = String(record.id).split("/");
	const first = parts[0]?.toLowerCase();
	if (first && !PLATFORMS.has(first)) return first;
	const rest = parts.slice(1).join("/");
	if (rest.includes(".")) {
		const head = rest.split(".")[0];
		if (head && !PLATFORMS.has(head)) return head.toLowerCase();
	}
	return undefined;
}

export function isAnthropic(record: Pick<BifrostRecord, "id" | "alias">): boolean {
	return ANTHROPIC.has(vendorOf(record) ?? "");
}

export function wireApi(record: Pick<BifrostRecord, "id" | "alias">): ApiKind {
	const vendor = vendorOf(record);
	if (vendor && ANTHROPIC.has(vendor)) return "anthropic-messages";
	if (vendor && RESPONSES.has(vendor)) return "openai-responses";
	return "openai-completions";
}

export function defaultInput(record: BifrostRecord): InputModality[] {
	const modalities = record.architecture?.input_modalities;
	if (Array.isArray(modalities)) {
		return modalities.some((value) => String(value).toLowerCase() === "image") ? ["text", "image"] : ["text"];
	}
	const vendor = vendorOf(record);
	if (vendor && VISION.has(vendor)) return ["text", "image"];
	return ["text"];
}

export function defaultReasoning(record: BifrostRecord): boolean {
	if (typeof record.reasoning === "boolean") return record.reasoning;
	const vendor = vendorOf(record);
	return Boolean(vendor && REASONING.has(vendor));
}

/**
 * Pi hides `xhigh` and `max` unless the map has an explicit non-null entry.
 * Other levels are shown unless we set them to null. Do not omit the top of the ladder.
 * OpenAI `reasoning.effort` is none|minimal|low|medium|high|xhigh|max.
 * `ultra` is not an API value (Bifrost 400). Anthropic has native `max`. xAI has no `max`; alias it to `xhigh`.
 */
const THINKING: Record<string, ThinkingLevelMap> = {
	openai: {
		off: "none",
		minimal: "minimal",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "max",
	},
	xai: {
		off: "none",
		minimal: "low",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "xhigh",
	},
	anthropic: {
		off: "off",
		minimal: "low",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "xhigh",
		max: "max",
	},
};

export function thinkingLevelMap(record: BifrostRecord): ThinkingLevelMap | undefined {
	const vendor = vendorOf(record);
	if (!vendor) return undefined;
	const map = THINKING[vendor];
	return map ? { ...map } : undefined;
}
