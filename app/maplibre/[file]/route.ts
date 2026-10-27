import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Serves MapLibre's web worker and the shared module it imports. MapLibre 6
 * starts its worker from a URL, and the bundler does not emit that file, so
 * the map component points `setWorkerUrl` here. Reading from node_modules
 * keeps the worker on the same version as the main bundle.
 */
const FILES = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await params
  if (!FILES.has(file)) {
    return new Response("Not found", { status: 404 })
  }

  const source = await readFile(
    path.join(process.cwd(), "node_modules", "maplibre-gl", "dist", file),
    "utf8"
  )
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
