import {
	anthropicMessagesApi,
	openAICompletionsApi,
	openAIResponsesApi,
	type AssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
	type TranscriptContext,
} from "@earendil-works/pi-ai/compat";
import { endpointFor, routeApi } from "./route.ts";
import type { ApiKind } from "./types.ts";

export function streamBifrost(
	model: Model,
	context: TranscriptContext,
	options: SimpleStreamOptions | undefined,
	baseUrl: string,
	headers: Record<string, string>,
): AssistantMessageEventStream {
	const api = routeApi({ id: model.id, name: model.name, api: model.api as ApiKind | undefined });
	const routed = {
		...model,
		api,
		baseUrl: endpointFor(api, baseUrl),
		headers,
	};
	if (api === "anthropic-messages") {
		return anthropicMessagesApi().streamSimple(routed as Model<"anthropic-messages">, context, options);
	}
	if (api === "openai-responses") {
		return openAIResponsesApi().streamSimple(routed as Model<"openai-responses">, context, options);
	}
	return openAICompletionsApi().streamSimple(routed as Model<"openai-completions">, context, options);
}
