import { getApiConfig } from "./env"

/**
 * Minimal HTTP client for the Tediware platform API.
 *
 * Responsibilities kept deliberately small: attach the base URL and auth
 * header, speak JSON, respect a 429 `Retry-After`, time out hung requests,
 * retry a read that got no answer, and normalize failures into TediwareError.
 * No retry framework, no queue.
 */

export class TediwareError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string
  ) {
    super(message)
    this.name = "TediwareError"
  }
}

const MAX_RATE_LIMIT_RETRIES = 3

// Every request this app makes is a read, so one that got no answer (a
// dropped connection, a timeout) is safe to repeat. A first sync makes
// thousands of them, and one blip should not stop it.
const NETWORK_RETRY_DELAYS_MS = [2_000, 10_000]

// A hung request must fail rather than hold a sync run open indefinitely.
const REQUEST_TIMEOUT_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Retry-After is seconds or an HTTP date; return a delay in ms, capped. */
function retryAfterMs(header: string | null): number {
  if (!header) return 1000
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000)
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.min(date - Date.now(), 60_000))
  }
  return 1000
}

/**
 * Performs a request against the platform API. Attaches auth, retries on 429
 * up to a small bound while honoring Retry-After, retries a GET that got no
 * answer twice, and throws TediwareError on network failure. Returns the raw
 * Response for the caller to interpret.
 *
 * Any other failure ends the sync run; the next run starts again from the
 * last saved cursor.
 */
export async function apiRequest(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { baseUrl, apiKey } = getApiConfig()
  const url = `${baseUrl}${path}`

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Key ${apiKey}`)
  headers.set("Accept", "application/json")
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const method = (init.method ?? "GET").toUpperCase()
  let networkFailures = 0
  let rateLimited = 0

  for (;;) {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      const delay = NETWORK_RETRY_DELAYS_MS[networkFailures++]
      if (method === "GET" && !init.signal && delay !== undefined) {
        await sleep(delay)
        continue
      }
      const message =
        cause instanceof Error && cause.name === "TimeoutError"
          ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s`
          : (cause as Error).message
      throw new TediwareError(`Request to ${url} failed: ${message}`)
    }

    if (response.status === 429 && rateLimited++ < MAX_RATE_LIMIT_RETRIES) {
      await sleep(retryAfterMs(response.headers.get("Retry-After")))
      continue
    }
    return response
  }
}

/** GET a JSON resource, throwing TediwareError on any non-2xx. */
export async function apiGetJson<T = unknown>(path: string): Promise<T> {
  const response = await apiRequest(path, { method: "GET" })
  const text = await response.text()
  if (!response.ok) {
    throw new TediwareError(
      `GET ${path} returned ${response.status}` +
        (errorMessageFromBody(text) ? `: ${errorMessageFromBody(text)}` : ""),
      response.status,
      text
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new TediwareError(
      `GET ${path} returned a non-JSON body`,
      response.status,
      text
    )
  }
}

/**
 * The human message out of a platform error body. Errors under /platform are
 * nested: `{"error": {"message", "code", "reason"?}}`. Null when the body is
 * not that shape.
 */
export function errorMessageFromBody(
  body: string | null | undefined
): string | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown; code?: unknown }
    }
    const message = parsed.error?.message ?? parsed.error?.code
    return typeof message === "string" && message.trim() !== "" ? message : null
  } catch {
    return null
  }
}
