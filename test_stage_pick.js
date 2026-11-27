/* test_stage_pick.js — 「关卡进度」选择口径回归（R109，2026-11-28）
 *
 * 背景：用户报障「很多用户反馈关卡进度对不上」。公式和关卡表都没问题——与
 * nikkeoutpost / NikkeCalc 逐位一致（见 test_progress_fix.js），坏在**默认值**：
 *   1) 普通 / 困难章节默认落在最末章 Chapter 50；
 *   2) 改普通章节时 enforceHardCap 把困难章节夹到同一章，**并把困难关卡填成该章末关**；
 *   3) 改章节时关卡自动落到该章末关。
 * 结果：只动过「普通章节」一个下拉的用户，困难进度被凭空补成「同章全通」——
 * 34 章会被算成 Lv.465（真实只有普通进度时 ~231），于是所有人都在喊对不上。
 *
 * 覆盖：
 *   A 默认章节 = 第一关所在章，不是最末章（源码断言）
 *   B 切章不落章末关；enforceHardCap 只夹章节、关卡清成「未选择」（实跑真函数）
 *   C 普通关卡没选 → 不推算（实跑 currentCalculatedBase）
 *   D lastStage 仍服务于「未来进度」（预测语义），但不得再用于当前进度（源码断言）
 *
 * 跑法：node test_stage_pick.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.fetch = (u) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.resolve(__dirname, String(u).split("?")[0]), "utf8"))),
});
require("./js/core.js");
require("./js/outpost.js");
const O = global.NikkeOutpost;

let pass = 0, fail = 0;
const failures = [];
function eq(got, want, label) {
  const ok = got === want;
  if (ok) pass++;
  else { fail++; failures.push(label + " → 实际 " + JSON.stringify(got) + " / 期望 " + JSON.stringify(want)); }
}

/* 从 app.js 按大括号配对抠函数（app.js 是 IIFE，不导出内部函数） */
function readSrc() { return fs.readFileSync(path.join(__dirname, "js/app.js"), "utf8"); }
function extract(name, src) {
  src = src || readSrc();
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("找不到函数 " + name);
  let depth = 0, end = -1;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error("函数体不完整 " + name);
  return src.slice(start, end);
}

/* ---------- 极简 DOM：只实现 select/option 的浏览器语义 ---------- */
function makeOption() { return { value: "", textContent: "", selected: false }; }
function makeSelect() {
  const s = { id: "", options: [] };
  Object.defineProperty(s, "innerHTML", {
    get() { return ""; },
    set() { s.options = []; },
  });
  /* 浏览器语义：没有 option 带 selected 时，第一项就是当前值 */
  Object.defineProperty(s, "value", {
    get() {
      const hit = s.options.filter((o) => o.selected)[0];
      if (hit) return hit.value;
      return s.options.length ? s.options[0].value : "";
    },
    set(v) { s.options.forEach((o) => { o.selected = o.value === v; }); },
  });
  s.appendChild = (o) => { s.options.push(o); };
  return s;
}
const doc = {
  _els: {},
  createElement: () => makeOption(),
  getElementById(id) { return doc._els[id] || (doc._els[id] = makeSelect()); },
};
const $ = (id) => doc.getElementById(id);
const val = (id) => { const el = $(id); return el ? el.value : ""; };
const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };

(async () => {
  await O.loadStageMap();
  const src = readSrc();

  /* 章节 -> 关卡列表，和 renderForm 里的 state 结构一致 */
  const normalChapters = O.chapters("normal");
  const normalStages = {}, hardStages = {};
  normalChapters.forEach((ch) => { normalStages[ch] = O.stagesInChapter(ch, "normal"); });
  O.chapters("hard").forEach((ch) => { hardStages[ch] = O.stagesInChapter(ch, "hard"); });
  const state = {
    form: { normal_stage: "", hard_stage: "" },
    normalChapters, hardChapters: O.chapters("hard"),
    normalStages, hardStages, futureNormalStages: {}, futureHardStages: {},
  };

  const body = [
    extract("chapterNum", src), extract("lastStage", src), extract("fillSelect", src),
    extract("syncStageOptions", src), extract("enforceHardCap", src), extract("followUpNormal", src),
  ].join("\n");
  const api = new Function("state", "$", "val", "setVal", "document", "UNSET_STAGE",
    body + "\nreturn { chapterNum, lastStage, fillSelect, syncStageOptions, enforceHardCap, followUpNormal };")(
    state, $, val, setVal, doc, "未选择");

  /* ---------- A 默认章节 ---------- */
  eq(normalChapters[0], "Chapter 0", "A1 普通章节第一项是 Chapter 0");
  eq(normalChapters[normalChapters.length - 1], "Chapter 50", "A2 最末章仍是 Chapter 50（数据没变）");
  eq(/chapterOfSection\(f\.normal_stage\) \|\| state\.normalChapters\[0\]/.test(src), true,
    "A3 源码：当前普通默认章节取第一关所在章");
  eq(/chapterOfSection\(f\.hard_stage\) \|\| state\.hardChapters\[0\]/.test(src), true,
    "A4 源码：当前困难同上");
  eq(/chapterOfSection\(f\.future_normal_stage\) \|\| state\.normalChapters\[state\.normalChapters\.length - 1\]/.test(src), true,
    "A5 源码：未来普通仍默认最末章（预测语义，不动）");

  /* ---------- B 切章节 ---------- */
  api.fillSelect($("f_normal_chapter"), state.normalChapters, "Chapter 0");
  api.fillSelect($("f_hard_chapter"), state.hardChapters, "Chapter 0");
  api.syncStageOptions("normal");
  api.syncStageOptions("hard");
  eq($("f_normal_stage").value, "未选择", "B1 初始普通关卡 = 未选择");
  eq($("f_hard_stage").value, "未选择", "B2 初始困难关卡 = 未选择");

  /* 复刻「普通章节」change 处理器的顺序：syncStageOptions → 清关卡 → enforceHardCap。
     困难章节先按旧版默认（最末章）摆着，这才是用户实际踩到的状态。 */
  setVal("f_hard_chapter", "Chapter 50");
  setVal("f_normal_chapter", "Chapter 34");
  api.syncStageOptions("normal");
  setVal("f_normal_stage", "未选择");
  const capped = api.enforceHardCap();
  eq(capped, true, "B3 困难章节高于普通 → 触发夹取");
  eq(val("f_hard_chapter"), "Chapter 34", "B4 困难章节跟到 Chapter 34");
  eq(val("f_hard_stage"), "未选择", "B5 困难关卡清成「未选择」（旧版会填 34-38 BOSS）");
  eq(api.lastStage("hard", "Chapter 34"), "34-38 BOSS", "B6 lastStage 本身仍返回章末关（未来进度用）");

  /* 旧行为到底多离谱：章末关 × 双难度 → Lv.465；只算普通 → Lv.231 */
  eq(O.computeBaseLevel("34-38 BOSS", "34-38 BOSS"), 465, "B7 旧口径（困难被补成全通）= Lv.465");
  eq(O.computeBaseLevel("34-38 BOSS", null), 231, "B8 真实口径（只普通）= Lv.231");

  /* 困难章节本来就低于普通 → 不夹、不提示 */
  setVal("f_normal_chapter", "Chapter 20");
  setVal("f_hard_chapter", "Chapter 12");
  eq(api.enforceHardCap(), false, "B9 困难低于普通 → 不动");

  /* 反方向：先填困难（困难 30 章 ⇒ 普通至少 30 章），不许把用户刚填的困难弹回去 */
  setVal("f_normal_chapter", "Chapter 20");
  setVal("f_hard_chapter", "Chapter 30");
  api.syncStageOptions("hard");
  setVal("f_hard_stage", "30-5");
  setVal("f_normal_stage", "20-1");
  const raised = api.followUpNormal();
  eq(raised, true, "B10 困难高于普通 → 抬普通");
  eq(val("f_normal_chapter"), "Chapter 30", "B11 普通章节跟到 Chapter 30");
  eq(val("f_normal_stage"), "未选择", "B12 普通关卡清成「未选择」");
  eq(val("f_hard_stage"), "30-5", "B13 困难关卡保留用户刚选的 30-5");
  eq(api.followUpNormal(), false, "B14 已经持平 → 不重复抬");

  /* ---------- C 只选困难不推算 ---------- */
  const ccbRun = new Function("O", "UNSET_STAGE", "collectForm", "progressFix",
    extract("currentCalculatedBase", src) + "\nreturn currentCalculatedBase;");
  const fake = { normal_stage: "未选择", hard_stage: "20-1" };
  eq(ccbRun(O, "未选择", () => fake, () => 0)(), null, "C1 普通未选 + 困难已选 → 不推算");
  eq(ccbRun(O, "未选择", () => ({ normal_stage: "", hard_stage: "" }), () => 0)(), null,
    "C2 两边都空 → 不推算");
  eq(ccbRun(O, "未选择", () => ({ normal_stage: "20-1", hard_stage: "未选择" }), () => 0)(),
    O.computeBaseLevel("20-1", null), "C3 普通已选 + 困难未选 → 只按普通算");
  eq(ccbRun(O, "未选择", () => ({ normal_stage: "20-1", hard_stage: "20-1" }), () => 0)(), 208,
    "C4 双难度同关 = Lv.208（金标准不变）");

  /* ---------- D 防回退 ---------- */
  eq(/setVal\("f_normal_stage",\s*lastStage/.test(src), false, "D1 切普通章节不再落章末关");
  eq(/setVal\("f_hard_stage",\s*lastStage/.test(src), false, "D2 切困难章节不再落章末关");
  eq(/setVal\("f_future_normal_stage",\s*lastStage/.test(src), true, "D3 未来普通仍按章末关预测");
  eq(/setVal\("f_future_hard_stage",\s*lastStage/.test(src), true, "D4 未来困难仍按章末关预测");
  eq(extract("enforceHardCap", src).indexOf("lastStage") < 0, true, "D5 enforceHardCap 函数体内不写关卡");
  eq(extract("followUpNormal", src).indexOf("lastStage") < 0, true, "D6 followUpNormal 函数体内不写关卡");

  console.log("=== test_stage_pick ===");
  console.log("通过 " + pass + " 项，失败 " + fail + " 项");
  failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
  process.exit(fail ? 1 : 0);
})();
