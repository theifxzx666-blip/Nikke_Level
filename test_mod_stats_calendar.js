/* test_mod_stats_calendar.js — 定制模组「历史日历视图」回归
 *
 * 覆盖：
 *   1 calBand 色阶分档（|p|<2 浅 / 2~6 中 / >6 深；正绿负红）
 *   2 renderHistCalendar 的日期落格：空白格 + 当月天数，每天不重不漏
 *   3 有记录的日期带对应色阶与偏差文本，无记录只有日号
 *   4 翻月按钮边界（最早/最晚月禁用）
 *
 * 跑法：node test_mod_stats_calendar.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const HTML = path.join(__dirname, "mod_stats.html");
const src = fs.readFileSync(HTML, "utf8");

/* 从 HTML 内联脚本里按大括号配对抠函数 */
function extract(name) {
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

/* 组装：calMonth / todayStr 是模块级状态，测试里补桩 */
const els = {
  histCalGrid: { innerHTML: "" },
  histCalTitle: { textContent: "" },
  histCalPrev: { disabled: false },
  histCalNext: { disabled: false },
};
const code = `
let calMonth = null;
function todayStr(){ return "2026-11-20"; }
${extract("calBand")}
${extract("renderHistCalendar")}
return { renderHistCalendar, calBand, getMonth: () => calMonth };
`;
const api = new Function("document", code)({ getElementById: (id) => els[id] || null });

let pass = 0, fail = 0;
const failures = [];
function eq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++;
  else { fail++; failures.push(label + " → 实际 " + JSON.stringify(a) + " / 期望 " + JSON.stringify(b)); }
}

/* 1) 色阶分档 */
eq(api.calBand(0.5), "g1", "0.5% → 浅绿");
eq(api.calBand(2), "g2", "2% → 中绿（下界含）");
eq(api.calBand(5.9), "g2", "5.9% → 中绿");
eq(api.calBand(6), "g3", "6% → 深绿（下界含）");
eq(api.calBand(-0.1), "b1", "-0.1% → 浅红");
eq(api.calBand(-3), "b2", "-3% → 中红");
eq(api.calBand(-9), "b3", "-9% → 深红");

/* 2~3) 日期落格 */
const rec = (date, devPct, total) => ({ date, devPct, total });
const stats = {
  list: [
    rec("2026-11-03", 0.052, 12.5),   // +5.2% → g2
    rec("2026-11-17", -0.071, 9),     // -7.1% → b3
    rec("2026-11-19", 0.004, 11),     // +0.4% → g1
  ],
};
api.renderHistCalendar(stats);

const html = els.histCalGrid.innerHTML;
const cells = (html.match(/class="hcal-cell/g) || []).length;
const blanks = (html.match(/class="hcal-cell blank"/g) || []).length;
const daysInNov = 30;
eq(cells, blanks + daysInNov, "格子数 = 空白格 + 当月天数（30）");
eq(els.histCalTitle.textContent, "2026 年 11 月", "标题跟着记录所在月");

/* 每一天都出现且只出现一次 */
let missing = [];
for (let d = 1; d <= daysInNov; d++) {
  const n = (html.match(new RegExp('class="hcd">' + d + "<", "g")) || []).length;
  if (n !== 1) missing.push(d + ":" + n);
}
eq(missing, [], "1~30 每天都恰好出现一次");

/* 有记录的日期带色阶 + 偏差文本 */
eq(/hcal-cell g2[^"]*"[^>]*title="2026-11-03 · 当天 12\.50 模组 · 累计偏差 \+5\.2%"/.test(html), true, "11-03 → g2 且 title 含偏差");
eq(/class="hcal-cell b3/.test(html), true, "11-17 → b3（深红）");
eq(/class="hcal-cell g1/.test(html), true, "11-19 → g1（浅绿）");
eq(html.includes("+5.2%"), true, "单元格显示偏差百分比");
eq(html.includes("today"), true, "今天（2026-11-20）带 today 标记");

/* 无记录的日期只有日号，没有百分比 */
const cellFor = (d) => {
  const m = html.split('<div class="hcal-cell').find((s) => s.includes('class="hcd">' + d + "<"));
  return m || "";
};
eq(cellFor(5).includes("hcp"), false, "11-05 无记录 → 不显示百分比");
eq(cellFor(3).includes("hcp"), true, "11-03 有记录 → 显示百分比");

/* 4) 翻月边界：只有 2026-11 有数据 → 前后都禁用 */
eq(els.histCalPrev.disabled, true, "最早月 → 上一月禁用");
eq(els.histCalNext.disabled, true, "最晚月 → 下一月禁用");

console.log("=== test_mod_stats_calendar ===");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
process.exit(fail ? 1 : 0);
