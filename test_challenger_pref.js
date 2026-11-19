/* test_challenger_pref.js — 挑战者箱「自动择优 / 手动优先」口径回归
 *
 * 覆盖（R94，2026-11-20 用户报障）：
 *   A 两方都可达且同等省箱 → 取芯尘（红球长期最稀缺）
 *   B 只有战斗数据辑能达成 → 取战斗
 *   E 芯尘已被裸资源覆盖、两方都可达 → 取战斗（不为「优先芯尘」白开方舟箱）
 *   C/D 手动选「芯尘优先 / 战斗数据辑优先」→ 照偏好走
 *
 * 跑法：node test_challenger_pref.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = (u) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.resolve(__dirname, String(u).split("?")[0]), "utf8"))),
});
require("./js/core.js");
require("./js/outpost.js");
require("./js/boxes.js");
require("./js/scenarios.js");
const B = global.NikkeBoxes;

let pass = 0, fail = 0;
const failures = [];
function eq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++;
  else { fail++; failures.push(label + " → 实际 " + JSON.stringify(a) + " / 期望 " + JSON.stringify(b)); }
}

/* 合成快照：1 级消耗 = 每项 1000、收益 1/h，方便手算 */
function snap(over) {
  return Object.assign({
    recorded_at: new Date("2026-11-20T00:00:00"),
    current_sync_level: 100,
    target_sync_level: 101,
    alternate_target_level: 101,
    base_level: 500,
    income_per_hour: { credit: 1, battle_data: 1, core_dust: 1 },
    future_base_level: 500,
    future_income_per_hour: { credit: 1, battle_data: 1, core_dust: 1 },
    main_story_open_at: null,
    bare_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    daily_wipeout_count: 1,
    wipeout_hours_each: 2,
    completed_wipeouts_today: 1,
    daily_full: true,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {},
    selectable_boxes: [
      { name: "挑战者成长宝箱", quantity: 1, options: [
        { label: "战斗数据辑", rewards: { battle_data: 1000 }, mode: "units" },
        { label: "芯尘", rewards: { core_dust: 1000 }, mode: "units" },
      ] },
      { name: "方舟官方补给物资Ⅰ", quantity: 1, options: [
        { label: "芯尘", rewards: { core_dust: 1000 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 1000 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 1000 }, mode: "hours" },
      ] },
    ],
    challenger_pref: "auto",
    upgrade_cost: { per_level: { credit: 1000, battle_data: 1000, core_dust: 1000 }, tiers: [] },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    activities: [], monthly_card: false, keep_one_box: false,
  }, over || {});
}

function chalPick(plan) {
  const it = (plan.selectable || []).find((p) => p.name.indexOf("挑战") >= 0);
  if (!it) return null;
  const keys = Object.keys(it.choices || {}).filter((k) => it.choices[k] > 0);
  return keys.length ? keys[0] : "(未选)";
}

// A：两方都可达 → 芯尘
{
  const s = snap({ bare_resources: { credit: 5000, battle_data: 5000, core_dust: 0 } });
  const p = B.optimizeSelectableForTarget(s, s.bare_resources, 1, s.income_per_hour);
  eq(p.feasible, true, "A 可达");
  eq(chalPick(p), "芯尘", "A 两方都可达 → 芯尘");
}

// B：只有战斗能达成 → 战斗
{
  const s = snap({
    bare_resources: { credit: 5000, battle_data: 0, core_dust: 5000 },
    upgrade_cost: { per_level: { credit: 1000, battle_data: 2000, core_dust: 1000 }, tiers: [] },
  });
  s.selectable_boxes[1] = { name: "方舟官方补给物资Ⅰ", quantity: 1, options: [
    { label: "信用点", rewards: { credit: 1000 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 1000 }, mode: "hours" },
  ] };
  const p = B.optimizeSelectableForTarget(s, s.bare_resources, 1, s.income_per_hour);
  eq(p.feasible, true, "B 可达");
  eq(chalPick(p), "战斗数据辑", "B 只有战斗能达成 → 战斗");
}

// E：芯尘已被裸资源覆盖 → 不该为「优先芯尘」白开箱子
{
  const s = snap({ bare_resources: { credit: 5000, battle_data: 0, core_dust: 5000 } });
  s.selectable_boxes[1] = { name: "方舟官方补给物资Ⅰ", quantity: 1, options: [
    { label: "信用点", rewards: { credit: 1000 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 1000 }, mode: "hours" },
  ] };
  const p = B.optimizeSelectableForTarget(s, s.bare_resources, 1, s.income_per_hour);
  eq(p.feasible, true, "E 可达");
  eq(chalPick(p), "战斗数据辑", "E 芯尘已够 → 取战斗（本次报障）");
}

// C：手动芯尘优先
{
  const s = snap({ bare_resources: { credit: 5000, battle_data: 0, core_dust: 0 }, challenger_pref: "dust" });
  const p = B.optimizeSelectableForTarget(s, s.bare_resources, 1, s.income_per_hour);
  eq(chalPick(p), "芯尘", "C 手动芯尘优先");
}

// D：手动战斗优先
{
  const s = snap({ bare_resources: { credit: 5000, battle_data: 5000, core_dust: 0 }, challenger_pref: "battle" });
  const p = B.optimizeSelectableForTarget(s, s.bare_resources, 1, s.income_per_hour);
  eq(chalPick(p), "战斗数据辑", "D 手动战斗优先");
}

console.log("=== test_challenger_pref ===");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
process.exit(fail ? 1 : 0);
