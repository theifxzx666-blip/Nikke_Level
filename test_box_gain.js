/* box_gain_vs_now（同一批箱子等到开放日再开箱可多赚 N 级）口径回归
   R60：由「两次整数等级之差」改为**连续值**——同一批箱按新收益 vs 当前收益折算的资源差额
        ÷ 箱子落地等级的单级消耗，取三资源最小值。
   为什么改：收益差只有 1.85% 时真值 ≈0.8 级，旧口径取整后在 0/1 之间来回翻（同一库存
             10-16~10-26 恒为 0，箱量 ±3% 就能翻），表现为「多赚 1 级」忽然变「多赚 0 级」。
   运行：node test_box_gain.js   （期望 ALL BOX-GAIN TESTS PASSED）
   基线数值由实跑得出（用户 2026-10-26 导出快照：基地 571 → 588），禁止凭记忆改写。 */
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
const S = global.NikkeScenarios;

let fail = 0;
function chk(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + detail));
  if (!ok) fail++;
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-9 : tol); }

/* 用户 2026-10-26 导出快照（反推输入；详见 临时文件/scripts/_repro_r60.js） */
const TPL_BOXES = {
  "挑战者成长宝箱": [
    { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
    { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" },
  ],
  "方舟官方补给物资Ⅰ": [
    { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
    { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" },
  ],
  "30天成长补给箱": [
    { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
    { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" },
  ],
};
const TIERS = [
  { level: 501, credit: 8185, battle_data: 72544, core_dust: 14000 },
  { level: 551, credit: 9003, battle_data: 78347, core_dust: 15000 },
  { level: 601, credit: 9453, battle_data: 83832, core_dust: 16000 },
];

function makeSnapshot(opt) {
  opt = opt || {};
  const k = opt.boxScale === undefined ? 1 : opt.boxScale;
  const fut = opt.futureIncome || { credit: 64800, battle_data: 657000, core_dust: 107.47 };
  const q = (n) => Math.round(n * k);
  return {
    recorded_at: new Date((opt.date || "2026-10-26") + "T00:00:00"),
    current_sync_level: 525,
    target_sync_level: 541,
    alternate_target_level: 561,
    base_level: 571,
    income_per_hour: { credit: 63620, battle_data: 643570, core_dust: 105.87 },   // 基地 571
    future_base_level: 588,
    future_income_per_hour: fut,                                                   // 基地 588
    main_story_open_at: new Date("2026-11-18T00:00:00"),
    bare_resources: { credit: 31769949, battle_data: 331973611, core_dust: 35756 },
    daily_wipeout_count: 3,
    wipeout_hours_each: 2,
    completed_wipeouts_today: 3,
    daily_full: true,
    extra_daily: { credit: 0, battle_data: 0, core_dust: 0 },
    fixed_boxes: {
      "芯尘盒": { 24: 0, 12: q(3), 8: 0, 4: 0, 2: q(99), 1: q(4265) },
      "信用点盒": { 24: 0, 12: q(3), 8: q(6), 4: 0, 2: q(230), 1: q(2091) },
      "战斗数据辑盒": { 24: 0, 12: q(3), 8: 0, 4: 0, 2: q(99), 1: q(1446) },
      "成长套组": { 24: 0, 12: q(5), 8: q(4), 4: 0, 2: 0, 1: q(285) },
    },
    selectable_boxes: [
      { name: "挑战者成长宝箱", quantity: q(3170), options: TPL_BOXES["挑战者成长宝箱"] },
      { name: "方舟官方补给物资Ⅰ", quantity: q(1450), options: TPL_BOXES["方舟官方补给物资Ⅰ"] },
      { name: "30天成长补给箱", quantity: q(109), options: TPL_BOXES["30天成长补给箱"] },
    ],
    upgrade_cost: {
      per_level: { credit: 8185000, battle_data: 72544000, core_dust: 14000, overrideStart: 501, overrideEnd: 551 },
      range_start: null, range_end: null, range_total: null, tiers: TIERS,
    },
    stage_clear_resources: { credit: 14305500, battle_data: 49250000, core_dust: 950 },
    activities: [], monthly_card: false, keep_one_box: false,
    challenger_pref: "auto", selectable_missing: [],
  };
}
function gain(snap) { return S.futureMainStoryScenario(snap).box_gain_vs_now; }

/* 1) 收益完全相同 → 箱子不多值一分钱 */
chk("收益相同 → box_gain = 0",
  near(gain(makeSnapshot({ futureIncome: { credit: 63620, battle_data: 643570, core_dust: 105.87 } })), 0),
  "actual=" + gain(makeSnapshot({ futureIncome: { credit: 63620, battle_data: 643570, core_dust: 105.87 } })));

/* 2) 用户实际场景（+1.85%）：真值在 0~1 之间且**不是整数**（旧口径此处取整成 0） */
const g0 = gain(makeSnapshot());
chk("用户实测（收益 +1.85%）→ 0 < box_gain < 1", g0 > 0 && g0 < 1, "actual=" + g0);
chk("用户实测 → 不是整数（旧口径取整成 0/1，R60 已弃用）", !Number.isInteger(g0), "actual=" + g0);
chk("用户实测 → 基线 ≈ 0.788 级（实跑锁定，容差 1e-6）", near(g0, 0.7880034972621798, 1e-6), "actual=" + g0);

/* 3) 对未来收益严格单调（旧口径 0/0/0/1 有平台期） */
const byIncome = [63620, 64000, 64800, 66000, 68000].map(c => gain(makeSnapshot({
  futureIncome: { credit: c, battle_data: 643570 * (c / 63620), core_dust: 105.87 * (c / 63620) },
})));
chk("未来收益递增 → box_gain 严格递增", byIncome.every((v, i) => i === 0 || v > byIncome[i - 1]),
  JSON.stringify(byIncome));
chk("首个平台期已消失（收益 +0.6% 也应 > 0）", byIncome[1] > 0, "actual=" + byIncome[1]);

/* 4) 与「数据日期」完全无关（这是旧口径最容易被误读成「衰减」的地方） */
const dates = ["2026-10-18", "2026-10-22", "2026-10-24", "2026-10-26"].map(d => gain(makeSnapshot({ date: d })));
chk("换数据日期 → box_gain 逐位相同", dates.every(v => near(v, dates[0], 1e-12)), JSON.stringify(dates));

/* 5) 对箱量单调（旧口径 ±3% 会 0/1 来回翻） */
const byBox = [0.90, 0.95, 1.00, 1.05, 1.10].map(k => gain(makeSnapshot({ boxScale: k })));
chk("箱量递增 → box_gain 单调不减", byBox.every((v, i) => i === 0 || v >= byBox[i - 1]), JSON.stringify(byBox));
chk("箱量 1.00 与 1.05 不再是「0 → 1」跳变", Math.abs(byBox[3] - byBox[2]) < 0.2, JSON.stringify(byBox));

/* 6) 未填未来收益 → 0（不抛错） */
chk("未填 future_income_per_hour → 0",
  near(gain(makeSnapshot({ futureIncome: { credit: 0, battle_data: 0, core_dust: 0 } })), 0),
  "actual=" + gain(makeSnapshot({ futureIncome: { credit: 0, battle_data: 0, core_dust: 0 } })));

/* 7) 拆解口径：app.js 用 Math.round(box_gain) 参与整数加法，必须能回到整数 */
chk("Math.round(box_gain) 为非负整数", Number.isInteger(Math.round(g0)) && Math.round(g0) >= 0, "actual=" + g0);

console.log(fail ? "FAILED " + fail : "ALL BOX-GAIN TESTS PASSED");
process.exit(fail ? 1 : 0);
