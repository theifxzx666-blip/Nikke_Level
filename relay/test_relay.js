/**
 * 中转函数本地验收：用内置 mock 上游替换真实 pinkuro，验证
 *   - 预检 / 正常请求 / 白名单外来源 / 缺 Key / 上游异常 五种分支
 * 不向真实上游发出任何请求。
 *
 *   node test_relay.js
 */
const http = require("http");

/* ---------- mock 上游：模拟 pinkuro 的成功/异常两种表现 ---------- */
let upstreamMode = "ok";
const upstreamSeen = [];
const mock = http.createServer((req, res) => {
  upstreamSeen.push({ method: req.method, key: req.headers["x-api-key"] });
  if (upstreamMode === "boom") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"upstream down"}');
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ success: true, data: { cnData: { userQQId: "478287351" } } }));
});

/* ---------- 把 handler 包成普通 http 服务 ---------- */
function wrap(handler) {
  return http.createServer((req, res) => {
    // 补齐 Vercel 风格的 res 帮助方法
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(o));
      return res;
    };
    res.send = (t) => { res.end(t); return res; };
    handler(req, res);
  });
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  " + JSON.stringify(extra) : "")); }
};

function call(port, opts) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/api/relay", method: opts.method || "GET", headers: opts.headers || {} },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  const upstreamPort = mock.address().port;
  process.env.PINKURO_UPSTREAM = `http://127.0.0.1:${upstreamPort}/api/nikke/public/combat/import`;
  delete require.cache[require.resolve("./api/relay.js")];
  const handler = require("./api/relay.js");

  const srv = wrap(handler);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const ORIGIN = "https://theifxzx666-blip.github.io";

  console.log("== 预检 OPTIONS ==");
  let r = await call(port, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-api-key" } });
  ok("返回 204", r.status === 204, r.status);
  ok("ACAO 回白名单来源", r.headers["access-control-allow-origin"] === ORIGIN, r.headers["access-control-allow-origin"]);
  ok("允许 X-API-KEY", /x-api-key/i.test(r.headers["access-control-allow-headers"] || ""), r.headers["access-control-allow-headers"]);
  ok("预检不触达上游", upstreamSeen.length === 0, upstreamSeen.length);

  console.log("== 白名单外来源 ==");
  r = await call(port, { method: "OPTIONS", headers: { Origin: "https://evil.example.com" } });
  ok("ACAO 为 null（浏览器会拒）", r.headers["access-control-allow-origin"] === "null", r.headers["access-control-allow-origin"]);

  console.log("== 缺 Key ==");
  r = await call(port, { headers: { Origin: ORIGIN } });
  ok("返回 400", r.status === 400, r.status);
  ok("提示缺 X-API-KEY", /X-API-KEY/.test(r.body), r.body);
  ok("缺 Key 不触达上游", upstreamSeen.length === 0, upstreamSeen.length);

  console.log("== 正常拉取 ==");
  r = await call(port, { headers: { Origin: ORIGIN, "X-API-KEY": "TEST-KEY-123" } });
  ok("返回 200", r.status === 200, r.status);
  ok("body 原样透传", /478287351/.test(r.body), r.body.slice(0, 80));
  ok("上游收到同一个 Key", upstreamSeen[0] && upstreamSeen[0].key === "TEST-KEY-123", upstreamSeen[0]);
  ok("上游收到 GET", upstreamSeen[0] && upstreamSeen[0].method === "GET", upstreamSeen[0]);
  ok("带 CORS 头", r.headers["access-control-allow-origin"] === ORIGIN, r.headers["access-control-allow-origin"]);
  ok("禁缓存", r.headers["cache-control"] === "no-store", r.headers["cache-control"]);

  console.log("== 非 GET 方法 ==");
  r = await call(port, { method: "POST", headers: { Origin: ORIGIN, "X-API-KEY": "k" } });
  ok("返回 405", r.status === 405, r.status);

  console.log("== 上游故障 ==");
  upstreamMode = "boom";
  r = await call(port, { headers: { Origin: ORIGIN, "X-API-KEY": "TEST-KEY-123" } });
  ok("错误码原样透传或 502", r.status === 503 || r.status === 502, r.status);
  ok("响应体不含 Key", !/TEST-KEY-123/.test(r.body), r.body);

  console.log("\n" + pass + " passed, " + fail + " failed");
  srv.close(); mock.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
