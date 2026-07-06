import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
  type Message,
} from "~/services/copilot/create-chat-completions"

// OpenAI Responses API 请求格式 → Chat Completions 格式转换
function toChatCompletionsPayload(body: ResponsesRequest): ChatCompletionsPayload {
  const messages: Message[] = []

  // instructions → system message
  if (body.instructions) {
    messages.push({ role: "system", content: body.instructions })
  }

  // input → user/assistant messages
  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input })
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item })
      } else {
        messages.push(item as Message)
      }
    }
  }

  return {
    model: body.model,
    messages,
    max_tokens: body.max_output_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop,
    stream: body.stream,
  }
}

// Chat Completions 响应 → Responses API 响应格式转换
function toResponsesResponse(
  chatResponse: ChatCompletionResponse,
  model: string,
): ResponsesResponse {
  const choice = chatResponse.choices[0]
  const content = choice?.message?.content ?? ""

  return {
    id: chatResponse.id,
    object: "response",
    model,
    output: [
      {
        type: "message",
        id: `msg_${chatResponse.id}`,
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: content,
          },
        ],
      },
    ],
    usage: chatResponse.usage ?
      {
        input_tokens: chatResponse.usage.prompt_tokens,
        output_tokens: chatResponse.usage.completion_tokens,
        total_tokens: chatResponse.usage.total_tokens,
      }
    : undefined,
  }
}

export async function handleResponses(c: Context) {
  await checkRateLimit(state)

  const body = await c.req.json<ResponsesRequest>()
  consola.debug("Responses API request:", JSON.stringify(body).slice(-400))

  const payload = toChatCompletionsPayload(body)

  const selectedModel = state.models?.data.find((m) => m.id === payload.model)

  if (state.manualApprove) await awaitApproval()

  if (isNullish(payload.max_tokens)) {
    payload.max_tokens = selectedModel?.capabilities.limits.max_output_tokens
  }

  const response = await createChatCompletions(payload)

  if ("choices" in response) {
    // 非 streaming 响应
    const result = toResponsesResponse(response, body.model)
    return c.json(result)
  }

  // Streaming 模式
  return streamSSE(c, async (stream) => {
    for await (const chunk of response) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "response.output_text.delta",
          delta: (chunk as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content ?? "",
        }),
      })
    }
    await stream.writeSSE({
      data: JSON.stringify({ type: "response.completed" }),
    })
  })
}

// OpenAI Responses API types (minimal)
interface ResponsesRequest {
  model: string
  input: string | Array<string | { role: string; content: string }>
  instructions?: string
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string | string[]
  stream?: boolean
}

interface ResponsesResponse {
  id: string
  object: "response"
  model: string
  output: Array<{
    type: "message"
    id: string
    status: "completed" | "in_progress"
    role: "assistant"
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
