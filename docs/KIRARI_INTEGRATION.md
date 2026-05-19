# KIRARI 对接指南

本指南说明 KIRARI 如何调用 KIRARI-GHCard-Cache。两个仓库保持独立，不需要改成 monorepo。

## 对接模式

| 模式 | KIRARI 配置 | KIRARI 生成的 runtime route | 缓存服务 |
|------|-------------|-----------------------------|----------|
| 默认直连 GitHub | `apiBase = "https://api.github.com"` 且 adapter 关闭 | 不生成 | 无 |
| Cloudflare 私有缓存 | `apiBase = "/ghc"` 且 `provider = "cloudflare"` | `functions/ghc/[[path]].ts` | 通过 Service Binding 调用外部 `kirari-ghcard-cache` Worker |
| Vercel 同项目缓存 | `apiBase = "/ghc"` 且 `provider = "vercel"` | `api/ghc/[...path].ts` | KIRARI 同项目 Vercel Function |

## 哪个项目配置什么

| 配置项 | KIRARI | KIRARI-GHCard-Cache | 托管平台 |
|--------|--------|---------------------|----------|
| `githubCard.apiBase` | 需要，写在 `kirari.config.toml` | 不需要 | 不需要 |
| `githubCard.adapter.enabled` | 需要，写在 `kirari.config.toml` | 不需要 | 不需要 |
| `githubCard.adapter.provider` | 需要，写在 `kirari.config.toml` | 不需要 | 不需要 |
| `githubCard.adapter.route` | 需要，写在 `kirari.config.toml` | 不需要 | 不需要 |
| `githubCard.adapter.serviceBinding` | Cloudflare KIRARI 构建需要 | 不需要 | Cloudflare Pages Service Binding 名称必须一致 |
| Cloudflare 缓存用 `GITHUB_TOKEN` | 不需要 | Cloudflare Worker Secret | Cloudflare Worker |
| Vercel 同项目 adapter 用 `GITHUB_TOKEN` | 不写入配置文件 | 不需要，除非本仓库单独部署到 Vercel | Vercel Project Environment Variables |
| `CLOUDFLARE_API_TOKEN` | 不需要 | GHC 仓库 GitHub Repository Secret，仅用于 CI 部署 | GitHub Actions |
| `CLOUDFLARE_ACCOUNT_ID` | 不需要 | GHC 仓库 GitHub Repository Secret，仅用于 CI 部署 | GitHub Actions |

## 默认 KIRARI 配置

不启用 runtime cache route 时使用：

```toml
[githubCard]
apiBase = "https://api.github.com"

[githubCard.adapter]
enabled = false
provider = "none"
route = "/ghc"
serviceBinding = "GHCARD_CACHE"
```

此模式行为：

| 行为 | 结果 |
|------|------|
| 构建产物 | 不生成 `/ghc` runtime route |
| card API 请求 | 直连 `https://api.github.com` |
| KIRARI 是否需要 token | 不需要 |
| 是否需要运行时平台 | 不需要 |

## Cloudflare Pages 对接

适用于 KIRARI 部署在 Cloudflare Pages，且本仓库部署为私有 Worker。

KIRARI 配置：

```toml
[githubCard]
apiBase = "/ghc"

[githubCard.adapter]
enabled = true
provider = "cloudflare"
route = "/ghc"
serviceBinding = "GHCARD_CACHE"
```

请求链路：

```text
Browser
  -> KIRARI Pages /ghc/*
    -> generated functions/ghc/[[path]].ts
      -> Service Binding GHCARD_CACHE
        -> kirari-ghcard-cache Worker /api/github/*
          -> GitHub API
```

Cloudflare Pages Service Binding：

| 字段 | 值 |
|------|----|
| Binding type | Service binding |
| Variable name | `GHCARD_CACHE` |
| Service | `kirari-ghcard-cache` |

Dashboard 路径：

```text
Workers & Pages
-> KIRARI Pages project
-> Settings
-> Bindings
-> Add binding
-> Service binding
```

生成的 KIRARI route 行为：

| 浏览器路径 | Worker 路径 |
|------------|-------------|
| `/ghc/repos/:owner/:repo` | `/api/github/repos/:owner/:repo` |
| `/ghc/repos/:owner/:repo/contents/:path` | `/api/github/repos/:owner/:repo/contents/:path` |
| `/ghc/repos/:owner/:repo/commits` | `/api/github/repos/:owner/:repo/commits` |
| `/ghc/avatar/:owner` | `/api/github/avatar/:owner` |

生成的 Pages Function 会发送 `X-KIRARI-GHC-PUBLIC-BASE`，让 Worker 把 `owner.avatar_url` 改写为同源 `/ghc/avatar/:owner?size=96`。

Token 归属：

| Token | 配置位置 |
|-------|----------|
| `GITHUB_TOKEN` | `KIRARI-GHCard-Cache` Cloudflare Worker Secret |
| `CLOUDFLARE_API_TOKEN` | `KIRARI-GHCard-Cache` GitHub Repository Secret，仅用于 CI deploy |
| `CLOUDFLARE_ACCOUNT_ID` | `KIRARI-GHCard-Cache` GitHub Repository Secret，仅用于 CI deploy |

此模式下 KIRARI 本身不需要 `GITHUB_TOKEN`。

## Vercel 对接

适用于 KIRARI 部署在 Vercel，并希望 `/ghc/*` 由 KIRARI 自己的 Vercel Function 提供。

KIRARI 配置：

```toml
[githubCard]
apiBase = "/ghc"

[githubCard.adapter]
enabled = true
provider = "vercel"
route = "/ghc"
```

请求链路：

```text
Browser
  -> KIRARI Vercel /ghc/*
    -> generated api/ghc/[...path].ts
      -> GitHub API
```

Token 归属：

| Token | 配置位置 |
|-------|----------|
| `GITHUB_TOKEN` | KIRARI Vercel Project Environment Variables |
| `CLOUDFLARE_API_TOKEN` | 不使用 |
| `CLOUDFLARE_ACCOUNT_ID` | 不使用 |

Vercel adapter 默认使用 HTTP cache headers，不要求 Vercel KV、Upstash、Supabase、Firewall、Deployment Protection 或 custom domain。

## KIRARI 涉及文件

| 文件 | 用途 |
|------|------|
| `kirari.config.toml` | 用户配置 |
| `src/utils/config-loader.ts` | 解析并默认化 `githubCard` 配置 |
| `src/types/config.ts` | 配置类型 |
| `scripts/materialize-ghc-adapter.mjs` | 构建前创建或删除 runtime route |
| `adapters/github-card/cloudflare/route.ts.template` | Cloudflare Pages Function 模板 |
| `adapters/github-card/vercel/route.ts.template` | Vercel Function 模板 |
| `src/plugins/rehype-component-github-card.mjs` | repo card 使用 `githubCard.apiBase` |
| `src/plugins/rehype-component-github-file-card.mjs` | file card 使用 `githubCard.apiBase` |

## 回滚

KIRARI 改回：

```toml
[githubCard]
apiBase = "https://api.github.com"

[githubCard.adapter]
enabled = false
provider = "none"
```

然后重新构建 KIRARI。materializer 会删除生成的 `/ghc` runtime route。

## 验收清单

| 检查项 | 预期 |
|--------|------|
| KIRARI adapter 关闭构建 | 不生成 `functions/ghc` 或 `api/ghc` route |
| KIRARI Cloudflare 构建 | 生成 `functions/ghc/[[path]].ts` |
| KIRARI Vercel 构建 | 生成 `api/ghc/[...path].ts` |
| `::github{repo="owner/repo"}` | card 正常显示 |
| `::githubfile{repo="owner/repo" file="README.md"}` | file card 正常显示 |
| Browser Network | 请求走 `/ghc/repos/...` |
| Browser Network | 头像请求走 `/ghc/avatar/...` |
| Browser Network | card 请求不直连 `api.github.com` |
| 响应 header | 存在 `X-Cache` |

KIRARI 推荐验证命令：

```bash
pnpm type-check
pnpm astro check
pnpm build
```
