/**
 * Pinkuro → NIKKE 战力计算器 中转（Netlify Functions · CommonJS handler 格式）
 *
 * 为什么用老格式而不是 v2 的 `export default` + config.path：
 *   手动部署（CLI --functions）下 v2 的自定义 path 不保证注册成功，实测 /api/relay 会 404。
 *   老格式 + public/_redirects 的组合是稳定可用的。
 *
 * 为什么需要中转：pinkuro.top:9984 的响应不带任何 Access-Control-Allow-* 头，
 * 而请求必须带自定义头 X-API-KEY（必然触发浏览器预检），页面因此读不到响应体。
 *
 * 安全约定：Key 只从请求头读出后原样转发，不打印、不落库；仅放行白名单 Origin；仅 GET。
 */

const UPSTREAM = "https://pinkuro.top:9984/api/nikke/public/combat/import";

const ALLOW = new Set([
  "https://theifxzx666-blip.github.io",
  "http://127.0.0.1:8785",
  "http://localhost:8785",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

function cors(origin) {
  const ok = !!origin && ALLOW.has(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-API-KEY, Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  };
}

const reply = (statusCode, payload, h) => ({
  statusCode,
  headers: { ...h, "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "";
  const h = cors(origin);
  const method = (event.httpMethod || "GET").toUpperCase();

  if (method === "OPTIONS") return { statusCode: 204, headers: h, body: "" };
  if (method !== "GET") return reply(405, { success: false, message: "method not allowed" }, h);

  const key = headers["x-api-key"] || headers["X-API-KEY"] || "";
  if (!key) return reply(400, { success: false, message: "missing X-API-KEY" }, h);

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "GET",
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        ...h,
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      },
      body,
    };
  } catch (err) {
    // 只回固定文案：绝不把 Key 或上游原始报错带出去
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return reply(
      timedOut ? 504 : 502,
      { success: false, message: timedOut ? "upstream timeout" : "upstream unreachable" },
      h
    );
  }
};
