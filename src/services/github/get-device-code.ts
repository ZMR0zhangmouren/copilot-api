import {
  GITHUB_APP_SCOPES,
  githubBaseUrl,
  githubClientId,
  standardHeaders,
} from "~/lib/api-config"
import { state } from "~/lib/state"
import { HTTPError } from "~/lib/error"

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(`${githubBaseUrl(state)}/login/device/code`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify({
      client_id: githubClientId(state),
      scope: GITHUB_APP_SCOPES,
    }),
  })

  if (!response.ok) throw new HTTPError("Failed to get device code", response)

  return (await response.json()) as DeviceCodeResponse
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}
