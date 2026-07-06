# Copilot API Proxy

> 将 GitHub Copilot API 代理为 OpenAI / Anthropic 兼容接口，支持 **GitHub Enterprise Server（GHE）**。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 项目概述

本项目复刻自 [copilot-api](https://github.com/ericc-ch/copilot-api)，并增强了 **GHE 支持**。

它是一个 GitHub Copilot API 的反向代理，将其暴露为与 OpenAI 和 Anthropic 兼容的服务。你可以用任何支持 OpenAI Chat Completions API 或 Anthropic Messages API 的工具来使用 GitHub Copilot，包括驱动 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)。

### 与上游的区别

| 功能 | 上游 (ericc-ch/copilot-api) | 本 Fork |
|------|---------------------------|---------|
| github.com 支持 | ✅ | ✅ |
| GHE 支持 | ❌ | ✅ `--ghe-host` |
| Copilot API 自动发现 | — | ✅ 从 token 响应动态获取 |
| `/responses` 端点 | ❌ | ✅ 自动降级 |
| gpt-5.x 模型 | ❌ | ✅ 自动切换端点 |

## 功能特性

- **OpenAI 兼容**：`/v1/chat/completions`、`/v1/models`、`/v1/embeddings`、`/v1/responses`
- **Anthropic 兼容**：`/v1/messages`、`/v1/messages/count_tokens`
- **GitHub Enterprise Server**：通过 `--ghe-host` 连接自托管 GHE 实例
- **Claude Code 集成**：一键生成 Claude Code 配置命令（`--claude-code`）
- **用量仪表盘**：Web 界面查看 Copilot API 用量和配额
- **速率限制**：`--rate-limit` + `--wait` 防止请求过快
- **手动审批**：`--manual` 逐个审批 API 请求
- **Token 可见性**：`--show-token` 调试时显示 token
- **灵活认证**：交互式或直接提供 GitHub token

## 环境要求

- **Bun** (>= 1.2.x)
- GitHub 账号并已订阅 Copilot（个人/商业/企业版均可）
- GHE 模式下需要公司 GitHub Enterprise Server 账号

## 快速开始

### 安装

```powershell
# 安装 Bun（Windows PowerShell）
powershell -c "irm bun.sh/install.ps1 | iex"

# 安装依赖
bun install
```

### github.com 模式

```powershell
# 开发模式
bun run dev

# 生产模式
bun run start
```

首次运行会提示通过 Device Code 进行 GitHub 认证——在浏览器打开提示的 URL 并输入验证码即可。

### GHE 模式（公司自托管）

```powershell
# 启动（以 XX公司 为例，替换为你的公司域名）
bun run ./src/main.ts start --ghe-host=xxxx.ghe.com

# 仅认证（不启动服务）
bun run ./src/main.ts auth --ghe-host=xxxx.ghe.com

# 使用自定义 OAuth App Client ID
bun run ./src/main.ts start --ghe-host=company.ghe.com --ghe-client-id=Iv1.xxxxx
```

首次运行同样走 Device Code 认证流程，但目标 URL 会自动切换到你的 GHE 实例。

## GHE 工作原理

### URL 自动切换

当设置 `--ghe-host` 后，所有 GitHub API URL 会自动替换：

| 原始 URL | GHE 模式 |
|----------|----------|
| `https://github.com` | `https://<你的域名>` |
| `https://api.github.com` | `https://<你的域名>/api/v3` |
| `https://api.githubcopilot.com` | 从 token 响应的 `endpoints.api` 自动获取 |

### Copilot API 自动发现

GHE 的 Copilot API endpoint 不是固定路径，而是从 token 响应中动态解析：

```json
// GET /copilot_internal/v2/token 返回
{
  "endpoints": {
    "api": "https://copilot-api.xxxx.ghe.com",
    "proxy": "https://copilot-proxy.xxxx.ghe.com"
  },
  "token": "..."
}
```

无需手动猜测路径，任何 GHE 实例都能自动适配。

### 模型端点自动降级

部分模型（gpt-5.5、gpt-5.4 等）需要 `/responses` 端点而非 `/chat/completions`。代理会自动检测并切换：

```
用户请求 gpt-5.5
  → 尝试 /chat/completions
  → 收到 "not accessible via /chat/completions"
  → 自动转换格式，重试 /responses
  → 将 Responses 格式响应转回 Chat Completions 格式
```

整个过程对客户端透明，无需任何配置。

## 模型兼容性

基于实际测试结果（GHE 实例：xxxx.ghe.com）：

### ✅ 完全可用

| Vendor | 模型 |
|--------|------|
| **Azure OpenAI** | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4, gpt-3.5-turbo, gpt-5-mini 及所有子版本 |
| **Google** | gemini-2.5-pro, gemini-3-flash-preview, gemini-3.1-pro-preview, gemini-3.5-flash |
| **OpenAI** | gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex（自动降级到 /responses） |
| **Experimental** | trajectory-compaction |

### ❌ 暂不可用

| Vendor | 模型 | 原因 |
|--------|------|------|
| **Microsoft** | mai-code-1-flash-picker | 需要特殊端点 |
| **Azure OpenAI** | gpt-41-copilot | type=completion，需要 /completions 端点 |

> **注意**：Claude 模型（Opus、Sonnet 等）是 VS Code Copilot 编辑器内置的，不走 Copilot REST API，因此本代理无法暴露这些模型。

## 命令行选项

### start 命令

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--port`, `-p` | 监听端口 | `4141` |
| `--verbose`, `-v` | 详细日志 | `false` |
| `--account-type`, `-a` | 账号类型 (individual/business/enterprise) | `individual` |
| `--manual` | 手动审批每个请求 | `false` |
| `--rate-limit`, `-r` | 请求间隔（秒） | 无限制 |
| `--wait`, `-w` | 触发限速时等待而非报错 | `false` |
| `--github-token`, `-g` | 直接提供 GitHub token | — |
| `--claude-code`, `-c` | 生成 Claude Code 配置命令 | `false` |
| `--show-token` | 显示 GitHub/Copilot token | `false` |
| `--proxy-env` | 从环境变量读取代理设置 | `false` |
| `--ghe-host` | GHE 域名（如 `xxxx.ghe.com`） | — |
| `--ghe-client-id` | GHE OAuth App Client ID | — |
| `--ghe-copilot-base` | 覆盖 GHE Copilot API 地址 | 自动检测 |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /v1/chat/completions` | POST | OpenAI Chat Completions 兼容 |
| `POST /v1/responses` | POST | OpenAI Responses API 兼容 |
| `GET /v1/models` | GET | 获取可用模型列表 |
| `POST /v1/embeddings` | POST | 文本嵌入 |
| `POST /v1/messages` | POST | Anthropic Messages 兼容 |
| `POST /v1/messages/count_tokens` | POST | Token 计数 |
| `GET /usage` | GET | Copilot 用量统计 |
| `GET /token` | GET | 当前 Copilot token |

## 与 Claude Code 集成

### 方式一：交互式配置

```powershell
bun run ./src/main.ts start --claude-code --ghe-host=xxxx.ghe.com
```

按提示选择模型后，命令会自动复制到剪贴板。

### 方式二：手动配置

在项目根目录创建 `.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_AUTH_TOKEN": "dummy",
    "ANTHROPIC_MODEL": "gpt-4.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-4.1",
    "ANTHROPIC_SMALL_FAST_MODEL": "gpt-5-mini",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-5-mini",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "permissions": {
    "deny": ["WebSearch"]
  }
}
```

### 方式三：环境变量

```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:4141"
$env:ANTHROPIC_AUTH_TOKEN="dummy"
$env:ANTHROPIC_MODEL="gpt-4.1"
claude
```

## 开发

```powershell
# 安装依赖
bun install

# 开发模式（热重载）
bun run dev

# 构建
bun run build

# 测试
bun test

# Lint
bun run lint

# 类型检查
bun run typecheck
```

## 使用技巧

- 避免触发速率限制：
  - `--manual`：手动审批，完全控制请求频率
  - `--rate-limit 30`：至少间隔 30 秒
  - `--wait`：配合 `--rate-limit`，等待冷却而非报错
- GHE 模式下 Token 会缓存在 `~/.local/share/copilot-api/github_token`，下次启动无需重新认证
- 如果 Token 失效，代理会自动降级到 Device Code 流程重新认证

## 常见问题

**Q: GHE 模式下提示 "Bad credentials"？**
A: 这是 github.com 的缓存 token 与 GHE 不匹配。运行 `bun run ./src/main.ts auth --ghe-host=xxx.ghe.com` 重新认证即可。

**Q: Copilot API 404？**
A: Copilot API endpoint 从 token 响应自动获取。如果自动检测失败，使用 `--ghe-copilot-base` 手动指定。

**Q: 为什么没有 Claude 模型？**
A: Claude 模型（Opus、Sonnet 等）是 VS Code Copilot 编辑器层面集成的，不通过 Copilot REST API 暴露，因此无法通过本代理使用。

**Q: 支持哪些模型？**
A: 参见上方 [模型兼容性](#模型兼容性) 表格。Azure OpenAI 和 Google 模型通过 `/chat/completions`，OpenAI 新模型通过自动降级到 `/responses`。

## 致谢

- 原始项目：[ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api)
- GHE 适配贡献：通过分析 token 响应中的 `endpoints.api` 字段实现自动端点发现

## 许可

MIT License — 详见 [LICENSE](LICENSE)
