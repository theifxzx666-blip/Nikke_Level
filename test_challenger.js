/* 挑战者成长宝箱选项「放开评估」（R31，2026-10-16）—— 回归验证
   现状（改前）：js/boxes.js 两处写死 options[0]（战斗数据辑）
   目标（改后）：按 snapshot.challenger_pref 决定
     · "battle" → 强制战斗数据辑（idx 0）
     · "dust"   → 强制芯尘（idx 1）
     · "auto"（默认，字段缺失亦视为 auto）→ 双跑择优：
         ① 可达步数高者胜 → ② 1H 箱折算总缺口小者胜 → ③ 芯尘优先
   ⚠ 次判据必须折算成 1H 箱（Σ remaining_shortage[r] ÷ income[r]）：
     红球的「个」与战斗数据的「个」量纲不可比，用原始量会得出相反结论。

   运行：node test_challenger.js   （期望 ALL CHALLENGER TESTS PASSED） */
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
const C = global.NikkeCore, S = global.NikkeScenarios, B = global.NikkeBoxes;

let fail = 0;
function chk(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  console.log((ok ? "PASS " : "FAIL ") + name + "  actual=" + JSON.stringify(actual) + "  expect=" + JSON.stringify(expect));
  if (!ok) fail++;
}
function truthy(name, cond, detail) {
  console.log((cond ? "PASS " : "FAIL ") + name + (detail !== undefined ? "  (" + detail + ")" : ""));
  if (!cond) fail++;
}
function head(t) { console.log("\n--- " + t + " ---"); }

const TIERS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/level_cost_table.json"), "utf8")).tiers;
const CH_BATTLE = 88458, CH_DUST = 16;

function snap(o) {
  return Object.assign({
    recorded_at: new Date("2026-10-13T00:00:00"),
    current_sync_level: 300, target_sync_level: 310, alternate_target_level: 320,
    base_level: 509, income_per_hour: { credit: 59200, battle_data: 592710, core_dust: 90.99 },
    future_base_level: 535, future_income_per_hour: { credit: 61110, battle_data: 614880, core_dust: 102.41 },
    main_story_open_at: null,
    bare_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    daily_wipeout_count: 0, wipeout_hours_each: 2, completed_wipeouts_today: 0, daily_full: false,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {}, selectable_boxes: [], upgrade_cost: { tiers: TIERS },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    activities: [], monthly_card: false, keep_one_box: false, challenger_pref: "auto",
  }, o || {});
}
/* 挑战者箱：options 顺序固定为 [战斗数据辑, 芯尘]（与 app.js 的 BOX_DEFS 一致） */
function chBox(qty) {
  return {
    name: "挑战者成长宝箱", quantity: qty, options: [
      { label: "战斗数据辑", rewards: { battle_data: CH_BATTLE }, mode: "units" },
      { label: "芯尘", rewards: { core_dust: CH_DUST }, mode: "units" }],
  };
}
function tierAt(level) {
  let cur = TIERS[0];
  TIERS.forEach(function (t) { if (t.level <= level) cur = t; });
  return cur;
}
/* 抽取「方案对象」的可比较指纹（忽略 challenger_index/target_steps 等元字段） */
function fp(plan) {
  if (!plan) return null;
  return JSON.stringify({
    feasible: plan.feasible,
    boxes_used: plan.boxes_used,
    fixed_used: plan.fixed_used,
    selectable: (plan.selectable || []).map(function (p) { return [p.name, p.used, p.keep, p.choices]; }),
    remaining_shortage: plan.remaining_shortage,
  });
}
function chosenLabel(plan) {
  if (!plan || !plan.selectable) return null;
  for (const p of plan.selectable) {
    if (p.name.indexOf("挑战") >= 0) {
      const keys = Object.keys(p.choices || {});
      return keys.length ? keys.sort().join("+") : null;
    }
  }
  return null;
}
/* 临界场景：三项都「恰好够升 1 级」（+0.1% 余量），再把缺口项压到 -gapPct 使其真正卡住 */
function critSnap(level, gapRes, gapPct, pref) {
  const tc = tierAt(level);
  const need = { credit: tc.credit * 1000, battle_data: tc.battle_data * 1000, core_dust: tc.core_dust };
  const bare = { credit: need.credit * 1.001, battle_data: need.battle_data * 1.001, core_dust: need.core_dust * 1.001 };
  bare[gapRes] = need[gapRes] * (1 - gapPct);
  return snap({
    current_sync_level: level, bare_resources: bare, upgrade_cost: { tiers: TIERS },
    selectable_boxes: [chBox(1)], challenger_pref: pref || "auto",
  });
}

/* ============ 1) auto 择优正确性：临界场景「哪一项卡住就选哪一项」 ============ */
head("1) auto 择优：『哪一项卡住就选哪一项』（实测规律，与等级段无关）");

const cases = [
  ["仅战斗数据卡住 0.1%", 500, "battle_data", 0.001, 0],
  ["仅红球卡住 0.1%", 500, "core_dust", 0.001, 1],
  ["低档 210 级·仅战斗数据卡住", 210, "battle_data", 0.001, 0],
  ["低档 210 级·仅红球卡住", 210, "core_dust", 0.001, 1],
  ["低档 250 级·仅战斗数据卡住", 250, "battle_data", 0.001, 0],
  ["低档 250 级·仅红球卡住", 250, "core_dust", 0.001, 1],
];
cases.forEach(function (c) {
  const s = critSnap(c[1], c[2], c[3], "auto");
  const plan = S.planForTarget(s, s.current_sync_level + 1, "now");
  console.log("  [" + c[0] + "] Lv." + c[1] + " → auto 选中 challenger_index=" + plan.challenger_index +
    "｜选项=" + chosenLabel(plan) + "｜feasible=" + plan.feasible);
  chk("  「" + c[0] + "」auto 选中预期选项 (" + c[4] + ")", plan.challenger_index, c[4]);
  truthy("  「" + c[0] + "」该选项确实可达（升 1 级）", plan.feasible === true);
});

/* ============ 2) 强制偏好逐值等于单跑 ============ */
head("2) 强制偏好 battle / dust → 逐值等于 solveWithChallenger(..., 0/1)");
const critCases = [
  critSnap(500, "battle_data", 0.001),
  critSnap(500, "core_dust", 0.001),
  critSnap(250, "core_dust", 0.001),
];
critCases.forEach(function (base, i) {
  [["battle", 0], ["dust", 1]].forEach(function (p) {
    const s = JSON.parse(JSON.stringify(base)); s.challenger_pref = p[0];
    const baseRes = s.bare_resources, inc = s.income_per_hour;
    const got = S.planForTarget(s, s.current_sync_level + 1, "now");
    const expect = B.solveWithChallenger(s, baseRes, 1, inc, p[1]);
    chk("  用例" + (i + 1) + " pref=" + p[0] + " 与单跑 idx=" + p[1] + " 逐值一致", fp(got), fp(expect));
    chk("  用例" + (i + 1) + " pref=" + p[0] + " challenger_index=" + p[1], got.challenger_index, p[1]);
  });
});

/* ============ 3) 缺省字段 = auto（向后兼容） ============ */
head("3) snapshot.challenger_pref 缺失 ≡ auto（旧快照行为）");
(function () {
  const s = critSnap(500, "core_dust", 0.001, "auto");
  const s2 = JSON.parse(JSON.stringify(s)); delete s2.challenger_pref;
  const a = S.planForTarget(s, s.current_sync_level + 1, "now");
  const b = S.planForTarget(s2, s.current_sync_level + 1, "now");
  chk("  缺失字段与显式 auto 逐值一致", fp(b), fp(a));
  chk("  缺失字段时仍择优出芯尘（仅红球卡住）", b.challenger_index, 1);
})();

/* ============ 4) challengerUnitsResources 的 idx 语义 ============ */
head("4) challengerUnitsResources(snapshot, idx)");
(function () {
  const s = snap({ selectable_boxes: [chBox(10)] });
  const r0 = B.challengerUnitsResources(s, 0);
  const r1 = B.challengerUnitsResources(s, 1);
  chk("  idx=0 → 战斗数据辑 ×10", [r0.battle_data, r0.core_dust], [CH_BATTLE * 10, 0]);
  chk("  idx=1 → 芯尘 ×10", [r1.battle_data, r1.core_dust], [0, CH_DUST * 10]);
  const sAuto = snap({ selectable_boxes: [chBox(10)], challenger_pref: "auto" });
  const sDust = snap({ selectable_boxes: [chBox(10)], challenger_pref: "dust" });
  chk("  pref=auto（缺省 idx）→ 向后兼容取 idx 0", B.challengerUnitsResources(sAuto), B.challengerUnitsResources(sAuto, 0));
  chk("  pref=dust（缺省 idx）→ 取 idx 1", B.challengerUnitsResources(sDust), B.challengerUnitsResources(sDust, 1));
})();

/* ============ 5) 用户真实数据：auto == 芯尘单跑（芯尘比战斗数据辑多 1 级） ============ */
head("5) 用户真实数据（517 级 / 挑战者箱 1,122 / 方舟 211）→ auto == 芯尘单跑");
const USER_FIXED = {
  "芯尘盒": { 1: 363, 2: 30, 4: 0, 8: 0, 12: 2, 24: 0 },
  "信用点盒": { 1: 195, 2: 30, 4: 0, 8: 4, 12: 2, 24: 0 },
  "战斗数据辑盒": { 1: 163, 2: 120, 4: 0, 8: 3, 12: 2, 24: 0 },
  "成长套组": { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
};
const ARK = function (q) {
  return {
    name: "方舟官方补给物资Ⅰ", quantity: q, options: [
      { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
      { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
      { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" }],
  };
};
function userSnap(pref) {
  return snap({
    current_sync_level: 517, target_sync_level: 521, alternate_target_level: 541,
    base_level: 559, income_per_hour: { credit: 64870, battle_data: 657790, core_dust: 107.56 },
    bare_resources: { credit: 6595000, battle_data: 128000000, core_dust: 6811 },
    daily_wipeout_count: 4, wipeout_hours_each: 2, completed_wipeouts_today: 4, daily_full: true,
    fixed_boxes: USER_FIXED,
    selectable_boxes: [ARK(211), chBox(1122)],
    challenger_pref: pref,
  });
}
(function () {
  const sA = userSnap("auto"), sB = userSnap("battle"), sD = userSnap("dust");
  // 目标 521（两项都可达）
  const pA = S.planForTarget(sA, 521, "now");
  const pB = S.planForTarget(sB, 521, "now");
  const pD = S.planForTarget(sD, 521, "now");
  console.log("  目标 521：auto idx=" + pA.challenger_index + "｜battle feasible=" + pB.feasible + "｜dust feasible=" + pD.feasible);
  chk("  目标 521 → auto 选中芯尘", pA.challenger_index, 1);
  chk("  目标 521 → auto 与芯尘单跑逐值一致", fp(pA), fp(pD));
  truthy("  目标 521 → auto 与战斗数据辑单跑不同（确实做了择优）", fp(pA) !== fp(pB));

  // 全箱梭哈可达等级：芯尘应比战斗数据辑多 1 级
  function maxSteps(s) {
    let lo = 1, hi = 60, best = 0;
    while (lo <= hi) {
      const m = Math.floor((lo + hi) / 2);
      const p = S.planForTarget(s, s.current_sync_level + m, "now");
      if (p && p.feasible) { best = m; lo = m + 1; } else hi = m - 1;
    }
    return best;
  }
  const mB = maxSteps(sB), mD = maxSteps(sD), mA = maxSteps(sA);
  console.log("  全箱梭哈步数：battle " + mB + "（Lv." + (517 + mB) + "）｜dust " + mD + "（Lv." + (517 + mD) + "）｜auto " + mA + "（Lv." + (517 + mA) + "）");
  chk("  全箱梭哈：芯尘比战斗数据辑多 1 级", mD - mB, 1);
  chk("  auto 达到两者中更高的步数", mA, Math.max(mB, mD));

  // 目标 541（都不可达）→ auto 应取步数更高的一项
  const pA541 = S.planForTarget(sA, 541, "now");
  const beB = B.bestEffortPlan(sB, sB.bare_resources, 541 - 517, sB.income_per_hour);
  const beD = B.bestEffortPlan(sD, sD.bare_resources, 541 - 517, sD.income_per_hour);
  const beA = B.bestEffortPlan(sA, sA.bare_resources, 541 - 517, sA.income_per_hour);
  console.log("  目标 541（不可达）：bestEffort 步数 battle=" + beB.steps + " dust=" + beD.steps + " auto=" + beA.steps +
    "｜auto idx=" + (beA.plan ? beA.plan.challenger_index : null));
  chk("  目标 541 → bestEffort 选芯尘（步数更高）", beA.steps, Math.max(beB.steps, beD.steps));
  truthy("  目标 541 → bestEffort 芯尘步数 > 战斗数据辑", beD.steps > beB.steps, "dust=" + beD.steps + " battle=" + beB.steps);
  chk("  目标 541 → bestEffort auto 与芯尘单跑逐值一致", fp(beA.plan), fp(beD.plan));
})();

/* ============ 6) 不变量：bestEffortPlan.steps == 全箱梭哈步数（沿用旧断言） ============ */
head("6) 不变量：不可达时 bestEffortPlan.steps == 全箱梭哈最大步数");
(function () {
  [0, 1].forEach(function (idx) {
    const s = userSnap(idx === 0 ? "battle" : "dust");
    let lo = 1, hi = 60, best = 0;
    while (lo <= hi) {
      const m = Math.floor((lo + hi) / 2);
      const p = B.solveWithChallenger(s, s.bare_resources, m, s.income_per_hour, idx);
      if (p && p.feasible) { best = m; lo = m + 1; } else hi = m - 1;
    }
    const be = B.bestEffortPlan(s, s.bare_resources, 541 - 517, s.income_per_hour);
    chk("  idx=" + idx + " bestEffortPlan.steps == 单跑最大步数", be.steps, best);
    truthy("  idx=" + idx + " bestEffortPlan 的方案本身可行", !be.found || be.plan.feasible === true);
  });
})();

/* ============ 7) 次判据必须折算（禁用原始量） ============ */
head("7) 次判据 = 1H 箱折算总缺口（不是原始资源量）");
(function () {
  const plan = {
    remaining_shortage: { credit: 0, battle_data: 88458 * 10, core_dust: 16 * 10 },
  };
  const inc = { credit: 59200, battle_data: 592710, core_dust: 90.99 };
  const expected = (88458 * 10) / 592710 + (16 * 10) / 90.99;
  const got = B.gapHours(plan, inc);
  chk("  gapHours = Σ (缺口 ÷ 每小时收益)", Math.round(got * 1000) / 1000, Math.round(expected * 1000) / 1000);
  truthy("  gapHours 远小于原始量之和（确认已折算）", got < (88458 * 10 + 16 * 10) / 1000, "got=" + got.toFixed(2));
  chk("  缺口为 0 → gapHours = 0", B.gapHours({ remaining_shortage: { credit: 0, battle_data: 0, core_dust: 0 } }, inc), 0);
  truthy("  每小时收益为 0 且缺口 > 0 → +Infinity（保守）",
    B.gapHours({ remaining_shortage: { credit: 1, battle_data: 0, core_dust: 0 } }, { credit: 0 }) === Infinity);
})();

console.log("\n" + (fail === 0 ? "ALL CHALLENGER TESTS PASSED" : "FAILED=" + fail));
process.exit(fail === 0 ? 0 : 1);
