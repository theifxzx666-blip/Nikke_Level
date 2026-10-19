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

console.log("\n结果：PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
