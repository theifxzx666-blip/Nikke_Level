/* outpost.js — 关卡进度 → 基地等级换算 + 基地收益表查询（自 Python calculator/outpost_level 移植）
 *
 * ---------- 基地等级公式：以两个社区权威站为准（R64, 2026-10-26 定稿） ----------
 *   普通 id e、困难 id t；d = 2-12 BOSS 的 id(=19)、p = 0-1 的 id(=1)、常量 P=1：
 *     total = max(0, e - d) + max(0, t - p + 1) + P
 *     base  = floor(total / 5) + 1
 *
 * 已核对的依据（两站独立实现，算法完全一致；收益表 800 级逐级 0 差异）：
 *   国际服  https://nikkeoutpost.netlify.app/
 *   国服    https://zbxzbx98.github.io/NikkeCalc/
 *
 * 关键点：前哨基地在主线 **2-12** 通关后才解锁 —— 普通 0-1~2-11 共 18 关不计入
 * 基地等级（故普通侧减 19），困难侧从第一关起就计入（t-1+1 = t）。
 * 满进度 48-36 BOSS 双侧 → total 3556 → **Lv712**。
 *
 * 沿革（勿再"修正"回原样）：R61 曾据拆包 OutpostBattleTable.Main_stage_clear_count
 * 把公式改成 total = e + t（不减 19），等于把解锁前的 18 关算了进去 → 全站恒定偏高
 * 3 级（早期偏高 4 级）、满级误作 715。R64 按上述两站改回并加入回归测试锁定。
 */
(function (global) {
  "use strict";

  var STAGE_MAP = null;
  var INCOME_TABLE = null;

  /* 当前生效的服务器档案（由 NikkeServers / 调用方通过 setServer 注入）。
     maxChapter = 关卡进度上限章号（R63 起两服共用国际服表，均为 48）；cap = 基地等级理论上限。 */
  var SERVER = { key: "intl", maxChapter: 48, cap: 712, incomeScale: 1 };

  function loadStageMap() {
    if (STAGE_MAP) return Promise.resolve(STAGE_MAP);
    return fetch("data/stage_map.json?v=20261026b").then(function (r) { return r.json(); }).then(function (d) {
      STAGE_MAP = d || {
        stages: [], normal_start_id: 1, hard_start_id: 1,
        base_start_normal_id: 19, base_start_hard_id: 1
      };
      return STAGE_MAP;
    });
  }

  function loadIncomeTable() {
    if (INCOME_TABLE) return Promise.resolve(INCOME_TABLE);
    /* R62：加版本参数 —— 这是唯一一张没带 ?v= 的数据表，导致数据更新后
       浏览器/Pages 一直用旧缓存（红球收益重建后玩家看到的还是旧值）。 */
    return fetch("data/outpost_income.json?v=20261026a").then(function (r) { return r.json(); }).then(function (d) {
      INCOME_TABLE = (d && d.by_level) || {};
      return INCOME_TABLE;
    });
  }

  function setServer(cfg) {
    var c = cfg || {};
    var sc = (typeof c.incomeScale === "number" && isFinite(c.incomeScale) && c.incomeScale > 0)
      ? c.incomeScale : 1;
    SERVER = {
      key: c.key || "intl",
      maxChapter: (typeof c.maxChapter === "number") ? c.maxChapter : 48,
      cap: (typeof c.cap === "number" && c.cap > 0) ? c.cap : null,
      /* R63b：分服收益补正系数。1 = 与该服官方表原值一致（当前两服都是 1）。
         用途：若将来实测出某服基地收益与国际服表有系统性偏差，只改 data/servers.json
         里那个服的 income_scale，不必动关卡表、不必动公式、不必动 outpost_income.json。 */
      incomeScale: sc,
    };
    return SERVER;
  }
  function server() { return SERVER; }

  function chapterNumOf(ch) {
    var n = parseInt(String(ch || "").split(" ").pop(), 10);
    return isNaN(n) ? -1 : n;
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

  /* R64（2026-10-26）：口径对齐两个社区权威站，二者实现完全一致
   *   国际服 https://nikkeoutpost.netlify.app/       （源码 m = max(0,e-d) + max(0,o-p+1) + 1）
   *   国服   https://zbxzbx98.github.io/NikkeCalc/   （源码 m = Math.max(0,a-d)+Math.max(0,o-p+1)+t.value）
   *
   *   普通 id e、困难 id t；d = 2-12 BOSS 的 id(=19)、p = 0-1 的 id(=1)、常量 P=1：
   *     total = max(0, e - 19) + max(0, t - 1 + 1) + 1
   *     base  = floor(total / 5) + 1
   *
   * 为什么普通侧要减 19：前哨基地在主线 2-12 通关后才解锁，普通 0-1~2-11 这 18 关
   * **不计入**基地等级；困难侧则是从第一关(0-1)就开始计入，故为 t-1+1 = t。
   *
   * R61 曾把这里改成 total = e + t（不减 19），依据是拆包 OutpostBattleTable 的
   * Main_stage_clear_count（Lv1 填 0、Lv2~800 恒填 5）。那张表本身没错，错在把
   * "累计通关数"当成了普通侧的**原始 id**，于是把解锁前的 18 关也算进来 →
   * 全站基地等级**恒定偏高 3 级**（早期进度偏高 4 级），满级被误算成 715（实为 712）。
   * R64 已按两站实现改回。
   *
   * 已知核对结果（R64）：满进度 48-36 BOSS 双侧 → total 3556 → Lv712；
   * 收益表 data/outpost_income.json 与两站 outpost.json 逐级 800 级 0 差异。 */
  function computeBaseLevel(normalStage, hardStage, cap) {
    if (!STAGE_MAP) return null;
    var nId = normalStage ? stageId(normalStage) : null;
    var hId = hardStage ? stageId(hardStage) : null;
    if (nId === null && hId === null) return null;
    /* 基准取自 stage_map 的 **base_start_*_** 字段（基地计数起点），
       与 normal_start_id / hard_start_id（关卡下拉列表起点，都是 0-1）**不是同一个概念**，
       切勿再混用：混用会把 Chapter 0~1 从关卡下拉里剔掉（R64 踩过）。 */
    var sn = Number(STAGE_MAP.base_start_normal_id) || 19;
    var sh = Number(STAGE_MAP.base_start_hard_id) || 1;
    var nCnt = Math.max(0, (nId || 0) - sn);        // 普通：2-12 之后的关数
    var hCnt = Math.max(0, (hId || 0) - sh + 1);    // 困难：含 0-1 本身
    var total = nCnt + hCnt + 1;                    // +1 补偿 2-12 本身是第 1 关
    var lv = Math.floor(total / 5) + 1;
    var c = (typeof cap === "number") ? cap : SERVER.cap;
    return (c && lv > c) ? c : lv;
  }

  function incomeForLevel(baseLevel, tacticsFull) {
    if (!INCOME_TABLE) return null;
    var row = INCOME_TABLE[String(baseLevel)] || INCOME_TABLE[baseLevel];
    if (!row) return null;
    var s = tacticsFull === false ? "" : "_mul";
    var out = {
      credit: Number(row["credit" + s] || 0.0),
      battle_data: Number(row["battle_data" + s] || 0.0),
      core_dust: Number(row["core_dust" + s] || 0.0),
    };
    /* 分服收益补正（R63b）。scale === 1 时直接返回原值，不做任何浮点运算，
       保证与补正引入前的数值**逐位相同**（x*1.0 虽然精确，但没必要跑一遍）。 */
    var sc = SERVER.incomeScale;
    if (sc !== 1) {
      out.credit = out.credit * sc;
      out.battle_data = out.battle_data * sc;
      out.core_dust = out.core_dust * sc;
    }
    return out;
  }

  /* 关卡集合：普通/困难都从 0-1 起（官方两份难度各自 1,787 关），
     再按当前服务器章号上限截断。R63 起两服上限同为 Chapter 48，实际不截断任何关。 */
  function allStages(mode) {
    var stages = (STAGE_MAP && STAGE_MAP.stages) || [];
    var startId = mode === "normal" ? (STAGE_MAP.normal_start_id || 1) : (STAGE_MAP.hard_start_id || 1);
    var maxCh = SERVER.maxChapter;
    return stages.filter(function (s) {
      if (s.id < startId) return false;
      return maxCh == null || chapterNumOf(s.chapter) <= maxCh;
    });
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

  /* 关卡总数（用于推导基地上限：floor(total/5)+1） */
  function stageCount(mode) { return allStages(mode).length; }

  /* 越界关卡收敛：章节超出当前服务器上限 → 返回该服最后一关。
     用于「切服」与「读到别的服的存档」两种场景（国服存档里不该出现 Chapter 40 的关卡）。 */
  function clampSection(section, mode) {
    if (!section) return section;
    var ch = chapterOf(section);
    if (!ch) return section;
    if (chapterNumOf(ch) <= SERVER.maxChapter) return section;
    var opts = stagesInChapter("Chapter " + SERVER.maxChapter, mode || "normal");
    return opts.length ? opts[opts.length - 1] : "";
  }

  global.NikkeOutpost = {
    loadStageMap: loadStageMap,
    loadIncomeTable: loadIncomeTable,
    setServer: setServer,
    server: server,
    stageId: stageId,
    computeBaseLevel: computeBaseLevel,
    incomeForLevel: incomeForLevel,
    allStages: allStages,
    chapters: chapters,
    stagesInChapter: stagesInChapter,
    chapterOf: chapterOf,
    chapterNumOf: chapterNumOf,
    stageCount: stageCount,
    clampSection: clampSection,
    stageMap: function () { return STAGE_MAP; },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeOutpost;
})(typeof window !== "undefined" ? window : globalThis);
