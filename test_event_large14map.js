/* test_event_large14map.js — R107 新模板 large14map（COINS IN RUSH / 金币追逐战 / 兔女郎期）回归
 *
 * 背景：用户反馈「兔女郎活动是有地图的，跟预填的不一样」。
 * 拆包核对（母体 B 静态表）：EventStory 10088/10089（UiPrefab coinsinrush_part1/2）
 *   → EventManager 40088/40089.ParentsEventId = 82500
 *   → EventField 82500 = febg_coinrush_002（hud_event_field_coinsinrush）**有地图**
 * 结构 = 2 部 36 关 + 挑战 7 关 + 每日任务 + 商店 + 14 档签到 + 地图隐藏道具，
 * 是「14 天大活动」而不是 small14（14 天小活动、无地图、无商店/签到/小地图）。
 *
 * 覆盖：
 *   ① 结构与拆包规模（36 关 / 7 挑战 / 20 商店项 / duration 14）
 *   ② 拆包硬值（关卡代币 680、tasks.tokens 7100、挑战关首通/扫荡、商店信用点出口）
 *   ③ 引擎实跑基线（起始日无关）
 *   ④ v16.js 预置行已指向 large14map（防回退成 small14）
 *
 * 跑法：node test_event_large14map.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = function (url) {
  const p = path.resolve(__dirname, String(url).split("?")[0]);
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};

require("./js/core.js");
require("./js/events.js");
require("./js/outpost.js");
require("./js/boxes.js");
require("./js/scenarios.js");
const EV = global.NikkeEvents;

const TPL = JSON.parse(fs.readFileSync(path.join(__dirname, "data/event_templates.json"), "utf8"));
EV.setTemplates(TPL);
const T = TPL.templates.large14map;

let pass = 0, fail = 0;
const failures = [];
function eq(a, b, label) {
  if (a === b) { pass++; return true; }
  fail++; failures.push(label + " → 实际 " + JSON.stringify(a) + " / 期望 " + JSON.stringify(b));
  return false;
}
function ok(c, label) { if (c) { pass++; return true; } fail++; failures.push(label); return false; }

/* ---------- ① 结构 ---------- */
ok(!!T, "large14map 模板存在");
eq(T.type, "large14map", "type");
eq(T.duration, 14, "duration = 14 天");
eq(T.label, "14天大活动·地图", "label 明确标出带地图");
eq(T.stages.length, 36, "36 关（2 部 × 12 + 困难 12）");
eq(T.challenges.length, 7, "挑战 7 关");
eq(T.shop.items.length, 20, "商店 20 项（用代币结算的，不含免费珠宝买门票的 5 项）");
eq(T.stage_blocks.length, 3, "3 个关卡组 S1N / S2N / S2H");
eq(T.stage_blocks[1].open_day, 7, "S2N 第 8 天开放（官方 OpenConditionValue=7）");
eq(T.stage_blocks[2].open_day, 7, "S2H 与 S2N 同日开放（14 天活动双开）");
eq(T.stage_blocks[2].rush, true, "S2H 标记 rush（可用免费珠宝买进度）");
eq(T.rush_buy.S2H, 70, "rush_buy = 70（商店前 4 项门票 5×2+5×2+10×3+20×1）");

/* ---------- ② 拆包硬值 ---------- */
const tokens = T.stages.reduce((a, s) => a + (s.tokens || 0), 0);
eq(tokens, 680, "关卡代币 680（S1N 200 + S2N 230 + S2H 250）");
eq(T.tasks.tokens, 7100, "tasks.tokens 7100（逐关任务 4700 + 里程碑 900 + 地图 1500）");

const boxSum = {};
T.stages.forEach((s) => Object.keys(s.reward || {}).forEach((k) => { boxSum[k] = (boxSum[k] || 0) + s.reward[k]; }));
eq(boxSum.credit_box_1h, 14, "关卡信用点盒(1h) 14");
eq(boxSum.battle_box_1h, 14, "关卡战斗数据辑盒(1h) 14");
eq(boxSum.dust_box_1h, 8, "关卡芯尘盒(1h) 8");

const c1 = T.challenges[0];
eq(c1.open_day, 0, "挑战 1-1 开放日 0");
eq(c1.first.credit, 19320, "挑战 1-1 首通信用点 19320（官方 3500201）");
eq(c1.first.battle, 456292, "挑战 1-1 首通战斗数据辑 456292");
eq(c1.first.dust, 16, "挑战 1-1 首通芯尘 16");
eq(c1.first.recruit_ticket, 1, "挑战 1-1 首通招募券 1");
eq(c1.sweep.credit, 9660, "挑战 1-1 扫荡信用点 9660");
eq(T.challenges[3].first.challenger_box, 40, "挑战 1-4 首通挑战者箱 40（本期值，small14 是 42）");
eq(T.challenges[6].first.challenger_box, 50, "挑战 1-7 首通挑战者箱 50");
eq(T.challenges[6].open_day, 18, "挑战 1-7 第 19 天开放");

const creditItem = T.shop.items[T.shop.items.length - 1];
eq(creditItem.count, -1, "商店末项 count=-1（余额出口）");
eq(creditItem.reward.credit, 2000, "信用点出口 10 代币 → 2000 信用点");

eq(T.daily_task.per_day.token, 120, "每日任务代币 120/天（60 点档）");
eq(T.daily_task.per_day.credit_box_1h, 1, "每日任务信用点盒(1h) 1");
eq(T.daily_task.per_day.dust_box_1h, 1, "每日任务芯尘盒(1h) 1");
eq(T.daily_task.per_day.growth_box_1h, 1, "每日任务成长套组(1h) 1");
eq(T.checkin.length, 2, "签到只有 2 档可入账（第 6 天 8h / 第 12 天 12h）");
eq(T.checkin[0].offset_day, 5, "签到第一档 offset_day 5 = 第 6 天");
eq(T.checkin[1].offset_day, 11, "签到第二档 offset_day 11 = 第 12 天");

/* ---------- ③ 引擎实跑基线（起始日无关） ---------- */
const BASE = { days: 14, credit: 1754820, battle: 13149806, dust: 240, challenger: 188,
               c1: 28, b1: 14, d1: 392, g1: 14, g8: 1, g12: 1 };
["2026-12-02", "2026-11-04", "2027-01-20"].forEach((start, i) => {
  const m = EV.planActivity("large14map", start, null);
  const t = m.totals;
  const tag = "large14map@" + start;
  if (i === 0) eq(m.inject_days, BASE.days, tag + " inject_days");
  else eq(m.inject_days, BASE.days, tag + " inject_days(起始日无关)");
  if (i > 0) return;
  eq(t.res.credit, BASE.credit, tag + " 信用点");
  eq(t.res.battle_data, BASE.battle, tag + " 战斗数据辑");
  eq(t.res.core_dust, BASE.dust, tag + " 芯尘");
  eq((t.selectable["挑战者成长宝箱"] || 0), BASE.challenger, tag + " 挑战者成长宝箱");
  eq(((t.fixed["信用点盒"] || {})[1] || 0), BASE.c1, tag + " 信用点盒(1h)");
  eq(((t.fixed["战斗数据辑盒"] || {})[1] || 0), BASE.b1, tag + " 战斗数据辑盒(1h)");
  eq(((t.fixed["芯尘盒"] || {})[1] || 0), BASE.d1, tag + " 芯尘盒(1h)");
  eq(((t.fixed["成长套组"] || {})[1] || 0), BASE.g1, tag + " 成长套组(1h)");
  eq(((t.fixed["成长套组"] || {})[8] || 0), BASE.g8, tag + " 成长套组(8h)");
  eq(((t.fixed["成长套组"] || {})[12] || 0), BASE.g12, tag + " 成长套组(12h)");
});

/* ---------- ④ 预置行不许回退 ---------- */
const v16 = fs.readFileSync(path.join(__dirname, "js", "v16.js"), "utf8");
ok(v16.indexOf("'large14map|2026-12-02'") >= 0, "v16.js EVENT_NAMES 有 large14map|2026-12-02");
ok(v16.indexOf("{ tpl: 'large14map', date: '2026-12-02' }") >= 0, "v16.js SEED_EVENTS 2026-12-02 用 large14map");
ok(v16.indexOf("'small14|2026-12-02'") < 0, "v16.js 不再把 2026-12-02 标成 small14");

console.log("=== test_event_large14map ===");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
process.exit(fail ? 1 : 0);
