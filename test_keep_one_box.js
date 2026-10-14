/* 「每种箱保留 1 个」开关（S.applyKeepOneBox）回归验证
   + 三资源配平诊断的核心算式（per_resource._res.selectable → 缺口折算 1H 箱）
   口径：保留 = 固定小时箱按「箱型 × 档位」逐格 -1、自选箱按名称 -1，下限 0；
        仅影响计算用的快照副本，不污染原快照。
   运行：node test_keep_one_box.js   （期望 ALL KEEP-ONE-BOX TESTS PASSED） */
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
/* 每种箱每档 5 个、自选箱各 10 个：便于验证「每格/每名称 -1」 */
function makeSnapshot(extra) {
  return Object.assign({
    recorded_at: D("2026-10-14"),
    current_sync_level: 474,
    target_sync_level: 501,
    alternate_target_level: 501,
    base_level: 483,
    income_per_hour: { credit: 57240, battle_data: 570180, core_dust: 88 },
    future_base_level: 500,
    future_income_per_hour: { credit: 58530, battle_data: 584950, core_dust: 90.02 },
    main_story_open_at: D("2026-12-16"),
    bare_resources: { credit: 25169000, battle_data: 274000000, core_dust: 12181 },
    daily_wipeout_count: 3,
    wipeout_hours_each: 2,
    completed_wipeouts_today: 3,
    daily_full: true,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {
      "芯尘盒":       { 24: 5, 12: 5, 8: 5, 4: 5, 2: 5, 1: 5 },
      "信用点盒":     { 24: 5, 12: 5, 8: 5, 4: 5, 2: 5, 1: 5 },
      "战斗数据辑盒": { 24: 5, 12: 5, 8: 5, 4: 5, 2: 5, 1: 5 },
      "成长套组":     { 24: 5, 12: 5, 8: 5, 4: 5, 2: 5, 1: 5 },
    },
    selectable_boxes: [
      { name: "方舟官方补给物资Ⅰ", quantity: 10, options: [
        { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" }] },
      { name: "30天成长补给箱", quantity: 10, options: [
        { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
        { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
        { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" }] },
      { name: "挑战者成长宝箱", quantity: 10, options: [
        { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
        { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" }] },
    ],
    // tiers 内的 credit / battle_data 单位是 K（core.js 内部会 x1000），红球为个
    upgrade_cost: { tiers: [
      { level: 1, credit: 1000, battle_data: 10000, core_dust: 500 },
      { level: 401, credit: 2000, battle_data: 20000, core_dust: 1000 },
      { level: 501, credit: 5000, battle_data: 50000, core_dust: 3000 },
    ] },
    stage_clear_resources: { credit: 0, battle_data: 0, core_dust: 0 },
    activities: [],
  }, extra || {});
}
const sumFixed = (s) => {
  let n = 0;
  Object.keys(s.fixed_boxes || {}).forEach((k) =>
    Object.keys(s.fixed_boxes[k]).forEach((h) => { n += s.fixed_boxes[k][h]; }));
  return n;
};

Promise.all([
  O.loadIncomeTable(),
  fetch("data/event_templates.json").then((r) => r.json()).then((j) => EV.setTemplates(j)),
]).then(() => {
  console.log("--- 1) applyKeepOneBox：未开启时原样返回 ---");
  const off = makeSnapshot();
  chk("未开启 → 同一引用", S.applyKeepOneBox(off) === off, true);
  chk("未开启 → 固定箱总量不变（4 箱型 x 6 档 x 5）", sumFixed(S.applyKeepOneBox(off)), 120);

  console.log("\n--- 2) 开启后：固定箱每格 -1、自选箱每名称 -1 ---");
  const src2 = makeSnapshot({ keep_one_box: true });
  const on = S.applyKeepOneBox(src2);
  chk("芯尘盒每格 5 → 4", on.fixed_boxes["芯尘盒"], { 24: 4, 12: 4, 8: 4, 4: 4, 2: 4, 1: 4 });
  chk("固定箱总量 120 → 96", sumFixed(on), 96);
  chk("自选箱各 10 → 9", on.selectable_boxes.map((b) => b.quantity), [9, 9, 9]);
  chk("标记 keep_one_box_applied", on.keep_one_box_applied, true);
  truthy("recorded_at 仍为 Date（未被 JSON 深拷贝破坏）", on.recorded_at instanceof Date);
  chk("裸资源等其余字段不变", on.bare_resources, off.bare_resources);
  chk("upgrade_cost 引用不变（浅拷贝）", on.upgrade_cost === src2.upgrade_cost, true);

  console.log("\n--- 3) 下限 0：数量为 0 的格子不会变成 -1 ---");
  const z = S.applyKeepOneBox(makeSnapshot({
    keep_one_box: true,
    fixed_boxes: { "芯尘盒": { 24: 0, 12: 1, 8: 0, 4: 0, 2: 0, 1: 0 } },
    selectable_boxes: [{ name: "方舟官方补给物资Ⅰ", quantity: 0, options: [] }],
  }));
  chk("0 格仍为 0", z.fixed_boxes["芯尘盒"]["24"], 0);
  chk("1 格 → 0", z.fixed_boxes["芯尘盒"]["12"], 0);
  chk("自选箱 0 → 0", z.selectable_boxes[0].quantity, 0);

  console.log("\n--- 4) 不污染原快照（表单/导出仍为原始库存） ---");
  const src4 = makeSnapshot({ keep_one_box: true });
  S.applyKeepOneBox(src4);
  chk("原快照固定箱仍为 5", src4.fixed_boxes["芯尘盒"]["1"], 5);
  chk("原快照自选箱仍为 10", src4.selectable_boxes[0].quantity, 10);
  chk("原快照未打标记", src4.keep_one_box_applied, undefined);

  console.log("\n--- 5) 全箱梭哈：开启保留后可用箱量与等级均不升高 ---");
  const bigBox = {
    "芯尘盒":       { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 2000 },
    "信用点盒":     { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 2000 },
    "战斗数据辑盒": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 2000 },
    "成长套组":     { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 2000 },
  };
  const e5Off = S.evaluate(makeSnapshot({ fixed_boxes: bigBox }));
  const e5On = S.evaluate(S.applyKeepOneBox(makeSnapshot({ fixed_boxes: bigBox, keep_one_box: true })));
  truthy("每类资源可用量都严格减少",
    C.RESOURCES.every((k) => e5On.per_resource._res.selectable[k] < e5Off.per_resource._res.selectable[k]),
    JSON.stringify(C.RESOURCES.map((k) => [e5On.per_resource._res.selectable[k], e5Off.per_resource._res.selectable[k]])));
  truthy("全箱梭哈等级 开启后 <= 关闭",
    e5On.selectable.level <= e5Off.selectable.level,
    "on=" + e5On.selectable.level + " off=" + e5Off.selectable.level);
  truthy("全箱梭哈等级 >= 当前等级",
    e5On.selectable.level >= off.current_sync_level,
    "on=" + e5On.selectable.level + " cur=" + off.current_sync_level);

  console.log("\n--- 6) 与箱子无关的区块不受影响 ---");
  const rOff = S.evaluate(off), rOn = S.evaluate(S.applyKeepOneBox(makeSnapshot({ keep_one_box: true })));
  chk("裸资源档（bare）等级不变", rOn.bare.level, rOff.bare.level);
  chk("no_box 缺口不变", rOn.no_box.shortage, rOff.no_box.shortage);
  chk("no_box 需要天数不变", rOn.no_box.days, rOff.no_box.days);

  console.log("\n--- 7) 配平诊断算式：per_resource._res + 缺口折算 1H 箱 ---");
  const r = S.evaluate(off);
  const res = r.per_resource._res && r.per_resource._res.selectable;
  truthy("_res.selectable 存在", !!res);
  chk("_res 三资源齐全", res ? C.RESOURCES.filter((k) => typeof res[k] === "number").length : 0, 3);
  const lv = C.RESOURCES.map((k) => r.per_resource.selectable[k]);
  const hi = Math.max.apply(null, lv), lo = Math.min.apply(null, lv);
  const steps = Math.max(0, hi - off.current_sync_level);
  const need = steps > 0 ? C.costForLevels(off, off.current_sync_level, steps) : C.zeroRes();
  const gaps = C.RESOURCES.map((k) => Math.max(0, (need[k] || 0) - (res[k] || 0)));
  truthy("最高等级那个资源缺口为 0", gaps[lv.indexOf(hi)] === 0, "lv=" + JSON.stringify(lv) + " gaps=" + JSON.stringify(gaps));
  truthy("实际可达 = 三资源最低单资源等级", lo === Math.min.apply(null, lv), "hi=" + hi + " lo=" + lo);
  const missBy = C.RESOURCES.map((k, i) => gaps[i] > 0 ? Math.ceil(gaps[i] / (off.income_per_hour[k] || 1) - 1e-9) : 0);
  truthy("缺口折算 1H 箱为非负整数", missBy.every((v) => Number.isInteger(v) && v >= 0) && missBy.some((v) => v > 0), JSON.stringify(missBy));

  console.log("\n--- 8) 构造「红球/信用点够、经验箱不够」的瓶颈场景 ---");
  const asym = makeSnapshot({
    fixed_boxes: {
      "芯尘盒":       { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 400 },
      "信用点盒":     { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 400 },
      "战斗数据辑盒": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 10 },
      "成长套组":     { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 0 },
    },
    selectable_boxes: [],
  });
  const ra = S.evaluate(asym);
  const lva = C.RESOURCES.map((k) => ra.per_resource.selectable[k]);
  truthy("战斗数据辑为最低（瓶颈）", ra.per_resource.selectable.battle_data === Math.min.apply(null, lva), JSON.stringify(lva));
  truthy("红球能到的等级高于战斗数据辑",
    ra.per_resource.selectable.core_dust > ra.per_resource.selectable.battle_data,
    "dust=" + ra.per_resource.selectable.core_dust + " battle=" + ra.per_resource.selectable.battle_data);
  const hiA = Math.max.apply(null, lva), loA = Math.min.apply(null, lva);
  truthy("瓶颈场景 hi > lo（配平诊断会给出缺口）", hiA > loA, "hi=" + hiA + " lo=" + loA);

  console.log("\n" + (fail === 0 ? "ALL KEEP-ONE-BOX TESTS PASSED" : (fail + " TEST(S) FAILED")));
  process.exit(fail === 0 ? 0 : 1);
});
