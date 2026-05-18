# KIRARI Integration Plan

This Worker is independent from KIRARI. KIRARI integration should be done later as a small configuration-driven change.

## Goal

Move KIRARI GitHub cards from direct browser requests to `api.github.com` and GitHub avatar domains to the Worker endpoint:

```toml
[githubCard]
apiBase = "https://ghcard-cache.example.com/api/github"
```

## Files To Change In KIRARI

```text
kirari.config.toml
src/utils/config-loader.ts
src/plugins/rehype-component-github-card.mjs
src/plugins/rehype-component-github-file-card.mjs
README.md
```

## Config Design

Add:

```toml
[githubCard]
apiBase = "https://ghcard-cache.example.com/api/github"
```

Production should prefer a custom domain. A `workers.dev` endpoint can be used for temporary validation:

```toml
[githubCard]
apiBase = "https://kirari-ghcard-cache.<account>.workers.dev/api/github"
```

Default:

```text
https://api.github.com
```

Normalize the value by removing trailing slashes before use.

## Plugin Changes

Repo card:

```js
fetch(`${githubCardApiBase}/repos/${repo}`)
```

File card:

```js
fetch(`${githubCardApiBase}/repos/${repo}`)
fetch(`${githubCardApiBase}/repos/${repo}/contents/${encodedFilePath}${refQuery}`)
fetch(`${githubCardApiBase}/repos/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=1${commitRefQuery}`)
```

No KIRARI avatar-specific change is required. The Worker rewrites `owner.avatar_url` in repo JSON to `/api/github/avatar/:owner?size=96`.

## Documentation Changes

Update KIRARI README and `kirari.config.toml` comments with:

- Default direct GitHub API behavior.
- Worker acceleration option.
- Worker deployment project URL.
- Rollback instructions.

## Rollback

Set:

```toml
[githubCard]
apiBase = "https://api.github.com"
```

Or remove the block to return to the default.

## Acceptance Criteria

- `::github{repo="owner/repo"}` displays repository data.
- `::githubfile{repo="owner/repo" file="README.md"}` displays repository, file, and latest commit data.
- Browser Network no longer shows `api.github.com` when Worker config is enabled.
- Avatar requests use `/api/github/avatar/...`.
- View Transition card initialization still works after route changes.
- Worker response includes `X-Cache: HIT-L1`, `HIT-KV`, `MISS`, or `STALE`.
- KIRARI checks pass: `pnpm type-check`, `pnpm astro check`, `pnpm build`.
