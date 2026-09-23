# pi-bifrost

Native Pi model provider for a Bifrost gateway.

Routing is by **vendor prefix** from `alias` (`anthropic.claude-…`, `us-gov.xai.grok-…`) or a non-platform `id` (`openai/gpt-6-sol`). No version regexes. New GPT/Grok/Claude ids inherit the vendor wire.

| Vendor | Endpoint | API |
|---|---|---|
| `anthropic` | `{gateway}/anthropic` | `anthropic-messages` |
| `openai`, `xai` | `{gateway}/v1` | `openai-responses` |
| everything else | `{gateway}/v1` | `openai-completions` |

`/v1` is the OpenAI-compatible surface. Anthropic does not go there. The provider `baseUrl` is the gateway root; each model sets its own path.

## Install

```bash
pi install npm:@josephjohncox/pi-bifrost
```

Or clone and link:

```bash
git clone https://github.com/josephjohncox/pi-bifrost.git
cd pi-bifrost && bun install
ln -sfn "$(pwd)" ~/.pi/agent/extensions/pi-bifrost
```

Connection lives in `~/.pi/agent/models.json` — same file Pi already uses. Do not add a `models` array; that replaces the live catalog. Overrides use `modelOverrides`:

```json
{
  "providers": {
    "bifrost": {
      "baseUrl": "https://bifrost.example",
      "api": "openai-completions",
      "apiKey": "$BIFROST_API_KEY",
      "headers": { "x-bf-mcp-include-tools": "" },
      "exclude": ["internal/*"],
      "modelOverrides": {
        "vendor/some-id": { "input": ["text"] }
      }
    }
  }
}
```

Last good catalog is cached at `~/.pi/agent/bifrost-catalog.json` (ids/metadata only).

## Session refresh

On factory load and every `session_start` (`startup` / `reload` / `new` / `resume` / `fork`) the provider refetches and reregisters. `/bifrost-refresh` does the same on demand.

## Defaults (`src/defaults.ts`)

- `x-bf-mcp-include-tools: ""` on every request
- `nemotron-nano-12b-v2` is text-only
- `models.json` `modelOverrides` / `exclude` always win

## CLI

```bash
pi-bifrost list
pi-bifrost sync
pi-bifrost zed
```

`sync` only touches `~/.pi/agent/models.json` connection fields. If this provider is loaded, do not put a `models` array on `providers.bifrost`.

## Zed

`pi-bifrost zed` writes Zed's **own** LLM providers (Agent / inline model picker). It is not ACP and not the Pi TUI.

It updates `~/.config/zed/settings.json`:

| Key | Endpoint |
|---|---|
| `language_models.openai_compatible["Bifrost - OpenAI"]` | `{gateway}/v1` |
| `language_models.anthropic_compatible["Bifrost - Anthropic"]` | `{gateway}/anthropic` |

Each `available_models` row gets `max_tokens` (context), `max_output_tokens` (generation cap), and wire capabilities from the live catalog.

Thinking in Zed's UI is a settings flag, not a catalog field:

- OpenAI-compatible: Zed hides thinking unless `reasoning_effort` is **not** `none`. This writer sets `"high"` for reasoning models. That is a single default effort, not Pi's `xhigh` / `max` ladder.
- Anthropic-compatible: set `"mode": { "type": "adaptive" }` or Zed treats the model as non-thinking. Haiku 3 is left without a mode.

The command also refreshes any existing openai/anthropic-compatible entry that already points at the same gateway URL (or has no URL yet), so leftover aliases stay in sync.

Reload Zed after `pi-bifrost zed`. Pick **Bifrost - OpenAI** or **Bifrost - Anthropic** in the model dropdown.
