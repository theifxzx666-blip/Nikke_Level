/* test_route_logic.js — 双线路判定回归（2026-11-27 死循环事故的复现测试）
 *
 * 做法：用 node:vm 造一个最小浏览器环境，直接执行 js/route.js 的「阶段 1」，
 * 只看它是否调用 location.replace、目标 URL 长什么样。不启动浏览器、不联网。
 *
 * 覆盖的正是上次翻车的点：
 *   · GitHub 页 → 国内：允许跳，且只跳一次
 *   · 国内页 → GitHub：自动模式下永不发生（方向保护）
 *   · 跳转后 15 秒冷却：sessionStorage 记时间戳，清 URL 也不丢
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const CODE = fs.readFileSync(path.join(__dirname, "js", "route.js"), "utf8");

function run(opt) {
  const now = Date.now();
  const store = {};
  if (opt.mode) store["nikke_route_mode_v1"] = opt.mode;
  if (opt.hopAgo != null) store["s:nikke_route_hop_at"] = String(now - opt.hopAgo);

  const nav = [];
  const location = {
    protocol: opt.protocol || "https:",
    hostname: opt.host,
    search: opt.search || "",
    href: "https://" + opt.host + "/" + (opt.search || ""),
    replace: (u) => nav.push(u)
  };

  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  const sessionStorage = {
    getItem: (k) => (("s:" + k) in store ? store["s:" + k] : null),
    setItem: (k, v) => { store["s:" + k] = String(v); }
  };

  const document = {
    readyState: "loading",              // 卡在 loading，让 UI 阶段不执行
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {} }; },
    head: { appendChild() {} },
    body: { classList: { contains() { return false; } }, appendChild() {} }
  };

  const ctx = {
    location, localStorage, sessionStorage, document,
    window: {},
    history: { replaceState() {} },
    URL,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: opt.tz || "UTC" }) }) },
    console
  };

  vm.createContext(ctx);
  try {
    vm.runInContext(CODE, ctx);
  } catch (e) {
    return { nav, error: e.message };
  }
  return { nav };
}

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  → " + detail : "")); }
}

console.log("1) GitHub 页 + 自动 + 中国时区 → 跳国内一次");
let r = run({ host: "theifxzx666-blip.github.io", tz: "Asia/Shanghai", mode: "auto" });
check("发生一次跳转", r.nav.length === 1, JSON.stringify(r.nav));
check("目标是国内线路", /workbuddy\.host/.test(r.nav[0] || ""), r.nav[0]);
check("带 hop=1", /[?&]hop=1/.test(r.nav[0] || ""), r.nav[0]);
check("sharecode 未被破坏", /sharecode=YHW5333IQR/.test(r.nav[0] || ""), r.nav[0]);

console.log("2) 国内页 + 自动 + 中国时区 → 绝不跳（防循环核心）");
r = run({ host: "nikke-level-planner-07475.app.workbuddy.host", tz: "Asia/Shanghai", mode: "auto" });
check("不跳转", r.nav.length === 0, JSON.stringify(r.nav));

console.log("3) 国内页 + 自动 + 海外时区 → 仍不跳（方向保护）");
r = run({ host: "nikke-level-planner-07475.app.workbuddy.host", tz: "America/Los_Angeles", mode: "auto" });
check("不跳转", r.nav.length === 0, JSON.stringify(r.nav));

console.log("4) GitHub 页 + 2 秒前刚跳过 → 冷却期内不跳");
r = run({ host: "theifxzx666-blip.github.io", tz: "Asia/Shanghai", mode: "auto", hopAgo: 2000 });
check("不跳转", r.nav.length === 0, JSON.stringify(r.nav));

console.log("5) GitHub 页 + 20 秒前跳过 → 冷却结束可再跳");
r = run({ host: "theifxzx666-blip.github.io", tz: "Asia/Shanghai", mode: "auto", hopAgo: 20000 });
check("跳一次", r.nav.length === 1, JSON.stringify(r.nav));

console.log("6) GitHub 页 + 手动选国内 → 跳且带 route=cn");
r = run({ host: "theifxzx666-blip.github.io", tz: "America/Los_Angeles", mode: "cn" });
check("跳一次", r.nav.length === 1, JSON.stringify(r.nav));
check("带 route=cn", /[?&]route=cn/.test(r.nav[0] || ""), r.nav[0]);

console.log("7) 国内页 + 手动选 GitHub → 允许跳回（用户明确选择）");
r = run({ host: "nikke-level-planner-07475.app.workbuddy.host", tz: "Asia/Shanghai", mode: "gh" });
check("跳一次", r.nav.length === 1, JSON.stringify(r.nav));
check("目标 GitHub", /github\.io/.test(r.nav[0] || ""), r.nav[0]);

console.log("8) 海外 + GitHub + 自动 → 不跳");
r = run({ host: "theifxzx666-blip.github.io", tz: "Europe/London", mode: "auto" });
check("不跳", r.nav.length === 0, JSON.stringify(r.nav));

console.log("9) 本地环境 → 永不跳");
r = run({ host: "localhost", protocol: "http:", tz: "Asia/Shanghai", mode: "auto" });
check("不跳", r.nav.length === 0, JSON.stringify(r.nav));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
