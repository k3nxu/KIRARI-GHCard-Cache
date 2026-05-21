# 部署入口

先根据 KIRARI 托管平台选择路径，再阅读对应平台文档。

## 平台选择

| KIRARI 托管 | 推荐 | 缓存 | 文档 |
|------------|------|------|------|
| Cloudflare Pages | 私有 Worker + Service Binding | Cache API + KV + stale | [Cloudflare 部署](CLOUDFLARE_DEPLOYMENT.md) |
| Vercel | 同项目 Vercel Function | HTTP Cache + 可选 Runtime Cache | [Vercel 部署](VERCEL_DEPLOYMENT.md) |
| 纯静态（无运行时 route） | 不启用 adapter，直连 GitHub | 无缓存 | [KIRARI 对接](KIRARI_INTEGRATION.md) |

## 变量归属总表

| 变量 | 属于 | 配置位置 | 不要配置在 |
|------|------|----------|-----------|
| `GITHUB_TOKEN` | 缓存代理运行时 | Cloudflare Worker Secret / Vercel Env | GitHub Actions YAML、`kirari.config.toml`、任何仓库文件 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions CI | GitHub Repository Secrets | Worker Secret、Vercel、KIRARI |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions CI | GitHub Repository Secrets | Worker Secret、Vercel、KIRARI |
| `VERCEL_TOKEN` | GitHub Actions CI | GitHub Repository Secrets | Cloudflare、KIRARI |
| `ALLOWED_ORIGINS` | Cloudflare Worker | `wrangler.jsonc` vars / Worker env | KIRARI 配置 |
| `GHC_ALLOWED_ORIGINS` | Vercel Function | Vercel Project Env | Cloudflare |
| `PUBLIC_BASE_URL` | Cloudflare cron prewarm | `wrangler.jsonc` vars | KIRARI 配置 |
| `PREWARM_TARGETS` | Cloudflare cron prewarm | `wrangler.jsonc` vars | KIRARI 配置 |

## CI 权限（Cloudflare 路径）

容易混淆的两个 token：

| Token | 所属上下文 | 用途 |
|-------|-----------|------|
| `GITHUB_TOKEN` | Worker 运行时 | Worker 请求 GitHub API |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions CI | CI 中的 Wrangler 部署 Worker |

`CLOUDFLARE_API_TOKEN` 所需权限：

| 场景 | API 权限（reference 名称） | Scope | 必需 |
|------|---------------------------|-------|------|
| `wrangler deploy` | Workers Scripts Write | Account | ✅ |
| 自动创建/复用 KV namespace | Workers KV Storage Write | Account | ✅ |
| 管理 Worker route / custom domain | Workers Routes Write | Zone | 可选 |

> 默认私有 Service Binding 方案**不需要** zone-level route 和 Worker custom domain。

## 验证命令

```bash
# Cloudflare 路径
pnpm install
pnpm cf:types && pnpm cf:config-check && pnpm type-check && pnpm test && pnpm deploy:dry

# Vercel 路径
pnpm install && pnpm type-check && pnpm test
```

## 官方参考

- [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare API Token 权限](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Vercel Rewrites](https://vercel.com/docs/routing/rewrites)
