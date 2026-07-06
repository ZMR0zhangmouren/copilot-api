import { Hono } from "hono"

import { handleResponses } from "./handler"

export const responsesRoutes = new Hono().post("/", handleResponses)
