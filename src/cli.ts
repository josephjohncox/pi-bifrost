#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildCatalog, CatalogError, fetchRecords } from "./catalog.ts";
import { loadConfig } from "./config.ts";
import {
	acquireLock,
	applyZedSettings,
	atomicWrite,
	formatPiList,
	piDocument,
	readJsonFile,
	releaseLock,
} from "./sync-files.ts";

function arg(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(name);
	if (index < 0) return undefined;
	return argv[index + 1];
}

function has(argv: string[], name: string): boolean {
	return argv.includes(name);
}

async function main(argv: string[]): Promise<number> {
	const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "sync";
	const rest = command === argv[0] ? argv.slice(1) : argv;
	if (command === "help" || has(rest, "--help") || has(rest, "-h")) {
		process.stdout.write(`pi-bifrost [sync|list|zed] [--dry-run] [--config PATH] [--models-file PATH] [--settings-file PATH]\n`);
		return 0;
	}

	const config = loadConfig(arg(rest, "--config"));
	if (arg(rest, "--url")) config.modelsUrl = arg(rest, "--url")!;
	if (arg(rest, "--api-key")) config.apiKey = arg(rest, "--api-key")!;

	const records = await fetchRecords(config);
	const catalog = buildCatalog(records, config);

	if (command === "list" || has(rest, "--list")) {
		process.stdout.write(`${formatPiList(catalog)}\n`);
		return 0;
	}

	if (command === "zed") {
		const settings =
			arg(rest, "--settings-file") ??
			config.zed?.settingsFile ??
			join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "zed/settings.json");
		const lock = acquireLock(settings);
		try {
			const source = readFileSync(settings, "utf8");
			const next = applyZedSettings(source, catalog, config);
			if (has(rest, "--dry-run")) {
				process.stdout.write(`Would update ${settings}: ${catalog.openai.length + catalog.anthropic.length} models\n`);
				return 0;
			}
			atomicWrite(settings, next);
			process.stdout.write(`Updated ${settings}\n`);
			return 0;
		} finally {
			releaseLock(lock);
		}
	}

	const modelsFile = arg(rest, "--models-file") ?? join(homedir(), ".pi/agent/models.json");
	const lock = acquireLock(modelsFile);
	try {
		const existing = readJsonFile(modelsFile);
		const next = piDocument(existing, catalog, config, arg(rest, "--api-key"));
		const rendered = `${JSON.stringify(next, null, 2)}\n`;
		if (has(rest, "--dry-run")) {
			process.stdout.write(
				`Would update ${modelsFile}: ${catalog.openai.length} openai + ${catalog.anthropic.length} anthropic\n`,
			);
			return 0;
		}
		atomicWrite(modelsFile, rendered);
		process.stdout.write(
			`Updated ${modelsFile}: ${catalog.openai.length} openai + ${catalog.anthropic.length} anthropic\n`,
		);
		return 0;
	} finally {
		releaseLock(lock);
	}
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error) => {
		const message = error instanceof CatalogError || error instanceof Error ? error.message : String(error);
		process.stderr.write(`pi-bifrost: ${message}\n`);
		process.exit(1);
	},
);
