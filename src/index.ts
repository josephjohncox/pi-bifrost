import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bootProviders } from "./provider.ts";

export default async function piBifrost(pi: ExtensionAPI): Promise<void> {
	await bootProviders(pi);
}

export { buildCatalog, fetchRecords } from "./catalog.ts";
export { loadConfig } from "./config.ts";
export { vendorOf, wireApi } from "./classify.ts";
export { routeApi } from "./route.ts";
