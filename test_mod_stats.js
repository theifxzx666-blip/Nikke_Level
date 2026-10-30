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
    window: {
      addEventListener: function () {}, parent: null, innerWidth: 1400, innerHeight: 900, scrollY: 0, scrollTo: function () {},
      /* R75：自动轮播会查 prefers-reduced-motion */
      matchMedia: function () { return { matches: false, addEventListener: function () {}, removeEventListener: function () {} }; }
    },
    console: console, Date: Date, Math: Math, JSON: JSON, Number: Number, String: String,
    Array: Array, Object: Object, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: function () {}, clearTimeout: function () {}, confirm: function () { return true; },
    /* 桩里不真起定时器，只保证调用不炸 */
    setInterval: function () { return 0; }, clearInterval: function () {},
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
  /* R81：选中态改画在 ::after 上（按钮本体是热区），两种写法都认 */
  assert.ok(/\.period-dots button\.on(::after)?\{/.test(html), ".period-dots 需要选中态样式");
  /* R81：圆点视觉 6px 但热区必须 ≥16×20，否则「从第 1 点直接点第 5」会点空 */
  assert.ok(/\.period-dots button\{[^}]*width:1[6-9]px[^}]*height:2[0-9]px/.test(html), ".period-dots 按钮热区太小");
  /* 旧的五列网格与「顶条胶囊 / 右侧竖条」都不许回来 */
  assert.ok(!/\.period-grid\{display:grid/.test(html), "旧的 5 列网格样式残留");
  assert.ok(html.indexOf('class="period-grid"') === -1, "旧的 period-grid 容器残留");
  assert.ok(html.indexOf("period-peek") === -1 && html.indexOf("period-rail") === -1, "顶部胶囊 / 右侧竖条不该存在");
  /* DOM 挂点 */
  assert.ok(/id="periodGrid"[^>]*role="group"/.test(html), "视口需要 id=periodGrid + role=group");
  assert.ok(/id="periodDots"/.test(html), "缺少 id=periodDots");
  /* 每张卡带 data-target，才可以按天数而不是 DOM 序号记忆当前页 */
  assert.ok(/class="period-card" data-target="\$\{target\}"/.test(html), "周期卡需要 data-target");
  /* R81b：「建议样本」双挂点 —— 宽屏在「全部周期」清单 90 天行，窄屏在 90 天卡标题行 */
  assert.ok(/o\.target===SAMPLE_DAYS\?`<em class="sample-tag" title=/.test(html), "清单 90 天行缺少建议样本 tag");
  assert.ok(/target===SAMPLE_DAYS\?'<em class="sample-tag p-sample">建议样本<\/em>'/.test(html), "周期卡缺少 p-sample tag");
  assert.ok(/\.p-sample\{display:none\}/.test(html), "卡内 p-sample 宽屏应隐藏（避免与清单重复）");
  assert.ok(html.indexOf(".p-sample{display:inline-block") > html.indexOf("@media(max-width:1080px)"), "窄屏媒体查询需显示卡内 p-sample");
});

t("⑬c R74：周期统计不再有面板外框与标题行，只留卡片本体 + 底部圆点", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  /* 节上不许再挂 panel（白底 + 边框 + 阴影 + 圆角的外框） */
  assert.ok(/<section id="periodPanel" aria-label="周期统计">/.test(html), "periodPanel 应是无外框的裸 section");
  assert.ok(!/<section class="panel" id="periodPanel"/.test(html), "面板外框 class=panel 不许回来");
  /* 只判 periodPanel 这一段：panel-head / panel-title 在其它面板里本来就有，不能对全文件判 */
  var a = html.indexOf('<section id="periodPanel"');
  assert.ok(a !== -1, "找不到 periodPanel");
  var seg = html.slice(a, html.indexOf("</section>", a) + 10);
  assert.ok(seg.indexOf("panel-head") === -1, "周期统计里不许再有标题行 panel-head");
  assert.ok(seg.indexOf("panel-title") === -1, "周期统计里不许再有标题 panel-title");
  assert.ok(seg.indexOf("periodTitle") === -1, "标题 id=periodTitle 残留");
  assert.ok(seg.indexOf("累计：第 1–N 天") === -1, "副标题那段累计/本段描述残留");
  assert.ok(seg.indexOf("aria-labelledby") === -1, "aria-labelledby 指向已删标题");
  /* 卡片仍在，且自带白色底 + 细投影，否则会融进 body 的浅绿渐变 */
  assert.ok(/\.period-card\{[^}]*background:linear-gradient\(180deg,#ffffff,#f7fcf9\)/.test(html), "卡片需要白色渐变底");
  assert.ok(/\.period-card\{[^}]*box-shadow:0 1px 3px/.test(html), "卡片需要自身细投影");
  assert.ok(/\.period-wrap\{padding:0;margin-bottom:24px\}/.test(html), "wrap 去内边距并保留底距");
  assert.ok(seg.indexOf('id="periodGrid"') !== -1 && seg.indexOf('id="periodDots"') !== -1, "卡片视口与圆点必须仍在");
});

t("⑬b 排序与翻页逻辑：最近完成的排最上、到边界放行、数据刷新不跳页", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  /* R81：90 天抽成 SAMPLE_DAYS（「建议样本」tag 挂在同一天），数组内容不变 */
  assert.ok(/SAMPLE_DAYS=90/.test(html), "建议样本天数应为 90");
  assert.ok(/PERIOD_TARGETS=\[30,60,(90|SAMPLE_DAYS),180,365\]/.test(html), "目标天数数组应为 30/60/90/180/365");
  /* 已完成按天数倒序（最近完成的在最上），未完成按天数正序排在后面 */
  assert.ok(/a\.done\?b\.target-a\.target:a\.target-b\.target/.test(html), "排序规则不是「已完成倒序 + 未完成正序」");
  assert.ok(/periodFocus/.test(html), "缺少 periodFocus（数据刷新后按天数复位，而不是按序号）");
  assert.ok(/function layoutPeriods\(\)/.test(html) && /cards\.forEach\(c=>\{c\.style\.height=m\+'px'\}\)/.test(html), "缺少统一卡高的 layoutPeriods");
  /* R77：不再在边界停住，改环形无限循环；但环绕过一次后必须把滚动让回页面，否则整页锁死 */
  assert.ok(/if\(wWrapDir===dir\)\{/.test(html) && /wWrapAcc>=PERIOD_WHEEL_ESCAPE/.test(html) && /wPass=true;/.test(html), "滚轮环绕后没有把滚动让回页面");
  assert.ok(/addEventListener\('wheel'/.test(html) && /addEventListener\('touchstart'/.test(html), "缺少滚轮 / 触摸翻页");
});

/* ---------- ⑭ R75：添加每日记录与周期统计并排一行 + 文案改动 ---------- */
t("⑭ R75：entry-period 并排容器、底部三块压成一行、旧的分行容器已移除", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  assert.ok(/\.entry-period\{display:grid;grid-template-columns:minmax\(0,1\.62fr\) minmax\(0,1fr\)/.test(html), "缺少 .entry-period 左右两列");
  assert.ok(/@media\(max-width:1080px\)\{\.entry-period\{grid-template-columns:minmax\(0,1fr\)\}/.test(html), "1080 以下需要回落单列");
  /* 两个面板必须挂在同一个 .entry-period 里 */
  var a = html.indexOf('<div class="entry-period">');
  assert.ok(a !== -1, "缺少 entry-period 容器");
  var seg = html.slice(a, html.indexOf('<section class="panel" id="historyPanel"'));
  assert.ok(seg.indexOf('id="entryPanel"') !== -1 && seg.indexOf('id="periodPanel"') !== -1, "两个面板没有放进同一容器");
  /* 底部三块：entry-row 三分支（掉落 / 备注 / 按钮），旧容器一律不许回来 */
  assert.ok(/\.entry-row\{display:flex/.test(html), "缺少 .entry-row 一行容器");
  assert.ok(html.indexOf('class="entry-bottom"') === -1, "旧的 entry-bottom 残留");
  assert.ok(html.indexOf('class="form-footer"') === -1, "旧的 form-footer 残留");
  assert.ok(html.indexOf('class="form-note"') === -1, "旧的 form-note 提示行残留");
  var row = html.slice(html.indexOf('<div class="entry-row">'), html.indexOf("</form>"));
  assert.ok(row.indexOf('drop-wrap') !== -1 && row.indexOf('note-wrap') !== -1 && row.indexOf('form-actions') !== -1, "entry-row 里应同时有掉落 / 备注 / 按钮");
  /* 掉落汇总行改成绝对定位，避免把这一格撑高导致三块底边对不齐 */
  assert.ok(/\.entry-row \.drop-sum\{position:absolute/.test(html), "drop-sum 需要绝对定位才能对齐");
});

t("⑮ R75：同步器与掉落说明并进 label，输入框下方那行已删除", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  assert.ok(/id="runsLabelNote"[^>]*>（国服按每日 3 次计算）</.test(html), "同步器 label 需要带（国服按每日 3 次计算）");
  assert.ok(html.indexOf('id="runsHint"') === -1, "旧的 runsHint 节点残留");
  assert.ok(/id="dropFieldsLabel">每次直接掉落<span class="lbl-note warn">（双倍日也填写实际数量，不要自行乘以 2）/.test(html), "掉落 label 文案不对（R80 起带 warn 类，需标红）");
  assert.ok(/\.lbl-note\{font-size:12px/.test(html), "缺少 .lbl-note 小字样式");
  /* 国际服仍要有分级说明的落点（写进同一个 note 的 title） */
  assert.ok(/note\.textContent='（400\+ 4 次 · 600\+ 5 次）'/.test(html), "国际服说明没接上 label");
});

/* ---------- ⑯ R75：A 版轻堆叠 + 自动轮播 ---------- */
t("⑯ R75：周期卡改 A 版轻堆叠（2 层露边）+ 自动轮播（R77 起 4.6 秒）", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  assert.ok(/const PERIOD_PEEK=12, PERIOD_PEEK_SCALE=0\.035, PERIOD_PEEK_MAX=2;/.test(html), "露边常量应为 12px / 3.5% / 2 层");
  assert.ok(/const wantH=\(maxH\+topPad\)\+'px';/.test(html) && /view\.style\.height=wantH;/.test(html), "视口高度应为卡高 + 露边");
  assert.ok(/y=topPad-off\*PERIOD_PEEK; scale=1-off\*PERIOD_PEEK_SCALE;/.test(html) && /translate3d\(0,\$\{y\}px,0\)/.test(html) && /scale\(\$\{scale\}\)/.test(html), "露边卡需要上移 + 缩放");
  assert.ok(/\.period-card\{[^}]*transform-origin:50% 100%/.test(html), "卡片需要从底边缩放");
  /* 自动轮播：2~3 秒一张、末张回卷、悬停/手动/后台/减弱动效都停 */
  var m = html.match(/const PERIOD_AUTO_MS=(\d+)/);
  assert.ok(m, "缺少自动轮播间隔常量");
  var ms = Number(m[1]);
  assert.ok(ms === 4600, "轮播间隔应为 2600 + 2000 = 4600ms，实际 " + ms);
  assert.ok(/function periodAutoStep\(\)/.test(html) && /setInterval\(periodAutoStep/.test(html), "缺少轮播定时器");
  assert.ok(/periodGo\(periodIdx\+1\);/.test(html), "轮播应环形步进（末张之后回首张）");
  assert.ok(/document\.hidden\|\|periodAutoHover/.test(html), "后台 / 悬停时需要暂停");
  assert.ok(/prefers-reduced-motion: reduce/.test(html), "系统减弱动效时应停播");
  assert.ok(/periodAutoHoldFor\(\)/.test(html), "手动交互后应暂停一段时间");
  assert.ok(html.indexOf('period-no-anim') === -1, "环形后不再需要 no-anim 瞬切类");
});

/* ---------- ⑰ R77：环形无限循环 ---------- */
t("⑰ R77：堆叠卡环形无限循环（末→首、首→末）+ 环绕后页面让位", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  /* 1. 步进取模，不再夹在 0..n-1 */
  assert.ok(/const next=\(\(i%n\)\+n\)%n;/.test(html), "periodGo 需要环形取模 next=((i%n)+n)%n");
  assert.ok(html.indexOf("Math.min(n-1,periodIdx+1)") === -1 && html.indexOf("Math.max(0,periodIdx-1)") === -1,
    "键盘翻页还夹在边界，没有环形");
  /* 2. 摆放用环形偏移：前进 0..n-1 / 后退 -(n-1)..0 */
  assert.ok(/function periodOffset\(i,n\)\{/.test(html), "缺少 periodOffset 环形偏移函数");
  assert.ok(/const d=\(i-periodIdx\+n\)%n;/.test(html), "偏移应先算环形前进距离 (i-focus+n)%n");
  assert.ok(/if\(d<=PERIOD_PEEK_MAX\) return d;/.test(html), "主卡与露边卡恒排在下方，反向翻也不能丢堆叠感");
  assert.ok(/return periodDir>=0\?d:d-n;/.test(html), "更远的隐藏卡应按方向放上/下，新卡才从正确方向滑入");
  assert.ok(/const off=periodOffset\(i,n\);/.test(html), "layoutPeriods 必须改用 periodOffset");
  /* 3. 方向判定：跨过一半圈数当反向，动画才不会横扫整圈 */
  assert.ok(/periodDir=\(\(\(next-periodIdx\+n\)%n\)>n\/2\)\?-1:1;/.test(html), "缺少前进/后退方向判定");
  /* 4. 环绕后的页面让位：滚轮 0.9s 窗口 + 触摸下一手势 */
  assert.ok(/const PERIOD_WHEEL_STEP=100, PERIOD_WHEEL_ESCAPE=1000, PERIOD_WHEEL_GESTURE_MS=200;/.test(html), "缺少滚轮累计位移分页常量（R80：让位阈值 1000 = 两圈）");
  assert.ok(/wWrapAcc>=PERIOD_WHEEL_ESCAPE/.test(html) && /wPass=true;/.test(html), "滚轮环绕后没有把滚动让回页面");
  assert.ok(/periodTouchPassUntil=Date.now\(\)\+PERIOD_TOUCH_PASS_MS;/.test(html) && /skip=Date.now\(\)<periodTouchPassUntil;/.test(html),
    "触摸环绕后没有把下一次手势让给页面滚动");
  assert.ok(/if\(!active\|\|skip\|\|e\.touches\.length!==1\) return;/.test(html), "让位手势不应再拦截 touchmove");
});

/* ---------- ⑧ R78：桌面右列填空 + 滚轮累计位移分页 ---------- */
t("⑱ R78：桌面右列补「全部周期」清单 + 滚轮改累计位移分页", function () {
  var html = fs.readFileSync(path.join(__dirname, "mod_stats.html"), "utf8");
  /* 1. 清单只在桌面两列时出现，≤1080 必须隐藏（不影响手机） */
  assert.ok(/\.period-all\{display:none\}/.test(html), "清单默认应 display:none，手机端不占空间");
  assert.ok(/@media\(min-width:1081px\)\{[\s\S]{0,400}\.period-all\{display:flex/.test(html), "清单应只在 >1080px 显示");
  assert.ok(/#periodPanel\{align-self:stretch;display:flex;flex-direction:column;min-width:0\}/.test(html), "桌面下 #periodPanel 需撑满行高才能填空");
  /* 2. 清单与堆叠卡同源 */
  assert.ok(/allList.innerHTML=order.map\(\(o,i\)=>periodAllRow\(o,i,stats\)\)/.test(html), "清单必须与卡片共用同一份 order");
  assert.ok(/function periodAllRow\(o,i,stats\)\{/.test(html), "缺少 periodAllRow 渲染函数");
  assert.ok(/allList.addEventListener\('click'/.test(html), "清单行需要可点击切卡");
  assert.ok(/#periodAllList \.period-all-row'\)\.forEach\(\(d,j\)=>d\.classList\.toggle\('on',j===periodIdx\)\)/.test(html), "切卡后清单高亮要同步");
  /* 3. 滚轮：位移累积分页 */
  assert.ok(html.indexOf("now-lock<380") === -1, "380ms 时间锁会把快速滚动整段吃掉，必须移除");
  assert.ok(/wAcc\+=Math\.abs\(raw\);/.test(html) && /if\(wAcc<PERIOD_WHEEL_STEP\) return;/.test(html), "滚轮应按累计位移满一张才翻页");
  assert.ok(/if\(now-wLast>PERIOD_WHEEL_GESTURE_MS\)/.test(html), "需要手势间隔判定，慢滚才不会误让位");
  assert.ok(/e\.deltaMode===1\?e\.deltaY\*16:e\.deltaY/.test(html), "行模式滚轮要归一化 deltaY");
});

console.log("\n===== test_mod_stats: PASS=" + pass + "  FAIL=" + fail + " =====");
process.exit(fail ? 1 : 0);
