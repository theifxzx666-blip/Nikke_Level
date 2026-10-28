/**
 * Pinkuro → NIKKE 战力计算器 中转（Vercel Serverless Function · Node.js 运行时）
 *
 * 为什么需要它：pinkuro.top:9984 的响应不带任何 Access-Control-Allow-* 头，
 * 而请求必须携带自定义头 X-API-KEY（必然触发预检），浏览器因此拒收响应。
 * 中转做三件事：放行指定来源的 CORS、替你带上 X-API-KEY 去请求、把结果原样送回。
 *
 * 为什么不用 Cloudflare Workers：Workers 部署后会忽略自定义端口，
 * fetch('https://pinkuro.top:9984/...') 会被改写成 443（该端口不通）。
 *
 * 安全约定：
 *   - Key 只从请求头读取，不打印、不写入任何持久化存储。
 *   - 仅放行白名单 Origin（你的计算器站点与本机地址），其它站点拿不到响应体。
 *   - 仅允许 GET；上游超时 20 秒。
 */

const UPSTREAM =
  process.env.PINKURO_UPSTREAM ||
  "https://pinkuro.top:9984/api/nikke/public/combat/import";

/** 允许调用本中转的前端来源 */
const ALLOW = new Set([
  "https://theifxzx666-blip.github.io",
  "http://127.0.0.1:8785",
  "http://localhost:8785",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

function corsHeaders(origin) {
  const ok = !!origin && ALLOW.has(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-API-KEY, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

module.exports = async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  Object.keys(cors).forEach((k) => res.setHeader(k, cors[k]));
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ success: false, message: "method not allowed" });
    return;
  }

  const key = req.headers["x-api-key"];
  if (!key || typeof key !== "string") {
    res.status(400).json({ success: false, message: "missing X-API-KEY" });
    return;
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "GET",
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
    res.send(body);
  } catch (err) {
    // 只回固定文案：绝不把 key 或上游原始报错里的敏感信息带出去
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    res.status(timedOut ? 504 : 502).json({
      success: false,
      message: timedOut ? "upstream timeout" : "upstream unreachable",
    });
  }
};
