import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

import type { ChatCompletionsPayload } from "./create-chat-completions"

/** Chat Completions 格式 → Responses API 格式 */
function toResponsesPayload(
  payload: ChatCompletionsPayload,
): ResponsesRequest {
  const systemMsg = payload.messages.find((m) => m.role === "system")
  const otherMsgs = payload.messages.filter((m) => m.role !== "system")

  const input: ResponsesInputItem[] = otherMsgs.map((m) => {
    if (m.role === "tool") {
      return {
        type: "function_call_output",
        call_id: m.tool_call_id ?? "",
        output: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        type: "function_call",
        id: m.tool_calls[0]?.id ?? "",
        name: m.tool_calls[0]?.function?.name ?? "",
        arguments: m.tool_calls[0]?.function?.arguments ?? "",
      }
    }
    return {
      type: "message",
      role: m.role as "user" | "assistant" | "developer",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }
  })

  return {
    model: payload.model,
    input,
    instructions: typeof systemMsg?.content === "string" ? systemMsg.content : undefined,
    max_output_tokens: payload.max_tokens ?? undefined,
    temperature: payload.temperature ?? undefined,
    top_p: payload.top_p ?? undefined,
    stream: payload.stream ?? false,
  }
}

/** 直接调用 Copilot 的 /responses 端点 */
export const createResponses = async (payload: ChatCompletionsPayload) => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const responsesPayload = toResponsesPayload(payload)

  const enableVision = payload.messages.some(
    (x) =>
      typeof x.content !== "string"
      && x.content?.some((x) => x.type === "image_url"),
  )

  const headers: Record<string, string> = {
    ...copilotHeaders(state, enableVision),
    "X-Initiator":
      payload.messages.some((msg) => ["assistant", "tool"].includes(msg.role)) ?
        "agent"
      : "user",
  }

  const url = `${copilotBaseUrl(state)}/responses`
  consola.debug("Calling Copilot /responses:", url)

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(responsesPayload),
  })

  if (!response.ok) {
    const cloned = response.clone()
    const errorBody = await cloned.text().catch(() => "<unreadable>")
    consola.error("Failed to create responses. Status:", response.status)
    consola.error("Response body:", errorBody.slice(0, 1000))
    throw new HTTPError(
      `Failed to create responses: ${errorBody.slice(0, 200)}`,
      response,
    )
  }

  if (responsesPayload.stream) {
    return response
  }

  return (await response.json()) as ResponsesApiResponse
}

// === Responses API types ===

interface ResponsesRequest {
  model: string
  input: ResponsesInputItem[]
  instructions?: string
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
}

type ResponsesInputItem =
  | { type: "message"; role: "user" | "assistant" | "developer"; content: string }
  | { type: "function_call"; id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string }

interface ResponsesApiResponse {
  id: string
  object: "response"
  model: string
  output: Array<{
    type: "message"
    id: string
    status: string
    role: string
    content: Array<{
      type: "output_text"
      text: string
    }>
  }>
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}
