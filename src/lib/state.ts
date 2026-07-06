import type { ModelsResponse } from "~/services/copilot/get-models"

export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  /** GitHub Enterprise Server 域名（如 avepoint.ghe.com）。设置后所有 API 请求指向 GHE */
  gheHost?: string
  /** GHE 上的 OAuth App Client ID（仅 GHE 模式需要） */
  gheClientId?: string
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
