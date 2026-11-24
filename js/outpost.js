/* outpost.js — 关卡进度 → 基地等级换算 + 基地收益表查询（自 Python calculator/outpost_level 移植） */
(function (global) {
  "use strict";

  var STAGE_MAP = null;
  var INCOME_TABLE = null;

  function loadStageMap() {
    if (STAGE_MAP) return Promise.resolve(STAGE_MAP);
    return fetch("data/stage_map.json").then(function (r) { return r.json(); }).then(function (d) {
      /* 兜底值必须是「下拉起点 1 + 基地起点 19」两套字段，
         20-11-13 的回归就是兜底写成 normal_start_id:19 后才被当成基地起点用。 */
      STAGE_MAP = d || { stages: [], normal_start_id: 1, hard_start_id: 1, base_start_normal_id: 19, base_start_hard_id: 1 };
      return STAGE_MAP;
    });
  }

  function loadIncomeTable() {
    if (INCOME_TABLE) return Promise.resolve(INCOME_TABLE);
    return fetch("data/outpost_income.json").then(function (r) { return r.json(); }).then(function (d) {
      INCOME_TABLE = (d && d.by_level) || {};
      return INCOME_TABLE;
    });
  }

  function stageId(section) {
    if (!section) return null;
    var key = String(section).trim().toUpperCase();
    for (var i = 0; i < "NH".length; i++) {
      var p = "NH"[i];
      if (key.indexOf(p) === 0 && key.length > 1) { key = key.slice(1); break; }
    }
    var stages = (STAGE_MAP && STAGE_MAP.stages) || [];
    for (var j = 0; j < stages.length; j++) {
      if (String(stages[j].section).toUpperCase() === key) return stages[j].id;
    }
    return null;
  }

  /* 关卡进度明细（R107）：progressOf 是唯一实现，computeBaseLevel 只取 level。
     参考站实地抓包对照（2026-11-24）：
       nikkeoutpost : total = max(0, N-19) + max(0, H-1+1) + 1        → floor(total/5)+1
       NikkeCalc    : total = max(0, N-19) + max(0, H-1+1) + 修正(默认3)
     两站只差一个可调「国服等级修正」（NikkeCalc 默认 3 关），加数口径完全相同。
     我们默认修正 0：国服拆包表 0~32 章与国际服逐章 0 差异，没有依据默认非 0；
     需要时由界面「进度修正」传入（同口径的同一个加数）。correction 省略 = 0。 */
  function progressOf(normalStage, hardStage, correction) {
    if (!STAGE_MAP) return null;
    /* 基地计数起点 ≠ 关卡下拉起点（R64 定案）：
       normal_start_id / hard_start_id 是**关卡列表**起点（都是 0-1，= 1）；
       前哨基地 2-12 才解锁，基地计数必须用 base_start_normal_id（= 19）单独取值。
       混用会把 Chapter 0~1 从普通关卡下拉里剔掉，或让基地等级整整高 3~4 级。 */
    var normalStart = Number(STAGE_MAP.base_start_normal_id) || 19;
    var hardStart = Number(STAGE_MAP.base_start_hard_id) || 1;
    var nId = normalStage ? stageId(normalStage) : null;
    var hId = hardStage ? stageId(hardStage) : null;
    if (nId === null && hId === null) return null;
    var fix = Math.round(Number(correction) || 0);
    if (fix > 20) fix = 20;
    if (fix < -20) fix = -20;
    var a = Math.max(0, (nId || 0) - normalStart);
    var o = Math.max(0, (hId || 0) - hardStart + 1);
    /* 至少 1 关：2-12 是前哨基地解锁的硬起点，负修不能把进度压到 0 关 */
    var total = Math.max(1, a + o + 1 + fix);
    return {
      total: total,                       // 已计入基地进度的总关数
      level: Math.floor(total / 5) + 1,   // 推算基地等级
      inLevel: total % 5,                 // 本级已积累关数（0~4）
      normal: a, hard: o, fix: fix,
    };
  }

  function computeBaseLevel(normalStage, hardStage, correction) {
    var p = progressOf(normalStage, hardStage, correction);
    return p ? p.level : null;
  }

  function incomeForLevel(baseLevel, tacticsFull) {
    if (!INCOME_TABLE) return null;
    var row = INCOME_TABLE[String(baseLevel)] || INCOME_TABLE[baseLevel];
    if (!row) return null;
    var s = tacticsFull === false ? "" : "_mul";
    return {
      credit: Number(row["credit" + s] || 0.0),
      battle_data: Number(row["battle_data" + s] || 0.0),
      core_dust: Number(row["core_dust" + s] || 0.0),
    };
  }

  /* 关卡集合：all stages (normal/hard mode)，章节列表 */
  function allStages(mode) {
    var stages = (STAGE_MAP && STAGE_MAP.stages) || [];
    var startId = mode === "normal" ? (Number(STAGE_MAP.normal_start_id) || 1) : (Number(STAGE_MAP.hard_start_id) || 1);
    return stages.filter(function (s) { return s.id >= startId; });
  }

  function chapters(mode) {
    var seen = {};
    allStages(mode).forEach(function (s) { seen[s.chapter] = true; });
    return Object.keys(seen).sort(function (a, b) {
      return parseInt(a.split(" ").pop(), 10) - parseInt(b.split(" ").pop(), 10);
    });
  }

  function stagesInChapter(chapter, mode) {
    return allStages(mode).filter(function (s) { return s.chapter === chapter; }).map(function (s) { return s.section; });
  }

  /* 只读访问器：供 test_server_split 校验「下拉起点 / 基地计数起点」两套基准与关卡总数 */
  function stageMap() { return STAGE_MAP; }
  function stageCount(mode) { return allStages(mode).length; }

  function chapterOf(section) {
    var stages = (STAGE_MAP && STAGE_MAP.stages) || [];
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].section === section) return stages[i].chapter;
    }
    return null;
  }

  global.NikkeOutpost = {
    loadStageMap: loadStageMap,
    loadIncomeTable: loadIncomeTable,
    stageId: stageId,
    progressOf: progressOf,
    computeBaseLevel: computeBaseLevel,
    incomeForLevel: incomeForLevel,
    allStages: allStages,
    chapters: chapters,
    stagesInChapter: stagesInChapter,
    chapterOf: chapterOf,
    stageMap: stageMap,
    stageCount: stageCount,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeOutpost;
})(typeof window !== "undefined" ? window : globalThis);
