# Cloudflare 免费版部署

完整缓存方案：Cache API (L1) + Workers KV (L2) + stale-while-revalidate + Cron Triggers。免费层可用，无需付费 add-on。

## 请求链路

```
Browser → KIRARI Pages /ghc/*
  → Pages Function (Service Binding: GHCARD_CACHE)
    → 私有 Worker kirari-ghcard-cache
      → GitHub API + Cache API + Workers KV
```

Worker 默认关闭 `workers.dev` 和 preview URL：
```jsonc
"workers_dev": false,
"preview_urls": false
```

## 前置条件

| 条件 | 说明 |
|------|------|
| Cloudflare account | 承载 Worker、KV、Pages 项目 |
| Node.js + pnpm | 本地检查与 Wrangler |
| KIRARI 部署在 Cloudflare Pages | Service Binding 需要同 account Pages 项目 |

无需 custom domain、Durable Objects、R2、D1、Queues。

---

## Step 1. 本地安装与检查

```bash
pnpm install
pnpm cf:types                  # 生成 worker-configuration.d.ts
pnpm type-check                # TypeScript 类型检查
pnpm test                      # Vitest 单元测试
pnpm deploy:dry                # Wrangler 语法校验（不实际部署）
```

## Step 2. Workers KV Namespace

GitHub Actions 自动创建/复用 `GITHUB_CACHE`，无需手动操作。本地手动部署：

```bash
pnpm wrangler kv namespace create GITHUB_CACHE
# 返回: { "success": true, "result": { "id": "abc123...", "title": "GITHUB_CACHE" } }
```

将返回的 `id` 写入 `wrangler.jsonc`：

```jsonc
"kv_namespaces": [
  {
    "binding": "GITHUB_CACHE",
    "id": "abc123..."  // ← 替换实际 ID
  }
]
```

> **`wrangler.jsonc` 中预置占位符 `<production-kv-id>`**。部署前必须替换为真实 ID，否则 Cloudflare API 返回不直观的错误。运行 `pnpm cf:prepare-config && pnpm cf:config-check` 可自动注入并验证。

## Step 3. 运行时 Secret — `GITHUB_TOKEN`

可选（生产推荐）。将匿名 60 req/h 提升至 5,000 req/h：

```bash
pnpm wrangler secret put GITHUB_TOKEN
# 交互式输入 token 值
```

| 不要放在 | 原因 |
|----------|------|
| GitHub Actions YAML | 不是 CI 部署 token |
| `kirari.config.toml` | KIRARI 不需要 |
| `wrangler.jsonc` vars | 提交到仓库的配置不适合存放 secret |

## Step 4. GitHub Actions CI Secrets

| Secret | 必需 | 用途 |
|--------|------|------|
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Wrangler 部署目标 account |
| `CLOUDFLARE_API_TOKEN` | ✅ | CI 中 Wrangler 调用 Cloudflare API |

缺失时 workflow 仍执行 install → type-check → test，跳过 deploy。

在 Cloudflare Dashboard 创建 API Token：

```
Account → API Tokens → Create Token → Custom
  → Edit Cloudflare Workers (Workers Scripts Write — Account)
  → Workers KV Storage Edit (Workers KV Storage Write — Account)
```

## Step 5. 部署 Worker

```bash
pnpm deploy
# 或 GitHub Actions: push to main / 手动触发 Deploy Worker workflow
```

## Step 6. 绑定 KIRARI Pages Service Binding

| 字段 | 值 |
|------|----|
| Type | Service binding |
| Variable name | `GHCARD_CACHE` |
| Service | `kirari-ghcard-cache` |

Dashboard 路径：`Workers & Pages → KIRARI Pages 项目 → Settings → Bindings → Add binding → Service binding`

## Step 7. KIRARI 配置

```toml
[githubCard]
apiBase = "/ghc"

[githubCard.adapter]
enabled = true
provider = "cloudflare"
route = "/ghc"
serviceBinding = "GHCARD_CACHE"
```

KIRARI 本身不需要 `GITHUB_TOKEN`。GitHub token 属于本 Worker，配置为 Cloudflare Worker Secret。

## Step 8. 验证

| 检查项 | 预期 |
|--------|------|
| `/ghc/repos/owner/repo` | 返回 repo JSON（`owner.avatar_url` 已改写） |
| `/ghc/avatar/owner?size=96` | 返回头像图片 |
| Browser Network | 无 `api.github.com` 请求 |
| Browser Network | 无 `github.com/*.png` 请求 |
| 响应 header | 存在 `X-Cache` |
| Worker 公开 URL | `*.workers.dev` 不作为生产入口 |

## 可选变量

| 变量 | 位置 | 示例 | 用途 |
|------|------|------|------|
| `ALLOWED_ORIGINS` | vars / Worker env | `https://ex.com,http://localhost:4321` | CORS 白名单 |
| `PUBLIC_BASE_URL` | vars / Worker env | `https://ex.com/ghc` | Cron prewarm avatar URL 改写 |
| `PREWARM_TARGETS` | vars / Worker env | `repo:owner/repo,avatar:owner` | Cron 预热 target 列表 |
| `CACHE_NAMESPACE_VERSION` | vars / Worker env | `v2` | 缓存 key 版本（递增批量失效） |

## 免费版边界

| 不需要 | |
|--------|---|
| Worker custom domain | ❌ |
| Cloudflare 付费 WAF / Rate Limiting | ❌ |
| Durable Objects / D1 / R2 / Queues | ❌ |
| Workers Paid plan | ❌ |

---

**官方参考**：
- [Cloudflare Workers GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare API Token 权限](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Workers KV 限制](https://developers.cloudflare.com/kv/platform/limits/)
- [Deploy to Cloudflare 按钮](https://developers.cloudflare.com/changelog/2025-04-08-deploy-to-cloudflare-button/)
