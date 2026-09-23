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

Private repo: `git@github.com:josephjohncox/pi-bifrost.git`

```bash
cd vendor/pi-bifrost
bun install
ln -sfn "$(pwd)" ~/.pi/agent/extensions/pi-bifrost
```

Or `pi install /absolute/path/to/pi-bifrost`.

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

## CLI (optional, for models.json / Zed)

```bash
pi-bifrost list
pi-bifrost sync
pi-bifrost zed
```

If this provider is loaded, drop the `models` arrays from `models.json` or they replace the live list.
