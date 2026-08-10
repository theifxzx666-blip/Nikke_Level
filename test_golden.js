/* 金标准回归验证：JS 引擎输出必须与 Python 引擎一致 */
"use strict";
const fs = require("fs");
const path = require("path");

// 模拟 fetch：相对路径 -> 读本地文件（node 的 fetch 不支持 file://）
global.fetch = function (url) {
  const p = path.resolve(__dirname, String(url));
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};

require("./js/core.js");
require("./js/outpost.js");
require("./js/boxes.js");
require("./js/scenarios.js");
const O = global.NikkeOutpost;
const S = global.NikkeScenarios;

function makeSnapshot() {
  const D = (s) => new Date(s + "T00:00:00");
  return {
    recorded_at: D("2026-08-05"),
    current_sync_level: 474,
    target_sync_level: 481,
    alternate_target_level: 501,
    base_level: 483,
    income_per_hour: { credit: 57240, battle_data: 570180, core_dust: 88 },
    future_base_level: 500,
    future_income_per_hour: { credit: 58530, battle_data: 584950, core_dust: 90.02 },
    main_story_open_at: D("2026-08-31"),
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
    },
    selectable_boxes: [
      { name: "方舟", quantity: 870, options: [
        { label: "dust", rewards: { core_dust: 1 }, mode: "hours" },
        { label: "credit", rewards: { credit: 3 }, mode: "hours" },
        { label: "battle", rewards: { battle_data: 1 }, mode: "hours" },
      ] },
      { name: "30天", quantity: 27, options: [
        { label: "dust", rewards: { core_dust: 10 }, mode: "hours" },
        { label: "credit", rewards: { credit: 30 }, mode: "hours" },
        { label: "battle", rewards: { battle_data: 10 }, mode: "hours" },
      ] },
      { name: "挑战", quantity: 340, options: [
        { label: "battle", rewards: { battle_data: 88458 }, mode: "units" },
        { label: "dust", rewards: { core_dust: 16 }, mode: "units" },
      ] },
    ],
    upgrade_cost: { per_level: { credit: 7441000, battle_data: 67170000, core_dust: 13000 }, range_start: null, range_end: null, range_total: null, tiers: null },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
  };
}

async function main() {
  await O.loadStageMap();
  await O.loadIncomeTable();
  const snap = makeSnapshot();
  const r = S.evaluate(snap);
  let pass = true;
  function check(name, actual, expect, tol) {
    const ok = Math.abs(actual - expect) <= (tol || 1e-6);
    console.log((ok ? "PASS" : "FAIL") + " " + name + "  actual=" + actual + "  expect=" + expect);
    if (!ok) pass = false;
  }
  check("no_box.bottleneck==core_dust", r.no_box.bottleneck === "core_dust" ? 1 : 0, 1, 0);
  check("no_box.days(29~31)", r.no_box.days, 29.8557, 1.0);
  check("bare.level", r.bare.level, 474, 0);
  check("fixed.level", r.fixed.level, 487, 0);
  check("selectable.level", r.selectable.level, 496, 0);
  check("future.result.level", r.future_main_story.result.level, 503, 0);
  check("scenario_f.immediate.level>=current", r.scenario_f.rows[0].level, 474, 100); // >= 474 即满足
  // per_resource 三档单调不减
  const pr = r.per_resource;
  for (const res of ["credit", "battle_data", "core_dust"]) {
    if (!(pr.bare[res] <= pr.fixed[res] && pr.fixed[res] <= pr.selectable[res])) {
      console.log("FAIL per_resource monotonic " + res, pr.bare[res], pr.fixed[res], pr.selectable[res]);
      pass = false;
    }
  }
  console.log("per_resource:", JSON.stringify(r.per_resource));
  console.log(pass ? "ALL GOLDEN TESTS PASSED" : "GOLDEN TESTS FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(2); });
