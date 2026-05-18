# Operations

## Cache Headers

Inspect:

```text
X-Cache: HIT-L1 | HIT-KV | MISS | STALE
X-Cache-Key: ghcard:v1:...
```

Meaning:

- `HIT-L1`: Cloudflare edge Cache API hit.
- `HIT-KV`: KV fresh hit and L1 was refilled in the background.
- `MISS`: GitHub upstream request was needed.
- `STALE`: stale KV response was returned while refresh was attempted in the background.

## TTLs

```text
repo metadata: fresh 6h, stale 7d
contents metadata: fresh 24h, stale 14d
commits latest-by-path: fresh 1h, stale 7d
avatar: fresh 7d, stale 30d
404: fresh 10m, stale 1d
403/429/5xx: no long-term write, stale fallback first
```

## Invalidate All Cache

Bump:

```jsonc
"CACHE_NAMESPACE_VERSION": "v2"
```

This changes every cache key prefix and leaves old KV entries to expire naturally.

## Handle GitHub 403 Or 429

1. Confirm `GITHUB_TOKEN` is configured.
2. Check `X-Upstream-RateLimit-Remaining` and `X-Upstream-RateLimit-Reset`.
3. Confirm KIRARI is not repeatedly requesting uncached random refs.
4. If stale responses exist, users should receive `X-Cache: STALE`.

## Temporarily Disable Origin Allowlist

Set:

```jsonc
"ALLOWED_ORIGINS": ""
```

Redeploy. This returns `Access-Control-Allow-Origin: *`.

## Add Prewarm Targets

Set `PUBLIC_BASE_URL` before using `repo:` targets:

```jsonc
"PUBLIC_BASE_URL": "https://ghcard-cache.example.com/api/github"
```

Edit:

```jsonc
"PREWARM_TARGETS": "repo:saicaca/fuwari,content:saicaca/fuwari:README.md,commits:saicaca/fuwari:README.md,avatar:saicaca"
```

Cron runs every six hours by default.
