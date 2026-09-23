import { describe, expect, test } from "bun:test";
import { endpointFor, routeApi } from "../src/route.ts";

describe("routeApi", () => {
	test("explicit api wins", () => {
		expect(routeApi({ id: "bedrock/claude-sonnet-5", name: "Claude", api: "openai-completions" })).toBe(
			"openai-completions",
		);
	});

	test("endpoints split openai vs anthropic", () => {
		expect(endpointFor("anthropic-messages", "https://bifrost.example")).toBe("https://bifrost.example/anthropic");
		expect(endpointFor("openai-responses", "https://bifrost.example")).toBe("https://bifrost.example/v1");
		expect(endpointFor("openai-completions", "https://bifrost.example/v1")).toBe("https://bifrost.example/v1");
	});
});
