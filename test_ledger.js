/* test_ledger.js — 收益账单口径回归（纯 node，不依赖浏览器）
   R47：区间推算 / 未填开放日降级 / 开放日一次性推图收益 / 开放日改收益 / 活动逐日并入 /
        合计=Σ明细 / CSV 形态 / snapSlice 序列化往返一致 / formChanged 判定。
   R50：账单只统计「基础自然收益 + 箱子个数」——
        箱子一分数都不折进金额；箱数逐日与引擎 byDate.fixed/.selectable 逐值对拍。 */
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

var RES = ["credit", "battle_data", "core_dust"];
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
  RES.forEach(function (k) {
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
  RES.forEach(function (k) {
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

/* ================= R50：只统计基础自然收益 + 箱子个数 ================= */

var TPL = require(path.join(__dirname, "data/event_templates.json"));

function actSnap(extra) {
  global.NikkeEvents.setTemplates(TPL);
  return Object.assign({}, BASE, {
    main_story_open_at: null,          // 14 天预览，避开开放日一次性收益干扰
    activities: [{ template: "small14", start_date: "2026-10-22" }]
  }, extra || {});
}

t("dayBox 只数个数：固定箱各小时档 + 自选箱相加", function () {
  var d = L.dayBox({ "芯尘盒": { "8": 3, "2": 1 }, "成长套组": { "1": 5 } }, { "挑战者成长宝箱": 63, "方舟官方补给物资Ⅰ": 12 });
  assert.strictEqual(d.nFixed, 9, "固定箱个数 = " + d.nFixed);
  assert.strictEqual(d.nSel, 75, "自选箱个数 = " + d.nSel);
  assert.strictEqual(d.count, 84, "总箱数 = " + d.count);
  // 3 条固定箱（芯尘盒 8h / 芯尘盒 2h / 成长套组 1h）+ 2 条自选箱
  assert.strictEqual(d.items.length, 5, "明细条数 = " + d.items.length);
  // 没有任何箱子 → 0，且明细为空
  var z = L.dayBox(null, null);
  assert.strictEqual(z.count, 0);
  assert.deepStrictEqual(z.items, []);
  // 0 个 / 负数不计数
  assert.strictEqual(L.dayBox({ "芯尘盒": { "8": 0 } }, { "方舟官方补给物资Ⅰ": 0 }).count, 0);
});

t("明细各条个数之和 = 箱数（悬浮提示与列值不能打架）", function () {
  var d = L.dayBox({ "芯尘盒": { "8": 3, "2": 1 } }, { "挑战者成长宝箱": 63 });
  var s = d.items.reduce(function (a, it) { return a + it.count; }, 0);
  assert.strictEqual(s, d.count, "明细和 = " + s + "，箱数 = " + d.count);
  // 固定箱明细带小时数，自选箱不带
  assert.strictEqual(d.items[0].kind, "fixed");
  assert.ok(d.items.some(function (it) { return it.kind === "sel" && it.name === "挑战者成长宝箱"; }));
});

t("活动日真的统计到箱数（不是只有基地天数）", function () {
  var led = L.build(actSnap());
  assert.ok(led.boxTotal > 0, "活动期应产出箱子，实际 " + led.boxTotal);
  assert.ok(led.boxDays > 0, "应有箱子到账的天数");
  assert.ok(led.boxDays <= led.days, "有箱天数不能超过总天数");
  var withBox = led.rows.filter(function (r) { return r.boxCount > 0; });
  assert.strictEqual(withBox.length, led.boxDays, "boxCount>0 的行数应等于 boxDays");
  assert.strictEqual(led.boxTotal, withBox.reduce(function (s, r) { return s + r.boxCount; }, 0), "boxTotal ≠ Σ逐日箱数");
  assert.ok(near(led.boxAvg, led.boxTotal / led.days, 1e-9), "日均箱数 = " + led.boxAvg);
});

t("逐日箱数与引擎 byDate.fixed/.selectable 逐值对拍", function () {
  var s = actSnap();
  var led = L.build(s);
  var sched = global.NikkeEvents.schedule({ recorded_at: "2026-10-19T00:00:00", activities: s.activities });
  var bad = 0;
  led.rows.forEach(function (row) {
    var raw = sched.byDate[row.date] || {};
    var want = 0;
    Object.keys(raw.fixed || {}).forEach(function (lab) {
      Object.keys(raw.fixed[lab] || {}).forEach(function (h) { want += Number(raw.fixed[lab][h]) || 0; });
    });
    Object.keys(raw.selectable || {}).forEach(function (n) { want += Number(raw.selectable[n]) || 0; });
    if (want !== row.boxCount) bad++;
  });
  assert.strictEqual(bad, 0, "箱数与引擎不一致 " + bad + " 天");
});

t("⚠ 箱子的资源一分数都不进金额（金额 = 基地×24 + 活动直接资源）", function () {
  var s = actSnap();
  var led = L.build(s);
  var sched = global.NikkeEvents.schedule({ recorded_at: "2026-10-19T00:00:00", activities: s.activities });
  var bad = 0;
  led.rows.forEach(function (row) {
    var act = (sched.byDate[row.date] || {}).res || {};
    RES.forEach(function (k) {
      var want = BASE.income_per_hour[k] * 24 + (Number(act[k]) || 0);
      if (!near(row.res[k], want, 1e-6)) bad++;
    });
  });
  assert.strictEqual(bad, 0, "有 " + bad + " 个单元格把箱子的资源算进了金额");
  // 有箱子的那天，金额也不会因为「有箱」而变多
  var withBox = led.rows.filter(function (r) { return r.boxCount > 0; })[0];
  var plain = L.build(Object.assign({}, BASE, { activities: [] })).rows.filter(function (r) { return r.date === withBox.date; })[0];
  var act = ((sched.byDate[withBox.date] || {}).res) || {};
  RES.forEach(function (k) {
    assert.ok(near(withBox.res[k], plain.res[k] + (Number(act[k]) || 0), 1e-6),
      k + "：有箱日的金额只应等于基地+活动直接资源");
  });
});

t("旧快照里的箱子定义 / 折算目标 / 挑战者偏好一律不影响金额", function () {
  var a = L.build(actSnap());
  var b = L.build(actSnap({
    selectable_boxes: [{ name: "挑战者成长宝箱", options: [{ label: "芯尘", rewards: { core_dust: 16 }, mode: "units" }] }],
    box_defs: [{ name: "方舟官方补给物资Ⅰ", options: [{ label: "信用点", rewards: { credit: 3 }, mode: "hours" }] }],
    challenger_pref: "battle"
  }));
  assert.deepStrictEqual(a.totals, b.totals, "金额不该受箱子定义影响");
  assert.deepStrictEqual(a.avg, b.avg);
  assert.strictEqual(a.boxTotal, b.boxTotal, "箱数也不该受定义影响");
});

t("按周几分组：7 个桶相加 = 全期；箱数也相加相等；每组日均 = 组内合计 ÷ 组内天数", function () {
  var led = L.build(actSnap());
  var org = L.groupByWeekday(led);
  assert.strictEqual(org.length, 7);
  assert.deepStrictEqual(org.map(function (g) { return g.name; }),
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]);
  var sumDays = org.reduce(function (s, g) { return s + g.days; }, 0);
  assert.strictEqual(sumDays, led.days, "分组天数之和应等于总天数");
  RES.forEach(function (k) {
    var s = org.reduce(function (acc, g) { return acc + g.totals[k]; }, 0);
    assert.ok(near(s, led.totals[k], 1e-6), k + " 分组合计之和 ≠ 全期合计");
  });
  assert.strictEqual(org.reduce(function (s, g) { return s + g.boxTotal; }, 0), led.boxTotal, "分组箱数之和 ≠ 全期箱数");
  org.forEach(function (g) {
    if (!g.days) return;
    assert.ok(near(g.avg.credit, g.totals.credit / g.days, 1e-9), g.name + " 日均不成立");
    assert.ok(near(g.boxAvg, g.boxTotal / g.days, 1e-9), g.name + " 日均箱数不成立");
  });
});

t("筛选：agg(某一周几的行) = 该分组；且筛选不影响全期", function () {
  var led = L.build(actSnap());
  var org = L.groupByWeekday(led);
  var tue = org.filter(function (g) { return g.name === "周二"; })[0];
  var rows = led.rows.filter(function (r) { return r.wd === tue.wd; });
  var a = L.agg(rows);
  assert.strictEqual(a.days, tue.days);
  assert.deepStrictEqual(a.totals, tue.totals);
  assert.strictEqual(a.boxTotal, tue.boxTotal);
  assert.ok(near(a.boxAvg, tue.boxAvg, 1e-9));
  // 全期数据不受筛选影响
  var again = L.build(actSnap());
  assert.deepStrictEqual(again.totals, led.totals);
});

t("星期计算：wdOf / weekdayCN 与日期一致", function () {
  assert.strictEqual(L.weekdayCN("2026-10-19"), "周一");
  assert.strictEqual(L.weekdayCN("2026-10-20"), "周二");
  assert.strictEqual(L.weekdayCN("2026-10-25"), "周日");
  assert.strictEqual(L.wdOf("2026-10-19"), 1);
  assert.strictEqual(L.wdOf("2026-10-25"), 0);
  assert.strictEqual(L.wdOf("bad"), -1);
});

t("CSV：8 列（日期/星期/三资源/箱数/明细/来源），每行列数一致；只导出三资源金额", function () {
  var led = L.build(actSnap());
  var all = L.csv(led).replace(/^\ufeff/, "").split("\r\n");
  assert.strictEqual(all.length, 1 + led.days + 1);
  var head = all[0].split(",");
  assert.deepStrictEqual(head.slice(0, 2), ["日期", "星期"]);
  assert.deepStrictEqual(head.slice(5), ["箱数", "箱子明细", "来源"], "表头尾部不对：" + all[0]);
  assert.strictEqual(head.length, 8, "应为 8 列，实际 " + head.length);
  assert.ok(!/其中箱子/.test(all[0]), "不该再有「其中箱子」折合列");
  all.slice(1).forEach(function (ln, i) {
    assert.strictEqual(ln.split(",").length, 8, "第 " + (i + 1) + " 行列数不一致：" + ln);
  });
  // 合计行：三资源 = 全期合计，第 6 列 = 全期箱数
  var tot = all[all.length - 1].split(",");
  assert.strictEqual(tot[0], "合计");
  RES.forEach(function (k, i) {
    assert.strictEqual(Number(tot[2 + i]), Math.round(led.totals[k]), k + " 合计列不对");
  });
  assert.strictEqual(Number(tot[5]), led.boxTotal, "合计行箱数不对");
  // 筛选导出
  var rows = led.rows.filter(function (r) { return r.wd === 1; });
  var sub = L.csv(led, { rows: rows }).replace(/^\ufeff/, "").split("\r\n");
  assert.strictEqual(sub.length, 1 + rows.length + 1, "筛选导出行数不对");
  assert.ok(/^合计,/.test(sub[sub.length - 1]));
});

t("snapSlice v3：不再携带箱子定义与偏好，build 结果逐值一致", function () {
  var s = actSnap();
  var slice = L.snapSlice(s, { saved_at: "2026-10-19", capture_time: "21:00" });
  assert.strictEqual(slice.v, 3);
  assert.strictEqual(slice.box_defs, undefined, "v3 不该再落 box_defs");
  assert.strictEqual(slice.challenger_pref, undefined, "v3 不该再落 challenger_pref");
  var a = L.build(s);
  var b = L.build(JSON.parse(JSON.stringify(slice)));
  assert.deepStrictEqual(a.totals, b.totals);
  assert.deepStrictEqual(a.avg, b.avg);
  assert.strictEqual(a.boxTotal, b.boxTotal);
  assert.strictEqual(a.boxDays, b.boxDays);
});

t("月卡箱不进逐日账单（避免与开放日箱量重复计）", function () {
  var a = L.build(actSnap({ monthly_card: true }));
  var b = L.build(actSnap({ monthly_card: false }));
  assert.deepStrictEqual(a.totals, b.totals);
  assert.strictEqual(a.boxTotal, b.boxTotal);
});

t("boxText：固定箱带小时数、自选箱只带名字", function () {
  var d = L.dayBox({ "芯尘盒": { "8": 3 } }, { "挑战者成长宝箱": 63 });
  var s = L.boxText(d.items);
  assert.ok(/8h 芯尘盒 ×3/.test(s), s);
  assert.ok(/挑战者成长宝箱 ×63/.test(s), s);
  assert.strictEqual(L.boxText([]), "");
});

/* ================= R51：周期口径 + 每天箱子明细 ================= */

t("周期口径：span=30 → 固定 30 天，与开放日无关", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-12-31" });
  var led = L.build(s, { span: 30 });
  assert.strictEqual(led.span, 30);
  assert.strictEqual(led.start, "2026-10-20");
  assert.strictEqual(led.end, "2026-11-18");
  assert.strictEqual(led.days, 30);
  assert.strictEqual(led.rows.length, 30);
  // 开放日远在区间之外 → 不该出现开放日行，也不该用 future 费率
  assert.strictEqual(led.rows.filter(function (r) { return r.isOpen; }).length, 0);
  assert.ok(near(led.rows[0].res.credit, 1000 * 24), "开放日外的日期应用现状费率");
});

t("周期口径：开放日落在区间内 → 推图收益只计一次、之后改用新基地收益", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-11-02" });
  var led = L.build(s, { span: 60 });
  assert.strictEqual(led.days, 60, "60 天周期不能被开放日截断");
  var opens = led.rows.filter(function (r) { return r.isOpen; });
  assert.strictEqual(opens.length, 1, "推图收益只能出现在开放日那一天");
  assert.ok(near(opens[0].res.credit, 2000 * 24 + 5000000), "开放日 = 新收益×24 + 推图一次性");
  // 开放日之后的日子：只有新收益，不再重复叠推图
  var after = led.rows.filter(function (r) { return r.date > "2026-11-02"; });
  assert.ok(after.length > 0);
  after.forEach(function (r) { assert.ok(near(r.res.credit, 2000 * 24), r.date + " 重复计了推图收益"); });
});

t("周期口径与「到开放日」口径逐日一致（只是天数不同，不是另算一套）", function () {
  var s = Object.assign({}, BASE, { main_story_open_at: "2026-12-31", activities: [{ template: "small14", start_date: "2026-10-22" }] });
  var a = L.build(s);                       // 到开放日，天数远超 30
  var b = L.build(s, { span: 30 });
  var n = Math.min(a.days, b.days);
  assert.ok(n > 0);
  for (var i = 0; i < n; i++) {
    assert.strictEqual(a.rows[i].date, b.rows[i].date, "第 " + i + " 行日期不一致");
    RES.forEach(function (k) {
      assert.ok(near(a.rows[i].res[k], b.rows[i].res[k], 1e-6), "第 " + i + " 行 " + k + " 不一致");
    });
    assert.strictEqual(a.rows[i].boxCount, b.rows[i].boxCount, "第 " + i + " 行箱数不一致");
  }
});

t("周期口径：spans 上界受 MAX_DAYS 保护（传 1000 天不爆表）", function () {
  var led = L.build(BASE, { span: 1000 });
  assert.strictEqual(led.span, L.MAX_DAYS);
  assert.strictEqual(led.days, L.MAX_DAYS);
});

t("spanStats：每个周期天数 = 周期本身，合计与单独 build 逐值一致", function () {
  var s = actSnap({ main_story_open_at: "2026-11-20" });
  var list = L.spanStats(s);
  assert.strictEqual(list.length, L.SPANS.length);
  assert.deepStrictEqual(list.map(function (g) { return g.span; }), [30, 60, 90, 180, 365]);
  list.forEach(function (g) {
    assert.strictEqual(g.ok, true, g.span + " 天不可用");
    assert.strictEqual(g.days, g.span, g.span + " 天周期实际 " + g.days + " 天");
    var led = L.build(s, { span: g.span });
    RES.forEach(function (k) {
      assert.ok(near(g.totals[k], led.totals[k], 1e-6), g.span + " 天 " + k + " 合计不一致");
      assert.ok(near(g.avg[k], led.avg[k], 1e-6), g.span + " 天 " + k + " 日均不一致");
    });
    assert.strictEqual(g.boxTotal, led.boxTotal, g.span + " 天箱数不一致");
  });
  // 周期越长，合计只会更大（单调不减），箱数同理
  for (var i = 1; i < list.length; i++) {
    RES.forEach(function (k) {
      assert.ok(list[i].totals[k] >= list[i - 1].totals[k] - 1e-6, k + " 在 " + list[i].span + " 天反而变小");
    });
    assert.ok(list[i].boxTotal >= list[i - 1].boxTotal, list[i].span + " 天箱数反而变少");
  }
});

t("spanStats：span=0 可混在列表里（页面「到开放日」基准行）", function () {
  var s = actSnap({ main_story_open_at: "2026-11-20" });
  var list = L.spanStats(s, [0, 30]);
  assert.strictEqual(list[0].span, 0);
  assert.strictEqual(list[0].days, L.build(s).days, "span=0 应等于「到开放日」口径");
  assert.strictEqual(list[1].days, 30);
});

t("spanStats：缺数据日期 → 空数组（页面照常渲染空状态）", function () {
  assert.deepStrictEqual(L.spanStats({ income_per_hour: {} }), []);
  assert.deepStrictEqual(L.spanStats(null), []);
});

t("boxSummary：个数之和 = 总箱数，按个数降序，同名不同档分开", function () {
  var led = L.build(actSnap());
  var bs = L.boxSummary(led.rows);
  assert.ok(bs.length > 0, "活动期应有箱子构成");
  assert.strictEqual(bs.reduce(function (s, b) { return s + b.count; }, 0), led.boxTotal, "汇总个数之和 ≠ 总箱数");
  for (var i = 1; i < bs.length; i++) {
    assert.ok(bs[i - 1].count >= bs[i].count, "未按个数降序：" + bs[i - 1].count + " → " + bs[i].count);
  }
  // 逐日明细逐条求和 = 汇总（不能有漏计或多计）
  var fromRows = 0;
  led.rows.forEach(function (r) { (r.boxItems || []).forEach(function (it) { fromRows += it.count; }); });
  assert.strictEqual(fromRows, led.boxTotal, "逐日明细之和 ≠ 总箱数");
  // 同名不同小时档必须是两行
  var d = L.dayBox({ "芯尘盒": { "8": 2, "2": 3 } }, {});
  var two = L.boxSummary([{ date: "2026-10-20", boxItems: d.items }]);
  assert.strictEqual(two.length, 2, "8h 与 2h 应分成两行");
  assert.deepStrictEqual(two.map(function (x) { return x.hours; }).sort(), [2, 8]);
});

t("boxSummary：首末日期与出现天数按实际有箱的日子算", function () {
  var items = L.dayBox({ "芯尘盒": { "8": 1 } }, { "挑战者成长宝箱": 5 }).items;
  var rows = [
    { date: "2026-10-22", boxItems: items.filter(function (x) { return x.kind === "sel"; }) },
    { date: "2026-10-25", boxItems: items },
    { date: "2026-11-01", boxItems: items.filter(function (x) { return x.kind === "sel"; }) }
  ];
  var bs = L.boxSummary(rows);
  var sel = bs.filter(function (b) { return b.name === "挑战者成长宝箱"; })[0];
  assert.strictEqual(sel.count, 15, "3 天 × 5 = 15，实际 " + sel.count);
  assert.strictEqual(sel.days, 3);
  assert.strictEqual(sel.first, "2026-10-22");
  assert.strictEqual(sel.last, "2026-11-01");
  var fx = bs.filter(function (b) { return b.name === "芯尘盒"; })[0];
  assert.strictEqual(fx.count, 1);
  assert.strictEqual(fx.days, 1);
  assert.strictEqual(fx.first, "2026-10-25");
  // 空输入 → 空数组（页面隐藏汇总表）
  assert.deepStrictEqual(L.boxSummary([]), []);
});

/* ================= R52：箱子比重（只数个数，按箱名合并） ================= */

t("boxMix：按箱名合并（同名不同小时档算一类），个数之和 = 总箱数", function () {
  var led = L.build(actSnap());
  var mix = L.boxMix(led.rows);
  assert.ok(mix.length > 0, "活动期应有箱子构成");
  assert.strictEqual(mix.reduce(function (s, m) { return s + m.count; }, 0), led.boxTotal,
    "比重个数之和 ≠ 总箱数");
  // 8h 芯尘盒 + 2h 芯尘盒 必须合成一类
  var rows = [{ date: "2026-10-20", boxItems: L.dayBox({ "芯尘盒": { "8": 2, "2": 3 }, "信用点盒": { "1": 1 } }, {}).items }];
  var mix2 = L.boxMix(rows);
  assert.strictEqual(mix2.length, 2, "应只有「芯尘盒 / 信用点盒」两类，实际 "
    + mix2.map(function (m) { return m.name; }).join(","));
  var dust = mix2.filter(function (m) { return m.name === "芯尘盒"; })[0];
  assert.strictEqual(dust.count, 5, "芯尘盒 = 2 + 3，实际 " + dust.count);
  assert.ok(near(dust.pct, 5 / 6 * 100, 1e-9), "芯尘盒占比 = " + dust.pct);
});

t("boxMix：按个数降序；自选箱单独成类（不与固定箱混）", function () {
  var rows = [{ date: "2026-10-20",
    boxItems: L.dayBox({ "信用点盒": { "1": 1 } }, { "挑战者成长宝箱": 9, "方舟官方补给物资Ⅰ": 3 }).items }];
  var mix = L.boxMix(rows);
  assert.deepStrictEqual(mix.map(function (m) { return m.name; }),
    ["挑战者成长宝箱", "方舟官方补给物资Ⅰ", "信用点盒"]);
  for (var i = 1; i < mix.length; i++) {
    assert.ok(mix[i - 1].count >= mix[i].count, "未按个数降序");
  }
  assert.strictEqual(mix[0].kind, "sel");
});

t("boxMix：pct 是个数占比（Σ = 100），不折算资源、不改写传入的行", function () {
  var led = L.build(actSnap());
  var mix = L.boxMix(led.rows);
  var pctSum = mix.reduce(function (s, m) { return s + m.pct; }, 0);
  assert.ok(near(pctSum, 100, 1e-9), "占比之和 = " + pctSum);
  mix.forEach(function (m) {
    assert.strictEqual(m.credit, undefined, "不应带资源字段");
    assert.ok(m.count > 0);
    assert.ok(m.pct > 0 && m.pct <= 100);
  });
  // 同一份 rows 还要渲染明细表 → 不能被改写
  assert.ok(led.rows[0].res && led.rows[0].boxCount !== undefined);
});

t("boxMix：空输入 / 无箱 → 空数组；与 boxSummary 的总个数一致", function () {
  assert.deepStrictEqual(L.boxMix([]), []);
  assert.deepStrictEqual(L.boxMix([{ date: "2026-10-20", boxItems: [] }]), []);
  var led = L.build(actSnap());
  var a = L.boxMix(led.rows).reduce(function (s, m) { return s + m.count; }, 0);
  var b = L.boxSummary(led.rows).reduce(function (s, m) { return s + m.count; }, 0);
  assert.strictEqual(a, b, "比重与汇总的总个数不一致");
});

console.log("\n结果：PASS " + pass + " / FAIL " + fail);
process.exit(fail ? 1 : 0);
