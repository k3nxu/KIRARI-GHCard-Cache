# KIRARI-GHCard-Cache

Cloudflare Worker cache proxy for KIRARI GitHub cards. It keeps KIRARI clients away from direct `api.github.com` and GitHub avatar requests, improves loading in regions where GitHub is slow or unreachable, and reduces GitHub REST API rate-limit pressure.

## Features

- GitHub repository, file metadata, latest commit, and avatar proxy endpoints.
- L1 Cloudflare Cache API plus L2 KV stale fallback.
- Optional `GITHUB_TOKEN` secret for higher GitHub REST API limits.
- Optional browser Origin allowlist.
- Optional cron prewarm targets.
- KIRARI integration guide included in `docs/KIRARI_INTEGRATION.md`.

## API

```text
GET /api/github/repos/:owner/:repo
GET /api/github/repos/:owner/:repo/contents/:path?ref=:ref
GET /api/github/repos/:owner/:repo/commits?path=:path&per_page=1&sha=:sha
GET /api/github/avatar/:owner?size=96
GET /healthz
OPTIONS *
```

The repo JSON response keeps the GitHub REST shape, but rewrites `owner.avatar_url` to this Worker:

```text
https://your-worker.example.com/api/github/avatar/:owner?size=96
```

## Quick Start

```bash
pnpm install
pnpm cf:types
pnpm type-check
pnpm test
```

Create KV namespaces:

```bash
pnpm wrangler kv namespace create GITHUB_CACHE
pnpm wrangler kv namespace create GITHUB_CACHE --preview
```

Copy the returned IDs into `wrangler.jsonc`.

Configure an optional GitHub token:

```bash
pnpm wrangler secret put GITHUB_TOKEN
```

Run locally:

```bash
pnpm dev
```

Validate and deploy:

```bash
pnpm cf:check
pnpm deploy:dry
pnpm deploy
```

## Configuration

`wrangler.jsonc` contains non-secret settings:

```jsonc
{
  "vars": {
    "CACHE_NAMESPACE_VERSION": "v1",
    "PUBLIC_BASE_URL": "",
    "ALLOWED_ORIGINS": "",
    "PREWARM_TARGETS": ""
  }
}
```

- `CACHE_NAMESPACE_VERSION`: bump this value to invalidate all cache keys.
- `PUBLIC_BASE_URL`: public Worker API base, required for repo JSON cron prewarm avatar rewriting.
- `ALLOWED_ORIGINS`: comma-separated browser Origins. Empty means `Access-Control-Allow-Origin: *`.
- `PREWARM_TARGETS`: comma-separated cron targets, for example `repo:saicaca/fuwari,content:saicaca/fuwari:README.md,commits:saicaca/fuwari:README.md,avatar:saicaca`.

Secrets must not be committed:

```bash
pnpm wrangler secret put GITHUB_TOKEN
```

## Cache Policy

```text
repo metadata: fresh 6h, stale 7d
contents metadata: fresh 24h, stale 14d
commits latest-by-path: fresh 1h, stale 7d
avatar: fresh 7d, stale 30d
404: fresh 10m, stale 1d
403/429/5xx: no long-term write, stale fallback first
```

Debug headers:

```text
X-Cache: HIT-L1 | HIT-KV | MISS | STALE
X-Cache-Key: ghcard:v1:...
X-Upstream-RateLimit-Remaining: ...
X-Upstream-RateLimit-Reset: ...
```

## KIRARI Minimal Config

After deploying this Worker, KIRARI can point GitHub cards at it:

```toml
[githubCard]
apiBase = "https://ghcard-cache.example.com/api/github"
```

Use a custom domain in production when possible. A `workers.dev` URL is fine for local validation, but a custom domain is easier to control with Cloudflare WAF, Rate Limiting, and long-term KIRARI configuration.

See `docs/KIRARI_INTEGRATION.md` for the full integration plan.

## Development Flow

1. Change Worker behavior.
2. Update `README.md`, `docs/`, and `CHANGELOG.md` in the same change.
3. Run `pnpm type-check`.
4. Run `pnpm test`.
5. Run `pnpm cf:types`.
6. Run `pnpm cf:check`.
7. Run `pnpm deploy:dry`.
8. Commit with Conventional Commits.

## FAQ

### Does this fully remove GitHub rate limits?

No. It reduces GitHub calls through caching and can raise the upstream limit with `GITHUB_TOKEN`. GitHub still enforces upstream limits.

### Is CORS allowlist real security?

No. It restricts browser calls only. Use Cloudflare WAF or Rate Limiting for abuse control.

### Why proxy avatars?

KIRARI cards otherwise still depend on GitHub avatar domains, which can be slow or unreachable in some regions.

### Why use both Cache API and KV?

Cloudflare Cache API is fast but local to a data center. KV provides a cross-region persistent fallback and stale layer.
