/* test_future_base.js — 「新主线开放后 · 前哨基地等级」口径回归
 *
 * 覆盖（R93，2026-11-19 用户报障「手填 553、未来卡显示 535」）：
 *   1 当前/未来关卡相同、手填=推算 → 等于推算值
 *   2 当前关卡未填（offset 无处可算）→ **未来不得低于手填**
 *   3 当前关卡已填、手填比推算高 N 级 → 差值带到未来
 *   4 未来进度反而落后 → 仍取手填
 *   5 没填未来关卡 → 返回 null，交给调用方回退
 *
 * 直接从 js/app.js 抠出真函数执行，不另写一份实现（否则测的是测试自己）。
 * 跑法：node test_future_base.js
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

/* 从源码里按大括号配对抠出函数体（app.js 是 IIFE，不导出内部函数） */
function extract(name) {
  const src = fs.readFileSync(path.join(__dirname, "js/app.js"), "utf8");
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

let pass = 0, fail = 0;
const failures = [];
function eq(got, want, label) {
  const ok = got === want;
  if (ok) pass++;
  else { fail++; failures.push(label + " → 实际 " + JSON.stringify(got) + " / 期望 " + JSON.stringify(want)); }
}

(async () => {
  await O.loadStageMap();
  const resolveFutureBase = new Function("O", extract("resolveFutureBase") + "\nreturn resolveFutureBase;")(O);

  const A = "40-1", B = "48-36 BOSS";
  const dA = O.computeBaseLevel(A, A);          // 554
  const dB = O.computeBaseLevel(B, B);          // 712

  // 1
  eq(resolveFutureBase({ base: String(dA), normal_stage: A, hard_stage: A, future_normal_stage: A, future_hard_stage: A }), dA,
    "1 同关卡同手填 → 等于推算值");

  // 2 本次报障：当前关卡未填 + 手填高于推算
  const higher = dA + 18;
  eq(resolveFutureBase({ base: String(higher), normal_stage: "", hard_stage: "", future_normal_stage: A, future_hard_stage: A }), higher,
    "2 当前关卡未填 → 未来不得低于手填");

  // 3
  eq(resolveFutureBase({ base: String(dA + 3), normal_stage: A, hard_stage: A, future_normal_stage: B, future_hard_stage: B }), dB + 3,
    "3 差值带到未来");

  // 4
  eq(resolveFutureBase({ base: String(dB), normal_stage: B, hard_stage: B, future_normal_stage: A, future_hard_stage: A }), dB,
    "4 未来进度落后 → 取手填");

  // 5
  eq(resolveFutureBase({ base: String(dA), normal_stage: A, hard_stage: A, future_normal_stage: "", future_hard_stage: "" }), null,
    "5 未填未来关卡 → null");

  console.log("=== test_future_base ===");
  console.log("通过 " + pass + " 项，失败 " + fail + " 项");
  failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
  process.exit(fail ? 1 : 0);
})();
