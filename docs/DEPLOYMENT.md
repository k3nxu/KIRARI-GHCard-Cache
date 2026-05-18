# Deployment

## Install

```bash
pnpm install
pnpm cf:types
```

## KV

Create production and preview namespaces:

```bash
pnpm wrangler kv namespace create GITHUB_CACHE
pnpm wrangler kv namespace create GITHUB_CACHE --preview
```

Copy the returned `id` and `preview_id` into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "GITHUB_CACHE",
    "id": "<production-kv-id>",
    "preview_id": "<preview-kv-id>"
  }
]
```

## GitHub Token

The Worker can run without a token, but production should configure one to reduce anonymous rate-limit pressure:

```bash
pnpm wrangler secret put GITHUB_TOKEN
```

Use a fine-grained PAT or GitHub App token with the minimum public repository read metadata access needed for card rendering.

## Origin Allowlist

Set `ALLOWED_ORIGINS` in `wrangler.jsonc`:

```jsonc
"ALLOWED_ORIGINS": "https://example.com,https://www.example.com,http://localhost:4321"
```

Leave it empty for open CORS during local testing.

## Custom Domain

Production should use a custom domain, for example:

```text
https://ghcard-cache.example.com/api/github
```

`workers.dev` is acceptable for validation, but a custom domain is easier to keep stable for KIRARI and easier to protect with Cloudflare WAF and Rate Limiting.

## Public Base URL

Set `PUBLIC_BASE_URL` to the deployed Worker API base before enabling repo prewarm targets:

```jsonc
"PUBLIC_BASE_URL": "https://ghcard-cache.example.com/api/github"
```

This prevents cron-prewarmed repo JSON from caching placeholder avatar URLs.

## Deploy

```bash
pnpm type-check
pnpm test
pnpm cf:check
pnpm deploy:dry
pnpm deploy
```

## Logs

```bash
pnpm wrangler tail
```
