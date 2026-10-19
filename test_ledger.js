/* test_ledger.js — R47 收益账单口径回归（纯 node，不依赖浏览器）
   覆盖：区间推算 / 未填开放日降级 / 开放日一次性推图收益 / 开放日改收益 / 活动逐日并入 /
        合计=Σ明细 / CSV 形态 / snapSlice 序列化往返一致 / formChanged 判定。 */
"use strict";
var assert = require("assert");
var path = require("path");

global.NikkeCore = require(path.join(__dirname, "js/core.js"));
global.NikkeEvents = require(path.join(__dirname, "js/events.js"));
var L = require(path.join(__dirname, "js/ledger.js"));

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + " → " + (e && e.message)); }
}
function sum(rows, k) { return rows.reduce(function (s, r) { return s + r.res[k]; }, 0); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

var BASE = {
  recorded_at: "2026-10-19",
  main_story_open_at: null,
  income_per_hour: { credit: 1000, battle_data: 10, core_dust: 0.5 },
  future_income_per_hour: { credit: 2000, battle_data: 20, core_dust: 1 },
  stage_clear_resources: { credit: 5000000, battle_data: 100000, core_dust: 3000 },
  activities: []
};

console.log("== 收益账单（ledger.js） ==");

t("未填开放日 → 按 14 天预览，区间 = 数据日期次日 起", function () {
  var led = L.build(BASE);
  assert.strictEqual(led.ok, true);
  assert.strictEqual(led.assumed, true);
  assert.strictEqual(led.start, "2026-10-20");
  assert.strictEqual(led.end, "2026-11-02");
  assert.strictEqual(led.days, 14);
  assert.strictEqual(led.rows.length, 14);
});

t("每日 = 基地费率 × 24（无活动、无开放日）", function () {
  var led = L.build(BASE);
  assert.ok(near(led.rows[0].res.credit, 24000), "credit/day = " + led.rows[0].res.credit);
  assert.ok(near(led.rows[0].res.battle_data, 240), "battle/day = " + led.rows[0].res.battle_data);
  assert.ok(near(led.rows[0].res.core_dust, 12), "dust/day = " + led.rows[0].res.core_dust);
});

t("合计 = Σ明细；日均 = 合计 ÷ 天数", function () {
  var led = L.build(BASE);
  ["credit", "battle_data", "core_dust"].forEach(function (k) {
    assert.ok(near(led.totals[k], sum(led.rows, k), 1e-6), k + " 合计对不上");
    assert.ok(near(led.avg[k], led.totals[k] / led.days, 1e-9), k + " 日均对不上");
  });
  assert.ok(near(led.totals.credit, 24000 * 14, 1e-6));
});

t("填了开放日 → 区间延到开放日，且只在开放日当天叠一次性推图收益", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-11-02" });
  var led = L.build(s);
  assert.strictEqual(led.assumed, false);
  assert.strictEqual(led.start, "2026-10-20");
  assert.strictEqual(led.end, "2026-11-02");
  var openRow = led.rows[led.rows.length - 1];
  assert.strictEqual(openRow.isOpen, true);
  assert.strictEqual(led.rows.filter(function (r) { return r.isOpen; }).length, 1);
  // 开放日整行 = 新收益 × 24 + 推图一次性
  assert.ok(near(openRow.res.credit, 2000 * 24 + 5000000), "开放日信用点 = " + openRow.res.credit);
  // 开放日前一天仍是旧收益，且不含推图一次性
  var prev = led.rows[led.rows.length - 2];
  assert.ok(near(prev.res.credit, 1000 * 24), "开放日前一天 = " + prev.res.credit);
});

t("开放日及以后用 future_income_per_hour", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-11-02", stage_clear_resources: {} });
  var led = L.build(s);
  var openRow = led.rows[led.rows.length - 1];
  assert.ok(near(openRow.res.battle_data, 20 * 24), "future battle/day = " + openRow.res.battle_data);
});

t("future 费率为空 → 开放日照旧用现状费率（hasFutureRate=false）", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-11-02", future_income_per_hour: {} });
  var led = L.build(s);
  assert.strictEqual(led.hasFutureRate, false);
  var openRow = led.rows[led.rows.length - 1];
  assert.ok(near(openRow.res.credit, 1000 * 24 + 5000000), "回落现状费率 = " + openRow.res.credit);
});

t("开放日不晚于数据日期 → 空状态 + 明确原因", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-10-19" });
  var led = L.build(s);
  assert.strictEqual(led.ok, false);
  assert.ok(/不晚于数据日期/.test(led.reason), led.reason);
});

t("缺数据日期 → 空状态 + 明确原因", function () {
  var led = L.build({ income_per_hour: {}, future_income_per_hour: {}, stage_clear_resources: {}, activities: [] });
  assert.strictEqual(led.ok, false);
  assert.ok(/数据日期/.test(led.reason), led.reason);
});

t("活动逐日产出并入当天（无模板数据时静默忽略，不抛错）", function () {
  var s = Object.assign({}, BASE, { activities: [{ template: "__not_exist__", start_date: "2026-10-18" }] });
  var led = L.build(s);
  assert.strictEqual(led.ok, true);
  assert.strictEqual(led.days, 14);
});

t("活动逐日产出真的加进了当天金额（byDate[d].res 这一层不能漏）", function () {
  var tpl = require(path.join(__dirname, "data/event_templates.json"));
  global.NikkeEvents.setTemplates(tpl);
  var s = Object.assign({}, BASE, { activities: [{ template: "small14", start_date: "2026-10-22" }] });
  var led = L.build(s);
  var plain = L.build(BASE);
  var actRow = led.rows.filter(function (r) { return r.hasAct; });
  var plainRow = plain.rows.filter(function (r) { return r.date === "2026-10-22"; })[0];
  var sameRow = led.rows.filter(function (r) { return r.date === "2026-10-22"; })[0];
  assert.ok(actRow.length > 0, "应出现带活动标签的日期");
  assert.ok(actRow.length === 12, "活动 10-22 起、账单到 11-02 止 → 应命中 12 天，实际 " + actRow.length);
  assert.ok(sameRow.res.credit > plainRow.res.credit + 1000,
    "活动日信用点应高于纯基地日：" + sameRow.res.credit + " vs " + plainRow.res.credit);
  assert.ok(sameRow.res.battle_data > plainRow.res.battle_data,
    "活动日战斗数据应高于纯基地日");
  // 逐日增量应与引擎 byDate 完全一致
  var sched = global.NikkeEvents.schedule({ recorded_at: "2026-10-19T00:00:00", activities: s.activities });
  ["credit", "battle_data", "core_dust"].forEach(function (k) {
    var want = (sched.byDate["2026-10-22"].res || {})[k] || 0;
    var got = sameRow.res[k] - plainRow.res[k];
    assert.ok(near(got, want, 1e-6), k + " 活动增量 = " + got + "，引擎 = " + want);
  });
  global.NikkeEvents.setTemplates(null);
});

t("CSV：BOM + 表头 + 每日行 + 合计行", function () {
  var led = L.build(BASE);
  var csv = L.csv(led);
  assert.strictEqual(csv.charCodeAt(0), 0xfeff, "缺少 UTF-8 BOM");
  var lines = csv.replace(/^\ufeff/, "").split("\r\n");
  assert.strictEqual(lines.length, 1 + led.days + 1);
  assert.ok(/^日期,星期,/.test(lines[0]), lines[0]);
  assert.ok(/^合计,/.test(lines[lines.length - 1]), lines[lines.length - 1]);
});

t("snapSlice → build 与直接 build 结果完全一致（序列化不掉口径）", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-11-02" });
  var slice = L.snapSlice(s, { saved_at: "2026-10-19", capture_time: "21:00" });
  var a = L.build(s);
  var b = L.build(JSON.parse(JSON.stringify(slice)));
  assert.strictEqual(a.days, b.days);
  assert.strictEqual(a.start, b.start);
  assert.strictEqual(a.end, b.end);
  assert.deepStrictEqual(a.totals, b.totals);
  s.recorded_at = new Date(2026, 9, 19);   // Date 入参也要能序列化成同一结果
  var c = L.build(JSON.parse(JSON.stringify(L.snapSlice(s, {}))));
  assert.deepStrictEqual(c.totals, a.totals);
});

t("formChanged：saved_at / capture_time 任一变化即视为改过", function () {
  var slice = { form_saved_at: "2026-10-19", form_capture_time: "21:00" };
  assert.strictEqual(L.formChanged(slice, { saved_at: "2026-10-19", capture_time: "21:00" }), false);
  assert.strictEqual(L.formChanged(slice, { saved_at: "2026-10-19", capture_time: "21:05" }), true);
  assert.strictEqual(L.formChanged(slice, { saved_at: "2026-10-20", capture_time: "21:00" }), true);
  assert.strictEqual(L.formChanged(null, { saved_at: "x" }), false);
});

t("MAX_DAYS 防御：开放日填到十年后也不爆表", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2036-10-19" });
  var led = L.build(s);
  assert.strictEqual(led.days, L.MAX_DAYS);
});

/* ================= R49：箱子收入 + 按周几 ================= */

var BOXES = require(path.join(__dirname, "js/boxes.js"));
var TPL = require(path.join(__dirname, "data/event_templates.json"));

/* 与计算器 BOX_DEFS 同构的自选箱定义（units = 挑战者，hours = 方舟/30天） */
var DEFS = [
  { name: "方舟官方补给物资Ⅰ", quantity: 0, options: [
    { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
    { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" }] },
  { name: "30天成长补给箱", quantity: 0, options: [
    { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
    { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" }] },
  { name: "挑战者成长宝箱", quantity: 0, options: [
    { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
    { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" }] },
];

function actSnap(extra) {
  global.NikkeEvents.setTemplates(TPL);
  return Object.assign({}, BASE, {
    main_story_open_at: "2026-11-04",
    selectable_boxes: DEFS,
    challenger_pref: "auto",
    activities: [{ template: "small14", start_date: "2026-10-22" }]
  }, extra || {});
}

t("固定小时箱折合 = boxes.js fixedBoxResources 逐值一致（14 天全对拍）", function () {
  var sched = global.NikkeEvents.schedule({ recorded_at: "2026-10-19T00:00:00", activities: actSnap().activities });
  var rate = { credit: 29160, battle_data: 13684, core_dust: 13.6 }, bad = 0;
  sched.dates.forEach(function (d) {
    var fixed = sched.byDate[d].fixed || {};
    var mine = L.dayBox(fixed, {}, rate, "core_dust", {}, "auto");
    var ref = BOXES.fixedBoxResources({ fixed_boxes: fixed }, rate);
    ["credit", "battle_data", "core_dust"].forEach(function (r) {
      if (Math.abs(mine.res[r] - ref[r]) > 1e-6) bad++;
    });
  });
  assert.strictEqual(bad, 0, "固定箱折合与引擎口径不一致 " + bad + " 处");
});

t("芯尘盒走 TRUNC（floor(rate×h)×n），信用点/战斗数据不取整", function () {
  // rate 芯尘 13.6/h，8h → floor(108.8)=108，×2 = 216
  var d = L.dayBox({ "芯尘盒": { "8": 2 } }, {}, { credit: 1000, battle_data: 10, core_dust: 13.6 }, "core_dust", {}, "auto");
  assert.strictEqual(d.res.core_dust, 216, "芯尘 8h×2 = " + d.res.core_dust);
  assert.strictEqual(d.count, 2);
  var e = L.dayBox({ "信用点盒": { "12": 3 } }, {}, { credit: 1000, battle_data: 10, core_dust: 13.6 }, "core_dust", {}, "auto");
  assert.strictEqual(e.res.credit, 1000 * 12 * 3, "信用点 12h×3 = " + e.res.credit);
  // 成长套组：三资源各按小时收益（芯尘同样 TRUNC）
  var g = L.dayBox({ "成长套组": { "1": 5 } }, {}, { credit: 1000, battle_data: 10, core_dust: 13.6 }, "core_dust", {}, "auto");
  assert.strictEqual(g.res.credit, 1000 * 5);
  assert.strictEqual(g.res.battle_data, 10 * 5);
  assert.strictEqual(g.res.core_dust, 13 * 5, "成长套组芯尘也应 TRUNC：" + g.res.core_dust);
});

t("自选箱 hours 模式按折算目标取值，units 模式跟随 challenger_pref", function () {
  var rate = { credit: 1000, battle_data: 10, core_dust: 13.6 };
  var sel = { "方舟官方补给物资Ⅰ": 10, "挑战者成长宝箱": 2 };
  var cd = L.dayBox({}, sel, rate, "core_dust", { "方舟官方补给物资Ⅰ": DEFS[0], "挑战者成长宝箱": DEFS[2] }, "auto");
  assert.strictEqual(cd.res.core_dust, 13.6 * 1 * 10 + 16 * 2, "芯尘目标 = " + cd.res.core_dust);
  var cr = L.dayBox({}, sel, rate, "credit", { "方舟官方补给物资Ⅰ": DEFS[0], "挑战者成长宝箱": DEFS[2] }, "auto");
  assert.strictEqual(cr.res.credit, 1000 * 3 * 10, "信用点目标只能走方舟箱 = " + cr.res.credit);
  assert.strictEqual(cr.res.core_dust, 16 * 2, "挑战者箱没有信用点选项 → 仍按芯尘折 = " + cr.res.core_dust);
  var cb = L.dayBox({}, sel, rate, "core_dust", { "方舟官方补给物资Ⅰ": DEFS[0], "挑战者成长宝箱": DEFS[2] }, "battle");
  assert.strictEqual(cb.res.battle_data, 88458 * 2, "pref=battle 时挑战者按战斗数据辑 = " + cb.res.battle_data);
});

t("活动日的箱子真的进了账单（不是只有基地）", function () {
  var led = L.build(actSnap());
  var plain = L.build(Object.assign({}, actSnap(), { activities: [] }));
  assert.ok(led.boxCount > 0, "14 天活动应产出箱子，实际 " + led.boxCount);
  assert.ok(led.boxDays > 0, "应有箱子到账的天数");
  var withBox = led.rows.filter(function (r) { return r.hasBox; });
  assert.ok(withBox.length === led.boxDays, "hasBox 行数应等于 boxDays");
  withBox.forEach(function (r) {
    ["credit", "battle_data", "core_dust"].forEach(function (k) {
      assert.ok(Math.abs(r.all[k] - r.res[k] - r.box[k]) < 1e-6, "all ≠ res + box @" + r.date);
    });
  });
  // 有箱子的日子 total 必然高于同日的纯基地 + 活动直接产出
  assert.ok(led.allTotals.core_dust > plain.allTotals.core_dust, "含箱合计应高于不含箱");
  assert.ok(led.boxTotals.core_dust > 0 && led.boxTotals.credit > 0);
});

t("合计关系：allTotals = totals + boxTotals；日均 = 合计 ÷ 天数", function () {
  var led = L.build(actSnap());
  ["credit", "battle_data", "core_dust"].forEach(function (k) {
    assert.ok(Math.abs(led.allTotals[k] - led.totals[k] - led.boxTotals[k]) < 1e-6, k + " 合计关系不成立");
    assert.ok(Math.abs(led.avgAll[k] - led.allTotals[k] / led.days) < 1e-9, k + " 含箱日均不成立");
    assert.ok(Math.abs(led.avg[k] - led.totals[k] / led.days) < 1e-9, k + " 不含箱日均不成立");
  });
});

t("三种折算目标只影响自选箱那一侧（固定箱不变）", function () {
  var a = L.build(actSnap(), { boxPick: "core_dust" });
  var b = L.build(actSnap(), { boxPick: "credit" });
  assert.ok(Math.abs(a.boxTotals.credit - b.boxTotals.credit) > 1, "换目标后信用点箱折合应变");
  assert.ok(Math.abs(a.boxTotals.battle_data - b.boxTotals.battle_data) < 1e-6, "目标换成信用点不该动战斗数据");
  // 非法目标回落芯尘
  var c = L.build(actSnap(), { boxPick: "__bad__" });
  assert.deepStrictEqual(c.boxTotals, a.boxTotals);
});

t("缺少箱子定义的旧快照：只记个数、不折算，并给出 boxUndef", function () {
  var s = actSnap({ selectable_boxes: null });
  var led = L.build(s);
  assert.ok(led.boxUndef > 0, "应统计到未折算的自选箱");
  // 固定箱自描述 → 仍然折得出来
  assert.ok(led.boxTotals.core_dust > 0, "固定箱不依赖定义，应仍有折合");
  var withDef = L.build(actSnap());
  assert.ok(withDef.boxTotals.core_dust > led.boxTotals.core_dust, "补上定义后折合金额应变大");
});

t("按周几分组：7 个桶相加 = 全期；每组日均 = 组内合计 ÷ 组内天数", function () {
  var led = L.build(actSnap());
  var org = L.groupByWeekday(led);
  assert.strictEqual(org.length, 7);
  assert.deepStrictEqual(org.map(function (g) { return g.name; }),
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
  var sumDays = org.reduce(function (s, g) { return s + g.days; }, 0);
  assert.strictEqual(sumDays, led.days, "分组天数之和应等于总天数");
  ["credit", "battle_data", "core_dust"].forEach(function (k) {
    var s = org.reduce(function (acc, g) { return acc + g.allTotals[k]; }, 0);
    assert.ok(Math.abs(s - led.allTotals[k]) < 1e-6, k + " 分组合计之和 ≠ 全期合计");
  });
  org.forEach(function (g) {
    if (!g.days) return;
    assert.ok(Math.abs(g.avgAll.credit - g.allTotals.credit / g.days) < 1e-9, g.name + " 日均不成立");
  });
});

t("筛选：agg(某一周几的行) = 该分组；且筛选不影响全期", function () {
  var led = L.build(actSnap());
  var org = L.groupByWeekday(led);
  var tue = org.filter(function (g) { return g.name === "周二"; })[0];
  var rows = led.rows.filter(function (r) { return r.wd === tue.wd; });
  var a = L.agg(rows);
  assert.strictEqual(a.days, tue.days);
  assert.deepStrictEqual(a.allTotals, tue.allTotals);
  assert.deepStrictEqual(a.boxTotals, tue.boxTotals);
  assert.strictEqual(a.boxCount, tue.boxCount);
  // 全期数据不受筛选影响
  var again = L.build(actSnap());
  assert.deepStrictEqual(again.allTotals, led.allTotals);
});

t("星期计算：wdOf / weekdayCN 与日期一致", function () {
  assert.strictEqual(L.weekdayCN("2026-10-19"), "周一");
  assert.strictEqual(L.weekdayCN("2026-10-20"), "周二");
  assert.strictEqual(L.weekdayCN("2026-10-25"), "周日");
  assert.strictEqual(L.wdOf("2026-10-19"), 1);
  assert.strictEqual(L.wdOf("2026-10-25"), 0);
  assert.strictEqual(L.wdOf("bad"), -1);
});

t("CSV：含箱子三列 + 箱数；按筛选行导出时合计也跟着变", function () {
  var led = L.build(actSnap());
  var all = L.csv(led).replace(/^\ufeff/, "").split("\r\n");
  assert.strictEqual(all.length, 1 + led.days + 1);
  assert.ok(/^日期,星期,/.test(all[0]), all[0]);
  assert.ok(/其中箱子 /.test(all[0]), "表头缺「其中箱子」列：" + all[0]);
  assert.ok(/箱数/.test(all[0]), "表头缺「箱数」列");
  var cols = all[0].split(",").length;
  all.slice(1).forEach(function (ln, i) {
    assert.strictEqual(ln.split(",").length, cols, "第 " + (i + 1) + " 行列数不一致：" + ln);
  });
  // 筛选导出
  var rows = led.rows.filter(function (r) { return r.wd === 1; });
  var sub = L.csv(led, { rows: rows }).replace(/^\ufeff/, "").split("\r\n");
  assert.strictEqual(sub.length, 1 + rows.length + 1, "筛选导出行数不对");
  assert.ok(/^合计,/.test(sub[sub.length - 1]));
});

t("snapSlice 带上箱子定义与偏好，build 结果逐值一致", function () {
  var s = actSnap();
  var slice = L.snapSlice(s, { saved_at: "2026-10-19", capture_time: "21:00" });
  assert.strictEqual(slice.v, 2);
  assert.strictEqual(slice.box_defs.length, 3, "box_defs 应带 3 个自选箱定义");
  assert.strictEqual(slice.challenger_pref, "auto");
  var a = L.build(s);
  var b = L.build(JSON.parse(JSON.stringify(slice)));
  assert.deepStrictEqual(a.allTotals, b.allTotals);
  assert.deepStrictEqual(a.boxTotals, b.boxTotals);
  assert.strictEqual(a.boxCount, b.boxCount);
});

t("月卡箱不进逐日账单（避免与开放日箱量重复计）", function () {
  // monthly_card 只影响开放日箱量；账单不读该字段 → 加不加它账单完全一样
  var a = L.build(actSnap({ monthly_card: true }));
  var b = L.build(actSnap({ monthly_card: false }));
  assert.deepStrictEqual(a.allTotals, b.allTotals);
});

console.log("\n结果：PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
