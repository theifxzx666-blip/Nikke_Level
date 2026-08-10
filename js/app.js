/* app.js — NIKKE 资源规划计算器前端逻辑 */
(function () {
  "use strict";
  var C = window.NikkeCore, O = window.NikkeOutpost, S = window.NikkeScenarios;
  var LS_KEY = "nikke_planner_form_v1";
  var DEFAULT_FIXED = {
    "芯尘盒": { 24: 30, 12: 26, 8: 7, 4: 1, 2: 315, 1: 1432 },
    "信用点盒": { 24: 9, 12: 5, 8: 11, 4: 0, 2: 149, 1: 1684 },
    "战斗数据辑盒": { 24: 2, 12: 3, 8: 2, 4: 0, 2: 102, 1: 824 },
    "成长套组": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 8 },
  };
  var DEFAULT_STAGE_CLEAR = {
    stage_clear_credit: "25864", stage_clear_battle: "74096", stage_clear_dust: "630",
    stage_clear_credit2: "2615", stage_clear_battle2: "73446", stage_clear_dust2: "1630",
  };
  var BOX_DEFS = [
    { id: "ark", name: "方舟官方补给物资Ⅰ", options: [
      { label: "芯尘", rewards: { core_dust: 1 }, mode: "hours" },
      { label: "信用点", rewards: { credit: 3 }, mode: "hours" },
      { label: "战斗数据辑", rewards: { battle_data: 1 }, mode: "hours" },
    ] },
    { id: "growth", name: "30天成长补给箱", options: [
      { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
      { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
      { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" },
    ] },
    { id: "challenger", name: "挑战者成长宝箱", options: [
      { label: "战斗数据辑", rewards: { battle_data: 88458 }, mode: "units" },
      { label: "芯尘", rewards: { core_dust: 16 }, mode: "units" },
    ] },
  ];
  var COST_TIERS = [];

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? el.value : ""; }
  function setVal(id, v) { var el = $(id); if (el) el.value = v; }
  function nval(id, def) { try { return C.num(val(id), def); } catch (e) { return def; } }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return "-";
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(0) + "K";
    return v.toFixed(v % 1 ? 1 : 0);
  }
  function fmtDays(d) { return (typeof d === "number" && isFinite(d)) ? d.toFixed(1) : "-"; }
  function dateStr(d) { return d ? d.toISOString().slice(0, 10) : ""; }

  /* ---------- 状态 ---------- */
  var state = {
    form: null,               // localStorage 表单值
    normalManual: false,      // 用户手动改过困难（当前）
    futureNormalManual: false,
    futureHardManual: false,
    normalChapters: [], hardChapters: [],
    normalStages: {}, hardStages: {},   // chapter -> [section]
    futureNormalStages: {}, futureHardStages: {},
    lastResult: null, lastSnapshot: null,
    stageClearEntries: {},
  };

  /* ---------- 表单值读写 ---------- */
  function defaultForm() {
    var today = dateStr(new Date());
    return {
      recorded: today, current: "474", target: "481", alternate: "501",
      normal_stage: "", hard_stage: "", base: "483", tactics: "是",
      credit_rate: "57240/h", battle_rate: "570180/h", dust_rate: "88/h",
      wipeouts: "3", wipeout_hours: "2", completed: "3", daily_full: "是", reset_time: "04:00", extra_daily: "",
      future_open: "2026-08-31", future_normal_stage: "", future_hard_stage: "", future_base: "500",
      future_credit: "58530/h", future_battle: "584950/h", future_dust: "90.02/h",
      bare_credit: "25169K", bare_battle: "274M", bare_dust: "12181",
      stage_clear_mode: "只计普通", stage_clear_credit: "25864", stage_clear_battle: "74096", stage_clear_dust: "630",
      stage_clear_credit2: "2615", stage_clear_battle2: "73446", stage_clear_dust2: "1630",
      cost_credit: "", cost_battle: "", cost_dust: "",
      range_start: "", range_end: "", range_credit: "", range_battle: "", range_dust: "",
      fixed: JSON.parse(JSON.stringify(DEFAULT_FIXED)),
      ark: "870", growth: "27", challenger: "340",
    };
  }

  function loadForm() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var f = JSON.parse(raw);
        state.form = Object.assign(defaultForm(), f);
        // fixed 兼容旧结构
        Object.keys(DEFAULT_FIXED).forEach(function (k) {
          if (!state.form.fixed[k]) state.form.fixed[k] = JSON.parse(JSON.stringify(DEFAULT_FIXED[k]));
        });
        return;
      }
    } catch (e) { /* ignore */ }
    state.form = defaultForm();
  }

  function collectForm() {
    var f = state.form;
    f.recorded = val("f_recorded"); f.current = val("f_current"); f.target = val("f_target"); f.alternate = val("f_alternate");
    f.normal_stage = val("f_normal_stage"); f.hard_stage = val("f_hard_stage"); f.base = val("f_base"); f.tactics = val("f_tactics");
    f.credit_rate = val("f_credit_rate"); f.battle_rate = val("f_battle_rate"); f.dust_rate = val("f_dust_rate");
    f.wipeouts = val("f_wipeouts"); f.wipeout_hours = val("f_wipeout_hours"); f.completed = val("f_completed");
    f.daily_full = val("f_daily_full"); f.reset_time = val("f_reset_time"); f.extra_daily = val("f_extra_daily");
    f.future_open = val("f_future_open"); f.future_normal_stage = val("f_future_normal_stage"); f.future_hard_stage = val("f_future_hard_stage");
    f.future_base = val("f_future_base"); f.future_credit = val("f_future_credit"); f.future_battle = val("f_future_battle"); f.future_dust = val("f_future_dust");
    f.bare_credit = val("f_bare_credit"); f.bare_battle = val("f_bare_battle"); f.bare_dust = val("f_bare_dust");
    f.stage_clear_mode = val("f_stage_mode"); f.stage_clear_credit = val("f_stage_credit"); f.stage_clear_battle = val("f_stage_battle"); f.stage_clear_dust = val("f_stage_dust");
    f.stage_clear_credit2 = val("f_stage_credit2"); f.stage_clear_battle2 = val("f_stage_battle2"); f.stage_clear_dust2 = val("f_stage_dust2");
    f.cost_credit = val("f_cost_credit"); f.cost_battle = val("f_cost_battle"); f.cost_dust = val("f_cost_dust");
    f.range_start = val("f_range_start"); f.range_end = val("f_range_end"); f.range_credit = val("f_range_credit"); f.range_battle = val("f_range_battle"); f.range_dust = val("f_range_dust");
    f.ark = val("f_ark"); f.growth = val("f_growth"); f.challenger = val("f_challenger");
    f.fixed = {};
    document.querySelectorAll(".fixed").forEach(function (inp) {
      var label = inp.dataset.label, h = inp.dataset.h;
      if (!f.fixed[label]) f.fixed[label] = {};
      f.fixed[label][h] = parseInt(inp.value || "0", 10);
    });
    return f;
  }

  function saveForm() {
    collectForm();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.form)); } catch (e) {}
  }

  function tip(msg) { var t = $("saveTip"); t.textContent = msg; setTimeout(function () { t.textContent = ""; }, 2500); }

  /* ---------- 渲染表单 ---------- */
  function fillSelect(sel, options, selected) {
    sel.innerHTML = "";
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt; o.textContent = opt;
      if (opt === selected) o.selected = true;
      sel.appendChild(o);
    });
  }

  function renderForm() {
    var f = state.form;
    setVal("f_recorded", f.recorded); setVal("f_current", f.current); setVal("f_target", f.target); setVal("f_alternate", f.alternate);
    setVal("f_base", f.base); setVal("f_tactics", f.tactics);
    setVal("f_credit_rate", f.credit_rate); setVal("f_battle_rate", f.battle_rate); setVal("f_dust_rate", f.dust_rate);
    setVal("f_wipeouts", f.wipeouts); setVal("f_wipeout_hours", f.wipeout_hours); setVal("f_completed", f.completed);
    setVal("f_daily_full", f.daily_full); setVal("f_reset_time", f.reset_time); setVal("f_extra_daily", f.extra_daily);
    setVal("f_future_open", f.future_open); setVal("f_future_base", f.future_base);
    setVal("f_future_credit", f.future_credit); setVal("f_future_battle", f.future_battle); setVal("f_future_dust", f.future_dust);
    setVal("f_bare_credit", f.bare_credit); setVal("f_bare_battle", f.bare_battle); setVal("f_bare_dust", f.bare_dust);
    setVal("f_stage_mode", f.stage_clear_mode); setVal("f_stage_credit", f.stage_clear_credit); setVal("f_stage_battle", f.stage_clear_battle); setVal("f_stage_dust", f.stage_clear_dust);
    setVal("f_stage_credit2", f.stage_clear_credit2); setVal("f_stage_battle2", f.stage_clear_battle2); setVal("f_stage_dust2", f.stage_clear_dust2);
    setVal("f_cost_credit", f.cost_credit); setVal("f_cost_battle", f.cost_battle); setVal("f_cost_dust", f.cost_dust);
    setVal("f_range_start", f.range_start); setVal("f_range_end", f.range_end); setVal("f_range_credit", f.range_credit); setVal("f_range_battle", f.range_battle); setVal("f_range_dust", f.range_dust);
    setVal("f_ark", f.ark); setVal("f_growth", f.growth); setVal("f_challenger", f.challenger);
    document.querySelectorAll(".fixed").forEach(function (inp) {
      var label = inp.dataset.label, h = inp.dataset.h;
      inp.value = (f.fixed[label] && f.fixed[label][h] !== undefined) ? f.fixed[label][h] : 0;
    });
    // 章节/关卡下拉
    fillSelect($("f_normal_chapter"), state.normalChapters, chapterOfSection(f.normal_stage) || state.normalChapters[state.normalChapters.length - 1]);
    fillSelect($("f_hard_chapter"), state.hardChapters, chapterOfSection(f.hard_stage) || state.hardChapters[state.hardChapters.length - 1]);
    fillSelect($("f_future_normal_chapter"), state.normalChapters, chapterOfSection(f.future_normal_stage) || state.normalChapters[state.normalChapters.length - 1]);
    fillSelect($("f_future_hard_chapter"), state.hardChapters, chapterOfSection(f.future_hard_stage) || state.hardChapters[state.hardChapters.length - 1]);
    syncStageOptions("normal"); syncStageOptions("hard");
    syncStageOptions("future_normal"); syncStageOptions("future_hard");
    updateStageClearUI();
  }

  function chapterOfSection(section) {
    if (!section) return null;
    return O.chapterOf(section);
  }
  function chapterNum(ch) { var n = parseInt(String(ch || "").split(" ").pop(), 10); return isNaN(n) ? 0 : n; }
  function targetChapter(baseNum, chaptersArr) {
    var target = "Chapter " + baseNum;
    return chaptersArr.indexOf(target) >= 0 ? target : chaptersArr[chaptersArr.length - 1];
  }

  function syncStageOptions(kind) {
    var isFuture = kind.indexOf("future") === 0;
    var chSel = $(isFuture ? "f_future_" + kind.slice(7) + "_chapter" : "f_" + kind + "_chapter");
    var stSel = $(isFuture ? "f_future_" + kind.slice(7) + "_stage" : "f_" + kind + "_stage");
    var mode = kind.indexOf("hard") >= 0 ? "hard" : "normal";
    var map = isFuture ? (mode === "hard" ? state.futureHardStages : state.futureNormalStages) : (mode === "hard" ? state.hardStages : state.normalStages);
    var opts = map[chSel.value] || [];
    // 回填已保存的关卡值（修复刷新后关卡下拉重置）：优先当前下拉值，其次已保存值
    var saved = state.form[kind === "normal" ? "normal_stage" : kind === "hard" ? "hard_stage" : kind === "future_normal" ? "future_normal_stage" : "future_hard_stage"];
    var cur = stSel.value;
    var selected = (cur && cur !== "") ? cur : (saved && opts.indexOf(saved) >= 0 ? saved : "未选择");
    fillSelect(stSel, ["未选择"].concat(opts), selected);
  }

  /* ---------- 联动 ---------- */
  function syncCurrentBase() {
    var f = collectForm();
    var level = O.computeBaseLevel(f.normal_stage || null, f.hard_stage || null);
    var hint = $("baseHint");
    if (level) {
      setVal("f_base", level);
      hint.textContent = "按进度推算基地等级：lv." + level + "（已自动同步，可手动修改）";
      var income = O.incomeForLevel(level, f.tactics !== "否");
      if (income) {
        setVal("f_credit_rate", Math.round(income.credit) + "/h");
        setVal("f_battle_rate", Math.round(income.battle_data) + "/h");
        setVal("f_dust_rate", income.core_dust.toFixed(2) + "/h");
      }
    } else {
      hint.textContent = "未选择关卡进度时，将使用手填基地等级与手动收益。";
    }
  }

  function enforceHardCap() {
    var normalCh = val("f_normal_chapter"), hardCh = val("f_hard_chapter");
    if (!normalCh || !hardCh) return;
    if (chapterNum(hardCh) > chapterNum(normalCh)) {
      setVal("f_hard_chapter", normalCh);
      syncStageOptions("hard");
      setVal("f_hard_stage", lastStage("hard", normalCh));
    }
  }
  function lastStage(mode, chapter) {
    var map = mode === "hard" ? state.hardStages : state.normalStages;
    var opts = map[chapter] || [];
    return opts.length ? opts[opts.length - 1] : "";
  }

  function syncFutureNormal() {
    if (state.futureNormalManual) return;
    var n = chapterNum(val("f_normal_chapter"));
    if (!n) return;
    var target = targetChapter(n + 2, state.normalChapters);
    setVal("f_future_normal_chapter", target);
    syncStageOptions("future_normal");
    setVal("f_future_normal_stage", lastStage("normal", target));
    syncFutureBase();
  }

  function syncFutureHard() {
    if (state.futureHardManual) return;
    var h = chapterNum(val("f_hard_chapter"));
    if (!h) return;
    var target = targetChapter(h + 2, state.hardChapters);
    setVal("f_future_hard_chapter", target);
    syncStageOptions("future_hard");
    setVal("f_future_hard_stage", lastStage("hard", target));
    syncFutureBase();
  }

  function syncFutureBase() {
    var f = collectForm();
    var level = O.computeBaseLevel(f.future_normal_stage || null, f.future_hard_stage || null);
    if (level) {
      setVal("f_future_base", level);
      var income = O.incomeForLevel(level, f.tactics !== "否");
      if (income) {
        setVal("f_future_credit", Math.round(income.credit) + "/h");
        setVal("f_future_battle", Math.round(income.battle_data) + "/h");
        setVal("f_future_dust", income.core_dust.toFixed(2) + "/h");
      }
    }
    syncStageClearFromFuture();
  }

  function syncStageClearFromFuture() {
    var n = chapterNum(val("f_future_normal_chapter"));
    if (!n) return;
    $("stageClearTitle").textContent = "推图资源（" + (n - 1) + "-" + n + " 章一次性）";
    var entry = state.stageClearEntries[String(n)] || state.stageClearEntries["38"] || {};
    var map = {
      f_stage_credit: entry.credit, f_stage_battle: entry.battle, f_stage_dust: entry.dust,
      f_stage_credit2: entry.credit_hard, f_stage_battle2: entry.battle_hard, f_stage_dust2: entry.dust_hard,
    };
    Object.keys(map).forEach(function (id) {
      if (map[id] === undefined || map[id] === null) return;
      var cur = val(id);
      if (cur === "" || cur === undefined || DEFAULT_STAGE_CLEAR[id.replace("f_stage_", "stage_clear_")] === cur) {
        setVal(id, String(map[id]));
      }
    });
  }

  function updateStageClearUI() {
    $("stageHardRow").style.display = val("f_stage_mode") === "普通+困难" ? "" : "none";
  }

  function onFormChange() {
    collectForm();
    saveForm();
    updateProgress();
  }

  /* ---------- 构建 snapshot + 计算 ---------- */
  function buildSnapshot() {
    var f = collectForm();
    var income = { credit: C.parseRate(f.credit_rate), battle_data: C.parseRate(f.battle_rate), core_dust: C.parseRate(f.dust_rate) };
    var futureIncome = { credit: C.parseRate(f.future_credit), battle_data: C.parseRate(f.future_battle), core_dust: C.parseRate(f.future_dust) };
    var extra = { credit: 0, battle_data: 0, core_dust: 0 };
    if (f.extra_daily && f.extra_daily.trim()) {
      var parts = f.extra_daily.split(/[,，]/);
      if (parts[0]) extra.credit = C.num(parts[0], 0);
      if (parts[1]) extra.battle_data = C.num(parts[1], 0);
      if (parts[2]) extra.core_dust = C.num(parts[2], 0);
    }
    var stage = { credit: 0, battle_data: 0, core_dust: 0 };
    if (f.stage_clear_mode !== "不计算") {
      stage.credit = C.num(f.stage_clear_credit, 0);
      stage.battle_data = C.num(f.stage_clear_battle, 0);
      stage.core_dust = C.num(f.stage_clear_dust, 0);
      if (f.stage_clear_mode === "普通+困难") {
        stage.credit += C.num(f.stage_clear_credit2, 0);
        stage.battle_data += C.num(f.stage_clear_battle2, 0);
        stage.core_dust += C.num(f.stage_clear_dust2, 0);
      }
    }
    // 升级消耗：手动填了某项则覆盖该项，未填的项回退到阶梯表对应档位（避免未填项成本为 0 导致升级虚高）
    function tierValue(tiers, level) {
      if (!tiers || !tiers.length) return null;
      var chosen = tiers[0];
      for (var i = 0; i < tiers.length; i++) {
        if (tiers[i].level <= level) chosen = tiers[i];
        else break;
      }
      return { credit: chosen.credit * 1000, battle_data: chosen.battle_data * 1000, core_dust: Number(chosen.core_dust) };
    }
    var perLevel = { credit: 0, battle_data: 0, core_dust: 0 };
    var hasManual = f.cost_credit || f.cost_battle || f.cost_dust;
    if (hasManual) {
      var t = tierValue(COST_TIERS, parseInt(f.current, 10) || 0);
      perLevel.credit = f.cost_credit ? C.num(f.cost_credit, 0) : (t ? t.credit : 0);
      perLevel.battle_data = f.cost_battle ? C.num(f.cost_battle, 0) : (t ? t.battle_data : 0);
      perLevel.core_dust = f.cost_dust ? C.num(f.cost_dust, 0) : (t ? t.core_dust : 0);
    }
    var rangeStart = f.range_start ? parseInt(f.range_start, 10) : null;
    var rangeEnd = f.range_end ? parseInt(f.range_end, 10) : null;
    var upgradeCost = {
      per_level: perLevel,
      range_start: rangeStart, range_end: rangeEnd,
      range_total: rangeStart && rangeEnd ? { credit: C.num(f.range_credit, 0), battle_data: C.num(f.range_battle, 0), core_dust: C.num(f.range_dust, 0) } : null,
      tiers: hasManual ? null : COST_TIERS,
    };
    var fixed = {};
    Object.keys(DEFAULT_FIXED).forEach(function (label) {
      var m = f.fixed[label] || {};
      fixed[label] = {};
      [24, 12, 8, 4, 2, 1].forEach(function (h) { fixed[label][h] = parseInt(m[h] || 0, 10); });
    });
    var selectable = BOX_DEFS.map(function (def) {
      return { name: def.name, quantity: parseInt(f[def.id] || 0, 10), options: def.options };
    });
    var openDate = f.future_open ? new Date(f.future_open + "T00:00:00") : null;
    var snap = {
      recorded_at: f.recorded ? new Date(f.recorded + "T00:00:00") : new Date(),
      current_sync_level: parseInt(f.current, 10) || 474,
      target_sync_level: parseInt(f.target, 10) || 481,
      alternate_target_level: parseInt(f.alternate, 10) || 501,
      base_level: parseInt(f.base, 10) || 483,
      income_per_hour: income,
      future_base_level: parseInt(f.future_base, 10) || null,
      future_income_per_hour: futureIncome,
      main_story_open_at: openDate,
      bare_resources: { credit: C.num(f.bare_credit, 0), battle_data: C.num(f.bare_battle, 0), core_dust: C.num(f.bare_dust, 0) },
      daily_wipeout_count: parseInt(f.wipeouts, 10) || 0,
      wipeout_hours_each: parseFloat(f.wipeout_hours) || 0,
      completed_wipeouts_today: parseInt(f.completed, 10) || 0,
      daily_full: f.daily_full !== "否",
      extra_daily: extra,
      fixed_boxes: fixed,
      selectable_boxes: selectable,
      upgrade_cost: upgradeCost,
      stage_clear_resources: stage,
    };
    return snap;
  }

  /* ---------- 结果渲染 ---------- */
  function el(tag, html, cls) {
    var d = document.createElement(tag);
    if (html !== undefined) d.innerHTML = html;
    if (cls) d.className = cls;
    return d;
  }
  function table(headers, rows) {
    var t = el("table", "", "data");
    var thead = "<tr>" + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("");
    t.innerHTML = thead + body;
    return t;
  }

  function renderResult(result, snap) {
    var box = $("tabResult"); box.innerHTML = "";
    var resLabels = { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };

    // 1. 核心结论 4 卡片
    var cards = el("div", "", "cards");
    function card(num, lbl, warn) {
      var c = el("div", "<div class='num'>" + num + "</div><div class='lbl'>" + lbl + "</div>", "card" + (warn ? " warn" : ""));
      return c;
    }
    cards.appendChild(card("同步器 " + result.bare.level, "现有同步器等级"));
    cards.appendChild(card("同步器 " + result.fixed.level, "仅固定小时箱"));
    cards.appendChild(card("同步器 " + result.selectable.level, "全箱梭哈"));
    cards.appendChild(card(fmtDays(result.no_box.days) + " 天", "纯自然升级（不开箱）", true));
    box.appendChild(cards);
    box.appendChild(el("p", "① 现有同步器等级：只用现有资源（含推图资源）不开箱能达到的等级；② 仅固定小时箱：只开固定小时箱；③ 全箱梭哈：固定小时箱+自选箱全部使用；④ 纯自然升级：完全不开箱，X 天到目标 " + result.no_box.target + "。", "caption"));

    // 2. 最大等级表
    box.appendChild(el("h3", "可达到的最大等级（按资源消耗区间划分）", "sec"));
    var prRows = [];
    [["bare", "现有资源"], ["fixed", "仅固定小时箱"], ["selectable", "仅固定小时箱 + 资源自选箱"]].forEach(function (pair) {
      C.RESOURCES.forEach(function (r) {
        prRows.push([pair[1], resLabels[r], "同步器 " + result.per_resource[pair[0]][r]]);
      });
    });
    box.appendChild(table(["口径", "资源", "单资源可到"], prRows));
    box.appendChild(el("p", "每个口径下三类资源各自单独计算能升到多少级（只看单资源）；三项取最小值 = 三资源同时约束，即核心结论的等级。", "caption"));

    // 3. 开箱达成目标统计
    box.appendChild(el("h3", "开箱达成目标统计", "sec"));
    var targets = [result.no_box.target, snap.alternate_target_level];
    var okRows = [];
    var selectableUsed = (result.selectable.selectable && result.selectable.selectable.boxes_used) || 0;
    var fixedUsed = 0;
    Object.keys(snap.fixed_boxes).forEach(function (k) {
      Object.keys(snap.fixed_boxes[k]).forEach(function (h) { fixedUsed += snap.fixed_boxes[k][h]; });
    });
    var futureAvail = result.future_main_story.available;
    targets.forEach(function (tgt) {
      var nowOk = result.selectable.level >= tgt;
      okRows.push([tgt, "未开新主线", "同步器 " + result.selectable.level, nowOk ? "✅" : "❌", "0", "立即可达（今天）", "固定箱 " + fixedUsed + " + 自选箱 " + selectableUsed]);
      if (futureAvail) {
        var fLevel = result.future_main_story.result.level;
        var fOk = fLevel >= tgt;
        var fOpen = result.future_main_story.open_at.slice(0, 10);
        okRows.push([tgt, "开放新主线后", "同步器 " + fLevel, fOk ? "✅" : "❌", fOk ? "0" : "-", fOpen, "固定箱 " + fixedUsed + " + 自选箱（新收益）"]);
      } else {
        okRows.push([tgt, "开放新主线后", "-", "❌", "-", "未填写新主线预测", "-"]);
      }
    });
    box.appendChild(table(["目标", "场景", "全箱梭哈后", "是否达成", "预计天数", "预计日期", "开箱数"], okRows));
    box.appendChild(el("p", "未开新主线 = 按当前基地收益开箱（今天开箱当天完成，天数 0）；开放新主线后 = 先按当前收益自然积累到开放日，再按新基地收益开箱。", "caption"));

    // 4. 不开箱详情
    box.appendChild(el("h3", "不开箱到目标等级详情（目标 " + result.no_box.target + "）", "sec"));
    var nb = result.no_box;
    var nbRows = C.RESOURCES.map(function (r) {
      var isB = r === nb.bottleneck;
      return [resLabels[r], fmtNum(nb.required[r]), fmtNum(snap.bare_resources[r]), fmtNum(nb.shortage[r]), fmtNum(nb.daily_income[r]), fmtDays(nb.days_by_resource[r]), isB ? "✅ 瓶颈" : ""];
    });
    box.appendChild(table(["资源", "总需求", "现有余额", "缺口", "每日收益", "需要天数", "是否瓶颈"], nbRows));
    box.appendChild(el("p", "瓶颈资源：" + resLabels[nb.bottleneck] + "；预计日期：" + nb.estimated_at + "；需 " + nb.steps + " 级。", "caption"));

    // 5. 开主线前后对比
    box.appendChild(el("h3", "开主线前 vs 开主线后方案对比", "sec"));
    if (futureAvail) {
      var cmp = el("div", "", "compare");
      var c1 = el("div", "", "col");
      c1.appendChild(el("h4", "开主线前（当前基地收益）"));
      c1.appendChild(el("p", "立即全箱梭哈可到 <b>同步器 " + result.selectable.level + "</b>"));
      c1.appendChild(resourceTable(result.selectable.resources_before_selectable));
      var c2 = el("div", "", "col");
      c2.appendChild(el("h4", "开主线后（" + result.future_main_story.open_at.slice(0, 10) + " 起新基地收益）"));
      c2.appendChild(el("p", "等到开放日再全箱梭哈可到 <b>同步器 " + result.future_main_story.result.level + "</b>"));
      c2.appendChild(el("p", "等待期自然积累（当前收益 + 每日歼灭）：", "caption"));
      c2.appendChild(resourceTable(result.future_main_story.natural_before_open));
      cmp.appendChild(c1); cmp.appendChild(c2);
      box.appendChild(cmp);
      box.appendChild(el("p", "左侧 = 现在就用现有箱子按当前收益开；右侧 = 箱子留到新主线开放后按新收益开（等待期收益照常积累）。", "caption"));
    } else {
      box.appendChild(el("p", result.future_main_story.reason + "；可在「预计新主线」中填写后重新计算。"));
    }
  }

  function resourceTable(res) {
    var rows = [["信用点", fmtNum(res.credit)], ["战斗数据辑", fmtNum(res.battle_data)], ["红球", fmtNum(res.core_dust)]];
    return table(["资源", "数值"], rows);
  }

  function renderBox(result, snap) {
    var box = $("tabBox"); box.innerHTML = "";
    // 自选箱分配
    box.appendChild(el("h3", "自选箱分配方案", "sec"));
    var plan = result.selectable.selectable;
    var rows = [];
    if (plan && plan.selectable && plan.selectable.length) {
      plan.selectable.forEach(function (p) {
        var detail = Object.keys(p.choices || {}).filter(function (k) { return p.choices[k]; })
          .map(function (k) { return k + " x" + p.choices[k]; }).join("、") || "无需开启";
        var note = p.name.indexOf("挑战者") >= 0 ? "固定数值奖励，默认全部消耗（不受基地等级影响）" : "";
        rows.push([p.name, p.used, p.keep, detail, note]);
      });
    } else {
      box.appendChild(el("p", "自选箱未产生分配方案（现有资源可能已足够）。"));
    }
    if (rows.length) box.appendChild(table(["箱子", "使用", "保留", "分配明细", "备注"], rows));
    box.appendChild(el("p", "分配按目标资源缺口优化；同等级方案优先保留更多箱子。", "caption"));
    // 固定箱折算前后
    box.appendChild(el("h3", "固定小时箱折算（开主线前 vs 开主线后）", "sec"));
    var before = result.fixed.fixed || {};
    var after = result.future_main_story.available ? result.future_main_story.result.fixed || {} : null;
    var fixRows = C.RESOURCES.map(function (r) {
      var bv = before[r] || 0, av = after ? (after[r] || 0) : 0;
      return [C.RESOURCE_LABELS[r], fmtNum(bv), after ? fmtNum(av) : "-", after ? fmtNum(av - bv) : "-"];
    });
    box.appendChild(table(["资源", "开主线前折算（当前收益）", "开主线后折算（新收益）", "差值"], fixRows));
    box.appendChild(el("p", "固定小时箱按开启时的基地收益折算：开主线前用当前收益、开主线后用新基地收益。差值 = 等新主线再开箱多获得的资源。", "caption"));
  }

  function render501(result) {
    var box = $("tab501"); box.innerHTML = "";
    box.appendChild(el("h3", "到 " + result.scenario_f.target + " 的三种方案", "sec"));
    var rows = result.scenario_f.rows.map(function (r) {
      return [r.name, "同步器 " + r.level, r.date ? r.date.slice(0, 16) : "-", fmtDays(r.days), r.feasible ? "✅" : "❌", r.assumption];
    });
    box.appendChild(table(["方案", "预计等级", "达到目标日期", "天数", "可行", "说明"], rows));
    box.appendChild(el("p", result.scenario_f.recommendation, "caption"));
    box.appendChild(el("p", "① 现在立即开箱冲级：预计等级 = 开完全部箱子后实际能达到的等级，天数 0（当天开完）；② 等新主线开放后再开箱：预计等级 = 开放日开完箱子的实际等级，日期 = 开放日；③ 先升级再自然增长：完全不开箱，先升到当前能到的等级，再靠每日收益自然增长到目标。", "caption"));
  }

  function renderRaw(result) {
    $("tabRaw").innerHTML = "";
    var pre = el("pre", JSON.stringify(result, null, 2), "raw");
    $("tabRaw").appendChild(pre);
  }

  /* ---------- 计算入口 ---------- */
  function calculate() {
    try {
      var snap = buildSnapshot();
      state.lastSnapshot = snap;
      state.lastResult = S.evaluate(snap);
      $("resultSection").style.display = "";
      renderResult(state.lastResult, snap);
      renderBox(state.lastResult, snap);
      render501(state.lastResult);
      renderRaw(state.lastResult);
      saveForm();
      window.scrollTo({ top: 0, behavior: "smooth" });
      tip("计算完成");
    } catch (e) {
      alert("计算失败：" + e.message);
    }
  }

  /* ---------- 导出 ---------- */
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- XLSX 导入/导出 ---------- */
  function buildXlsxTemplate() {
    var f = collectForm();
    var aoa = [
      ["字段", "值"],
      ["数据日期", f.recorded], ["当前同步器等级", f.current], ["目标同步器等级", f.target], ["备用目标等级", f.alternate],
      ["普通主线进度", f.normal_stage], ["困难主线进度", f.hard_stage], ["基地防御等级", f.base], ["战术学院满级", f.tactics],
      ["信用点收益", f.credit_rate], ["战斗数据收益", f.battle_rate], ["红球收益", f.dust_rate],
      ["每日歼灭次数", f.wipeouts], ["每次小时数", f.wipeout_hours], ["今天已完成", f.completed],
      ["现有信用点", f.bare_credit], ["现有战斗数据", f.bare_battle], ["现有红球", f.bare_dust],
      ["推图计入范围", f.stage_clear_mode],
      ["推图信用点(普通)", f.stage_clear_credit], ["推图战斗数据(普通)", f.stage_clear_battle], ["推图红球(普通)", f.stage_clear_dust],
      ["推图信用点(困难)", f.stage_clear_credit2], ["推图战斗数据(困难)", f.stage_clear_battle2], ["推图红球(困难)", f.stage_clear_dust2],
      ["每级信用点(覆盖)", f.cost_credit], ["每级战斗数据(覆盖)", f.cost_battle], ["每级红球(覆盖)", f.cost_dust],
      ["方舟箱", f.ark], ["30天箱", f.growth], ["挑战者箱", f.challenger],
      ["预计新主线开放日", f.future_open], ["预计普通进度", f.future_normal_stage], ["预计困难进度", f.future_hard_stage], ["预计基地等级", f.future_base],
    ];
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 24 }, { wch: 20 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "账号评估");
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  function importXlsx(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var map = {};
        var range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
        for (var r = range.s.r; r <= range.e.r; r++) {
          var k = ws["A" + (r + 1)], v = ws["B" + (r + 1)];
          if (k && v) map[String(k.v).trim()] = String(v.v);
        }
        var f = collectForm();
        var FIELD = {
          "数据日期": "recorded", "当前同步器等级": "current", "目标同步器等级": "target", "备用目标等级": "alternate",
          "普通主线进度": "normal_stage", "困难主线进度": "hard_stage", "基地防御等级": "base", "战术学院满级": "tactics",
          "信用点收益": "credit_rate", "战斗数据收益": "battle_rate", "红球收益": "dust_rate",
          "每日歼灭次数": "wipeouts", "每次小时数": "wipeout_hours", "今天已完成": "completed",
          "现有信用点": "bare_credit", "现有战斗数据": "bare_battle", "现有红球": "bare_dust",
          "推图计入范围": "stage_clear_mode",
          "推图信用点(普通)": "stage_clear_credit", "推图战斗数据(普通)": "stage_clear_battle", "推图红球(普通)": "stage_clear_dust",
          "推图信用点(困难)": "stage_clear_credit2", "推图战斗数据(困难)": "stage_clear_battle2", "推图红球(困难)": "stage_clear_dust2",
          "每级信用点(覆盖)": "cost_credit", "每级战斗数据(覆盖)": "cost_battle", "每级红球(覆盖)": "cost_dust",
          "方舟箱": "ark", "30天箱": "growth", "挑战者箱": "challenger",
          "预计新主线开放日": "future_open", "预计普通进度": "future_normal_stage", "预计困难进度": "future_hard_stage", "预计基地等级": "future_base",
        };
        Object.keys(FIELD).forEach(function (k) {
          if (map[k] !== undefined && map[k] !== "") f[FIELD[k]] = map[k];
        });
        state.form = f;
        renderForm();
        saveForm();
        tip("XLSX 导入成功，已刷新表单");
      } catch (err) {
        alert("XLSX 读取失败：" + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------- 悬浮进度球 ---------- */
  function updateProgress() {
    var f = collectForm();
    var items = [
      ["当前同步器等级", !!f.current], ["目标同步器等级", !!f.target], ["基地防御等级", !!f.base],
      ["关卡进度", !!(f.normal_stage || f.hard_stage)],
      ["信用点收益", !!f.credit_rate], ["战斗数据收益", !!f.battle_rate], ["红球收益", !!f.dust_rate],
      ["每日歼灭次数", f.wipeouts !== ""], ["现有信用点", !!f.bare_credit], ["现有战斗数据", !!f.bare_battle],
      ["现有红球", !!f.bare_dust], ["升级消耗", !!(f.cost_credit || f.cost_battle || f.cost_dust || COST_TIERS.length)],
    ];
    var filled = items.filter(function (i) { return i[1]; }).length;
    var pct = Math.round(filled / items.length * 100);
    var ring = $("progressRing"), txt = $("progressText"), count = $("ppCount"), list = $("ppList");
    ring.setAttribute("stroke-dashoffset", String(163.4 * (1 - filled / items.length)));
    ring.setAttribute("stroke", pct === 100 ? "#0f6e56" : pct >= 60 ? "#1d9e75" : "#e0a63c");
    txt.textContent = pct + "%";
    count.textContent = filled + "/" + items.length;
    list.innerHTML = items.map(function (i) {
      return "<li class='" + (i[1] ? "ok-item" : "no-item") + "'>" + (i[1] ? "✅" : "⬜") + " " + esc(i[0]) + "</li>";
    }).join("");
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 普通章节 -> 困难跟随 + 未来+2
    $("f_normal_chapter").addEventListener("change", function () {
      syncStageOptions("normal");
      setVal("f_normal_stage", lastStage("normal", val("f_normal_chapter")));
      syncCurrentBase();
      enforceHardCap();
      syncFutureNormal();
      onFormChange();
    });
    $("f_normal_stage").addEventListener("change", function () { syncCurrentBase(); onFormChange(); });

    // 困难章节（手动 -> 标记 + 上限约束 + 未来困难+2）
    $("f_hard_chapter").addEventListener("change", function () {
      state.normalManual = true;
      syncStageOptions("hard");
      setVal("f_hard_stage", lastStage("hard", val("f_hard_chapter")));
      enforceHardCap();
      syncCurrentBase();
      syncFutureHard();
      onFormChange();
    });
    $("f_hard_stage").addEventListener("change", function () { state.normalManual = true; syncCurrentBase(); onFormChange(); });

    // 未来进度（手动 -> 标记）
    $("f_future_normal_chapter").addEventListener("change", function () {
      state.futureNormalManual = true;
      syncStageOptions("future_normal");
      setVal("f_future_normal_stage", lastStage("normal", val("f_future_normal_chapter")));
      syncFutureBase(); onFormChange();
    });
    $("f_future_normal_stage").addEventListener("change", function () { state.futureNormalManual = true; syncFutureBase(); onFormChange(); });
    $("f_future_hard_chapter").addEventListener("change", function () {
      state.futureHardManual = true;
      syncStageOptions("future_hard");
      setVal("f_future_hard_stage", lastStage("hard", val("f_future_hard_chapter")));
      syncFutureBase(); onFormChange();
    });
    $("f_future_hard_stage").addEventListener("change", function () { state.futureHardManual = true; syncFutureBase(); onFormChange(); });

    $("f_tactics").addEventListener("change", function () { syncCurrentBase(); syncFutureBase(); onFormChange(); });
    $("f_stage_mode").addEventListener("change", function () { updateStageClearUI(); onFormChange(); });
    $("f_future_open").addEventListener("change", onFormChange);
    $("f_base").addEventListener("change", onFormChange);

    // 通用输入变化 -> 自动保存
    document.querySelectorAll("#formSection input, #formSection select").forEach(function (el) {
      if (["f_normal_chapter", "f_normal_stage", "f_hard_chapter", "f_hard_stage",
           "f_future_normal_chapter", "f_future_normal_stage", "f_future_hard_chapter", "f_future_hard_stage",
           "f_tactics", "f_stage_mode"].indexOf(el.id) >= 0) return;
      el.addEventListener("change", onFormChange);
      el.addEventListener("input", onFormChange);
    });

    $("btnCalc").addEventListener("click", calculate);
    $("btnSave").addEventListener("click", function () { saveForm(); tip("已保存当前表单"); });
    $("btnTemplate").addEventListener("click", function () {
      if (typeof XLSX === "undefined") { alert("XLSX 库未加载（需联网），暂无法下载模板。"); return; }
      download("账号评估表单.xlsx", buildXlsxTemplate(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });
    $("btnImport").addEventListener("click", function () { $("fileXlsx").click(); });
    $("fileXlsx").addEventListener("change", function () {
      if (this.files && this.files[0]) importXlsx(this.files[0]);
      this.value = "";
    });

    // tabs
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        $(t.dataset.tab).classList.add("active");
      });
    });

    // 悬浮进度球
    $("progressFab").addEventListener("click", function () {
      var p = $("progressPanel");
      p.style.display = p.style.display === "none" ? "block" : "none";
      updateProgress();
    });
    $("ppClose").addEventListener("click", function () { $("progressPanel").style.display = "none"; });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    loadForm();
    Promise.all([O.loadStageMap(), O.loadIncomeTable()])
      .then(function () {
        state.normalChapters = O.chapters("normal");
        state.hardChapters = O.chapters("hard");
        ["normal", "hard"].forEach(function (mode) {
          var map = mode === "hard" ? state.hardStages : state.normalStages;
          var chs = mode === "hard" ? state.hardChapters : state.normalChapters;
          chs.forEach(function (ch) { map[ch] = O.stagesInChapter(ch, mode); });
          var fmap = mode === "hard" ? state.futureHardStages : state.futureNormalStages;
          chs.forEach(function (ch) { fmap[ch] = O.stagesInChapter(ch, mode); });
        });
        // 阶梯消耗表
        return fetch("data/level_cost_table.json").then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.kind === "tiered_per_level") COST_TIERS = d.tiers || [];
        }).catch(function () { COST_TIERS = []; });
      })
      .then(function () {
        return fetch("data/stage_clear_resources.json").then(function (r) { return r.json(); }).then(function (d) {
          state.stageClearEntries = (d && d.chapters) || {};
        }).catch(function () { state.stageClearEntries = {}; });
      })
      .then(function () {
        renderForm();
        bindEvents();
        updateProgress();
        tip("就绪");
      })
      .catch(function (e) {
        alert("数据加载失败：" + e.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
