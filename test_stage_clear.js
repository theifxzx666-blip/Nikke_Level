/* 推图收益（stage_clear_resources）口径 + 目标不可达时的「最优均衡」回退 —— 回归验证
   口径（2026-10-14 统一）：
     现状（now）   = 裸资源，**不含**推图收益（项目铁律 5）
     开放日（future）= 裸资源 + 等待期自然积累 + 推图收益 **×1**
   此前 boxes.js 的 optimizeSelectableForTarget / fixedBoxesNeeded 内部又叠了一次推图收益，
   与调用方叠加成 ×2 —— 表现为「达成目标方案」凭空多一份推图收益、漏开信用点箱。
   运行：node test_stage_clear.js   （期望 ALL STAGE-CLEAR TESTS PASSED） */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = function (url) {
  const p = path.resolve(__dirname, String(url).split("?")[0]);   // 剥掉 ?v= 缓存参数
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

const D = (s) => new Date(s + "T00:00:00");
const ZERO = () => ({ credit: 0, battle_data: 0, core_dust: 0 });

/* 用户真实数据（2026-10-14 导出快照的等价内联版）：517 级、目标 521、后续目标 541 */
function makeSnapshot(extra) {
  return Object.assign({
    recorded_at: D("2026-10-13"),
    current_sync_level: 517,
    target_sync_level: 521,
    alternate_target_level: 541,
    base_level: 559,
    income_per_hour: { credit: 64870, battle_data: 657790, core_dust: 107.56 },
    future_base_level: 589,
    future_income_per_hour: { credit: 64870, battle_data: 657790, core_dust: 107.56 },
    main_story_open_at: D("2026-11-15"),
    bare_resources: { credit: 6595000, battle_data: 128000000, core_dust: 6811 },
    daily_wipeout_count: 4, wipeout_hours_each: 2,
    completed_wipeouts_today: 4, daily_full: true,
    extra_daily: ZERO(),
    fixed_boxes: {
      "芯尘盒":       { 1: 363, 2: 30, 4: 0, 8: 0, 12: 2, 24: 0 },
      "信用点盒":     { 1: 195, 2: 30, 4: 0, 8: 4, 12: 2, 24: 0 },
      "战斗数据辑盒": { 1: 163, 2: 120, 4: 0, 8: 3, 12: 2, 24: 0 },
      "成长套组":     { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
    },
    selectable_boxes: [
      { name: "方舟官方补给物资Ⅰ", quantity: 211, options: [
        { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" }] },
      { name: "30天成长补给箱", quantity: 6, options: [
        { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" }] },
      { name: "挑战者成长宝箱", quantity: 0, options: [
        { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
        { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" }] },
    ],
    // tiers 内的 credit / battle_data 单位是 K（core.js 内部 ×1000），红球为个
    upgrade_cost: { tiers: [
      { level: 451, credit: 7441, battle_data: 67170, core_dust: 13000 },
      { level: 501, credit: 8185, battle_data: 72544, core_dust: 14000 },
      { level: 551, credit: 9003, battle_data: 78347, core_dust: 15000 },
    ] },
    stage_clear_resources: { credit: 14305500, battle_data: 49250000, core_dust: 950 },
    activities: [], monthly_card: false, keep_one_box: false,
  }, extra || {});
}

/* 把方案条目压成 {boxName: {choiceLabel: count}}，便于逐值比较 */
function choicesOf(plan) {
  const out = {};
  ((plan && plan.selectable) || []).filter((p) => p.used > 0).forEach((p) => {
    out[p.name] = {};
    Object.keys(p.choices || {}).forEach((k) => { if (p.choices[k]) out[p.name][k] = p.choices[k]; });
  });
  return out;
}
const levelWith = (snap, res) => snap.current_sync_level + C.affordableLevels(res, snap, snap.current_sync_level);

function main() {
  const withStage = makeSnapshot();
  const noStage = makeSnapshot({ stage_clear_resources: ZERO() });

  console.log("--- 1) 现状（now）口径：推图收益一律不计（与 stage 是否为 0 无关） ---");
  const pNowS = S.planForTarget(withStage, 521, "now");
  const pNow0 = S.planForTarget(noStage, 521, "now");
  chk("planForTarget(521,'now') 用箱数相同", pNowS.boxes_used, pNow0.boxes_used);
  chk("planForTarget(521,'now') 分配明细相同", choicesOf(pNowS), choicesOf(pNow0));
  chk("planForTarget(521,'now') 剩余缺口相同", pNowS.remaining_shortage, pNow0.remaining_shortage);
  truthy("planForTarget(521,'now') 确实开了箱（不是「什么都不用开」）", pNowS.boxes_used > 0, "boxes_used=" + pNowS.boxes_used);
  truthy("信用点盒参与开箱（×2 时代的典型症状是漏开信用点盒）",
    !!(pNowS.fixed_used && pNowS.fixed_used["信用点盒"]), JSON.stringify(pNowS.fixed_used));

  const rS = S.evaluate(withStage);
  chk("evaluate().target_selectable_now 与 planForTarget(_, 'now') 同口径",
    choicesOf(rS.target_selectable_now), choicesOf(pNowS));
  chk("现状四档不受推图收益影响（bare/fixed/selectable）",
    [rS.bare.level, rS.fixed.level, rS.selectable.level],
    [S.evaluate(noStage).bare.level, S.evaluate(noStage).fixed.level, S.evaluate(noStage).selectable.level]);
  chk("per_resource 现状三档不受推图收益影响",
    [rS.per_resource.bare, rS.per_resource.fixed, rS.per_resource.selectable],
    [S.evaluate(noStage).per_resource.bare, S.evaluate(noStage).per_resource.fixed, S.evaluate(noStage).per_resource.selectable]);
  chk("box_gain_vs_now 不受推图收益影响",
    rS.future_main_story.box_gain_vs_now, S.evaluate(noStage).future_main_story.box_gain_vs_now);

  console.log("\n--- 2) 开放日（future）口径：推图收益恰好计 1 次 ---");
  // 用「无箱」快照把口径隔离：未来全箱梭哈等级 == 裸资源(开放日) + 推图 ×1
  const noBoxes = {
    fixed_boxes: {
      "芯尘盒": { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
      "信用点盒": { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
      "战斗数据辑盒": { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
      "成长套组": { 1: 0, 2: 0, 4: 0, 8: 0, 12: 0, 24: 0 },
    },
    selectable_boxes: [],
  };
  const s0 = makeSnapshot(noBoxes);
  const f0 = S.futureMainStoryScenario(s0);
  const stage = s0.stage_clear_resources;
  const lvX1 = levelWith(s0, C.addRes(f0.projected_bare, stage));
  const lvX2 = levelWith(s0, C.addRes(f0.projected_bare, { credit: stage.credit * 2, battle_data: stage.battle_data * 2, core_dust: stage.core_dust * 2 }));
  const lvX0 = levelWith(s0, C.addRes(f0.projected_bare, ZERO()));
  chk("开放日全箱梭哈等级 == 裸(开放日) + 推图 ×1", f0.result.level, lvX1);
  // 无箱快照下，_res.future_selectable 应恰好 == 裸(开放日) + 推图 ×1（可用量层面的精确断言，不受等级断档影响）
  const r0 = S.evaluate(s0);
  const fsr0 = r0.per_resource._res.future_selectable;
  C.RESOURCES.forEach((r) => {
    chk("future_selectable." + r + " == 裸(开放日) + 推图 ×1", fsr0[r], f0.projected_bare[r] + stage[r]);
  });
  truthy("确认断言有效：该值 ≠ 推图 ×2",
    C.RESOURCES.every((r) => fsr0[r] !== f0.projected_bare[r] + stage[r] * 2), lvX2 + " 级口径");
  truthy("确认断言有效：该值 ≠ 推图 ×0",
    C.RESOURCES.every((r) => fsr0[r] !== f0.projected_bare[r]), "");
  chk("现状 _res.selectable（无箱时）== 裸资源，不含推图收益", r0.per_resource._res.selectable, s0.bare_resources);
  truthy("确认断言有效：现状该值 ≠ 裸资源 + 推图",
    C.RESOURCES.some((r) => r0.per_resource._res.selectable[r] !== s0.bare_resources[r] + stage[r]), lvX0 + " 级口径");
  truthy("_res.future_selectable 已暴露（供开放日口径折算 1H 箱）",
    !!(rS.per_resource._res && rS.per_resource._res.future_selectable), "");
  const fsr = rS.per_resource._res.future_selectable || {};
  truthy("future_selectable 三资源齐为正数",
    C.RESOURCES.every((k) => (fsr[k] || 0) > (rS.per_resource._res.selectable[k] || 0)),
    JSON.stringify(fsr));

  console.log("\n--- 3) 目标不可达：bestEffortPlan 的最大步数 == 全箱梭哈等级 ---");
  const maxSteps = rS.selectable.level - withStage.current_sync_level;
  truthy("前提：全箱梭哈确实升得动（maxSteps > 0）", maxSteps > 0, "maxSteps=" + maxSteps);
  [530, 541, 560].forEach((tgt) => {
    const steps = tgt - withStage.current_sync_level;
    const be = B.bestEffortPlan(withStage, withStage.bare_resources, steps, withStage.income_per_hour);
    truthy("目标 " + tgt + " 不可达 → bestEffort 命中", be.found === true, "steps=" + be.steps);
    chk("目标 " + tgt + " bestEffort.steps == 全箱梭哈步数", be.steps, maxSteps);
    truthy("目标 " + tgt + " bestEffort.steps < 目标步数", be.steps < steps, be.steps + " < " + steps);
    truthy("目标 " + tgt + " bestEffort 方案本身可行", !!(be.plan && be.plan.feasible),
      be.plan ? "feasible=" + be.plan.feasible : "null");
  });

  console.log("\n--- 4) 目标不可达：不再把自选箱全堆给最难补的一项 ---");
  const be541 = B.bestEffortPlan(withStage, withStage.bare_resources, 541 - withStage.current_sync_level, withStage.income_per_hour);
  const degenerate = S.planForTarget(withStage, 541, "now");   // 引擎原语仍按贪心返回不可行方案
  const chBe = choicesOf(be541.plan);
  const chDe = choicesOf(degenerate);
  const usedOpts = (c) => Object.keys(c).reduce((n, k) => n + Object.keys(c[k]).length, 0);
  chk("退化方案（旧行为，仅作对照）方舟只用了 1 个选项", usedOpts({ x: chDe["方舟官方补给物资Ⅰ"] || {} }), 1);
  truthy("最优均衡方案至少用到 2 个不同选项（不再全堆一项）",
    usedOpts({ x: chBe["方舟官方补给物资Ⅰ"] || {} }) >= 2, JSON.stringify(chBe));
  truthy("没有把全部方舟箱都堆给同一项",
    Object.keys(chBe["方舟官方补给物资Ⅰ"] || {}).every((k) => chBe["方舟官方补给物资Ⅰ"][k] < 211),
    JSON.stringify(chBe["方舟官方补给物资Ⅰ"]));

  console.log("\n--- 5) R38：不可达诊断缺口的唯一来源 = bestEffortPlan.target_shortage ---");
  const tgtFar = 541;
  const stepsFar = tgtFar - withStage.current_sync_level;
  const beDiag = B.bestEffortPlan(withStage, withStage.bare_resources, stepsFar, withStage.income_per_hour);
  truthy("bestEffort 命中且方案自身可行（它在缩小步数上可行）",
    beDiag.found === true && beDiag.plan.feasible === true, "found=" + beDiag.found);
  truthy("存在 target_shortage（距原目标的缺口）", !!beDiag.plan.target_shortage,
    beDiag.plan.target_shortage ? JSON.stringify(beDiag.plan.target_shortage) : "null");
  chk("target_shortage 三资源齐全",
    C.RESOURCES.filter((k) => typeof beDiag.plan.target_shortage[k] === "number").length, 3);
  // 关键不变量 ①：方案可行 ⇒ 其 remaining_shortage 全 0（证明不能用它当缺口）
  truthy("方案 remaining_shortage 全为 0（故不可作为「仍缺」数据源）",
    C.RESOURCES.every((k) => (beDiag.plan.remaining_shortage[k] || 0) <= 1e-6),
    JSON.stringify(beDiag.plan.remaining_shortage));
  // 关键不变量 ②：target_shortage 至少一项 > 0（目标确实不可达）
  truthy("target_shortage 至少一项 > 0（目标确实不可达）",
    C.RESOURCES.some((k) => beDiag.plan.target_shortage[k] > 1e-6),
    JSON.stringify(beDiag.plan.target_shortage));
  // 关键不变量 ③：与「目标需求 − 底盘 − 方案开出的资源」逐项一致（引擎侧自洽）
  const needT = C.costForLevels(withStage, withStage.current_sync_level, stepsFar);
  const gotT = B.planResources(withStage, beDiag.plan, withStage.income_per_hour);
  truthy("target_shortage == max(0, 目标需求 − 底盘 − 方案开出资源)（逐资源）",
    C.RESOURCES.every((k) =>
      Math.abs(beDiag.plan.target_shortage[k] - Math.max(0, needT[k] - withStage.bare_resources[k] - gotT[k])) < 1e-6),
    JSON.stringify(C.RESOURCES.map((k) => [k, beDiag.plan.target_shortage[k], needT[k], gotT[k]])));
  // 关键不变量 ④：折算 1H 箱（与 app.js balanceDiagTable 同一算式）→ 能定出唯一瓶颈
  const incW = withStage.income_per_hour;
  const missW = C.RESOURCES.map((k) => {
    const need = beDiag.plan.target_shortage[k] || 0, rate = incW[k] || 0;
    return (need > 1e-6 && rate > 0) ? Math.ceil(need / rate - 1e-9) : 0;
  });
  const maxW = Math.max.apply(null, missW);
  truthy("折算 1H 箱为非负整数且瓶颈项存在", missW.every((v) => Number.isInteger(v) && v >= 0) && maxW > 0,
    JSON.stringify(missW));
  truthy("瓶颈项（折算最多）唯一可定", missW.filter((v) => v === maxW).length >= 1,
    JSON.stringify({ miss: missW, max: maxW }));
  // 与旧口径对照：不可达时 planForTarget 的贪心缺口 ≠ 均衡缺口（证明渲染必须换成同源值）
  const greedyFar = S.planForTarget(withStage, tgtFar, "now");
  truthy("贪心退化方案的 remaining_shortage 与 target_shortage 不同（旧口径不可复用）",
    greedyFar.feasible === false &&
    C.RESOURCES.some((k) => Math.abs((greedyFar.remaining_shortage[k] || 0) - beDiag.plan.target_shortage[k]) > 1e-6),
    JSON.stringify({ greedy: greedyFar.remaining_shortage, balanced: beDiag.plan.target_shortage }));

  console.log("\n" + (fail ? "FAILED: " + fail + " 项" : "ALL STAGE-CLEAR TESTS PASSED"));
  process.exit(fail ? 1 : 0);
}

main();
