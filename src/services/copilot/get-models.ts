import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

export const getModels = async () => {
  const url = `${copilotBaseUrl(state)}/models`
  consola.debug(`Fetching models from: ${url}`)

  const response = await fetch(url, {
    headers: copilotHeaders(state),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable>")
    consola.error(`Models response (${response.status}):`, body.slice(0, 500))
    throw new HTTPError("Failed to get models", response)
  }

  const text = await response.text()
  try {
    return JSON.parse(text) as ModelsResponse
  } catch {
    consola.error(`Failed to parse models JSON. URL: ${url}`)
    consola.error(`Raw response (first 500 chars):`, text.slice(0, 500))
    throw new Error(`Failed to parse models JSON from ${url}`)
  }
}

export interface ModelsResponse {
  data: Array<Model>
  object: string
}

interface ModelLimits {
  max_context_window_tokens?: number
  max_output_tokens?: number
  max_prompt_tokens?: number
  max_inputs?: number
}

interface ModelSupports {
  tool_calls?: boolean
  parallel_tool_calls?: boolean
  dimensions?: boolean
}

interface ModelCapabilities {
  family: string
  limits: ModelLimits
  object: string
  supports: ModelSupports
  tokenizer: string
  type: string
}

export interface Model {
  capabilities: ModelCapabilities
  id: string
  model_picker_enabled: boolean
  name: string
  object: string
  preview: boolean
  vendor: string
  version: string
  policy?: {
    state: string
    terms: string
  }
}
