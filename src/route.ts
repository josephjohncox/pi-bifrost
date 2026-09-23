import { vendorOf, wireApi } from "./classify.ts";
import type { ApiKind, PiModel } from "./types.ts";

export function routeApi(model: Pick<PiModel, "id" | "api" | "name">): ApiKind {
	if (model.api === "anthropic-messages" || model.api === "openai-responses" || model.api === "openai-completions") {
		return model.api;
	}
	return wireApi({ id: model.id, alias: undefined, name: model.name });
}

export function endpointFor(api: ApiKind, baseUrl: string): string {
	const root = baseUrl.replace(/\/$/, "").replace(/\/v1$/, "").replace(/\/anthropic$/, "");
	if (api === "anthropic-messages") return `${root}/anthropic`;
	return `${root}/v1`;
}

export function gatewayRoot(baseUrl: string): string {
	return baseUrl.replace(/\/$/, "").replace(/\/v1$/, "").replace(/\/anthropic$/, "");
}

export { vendorOf };
