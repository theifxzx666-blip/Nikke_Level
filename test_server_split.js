/* test_server_split.js — 分服（国际服 / 国服）与存档迁移回归测试
 *
 * 覆盖：
 *   ① 关卡表规模与基地上限（R63：**两服共用国际服表**；R68 起 1,875/1,875 → Lv747，不再按服截断）
 *   ② 基地等级公式 golden 点（官方 OutpostBattleTable 口径）与全量逐关扫
 *   ③ 两服关卡列表完全一致（R63 的核心诉求：选国服不会少关卡）
 *   ④ 存档迁移（v1 无 server/_schema → v2，且不丢任何字段）
 *   ⑤ 旧公式偏差留痕（防止有人把 19 这个常量改回来）
 *
 * 跑法：node test_server_split.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

/* fetch 打桩：相对路径 → 读本地文件（node 的 fetch 不支持 file://，且要吃掉 ?v= 缓存参数） */
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
function ok(cond, label, extra) {
  if (cond) { pass++; return true; }
  fail++;
  failures.push(label + (extra ? "  → " + extra : ""));
  return false;
}
function eq(actual, expect, label) {
  return ok(actual === expect, label, "实际 " + JSON.stringify(actual) + " / 期望 " + JSON.stringify(expect));
}
function useServer(key) {
  const p = SV.get(key);
  SV.setCurrent(p.key);
  O.setServer({
    key: p.key,
    maxChapter: Number(p.max_chapter),
    cap: SV.capOf(p.key),
    incomeScale: SV.incomeScaleOf(p.key),
  });
  return p;
}

/* 两站口径（= R64 现行公式，也等于 R61 之前的旧实现，二者其实一致）：
     a = max(0, nId-19)、o = hId、n = a+o+1 */
function siteFormula(nId, hId) {
  const a = Math.max(0, (nId || 0) - 19);
  const o = Math.max(0, (hId || 0) - 1 + 1);
  return Math.floor((a + o + 1) / 5) + 1;
}
/* R61 的错误公式：直接把两个原始 id 相加，把 2-12 解锁前的 18 关也算进去 */
function r61Formula(nId, hId) {
  return Math.floor(((nId || 0) + (hId || 0)) / 5) + 1;
}

(async function main() {
  /* ---------- ① 档案与关卡表规模 ---------- */
  await SV.load();
  await O.loadStageMap();
  /* R64：关卡列表起点 与 基地计数起点 是两套基准，混用会把 Chapter 0~1 剔出下拉 */
  const SM = O.stageMap();
  ok(!!SM, "stageMap 已导出（基准校验不得静默跳过）");
  eq(Number(SM.normal_start_id), 1, "normal_start_id = 1（关卡列表起点，保持 0-1）");
  eq(Number(SM.base_start_normal_id), 19, "base_start_normal_id = 19（基地计数从 2-12 起算）");
  eq(SM.stages.find((s) => Number(s.id) === 19).section, "2-12 BOSS", "id=19 确为 2-12 BOSS");
  const EXPECT = {
    /* R68（2026-10-29）：主线 49/50 章上线 → 51 章 / 上限 Chapter 50 / 各 1,875 关 / Lv747 */
    intl: { chapters: 51, max: 50, n: 1875, h: 1875, cap: 747 },
    /* R63：国服不再单独截断。曾据 sd.bin 过期缓存写 33 章/1,081 关，国服实到 40 章已证伪 */
    cn:   { chapters: 51, max: 50, n: 1875, h: 1875, cap: 747 },
  };
  for (const key of Object.keys(EXPECT)) {
    const e = EXPECT[key];
    const p = useServer(key);
    eq(Number(p.max_chapter), e.max, key + " 档案 max_chapter");
    eq(O.chapters("normal").length, e.chapters, key + " 普通章节数");
    eq(O.chapters("hard").length, e.chapters, key + " 困难章节数");
    eq(O.stageCount("normal"), e.n, key + " 普通关卡总数");
    eq(O.stageCount("hard"), e.h, key + " 困难关卡总数");
    eq(SV.capOf(key), e.cap, key + " 基地等级上限");
    eq(Number(p.base_cap), e.cap, key + " 档案 base_cap 与推导值一致");
    /* base_cap 必须能由 stage_map 的基准 + 关卡总数独立推导出来（交叉校验，防手改错） */
    const sn0 = Number(SM.base_start_normal_id) || 19;
    const derived = Math.floor((Math.max(0, e.n - sn0) + e.h + 1) / 5) + 1;
    eq(derived, e.cap, key + " base_cap 可由 stage_map 基准独立推导（普通从 2-12 起算）");
    eq(O.chapters("normal")[0], "Chapter 0", key + " 首章为 Chapter 0");
    eq(O.chapters("normal").slice(-1)[0], "Chapter " + e.max, key + " 末章");
    eq(O.allStages("normal")[0].section, "0-1", key + " 普通首关为 0-1（关卡列表从 0-1 起）");
  }
  /* R63：两服关卡表必须**完全一致**（用户裁决「关卡选择器就按国际服的来」） */
  useServer("intl");
  const intlPerCh = O.chapters("normal").map((ch) => O.stagesInChapter(ch, "normal").length);
  const intlSections = O.allStages("normal").map((s) => s.section);
  const intlHard = O.allStages("hard").map((s) => s.section);
  useServer("cn");
  const cnPerCh = O.chapters("normal").map((ch) => O.stagesInChapter(ch, "normal").length);
  const cnSections = O.allStages("normal").map((s) => s.section);
  const cnHard = O.allStages("hard").map((s) => s.section);
  eq(cnPerCh.join(","), intlPerCh.join(","), "国服逐章关数与国际服完全一致（含第 33 章之后）");
  eq(cnSections.join("|"), intlSections.join("|"), "国服普通关卡列表与国际服逐关一致");
  eq(cnHard.join("|"), intlHard.join("|"), "国服困难关卡列表与国际服逐关一致");
  ok(cnSections.indexOf("40-1") >= 0, "国服可选到 Chapter 40（国服实际进度，旧版会被截到 32 章）");

  /* ---------- ② 公式 golden 点（官方表口径） ---------- */
  const GOLD = [
    // [服务器, 普通关卡, 困难关卡, 期望值] —— R64 口径：普通从 2-12(id19) 起算、困难从 0-1(id1) 起算
    ["intl", "0-1", null, 1],
    ["intl", "0-3 BOSS", null, 1],
    ["intl", "1-1", null, 1],
    ["intl", "2-12 BOSS", null, 1],   // 19-19=0 → total 1 → Lv1（2-12 是第 1 个计入的关）
    ["intl", "2-12 BOSS", "2-12 BOSS", 5],  // 0+19+1 = 20 → Lv5
    ["intl", "20-1", "20-1", 208],    // (528-19)+528+1 = 1038 → Lv208
    ["intl", "48-36 BOSS", "48-36 BOSS", 712],  // (1787-19)+1787+1 = 3556 → Lv712（R68 前满级）
    ["intl", "50-36 BOSS", "50-36 BOSS", 747],  // (1875-19)+1875+1 = 3732 → Lv747（R68 满级）
    ["cn", "20-1", "20-1", 208],
    ["cn", "32-33 BOSS", null, 213],  // (1081-19)+0+1 = 1063 → Lv213
    ["cn", "32-33 BOSS", "32-33 BOSS", 429],   // (1081-19)+1081+1 = 2144 → Lv429
    ["cn", "40-1", "40-1", 554],              // (1392-19)+1392+1 = 2766 → Lv554
    ["cn", "48-36 BOSS", "48-36 BOSS", 712],
    ["cn", "50-36 BOSS", "50-36 BOSS", 747],
  ];
  /* 逐关扫：对每个服务器的每一关，令普通=困难=该关，核对新口径公式（并封顶） */
  for (const key of Object.keys(EXPECT)) {
    useServer(key);
    const cap = EXPECT[key].cap;
    const stages = O.allStages("normal");
    let bad = 0, firstBad = null;
    for (const s of stages) {
      const got = O.computeBaseLevel(s.section, s.section);
      const want = Math.min(cap, Math.floor((Math.max(0, s.id - 19) + s.id + 1) / 5) + 1);
      if (got !== want) { bad++; if (!firstBad) firstBad = { id: s.id, section: s.section, got, want }; }
    }
    eq(bad, 0, key + " 全量逐关扫（" + stages.length + " 关）公式一致" + (firstBad ? " 首个不符 " + JSON.stringify(firstBad) : ""));
  }
  for (const g of GOLD) {
    useServer(g[0]);
    eq(O.computeBaseLevel(g[1], g[2]), g[3], g[0] + " 金标准 " + g[1] + (g[2] ? " + " + g[2] : "") + " = Lv" + g[3]);
  }

  /* ---------- ③ 不截断（R63） ---------- */
  for (const key of ["intl", "cn"]) {
    useServer(key);
    eq(O.clampSection("40-1", "normal"), "40-1", key + "：40-1 不被截断");
    eq(O.clampSection("32-33 BOSS", "normal"), "32-33 BOSS", key + "：32-33 BOSS 不被截断");
    eq(O.clampSection("48-36 BOSS", "hard"), "48-36 BOSS", key + "：48-36 BOSS 不被截断");
    eq(O.clampSection("50-36 BOSS", "hard"), "50-36 BOSS", key + "：50-36 BOSS 不被截断（R68 新满进度）");
    eq(O.clampSection("49-25A-1", "normal"), "49-25A-1", key + "：49-25A-1（新章分支关）不被截断");
    eq(O.clampSection("", "normal"), "", key + "：空值原样返回");
    eq(O.computeBaseLevel("48-36 BOSS", "48-36 BOSS"), 712, key + "：R68 前满进度基地 Lv712");
    eq(O.computeBaseLevel("50-36 BOSS", "50-36 BOSS"), 747, key + "：满进度基地 Lv747");
    eq(O.computeBaseLevel("40-1", "40-1"), 554, key + "：40-1 普通+困难 = Lv554");
  }
  /* 两服对同一组输入必须给出同一个基地等级（否则说明仍有残留分叉） */
  const probe = ["0-1", "20-1", "32-33 BOSS", "40-1", "48-36 BOSS", "49-1", "50-36 BOSS"];
  for (const sec of probe) {
    useServer("intl");
    const a = O.computeBaseLevel(sec, sec);
    useServer("cn");
    const b = O.computeBaseLevel(sec, sec);
    eq(b, a, "两服同输入同结果：" + sec + " = Lv" + a);
  }

  /* ---------- ④ 存档迁移 ---------- */
  const v1 = { recorded: "2026-10-01", base: "518", current: "489", future_qqq: 42, fixed: { 芯尘盒: { 1: 3 } } };
  SV.migrateForm(v1);
  eq(v1.server, "intl", "v1 存档补 server=intl");
  eq(v1._schema, SV.SCHEMA, "v1 存档补 _schema");
  eq(v1.base, "518", "迁移不动业务字段 base");
  eq(v1.future_qqq, 42, "迁移不删未知字段（未来字段保留）");
  ok(!!(v1.fixed && v1.fixed["芯尘盒"]), "迁移不丢 fixed 结构");
  eq(v1._migratedFrom, 1, "迁移留痕 _migratedFrom=1");

  const zh = { server: "国服" };
  SV.migrateForm(zh);
  eq(zh.server, "cn", "中文「国服」归一为 cn");
  SV.migrateForm(zh);
  eq(zh.server, "cn", "二次迁移幂等（server 不乱变）");

  const garbage = { server: "???" };
  SV.migrateForm(garbage);
  eq(garbage.server, "intl", "未知服务器值退回国际服");

  const v2 = { server: "cn", _schema: 2, base: "518" };
  SV.migrateForm(v2);
  eq(v2._migratedFrom, undefined, "v2 存档不打 _migratedFrom");
  eq(v2.base, "518", "v2 存档字段不变");

  /* ---------- ⑤ R61「偏高 3 级」回归防护（R64） ----------
     R61 把公式改成 total = 普通id + 困难id，等于把前哨基地解锁前的 18 关（0-1~2-11）
     也算进基地等级 → 全站恒定偏高 3 级（早期偏高 4 级）。这里把差值钉死，防止再改回去。 */
  useServer("intl");
  const idOf = (s) => O.stageId(s);
  const cmp = [
    ["2-12 BOSS", "2-12 BOSS", 5],
    ["20-1", "20-1", 208],
    ["40-1", "40-1", 554],
    ["48-36 BOSS", "48-36 BOSS", 712],
    ["50-36 BOSS", "50-36 BOSS", 747],
  ];
  for (const [n, h, correct] of cmp) {
    const nId = idOf(n), hId = idOf(h);
    const wrong = r61Formula(nId, hId);
    ok(wrong > correct, "R61 公式偏高留痕 " + n + "：R61 " + wrong + " / 正确 " + correct);
    eq(O.computeBaseLevel(n, h), correct, "现行公式 = 两站口径 " + n);
    eq(siteFormula(nId, hId), correct, "siteFormula 与实现一致 " + n);
  }

  /* ---------- ⑥ 收益表在两服上限处都有值 ---------- */
  await O.loadIncomeTable();
  const i747 = O.incomeForLevel(747, true);
  const i433 = O.incomeForLevel(433, true);
  ok(!!i747 && i747.credit > 0, "两服上限 Lv747 收益存在");
  ok(!!i433 && i433.credit > 0, "Lv433 收益存在（国服实际可达区间）");
  ok(i747.credit > i433.credit, "Lv747 收益高于 Lv433（表格单调）");

  /* ---------- ⑦ 分服收益补正系数（R63b） ---------- */
  eq(SV.incomeScaleOf("intl"), 1, "intl income_scale = 1");
  eq(SV.incomeScaleOf("cn"), 1, "cn income_scale = 1（无实测差异，不编系数）");

  useServer("intl");
  const base518 = O.incomeForLevel(518, true);
  useServer("cn");
  const cn518 = O.incomeForLevel(518, true);
  eq(JSON.stringify(cn518), JSON.stringify(base518), "两服 Lv518 收益逐位相同");

  /* 机制自检：把系数改成 0.5，收益必须正好减半 —— 证明开关真的接在查表路径上 */
  O.setServer({ key: "cn", maxChapter: 48, cap: 715, incomeScale: 0.5 });
  const half = O.incomeForLevel(518, true);
  ok(Math.abs(half.credit - base518.credit / 2) < 1e-6, "scale=0.5 → 信用点减半", half.credit + " vs " + base518.credit / 2);
  ok(Math.abs(half.core_dust - base518.core_dust / 2) < 1e-9, "scale=0.5 → 红球减半");
  ok(Math.abs(half.battle_data - base518.battle_data / 2) < 1e-6, "scale=0.5 → 战斗数据减半");

  /* 非法系数必须回落到 1（0 会把收益整体乘成 0，是灾难性的） */
  O.setServer({ key: "cn", maxChapter: 48, cap: 715, incomeScale: 0 });
  eq(O.incomeForLevel(518, true).credit, base518.credit, "scale=0 视为无效 → 回落 1");
  O.setServer({ key: "cn", maxChapter: 48, cap: 715, incomeScale: -3 });
  eq(O.incomeForLevel(518, true).credit, base518.credit, "scale=-3 视为无效 → 回落 1");
  O.setServer({ key: "cn", maxChapter: 48, cap: 715 });   // 不传 → 也是 1
  eq(O.incomeForLevel(518, true).credit, base518.credit, "不传 incomeScale → 回落 1");
  useServer("cn");                                        // 恢复
  eq(SV.incomeScale(), 1, "恢复后系数回到 1");

  /* ---------- ⑥ 推图收益数据与新上限对齐（R68：主线 49/50 章） ---------- */
  {
    const scr = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/stage_clear_resources.json"), "utf8"));
    const keys = Object.keys(scr.chapters);
    const maxCh = Math.max.apply(null, keys.map(Number));

    eq(keys.length, 51, "推图收益覆盖 51 个章节键（0~50）");
    eq(maxCh, Number(SV.get("intl").max_chapter), "推图收益末键 == 服务器进度上限章号");

    /* 键 = 官方 ChapterId − 1：逐键自洽，防止以后插错位 */
    let misaligned = 0;
    keys.forEach(function (k) {
      if (Number(scr.chapters[k].official_chapter) !== Number(k) + 1) misaligned++;
    });
    eq(misaligned, 0, "全部章节键满足 official_chapter == 键 + 1");

    /* fallback 必须指向末章，否则缺章时会带出一个已经落后的旧章 */
    eq(String(scr.fallback_chapter), String(maxCh), "fallback_chapter 指向末章");

    /* 新章数值（官方 50/51 章，44 普通 + 44 困难） */
    const c49 = scr.chapters["49"], c50 = scr.chapters["50"];
    ok(!!c49 && !!c50, "存在 49 / 50 两个新章");
    if (c49 && c50) {
      eq(c49.official_chapter, 50, "键 49 = 官方第 50 章");
      eq(c50.official_chapter, 51, "键 50 = 官方第 51 章");
      eq(c49.n_normal, 44, "键 49 普通关卡数");
      eq(c49.n_hard, 44, "键 49 困难关卡数");
      eq(c50.n_normal, 44, "键 50 普通关卡数");
      eq(c50.n_hard, 44, "键 50 困难关卡数");
      /* 收益必须逐章递增，否则说明爬到了重复或错误的 reward 行 */
      const c48 = scr.chapters["48"];
      ok(c49.credit > c48.credit && c50.credit > c49.credit, "普通信用点逐章递增");
      ok(c49.battle > c48.battle && c50.battle > c49.battle, "普通战斗数据逐章递增");
      ok(c49.credit_hard > c48.credit_hard && c50.credit_hard > c49.credit_hard, "困难信用点逐章递增");
      ok(c49.battle_hard > c48.battle_hard && c50.battle_hard > c49.battle_hard, "困难战斗数据逐章递增");
    }

    /* 关卡表末章必须与推图收益末章一致 —— 两处数据源同源，不能各说各话 */
    const sm = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/stage_map.json"), "utf8")).stages;
    const lastCh = Math.max.apply(null, sm.map(function (s) { return Number(String(s.chapter).replace(/\D/g, "")); }));
    eq(lastCh, maxCh, "stage_map 末章 == 推图收益末键");
    eq(sm.length, Number(SV.get("intl").normal_stages), "stage_map 关卡总数 == normal_stages");
  }

  /* ---------- 汇总 ---------- */
  console.log("\n=== test_server_split ===");
  console.log("通过 " + pass + " 项，失败 " + fail + " 项");
  if (fail) {
    console.log("\n失败明细：");
    failures.forEach((f, i) => console.log("  " + (i + 1) + ") " + f));
    process.exit(1);
  }
  console.log("全部通过");
})().catch((e) => {
  console.error("测试异常：", e);
  process.exit(1);
});
