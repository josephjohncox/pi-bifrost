import { describe, expect, test } from "bun:test";
import { applyZedSettings } from "../src/sync-files.ts";
import type { PiModel } from "../src/types.ts";

const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function gpt(id: string): PiModel {
	return {
		id,
		name: id,
		api: "openai-responses",
		reasoning: true,
		input: ["text"],
		contextWindow: 1_050_000,
		maxTokens: 128_000,
		cost,
	};
}

function claude(id: string): PiModel {
	return {
		id,
		name: id,
		api: "anthropic-messages",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 1_000_000,
		maxTokens: 128_000,
		cost,
	};
}

describe("applyZedSettings", () => {
	test("writes non-none reasoning_effort and anthropic adaptive mode", () => {
		const next = applyZedSettings(
			`{"language_models":{"openai_compatible":{"Legacy Gateway":{}},"anthropic_compatible":{"Legacy Gateway":{}}}}`,
			{ openai: [gpt("openai/gpt-6-sol")], anthropic: [claude("bedrock_mantle/claude-sonnet-5")] },
			{ baseUrl: "https://bifrost.example", models: {}, exclude: [], headers: {}, apiKey: "x", modelsUrl: "", timeoutMs: 1 },
		);
		const parsed = JSON.parse(next);
		const openai = parsed.language_models.openai_compatible["Bifrost - OpenAI"].available_models[0];
		const leftover = parsed.language_models.openai_compatible["Legacy Gateway"].available_models[0];
		const claudeModel = parsed.language_models.anthropic_compatible["Bifrost - Anthropic"].available_models[0];
		expect(openai.reasoning_effort).toBe("high");
		expect(openai.capabilities.chat_completions).toBe(false);
		expect(leftover.reasoning_effort).toBe("high");
		expect(claudeModel.mode).toEqual({ type: "adaptive" });
	});

	test("haiku 3 does not get adaptive mode", () => {
		const next = applyZedSettings(
			`{"language_models":{}}`,
			{ openai: [], anthropic: [claude("bedrock/claude-3-haiku")] },
			{ baseUrl: "https://bifrost.example", models: {}, exclude: [], headers: {}, apiKey: "x", modelsUrl: "", timeoutMs: 1 },
		);
		const model = JSON.parse(next).language_models.anthropic_compatible["Bifrost - Anthropic"].available_models[0];
		expect(model.mode).toBeUndefined();
	});
});
