import type { ModelsResponse } from "~/services/copilot/get-models"

export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  /** GitHub Enterprise Server 域名（如 xxxx.ghe.com）。设置后所有 API 请求指向 GHE */
  gheHost?: string
  /** GHE 上的 OAuth App Client ID（仅 GHE 模式需要） */
  gheClientId?: string
  /** GHE Copilot API 的 base URL 覆盖（默认从 token 响应的 endpoints.api 自动获取） */
  gheCopilotBase?: string
  /** 从 Copilot token 响应中解析出的 API endpoint */
  copilotApiEndpoint?: string
  models?: ModelsResponse
  vsCodeVersion?: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
}

export const state: State = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
}
