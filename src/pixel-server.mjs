import http from "node:http";
import { recordOpen } from "./tracking.mjs";
export const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
export function pixelHandler({ tracking, persist, enabled = () => true }) {
  return async (req, res) => {
    const match = /^\/o\/([\w-]{43})\.gif$/.exec(req.url || "");
    if (!["GET", "HEAD"].includes(req.method) || !match) {
      res.writeHead(404); return res.end();
    }
    if (req.method === "GET") {
      try {
        if (recordOpen(tracking, match[1], enabled())) await persist();
      } catch {
        tracking.pixelWriteNeeded = true;
        tracking.worker.pixelStorage = { status: "Needs attention", message: "Open event persistence failed; retry pending" };
      }
    }
    res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": PIXEL.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private", "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(req.method === "HEAD" ? undefined : PIXEL);
  };
}
export function startPixelServer(options, env = process.env) {
  if (env.FC_OPEN_TRACKING_ENABLED !== "1" || env.FC_OPEN_TRACKING_CONSENT !== "1") return null;
  const port = Number(env.FC_PIXEL_PORT || 4319);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    options.tracking.worker.pixel = { status: "Needs configuration", message: "Pixel port must be between 1 and 65535" };
    return null;
  }
  const server = http.createServer(pixelHandler(options));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on("error", () => { options.tracking.worker.pixel = { status: "Needs attention", message: "Pixel listener could not start" }; });
  try { server.listen(port, env.FC_PIXEL_HOST || "127.0.0.1"); }
  catch { options.tracking.worker.pixel = { status: "Needs configuration", message: "Invalid pixel listener configuration" }; return null; }
  return server;
}
