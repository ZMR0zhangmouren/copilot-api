# 关于本 Fork

## 我们做了什么

本 Fork 在 [ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api) 的基础上，新增了 **GitHub Enterprise Server（GHE）支持**。原始项目仅支持 github.com，无法连接公司自托管的 GHE 实例（如 `xxxx.ghe.com`）。我们解决了这个问题。

## 核心改动

### 1. GHE 域名可配置（`--ghe-host`）

所有硬编码的 GitHub URL 全部改为动态函数，通过 `--ghe-host` 参数切换：

```
原始代码：GITHUB_BASE_URL = "https://github.com"         ← 硬编码常量
改动后：githubBaseUrl(state) → state.gheHost 时动态生成     ← 根据域名切换
```

涉及 8 个文件、4 个核心常量/函数：
- `GITHUB_BASE_URL` → `githubBaseUrl(state)`
- `GITHUB_API_BASE_URL` → `githubApiBaseUrl(state)`
- `GITHUB_CLIENT_ID` → `githubClientId(state)`（支持自定义 OAuth App）
- `copilotBaseUrl()` → 优先使用 token 响应自动发现的 endpoint

### 2. Copilot API 端点自动发现

GHE 的 Copilot API 不在固定路径——它是独立子域名（如 `copilot-api.xxxx.ghe.com`）。我们从 Copilot token 响应的 `endpoints.api` 字段动态获取，无需用户手动猜测：

```json
// GET /copilot_internal/v2/token 返回
{ "endpoints": { "api": "https://copilot-api.xxxx.ghe.com" } }
```

### 3. 模型端点自动降级

发现部分模型（gpt-5.5、gpt-5.4、gpt-5.3-codex 等）需要 `/responses` 端点而非 `/chat/completions`。我们实现了透明降级：

```
用户请求 gpt-5.5
  → 尝试 /chat/completions → 400 "not accessible"
  → 自动转格式，重试 /responses → 200 成功
  → 将 Responses 格式转回 Chat Completions 格式返回
```

对客户端完全透明。

### 4. Token 缓存智能处理

- 缓存 token 失效时自动降级到 Device Code 重新认证
- GHE 与 github.com 的 token 共用缓存文件，切换域名时自动适配

### 5. `/v1/responses` 端点

新增 OpenAI Responses API 兼容端点，支持使用新版 API 格式的客户端工具。

## 改动范围

| 类别 | 文件数 | 说明 |
|------|--------|------|
| 核心改造 | 8 | `api-config.ts`, `state.ts`, 6 个 service 文件 |
| CLI 入口 | 2 | `start.ts`, `auth.ts` |
| 新增端点 | 2 | `routes/responses/` |
| 新增服务 | 1 | `services/copilot/create-responses.ts` |
| 文档 | 3 | `README.md`（更新）, `README.zh-CN.md`（新建）, `ABOUT.md` |

## 使用方式

```powershell
# 安装
bun install

# GHE 模式启动
bun run ./src/main.ts start --ghe-host=你的公司.ghe.com

# 仅认证
bun run ./src/main.ts auth --ghe-host=你的公司.ghe.com
```

## 向后兼容

不传 `--ghe-host` 时，行为与上游完全一致，走 github.com。现有用户无需任何改动。

## 技术要点

- GHE 的 Copilot 架构与 github.com 一致——独立的 API 子域名，而非挂载在主域名路径下
- 所有差异化处理通过 `State` 对象统一管理，避免到处散落 `if (gheHost)` 判断
- 保持上游代码风格：`~/*` 路径别名、严格 TypeScript、ESNext 模块

## 致谢

- 原始项目：[ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api)
- 许可证：MIT
