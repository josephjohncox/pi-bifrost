import { describe, expect, test } from "bun:test";
import { buildCatalog } from "../src/catalog.ts";
import { parseConfig } from "../src/config.ts";
import type { BifrostRecord } from "../src/types.ts";

function rec(partial: Partial<BifrostRecord> & { id: string }): BifrostRecord {
	return partial;
}

describe("overrides", () => {
	test("modelOverrides beat vendor defaults; exclude drops a record", () => {
		const records = [
			rec({ id: "bedrock/grok-4-6", alias: "us-gov.xai.grok-4.6", name: "Grok 4 6" }),
			rec({ id: "skip/me", name: "Skip" }),
		];
		const catalog = buildCatalog(
			records,
			parseConfig({
				exclude: ["skip/*"],
				models: {
					"bedrock/grok-4-6": { input: ["text"], maxTokens: 99 },
				},
			}),
		);
		expect(catalog.openai).toHaveLength(1);
		expect(catalog.openai[0]?.input).toEqual(["text"]);
		expect(catalog.openai[0]?.maxTokens).toBe(99);
		expect(catalog.openai[0]?.api).toBe("openai-responses");
	});
});
