/* 月卡（30 天成长补给箱 · 每日 1 个）回归验证
   口径：默认关闭；开启后按「数据日期 → 新主线开放日」天数把 30天成长补给箱 并入「开放日快照」，
        现状口径（immediateLevels 不传 future）与 box_gain_vs_now 均不受影响。
   运行：node test_monthly_card.js   （期望 ALL MONTHLY-CARD TESTS PASSED） */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = function (url) {
  const p = path.resolve(__dirname, String(url));
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};

require("./js/core.js");
require("./js/outpost.js");
require("./js/events.js");
require("./js/boxes.js");
require("./js/scenarios.js");
const C = global.NikkeCore, O = global.NikkeOutpost, S = global.NikkeScenarios, EV = global.NikkeEvents;
const BOX = "30天成长补给箱";

let fail = 0;
function chk(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  console.log((ok ? "PASS " : "FAIL ") + name + "  actual=" + JSON.stringify(actual) + "  expect=" + JSON.stringify(expect));
  if (!ok) fail++;
}

function makeSnapshot(extra) {
  const D = (s) => new Date(s + "T00:00:00");
  return Object.assign({
    recorded_at: D("2026-10-14"),
    current_sync_level: 474,
    target_sync_level: 501,
    alternate_target_level: 501,
    base_level: 483,
    income_per_hour: { credit: 57240, battle_data: 570180, core_dust: 88 },
    future_base_level: 500,
    future_income_per_hour: { credit: 58530, battle_data: 584950, core_dust: 90.02 },
    main_story_open_at: D("2026-12-16"),     // 63 天等待期
    bare_resources: { credit: 25169000, battle_data: 274000000, core_dust: 12181 },
    daily_wipeout_count: 3,
    wipeout_hours_each: 2,
    completed_wipeouts_today: 3,
    daily_full: true,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {
      "芯尘盒": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 0 },
      "信用点盒": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 0 },
      "战斗数据辑盒": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 0 },
      "成长套组": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 0 },
    },
    selectable_boxes: [
      { name: "方舟官方补给物资Ⅰ", quantity: 100, options: [
        { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" }] },
      { name: BOX, quantity: 10, options: [
        { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" }] },
      { name: "挑战者成长宝箱", quantity: 100, options: [
        { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
        { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" }] },
    ],
    upgrade_cost: { tiers: [{ level: 1, credit: 1e6, battle_data: 1e7, core_dust: 500 }] },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    activities: [],
  }, extra || {});
}
const qtyOf = (snap) => {
  const hit = (snap.selectable_boxes || []).filter((b) => b.name === BOX)[0];
  return hit ? hit.quantity : null;
};

Promise.all([
  O.loadIncomeTable(),
  fetch("data/event_templates.json").then((r) => r.json()).then((j) => EV.setTemplates(j)),
]).then(() => {
  console.log("--- 1) 计数函数 monthlyCardBoxCount ---");
  chk("未开启 → 0", S.monthlyCardBoxCount(makeSnapshot(), 63), 0);
  chk("开关为 false → 0", S.monthlyCardBoxCount(makeSnapshot({ monthly_card: false }), 63), 0);
  chk("开启 · 63 天 → 63 个", S.monthlyCardBoxCount(makeSnapshot({ monthly_card: true }), 63), 63);
  chk("开启 · 0 天 → 0 个", S.monthlyCardBoxCount(makeSnapshot({ monthly_card: true }), 0), 0);
  chk("开启 · 负数天 → 0 个", S.monthlyCardBoxCount(makeSnapshot({ monthly_card: true }), -5), 0);
  chk("开启 · 1.6 天/日 → 101 个", S.monthlyCardBoxCount(makeSnapshot({ monthly_card: true, monthly_card_per_day: 1.6 }), 63), 101);

  console.log("\n--- 2) 默认关闭 = 行为与改动前逐值一致 ---");
  const off = makeSnapshot();
  const on = makeSnapshot({ monthly_card: true });
  const fOff = S.futureSnapshot(off);
  chk("关闭时 30天箱数量不变", qtyOf(fOff), 10);
  chk("关闭时 monthly_card_boxes = 0", fOff.monthly_card_boxes, 0);
  chk("关闭时 裸资源不变", fOff.bare_resources, S.futureSnapshot(makeSnapshot()).bare_resources);

  console.log("\n--- 3) 开启后：只加 30天箱，其余一律不动 ---");
  const fOn = S.futureSnapshot(on);
  chk("30天箱 10 → 73（+63）", qtyOf(fOn), 73);
  chk("方舟箱不变", fOn.selectable_boxes.filter((b) => b.name.indexOf("方舟") >= 0)[0].quantity, 100);
  chk("挑战者箱不变", fOn.selectable_boxes.filter((b) => b.name.indexOf("挑战者") >= 0)[0].quantity, 100);
  chk("裸资源不变", fOn.bare_resources, fOff.bare_resources);
  chk("monthly_card_boxes = 63", fOn.monthly_card_boxes, 63);
  chk("不污染原快照只读副本", qtyOf(off), 10);

  console.log("\n--- 4) 现状口径不受影响（同一快照，开关只影响 future） ---");
  const lvNowOff = S.immediateLevels(off, true, true, off.income_per_hour).level;
  const lvNowOn = S.immediateLevels(on, true, true, on.income_per_hour).level;
  chk("现状全箱梭哈等级：开/关一致", lvNowOn, lvNowOff);
  const lvFutOff = S.futureMainStoryScenario(off).result.level;
  const lvFutOn = S.futureMainStoryScenario(on).result.level;
  chk("开放日全箱梭哈：开启后 ≥ 关闭", lvFutOn >= lvFutOff, true);
  chk("box_gain_vs_now：开/关一致（不含等待期新增箱）",
      [S.futureMainStoryScenario(off).box_gain_vs_now, S.futureMainStoryScenario(on).box_gain_vs_now],
      [S.futureMainStoryScenario(off).box_gain_vs_now, S.futureMainStoryScenario(off).box_gain_vs_now]);

  console.log("\n--- 5) 与「芯尘盒那批固定箱」无关：月卡只加自选箱 ---");
  chk("固定箱总量不变", JSON.stringify(fOn.fixed_boxes), JSON.stringify(fOff.fixed_boxes));

  console.log("\n--- 6) 用户导出快照端到端（10-14 → 12-16，63 天） ---");
  const JP = "C:/Users/Administrator/Downloads/NIKKE计算结果_2026-10-14.json";
  if (!fs.existsSync(JP)) {
    console.log("SKIP  未找到 " + JP + "（导出快照不在时跳过端到端）");
  } else {
    // 从「开放日快照」反推「原始填写快照」：裸资源减去等待期自然积累、箱量减去活动注入
    const J = JSON.parse(fs.readFileSync(JP, "utf8"));
    const fms = J.future_main_story, ps = fms.projected_snapshot, ea = ps.event_applied;
    const nat = fms.natural_before_open;
    const HRS = [24, 12, 8, 4, 2, 1];
    const orig = (onOff) => {
      const fx = {};
      Object.keys(ps.fixed_boxes).forEach((k) => {
        fx[k] = {};
        HRS.forEach((h) => { fx[k][h] = (ps.fixed_boxes[k][h] || 0) - ((((ea.fixed || {})[k] || {})[h]) || 0); });
      });
      const s = {
        recorded_at: new Date(ps.recorded_at),
        current_sync_level: ps.current_sync_level, target_sync_level: ps.target_sync_level,
        alternate_target_level: ps.alternate_target_level, base_level: ps.base_level,
        income_per_hour: O.incomeForLevel(ps.base_level, true),
        future_base_level: ps.future_base_level,
        future_income_per_hour: O.incomeForLevel(ps.future_base_level, true),
        main_story_open_at: new Date(ps.main_story_open_at),
        bare_resources: {
          credit: ps.bare_resources.credit - nat.credit,
          battle_data: ps.bare_resources.battle_data - nat.battle_data,
          core_dust: ps.bare_resources.core_dust - nat.core_dust,
        },
        daily_wipeout_count: ps.daily_wipeout_count, wipeout_hours_each: ps.wipeout_hours_each,
        completed_wipeouts_today: ps.completed_wipeouts_today, daily_full: ps.daily_full,
        extra_daily: ps.extra_daily, upgrade_cost: ps.upgrade_cost,
        stage_clear_resources: ps.stage_clear_resources, activities: ps.activities,
        fixed_boxes: fx,
        selectable_boxes: ps.selectable_boxes.map((b) => ({
          name: b.name, options: b.options,
          quantity: b.quantity - ((((ea.selectable || {})[b.name]) || 0)),
        })),
        monthly_card: onOff,
      };
      return s;
    };
    // 走真实链路：futureSnapshot → immediateLevels（与网页一致）
    const lvFut = (s) => {
      const f = S.futureSnapshot(s);
      return S.immediateLevels(f, true, true, f.income_per_hour).level;
    };
    const rOff = S.futureMainStoryScenario(orig(false));
    const rOn = S.futureMainStoryScenario(orig(true));
    chk("关闭 → 开放日 583（与导出一致）", rOff.result.level, 583);
    chk("开启（63 天）→ 开放日 586", rOn.result.level, 586);
    chk("monthly_card_boxes = 63", rOn.monthly_card_boxes, 63);
    chk("箱量增量 = 63 个", qtyOf(rOn.projected_snapshot) - qtyOf(rOff.projected_snapshot), 63);
    chk("现状口径不受影响", S.immediateLevels(orig(true), true, true, orig(true).income_per_hour).level,
                            S.immediateLevels(orig(false), true, true, orig(false).income_per_hour).level);
  }

  console.log("\n" + (fail ? ("FAILED: " + fail + " 项") : "ALL MONTHLY-CARD TESTS PASSED"));
  process.exit(fail ? 1 : 0);
});
