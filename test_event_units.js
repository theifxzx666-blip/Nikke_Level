/* test_event_units.js — 活动收益单元测试（对照 docs/《活动收益置入-实施提示词.md》9.1 验收基线）
   运行：node test_event_units.js   → 必须输出 ALL EVENT TESTS PASSED
   基线由 Python 引擎实跑得出（活动收益引擎 2026-10-11 口径修正后），禁止凭记忆改写。 */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = function (url) {
  const p = path.resolve(__dirname, String(url));
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};

require("./js/core.js");
require("./js/events.js");
require("./js/outpost.js");
require("./js/boxes.js");
require("./js/scenarios.js");
const EV = global.NikkeEvents;
const S = global.NikkeScenarios;

const TPL = JSON.parse(fs.readFileSync(path.join(__dirname, "data/event_templates.json"), "utf8"));
EV.setTemplates(TPL);

let pass = true;
let failed = 0;
function check(name, actual, expect, tol) {
  const ok = Math.abs(actual - expect) <= (tol == null ? 1e-6 : tol);
  if (!ok) { console.log("FAIL " + name + "  actual=" + actual + "  expect=" + expect); pass = false; failed += 1; }
}

function fixedOf(tot, lab, h) { return (tot.fixed[lab] && tot.fixed[lab][h]) || 0; }
function selOf(tot, name) { return tot.selectable[name] || 0; }

/* ---------- 9.1 三档模板总产出（含每日任务 + 签到；与起始日无关） ----------
   2026-10-12 口径修正后的基线（官方拆包复核）：
     · 挑战关卡开放日 = 首通 + 通关（引擎 aggregate 改动）→ battle/dust/challenger 上调
     · 任务代币 large 6050 → 21天 5300+地图1200 / 28天 5600
     · 补 14/28 天官方签到；新增 12h 三资源盒
     · 挑战关数值改为官方精确值（不再 K 取整）；挑战 1-2/1-3 补高品质铸模×5（不涉三资源） */
const BASE = {
  small14: { days: 14, credit: 2398520, battle: 13149806, dust: 240, challenger: 205,
             c1: 10, c12: 1, b1: 10, b12: 1, d1: 324, d12: 1, b2: 12, d2: 12, g1: 14, g8: 0, g12: 0, ark: 24 },
  large21: { days: 21, credit: 4580500, battle: 13149806, dust: 240, challenger: 450,
             c1: 35, c12: 0, b1: 14, b12: 0, d1: 493, d12: 0, b2: 15, d2: 15, g1: 21, g8: 1, g12: 1, ark: 46 },
  large28: { days: 28, credit: 5447420, battle: 13149806, dust: 240, challenger: 625,
             c1: 14, c12: 0, b1: 14, b12: 0, d1: 612, d12: 0, b2: 15, d2: 15, g1: 28, g8: 1, g12: 1, ark: 15 },
  /* 28 天 Map 版（LIE CAUSE RECOIL，官方拆包 2026-10-24 录入）：无每日任务箱类奖励、
     任务一次性箱 芯尘盒1h/成长套组1h/方舟Ⅰ×20、商店买不完（代币 15890 < 固定项 30920） */
  large28map: { days: 28, credit: 4073420, battle: 13149806, dust: 240, challenger: 625,
                c1: 14, c12: 0, b1: 14, b12: 0, d1: 613, d12: 0, b2: 15, d2: 9, g1: 1, g8: 1, g12: 1, ark: 35 },
};

/* 起始日无关性：三个不同起始日总量必须逐项一致 */
const STARTS = { small14: ["2026-08-19", "2026-09-10", "2026-12-25"],
                 large21: ["2026-09-30", "2026-05-01"],
                 large28: ["2026-09-02", "2026-11-05"],
                 large28map: ["2026-09-02", "2026-11-05"] };

Object.keys(BASE).forEach(function (id) {
  const exp = BASE[id];
  STARTS[id].forEach(function (start, si) {
    const m = EV.planActivity(id, start, null);   // t0 = null → 整窗口（= 全量基线）
    const t = m.totals;
    const tag = id + "@" + start;
    if (si === 0) {
      check(tag + " inject_days", m.inject_days, exp.days, 0);
      check(tag + " days", t.days, exp.days, 0);
    } else {
      check(tag + " inject_days(起始日无关)", m.inject_days, exp.days, 0);
    }
    check(tag + " credit", t.res.credit, exp.credit);
    check(tag + " battle", t.res.battle_data, exp.battle);
    check(tag + " dust", t.res.core_dust, exp.dust);
    check(tag + " 挑战者箱", selOf(t, "挑战者成长宝箱"), exp.challenger);
    check(tag + " 信用点盒1h", fixedOf(t, "信用点盒", 1), exp.c1);
    check(tag + " 信用点盒12h", fixedOf(t, "信用点盒", 12), exp.c12);
    check(tag + " 战斗数据辑盒1h", fixedOf(t, "战斗数据辑盒", 1), exp.b1);
    check(tag + " 战斗数据辑盒12h", fixedOf(t, "战斗数据辑盒", 12), exp.b12);
    check(tag + " 芯尘盒1h", fixedOf(t, "芯尘盒", 1), exp.d1);
    check(tag + " 芯尘盒12h", fixedOf(t, "芯尘盒", 12), exp.d12);
    check(tag + " 战斗数据辑盒2h", fixedOf(t, "战斗数据辑盒", 2), exp.b2);
    check(tag + " 芯尘盒2h", fixedOf(t, "芯尘盒", 2), exp.d2);
    check(tag + " 成长套组1h", fixedOf(t, "成长套组", 1), exp.g1);
    check(tag + " 成长套组8h", fixedOf(t, "成长套组", 8), exp.g8);
    check(tag + " 成长套组12h", fixedOf(t, "成长套组", 12), exp.g12);
    check(tag + " 方舟官方补给物资Ⅰ", selOf(t, "方舟官方补给物资Ⅰ"), exp.ark);
  });
});

/* ---------- 挑战关卡：开放日 = 首通 + 通关（#6 守卫） ---------- */
(function () {
  const t0 = "2026-09-10";
  const mini = {
    event: "mini-challenge", type: "large28", duration: 3, rush_buy: {}, stage_target: "",
    challenges: [{ id: "1-1", open_day: 0, first: { credit: 100, challenger_box: 7 }, sweep: { credit: 10, challenger_box: 2 } }],
    stages: [], stage_blocks: [], tasks: {},
    base_income: { credit: 1, battle: 1, dust: 1 },
  };
  const days = EV.aggregate(EV.instantiate(mini, t0), t0, EV.addDays(t0, 2), 1, 5, "dust");
  check("开放日 credit = first + sweep（#6）", days[t0].credit, 110, 0);
  check("开放日 challenger_box = first + sweep（#6）", days[t0].challenger_box, 9, 0);
  check("开放日次日 credit = 仅 sweep", days[EV.addDays(t0, 1)].credit, 10, 0);
  check("开放日次日 challenger_box = 仅 sweep", days[EV.addDays(t0, 1)].challenger_box, 2, 0);
  check("窗口最后一天仍走 sweep", days[EV.addDays(t0, 2)].credit, 10, 0);
})();

/* ---------- 12h 三资源盒键必须被引擎识别（否则静默丢弃） ---------- */
(function () {
  const t0 = "2026-09-10";
  const mini = {
    event: "mini-12h", type: "small14", duration: 3, rush_buy: {}, stage_target: "",
    challenges: [],
    stages: [{ id: "S1", open_day: 0, tokens: 0,
               reward: { credit_box_12h: 2, battle_box_12h: 3, dust_box_12h: 4, growth_box_12h: 5 } }],
    stage_blocks: [{ id: "A", open_day: 0, rush: false, chapters: ["S1"] }],
    tasks: {}, base_income: { credit: 1, battle: 1, dust: 1 },
  };
  const d = EV.aggregate(EV.instantiate(mini, t0), t0, EV.addDays(t0, 2), 1, 1, "dust")[t0] || {};
  check("12h 信用点盒被识别", d.credit_box_12h, 2, 0);
  check("12h 战斗数据辑盒被识别", d.battle_box_12h, 3, 0);
  check("12h 芯尘盒被识别", d.dust_box_12h, 4, 0);
  check("12h 成长套组被识别", d.growth_box_12h, 5, 0);
})();

/* ---------- 签到：14 / 28 天模板必须带 checkin（#4/#5 守卫） ---------- */
(function () {
  const s14 = TPL.templates.small14, l28 = TPL.templates.large28;
  check("small14 缺 12h 三资源盒签到", (s14.checkin || []).some(function (c) {
    const r = c.reward || {}; return r.credit_box_12h && r.battle_box_12h && r.dust_box_12h; }) ? 1 : 0, 1, 0);
  check("small14 缺方舟 I×12 签到", (s14.checkin || []).filter(function (c) { return (c.reward || {}).ark_box === 12; }).length, 2, 0);
  check("large28 checkin 项数 = 4", (l28.checkin || []).length, 4, 0);
  check("large28 含成长套组8h/12h", (l28.checkin || []).some(function (c) { return (c.reward || {}).growth_box_8h; })
    && (l28.checkin || []).some(function (c) { return (c.reward || {}).growth_box_12h; }) ? 1 : 0, 1, 0);
  check("large21 签到仍为 4 项（官方 1008203）", (TPL.templates.large21.checkin || []).length, 4, 0);
})();

/* ---------- 任务代币口径（#1/#3 守卫） ---------- */
check("small14 tasks.tokens = 8300", TPL.templates.small14.tasks.tokens, 8300, 0);
check("large28 tasks.tokens = 5600（旧 6050 为笔误）", TPL.templates.large28.tasks.tokens, 5600, 0);
check("large21 tasks.tokens = 5300 + 地图 1200", TPL.templates.large21.tasks.tokens, 6500, 0);
check("large28map tasks.tokens = 6970（10203 6850 + 10201 120）", TPL.templates.large28map.tasks.tokens, 6970, 0);
check("large28map 一次性任务箱 3 类（芯尘盒1h/成长套组1h/方舟Ⅰ）", Object.keys(TPL.templates.large28map.tasks.boxes || {}).length, 3, 0);
check("large28map 无每日任务（本期每日只给活动点数）", TPL.templates.large28map.daily_task ? 1 : 0, 0, 0);
check("large28map 签到 4 项可入账档", (TPL.templates.large28map.checkin || []).length, 4, 0);
check("large28map 商店 19 项（4 件珠宝兑票不入店）", TPL.templates.large28map.shop.items.length, 19, 0);
check("large28map 主线 36 关 / 挑战 7 关", (TPL.templates.large28map.stages || []).length * 1000 + (TPL.templates.large28map.challenges || []).length, 36007, 0);
check("large28map 关卡组开放日 0/7/14", TPL.templates.large28map.stage_blocks.map(function (b) { return b.open_day; }).join("/") === "0/7/14" ? 1 : 0, 1, 0);
check("large28map 扫荡目标 S2H1-11", TPL.templates.large28map.stage_target === "S2H1-11" ? 1 : 0, 1, 0);

/* ---------- 9.4 起算点 / 已结束 断言 ---------- */
const T0 = "2026-10-09";
Object.keys(BASE).forEach(function (id) {
  const D = BASE[id].days;
  const full = EV.planActivity(id, T0, null);                 // 全窗口
  const atT0 = EV.planActivity(id, T0, T0);                   // 起始日 = 数据日期 → 计入 [T0+1, Eend]
  check(id + " 起始日=T0 → 计入区间天数 = duration-1", atT0.inject_days, D - 1, 0);
  check(id + " 起始日=T0+1 → 计入全部天数", EV.planActivity(id, EV.addDays(T0, 1), T0).inject_days, D, 0);
  const ended = EV.planActivity(id, EV.addDays(T0, -(D - 1)), T0);   // end == T0 → 已结束
  check(id + " 已结束（Eend=T0）贡献为 0", ended.inject_days, 0, 0);
  check(id + " 已结束 credit=0", ended.totals.res.credit, 0, 0);
  check(id + " 已结束 挑战者箱=0", selOf(ended.totals, "挑战者成长宝箱"), 0, 0);
  check(id + " 剩最后一天（Eend=T0+1）→ 计入 1 天", EV.planActivity(id, EV.addDays(T0, -(D - 2)), T0).inject_days, 1, 0);
  // 起始日 = T0 → 差额恰为「第 0 天」的引擎产出（每日任务/签到不动三资源）
  const day0 = EV.aggregate(EV.instantiate(TPL.templates[id], T0), T0, T0, 1, 5, "dust")[T0] || {};
  check(id + " 起算点差额 credit == 第0天产出", full.totals.res.credit - atT0.totals.res.credit, day0.credit || 0, 1e-6);
  check(id + " 起算点差额 battle == 第0天产出", full.totals.res.battle_data - atT0.totals.res.battle_data, day0.battle || 0, 1e-6);
  check(id + " 起算点差额 挑战者箱 == 第0天产出", selOf(full.totals, "挑战者成长宝箱") - selOf(atT0.totals, "挑战者成长宝箱"), day0.challenger_box || 0, 1e-6);
  check(id + " 起算点差额 成长套组1h == 1（第0天：每日任务或一次性任务箱）", fixedOf(full.totals, "成长套组", 1) - fixedOf(atT0.totals, "成长套组", 1), 1, 1e-6);
  // 多活动累加：① 窗口重叠 → 按日并集；② 窗口不重叠 → 天数与资源相加
  const sum = EV.schedule({ recorded_at: new Date(T0 + "T00:00:00"), activities: [
    { template: id, start_date: T0 }, { template: id, start_date: EV.addDays(T0, 1) }] });
  check(id + " 多活动(重叠) 并集天数", sum.totals.days, D, 0);
  check(id + " 多活动(重叠) credit", sum.totals.res.credit, atT0.totals.res.credit + full.totals.res.credit, 1e-6);
  const late = EV.planActivity(id, EV.addDays(T0, 120), T0);
  const sum2 = EV.schedule({ recorded_at: new Date(T0 + "T00:00:00"), activities: [
    { template: id, start_date: T0 }, { template: id, start_date: EV.addDays(T0, 120) }] });
  check(id + " 多活动(不重叠) 天数相加", sum2.totals.days, atT0.inject_days + late.inject_days, 0);
  check(id + " 多活动(不重叠) credit 相加", sum2.totals.res.credit, atT0.totals.res.credit + late.totals.res.credit, 1e-6);
});

/* ---------- 无活动时行为完全惰性（向后兼容底线） ---------- */
check("空 activities → 空 schedule", EV.schedule({ recorded_at: new Date("2026-10-09T00:00:00"), activities: [] }).dates.length, 0, 0);
check("缺 activities → 空 schedule", EV.schedule({ recorded_at: new Date("2026-10-09T00:00:00") }).dates.length, 0, 0);
const snapNoAct = { recorded_at: new Date("2026-10-09T00:00:00"), bare_resources: { credit: 1, battle_data: 2, core_dust: 3 }, fixed_boxes: {}, selectable_boxes: [] };
check("inject 空 schedule 原样返回", EV.inject(snapNoAct, EV.EMPTY_SCHEDULE, null) === snapNoAct ? 1 : 0, 1, 0);

/* ---------- 模板清单 ---------- */
check("模板清单 4 档", EV.templateList().length, 4, 0);
check("small14 duration=14", TPL.templates.small14.duration, 14, 0);
check("large21 duration=21", TPL.templates.large21.duration, 21, 0);
check("large28 duration=28", TPL.templates.large28.duration, 28, 0);
check("large28map duration=28", TPL.templates.large28map.duration, 28, 0);

/* ---------- tasks.boxes：一次性任务箱类奖励归首日（缺省即无，老模板不受影响） ---------- */
(function () {
  const t0 = "2026-09-10";
  const mk = (boxes) => ({
    event: "mini-taskbox", type: "large28", duration: 3, rush_buy: {}, stage_target: "",
    challenges: [], stages: [], stage_blocks: [],
    tasks: Object.assign({ tokens: 100, one_time: true }, boxes ? { boxes: boxes } : {}),
    base_income: { credit: 1, battle: 1, dust: 1 },
  });
  const a = EV.aggregate(EV.instantiate(mk(null), t0), t0, EV.addDays(t0, 2), 1, 5, "dust");
  check("tasks 无 boxes → 不产生箱", (a[t0].dust_box_1h || 0) + (a[t0].growth_box_1h || 0), 0, 0);
  check("tasks 无 boxes → 代币仍入首日", a[t0].token, 100, 0);
  const b = EV.aggregate(EV.instantiate(mk({ dust_box_1h: 2, growth_box_1h: 1, ark_box: 3 }), t0), t0, EV.addDays(t0, 2), 1, 5, "dust");
  check("tasks.boxes 芯尘盒1h 入首日", b[t0].dust_box_1h, 2, 0);
  check("tasks.boxes 成长套组1h 入首日", b[t0].growth_box_1h, 1, 0);
  check("tasks.boxes 方舟Ⅰ 入首日", b[t0].ark_box, 3, 0);
  check("tasks.boxes 只落首日（次日为 0）", b[EV.addDays(t0, 1)].dust_box_1h || 0, 0, 0);
})();

/* ---------- 场景层集成：现状四档不受活动影响；等待期/future 口径计入活动 ---------- */
function makeSnapshot(acts) {
  const D = (s) => new Date(s + "T00:00:00");
  const snap = {
    recorded_at: D("2026-09-02"),
    current_sync_level: 474,
    target_sync_level: 481,
    alternate_target_level: 501,
    base_level: 483,
    income_per_hour: { credit: 57240, battle_data: 570180, core_dust: 88 },
    future_base_level: 500,
    future_income_per_hour: { credit: 58530, battle_data: 584950, core_dust: 90.02 },
    main_story_open_at: D("2026-09-30"),
    bare_resources: { credit: 25169000, battle_data: 274000000, core_dust: 12181 },
    daily_wipeout_count: 3,
    wipeout_hours_each: 2,
    completed_wipeouts_today: 3,
    daily_full: true,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {
      "芯尘盒": { 24: 30, 12: 26, 8: 7, 4: 1, 2: 315, 1: 1432 },
      "信用点盒": { 24: 9, 12: 5, 8: 11, 4: 0, 2: 149, 1: 1684 },
      "战斗数据辑盒": { 24: 2, 12: 3, 8: 2, 4: 0, 2: 102, 1: 824 },
      "成长套组": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 8 },
    },
    selectable_boxes: [
      { name: "方舟官方补给物资Ⅰ", quantity: 870, options: [
        { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" },
      ] },
      { name: "30天成长补给箱", quantity: 27, options: [
        { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" },
      ] },
      { name: "挑战者成长宝箱", quantity: 340, options: [
        { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
        { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" },
      ] },
    ],
    upgrade_cost: { per_level: { credit: 7441000, battle_data: 67170000, core_dust: 13000 }, range_start: null, range_end: null, range_total: null, tiers: null },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
  };
  if (acts) snap.activities = acts;
  return snap;
}

const r0 = S.evaluate(makeSnapshot(null));
const rAct = S.evaluate(makeSnapshot([{ template: "small14", start_date: "2026-09-10" }]));
check("现状 no_box.days 不受活动影响", rAct.no_box.days, r0.no_box.days, 1e-9);
check("现状 bare.level 不受活动影响", rAct.bare.level, r0.bare.level, 0);
check("现状 fixed.level 不受活动影响", rAct.fixed.level, r0.fixed.level, 0);
check("现状 selectable.level 不受活动影响", rAct.selectable.level, r0.selectable.level, 0);
check("future 口径计入活动 → 开放日裸资源更多",
  rAct.future_main_story.projected_bare.credit > r0.future_main_story.projected_bare.credit ? 1 : 0, 1, 0);
check("future 口径计入活动 → 全箱梭哈等级不降",
  rAct.future_main_story.result.level >= r0.future_main_story.result.level ? 1 : 0, 1, 0);
check("event_summary.available", rAct.event_summary.available ? 1 : 0, 1, 0);
check("event_summary.days == 14（起始日=09-10，计入 [09-03, 09-23]）", rAct.event_summary.days, 14, 0);
check("event_summary.meta[0].inject_start = max(09-10, 数据日期+1)", rAct.event_summary.meta[0].inject_start === "2026-09-10" ? 1 : 0, 1, 0);
check("event_summary.meta[0].inject_end = 09-23", rAct.event_summary.meta[0].inject_end === "2026-09-23" ? 1 : 0, 1, 0);
check("event_summary.level_gain >= 0", rAct.event_summary.level_gain >= 0 ? 1 : 0, 1, 0);
check("活动日全部早于开放日(09-30) → days_before_open=14", rAct.event_summary.days_before_open, 14, 0);
check("活动日全部早于开放日 → days_after_open=0", rAct.event_summary.days_after_open, 0, 0);
check("hits_future = 与开放日有交集", rAct.event_summary.hits_future ? 1 : 0, 1, 0);
check("无活动 → event_summary.available=false", r0.event_summary.available ? 1 : 0, 0, 0);

// 已结束的活动：窗口整体早于数据日期 → 贡献 0、现状/future 都回到无活动基线
const rEnded = S.evaluate(makeSnapshot([{ template: "small14", start_date: "2026-08-01" }]));
check("已结束活动 → available=false", rEnded.event_summary.available ? 0 : 1, 1, 0);
check("已结束活动 → future 等级 == 无活动基线",
  rEnded.future_main_story.result.level, r0.future_main_story.result.level, 0);

// 多活动累加：两个活动 → future 等级不低于单个
const rTwo = S.evaluate(makeSnapshot([
  { template: "small14", start_date: "2026-09-10" },
  { template: "large28", start_date: "2026-09-05" }]));
check("多活动 → future 等级不低于单活动",
  rTwo.future_main_story.result.level >= rAct.future_main_story.result.level ? 1 : 0, 1, 0);
check("多活动 → event_summary.meta 两条", rTwo.event_summary.meta.length, 2, 0);
check("多活动 → 计入天数为并按日去重",
  rTwo.event_summary.days, EV.schedule(makeSnapshot([
    { template: "small14", start_date: "2026-09-10" },
    { template: "large28", start_date: "2026-09-05" }])).dates.length, 0);

console.log(pass ? "ALL EVENT TESTS PASSED" : ("EVENT TESTS FAILED (" + failed + " 项)"));
process.exit(pass ? 0 : 1);
