#!/usr/bin/env node

import { defineCommand } from "citty"
import consola from "consola"

import { PATHS, ensurePaths } from "./lib/paths"
import { state } from "./lib/state"
import { setupGitHubToken } from "./lib/token"

interface RunAuthOptions {
  verbose: boolean
  showToken: boolean
  gheHost?: string
  gheClientId?: string
  gheCopilotBase?: string
}

export async function runAuth(options: RunAuthOptions): Promise<void> {
  if (options.verbose) {
    consola.level = 5
    consola.info("Verbose logging enabled")
  }

  state.showToken = options.showToken

  if (options.gheHost) {
    state.gheHost = options.gheHost
    state.gheClientId = options.gheClientId
    state.gheCopilotBase = options.gheCopilotBase
    consola.info(`Using GitHub Enterprise Server: ${options.gheHost}`)
  }

  await ensurePaths()
  await setupGitHubToken({ force: true })
  consola.success("GitHub token written to", PATHS.GITHUB_TOKEN_PATH)
}

export const auth = defineCommand({
  meta: {
    name: "auth",
    description: "Run GitHub auth flow without running the server",
  },
  args: {
    verbose: {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Enable verbose logging",
    },
    "show-token": {
      type: "boolean",
      default: false,
      description: "Show GitHub token on auth",
    },
    "ghe-host": {
      type: "string",
      description:
        "GitHub Enterprise Server hostname (e.g., avepoint.ghe.com)",
    },
    "ghe-client-id": {
      type: "string",
      description:
        "OAuth App Client ID for GHE device flow",
    },
    "ghe-copilot-base": {
      type: "string",
      description:
        "Copilot API base URL for GHE. Default: https://<ghe-host>/github-copilot",
    },
  },
  run({ args }) {
    return runAuth({
      verbose: args.verbose,
      showToken: args["show-token"],
      gheHost: args["ghe-host"],
      gheClientId: args["ghe-client-id"],
      gheCopilotBase: args["ghe-copilot-base"],
    })
  },
})
