/* app.js — NIKKE 资源规划计算器前端逻辑 */
(function () {
  "use strict";
  var C = window.NikkeCore, O = window.NikkeOutpost, S = window.NikkeScenarios, B = window.NikkeBoxes;
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

  /* Toast 弹窗提示（底部居中，淡入淡出 + 上浮） */
  function tip(msg) {
    var t = $("toast");
    if (!t) { t = el("div", "", "toast"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    // 强制重排以重启动画
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    clearTimeout(tip._t);
    tip._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

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
    $("stageClearTitle").textContent = "预计新主线推图收益（" + (n - 1) + "-" + n + " 章）";
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
    // 表单发生变化 -> 计算结果已过时，按钮还原为"开始计算"初始状态
    resetCalcButton();
  }

  /* 计算按钮状态：初始绿色"开始计算" / 计算后紫色"重新计算" */
  function resetCalcButton() {
    var b = $("btnCalc");
    if (b) { b.classList.remove("btn-accent"); b.classList.add("btn-primary"); b.textContent = "开始计算"; }
  }
  function markCalculated() {
    var b = $("btnCalc");
    if (b) { b.classList.remove("btn-primary"); b.classList.add("btn-accent"); b.textContent = "重新计算"; }
  }

  /* ---------- 升级消耗联动（当前等级 -> 预填 + 梯度预览） ---------- */
  function fmtK(v) { return (Math.round(v / 1000)) + "K"; }
  function tierValueAt(tiers, level) {
    if (!tiers || !tiers.length) return null;
    var chosen = tiers[0];
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].level <= level) chosen = tiers[i];
      else break;
    }
    return { level: chosen.level, credit: chosen.credit * 1000, battle_data: chosen.battle_data * 1000, core_dust: Number(chosen.core_dust) };
  }

  function syncCostFromLevel() {
    var lvl = parseInt(val("f_current"), 10) || 0;
    var t = tierValueAt(COST_TIERS, lvl);
    if (t) {
      if (!val("f_cost_credit")) setVal("f_cost_credit", fmtK(t.credit));
      if (!val("f_cost_battle")) setVal("f_cost_battle", fmtK(t.battle_data));
      if (!val("f_cost_dust")) setVal("f_cost_dust", Math.round(t.core_dust));
    }
    renderCostPreview();
  }

  function renderCostPreview() {
    var wrap = $("costPreviewWrap");
    if (!wrap) return;
    var lvl = parseInt(val("f_current"), 10) || 0;
    var tgt = Math.max(parseInt(val("f_target"), 10) || 0, parseInt(val("f_alternate"), 10) || 0);
    if (!lvl || !tgt || tgt <= lvl || !COST_TIERS || !COST_TIERS.length) { wrap.innerHTML = ""; return; }
    var segments = [];
    var cursor = lvl;
    while (cursor < tgt) {
      var t = tierValueAt(COST_TIERS, cursor);
      var nextLevel = null;
      for (var i = 0; i < COST_TIERS.length; i++) {
        if (COST_TIERS[i].level > cursor) { nextLevel = COST_TIERS[i].level; break; }
      }
      var segEnd = Math.min(nextLevel !== null ? nextLevel : tgt, tgt);
      segments.push({ start: cursor, end: segEnd, count: segEnd - cursor, tier: t });
      cursor = segEnd;
    }
    // 千分位整数展示（用于阶梯消耗表这种"个"级数字）
    function numFmt(v) {
      if (v === null || v === undefined || isNaN(v)) return "-";
      return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    var html = "<div class='cost-preview'><h4>升级消耗分档预览（同步器 " + lvl + " → " + tgt + "）</h4>";
    html += "<table><tr><th>等级段</th><th>信用点/级</th><th>战斗数据/级</th><th>红球/级</th><th>级数</th><th>段内总消耗（信用点/战斗数据/红球）</th></tr>";
    segments.forEach(function (seg, idx) {
      var rise = idx > 0 ? " class='rise'" : "";
      var tc = seg.tier.credit * seg.count, tb = seg.tier.battle_data * seg.count, td = seg.tier.core_dust * seg.count;
      var segLbl = seg.start + "–" + seg.end + (idx > 0 ? " ⬆" : "");
      var totalTxt = numFmt(tc) + " / " + numFmt(tb) + " / " + numFmt(td);
      var perTxt = numFmt(seg.tier.credit) + " / " + numFmt(seg.tier.battle_data) + " / " + numFmt(seg.tier.core_dust);
      html += "<tr" + rise + "><td>" + segLbl + "</td><td>" + numFmt(seg.tier.credit) + "</td><td>" + numFmt(seg.tier.battle_data) + "</td><td>" + numFmt(seg.tier.core_dust) + "</td><td>" + seg.count + "</td><td>" + totalTxt + "</td></tr>";
    });
    html += "</table>";
    html += "<p class='hint'>按内置阶梯表（每 50 级一档）估算；⬆ 表示该段消耗相比上一档提升。手动填写三项消耗后以手动值为准。</p></div>";
    wrap.innerHTML = html;
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
    var body = rows.map(function (r) {
      return "<tr>" + r.map(function (c) {
        // 超长文本（备注/说明/分配明细等）加 .wrap：移动端限宽换行，其余列不换行撑宽后横滑
        var w = (typeof c === "string" && c.length > 18) ? ' class="wrap"' : "";
        return "<td" + w + ">" + c + "</td>";
      }).join("") + "</tr>";
    }).join("");
    t.innerHTML = thead + body;
    // 包一层滚动容器：手机端表格超出屏幕宽度时可左右滑动
    var wrap = el("div", "", "tbl-scroll");
    wrap.appendChild(t);
    return wrap;
  }

  /* 结果表格可滑动标记：内容溢出时加 .scrollable（触发右缘渐隐提示） */
  function markScrollableTables() {
    var list = document.querySelectorAll(".tbl-scroll");
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      s.classList.toggle("scrollable", s.scrollWidth > s.clientWidth + 2);
    }
  }

  /* 以凌晨4点为日界的自然日差 */
  function daysAnchor(dataDate, targetDate) {
    var s = new Date(dataDate.getFullYear(), dataDate.getMonth(), dataDate.getDate(), 4, 0, 0);
    var e = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 4, 0, 0);
    return Math.floor((e - s) / 86400000);
  }

  /* 某目标对应的"自然增长"天数（三方案第 3 行） */
  function naturalDaysOf(result, tgt) {
    var s = (result.scenario_f_target && result.scenario_f_target.target === tgt) ? result.scenario_f_target
          : (result.scenario_f_alt && result.scenario_f_alt.target === tgt) ? result.scenario_f_alt : null;
    if (!s || !s.rows || !s.rows[2]) return null;
    var d = s.rows[2].days;
    return (typeof d === "number" && isFinite(d)) ? d : null;
  }
  // naturalDaysOf 当前未在渲染中使用（达成判断改为「全箱梭哈也无法达成」口径）；保留供后续扩展

  /* 开箱方案文本（固定箱全部使用 + 自选箱分配） */
  function boxPlanText(plan, reached) {
    // 目标已达成或无开箱方案：显示「无需开箱」+ 原因
    if (!plan || !plan.length || plan.every(function (p) { return !p.used; })) {
      return reached ? "无需开箱（资源已足够）" : "无需开箱（等待自然增长）";
    }
    var parts = ["固定小时箱全部使用"];
    plan.forEach(function (p) {
      if (p.used > 0) {
        var det = Object.keys(p.choices || {}).filter(function (k) { return p.choices[k]; })
          .map(function (k) { return k + " x" + p.choices[k]; }).join("+");
        parts.push(p.name + " x" + p.used + (det ? "（" + det + "）" : ""));
        }
      });
    return parts.join("；");
  }

  /* 开箱达成目标统计方案：按资源储备层级判断（①裸资源够 ②固定箱按需够 ③固定箱+挑战者平替够 ④梭哈不够） */
  function planByLevels(result, snap, tgt, future) {
    var pr = result.per_resource;
    var prefix = future ? "future_" : "";
    function minL(p) { return Math.min(p.credit, p.battle_data, p.core_dust); }
    var bare = pr[prefix + "bare"], fixed = pr[prefix + "fixed"];
    var maxLv = future ? result.future_main_story.result.level : result.selectable.level;
    var immediate = future ? ("开放日即达（" + result.future_main_story.open_at.slice(0, 10) + "）") : "立即可达（今天）";
    // ① 当前资源储备已足够
    if (minL(bare) >= tgt) return { days: "0", date: immediate, plan: "无需开箱（当前资源已足够）" };
    // ② 固定小时箱按需开启即可达成
    if (minL(fixed) >= tgt) {
      var steps = Math.max(0, tgt - snap.current_sync_level);
      var baseRes = future ? result.future_main_story.projected_bare : snap.bare_resources;
      var income = future ? (snap.future_income_per_hour || snap.income_per_hour) : snap.income_per_hour;
      var need = B.fixedBoxesNeeded(snap, baseRes, steps, income);
      var n = 0;
      Object.keys(need.used).forEach(function (nm) {
        Object.keys(need.used[nm]).forEach(function (h) { n += need.used[nm][h]; });
      });
      return { days: "0", date: immediate, plan: "固定小时箱按需开启 " + n + " 个即可达成（无需开自选箱）" };
    }
    // ③ 全箱梭哈可达成：固定箱全部 + 挑战者优先平替（不足再开自选箱）
    if (maxLv >= tgt) {
      var plan = future ? result.target_selectable_future : result.target_selectable_now;
      return { days: "0", date: immediate, plan: boxPlanText(plan ? plan.selectable : [], true) };
    }
    // ④ 全资源投入也无法达成
    var gap = tgt - maxLv;
    return { days: "-", date: "全箱梭哈也无法达成", plan: "全资源投入后仍差 " + gap + " 级（需补充资源）" };
  }

  function renderResult(result, snap) {
    var box = $("tabResult"); box.innerHTML = "";
    var resLabels = { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };
    var recDate = new Date(snap.recorded_at.getTime());

    // 0. 省流版结论（置顶摘要卡）
    box.appendChild(renderSummary(result, snap));

    // 1. 核心结论 4 卡片
    var cards = el("div", "", "cards");
    function card(num, lbl, warn) {
      return el("div", "<div class='num'>" + num + "</div><div class='lbl'>" + lbl + "</div>", "card" + (warn ? " warn" : ""));
    }
    cards.appendChild(card("同步器 " + result.bare.level, "当前同步器等级"));
    cards.appendChild(card("同步器 " + result.fixed.level, "仅使用固定小时箱"));
    cards.appendChild(card("同步器 " + result.selectable.level, "全箱梭哈"));
    cards.appendChild(card(fmtDays(result.no_box.days) + " 天", "自然升级（不开箱）", true));
    box.appendChild(cards);
    var capLines = [
      "① 当前同步器等级：只用现有资源（含推图资源）不开箱能达到的等级；",
      "② 仅使用固定小时箱：只开固定小时箱能达到的等级；",
      "③ 全箱梭哈：固定小时箱 + 自选箱全部使用能达到的等级；",
      "④ 自然升级（不开箱）：完全不开箱，" + fmtDays(result.no_box.days) + " 天到目标 " + result.no_box.target + "。",
    ];
    box.appendChild(el("div", capLines.join("<br>"), "cards-caption"));

    // 2. 各类资源可达到的最大等级（新主线开启前 / 后）
    box.appendChild(el("h3", "各类资源可达到的最大等级", "sec"));
    var prRows = [];
    var scenes = [["bare", "现有资源"], ["fixed", "仅使用固定小时箱"], ["selectable", "固定小时箱 + 资源自选箱"]];
    var hasFuturePR = result.per_resource.future_bare && result.per_resource.future_fixed && result.per_resource.future_selectable;
    scenes.forEach(function (pair) {
      C.RESOURCES.forEach(function (r) {
        var before = result.per_resource[pair[0]][r];
        var after = hasFuturePR ? result.per_resource["future_" + pair[0]][r] : null;
        prRows.push([pair[1], resLabels[r], "同步器 " + before, after !== null ? "同步器 " + after : "-"]);
      });
    });
    box.appendChild(table(["场景", "资源", "新主线开启前最大等级", "新主线开启后最大等级"], prRows));
    box.appendChild(el("p", "每个场景下三类资源各自单独计算能升到多少级（只看单资源）；开启后 = 新主线开放日按未来收益 + 等待期自然积累。两列各取最小值。", "caption"));

    // 3. 开箱达成目标统计（按资源储备层级判断方案）
    box.appendChild(el("h3", "开箱达成目标统计", "sec"));
    var targets = [result.no_box.target, snap.alternate_target_level];
    var okRows = [];
    var futureAvail = result.future_main_story.available;
    targets.forEach(function (tgt) {
      // 未开新主线
      var nowLevel = result.selectable.level;
      var nowOk = nowLevel >= tgt;
      var nowRow = [tgt, "未开新主线", "同步器 " + nowLevel, nowOk ? "✅" : "❌"];
      var np = planByLevels(result, snap, tgt, false);
      nowRow.push(np.days, np.date, np.plan);
      okRows.push(nowRow);
      // 开放新主线后
      if (futureAvail) {
        var fLevel = result.future_main_story.result.level;
        var fOk = fLevel >= tgt;
        var fRow = [tgt, "开放新主线后", "同步器 " + fLevel, fOk ? "✅" : "❌"];
        var fp = planByLevels(result, snap, tgt, true);
        fRow.push(fp.days, fp.date, fp.plan);
        okRows.push(fRow);
      } else {
        okRows.push([tgt, "开放新主线后", "-", "❌", "-", "未填写新主线预测", "-"]);
      }
    });
    box.appendChild(table(["目标", "场景", "全箱梭哈后", "是否达成", "预计天数", "预计达成日期", "开箱方案"], okRows));
    box.appendChild(el("p", "开箱方案按资源储备层级判断：①当前资源已足够 → 无需开箱；②固定小时箱按需开启即可达成 → 只开固定小时箱；③固定小时箱 + 挑战者宝箱平替可达成 → 固定箱全部 + 挑战者优先（不足再开自选箱）；④全资源梭哈也无法达成 → 告知差额。挑战者成长宝箱为固定数值奖励；红球（芯尘）按防御基地等级取整。", "caption"));

    // 4. 自然升级到 N（不开箱）
    box.appendChild(el("h3", "自然升级到" + result.no_box.target + "（不开箱）", "sec"));
    var nb = result.no_box;
    var nbRows = C.RESOURCES.map(function (r) {
      var isB = r === nb.bottleneck;
      return [resLabels[r], fmtNum(nb.required[r]), fmtNum(snap.bare_resources[r]), fmtNum(nb.shortage[r]), fmtNum(nb.daily_income[r]), fmtDays(nb.days_by_resource[r]), isB ? "✅ 瓶颈" : ""];
    });
    box.appendChild(table(["资源", "总需求", "现有余额", "缺口", "每日收益", "需要天数", "是否瓶颈"], nbRows));
    box.appendChild(el("p", "瓶颈资源：" + resLabels[nb.bottleneck] + "；预计日期：" + nb.estimated_at + "；需 " + nb.steps + " 级。", "caption"));
  }


  /* 全资源总量：现有 + 推图 + 固定小时箱 + 自选箱全值（参考固定箱折算：只比资源获取量，不减升级消耗） */
  function allInTotal(snap, income) {
    var res = C.addRes(snap.bare_resources, snap.stage_clear_resources || {});
    res = C.addRes(res, B.fixedBoxResources(snap, income));
    C.RESOURCES.forEach(function (r) {
      var best = 0;
      (snap.selectable_boxes || []).forEach(function (b) {
        if (!b.options || !b.options.length) return;
        var bv = 0;
        b.options.forEach(function (opt) {
          var v = (opt.rewards && opt.rewards[r]) || 0;
          bv = Math.max(bv, opt.mode === "units" ? v : v * (income[r] || 0));
        });
        best += bv * b.quantity;
      });
      res[r] += best;
    });
    return res;
  }

  function resourceTable(res) {
    var rows = [["信用点", fmtNum(res.credit)], ["战斗数据辑", fmtNum(res.battle_data)], ["红球", fmtNum(res.core_dust)]];
    return table(["资源", "数值"], rows);
  }

  /* 渲染"到某目标的三方案"表（箱子方案 tab 复用） */
  function scenarioTable(sc) {
    var wrap = el("div", "");
    wrap.appendChild(el("h3", "达到" + sc.target + "的三种方案", "sec"));
    var rows = sc.rows.map(function (r) {
      return [r.name, "同步器 " + r.level, r.date ? r.date.slice(0, 16) : "-", fmtDays(r.days), r.feasible ? "✅" : "❌", r.assumption];
    });
    wrap.appendChild(table(["方案", "预计等级", "达到目标日期", "天数", "可行", "说明"], rows));
    wrap.appendChild(el("p", "推荐：" + sc.recommendation + "。", "caption"));
    return wrap;
  }

  function renderBox(result, snap) {
    var box = $("tabBox"); box.innerHTML = "";
    // A. 达到目标同步器等级的三方案
    box.appendChild(scenarioTable(result.scenario_f_target));
    // B. 达到后续追求目标等级的三方案
    box.appendChild(scenarioTable(result.scenario_f_alt));
    // C. 自选箱分配（按「目标同步器等级」优化：当前收益 / 新主线开放后）
    var targetLv = snap.target_sync_level;
    box.appendChild(el("h3", "自选箱分配方案（全箱梭哈 → 目标同步器 " + targetLv + "）", "sec"));
    box.appendChild(selectablePlanTable(result.target_selectable_now, "未开新主线（当前收益）"));
    box.appendChild(selectablePlanTable(result.target_selectable_future, "新主线开放后（未来收益 + 等待期积累）"));
    box.appendChild(el("p", "以上方案按「目标同步器等级 " + targetLv + "」的资源缺口优化自选箱分配；挑战者成长宝箱为固定数值奖励，默认全部消耗。", "caption"));
    // D. 固定小时箱收益折算（含差值换算）
    box.appendChild(el("h3", "固定小时箱收益折算（开主线前 vs 开主线后）", "sec"));
    var before = result.fixed.fixed || {};
    var after = result.future_main_story.available ? result.future_main_story.result.fixed || {} : null;
    var fixRows = C.RESOURCES.map(function (r) {
      var bv = before[r] || 0, av = after ? (after[r] || 0) : 0, diff = av - bv;
      var diffLevels = diff > 0 ? C.affordableLevelsSingle({ credit: 0, battle_data: 0, core_dust: 0, [r]: diff }, snap, snap.current_sync_level, r) : 0;
      return [C.RESOURCE_LABELS[r], fmtNum(bv), after ? fmtNum(av) : "-", after ? fmtNum(diff) : "-", diff > 0 ? ("≈" + diffLevels + " 级（" + C.RESOURCE_LABELS[r] + "单资源）") : "-"];
    });
    box.appendChild(table(["资源", "开主线前折算（当前收益）", "开主线后折算（新收益）", "差值", "差值≈可升等级"], fixRows));
    box.appendChild(el("p", "固定小时箱按开启时的基地收益折算：开主线前用当前收益、开主线后用新基地收益。挑战者成长宝箱属于自选箱（不计入此处）。", "caption"));
    // E. 全资源梭哈收益折算（开主线前 vs 开主线后，模板同 D）
    box.appendChild(el("h3", "全资源梭哈收益折算（开主线前 vs 开主线后）", "sec"));
    if (result.future_main_story.available) {
      var futIncome2 = snap.future_income_per_hour || snap.income_per_hour;
      var futSnap2 = JSON.parse(JSON.stringify(snap));
      futSnap2.bare_resources = result.future_main_story.projected_bare;
      var nowTotal = allInTotal(snap, snap.income_per_hour);
      var futTotal = allInTotal(futSnap2, futIncome2);
      var cmpRows = C.RESOURCES.map(function (r) {
        var nv = nowTotal[r] || 0, fv = futTotal[r] || 0, diff = fv - nv;
        var diffLevels = diff > 0 ? C.affordableLevelsSingle({ credit: 0, battle_data: 0, core_dust: 0, [r]: diff }, snap, snap.current_sync_level, r) : 0;
        return [C.RESOURCE_LABELS[r], fmtNum(nv), fmtNum(fv), diff !== 0 ? ((diff > 0 ? "+" : "") + fmtNum(diff)) : "-", diff > 0 ? ("≈" + diffLevels + " 级（" + C.RESOURCE_LABELS[r] + "单资源）") : "-"];
      });
      box.appendChild(table(["资源", "开主线前折算（当前收益）", "开主线后折算（新收益）", "差值", "差值≈可升等级"], cmpRows));
      var levelDiff = result.future_main_story.result.level - result.selectable.level;
      box.appendChild(el("p", "立即全箱梭哈可到 <b>同步器 " + result.selectable.level + "</b>；等到开放日（" + result.future_main_story.open_at.slice(0, 10) + "）再全箱梭哈可到 <b>同步器 " + result.future_main_story.result.level + "</b>（多升 " + levelDiff + " 级）。全资源 = 现有 + 推图 + 固定小时箱 + 自选箱全部；前/后列为全资源总量（与固定箱折算同口径：只比资源获取量，不减升级消耗）；差值 = 等新主线再梭哈多获得的资源；差值≈可升等级为单资源视角的粗略换算。", "caption"));
      var hasFutIncome2 = (futIncome2.credit || 0) > 0 || (futIncome2.battle_data || 0) > 0 || (futIncome2.core_dust || 0) > 0;
      if (!hasFutIncome2) {
        box.appendChild(el("p", "⚠ 未填写「预计新收益」，开主线后的折算暂按当前收益估算，结果与开主线前接近属正常；填上预计新基地收益后会更准确。", "caption"));
      }
    } else {
      box.appendChild(el("p", result.future_main_story.reason + "；可在「预计新主线进度」中填写后重新计算。"));
    }
  }

  /* 自选箱分配表（无标题；供「箱子方案」tab 与省流卡复用，格式统一）
     planArr = 开箱方案条目数组（含 name/used/keep/choices） */
  function selectableBoxTable(planArr, note) {
    note = note || "无需开箱（现有资源 + 固定小时箱已满足目标）";
    var rows = [];
    var hasUsed = false;
    (planArr || []).forEach(function (p) {
      if (p.used > 0) hasUsed = true;
      var detail = Object.keys(p.choices || {}).filter(function (k) { return p.choices[k]; })
        .map(function (k) { return k + " x" + p.choices[k]; }).join("、") || "无需开启";
      var note2 = p.name.indexOf("挑战者") >= 0 ? "固定数值奖励，默认全部消耗（不受基地等级影响）" : "";
      rows.push([p.name, p.used, p.keep, detail, note2]);
    });
    if (!planArr || !planArr.length || !hasUsed) return el("p", note, "caption");
    return table(["箱子", "使用", "保留", "分配明细", "备注"], rows);
  }

  /* 渲染一组自选箱分配方案表（含"当前/新主线后"标签） */
  function selectablePlanTable(plan, label) {
    var wrap = el("div", "");
    wrap.appendChild(el("h4", label, "sec"));
    wrap.appendChild(selectableBoxTable(plan ? plan.selectable : null));
    return wrap;
  }

  /* 省流卡内的开箱方案：固定箱一句话 + 自选箱按需分配表格 */
  function planSummary(boxArr) {
    var wrap = el("div", "", "sb-plan");
    var hasUsed = boxArr && boxArr.some(function (p) { return p.used > 0; });
    if (hasUsed) {
      wrap.appendChild(el("div", "开箱方案：固定小时箱全部使用；自选箱按需分配（开够即停）：", "sb-plan"));
      wrap.appendChild(selectableBoxTable(boxArr));
    } else {
      wrap.appendChild(el("div", "开箱方案：固定小时箱全部使用（自选箱无需开启）", "sb-plan"));
    }
    return wrap;
  }

  /* ---------- 省流版结论（置顶摘要卡） ---------- */
  function renderSummary(result, snap) {
    var wrap = el("div", "", "summary-card");
    wrap.appendChild(el("div", "省流版结论", "summary-title"));
    var target = snap.target_sync_level;

    // 全箱梭哈口径：现状 / 新主线开放后 的最高等级与配套方案
    var nowLv = result.selectable.level;
    var nowPlan = (result.target_selectable_now || {}).selectable || null;
    var fut = result.future_main_story;
    var hasFut = !!(fut && fut.available && fut.result);
    var futLv = hasFut ? fut.result.level : null;
    var futPlan = hasFut ? (result.target_selectable_future || {}).selectable || null : null;

    // Block ① 现状（当前基地 · 直接全箱梭哈）
    var b1 = el("div", "", "summary-block");
    b1.appendChild(el("div", "① 现状（当前基地 · 直接全箱梭哈）", "sb-head"));
    var big1 = "全箱梭哈最高可到 <b>同步器 " + nowLv + "</b>";
    if (nowLv >= target) big1 += ' <span class="ok-tag">✅ 已达目标级 ' + target + "</span>";
    else big1 += "（目标 " + target + " 还差 " + Math.max(0, target - nowLv) + " 级）";
    b1.appendChild(el("div", big1, "sb-big"));
    b1.appendChild(planSummary(nowPlan));
    wrap.appendChild(b1);

    // Block ② 考虑新主线（开放后按新基地收益全箱梭哈）
    var b2 = el("div", "", "summary-block");
    b2.appendChild(el("div", "② 考虑新主线（开放后按新基地收益开箱）", "sb-head"));
    if (hasFut) {
      var date = fut.open_at ? fut.open_at.slice(0, 10) : "";
      var diff = futLv - nowLv;
      var big2 = "开放日（" + date + "）全箱梭哈最高可到 <b>同步器 " + futLv + "</b>";
      if (diff > 0) big2 += "（较现状多升 <b>" + diff + "</b> 级）";
      if (futLv >= target) big2 += ' <span class="ok-tag">✅ 已达目标级 ' + target + "</span>";
      b2.appendChild(el("div", big2, "sb-big"));
      b2.appendChild(planSummary(futPlan));
      var fIn = snap.future_income_per_hour || {};
      var hasF = (fIn.credit || 0) > 0 || (fIn.battle_data || 0) > 0 || (fIn.core_dust || 0) > 0;
      if (!hasF) b2.appendChild(el("div", "⚠ 未填写「预计新收益」，新主线口径暂按当前收益估算。", "summary-warn"));
    } else {
      b2.appendChild(el("div", "未填写新主线进度，无法评估该口径；可在「预计新主线进度」中填写后重新计算。", "sb-text"));
    }
    wrap.appendChild(b2);

    // Block ③ 整合结论
    var b3 = el("div", "", "summary-block");
    b3.appendChild(el("div", "③ 整合结论", "sb-head"));
    var text3;
    if (hasFut) {
      var diff3 = futLv - nowLv;
      if (diff3 > 0) {
        text3 = "💰 <b>建议等新主线开放后再全箱梭哈</b>：现在梭哈到 <b>同步器 " + nowLv + "</b>；等 " + date + " 再梭哈可到 <b>同步器 " + futLv + "</b>，多 <b>" + diff3 + "</b> 级。";
      } else {
        text3 = "现在全箱梭哈可到 <b>同步器 " + nowLv + "</b>；等新主线开放后再梭哈可到 <b>同步器 " + futLv + "</b>（收益相当，可立即梭哈）。";
      }
    } else {
      text3 = "当前全箱梭哈最高可到 <b>同步器 " + nowLv + "</b>。";
    }
    var days = result.no_box ? result.no_box.days : null;
    if (days != null && isFinite(days)) text3 += " 完全不开箱自然增长到目标 " + target + " 需 <b>" + fmtDays(days) + "</b> 天。";
    b3.appendChild(el("div", text3, "sb-text"));
    wrap.appendChild(b3);

    wrap.appendChild(el("div", "口径：全箱梭哈 = 固定小时箱 + 自选箱全部使用；「配套方案」为按目标优化的自选箱分配（开够即停，不浪费）。未达目标请按下述方案执行或补充资源。", "summary-note"));
    return wrap;
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
      renderRaw(state.lastResult);
      saveForm();
      // 标记可横向滑动的结果表（内容溢出时显示右缘渐隐提示）
      markScrollableTables();
      // 计算结果出现后切到双列布局（结果在右侧）+ hero 与左表单等宽对齐
      $("layout").classList.add("has-result");
      document.body.classList.add("has-result");
      markCalculated();
      // 滚动到结果区（手机小屏下"回到顶部"会让用户看不到结果）
      var rs = $("resultSection");
      rs.scrollIntoView({ behavior: "smooth", block: "start" });
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

  /* ---------- 导出一图流（结果区截图 PNG） ---------- */
  function exportResultImage() {
    if (!state.lastResult) { alert("请先点击「开始计算」生成结果后再导出。"); return; }
    if (typeof html2canvas === "undefined") { alert("图片库未加载（需联网首次访问），请刷新重试。"); return; }
    var rs = $("resultSection");
    // 临时展开 tabResult + tabBox（"怎么开箱子才够" + 自选箱方案），排除 tabRaw（原始 JSON 长文本）
    // 注意：必须显式 display:"block"（空字符串会被 .tab-panel{display:none} 类规则重新隐藏，导致内容截不到）
    var panels = document.querySelectorAll(".tab-panel");
    var prev = [];
    panels.forEach(function (p) {
      prev.push(p.style.display);
      p.style.display = (p.id === "tabRaw") ? "none" : "block";
    });
    html2canvas(rs, {
      backgroundColor: "#ffffff", scale: 2, useCORS: true,
      // 克隆 DOM 上：①加 export-mode ②inline 强制隐藏 tabs ③注入标题块（class 后加可能不被 html2canvas 应用，用 inline/style 最稳）
      onclone: function (clonedDoc) {
        var panel = clonedDoc.getElementById("resultSection");
        if (panel) {
          panel.classList.add("export-mode");
          // 强制隐藏 tabs（不进入导出图）
          var tabs = panel.querySelector("nav.tabs");
          if (tabs) tabs.style.display = "none";
          // 注入顶部标题块
          var title = clonedDoc.createElement("div");
          title.className = "export-title";
          title.innerHTML = '<h1 class="export-title-main">NIKKE 资源规划计算结果</h1><p class="export-title-sub">GODDESS OF VICTORY · 嗷润吉-DORO 制作</p>';
          panel.insertBefore(title, panel.firstChild);
        }
      },
    })
      .then(function (canvas) {
        panels.forEach(function (p, i) { p.style.display = prev[i]; });
        canvas.toBlob(function (blob) {
          if (!blob) { alert("导出失败，请重试。"); return; }
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "NIKKE计算结果_" + new Date().toISOString().slice(0, 10) + ".png";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        });
      })
      .catch(function (e) {
        panels.forEach(function (p, i) { p.style.display = prev[i]; });
        alert("导出失败：" + e.message);
      });
  }

  /* ---------- XLSX 导入/导出 ---------- */
  function buildXlsxTemplate() {
    var f = collectForm();
    var aoa = [
      ["字段", "值"],
      ["数据日期", f.recorded], ["当前同步器等级", f.current], ["目标同步器等级", f.target], ["后续追求目标等级", f.alternate],
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
          "数据日期": "recorded", "当前同步器等级": "current", "目标同步器等级": "target", "后续追求目标等级": "alternate",
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
    $("f_current").addEventListener("change", function () { syncCostFromLevel(); onFormChange(); });
    $("f_target").addEventListener("change", function () { renderCostPreview(); onFormChange(); });
    $("f_alternate").addEventListener("change", function () { renderCostPreview(); onFormChange(); });

    // 通用输入变化 -> 自动保存
    document.querySelectorAll("#formSection input, #formSection select").forEach(function (el) {
      if (["f_normal_chapter", "f_normal_stage", "f_hard_chapter", "f_hard_stage",
           "f_future_normal_chapter", "f_future_normal_stage", "f_future_hard_chapter", "f_future_hard_stage",
           "f_tactics", "f_stage_mode"].indexOf(el.id) >= 0) return;
      el.addEventListener("change", onFormChange);
      el.addEventListener("input", onFormChange);
    });

    $("btnCalc").addEventListener("click", calculate);
    $("btnExportImg").addEventListener("click", exportResultImage);
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

  /* ---------- 移动端表单增强：可折叠分组 + 悬浮「开始计算」 ---------- */
  function setupMobileForm() {
    var fab = $("btnCalcFab");
    if (fab) fab.addEventListener("click", function () { calculate(); });

    var mq = window.matchMedia("(max-width: 700px)");
    function apply() {
      var panel = $("formSection");
      if (!panel) return;
      if (mq.matches) {
        panel.classList.add("collapsible");
        panel.querySelectorAll("fieldset").forEach(function (fs) {
          if (!fs.dataset.init) {
            fs.dataset.init = "1";
            // 默认折叠高级分组（grp-c 预计新主线 / grp-d 消耗与箱子），核心分组保持展开
            if (fs.classList.contains("grp-c") || fs.classList.contains("grp-d")) fs.classList.add("collapsed");
            var lg = fs.querySelector("legend");
            if (lg && !fs._bound) {
              fs._bound = true;
              lg.addEventListener("click", function () {
                if (!window.matchMedia("(max-width: 700px)").matches) return;
                fs.classList.toggle("collapsed");
              });
            }
          }
        });
      } else {
        panel.classList.remove("collapsible");
        panel.querySelectorAll("fieldset").forEach(function (fs) { fs.classList.remove("collapsed"); });
      }
    }
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
    apply();

    // 窗口尺寸变化（如手机横竖屏旋转）后重新标记可滑动的结果表
    window.addEventListener("resize", function () {
      if (state.lastResult) markScrollableTables();
    });
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
        setupMobileForm();
        syncCostFromLevel();
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
