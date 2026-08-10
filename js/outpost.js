/* outpost.js — 关卡进度 → 基地等级换算 + 基地收益表查询（自 Python calculator/outpost_level 移植） */
(function (global) {
  "use strict";

  var STAGE_MAP = null;
  var INCOME_TABLE = null;

  function loadStageMap() {
    if (STAGE_MAP) return Promise.resolve(STAGE_MAP);
    return fetch("data/stage_map.json").then(function (r) { return r.json(); }).then(function (d) {
      STAGE_MAP = d || { stages: [], normal_start_id: 19, hard_start_id: 1 };
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
    var normalStart = STAGE_MAP.normal_start_id || 19;
    var hardStart = STAGE_MAP.hard_start_id || 1;
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
    var startId = mode === "normal" ? (STAGE_MAP.normal_start_id || 19) : (STAGE_MAP.hard_start_id || 1);
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
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeOutpost;
})(typeof window !== "undefined" ? window : globalThis);
