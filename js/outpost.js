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

  function computeBaseLevel(normalStage, hardStage) {
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
    var a = Math.max(0, (nId || 0) - normalStart);
    var o = Math.max(0, (hId || 0) - hardStart + 1);
    var n = a + o + 1;
    return Math.floor(n / 5) + 1;
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
