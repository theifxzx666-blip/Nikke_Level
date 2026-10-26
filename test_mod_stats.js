/* test_mod_stats.js — 定制模组统计 R65 数据兼容回归（纯 node，不依赖浏览器）
 *
 * 背景：作者 2026-10-26 更新页面，记录结构从 {d1,d2,d3} 改成 {runs, drops[]}
 *       （国际服 2026-10-29 起同步器 400+ 每天 4 次、600+ 每天 5 次）。
 *       我方页面还要在 iframe 里跟账号同步（js/sync.js）共存，所以**一条历史记录都不能丢**。
 *
 * 本测试盯的就是这几件事：
 *   ① 老记录（只有 d1/d2/d3）进新页 → 能被读成 drops[]，数值不变
 *   ② 新记录（runs/drops）→ 同时带 d1/d2/d3（旧页面兜底，不会显示成一排 0）
 *   ③ runs 越界 / drops 个数不对 → 一律归一化到合法形态，不抛异常
 *   ④ 期望值按每天实际次数算，双倍日 ×2
 *   ⑤ 2026-10-29 这条分界线：国服恒 3 次，国际服按记录日期判定
 *   ⑥ 导出 v4 往返后第 4/5 次掉落仍然在（不丢）
 *   ⑦ localStorage 写不进去时返回 false（调用方必须中止，不能假装成功）
 */
"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + " → " + (e && e.message)); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

/* ---------------- 极简 DOM / localStorage 桩（够页面脚本跑完 init()） ---------------- */
function makeEl(id) {
  return {
    id: id, value: "", textContent: "", innerHTML: "", disabled: false,
    max: "", min: "", type: "", options: [],
    style: { setProperty: function () {}, removeProperty: function () {} },
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    addEventListener: function () {}, removeEventListener: function () {},
    appendChild: function () {}, insertBefore: function () {}, remove: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getAttribute: function () { return null; }, setAttribute: function () {}, removeAttribute: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 }; },
    scrollIntoView: function () {}, click: function () {}, contains: function () { return false; }, focus: function () {}
  };
}

function buildHarness(seed) {
  var els = {};
  var store = {};
  if (seed) Object.keys(seed).forEach(function (k) { store[k] = seed[k]; });
  var doc = {
    readyState: "complete",
    getElementById: function (id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return makeEl("new:" + tag); },
    addEventListener: function () {},
    body: makeEl("body"), head: makeEl("head"), documentElement: makeEl("html")
  };
  var localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { Object.keys(store).forEach(function (k) { delete store[k]; }); }
  };
  var ctx = {
    document: doc, localStorage: localStorage,
    window: { addEventListener: function () {}, parent: null, innerWidth: 1400, innerHeight: 900, scrollY: 0, scrollTo: function () {} },
    console: console, Date: Date, Math: Math, JSON: JSON, Number: Number, String: String,
    Array: Array, Object: Object, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: function () {}, clearTimeout: function () {}, confirm: function () { return true; },
    Blob: function (parts) { ctx.__lastBlob = parts.join(""); },
    URL: { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} },
    FileReader: function () {}
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  var m, src = "";
  while ((m = re.exec(html))) src += m[1] + "\n";
  src += "\n;globalThis.__T = {" +
    "normalizeRecord:normalizeRecord, computeStats:computeStats," +
    "bossDayExpectation:bossDayExpectation, bossRunExpectation:bossRunExpectation," +
    "bossTriggerExpectation:bossTriggerExpectation," +
    "extraRunsAvailable:extraRunsAvailable, currentRuns:currentRuns," +
    "loadAll:loadAll, saveAll:saveAll, loadRecords:loadRecords, saveRecords:saveRecords," +
    "exportData:exportData, setDate:setDate, resetForm:resetForm," +
    "BASE_RUNS:BASE_RUNS, MAX_RUNS:MAX_RUNS, RUN_CHOICES:RUN_CHOICES," +
    "setServer:function(s){currentServer=s;}, getServer:function(){return currentServer;}," +
    "getSyncTier:function(){return syncTier;}" +
    "};";
  vm.runInContext(src, ctx);
  return { ctx: ctx, T: ctx.__T, els: els, doc: doc, store: store };
}

/* 预置一份「旧页面写下的」数据：只有 d1/d2/d3，没有 runs/drops */
var LEGACY = {
  cn: [{ date: "2026-10-20", boss: "kraken", double: false, d1: 2, d2: 1, d3: 0, note: "旧页面写的" }],
  global: [{ date: "2026-10-21", boss: "ultra", double: true, d1: 3, d2: 0, d3: 1, note: "" }]
};
var H = buildHarness({ "nikke_mod_stats_v3": JSON.stringify(LEGACY) });
var T = H.T;

/* 0.58 * (1*0.700963 + 2*0.289037 + 3*0.01) —— 与页面里的常量同源 */
var E = 1 * 0.700963 + 2 * 0.289037 + 3 * 0.01;
var CN_TRIG = 0.58 * E;          // 0.75924146
var GL_TRIG = 0.69 * E;          // 0.90323553
var CN_KRAKEN_RUN = CN_TRIG + 0.37;   // 37 碎片 / 100
var CN_ULTRA_RUN = CN_TRIG;           // 无碎片

console.log("== 定制模组统计（mod_stats.html）R65 ==");

/* ---------- ① 归一化：老记录 → 新形态 ---------- */
t("① 只有 d1/d2/d3 的老记录 → drops[] 且数值不变", function () {
  var r = T.normalizeRecord({ date: "2026-10-20", boss: "kraken", double: false, d1: 2, d2: 1, d3: 0 });
  assert.strictEqual(r.runs, 3);
  assert.deepStrictEqual(Array.from(r.drops), [2, 1, 0]);
  assert.strictEqual(r.d1, 2); assert.strictEqual(r.d2, 1); assert.strictEqual(r.d3, 0);
});

t("② 新记录 runs=5 + drops[5] → 仍带 d1..d3（旧页兜底不会显示一排 0）", function () {
  var r = T.normalizeRecord({ date: "2026-11-01", boss: "ultra", double: true, runs: 5, drops: [1, 2, 3, 0, 1] });
  assert.strictEqual(r.runs, 5);
  assert.deepStrictEqual(r.drops, [1, 2, 3, 0, 1]);
  assert.strictEqual(r.d1, 1); assert.strictEqual(r.d2, 2); assert.strictEqual(r.d3, 3);
  assert.strictEqual(r.double, true);
});

/* ---------- ③ 越界与缺字段：一律归一化，不抛 ---------- */
t("③ runs 越界（7 / 2 / 字符串）一律回落 3 次", function () {
  [7, 2, "x", null, undefined].forEach(function (v) {
    var r = T.normalizeRecord({ date: "2026-10-20", runs: v, drops: [1, 2, 3, 0, 1] });
    assert.strictEqual(r.runs, 3, "runs=" + v + " → " + r.runs);
    assert.strictEqual(r.drops.length, 3, "drops 未截到 3");
  });
});

t("③b drops 不足补 0、超过 5 格截断", function () {
  var short = T.normalizeRecord({ date: "2026-11-01", runs: 5, drops: [1, 2] });
  assert.deepStrictEqual(short.drops, [1, 2, 0, 0, 0]);
  var long = T.normalizeRecord({ date: "2026-11-01", runs: 5, drops: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepStrictEqual(long.drops, [1, 2, 3, 4, 5]);
});

t("③c 空对象 / 未知 Boss → 安全缺省", function () {
  var r = T.normalizeRecord({});
  assert.strictEqual(r.boss, "kraken");
  assert.deepStrictEqual(Array.from(r.drops), [0, 0, 0]);
  assert.strictEqual(r.note, "");
  assert.strictEqual(T.normalizeRecord({ date: "2026-10-20", boss: "nope" }).boss, "kraken");
});

/* ---------- ④ 期望按次数算 ---------- */
t("④ 克拉肯 5 次 = 3 次 × 5/3，双倍日再 ×2", function () {
  T.setServer("cn");
  var d3 = T.bossDayExpectation("kraken", 3, false);
  var d5 = T.bossDayExpectation("kraken", 5, false);
  assert.ok(near(d3, CN_KRAKEN_RUN * 3), "3 次 = " + d3);
  assert.ok(near(d5, CN_KRAKEN_RUN * 5), "5 次 = " + d5);
  assert.ok(near(d5, d3 * 5 / 3), "5 次不是 3 次的 5/3");
  assert.ok(near(T.bossDayExpectation("kraken", 5, true), d5 * 2), "双倍日不是 ×2");
});

t("④b 非克拉肯不吃碎片（过激派 3 次 = 触发期望 ×3）", function () {
  T.setServer("cn");
  assert.ok(near(T.bossDayExpectation("ultra", 3, false), CN_ULTRA_RUN * 3));
  assert.ok(near(T.bossDayExpectation("ultra", 4, false), CN_ULTRA_RUN * 4));
});

t("④c 国际服触发率 0.69 高于国服 0.58（碎片 50 vs 37）", function () {
  T.setServer("global");
  var gl = T.bossDayExpectation("kraken", 3, false);
  T.setServer("cn");
  var cn = T.bossDayExpectation("kraken", 3, false);
  assert.ok(gl > cn, "国际服期望应更高：" + gl + " vs " + cn);
  assert.ok(near(gl, (GL_TRIG + 0.5) * 3), "国际服 3 次 = " + gl);
});

/* ---------- ⑤ 2026-10-29 分界线 ---------- */
t("⑤ 额外次数：国服恒不可用；国际服 2026-10-29 起可用", function () {
  T.setServer("cn");
  ["2026-10-28", "2026-10-29", "2026-11-05"].forEach(function (d) {
    assert.strictEqual(T.extraRunsAvailable(d), false, "国服 " + d + " 不该放行");
  });
  T.setServer("global");
  assert.strictEqual(T.extraRunsAvailable("2026-10-28"), false);
  assert.strictEqual(T.extraRunsAvailable("2026-10-29"), true, "10-29 当天应放行");
  assert.strictEqual(T.extraRunsAvailable("2026-11-05"), true);
  assert.strictEqual(T.extraRunsAvailable(""), false, "空日期不该放行");
  assert.strictEqual(T.extraRunsAvailable(null), false);
});

/* ---------- ⑥ 旧数据进新页：统计值不变 ---------- */
t("⑥ 旧记录（2/1/0）→ 累计直接模组 3、理论 3.39、碎片 111", function () {
  T.setServer("cn");
  var st = T.computeStats(T.loadRecords());
  assert.strictEqual(st.list.length, 1);
  var r = st.list[0];
  assert.strictEqual(r.direct, 3, "direct=" + r.direct);
  assert.strictEqual(r.dayFragments, 111, "碎片 = 37×3");
  assert.ok(near(r.total, 3 + 1.11), "total=" + r.total);
  assert.ok(near(r.theory, CN_KRAKEN_RUN * 3), "theory=" + r.theory);
  assert.ok(near(r.cumActual, 4.11), "cumActual=" + r.cumActual);
  assert.deepStrictEqual(Array.from(r.drops), [2, 1, 0]);
});

t("⑥b 页面 init() 用旧数据也能正常起来（不抛异常，记录可读）", function () {
  assert.strictEqual(T.loadAll().cn.length, 1);
  assert.strictEqual(T.loadAll().global.length, 1);
  assert.strictEqual(T.getServer(), "cn");
});

/* ---------- ⑦ 导出 v4 往返：第 4/5 次不丢 ---------- */
t("⑦ 导出 v4：两服都带 runs+drops，旧字段同时保留", function () {
  T.setServer("global");
  T.saveRecords([{ date: "2026-11-01", boss: "kraken", double: false, runs: 5, drops: [1, 2, 3, 0, 1], note: "五次" }]);
  T.exportData();
  var pkt = JSON.parse(H.ctx.__lastBlob);
  assert.strictEqual(pkt.version, 4, "导出 schema 应为 v4");
  assert.ok(Array.isArray(pkt.servers.cn) && Array.isArray(pkt.servers.global), "两服都要在");
  var g = pkt.servers.global[0];
  assert.strictEqual(g.runs, 5);
  assert.deepStrictEqual(g.drops, [1, 2, 3, 0, 1]);
  assert.strictEqual(g.d1, 1); assert.strictEqual(g.d2, 2); assert.strictEqual(g.d3, 3);
  /* cn 那侧仍是老记录，也必须被归一化后带出来 */
  assert.deepStrictEqual(pkt.servers.cn[0].drops, [2, 1, 0]);
});

t("⑦b 导出→导入（重新 map normalizeRecord）后第 4/5 次仍在", function () {
  T.exportData();
  var pkt = JSON.parse(H.ctx.__lastBlob);
  var again = pkt.servers.global.map(T.normalizeRecord);
  assert.deepStrictEqual(again[0].drops, [1, 2, 3, 0, 1], "往返后掉了第 4/5 次");
  /* 反向：旧页面按它的 normalizeRecord 只认 d1/d2/d3，也能读到前三次 */
  var oldPage = { d1: again[0].d1, d2: again[0].d2, d3: again[0].d3 };
  assert.deepStrictEqual([oldPage.d1, oldPage.d2, oldPage.d3], [1, 2, 3]);
});

/* ---------- ⑧ 写盘失败必须返回 false ---------- */
t("⑧ localStorage 写不进去（配额满 / 隐私模式）→ saveRecords 返回 false", function () {
  var orig = H.ctx.localStorage.setItem;
  H.ctx.localStorage.setItem = function () { throw new Error("QuotaExceededError"); };
  try {
    assert.strictEqual(T.saveRecords([]), false, "写失败却报了成功");
    assert.strictEqual(T.saveAll({ cn: [], global: [] }), false);
  } finally { H.ctx.localStorage.setItem = orig; }
});

/* ---------- ⑨ 次数字段兜底 ---------- */
t("⑨ 本机没有 nikke_sync_tier 时，用最近一条记录的 runs 兜底", function () {
  var h2 = buildHarness({
    "nikke_mod_stats_v3": JSON.stringify({ cn: [], global: [{ date: "2026-11-02", boss: "kraken", double: false, runs: 5, drops: [1, 1, 1, 1, 1], d1: 1, d2: 1, d3: 1, note: "" }] }),
    "nikke_current_server": "global"
  });
  assert.strictEqual(h2.T.getSyncTier(), 5, "应从最近记录推断出 5 次档");
});

t("⑨b 本机有合法偏好时以偏好为准", function () {
  var h3 = buildHarness({ "nikke_sync_tier": "4", "nikke_current_server": "global" });
  assert.strictEqual(h3.T.getSyncTier(), 4);
});

console.log("\n===== test_mod_stats: PASS=" + pass + "  FAIL=" + fail + " =====");
process.exit(fail ? 1 : 0);
