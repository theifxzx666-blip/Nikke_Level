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
    max: "", min: "", type: "", options: [], dataset: {},
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
    "BOSS_CONFIG:BOSS_CONFIG, BOSS_ORDER:BOSS_ORDER, bossElem:bossElem, bossElemName:bossElemName," +
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

/* ---------- ⑩ R71：Boss 属性配色映射 ---------- */
t("⑩ 五 Boss 属性映射齐全（火/水/电/风/铁甲）", function () {
  var MAP = { harvester: "fire", mirror: "water", ultra: "elec", indivilia: "wind", kraken: "iron" };
  Object.keys(MAP).forEach(function (k) {
    var b = T.BOSS_CONFIG[k];
    assert.ok(b, k + " 不在 BOSS_CONFIG");
    assert.strictEqual(b.elem, MAP[k], k + " 属性应为 " + MAP[k] + "，实际 " + b.elem);
    assert.ok(b.element && b.element.length <= 2, k + " 属性中文名异常：" + b.element);
    assert.strictEqual(T.bossElem(k), "elem-" + MAP[k]);
  });
  assert.deepStrictEqual(Array.from(T.BOSS_ORDER).slice().sort(), Object.keys(MAP).sort(), "BOSS_ORDER 与配置不一致");
  /* 未知 boss 走克拉肯兜底，不会产出空 class */
  assert.strictEqual(T.bossElem("nope"), "elem-iron");
});

/* ---------- ⑪ R71：品牌图标换成 nav_modstats.webp ---------- */
t("⑪ 页头图标使用 assets/nav_modstats.webp，不再用 ⚙ 字符", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  assert.ok(/class="brand-mark"><img[^>]+assets\/nav_modstats\.webp/.test(html), "brand-mark 里没换成本地图标");
  assert.ok(html.indexOf('<span>⚙</span>') === -1, "还残留 ⚙ 字符图标");
  assert.ok(/\.brand-mark img\{/.test(html), "缺少 .brand-mark img 样式");
});

/* ---------- ⑫ R71b：五属性配色锁（电=紫、铁甲=黄，两者不可互换） ---------- */
t("⑫ 属性配色：火红/水蓝/电紫/风绿/铁甲黄，四层（徽章/参数行/下拉色条/图例）一致", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  var HEX = { fire: "#bf3b26", water: "#1b6cb8", elec: "#6c3bb8", wind: "#1c8352", iron: "#7f5c06" };
  var BAR = { fire: "#cc402d", water: "#2074cd", elec: "#7c46c4", wind: "#218c56", iron: "#b2850c" };
  Object.keys(HEX).forEach(function (k) {
    var re = new RegExp("\\.badge\\.boss\\.elem-" + k + "\\{[^}]*color:" + HEX[k]);
    assert.ok(re.test(html), k + " 徽章文字色应为 " + HEX[k]);
    assert.ok(new RegExp("\\.boss-param\\.elem-" + k + "\\{color:" + HEX[k] + "\\}").test(html), k + " 参数行色应为 " + HEX[k]);
    assert.ok(new RegExp('select\\[data-elem="' + k + '"\\]\\{box-shadow:inset 3px 0 0 0 ' + BAR[k] + "\\}").test(html), k + " 下拉色条应为 " + BAR[k]);
  });
  /* 电与铁甲不能同色系（历史上曾把铁甲写成紫） */
  assert.notStrictEqual(HEX.elec, HEX.iron, "电与铁甲配色不可相同");
  assert.ok(html.indexOf("#a1770a") === -1, "电属性残留旧琥珀色 #a1770a");
  assert.ok(html.indexOf("#6a4ab4") === -1, "铁甲残留旧紫 #6a4ab4");
  /* 图例五色齐全 */
  ["fire", "water", "elec", "wind", "iron"].forEach(function (k) {
    assert.ok(html.indexOf("badge boss elem-" + k + "\">") !== -1, "使用说明缺少 " + k + " 图例");
  });
});

/* ---------- ⑬ R73：周期统计改「一屏一张的堆叠翻页 + 底部页数圆点」 ---------- */
t("⑬ 周期统计容器结构：period-view 视口 + period-dots 圆点，旧的 5 列网格已不存在", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  /* 视口必须能裁掉平移出界的卡，且不吃子元素内在宽度（否则窄屏会被撑宽） */
  assert.ok(/\.period-view\{[^}]*overflow:hidden/.test(html), ".period-view 需要 overflow:hidden");
  assert.ok(/\.period-view\{[^}]*contain:inline-size/.test(html), ".period-view 需要 contain:inline-size");
  assert.ok(/\.period-card\{[^}]*position:absolute/.test(html), ".period-card 必须是绝对定位（叠在同一格里）");
  assert.ok(/\.period-dots button\.on\{/.test(html), ".period-dots 需要选中态样式");
  /* 旧的五列网格与「顶条胶囊 / 右侧竖条」都不许回来 */
  assert.ok(!/\.period-grid\{display:grid/.test(html), "旧的 5 列网格样式残留");
  assert.ok(html.indexOf('class="period-grid"') === -1, "旧的 period-grid 容器残留");
  assert.ok(html.indexOf("period-peek") === -1 && html.indexOf("period-rail") === -1, "顶部胶囊 / 右侧竖条不该存在");
  /* DOM 挂点 */
  assert.ok(/id="periodGrid"[^>]*role="group"/.test(html), "视口需要 id=periodGrid + role=group");
  assert.ok(/id="periodDots"/.test(html), "缺少 id=periodDots");
  /* 每张卡带 data-target，才可以按天数而不是 DOM 序号记忆当前页 */
  assert.ok(/class="period-card" data-target="\$\{target\}"/.test(html), "周期卡需要 data-target");
});

t("⑬b 排序与翻页逻辑：最近完成的排最上、到边界放行、数据刷新不跳页", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  assert.ok(/PERIOD_TARGETS=\[30,60,90,180,365\]/.test(html), "目标天数数组应为 30/60/90/180/365");
  /* 已完成按天数倒序（最近完成的在最上），未完成按天数正序排在后面 */
  assert.ok(/a\.done\?b\.target-a\.target:a\.target-b\.target/.test(html), "排序规则不是「已完成倒序 + 未完成正序」");
  assert.ok(/periodFocus/.test(html), "缺少 periodFocus（数据刷新后按天数复位，而不是按序号）");
  assert.ok(/function layoutPeriods\(\)/.test(html) && /c\.style\.height=maxH\+'px'/.test(html), "缺少统一卡高的 layoutPeriods");
  /* 滚轮到边界必须放行，否则页面滚不动 */
  assert.ok(/down&&periodIdx>=n-1\)\|\|\(!down&&periodIdx<=0\)\) return;/.test(html), "滚轮在边界没有放行");
  assert.ok(/addEventListener\('wheel'/.test(html) && /addEventListener\('touchstart'/.test(html), "缺少滚轮 / 触摸翻页");
});

console.log("\n===== test_mod_stats: PASS=" + pass + "  FAIL=" + fail + " =====");
process.exit(fail ? 1 : 0);
