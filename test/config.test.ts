import { describe, expect, test } from "bun:test";
import { parseConfig, rootUrl } from "../src/config.ts";

describe("models.json config", () => {
	test("reads connection from providers.bifrost", () => {
		const config = parseConfig({
			providers: {
				bifrost: {
					baseUrl: "https://gateway.example/v1",
					apiKey: "$BIFROST_API_KEY",
					headers: { "x-bf-mcp-include-tools": "" },
					exclude: ["internal/*"],
					modelOverrides: {
						"skip/me": { exclude: true },
					},
				},
				"bifrost-anthropic": {
					baseUrl: "https://gateway.example/anthropic",
					apiKey: "$BIFROST_API_KEY",
				},
			},
		});
		expect(config.baseUrl).toBe("https://gateway.example");
		expect(config.modelsUrl).toBe("https://gateway.example/v1/models");
		expect(config.apiKey).toBe("$BIFROST_API_KEY");
		expect(config.exclude).toEqual(["internal/*"]);
		expect(config.models["skip/me"]?.exclude).toBe(true);
	});

	test("flat objects still parse for tests and --config", () => {
		const config = parseConfig({ baseUrl: "https://gateway.example/v1", apiKey: "x" });
		expect(config.baseUrl).toBe("https://gateway.example");
		expect(config.apiKey).toBe("x");
	});

	test("rootUrl strips both wire suffixes", () => {
		expect(rootUrl("https://gateway.example/v1")).toBe("https://gateway.example");
		expect(rootUrl("https://gateway.example/anthropic")).toBe("https://gateway.example");
	});
});
