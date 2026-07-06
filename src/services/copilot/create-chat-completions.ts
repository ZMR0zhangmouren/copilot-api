import consola from "consola"
import { events } from "fetch-event-stream"

import { copilotHeaders, copilotBaseUrl } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

import { createResponses } from "./create-responses"

export const createChatCompletions = async (
  payload: ChatCompletionsPayload,
) => {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const response = await callChatCompletionsApi(payload)

  if (!response.ok) {
    const cloned = response.clone()
    const errorBody = await cloned.text().catch(() => "<unreadable>")

    // 模型不走 /chat/completions，自动降级到 /responses
    if (errorBody.includes("not accessible via the /chat/completions endpoint")) {
      consola.info(
        `Model ${payload.model} requires /responses endpoint, retrying...`,
      )
      return fallbackToResponses(payload)
    }

    consola.error("Failed to create chat completions. Status:", response.status)
    consola.error("Response body:", errorBody.slice(0, 1000))
    throw new HTTPError(
      `Failed to create chat completions: ${errorBody.slice(0, 200)}`,
      response,
    )
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as ChatCompletionResponse
}

/** 直接调用 /chat/completions（不含降级逻辑） */
async function callChatCompletionsApi(payload: ChatCompletionsPayload) {
  const enableVision = payload.messages.some(
    (x) =>
      typeof x.content !== "string"
      && x.content?.some((x) => x.type === "image_url"),
  )

  const isAgentCall = payload.messages.some((msg) =>
    ["assistant", "tool"].includes(msg.role),
  )

  const headers: Record<string, string> = {
    ...copilotHeaders(state, enableVision),
    "X-Initiator": isAgentCall ? "agent" : "user",
  }

  return fetch(`${copilotBaseUrl(state)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
}

/** 降级到 /responses 端点，并将响应转回 Chat Completions 格式 */
async function fallbackToResponses(
  payload: ChatCompletionsPayload,
): Promise<ChatCompletionResponse | AsyncGenerator> {
  const response = await createResponses(payload)

  if (payload.stream && response instanceof Response) {
    // Streaming: 将 Responses SSE → Chat Completions SSE
    return transformResponsesStream(response, payload.model)
  }

  // Non-streaming: 转换 JSON 格式
  const data = response as {
    id: string
    model: string
    output?: Array<{
      content?: Array<{ text?: string }>
    }>
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
    created_at?: number
  }
  const text =
    data.output?.[0]?.content?.[0]?.text ?? ""

  return {
    id: data.id,
    object: "chat.completion",
    created: data.created_at ?? Math.floor(Date.now() / 1000),
    model: data.model ?? payload.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        logprobs: null,
        finish_reason: "stop",
      },
    ],
    usage: data.usage ?
      {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.total_tokens,
      }
    : undefined,
  }
}

/** 将 Responses API 的 SSE 流转换为 Chat Completions 的 SSE 流 */
async function* transformResponsesStream(
  response: Response,
  model: string,
): AsyncGenerator<{ data: string }> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""
  let id = ""
  let contentAccum = ""

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6))
            const eventType = event.type

            if (eventType === "response.created" && event.response) {
              id = event.response.id
            } else if (eventType === "response.output_text.delta") {
              contentAccum += event.delta ?? ""
              yield {
                data: JSON.stringify({
                  id: id || "resp-fallback",
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: event.delta ?? "" },
                      finish_reason: null,
                      logprobs: null,
                    },
                  ],
                }),
              }
            } else if (eventType === "response.completed") {
              // Final chunk
              yield {
                data: JSON.stringify({
                  id: id || "resp-fallback",
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: "stop",
                      logprobs: null,
                    },
                  ],
                }),
              }
              yield { data: "[DONE]" }
            }
          } catch {
            // skip non-JSON lines (event: headers, etc.)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Streaming types

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<Choice>
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens: number
    }
    completion_tokens_details?: {
      accepted_prediction_tokens: number
      rejected_prediction_tokens: number
    }
  }
}

interface Delta {
  content?: string | null
  role?: "user" | "assistant" | "system" | "tool"
  tool_calls?: Array<{
    index: number
    id?: string
    type?: "function"
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

interface Choice {
  index: number
  delta: Delta
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null
  logprobs: object | null
}

// Non-streaming types

export interface ChatCompletionResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: Array<ChoiceNonStreaming>
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens: number
    }
  }
}

interface ResponseMessage {
  role: "assistant"
  content: string | null
  tool_calls?: Array<ToolCall>
}

interface ChoiceNonStreaming {
  index: number
  message: ResponseMessage
  logprobs: object | null
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter"
}

// Payload types

export interface ChatCompletionsPayload {
  messages: Array<Message>
  model: string
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  stop?: string | Array<string> | null
  n?: number | null
  stream?: boolean | null

  frequency_penalty?: number | null
  presence_penalty?: number | null
  logit_bias?: Record<string, number> | null
  logprobs?: boolean | null
  response_format?: { type: "json_object" } | null
  seed?: number | null
  tools?: Array<Tool> | null
  tool_choice?:
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } }
    | null
  user?: string | null
}

export interface Tool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool" | "developer"
  content: string | Array<ContentPart> | null

  name?: string
  tool_calls?: Array<ToolCall>
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type ContentPart = TextPart | ImagePart

export interface TextPart {
  type: "text"
  text: string
}

export interface ImagePart {
  type: "image_url"
  image_url: {
    url: string
    detail?: "low" | "high" | "auto"
  }
}
