/**
 * Netlify 中转函数的本地自检（不联网：把 globalThis.fetch 换成 mock）
 * 被测对象：netlify/functions/relay.js（CJS exports.handler，线上跑的就是它）
 * 运行：node test_relay.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { handler } = require("./netlify/functions/relay.js");

const SITE = "https://theifxzx666-blip.github.io";
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  => " + JSON.stringify(extra) : "")); }
};

let calls = [];
let nextImpl = null;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (nextImpl) return nextImpl(url, opts);
  return new Response(JSON.stringify({ success: true, data: { cnData: { characters: [] } } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};

const ev = (method = "GET", headers = {}) => ({ httpMethod: method, headers });
const body = (r) => { try { return JSON.parse(r.body); } catch (e) { return r.body; } };

(async () => {
  console.log("== CORS 与预检 ==");
  let r = await handler(ev("OPTIONS", { origin: SITE }));
  ok("OPTIONS 返回 204", r.statusCode === 204, r.statusCode);
  ok("允许来源回显原 Origin", r.headers["Access-Control-Allow-Origin"] === SITE);
  ok("声明允许 X-API-KEY 头", /x-api-key/i.test(r.headers["Access-Control-Allow-Headers"] || ""));
  r = await handler(ev("OPTIONS", { origin: "https://evil.example" }));
  ok("白名单外来源回 null", r.headers["Access-Control-Allow-Origin"] === "null");
  r = await handler(ev("OPTIONS"));
  ok("无 Origin 时回 null", r.headers["Access-Control-Allow-Origin"] === "null");

  console.log("== 方法与鉴权 ==");
  r = await handler(ev("POST", { origin: SITE }));
  ok("POST 返回 405", r.statusCode === 405, r.statusCode);
  calls = [];
  r = await handler(ev("GET", { origin: SITE }));
  ok("缺 Key 返回 400", r.statusCode === 400, r.statusCode);
  ok("缺 Key 时不触达上游", calls.length === 0, calls.length);
  ok("缺 Key 文案正确", body(r).message === "missing X-API-KEY", body(r));

  console.log("== 正常转发 ==");
  calls = [];
  r = await handler(ev("GET", { origin: SITE, "x-api-key": "KEY123" }));
  ok("状态码透传 200", r.statusCode === 200, r.statusCode);
  ok("只发一次请求", calls.length === 1, calls.length);
  ok("打到正确上游（含 9984 端口）",
    calls[0].url === "https://pinkuro.top:9984/api/nikke/public/combat/import", calls[0].url);
  ok("携带 X-API-KEY", calls[0].opts.headers["X-API-KEY"] === "KEY123");
  ok("响应体原样透传", body(r).success === true);
  ok("响应 no-store", (r.headers["Cache-Control"] || "").includes("no-store"));
  ok("响应体不含 Key", !String(r.body).includes("KEY123"));

  console.log("== 上游异常 ==");
  nextImpl = async () => { const e = new Error("boom"); e.name = "TimeoutError"; throw e; };
  r = await handler(ev("GET", { origin: SITE, "x-api-key": "KEY123" }));
  ok("超时返回 504", r.statusCode === 504, r.statusCode);
  nextImpl = async () => { throw new Error("ECONNREFUSED pinkuro.top:9984"); };
  r = await handler(ev("GET", { origin: SITE, "x-api-key": "KEY123" }));
  ok("上游不可达返回 502", r.statusCode === 502, r.statusCode);
  ok("错误文案不泄露上游细节", !String(r.body).includes("ECONNREFUSED"), r.body);
  ok("错误响应也不含 Key", !String(r.body).includes("KEY123"));

  console.log("== 上游 401 透传 ==");
  nextImpl = async () => new Response(JSON.stringify({ success: false, message: "invalid key" }),
    { status: 401, headers: { "content-type": "application/json" } });
  r = await handler(ev("GET", { origin: SITE, "x-api-key": "BAD" }));
  ok("401 原样透传（前端据此提示 Key 无效）", r.statusCode === 401, r.statusCode);

  console.log("");
  console.log((fail === 0 ? "全部通过" : "有失败项") + "：pass=" + pass + " fail=" + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
