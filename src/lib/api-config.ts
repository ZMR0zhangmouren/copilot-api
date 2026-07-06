import { randomUUID } from "node:crypto"

import type { State } from "./state"

export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
})

const COPILOT_VERSION = "0.26.7"
const EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`
const USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`

const API_VERSION = "2025-04-01"

export const copilotBaseUrl = (state: State) => {
  if (state.gheHost) {
    // 优先级: --ghe-copilot-base > token 响应中的 endpoints.api > 默认推导
    return (
      state.gheCopilotBase
      ?? state.copilotApiEndpoint
      ?? `https://copilot-api.${state.gheHost}`
    )
  }
  return state.accountType === "individual" ?
    "https://api.githubcopilot.com"
  : `https://api.${state.accountType}.githubcopilot.com`
}
export const copilotHeaders = (state: State, vision: boolean = false) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${state.copilotToken}`,
    "content-type": standardHeaders()["content-type"],
    "copilot-integration-id": "vscode-chat",
    "editor-version": `vscode/${state.vsCodeVersion}`,
    "editor-plugin-version": EDITOR_PLUGIN_VERSION,
    "user-agent": USER_AGENT,
    "openai-intent": "conversation-panel",
    "x-github-api-version": API_VERSION,
    "x-request-id": randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
  }

  if (vision) headers["copilot-vision-request"] = "true"

  return headers
}

export const githubApiBaseUrl = (state: State) =>
  state.gheHost ? `https://${state.gheHost}/api/v3` : "https://api.github.com"

/** @deprecated 使用 githubApiBaseUrl(state) 替代 */
export const GITHUB_API_BASE_URL = "https://api.github.com"
export const githubHeaders = (state: State) => ({
  ...standardHeaders(),
  authorization: `token ${state.githubToken}`,
  "editor-version": `vscode/${state.vsCodeVersion}`,
  "editor-plugin-version": EDITOR_PLUGIN_VERSION,
  "user-agent": USER_AGENT,
  "x-github-api-version": API_VERSION,
  "x-vscode-user-agent-library-version": "electron-fetch",
})

export const githubBaseUrl = (state: State) =>
  state.gheHost ? `https://${state.gheHost}` : "https://github.com"

/** @deprecated 使用 githubBaseUrl(state) 替代 */
export const GITHUB_BASE_URL = "https://github.com"
export const githubClientId = (state: State) =>
  state.gheClientId ?? "Iv1.b507a08c87ecfe98"

/** @deprecated 使用 githubClientId(state) 替代 */
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"
export const GITHUB_APP_SCOPES = ["read:user"].join(" ")
