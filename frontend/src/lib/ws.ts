// frontend/src/lib/ws.ts
// Build a websocket URL based on current location and prefix with '/api'
export function getWsUrl(path: string): string {
  const loc = window.location;
  const isHttps = loc.protocol === "https:";
  const proto = isHttps ? "wss" : "ws";
  const host = loc.host; // includes port
  const p = path.startsWith("/") ? path : `/${path}`;
  // Ensure '/api' prefix for nginx/vite proxy
  const fullPath = p.startsWith("/api") ? p : `/api${p}`;
  return `${proto}://${host}${fullPath}`;
}
