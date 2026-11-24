/* test_progress_fix.js — 关卡进度读数与「进度修正」回归（R107，2026-11-24）
 *
 * 背景：用户要求按参考站核对基地等级推算，并参考其「国服」口径。
 * 实地抓包（2026-11-24）结果：
 *   nikkeoutpost（国际服）：total = max(0,N-19) + max(0,H-1+1) + 1
 *   NikkeCalc（可切国服） ：total = max(0,N-19) + max(0,H-1+1) + 修正（默认 3 关）
 * 两站加数口径完全相同，只差一个可调常量；本页把它暴露成「进度修正（关）」，默认 0。
 *
 * 覆盖：
 *   ① 不传修正 = 旧公式（向后兼容，R64 golden 不变）
 *   ② 修正按「每 5 关 1 级」等比生效，且与两站加数口径逐位一致
 *   ③ progressOf 读数（总关数 / 本级进度 / 等级）自洽
 *   ④ 边界：±20 夹紧、负修不吃掉 2-12 这一关（total ≥ 1）
 *
 * 跑法：node test_progress_fix.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = function (url) {
  const rel = String(url).split("?")[0];
  const p = path.resolve(__dirname, rel);
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, "utf8"))) });
};

require("./js/core.js");
require("./js/outpost.js");
require("./js/servers.js");
const O = global.NikkeOutpost;
const SV = global.NikkeServers;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) { if (cond) { pass++; return true; } fail++; failures.push(label); return false; }
function eq(got, want, label) {
  return ok(got === want, label + " → 实际 " + JSON.stringify(got) + " / 期望 " + JSON.stringify(want));
}

/* 参考站公式（NikkeCalc Ge() 的等价式；fix=0 时即 nikkeoutpost 的 P=1 版本） */
function siteTotal(nId, hId, fix) {
  const a = Math.max(0, (nId || 0) - 19);
  const o = Math.max(0, (hId || 0) - 1 + 1);
  return Math.max(1, a + o + 1 + (fix || 0));
}
function siteLevel(nId, hId, fix) { return Math.floor(siteTotal(nId, hId, fix) / 5) + 1; }

(async () => {
  await SV.load();
  await O.loadStageMap();
  SV.setCurrent("intl");

  /* ---------- ① 不传修正 = 旧公式 ---------- */
  const GOLD = [
    ["2-12 BOSS", null, 1],
    ["2-12 BOSS", "2-12 BOSS", 5],
    ["20-1", "20-1", 208],
    ["40-1", "40-1", 554],
    ["48-36 BOSS", "48-36 BOSS", 712],
    ["50-36 BOSS", "50-36 BOSS", 747],
  ];
  for (const [n, h, want] of GOLD) {
    eq(O.computeBaseLevel(n, h), want, "不传修正 = R64 金标准 " + n + (h ? " + " + h : ""));
    eq(O.computeBaseLevel(n, h, 0), want, "修正 0 = 金标准 " + n);
    eq(O.computeBaseLevel(n, h, undefined), want, "修正 undefined 视作 0 " + n);
    eq(O.computeBaseLevel(n, h, null), want, "修正 null 视作 0 " + n);
  }

  /* ---------- ② 修正生效，且与参考站同口径 ---------- */
  const secs = ["2-12 BOSS", "20-1", "32-33 BOSS", "40-1", "48-36 BOSS", "49-28A-2", "50-36 BOSS"];
  for (const sec of secs) {
    const nId = O.stageId(sec), hId = O.stageId(sec);
    for (const fix of [-7, -1, 0, 1, 3, 5, 20]) {
      eq(O.computeBaseLevel(sec, sec, fix), siteLevel(nId, hId, fix),
        "参考站同口径 " + sec + " 修正 " + fix);
    }
  }
  /* +1 关不一定 +1 级：只有在跨 5 的边界上才升 1 级（回答「进度+1 到底加什么」） */
  eq(O.computeBaseLevel("20-1", "20-1", 0), 208, "20-1 修正 0 = Lv208（1038）");
  eq(O.computeBaseLevel("20-1", "20-1", 1), 208, "20-1 修正 1 仍 Lv208（1039，本级最后 1 关）");
  eq(O.computeBaseLevel("20-1", "20-1", 2), 209, "20-1 修正 2 跨档 → Lv209（1040）");
  eq(O.computeBaseLevel("20-1", "20-1", 5), 209, "20-1 修正 5 = Lv209（1043，每 5 关 1 级）");

  /* ---------- ③ progressOf 读数自洽 ---------- */
  const p1 = O.progressOf("20-1", "20-1", 0);
  eq(p1.total, 1038, "progressOf 总关数 1038（(528-19)+528+1）");
  eq(p1.level, 208, "progressOf 等级 208");
  eq(p1.inLevel, 3, "progressOf 本级进度 3/5（1038 % 5）");
  eq(p1.normal, 509, "progressOf 普通计入 509 关");
  eq(p1.hard, 528, "progressOf 困难计入 528 关");
  eq(p1.fix, 0, "progressOf 修正回显 0");

  const p2 = O.progressOf("2-12 BOSS", null, 0);
  eq(p2.total, 1, "2-12 单普通 = 1 关（前哨硬起点）");
  eq(p2.level, 1, "2-12 单普通 = Lv1");
  eq(p2.hard, 0, "未选困难 = 0 关");
  eq(O.progressOf(null, null, 0), null, "两个难度都没选 → null（不编 0 关）");
  eq(O.progressOf("未选择", "未选择", 0), null, "「未选择」占位符 → null");

  /* ---------- ④ 边界 ---------- */
  eq(O.computeBaseLevel("2-12 BOSS", null, -20), 1, "负修不吃掉 2-12：total 夹到 1 → Lv1");
  eq(O.progressOf("2-12 BOSS", null, -20).total, 1, "负修后 total 仍 ≥ 1");
  eq(O.progressOf("20-1", "20-1", 999).fix, 20, "修正上夹 20");
  eq(O.progressOf("20-1", "20-1", -999).fix, -20, "修正下夹 -20");
  eq(O.progressOf("20-1", "20-1", 2.6).fix, 3, "小数修正四舍五入");
  eq(O.progressOf("20-1", "20-1", "3").fix, 3, "字符串修正转数");

  /* 全量逐关扫：任意关 + 任意合理修正，都必须与参考站公式一致且单调不减 */
  const all = O.allStages("normal");
  let bad = 0, nonmono = 0, firstBad = null;
  for (const s of all) {
    let prev = -1;
    for (let fix = -20; fix <= 20; fix++) {
      const got = O.computeBaseLevel(s.section, s.section, fix);
      const want = siteLevel(s.id, s.id, fix);
      if (got !== want) { bad++; if (!firstBad) firstBad = { sec: s.section, fix, got, want }; }
      if (prev >= 0 && got < prev) nonmono++;
      prev = got;
    }
  }
  eq(bad, 0, "全量逐关 × 41 个修正值 = 参考站公式一致" + (firstBad ? " 首个不符 " + JSON.stringify(firstBad) : ""));
  eq(nonmono, 0, "修正递增时等级不回落（单调不减）");

  console.log("=== test_progress_fix ===");
  console.log("通过 " + pass + " 项，失败 " + fail + " 项");
  failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
  process.exit(fail ? 1 : 0);
})();
