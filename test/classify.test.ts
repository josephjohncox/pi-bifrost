import { describe, expect, test } from "bun:test";
import { defaultInput, defaultReasoning, thinkingLevelMap, vendorOf, wireApi } from "../src/classify.ts";
import { defaultModel } from "../src/defaults.ts";

describe("vendorOf", () => {
	test("reads alias after region strip", () => {
		expect(vendorOf({ id: "bedrock/grok-4-6", alias: "us-gov.xai.grok-4.6" })).toBe("xai");
		expect(vendorOf({ id: "bedrock_mantle/claude-sonnet-5", alias: "anthropic.claude-sonnet-5" })).toBe("anthropic");
		expect(vendorOf({ id: "bedrock_mantle/gpt-5.6-terra", alias: "openai.gpt-5.6-terra" })).toBe("openai");
	});

	test("reads non-platform id prefix when alias is missing", () => {
		expect(vendorOf({ id: "openai/gpt-6-astra" })).toBe("openai");
		expect(vendorOf({ id: "openai/gpt-6-sol" })).toBe("openai");
	});

	test("reads dotted vendor inside a platform id", () => {
		expect(vendorOf({ id: "bedrock_mantle/nvidia.nemotron-nano-12b-v2" })).toBe("nvidia");
	});
});

describe("wireApi is vendor-based, not version-based", () => {
	test("anthropic → /anthropic messages", () => {
		expect(wireApi({ id: "bedrock_mantle/claude-opus-5-5", alias: "anthropic.claude-opus-5-5" })).toBe(
			"anthropic-messages",
		);
	});

	test("openai and xai → /v1 responses, including future ids", () => {
		expect(wireApi({ id: "openai/gpt-7-whatever" })).toBe("openai-responses");
		expect(wireApi({ id: "bedrock/grok-5", alias: "xai.grok-5" })).toBe("openai-responses");
	});

	test("other vendors → /v1 completions", () => {
		expect(wireApi({ id: "bedrock_mantle/nvidia.nemotron-super-3-120b" })).toBe("openai-completions");
		expect(wireApi({ id: "bedrock_mantle/google.gemma-4-31b" })).toBe("openai-completions");
	});
});

describe("catalog fields win over guesses", () => {
	test("windows come from the record", () => {
		const model = defaultModel({
			id: "openai/gpt-6-sol",
			normalized_name: "Gpt 6 Sol",
			context_length: 1_050_000,
			max_output_tokens: 128_000,
		});
		expect(model.contextWindow).toBe(1_050_000);
		expect(model.maxTokens).toBe(128_000);
		expect(model.api).toBe("openai-responses");
	});

	test("explicit reasoning and image modalities win", () => {
		expect(defaultReasoning({ id: "x", reasoning: false })).toBe(false);
		expect(defaultInput({ id: "x", architecture: { input_modalities: ["text", "image"] } })).toEqual([
			"text",
			"image",
		]);
		expect(defaultInput({ id: "bedrock_mantle/nvidia.nemotron-nano-12b-v2" })).toEqual(["text"]);
	});
});

describe("thinkingLevelMap", () => {
	test("openai exposes native max and xhigh; ultra is not an API value", () => {
		const gpt = thinkingLevelMap({ id: "openai/gpt-6-sol" });
		expect(gpt?.xhigh).toBe("xhigh");
		expect(gpt?.max).toBe("max");
		expect(Object.values(gpt ?? {})).not.toContain("ultra");
	});

	test("xai aliases max to xhigh", () => {
		const grok = thinkingLevelMap({ id: "bedrock/grok-4-6", alias: "xai.grok-4.6" });
		expect(grok?.xhigh).toBe("xhigh");
		expect(grok?.max).toBe("xhigh");
	});

	test("anthropic exposes native xhigh and max", () => {
		const map = thinkingLevelMap({
			id: "bedrock_mantle/claude-sonnet-5",
			alias: "anthropic.claude-sonnet-5",
		});
		expect(map?.xhigh).toBe("xhigh");
		expect(map?.max).toBe("max");
	});
});
