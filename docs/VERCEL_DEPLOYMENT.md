# Vercel 免费版部署

轻量同源代理方案。默认不使用外部存储、Vercel KV、Upstash、Supabase 或任何付费 add-on。Hobby 计划可用。

## 部署模式

| 模式 | `/ghc/*` 位置 | 浏览器路径 | 适用场景 |
|------|--------------|-----------|----------|
| **同项目 adapter** | KIRARI Vercel 项目 | 同源 `/ghc/*` | KIRARI 生产部署在 Vercel（推荐） |
| **独立 Vercel 项目** | 本仓库独立导入 Vercel | 独立项目 URL `/ghc/*` | 测试或非 KIRARI 集成 |

## 请求链路

```
# 同项目 adapter
Browser → KIRARI Vercel /ghc/*
  → 同项目 Vercel Function (api/ghc/[...path].ts)
    → GitHub API

# 独立项目
Browser → standalone GHC /ghc/*
  → Vercel Function → GitHub API
```

## 独立项目部署

### 1. 导入 Vercel

使用 README 顶部 **Deploy with Vercel** 按钮，或手动导入本仓库。

### 2. `vercel.json` Rewrite

```json
{
  "rewrites": [
    { "source": "/ghc", "destination": "/api/ghc/healthz" },
    { "source": "/ghc/:path*", "destination": "/api/ghc/:path*" }
  ]
}
```

### 3. Function 入口

```
api/ghc/[...path].ts
  → import { handleVercelRequest } from "../../src/vercel"
```

## GitHub Actions 部署

| Secret | 必需 | 用途 |
|--------|------|------|
| `VERCEL_TOKEN` | ✅ | CI 中 Vercel CLI 部署 |
| `VERCEL_ORG_ID` | 可选 | 指定已有 Vercel team/user scope |
| `VERCEL_PROJECT_ID` | 可选 | 指定已有 Vercel project |

缺失 `VERCEL_TOKEN` 时 workflow 执行 install → type-check → test，跳过 deploy。

## 环境变量

配置位置：`Vercel Project → Settings → Environment Variables`

| 变量 | 必需 | 示例 | 用途 |
|------|------|------|------|
| `GITHUB_TOKEN` | 推荐 | `github_pat_...` | 匿名 60 → 5,000 req/h |
| `GHC_ALLOWED_ORIGINS` | 否 | `https://ex.com,http://localhost:4321` | CORS 白名单 |
| `CACHE_NAMESPACE_VERSION` | 否 | `v1` | Runtime Cache key 版本 |

> `GHC_ALLOWED_ORIGINS` 未设时回退到 `ALLOWED_ORIGINS`。Vercel 变量不配置到 Cloudflare 或 GitHub Actions。

## KIRARI 同项目配置

```toml
[githubCard]
apiBase = "/ghc"

[githubCard.adapter]
enabled = true
provider = "vercel"
route = "/ghc"
```

启用后 KIRARI 构建时生成 `api/ghc/[...path].ts`。关闭 adapter 后移除该文件，回退到 `https://api.github.com`。

## 缓存行为

| 资源 | `s-maxage` | `stale-while-revalidate` |
|------|-----------|--------------------------|
| Repo metadata | 6 h | 7 d |
| Contents | 24 h | 14 d |
| Latest commit | 1 h | 7 d |
| Avatar | 7 d | 30 d |
| 404 | 10 min | 1 d |

`@vercel/functions` Runtime Cache 可用时自动启用（动态 import，缺失时静默回退）。不可用时退化为纯 HTTP cache headers + 直连 upstream。

> **Vercel 路径无持久 stale fallback**。需要 GitHub 故障期间仍有缓存响应时，使用 [Cloudflare 部署](CLOUDFLARE_DEPLOYMENT.md)。

## 验证

| 检查项 | 预期 |
|--------|------|
| `/ghc/healthz` | `{"ok":true,"runtime":"vercel"}` |
| `/ghc/repos/saicaca/fuwari` | repo JSON |
| `/ghc/avatar/saicaca?size=96` | 头像图片 |
| Browser Network | 请求走 `/ghc/*`，无 `api.github.com` |
| 响应 header | 存在 `X-Cache` |

## 免费版边界

| 项目 | 默认 Vercel 路径 |
|------|------------------|
| Vercel KV | 不使用 |
| Upstash / Supabase | 不使用 |
| Vercel Firewall / Deployment Protection | 不使用 |
| Custom domain | 不需要 |
| KV 级别持久 stale cache | 不保证 |
| Function 最大执行时间 | 300s (Hobby) |

---

**官方参考**：
- [Vercel Deploy Button](https://vercel.com/docs/deployments/deploy-button)
- [Vercel Rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel Functions Duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [@vercel/functions](https://www.npmjs.com/package/@vercel/functions)
