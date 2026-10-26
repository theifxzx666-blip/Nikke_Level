/* app.js — NIKKE 资源规划计算器前端逻辑 */
(function () {
  "use strict";
  var C = window.NikkeCore, O = window.NikkeOutpost, S = window.NikkeScenarios, B = window.NikkeBoxes;
  var SV = window.NikkeServers;  // 服务器档案（国际服 / 国服）
  var EV = window.NikkeEvents;   // 活动收益（events.js）
  var LEDGER = window.NikkeLedger;   // 收益账单口径（ledger.js，独立页 ledger.html 共用）
  /* ⚠ localStorage 键名带 v1，是历史遗留：**不要改名**，改名等于所有老玩家进度清零。
     存档自身的版本靠内部的 _schema 字段区分（见 js/servers.js migrateForm）。 */
  var LS_KEY = "nikke_planner_form_v1";
  var DEFAULT_FIXED = {
    "芯尘盒": { 24: 30, 12: 26, 8: 7, 4: 1, 2: 315, 1: 1432 },
    "信用点盒": { 24: 9, 12: 5, 8: 11, 4: 0, 2: 149, 1: 1684 },
    "战斗数据辑盒": { 24: 2, 12: 3, 8: 2, 4: 0, 2: 102, 1: 824 },
    "成长套组": { 24: 0, 12: 0, 8: 0, 4: 0, 2: 0, 1: 8 },
  };
  /* 推图收益默认值 = 官方拆包「最高已收录章节」（官方第 47 章「新生」= 计算器 Chapter 46）。
     单位：信用于战斗数据为 K，红球为个。数据由 data/stage_clear_resources.json 提供，随所选章节联动。 */
  var DEFAULT_STAGE_CLEAR = {
    stage_clear_credit: "15193.2", stage_clear_battle: "45113.6", stage_clear_dust: "370",
    stage_clear_credit2: "2861.3", stage_clear_battle2: "39761", stage_clear_dust2: "880",
    stage_clear_task_credit: "307.5", stage_clear_task_battle: "7464.45", stage_clear_task_dust: "1300",
  };
  /* 旧口径（37-38 章实测估算，来源：屯箱子计算器）——命中即视为「未自定义」，改用新默认 */
  var LEGACY_STAGE_CLEAR = {
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
  /* 级数文案：整数就写整数，小数保留 1 位（R60：box_gain_vs_now 是连续值，别再被取整成 0/1） */
  function lvText(v) {
    v = Math.max(0, Number(v) || 0);
    return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
  }
  function fmtDays(d) { return (typeof d === "number" && isFinite(d)) ? d.toFixed(1) : "-"; }
  /* 「箱个数」用千分位，不用 K/M/B 压缩 —— 计数被压成「25K 个」会看不清量级 */
  function fmtInt(v) {
    var n = Math.round(Number(v) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  /* 把 UTC 的 isoMinutes 字符串（YYYY-MM-DDTHH:mm）转成本地日期 YYYY-MM-DD，避免 slice(0,10) 时区偏移一天 */
  function localDateStr(s) {
    if (!s) return "";
    var d = new Date(s.length === 16 ? s + ":00Z" : s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }
  function dateStr(d) { return d ? d.toISOString().slice(0, 10) : ""; }
  function todayLocal() { var d = new Date(), m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day); }
  function nowTime() { var d = new Date(); function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); }

  /* ---------- 外部库按需加载 ---------- */
  /* 首屏不再加载 html2canvas / xlsx（合计 gzip ≈360KB），改为点到「导出图片 / 下载模板 / 导入 XLSX」时才注入。
     库文件已本地化到 assets/js/vendor/，与页面同源，不再依赖 cdnjs 与 static.dotgg.gg（跨境均不稳）。 */
  var VENDOR = {
    html2canvas: { url: "assets/js/vendor/html2canvas.min.js?v=20260923b", globals: ["html2canvas"] },
    xlsx: { url: "assets/js/vendor/xlsx.full.min.js?v=20260923b", globals: ["XLSX"] },
  };
  var _vendorPending = {};
  function vendorReady(spec) {
    return spec.globals.every(function (n) { return typeof window[n] !== "undefined"; });
  }
  function ensureVendor(key) {
    var spec = VENDOR[key];
    if (vendorReady(spec)) return Promise.resolve();
    if (_vendorPending[key]) return _vendorPending[key];
    _vendorPending[key] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = spec.url;
      s.async = true;
      s.onload = function () {
        if (vendorReady(spec)) { resolve(); return; }
        delete _vendorPending[key];
        reject(new Error("库文件异常"));
      };
      s.onerror = function () {
        delete _vendorPending[key];
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("加载失败"));
      };
      document.head.appendChild(s);
    });
    return _vendorPending[key];
  }

  /* ---------- 状态 ---------- */
  var state = {
    form: null,               // localStorage 表单值
    fresh: true,              // 本机无历史存档（新访客）：分服默认值要等数据加载后再落
    server: "cn",             // 当前生效的服务器档案 key（与 form.server 同步）；R66 起默认国服
    normalManual: false,      // 用户手动改过困难（当前）
    completedAuto: true,      // 「今天已完成歼灭次数」是否仍跟随「每日一举歼灭次数」（用户单独改过即置 false）
    futureNormalManual: false,
    futureHardManual: false,
    normalChapters: [], hardChapters: [],
    normalStages: {}, hardStages: {},   // chapter -> [section]
    futureNormalStages: {}, futureHardStages: {},
    lastResult: null, lastSnapshot: null,
    stageClearEntries: {},
    stageClearFallback: null,   // 官方拆包收录的最高章节键（更晚章节沿用）
  };

  /* ---------- 表单值读写 ---------- */
  function defaultForm() {
    return {
      _schema: 2,              // 存档版本（v1 = 无此字段；迁移见 SV.migrateForm）
      server: "cn",            // 服务器：intl 国际服 / cn 国服（R66 起新访客默认国服）
      recorded: "2026-09-02", current: "489", target: "501", alternate: "521",
      normal_stage: "", hard_stage: "", base: "518", tactics: "是",
      credit_rate: "59860/h", battle_rate: "600440/h", dust_rate: "91.95/h",
      wipeouts: "1", wipeout_hours: "2", completed: "1", daily_full: "是", reset_time: "04:00",
      future_open: "2026-10-14", future_normal_stage: "", future_hard_stage: "", future_base: "535",
      future_credit: "61110/h", future_battle: "614880/h", future_dust: "102.41/h",
      bare_credit: "66605K", bare_battle: "302M", bare_dust: "13591",
      stage_clear_mode: "只计普通", stage_clear_credit: "15193.2", stage_clear_battle: "45113.6", stage_clear_dust: "370",
      stage_clear_credit2: "2861.3", stage_clear_battle2: "39761", stage_clear_dust2: "880",
      stage_clear_task_credit: "307.5", stage_clear_task_battle: "7464.45", stage_clear_task_dust: "1300",
      cost_credit: "", cost_battle: "", cost_dust: "",
      fixed: JSON.parse(JSON.stringify(DEFAULT_FIXED)),
      ark: "1159", growth: "56", challenger: "1125",
      activities: [],         // 活动收益：[{ template: "small14"|"large21"|"large28", start_date: "YYYY-MM-DD" }]
      monthly_card: "否",     // 月卡：等待期内每日到账 1 个「30 天成长补给箱」（默认关闭）
      keep_one_box: "否",     // 每种箱子各保留 1 个不开（收藏向；默认关闭）
      challenger_pref: "auto", // 挑战者箱资源选择：auto 自动择优 / battle 战斗数据辑优先 / dust 芯尘优先
      saved_at: "",       // 最近一次「保存当前表单」的日期（YYYY-MM-DD）
      capture_time: "",   // 每日采集时刻（HH:MM）
      collected_before: "是", // 采集前是否已回收基地收益（是/否）
    };
  }

  function loadForm() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var f = JSON.parse(raw);
        state.form = Object.assign(defaultForm(), f);
        // 存档版本迁移：v1（无 _schema / 无 server）一律按国际服口径补齐，只加字段不删字段
        if (SV) SV.migrateForm(state.form);
        // fixed 兼容旧结构
        Object.keys(DEFAULT_FIXED).forEach(function (k) {
          if (!state.form.fixed[k]) state.form.fixed[k] = JSON.parse(JSON.stringify(DEFAULT_FIXED[k]));
        });
        // 推图收益旧口径迁移：命中「37-38 章实测估算」旧默认值的一律视为未自定义，改用官方拆包新默认
        Object.keys(LEGACY_STAGE_CLEAR).forEach(function (k) {
          if (state.form[k] !== undefined && String(state.form[k]) === LEGACY_STAGE_CLEAR[k]) {
            state.form[k] = DEFAULT_STAGE_CLEAR[k];
          }
        });
        state.fresh = false;
        return;
      }
    } catch (e) { /* ignore */ }
    state.form = defaultForm();
    state.fresh = true;      // 全新访客：分服默认值还在数据加载后才好算（见 init）
  }

  function collectForm() {
    var f = state.form;
    /* 分服字段与存档版本：所有落盘路径（本地保存 / 上传云端 / 生成分享码）都从这里过，
       所以在收集时统一盖章，避免某条路径漏写版本号导致云端存下"无版本"数据。 */
    if (SV) {
      f.server = SV.normalizeKey(val("f_server") || f.server);
      f._schema = SV.SCHEMA;
    }
    f.recorded = val("f_recorded"); f.current = val("f_current"); f.target = val("f_target"); f.alternate = val("f_alternate");
    f.normal_stage = val("f_normal_stage"); f.hard_stage = val("f_hard_stage"); f.base = val("f_base"); f.tactics = val("f_tactics");
    f.credit_rate = val("f_credit_rate"); f.battle_rate = val("f_battle_rate"); f.dust_rate = val("f_dust_rate");
    f.wipeouts = val("f_wipeouts"); f.wipeout_hours = val("f_wipeout_hours"); f.completed = val("f_completed");
    f.daily_full = val("f_daily_full"); f.reset_time = val("f_reset_time");
    f.future_open = val("f_future_open"); f.future_normal_stage = val("f_future_normal_stage"); f.future_hard_stage = val("f_future_hard_stage");
    f.future_base = val("f_future_base"); f.future_credit = val("f_future_credit"); f.future_battle = val("f_future_battle"); f.future_dust = val("f_future_dust");
    f.bare_credit = val("f_bare_credit"); f.bare_battle = val("f_bare_battle"); f.bare_dust = val("f_bare_dust");
    f.stage_clear_mode = val("f_stage_mode"); f.stage_clear_credit = val("f_stage_credit"); f.stage_clear_battle = val("f_stage_battle"); f.stage_clear_dust = val("f_stage_dust");
    f.stage_clear_credit2 = val("f_stage_credit2"); f.stage_clear_battle2 = val("f_stage_battle2"); f.stage_clear_dust2 = val("f_stage_dust2");
    f.stage_clear_task_credit = val("f_stage_task_credit"); f.stage_clear_task_battle = val("f_stage_task_battle"); f.stage_clear_task_dust = val("f_stage_task_dust");
    f.cost_credit = val("f_cost_credit"); f.cost_battle = val("f_cost_battle"); f.cost_dust = val("f_cost_dust");
    f.ark = val("f_ark"); f.growth = val("f_growth"); f.challenger = val("f_challenger");
    f.monthly_card = val("f_monthly_card");
    f.keep_one_box = val("f_keep_one_box");
    f.challenger_pref = val("f_challenger_pref");
    f.saved_at = val("f_saved_at");
    f.collected_before = val("f_collected_before");
    syncActivitiesFromRows();
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
    state.form.saved_at = todayLocal();          // 记录最近保存日期
    state.form.capture_time = nowTime();         // 记录采集时刻（内部参数，自动写入）
    setVal("f_saved_at", state.form.saved_at);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.form)); } catch (e) {}
  }

  /* ---------- 计算后自动保存并同步（「开始计算」上方的快捷同步开关，默认开启） ----------
     R47：由「勾选框 + 常驻长文案」改成一个小圆形图标开关，文案只在悬停/聚焦时浮出。
     「快捷同步」= 每次算完自动把当前表单推到云端账号。
     ⚠ 本地保存不受此开关控制：runCalc() 里一直会 saveForm()，开关只管云端上传这一步。
     ⚠ 未登录时静默跳过（不主动弹同步面板），避免每次算完都被打断。 */
  var AUTOSYNC_KEY = "nikke_calc_autosync";
  var autoSyncOn = true;                          // 默认开启
  var AS_TIP_ON  = "已开启：计算后自动保存并同步到云端";
  var AS_TIP_OFF = "已关闭：点一下开启自动保存并同步";

  /* 把状态同步到三个地方：隐藏的原生 checkbox（值）、外层 data-on（样式）、浮出文案（文字） */
  function paintAutoSync() {
    var cb = $("chkAutosync");
    if (cb) cb.checked = autoSyncOn;
    var tog = $("asTog");
    if (!tog) return;
    tog.setAttribute("data-on", autoSyncOn ? "1" : "0");
    var txt = tog.querySelector(".as-tip");
    if (txt) txt.textContent = autoSyncOn ? AS_TIP_ON : AS_TIP_OFF;
  }

  function loadAutoSyncPref() {
    try {
      var v = localStorage.getItem(AUTOSYNC_KEY);
      autoSyncOn = v === null ? true : v === "1"; // 从未选过 → 默认开启
    } catch (e) { autoSyncOn = true; }
    paintAutoSync();
  }

  function bindAutoSync() {
    var cb = $("chkAutosync");
    if (!cb) return;
    paintAutoSync();
    cb.addEventListener("change", function () {
      autoSyncOn = !!cb.checked;
      try { localStorage.setItem(AUTOSYNC_KEY, autoSyncOn ? "1" : "0"); } catch (e) {}
      paintAutoSync();
      tip(autoSyncOn ? "已开启：计算后自动同步" : "已关闭：计算后不再同步");
    });
  }

  function autoSyncAfterCalc() {
    if (!autoSyncOn) return;
    var SY = window.__nikkeSync;
    if (!SY || typeof SY.status !== "function" || typeof SY.quickUpload !== "function") return;
    var st = null;
    try { st = SY.status(); } catch (e) { return; }
    if (!st || !st.loggedIn) return;              // 未登录：仅保存到本机
    try { SY.quickUpload("planner"); } catch (e) {}
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

  /* ---------- 跨设备同步（数据码 / 分享链接） ---------- */
  function shareCodeOf(f) {
    try {
      var json = JSON.stringify(f);
      if (typeof LZString !== "undefined") return LZString.compressToEncodedURIComponent(json);
      return "_" + encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
    } catch (e) { return null; }
  }
  function unshareCode(code) {
    var json = null;
    try { json = typeof LZString !== "undefined" ? LZString.decompressFromEncodedURIComponent(code) : null; } catch (e) { json = null; }
    if (!json && code.charAt(0) === "_") {
      try { json = decodeURIComponent(escape(atob(decodeURIComponent(code.slice(1))))); } catch (e2) { json = null; }
    }
    if (!json) return null;
    try { return JSON.parse(json); } catch (e3) { return null; }
  }
  function copyText(txt) {
    var ta = el("textarea", "", "copy-ghost"); ta.value = txt;
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 999999);
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function renderQR(area, text) {
    area.innerHTML = "";
    if (typeof qrcode !== "function") { area.appendChild(el("div", "（未加载二维码库，请用复制数据码/链接）", "qr-fallback")); return; }
    try {
      var qr = qrcode(0, "L");
      qr.addData(text); qr.make();
      area.innerHTML = qr.createImgTag(6, 2);
    }
    catch (e) { area.appendChild(el("div", "（二维码生成失败，请用复制数据码/链接）", "qr-fallback")); }
  }
  /* 读取模组统计数据（键与 mod_stats.html 的 STORAGE_KEY 一致，同源共享） */
  function getModStatsLS() {
    try {
      var raw = localStorage.getItem("nikke_mod_stats_v3");
      if (!raw || raw === "null") return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function applyFormFromCode(code) {
    var f = unshareCode(code);
    if (!f) return false;
    // 新格式（v2，携带模组统计）：{ v:2, planner, mod_stats }；旧格式为纯 form，兼容不变
    var planner = (f && f.v === 2 && f.planner !== undefined) ? f.planner : f;
    state.form = Object.assign(defaultForm(), planner);
    // 分享码同样要过版本迁移：老链接里没有 server 字段，按国际服口径补齐
    if (SV) SV.migrateForm(state.form);
    Object.keys(LEGACY_STAGE_CLEAR).forEach(function (k) {
      if (state.form[k] !== undefined && String(state.form[k]) === LEGACY_STAGE_CLEAR[k]) {
        state.form[k] = DEFAULT_STAGE_CLEAR[k];
      }
    });
    Object.keys(DEFAULT_FIXED).forEach(function (k) {
      if (!state.form.fixed[k]) state.form.fixed[k] = JSON.parse(JSON.stringify(DEFAULT_FIXED[k]));
    });
    if (f && f.v === 2 && f.mod_stats) {
      try { localStorage.setItem("nikke_mod_stats_v3", JSON.stringify(f.mod_stats)); } catch (e) {}
      // 模组统计 iframe 已挂载则刷新，让恢复的数据立即可见
      var mf = document.getElementById("modStatsFrame");
      if (mf && mf.contentWindow) { try { mf.contentWindow.location.reload(); } catch (e2) {} }
    }
    renderForm();
    try { syncCostFromLevel(); } catch (e) {}
    saveForm();
    return true;
  }
  /* 从 #data= 分享链接恢复并计算（加载时 + hashchange 共用） */
  function restoreFromShareHash() {
    try {
      var hash = decodeURIComponent(location.hash || "");
      if (hash.indexOf("#data=") !== 0) return;
      if (applyFormFromCode(hash.slice(6))) {
        tip("已从链接恢复表单，正在计算…");
        setTimeout(function () { try { calculate(); } catch (e) {} }, 250);
      }
    } catch (e) {}
  }
  function buildShareModal() {
    if (buildShareModal._open) return buildShareModal._open;
    var ov = el("div", "", "modal-overlay");
    var box = el("div", "", "modal");
    var head = el("div", "", "modal-head");
    var closeBtn = el("button", "✕", "modal-close");
    head.appendChild(el("span", "跨设备同步 · 数据码 / 分享链接", "modal-title"));
    head.appendChild(closeBtn);
    var body = el("div", "", "modal-body");

    // ① 生成
    var gen = el("div", "", "share-sec");
    gen.appendChild(el("div", "① 导出：把当前表单压成一段“数据码”，另一台设备粘贴 / 扫码即可恢复。", "share-hint"));
    var genCode = el("textarea", "", "share-code"); genCode.readOnly = true; genCode.placeholder = "点击「生成数据码」";
    gen.appendChild(genCode);
    var row1 = el("div", "", "share-row");
    var genBtn = el("button", "生成数据码", "btn btn-primary");
    var copyCodeBtn = el("button", "复制数据码", "btn");
    row1.appendChild(genBtn); row1.appendChild(copyCodeBtn);
    gen.appendChild(row1);
    var linkEl = el("input", "", "share-link"); linkEl.readOnly = true; linkEl.placeholder = "分享链接（手机打开即自动恢复）";
    var copyLinkBtn = el("button", "复制链接", "btn");
    var row2 = el("div", "", "share-row");
    row2.appendChild(linkEl); row2.appendChild(copyLinkBtn);
    gen.appendChild(row2);
    gen.appendChild(el("div", "② 用手机扫码打开链接，自动恢复并出结果：", "share-hint2"));
    var qrArea = el("div", "", "qr-area");
    gen.appendChild(qrArea);

    // ③ 恢复
    var res = el("div", "", "share-sec");
    res.appendChild(el("div", "③ 恢复：把收到的数据码（或完整链接）粘贴后，点击「填入并应用」。", "share-hint"));
    var resCode = el("textarea", "", "share-code"); resCode.placeholder = "粘贴数据码或含 #data= 的链接";
    res.appendChild(resCode);
    var resRow = el("div", "", "share-row");
    var resSpec = el("select", "", "share-range");
    [["both", "恢复表单 + 自动计算"], ["fill", "仅恢复表单"]].forEach(function (o) {
      var op = new Option(o[1], o[0]);
      if (o[0] === "both") op.selected = true;
      resSpec.appendChild(op);
    });
    var resBtn = el("button", "填入并应用表单", "btn btn-primary");
    resRow.appendChild(resSpec); resRow.appendChild(resBtn);
    res.appendChild(resRow);

    body.appendChild(gen); body.appendChild(res);
    box.appendChild(head); box.appendChild(body);
    ov.appendChild(box); document.body.appendChild(ov);

    function fillShare() {
      collectForm();
      var code = shareCodeOf({ v: 2, planner: state.form, mod_stats: getModStatsLS() });
      if (!code) { genCode.value = "（压缩库未加载，无法生成）"; return; }
      genCode.value = code;
      var link = location.origin + location.pathname + "#data=" + code;
      linkEl.value = link;
      renderQR(qrArea, link);
    }
    function open() { ov.style.display = "flex"; fillShare(); }
    function hide() { ov.style.display = "none"; }
    closeBtn.addEventListener("click", hide);
    ov.addEventListener("click", function (e) { if (e.target === ov) hide(); });
    genBtn.addEventListener("click", function () { fillShare(); tip("已生成，可复制或扫码"); });
    copyCodeBtn.addEventListener("click", function () { if (genCode.value) { copyText(genCode.value); tip("数据码已复制"); } });
    copyLinkBtn.addEventListener("click", function () { if (linkEl.value) { copyText(linkEl.value); tip("链接已复制"); } });
    resBtn.addEventListener("click", function () {
      var v = (resCode.value || "").trim();
      if (!v) { tip("请先粘贴数据码"); return; }
      var i = v.indexOf("#data=");
      var code = i >= 0 ? v.slice(i + 6) : v;
      var pkt = unshareCode(code);
      if (!applyFormFromCode(code)) { tip("数据码无效或已损坏"); return; }
      tip((pkt && pkt.v === 2 && pkt.mod_stats) ? "已恢复表单与模组统计" : "已恢复表单");
      if (resSpec.value === "both") { setTimeout(function () { try { calculate(); } catch (e) {} }, 150); }
      hide();
    });
    buildShareModal._open = { open: open };
    return buildShareModal._open;
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

  /* ---------- 活动收益（可选）：模板由 data/event_templates.json 运行时加载 ---------- */
  function loadEventTemplates() {
    if (!EV) return Promise.resolve();
    return fetch("data/event_templates.json?v=20261024b")
      .then(function (r) { return r.json(); })
      .then(function (d) { EV.setTemplates(d); })
      .catch(function () { EV.setTemplates(null); });
  }

  /* DOM 行 → state.form.activities */
  function syncActivitiesFromRows() {
    var wrap = $("eventRows");
    if (!wrap) return;
    var list = [];
    wrap.querySelectorAll(".event-row").forEach(function (row) {
      var t = row.querySelector(".ev-template"), d = row.querySelector(".ev-start");
      if (t && d && t.value && d.value) list.push({ template: t.value, start_date: d.value });
    });
    state.form.activities = list;
  }

  /* ---------- 活动收益（可选）：行渲染 / 状态列 / 奖励预览 ---------- */
  var EV_DEL_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'
    + '<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke-linecap="round"/></svg>';
  /* 资源图标文件名（与 assets/res_*.webp 对应） */
  var RES_ICON_FILE = { credit: "res_credit.webp", battle_data: "res_battle.webp", core_dust: "res_dust.webp" };
  /* 资源图标目录：跟随页面上实际使用的目录（桌面 assets/、移动版 assets/m/） */
  function resIconDir() {
    var img = document.querySelector(".res-icon");
    var src = img ? (img.getAttribute("src") || "") : "";
    return src ? src.replace(/[^/]*$/, "") : "";
  }
  /* 资源图标 img 标签（目录跟随页面：桌面 assets/、移动 assets/m/）；拿不到目录时返回空串 */
  function resIconHtml(r) {
    var dir = resIconDir(), f = RES_ICON_FILE[r];
    return (dir && f) ? '<img class="res-icon" alt="" src="' + dir + f + '">' : "";
  }
  /* 箱型图标 img 标签
     —— 固定小时箱用 FIXED_BOX_ICON，自选箱用 SELECTABLE_BOX_ICON（挑战者 / 方舟 / 30 天）。
     30 天成长补给箱在桌面是 .jpg、移动版是 .webp（历史素材差异），按目录自动选扩展名。 */
  function boxIconHtml(name) {
    var dir = fixedIconDir();
    if (!dir) return "";
    var f = SELECTABLE_BOX_ICON[name] || FIXED_BOX_ICON[name];
    if (!f) return "";
    if (name === "30天成长补给箱" && dir.indexOf("/m/") < 0) f = f.replace(/\.webp$/, ".jpg");
    return '<img class="box-icon" alt="" src="' + dir + f + '">';
  }
  /* 与「固定小时箱数量」同表形的简易表（表头 + 行，单元格内容原样注入） */
  function simpleTable(headers, rows, cls) {
    var head = "<tr>" + headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
    }).join("");
    return el("table", "<thead>" + head + "</thead><tbody>" + body + "</tbody>", cls || "fixed-table plan");
  }
  /* 两个 YYYY-MM-DD 的日差（a − b），按 UTC 零点解析避免时区偏移 */
  function daysBetweenISO(a, b) {
    var da = new Date(String(a) + "T00:00:00Z").getTime();
    var db = new Date(String(b) + "T00:00:00Z").getTime();
    if (isNaN(da) || isNaN(db)) return null;
    return Math.round((da - db) / 86400000);
  }

  function activityRowEl(a) {
    var row = document.createElement("div");
    row.className = "event-row";
    var sel = document.createElement("select");
    sel.className = "ev-template";
    var tpls = EV ? EV.templateList() : [];
    if (!tpls.length) {
      var o0 = document.createElement("option");
      o0.value = a.template || "large28"; o0.textContent = (a.template || "large28") + "（模板未加载）";
      sel.appendChild(o0);
    }
    tpls.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id;
      /* 标签自带天数（「14天小活动」）时不再追加「（14 天）」，避免重复计数 */
      var hasDays = t.label.indexOf(t.duration + "天") >= 0 || t.label.indexOf(t.duration + " 天") >= 0;
      o.textContent = hasDays ? t.label : (t.label + "（" + t.duration + " 天）");
      if (t.id === a.template) o.selected = true;
      sel.appendChild(o);
    });
    var dt = document.createElement("input");
    dt.type = "date"; dt.className = "ev-start";
    dt.value = a.start_date || "";
    dt.title = "活动开始日期（服务器当日 04:00 起算）";
    // 活动状态（R25）：未开始 / 剩余 N 天 / 已结束 —— 基准日 = 数据日期（与计入区间同基准）
    var st = document.createElement("span");
    st.className = "ev-status";
    st.textContent = "—";
    var del = document.createElement("button");
    del.type = "button"; del.className = "ev-del";
    del.title = "移除该活动"; del.setAttribute("aria-label", "移除该活动");
    del.innerHTML = EV_DEL_SVG;   // 圆形 ghost 按钮 + 细线 ✕（此前是纯文本 ✕ + 内联样式、CSS 里零样式）
    row.appendChild(sel); row.appendChild(dt); row.appendChild(st); row.appendChild(del);
    return row;
  }

  /* 逐行刷新活动状态（按 schedule 的 meta.index 对齐，避免模板缺失时行序错位）
     R56：基准日由「数据日期」改为「今天」—— 玩家要看的是活动在现实中还剩几天。
     旧口径（R25）用数据日期，导致 9/30~10/20 的活动在数据日期 10/16 时显示「剩余 4 天」，
     而当天其实是最后一天，极易误读。计入天数与数据日期挂钩，另有出口：
     预览区「已计入 N 天」+ 本标签的 title（写明活动区间 / 本次计入区间）。 */
  function refreshActivityStatus(sched) {
    var wrap = $("eventRows");
    if (!wrap) return;
    var rows = wrap.querySelectorAll(".event-row");
    var today = todayLocal();
    var byIdx = {};
    ((sched && sched.meta) || []).forEach(function (m) {
      if (m && m.index !== undefined) byIdx[m.index] = m;
    });
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i].querySelector(".ev-status");
      if (!st) continue;
      var m = byIdx[i];
      var cls = "", txt = "—";
      if (!m) { txt = "—"; }
      else if (m.error) { cls = "done"; txt = "⚠ 数据异常"; }
      else if (today < m.start) { txt = "未开始"; }
      else if (today > m.end) { cls = "done"; txt = "已结束"; }
      else {
        var n = daysBetweenISO(m.end, today);
        cls = "on";
        txt = (n === null) ? "进行中" : (n > 0 ? ("剩余 " + n + " 天") : "今天最后一天");
      }
      st.className = "ev-status" + (cls ? " " + cls : "");
      st.textContent = txt;
      st.title = (!m || m.error) ? "" :
        ("活动 " + m.start + " ~ " + m.end + "（按今天 " + today + " 算剩余）；"
          + "本次计入 " + (m.inject_days || 0) + " 天"
          + (m.active ? "（" + m.inject_start + " ~ " + m.inject_end + "）" : ""));
    }
  }

  /* 活动奖励实时预览（R26）：由单行文本改为与「固定小时箱数量」同表形的表格 ——
     资源三行 + 固定箱矩阵（含图标）+ 自选箱清单；与结果区活动段同口径。 */
  function renderEventTotals(box, sched) {
    box.innerHTML = "";
    var t = sched.totals || {};
    var n = sched.dates.length;
    var wrap = el("div", "", "event-preview");
    wrap.appendChild(el("div", "已计入 <b>" + n + "</b> 天（" + sched.dates[0] + " ~ " + sched.dates[n - 1] + "）", "ep-head"));
    var dir = resIconDir();
    var resRows = C.RESOURCES.map(function (r) {
      var f = RES_ICON_FILE[r];
      var icon = (dir && f) ? '<img class="res-icon" alt="" src="' + dir + f + '">' : "";
      return [icon + esc(C.RESOURCE_LABELS[r] || r), fmtNum((t.res && t.res[r]) || 0)];
    });
    wrap.appendChild(simpleTable(["资源", "活动计入"], resRows));
    // 固定小时箱矩阵（行 = 箱类含图标、列 = 24h…1h；0 记作 —），与输入表同表形
    // ⚠ simpleTable 会把每个元素各自包一层 <td>：这里只能给【单元格内容】，
    //    曾经多写一层 <td>…</td> → 浏览器把嵌套 td 提出去，整表右移一列并溢出（2026-10-16 修）
    var frows = FIXED_BOX_ORDER.map(function (nm) {
      var map = (t.fixed && t.fixed[nm]) || {};
      return [boxIconHtml(nm) + esc(nm)].concat(FIXED_BOX_HOURS.map(function (h) {
        var c = map[String(h)] || 0;
        return c > 0 ? "<b>" + c + "</b>" : "—";
      }));
    });
    wrap.appendChild(el("div", "固定小时箱到账（按箱型 × 时长）", "ep-head"));
    wrap.appendChild(simpleTable(["箱子 \\ 小时"].concat(FIXED_BOX_HOURS.map(function (h) { return h + "h"; })), frows));
    // 自选箱清单（含图标）
    var selNames = Object.keys(t.selectable || {}).filter(function (k) { return (t.selectable[k] || 0) > 0; });
    if (selNames.length) {
      var srows = selNames.map(function (k) { return [boxIconHtml(k) + esc(k), String(t.selectable[k])]; });
      wrap.appendChild(el("div", "自选箱到账", "ep-head"));
      wrap.appendChild(simpleTable(["自选箱", "活动计入"], srows));
    }
    wrap.appendChild(el("div", "活动期间的资源与箱子按日计入，并参与开箱顺序与全箱梭哈上限。", "ep-sum"));
    box.appendChild(wrap);
  }

  function renderActivityRows() {
    var wrap = $("eventRows");
    if (!wrap) return;
    wrap.innerHTML = "";
    (state.form.activities || []).forEach(function (a) { wrap.appendChild(activityRowEl(a)); });
    updateActivityTotals();
  }

  /* 表单内实时预览：按当前「数据日期」算各活动的实际计入区间与累计产出 */
  function updateActivityTotals() {
    var box = $("eventTotals");
    if (!box) return;
    syncActivitiesFromRows();
    var acts = state.form.activities || [];
    if (!acts.length) { box.textContent = "未添加活动。"; refreshActivityStatus(null); return; }
    if (!EV || !EV.getTemplates()) { box.textContent = "活动模板加载失败，已按「不计入活动收益」处理，可刷新重试。"; refreshActivityStatus(null); return; }
    var rec = val("f_recorded");
    var t0 = rec ? new Date(rec + "T00:00:00") : new Date();
    var sched;
    try { sched = EV.schedule({ recorded_at: t0, activities: acts }); }
    catch (e) { box.textContent = "活动参数异常：" + e.message; refreshActivityStatus(null); return; }
    refreshActivityStatus(sched);
    if (!sched.dates.length) {
      box.innerHTML = "已计入 <b>0</b> 天：所填活动均已结束（或尚未进入计入区间）。已到手的奖励请直接填进上方箱量。";
      return;
    }
    renderEventTotals(box, sched);
  }

  function renderForm() {
    var f = state.form;
    setVal("f_recorded", f.recorded); setVal("f_current", f.current); setVal("f_target", f.target); setVal("f_alternate", f.alternate);
    setVal("f_saved_at", f.saved_at || "");
    setVal("f_collected_before", f.collected_before || "是");
    setVal("f_server", f.server || "cn");   /* R66：新访客默认国服；老存档仍按存档里的值 */
    paintServerTabs(f.server || "cn");      /* 隐藏 select 改值不会触发重绘，选项卡选中态手动同步 */
    setVal("f_base", f.base); setVal("f_tactics", f.tactics);
    setVal("f_credit_rate", f.credit_rate); setVal("f_battle_rate", f.battle_rate); setVal("f_dust_rate", f.dust_rate);
    setVal("f_wipeouts", f.wipeouts); setVal("f_wipeout_hours", f.wipeout_hours); setVal("f_completed", f.completed);
    setVal("f_daily_full", f.daily_full); setVal("f_reset_time", f.reset_time);
    setVal("f_future_open", f.future_open); setVal("f_future_base", f.future_base);
    setVal("f_future_credit", f.future_credit); setVal("f_future_battle", f.future_battle); setVal("f_future_dust", f.future_dust);
    setVal("f_bare_credit", f.bare_credit); setVal("f_bare_battle", f.bare_battle); setVal("f_bare_dust", f.bare_dust);
    setVal("f_stage_mode", f.stage_clear_mode); setVal("f_stage_credit", f.stage_clear_credit); setVal("f_stage_battle", f.stage_clear_battle); setVal("f_stage_dust", f.stage_clear_dust);
    setVal("f_stage_credit2", f.stage_clear_credit2); setVal("f_stage_battle2", f.stage_clear_battle2); setVal("f_stage_dust2", f.stage_clear_dust2);
    setVal("f_stage_task_credit", f.stage_clear_task_credit); setVal("f_stage_task_battle", f.stage_clear_task_battle); setVal("f_stage_task_dust", f.stage_clear_task_dust);
    setVal("f_cost_credit", f.cost_credit); setVal("f_cost_battle", f.cost_battle); setVal("f_cost_dust", f.cost_dust);
    setVal("f_ark", f.ark); setVal("f_growth", f.growth); setVal("f_challenger", f.challenger);
    setVal("f_monthly_card", f.monthly_card || "否");
    setVal("f_keep_one_box", f.keep_one_box || "否");
    setVal("f_challenger_pref", f.challenger_pref || "auto");
    document.querySelectorAll(".fixed").forEach(function (inp) {
      var label = inp.dataset.label, h = inp.dataset.h;
      inp.value = (f.fixed[label] && f.fixed[label][h] !== undefined) ? f.fixed[label][h] : 0;
    });
    // 章节/关卡下拉
    fillSelect($("f_normal_chapter"), state.normalChapters, chapterOfSection(f.normal_stage) || state.normalChapters[state.normalChapters.length - 1]);
    fillSelect($("f_hard_chapter"), state.hardChapters, chapterOfSection(f.hard_stage) || state.hardChapters[state.hardChapters.length - 1]);
    fillSelect($("f_future_normal_chapter"), state.normalChapters, chapterOfSection(f.future_normal_stage) || state.normalChapters[state.normalChapters.length - 1]);
    fillSelect($("f_future_hard_chapter"), state.hardChapters, chapterOfSection(f.future_hard_stage) || state.hardChapters[state.hardChapters.length - 1]);
    // 下拉里的章节名还原为原始写法（「Chapter N」）—— 章节信息只挂在标题上
    // （曾经把「键 41 · 官方第 42 章『诞生』」写进 option，用户反馈下拉里看着乱，2026-10-16 回退）
    syncStageOptions("normal"); syncStageOptions("hard");
    syncStageOptions("future_normal"); syncStageOptions("future_hard");
    updateStageClearUI();
    syncStageClearFromFuture();
    renderActivityRows();
    // 回填不触发 change：补一次基地联动（手填为准，只在基地为空时自动填推算值）
    syncCurrentBase();
    // 「今天已完成歼灭次数」默认跟随每日次数：回填时按值判定（相等即视为仍跟随，§9.5）
    state.completedAuto = String(parseInt(f.completed, 10) || 0) === String(parseInt(f.wipeouts, 10) || 0);
  }

  function chapterOfSection(section) {
    if (!section) return null;
    return O.chapterOf(section);
  }
  /* 推图收益 / 预计新主线进度 的标题：同时写清「数据键号（= 游戏内关卡前缀）」与「官方章名」
     （R21；2026-10-16 按用户反馈改成短写法「41章·诞生」，官方章号只留在下方 note 里说明）。
     value 仍是 "Chapter N" —— 下游 chapterNum() / targetChapter() 依赖它，不能动。
     注意：标题文字放在 #stageClearTitleText / #futureTitleText 两个 span 里 ——
     legend 里还挂着信息图标，直接改 legend.textContent 会把图标抹掉。 */
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
    // ⚠ 当前值必须**校验仍在新列表内**再沿用 —— 切服/换章后旧值（如 40-1）已不在本服范围内，
    //   直接沿用会被 fillSelect 判为非法而落到「未选择」（R61 修）
    var saved = state.form[kind === "normal" ? "normal_stage" : kind === "hard" ? "hard_stage" : kind === "future_normal" ? "future_normal_stage" : "future_hard_stage"];
    var cur = stSel.value;
    var selected = (cur && opts.indexOf(cur) >= 0) ? cur
      : (saved && opts.indexOf(saved) >= 0 ? saved : "未选择");
    fillSelect(stSel, ["未选择"].concat(opts), selected);
  }

  /* ---------- 分服：国际服 / 国服 ----------
     R63（2026-10-26）：**关卡选择器统一按国际服官方表，两服不再分叉。**
     曾据国服 sd.bin 缓存判定「国服 33 章 / 基地上限 433」，但国服实际已到 40 章 ——
     那份缓存是过期快照，已废止。国际服最超前（49 章 / 各 1,787 关 / 基地上限 Lv712），
     统一按国际服表对所有服都安全，国服玩家选到自己实际进度即可。
     「服务器」选择器保留，仅用于存档归属标注与两服差异登记，不再截断关卡、不改基地上限。
     ⚠ 切服**不重置其它字段**（资源、箱子、活动都不受影响）。 */
  /* R63：serverProfile / serverName 已无调用者（超上限提示不再带服务器名），一并移除 */
  function baseCap() { return SV ? SV.cap() : 712; }
  function serverMaxChapter() { return SV ? SV.maxChapter() : 48; }

  /* 按当前服务器重建「章节 → 关卡」表（R63 后两服档案一致，重建结果相同） */
  function rebuildStageTables() {
    state.normalChapters = O.chapters("normal");
    state.hardChapters = O.chapters("hard");
    state.normalStages = {}; state.hardStages = {};
    state.futureNormalStages = {}; state.futureHardStages = {};
    ["normal", "hard"].forEach(function (mode) {
      var map = mode === "hard" ? state.hardStages : state.normalStages;
      var fmap = mode === "hard" ? state.futureHardStages : state.futureNormalStages;
      var chs = mode === "hard" ? state.hardChapters : state.normalChapters;
      chs.forEach(function (ch) {
        map[ch] = O.stagesInChapter(ch, mode);
        fmap[ch] = map[ch].slice();
      });
    });
  }

  /* 把服务器档案同时灌进 outpost.js（公式按它封顶）与本地章节表 */
  function applyServerRuntime(key) {
    var p = SV.setCurrent(key);
    state.server = p.key;
    state.form.server = p.key;
    /* R63b：incomeScale 是该服基地收益补正系数（两服当前均为 1.0）。
       传进 outpost.js 后由 incomeForLevel 统一应用 —— 将来实测出差偏只改 servers.json 一个数。 */
    if (O && O.setServer) O.setServer({
      key: p.key,
      maxChapter: Number(p.max_chapter),
      cap: SV.capOf(p.key),
      incomeScale: SV.incomeScaleOf(p.key),
    });
    rebuildStageTables();
    return p;
  }

  /* 越界关卡 → 收缩到该服最后一关（读旧存档 / 切服时用）
     R63 后两服都是 Chapter 48，正常情况不会触发；保留用于兜住旧存档里的异常值。
     实现放在 outpost.js（依赖 stage_map，且便于 node 侧直接测） */
  function clampSection(section, mode) {
    return O.clampSection ? O.clampSection(section, mode) : section;
  }

  /* R66：标题行分段选项卡的选中态。
     选项卡只是门面 —— 真值一直在隐藏的 #f_server 上（存档 / 云端 / 分享码 / 账单口径读的都是它），
     所以这里只改 class，不碰 state。 */
  function paintServerTabs(key) {
    var k = SV ? SV.normalizeKey(key) : (key === "cn" ? "cn" : "intl");
    document.querySelectorAll(".srv-tab").forEach(function (b) {
      var on = b.getAttribute("data-srv") === k;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* 用户切换服务器：先收表单（不能吞掉正在输入的数据），再收敛越界值，最后统一重绘。
     R66：用户要求切服不再弹 toast —— 反馈交给「关卡进度」标题行选项卡的选中态，
     收敛的只是越界关卡（R63 后两服关卡表一致，通常根本不会触发）。 */
  function applyServerSwitch(key) {
    if (!SV) return;
    var target = SV.normalizeKey(key);
    if (target === state.server) return;
    collectForm();
    var p = applyServerRuntime(target);
    var baseClamped = false;

    [["normal_stage", "normal"],
     ["hard_stage", "hard"],
     ["future_normal_stage", "normal"],
     ["future_hard_stage", "hard"]].forEach(function (it) {
      var nv = clampSection(state.form[it[0]], it[1]);
      if (nv !== state.form[it[0]]) state.form[it[0]] = nv;
    });

    var cap = SV.capOf(p.key);
    var b = parseInt(state.form.base, 10);
    if (b && b > cap) { state.form.base = String(cap); baseClamped = true; }
    var fb = parseInt(state.form.future_base, 10);
    if (fb && fb > cap) state.form.future_base = String(cap);

    renderForm();
    if (baseClamped) syncIncomeFromBase();
    syncCurrentBase();
    syncFutureBase();
    saveForm();
  }

  /* 新访客：默认基地等级若超出当前服上限则压回上限
     R63 后两服上限同为 Lv712、表单预设 518 < 712，故实际不再触发；
     保留是为兜住将来档案变化（或分享链接带进超限值）。 */
  function applyServerDefaults() {
    if (!SV) return;
    var p = SV.current();
    var cap = SV.capOf(p.key);
    if (parseInt(state.form.base, 10) > cap) {
      state.form.base = String(cap);
      setVal("f_base", cap);
      syncIncomeFromBase();
    }
    if (parseInt(state.form.future_base, 10) > cap) state.form.future_base = String(cap);
  }

  /* ---------- 联动 ---------- */
  /* 关卡进度 → 基地等级推算（官方口径：每通关 5 关 +1，普通 + 困难都计入；按所选服务器封顶） */
  function currentCalculatedBase() {
    var f = collectForm();
    return O.computeBaseLevel(f.normal_stage || null, f.hard_stage || null);
  }
  /* 以手填前哨基地等级为准：仅关卡进度变更（autoFill=true）且基地为空时才自动填推算值；
     手填路径只提示推算参考，不覆盖、不打断输入。
     ⚠ 口径类长句（推算公式、国服偏差、与推算值一致的解释）已**移入标题后的信息窗**（R07/R08），
       这里只保留「需要用户动作」的两类短提示：未填 → 点按钮采用；手填值与推算值不一致 → 提示两者。 */
  function syncCurrentBase(autoFill) {
    var level = currentCalculatedBase();
    var hint = $("baseHint");
    var btn = $("btnAdoptBase");
    var cur = parseInt(val("f_base"), 10) || 0;
    var cap = baseCap();
    function showBtn(lv) {
      if (btn) { btn.style.display = ""; btn.textContent = "采用推算值 lv." + lv; }
    }
    function setHint(t) { if (hint) hint.textContent = t || ""; }
    /* 超出上限是硬错误：该等级在游戏里不存在，收益不能按它索引 —— 优先级高于其它所有提示。
       R63：两服上限已统一，文案不再带服务器名（否则会让玩家误以为国服上限更低）。 */
    if (cur > cap) {
      var prof = SV ? SV.current() : null;
      var cnt = prof ? Number(prof.normal_stages) || 0 : 0;
      setHint("⚠ 基地等级上限为 Lv" + cap + (cnt
        ? "（满进度 " + cnt.toLocaleString("en-US") + "×2 关 ÷ 5 + 1）"
        : "") + "，你填的 lv." + cur + " 在游戏内不存在。请核对后再填；超上限时不自动带出收益。");
      if (level) showBtn(level);
      return;
    }
    if (!level) {
      setHint("");
      if (btn) btn.style.display = "none";
      return;
    }
    if (!cur && autoFill) {
      setVal("f_base", level);
      syncIncomeFromBase();
      setHint("已按关卡进度自动填入推算值 lv." + level + "，建议核对游戏内实际等级后手填修正。");
      if (btn) btn.style.display = "none";
    } else if (!cur) {
      setHint("基地等级未填：点下方按钮采用关卡进度推算值 lv." + level + "，或手填游戏内实际等级。");
      showBtn(level);
    } else if (cur === level) {
      setHint("");
      if (btn) btn.style.display = "none";
    } else {
      setHint("以手填 lv." + cur + " 为准；关卡进度推算值为 lv." + level + "。");
      showBtn(level);
    }
  }

  /* 手填基地防御等级 → 收益自动刷新（收益表按基地等级索引，与同步器等级无游戏内联动） */
  function syncIncomeFromBase() {
    var base = parseInt(val("f_base"), 10);
    if (!base) return;
    /* 超出该服上限的等级不存在，不能用它去查收益表（否则会把国服玩家的收益整体算高） */
    if (base > baseCap()) return;
    var income = O.incomeForLevel(base, val("f_tactics") !== "否");
    if (income) {
      setVal("f_credit_rate", Math.round(income.credit) + "/h");
      setVal("f_battle_rate", Math.round(income.battle_data) + "/h");
      setVal("f_dust_rate", income.core_dust.toFixed(2) + "/h");
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
    var ch = val("f_hard_chapter");
    if (!ch) return;
    // 预计困难主线关卡默认跟随「关卡进度 - 困难主线关卡」当前选择（含 Chapter 0 等低位章节）
    setVal("f_future_hard_chapter", ch);
    syncStageOptions("future_hard");
    setVal("f_future_hard_stage", lastStage("hard", ch));
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

  /* 推图收益字段是否仍为「自动带出」状态：记录上次自动填的值，用户手改后即不再覆盖 */
  var stageAutoFilled = {};

  /* ---------- 推图收益口径（R41，2026-10-16 用户口径） ----------
     ① 新开放范围：一次主线更新通常**同时开放 2 章**（例：当前开到键 40 → 新开键 41、键 42）。
        最高新章 = 「预计普通主线关卡」所选章节；范围 = [最高新章 − 1, 最高新章]（取不到则自动收缩）。
        推图收益 = 范围内**每一章**的关卡奖励（credit/battle/dust）+ 主线任务奖励 的合计。
     ② 困难收益 = 双条件 ——「计入范围」须选「普通+困难」，**且**「预计困难主线关卡」必须已到达
        范围内每一章。困难难度通常较高，新主线开放时困难进度一般跟不上；未到达则**不计入**，
        并在 note 里红字注明（用户 2026-10-16 明确）。
     ③ 困难进度**不跟随普通 +2**（用户 2026-10-16 明确：困难难度高，进度一般不需要同步 +2）。 */
  var NEW_CHAPTERS_PER_UPDATE = 2;

  function newChapterKeys(hiKey, entries) {
    var hi = parseInt(hiKey, 10);
    var out = [];
    if (!isFinite(hi)) return out;
    for (var k = hi; k > hi - NEW_CHAPTERS_PER_UPDATE && k >= 0; k--) {
      if (entries[String(k)]) out.unshift(String(k));
    }
    return out;
  }

  function sumChapterField(entries, keys, field) {
    var t = 0;
    keys.forEach(function (k) {
      var v = entries[k] ? entries[k][field] : undefined;
      if (typeof v === "number" && isFinite(v)) t += v;
    });
    return t;
  }

  /* 一次性算准「新开放范围 + 困难是否计入」——表单自动带出与 buildSnapshot 共用同一份判定，
     避免出现「界面说未计入、计算却算了」的口径不一致。 */
  function stageClearModel() {
    var chSel = val("f_future_normal_chapter");
    if (!chSel) return { ok: false, n: null };
    var n = chapterNum(chSel);
    var entries = state.stageClearEntries || {};
    var keys = Object.keys(entries);
    if (!keys.length) return { ok: false, n: n };
    var maxKey = keys.reduce(function (a, b) { return parseInt(a, 10) >= parseInt(b, 10) ? a : b; });
    var fallbackKey = entries[String(state.stageClearFallback)] ? String(state.stageClearFallback) : maxKey;
    var usedKey = entries[String(n)] ? String(n) : fallbackKey;
    var rangeKeys = newChapterKeys(usedKey, entries);
    if (!rangeKeys.length) rangeKeys = [usedKey];
    var mode = val("f_stage_mode") || "只计普通";
    var hardProgress = chapterNum(val("f_future_hard_chapter"));
    var hardKeys = rangeKeys.filter(function (k) { return hardProgress >= parseInt(k, 10); });
    return {
      ok: true, n: n, usedKey: usedKey, entry: entries[usedKey] || {}, rangeKeys: rangeKeys,
      mode: mode, hardProgress: hardProgress, hardKeys: hardKeys,
      hardOn: mode === "普通+困难" && hardKeys.length === rangeKeys.length,
    };
  }

  function syncStageClearFromFuture() {
    var m = stageClearModel();
    if (!m.ok) { updateStageClearNote(m); return; }
    var entries = state.stageClearEntries || {}, rk = m.rangeKeys;
    var map = {
      f_stage_credit: sumChapterField(entries, rk, "credit"),
      f_stage_battle: sumChapterField(entries, rk, "battle"),
      f_stage_dust: sumChapterField(entries, rk, "dust"),
      f_stage_credit2: m.hardOn ? sumChapterField(entries, rk, "credit_hard") : 0,
      f_stage_battle2: m.hardOn ? sumChapterField(entries, rk, "battle_hard") : 0,
      f_stage_dust2: m.hardOn ? sumChapterField(entries, rk, "dust_hard") : 0,
      f_stage_task_credit: sumChapterField(entries, rk, "task_credit"),
      f_stage_task_battle: sumChapterField(entries, rk, "task_battle"),
      f_stage_task_dust: sumChapterField(entries, rk, "task_dust"),
    };
    Object.keys(map).forEach(function (id) {
      var key = id.replace("f_stage_", "stage_clear_");
      var cur = val(id);
      var next = String(map[id]);
      // 可覆盖 = 空 / 等于初始默认 / 仍等于上次自动带出的值（即用户没手动改过）
      var autoable = (cur === "" || cur === undefined || stageAutoFilled[id] === cur || DEFAULT_STAGE_CLEAR[key] === cur);
      if (!autoable) return;
      setVal(id, next);
      stageAutoFilled[id] = next;
    });
    updateStageClearNote(m);
    // note 与「困难行灰显」共用同一份判定 —— 章节/进度变更后必须一起刷新
    updateStageClearUI();
  }

  /* 图例与数据来源说明（随所选章节联动）
     R18/R19/R21：标题只写「数据键号 + 官方章名」，并把文字放进 #stageClearTitleText
     这个 span —— legend 里还挂着信息图标，直接改 legend.textContent 会把图标抹掉。
     数据键 = 官方章号 − 1（见 data/stage_clear_resources.json 的 key_note）：
     键 41 → 官方第 42 章「诞生」，此前标题只显示「第 41 章」，用户看着差一章无从对应。

     R40（2026-10-16 用户反馈，「标题章节信息」收口）：
       · 「预计新主线进度」标题**不再附带任何章节信息**（用户明确：这里不需要添加）；
       · 「预计新主线推图收益」标题改为把**计入范围内的章节全部列出**。

     R41（2026-10-16 用户反馈，「章节号错位」修正）：
       · 旧实现把「预计困难主线关卡」（用户当前困难进度，自动跟随）当成第二个新章，
         于是标题会混进**已经开放过的旧章**（例：当前开到键 40 → 标题成了「40章·选择」、「42章·独一」）；
       · 现改为按**新开放范围**列出：以「预计普通主线关卡」为最高新章、向前取
         NEW_CHAPTERS_PER_UPDATE 章（键 41、键 42），与推图收益实际取数的范围严格一致。 */
  function stageChapterTags(m) {
    if (!m || !m.ok || m.mode === "不计算") return "";
    var entries = state.stageClearEntries || {};
    var labels = m.rangeKeys.map(function (k) {
      var e = entries[k] || {};
      return k + "章" + (e.name ? "·" + e.name : "");
    });
    return labels.map(function (s) { return "「" + s + "」"; }).join("、");
  }

  function updateStageClearNote(m) {
    var title = $("stageClearTitleText") || $("stageClearTitle"), note = $("stageClearNote");
    var pTitle = $("futureTitleText");
    // 「预计新主线进度」：R40 起固定为无章节后缀
    if (pTitle) pTitle.textContent = "预计新主线进度";
    if (!m || !m.ok) {
      if (title) title.textContent = "预计新主线推图收益";
      if (note) note.innerHTML = (m && m.n !== null && m.n !== undefined)
        ? esc("第 " + m.n + " 章暂无官方拆包数据，请手动填写。") : "";
      return;
    }
    var entry = m.entry, usedKey = m.usedKey;
    var same = String(usedKey) === String(m.n);
    var off = entry.official_chapter;
    if (off === undefined || off === null) off = (parseInt(usedKey, 10) || 0) + 1;
    // 标题：短写法「41章·诞生」（41 = 数据键号 = 游戏内关卡前缀，玩家在关卡里看到的就是它）
    if (title) title.textContent = "预计新主线推图收益" + stageChapterTags(m);
    if (note) {
      var body = (same ? "" : "键 " + m.n + " 暂无官方拆包数据（已收录至键 " + maxOf(state.stageClearEntries) + "），暂按键 " + usedKey + "「" + entry.name + "」带出。") +
        "本次新开放 " + m.rangeKeys.length + " 章（键 " + m.rangeKeys.join("、") + "）：推图收益 = 各章关卡奖励 + 主线任务奖励 合计。" +
        "其中最高新章（键 " + usedKey + "「" + entry.name + "」）= 官方第 " + off + " 章：普通 " + entry.n_normal + " 关 / 困难 " + entry.n_hard + " 关，该章主线任务 " + entry.task_count + " 条。";
      var html = esc(body);
      // R41：选了「普通+困难」但困难进度没跟上的红字警示
      if (m.mode === "普通+困难" && !m.hardOn) {
        html += '<span class="stage-warn">⚠ 计入范围虽然选了「普通+困难」，但预计困难通关（键 ' + esc(m.hardProgress) +
          '）尚未到达新开放章节（键 ' + esc(m.rangeKeys.join("、")) + '），<b>困难收益未计入计算结果</b>。</span>';
      }
      note.innerHTML = html;
    }
  }

  function maxOf(entries) {
    var keys = Object.keys(entries || {});
    return keys.length ? keys.reduce(function (a, b) { return parseInt(a, 10) >= parseInt(b, 10) ? a : b; }) : "";
  }

  function updateStageClearUI() {
    var mode = val("f_stage_mode");
    $("stageHardRow").style.display = mode === "普通+困难" ? "" : "none";
    // R41：困难收益未计入（进度没跟上）时把该行灰显，配合 note 里的红字说明
    var hardRow = $("stageHardRow");
    if (hardRow) {
      var m = stageClearModel();
      hardRow.classList.toggle("stage-row-off", mode === "普通+困难" && m.ok === true && m.hardOn === false);
    }
    var tr = $("stageTaskRow");
    if (tr) tr.style.display = mode === "不计算" ? "none" : "";
  }

  function onFormChange() {
    collectForm();
    saveForm();
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
      // 默认按当前同步器等级所在档位直接写入（可手动覆盖）
      setVal("f_cost_credit", fmtK(t.credit));
      setVal("f_cost_battle", fmtK(t.battle_data));
      setVal("f_cost_dust", Math.round(t.core_dust));
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
    if (isMobileShell()) {
      /* 移动版：6 列密集数字在 324px 容器里需横滑 152px 且「段内总消耗」被切，
         改为「每档一段」竖排 —— 零横滑、每项完整可读 */
      html += "<div class='cost-rows'>";
      segments.forEach(function (seg, idx) {
        var tc = seg.tier.credit * seg.count, tb = seg.tier.battle_data * seg.count, td = seg.tier.core_dust * seg.count;
        var segLbl = seg.start + "–" + seg.end + (idx > 0 ? " ⬆" : "");
        html += "<div class='cost-row" + (idx > 0 ? " rise" : "") + "'>"
          + "<div class='cr-head'><b>" + segLbl + "</b><span>" + seg.count + " 级</span></div>"
          + "<div class='cr-line'><span>信用点/级</span><b>" + numFmt(seg.tier.credit) + "</b></div>"
          + "<div class='cr-line'><span>战斗数据/级</span><b>" + numFmt(seg.tier.battle_data) + "</b></div>"
          + "<div class='cr-line'><span>红球/级</span><b>" + numFmt(seg.tier.core_dust) + "</b></div>"
          + "<div class='cr-line cr-total'><span>段内总消耗</span><b>"
          + numFmt(tc) + " / " + numFmt(tb) + " / " + numFmt(td) + "</b></div>"
          + "</div>";
      });
      html += "</div>";
    } else {
      html += "<table><tr><th>等级段</th><th>信用点/级</th><th>战斗数据/级</th><th>红球/级</th><th>级数</th><th>段内总消耗（信用点/战斗数据/红球）</th></tr>";
      segments.forEach(function (seg, idx) {
        var rise = idx > 0 ? " class='rise'" : "";
        var tc = seg.tier.credit * seg.count, tb = seg.tier.battle_data * seg.count, td = seg.tier.core_dust * seg.count;
        var segLbl = seg.start + "–" + seg.end + (idx > 0 ? " ⬆" : "");
        var totalTxt = numFmt(tc) + " / " + numFmt(tb) + " / " + numFmt(td);
        html += "<tr" + rise + "><td>" + segLbl + "</td><td>" + numFmt(seg.tier.credit) + "</td><td>" + numFmt(seg.tier.battle_data) + "</td><td>" + numFmt(seg.tier.core_dust) + "</td><td>" + seg.count + "</td><td>" + totalTxt + "</td></tr>";
      });
      html += "</table>";
    }
    html += "<p class='hint'>按内置阶梯表（每 50 级一档）估算；⬆ 表示该段消耗相比上一档提升。手动填写的消耗仅覆盖当前等级所在档位，跨入更高档仍按内置阶梯表逐级递增；三项都留空时按内置阶梯表计算。</p></div>";
    wrap.innerHTML = html;
  }

  /* ---------- 构建 snapshot + 计算 ---------- */
  function buildSnapshot() {
    var f = collectForm();
    var income = { credit: C.parseRate(f.credit_rate), battle_data: C.parseRate(f.battle_rate), core_dust: C.parseRate(f.dust_rate) };
    var futureIncome = { credit: C.parseRate(f.future_credit), battle_data: C.parseRate(f.future_battle), core_dust: C.parseRate(f.future_dust) };
    var extra = { credit: 0, battle_data: 0, core_dust: 0 };
    var stage = { credit: 0, battle_data: 0, core_dust: 0 };
    if (f.stage_clear_mode !== "不计算") {
      // 推图 / 主线任务数据以 **K** 记信用点与战斗数据（与 data/stage_clear_resources.json 一致），
      // 内部口径是绝对值，故此处 ×1000；红球（芯尘）单位为「个」，不换算。
      var K = 1000;
      stage.credit = C.num(f.stage_clear_credit, 0) * K;
      stage.battle_data = C.num(f.stage_clear_battle, 0) * K;
      stage.core_dust = C.num(f.stage_clear_dust, 0);
      if (f.stage_clear_mode === "普通+困难") {
        // R41：困难收益还要求「预计困难通关已到达全部新开放章节」——
        // 判定与表单自动带出同源（stageClearModel），界面红字说未计入，计算就真的不计入。
        var mSC = stageClearModel();
        if (!mSC.ok || mSC.hardOn === true) {
          stage.credit += C.num(f.stage_clear_credit2, 0) * K;
          stage.battle_data += C.num(f.stage_clear_battle2, 0) * K;
          stage.core_dust += C.num(f.stage_clear_dust2, 0);
        }
      }
      // 该章主线任务奖励（与普通/困难无关：只要「计入范围」不是「不计算」就并入）
      stage.credit += C.num(f.stage_clear_task_credit, 0) * K;
      stage.battle_data += C.num(f.stage_clear_task_battle, 0) * K;
      stage.core_dust += C.num(f.stage_clear_task_dust, 0);
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
      var curLvl = parseInt(f.current, 10) || 0;
      var t = tierValue(COST_TIERS, curLvl);
      perLevel.credit = f.cost_credit ? C.num(f.cost_credit, 0) : (t ? t.credit : 0);
      perLevel.battle_data = f.cost_battle ? C.num(f.cost_battle, 0) : (t ? t.battle_data : 0);
      perLevel.core_dust = f.cost_dust ? C.num(f.cost_dust, 0) : (t ? t.core_dust : 0);
      // 手填仅覆盖当前等级所在档位（[档起点, 下一档起点)）；跨入更高档仍按内置档位表逐级递增，与游戏阶梯判定一致
      var at = tierValueAt(COST_TIERS, curLvl);
      if (at) {
        perLevel.overrideStart = at.level;
        perLevel.overrideEnd = Infinity;
        for (var oi = 0; oi < COST_TIERS.length; oi++) {
          if (COST_TIERS[oi].level > curLvl) { perLevel.overrideEnd = COST_TIERS[oi].level; break; }
        }
      }
    }
    var upgradeCost = {
      per_level: perLevel,
      range_start: null, range_end: null, range_total: null,
      tiers: COST_TIERS,
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
      // 活动收益（按日期计入；空数组 = 不开启本功能，行为与改动前一致）
      activities: (f.activities || []).map(function (a) { return { template: a.template, start_date: a.start_date }; }),
      // 月卡（默认否）：等待期内每日 1 个「30 天成长补给箱」并入开放日箱量
      monthly_card: f.monthly_card === "是",
      // 每种箱子各保留 1 个不开：仅影响计算（由 calculate() 生成保留后的快照），表单仍显示原始库存
      keep_one_box: f.keep_one_box === "是",
      // 挑战者成长宝箱的资源选择偏好（auto / battle / dust）：随快照传给求解器，默认 auto
      challenger_pref: f.challenger_pref || "auto",
    };
    return snap;
  }

  /* 「每种箱保留 1 个」的实现已移到 js/scenarios.js（S.applyKeepOneBox），以便 node 侧可直接测试 */

  /* ---------- 结果渲染 ---------- */
  function el(tag, html, cls) {
    var d = document.createElement(tag);
    if (html !== undefined) d.innerHTML = html;
    if (cls) d.className = cls;
    return d;
  }
  /* 是否跑在移动版外壳里（mobile.html 的 <body class="m-body">）
     仅用于「同一份数据、两种呈现形态」：桌面站 index.html 的 body 无该类，
     因此窄屏打开桌面页时行为与样式完全不变。 */
  function isMobileShell() {
    return !!(document.body && document.body.classList && document.body.classList.contains("m-body"));
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

  /* ---------- 信息窗（InfoTip） ----------
     全站此前不存在任何 popover / tooltip 机制，「说明」一律是常驻可见的 p.hint。
     本组件把「原理解释类」文案从页面收进图标后的浮层，点击才展开。
       · HTML 端只写 <button type="button" class="info-tip" data-tip="tip-xxx" aria-label="查看说明" aria-expanded="false"></button>
       · 图标（内联 SVG）与说明正文都由本文件注入 —— **说明文本集中在本表**，
         避免 index.html / mobile.html 两端文案漂移（两端共用同一份 app.js）。
     交互：点图标展开 / 再点收起 / 点面板外收起 / Esc 收起 / 同一时刻只允许一个面板。
     ⚠ 图标可能位于 <legend> 内，而 legend 在移动端绑了「点击折叠整段」的监听（setupMobileForm），
        所以必须 stopPropagation —— 否则点图标会连带把整个分组折叠起来。 */
  var INFO_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="6.4"/><path d="M8 7.4v4" stroke-linecap="round"/>'
    + '<circle cx="8" cy="4.9" r="0.95" fill="currentColor" stroke="none"/></svg>';
  var INFO_TEXTS = {
    "tip-base": {
      title: "当前基地等级",
      html: "手填游戏内实际显示的<b>前哨基地防御等级</b>，收益表按此等级索引（与同步器等级在游戏内无联动）。"
        + "也可选下方「关卡进度」自动推算后点「采用推算值」。<br>"
        + "推算口径（已与国际服 nikkeoutpost、国服 NikkeCalc 两站核对一致）：<br>"
        + "<b>计数 = (普通关 − 2-12) + 困难关 + 1</b>，两个难度都计入，"
        + "<b>基地等级 = 计数 ÷ 5 向下取整 + 1</b>。<br>"
        + "前哨基地要到主线 <b>2-12</b> 通关才解锁，所以普通 0-1~2-11 这 18 关<b>不计入</b>；"
        + "困难侧则从第一关起就计入。<br>"
        + "上限：普通/困难各 1,787 关 → <b>Lv712</b>（国际服与国服共用同一套关卡表）。"
        + "超过上限的等级在游戏内不存在，计算器不会按它带出收益。"
    },
    "tip-stage": {
      title: "关卡进度",
      html: "推算口径：基地等级按「(普通关 − 2-12) + 困难关 + 1」每满 5 关升 1 级，"
        + "普通侧从 2-12（前哨基地解锁关）起算，困难侧从 0-1 起算。<br>"
        + "关卡下拉<b>两服共用同一套（Chapter 0~48）</b>，按你实际打到的关卡选即可 —— "
        + "国服进度比国际服略靠后，选到自己当前章节就行，不会因为选了后面的章而被截断。"
    },
    "tip-stageclear": {
      title: "预计新主线推图收益",
      html: "数据来源：官方拆包 CampaignStageTable（国际服 149，47 章 / 3,800 关）+ MainQuestTable（583 条主线任务），按章汇总。"
        + "<b>信用点 / 战斗数据单位为 K</b>（1K = 1000），红球为个；免费珠宝、铸模、企业装备、双模组高级增强器等不计。<br>"
        + "<b>若会连推多章，请把各章数值相加后填入。</b>"
    },
    "tip-event": {
      title: "活动收益",
      html: "⚠ 请按<b>当前实际持有量</b>填写上方箱数与现有资源（已领取的活动奖励已包含在内）；"
        + "本功能只补充<b>数据日期之后</b>剩余天数的活动产出，不会重复计入。"
    },
    "tip-target": {
      title: "达成目标方案",
      html: "以你填写的目标等级为基准：<b>可行时</b>直接给出开箱方案；<b>不可行时</b>给出"
        + "「按最优均衡分配开完全部箱子后仍缺的资源量」，并按该资源的 <b>1H 箱产量</b>折算。<br>"
        + "缺口<b>只列还缺的资源</b>（已足够的项不显示）；各项共用同一批自选箱、<b>需同时补足</b>"
        + "（不是各自独立可补）；标「瓶颈」的一项是缺口最大、最难补的。"
        + "<br>现状口径<b>不含</b>新主线推图收益；开放日口径含推图收益 + 等待期自然积累 + 新基地收益。"
    },
    "tip-card-1": {
      title: "① 当前同步器等级",
      html: "当前等级（N）；仅用现有资源（不含新主线推图收益 · 不开箱）还可升到 M。"
    },
    "tip-card-2": {
      title: "② 仅使用固定小时箱",
      html: "只开固定小时箱能达到的等级（已计入成长套组）。"
    },
    "tip-card-3": {
      title: "③ 全箱梭哈",
      html: "按开箱顺序（挑战者成长宝箱全开 → 固定小时箱 → 自选箱）全部消耗能达到的等级。"
        + "<br><b>挑战者成长宝箱</b>的二选一选项由「其他」段的「挑战者箱资源选择」决定："
        + "默认「自动择优」按当前目标与库存挑更划算的一项，两项等价时优先芯尘（红球每小时产出最少，长期最稀缺）；"
        + "也可手动强制为「战斗数据辑优先」或「芯尘优先」。"
    },
    "tip-card-4": {
      title: "④ 自然升级（不开箱）",
      html: "完全不开箱，靠每日收益与一举歼灭自然增长，N 天到目标 T。"
    },
    "tip-misc": {
      title: "其他",
      html: "<b>保留箱</b>：每种箱子各保留 1 个不开（固定小时箱按「箱型 × 档位」逐格、方舟 / 30天 / 挑战者按名称），"
        + "全箱梭哈上限与开箱方案都按保留后的数量计算。<br>"
        + "<b>月卡</b>：开启后把「数据日期 → 新主线开放日」之间到账的 30 天成长补给箱一并计入开放日口径。<br>"
        + "<b>挑战者箱资源选择</b>：自动择优会按当前目标与库存挑更划算的一项；两项对当前目标等价时优先芯尘"
        + "（红球每小时产出最少，长期最稀缺）。"
    },
    "tip-block3": {
      title: "整合结论口径",
      html: "全箱梭哈 = 挑战者成长宝箱全开 + 固定小时箱与自选箱按开箱顺序开启至无法再升 1 级；"
        + "结果区自选箱分配由引擎按资源最优计算（含各资源数量），可照表逐箱开启。"
        + "「使用」即需开启的箱子数；「保留」为全开也无法再多升 1 级、故按其不开启计的余量。<br>"
        + "<b>① 提前升</b>：赚 = 提前升级能提前拿到的主线推图收益（折算等级）；"
        + "「等到开放日再开箱可多赚」= <b>同一批箱子按更高基地收益折算能多升的级数</b>（也就是提前开箱要放弃的部分）。"
        + "注意这与上方「新主线开放后升级」里的 +N 级<b>不是同一个数</b>：那个 +N 还包含"
        + "「等待期到账资源」与「等待期多攒出来的箱子」，那两部分跟你今天开不开箱无关，"
        + "因此不计入提前开箱要放弃的部分。<br>"
        + "<b>② 推图节点</b>：情景 = 今天先开一部分箱子把同步器升上去 → 借此把困难推图推进到"
        + "「基地红球收益 +2/h」→ 从那天到新主线开放日这段多累积的收益（红球收益增量 + 这段困难推图"
        + "的一次性红球），对比「主线开放日那天再开箱」。放弃侧同样折算成「等开放日再开箱可多赚」的级数，"
        + "按「全箱梭哈多升 1 级所需 1H 箱数」折合。<br>"
        + "⚠ 一次性红球按<b>章汇总</b>近似（仓库只有按章数据、无逐关红球节点表），红球收益增量由"
        + "基地收益表逐级反查；两者都是近似值，最终请自行判定。"
    }
  };
  var _openTip = null;

  function closeInfoPanel() {
    if (!_openTip) return;
    var o = _openTip; _openTip = null;
    if (o.panel && o.panel.parentNode) o.panel.parentNode.removeChild(o.panel);
    if (o.btn) o.btn.setAttribute("aria-expanded", "false");
  }

  function openInfoPanel(btn) {
    var def = INFO_TEXTS[btn.getAttribute("data-tip")] || { title: "", html: "" };
    // 带动态数字的说明（如结果区四卡）在生成按钮时写进 data-tip-html，覆盖静态文案
    var ov = btn.getAttribute("data-tip-html");
    if (ov) def = { title: def.title, html: ov };
    var host = btn.parentNode;
    var panel = el("div", "", "info-panel");
    panel.setAttribute("role", "dialog");
    panel.innerHTML = '<button type="button" class="ip-close" aria-label="关闭">✕</button>'
      + (def.title ? '<div class="ip-title">' + esc(def.title) + "</div>" : "")
      + '<div class="ip-body">' + (def.html || "") + "</div>";
    host.appendChild(panel);
    _openTip = { btn: btn, panel: panel };
    btn.setAttribute("aria-expanded", "true");
    var cb = panel.querySelector(".ip-close");
    if (cb) cb.addEventListener("click", function (e) { e.stopPropagation(); closeInfoPanel(); });
  }

  /* 幂等：可在每次渲染后重复调用（只绑未绑过的节点） */
  function initInfoTips(root) {
    var list = (root || document).querySelectorAll(".info-tip[data-tip]");
    for (var i = 0; i < list.length; i++) {
      var btn = list[i];
      if (btn._tipBound) continue;
      btn._tipBound = true;
      if (!btn.firstChild) btn.innerHTML = INFO_SVG;
      btn.addEventListener("click", function (e) {
        // legend 的折叠监听挂在 legend 的冒泡阶段 —— 必须阻止冒泡，否则点图标会连整段一起折叠
        e.stopPropagation();
        e.preventDefault();
        var self = this;
        if (_openTip && _openTip.btn === self) { closeInfoPanel(); return; }
        closeInfoPanel();
        openInfoPanel(self);
      });
    }
  }
  /* 点面板外关闭（捕获阶段，先于目标元素的 handler） */
  document.addEventListener("click", function (e) {
    if (!_openTip) return;
    if (_openTip.btn && _openTip.btn.contains(e.target)) return;  // 图标自身 → 交给它的 handler toggle
    closeInfoPanel();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Esc") closeInfoPanel();
  });

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

  /* R31：从方案里读回「挑战者箱实际选中的资源项」文字（如「芯尘」）。
     引擎返回的 choices 里就写着实际分配，无需另猜。返回 "" 表示无挑战者箱条目。
     ⚠ 入参两种形态都要接：
       · 数组       —— 逐箱分配数组（plan.selectable）
       · 方案对象   —— optimizeSelectableForTarget / planForTarget 的返回值（含 .selectable 数组）
     历史上这里只接数组，调用方误传方案对象 → forEach 抛错 → calculate() 捕获后弹 alert，
     无头验证时表现为「死循环」（2026-10-16 踩坑）。 */
  function chalChoiceText(planArr) {
    var out = "";
    var arr = planArr;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.selectable)) arr = arr.selectable;
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (p) {
      if (out || !p || !p.name || p.name.indexOf("挑战") < 0) return;
      var ks = Object.keys(p.choices || {}).filter(function (k) { return (p.choices[k] || 0) > 0; });
      if (ks.length) out = ks.sort().join(" + ");
    });
    return out;
  }
  /* R31：偏好来源的人话说明（auto / 手动指定） */
  function chalPrefNote(snap) {
    var pref = (snap && snap.challenger_pref) || "auto";
    if (pref === "battle") return "手动指定：战斗数据辑优先";
    if (pref === "dust") return "手动指定：芯尘优先";
    return "已按最优项自动选择";
  }

  /* 开箱方案文本（开箱顺序：①挑战者全开 → ②固定箱按需 → ③自选箱分配；固定箱明细见表格） */
  function boxPlanText(plan, reached) {
    // 目标已达成或无开箱方案：显示「无需开箱」+ 原因
    if (!plan || !plan.length || plan.every(function (p) { return !p.used; })) {
      return reached ? "无需开箱（资源已足够）" : "无需开箱（等待自然增长）";
    }
    var hasChal = plan.some(function (p) { return p.name.indexOf("挑战") >= 0 && p.used > 0; });
    // R31：挑战者箱不再写死「全开」而不提选项 —— 明确写出实际选中的那一项
    var chalPick = chalChoiceText(plan);
    var parts = hasChal ? ["挑战者成长宝箱全开" + (chalPick ? "（选【" + chalPick + "】）" : "")] : [];
    plan.forEach(function (p) {
      if (p.used > 0 && p.name.indexOf("挑战") < 0) {
        var det = Object.keys(p.choices || {}).filter(function (k) { return p.choices[k]; })
          .map(function (k) { return k + " x" + p.choices[k]; }).join("+");
        parts.push(p.name + " x" + p.used + (det ? "（" + det + "）" : ""));
        }
      });
    return parts.length ? parts.join("；") : "无需开箱（资源已足够）";
  }

  /* 开箱达成目标统计方案：开箱顺序 ①挑战者成长宝箱全开 → ②固定小时箱按需 → ③方舟/30天箱按需
     层级判断：①裸资源够 ②+挑战者够 ③+固定箱按需够 ④+自选箱够 ⑤梭哈不够
     口径（2026-10-14 统一）：**推图收益只在未来（开放日）口径计入，且只计一次**；
     现状口径一律不含（铁律 5）。此前 boxes.js 内部又叠了一次 → ×2，导致「达成目标方案」
     凭空多出一份推图收益、漏开信用点箱。 */
  function planByLevels(result, snap, tgt, future) {
    var pr = result.per_resource;
    var prefix = future ? "future_" : "";
    function minL(p) { return Math.min(p.credit, p.battle_data, p.core_dust); }
    var bare = pr[prefix + "bare"], fixed = pr[prefix + "fixed"];
    var maxLv = future ? result.future_main_story.result.level : result.selectable.level;
    var immediate = future ? ("开放日即达（" + localDateStr(result.future_main_story.open_at) + "）") : "立即可达（今天）";
    var income = future ? (snap.future_income_per_hour || snap.income_per_hour) : snap.income_per_hour;
    // 口径快照：未来 = 开放日快照（含等待期自然积累 / 活动箱 / 月卡箱）；现状 = 表单快照
    var s2 = (future && result.future_main_story.projected_snapshot) ? result.future_main_story.projected_snapshot : snap;
    // 完整底盘：现状=裸资源（不含推图收益）；未来=裸资源+等待期积累+推图收益 ×1
    var baseRes = future ? C.addRes(s2.bare_resources, snap.stage_clear_resources || {}) : s2.bare_resources;
    var steps = Math.max(0, tgt - snap.current_sync_level);
    /* R38（2026-10-16 重构）：配平诊断口径
       用户已判定旧版「单项资源上限」思路不成立 —— 「各自梭哈一项的极限说明不了整体，
       梭哈一项之后另外两项不达标」。新口径：
         · 可达（①②③④）→ 只展示开箱方案，不再给上限/缺口表；
         · 不可达（⑤）  → 展示 bestEffortPlan 最优均衡方案 + **该方案下的真实逐资源缺口**。
       缺口直接取求解器的 remaining_shortage（同一分配的产物），**禁止在渲染层重算** ——
       重算会与方案不自洽（这正是上一轮 a20c94f 首版被推翻的原因）。 */
    function diagOk() { return { feasible: true }; }
    /* ① 当前资源储备已足够 */
    if (minL(bare) >= tgt) return { days: "0", date: immediate, plan: "无需开箱（当前资源已足够）", diag: diagOk() };
    // ② 挑战者成长宝箱（开箱顺序①，固定数值奖励）全开即可达成
    //    R31：先跑一次目标方案拿到「实际选中的挑战者项」，再据此判断「只开挑战者能否达成」——
    //         否则会出现「用战斗数据辑判断、却展示芯尘的方案」这种自相矛盾（auto 双跑择优后尤其明显）。
    var planChal = S.planForTarget(snap, tgt, future ? "future" : "now");
    var chalIdx2 = (planChal && typeof planChal.challenger_index === "number") ? planChal.challenger_index : undefined;
    var chalRes = B.challengerUnitsResources(s2, chalIdx2);
    var lvChal = snap.current_sync_level + C.affordableLevels(C.addRes(baseRes, chalRes), s2, snap.current_sync_level);
    if (lvChal >= tgt) {
      var plan2 = planChal;
      var n2 = 0;
      ((plan2 && plan2.selectable) || []).forEach(function (p) { if (p.name.indexOf("挑战") >= 0) n2 = Math.max(n2, p.used); });
      if (n2 > 0) {
        var pick2 = chalChoiceText(plan2.selectable);
        return { days: "0", date: immediate,
          plan: "只开挑战者成长宝箱（" + n2 + " 个" + (pick2 ? "，选【" + pick2 + "】" : "") + "）即可达成（固定小时箱与方舟/30天箱无需开启）",
          selectablePlan: plan2 ? plan2.selectable : null,
          diag: diagOk(),
          selCaption: "开箱方案（只开挑战者成长宝箱）：" };
      }
    }
    // ③ 挑战者全开 + 固定小时箱按需开启即可达成
    if (minL(fixed) >= tgt) {
      var need = B.fixedBoxesNeeded(s2, baseRes, steps, income, chalRes);
      var n = 0;
      Object.keys(need.used || {}).forEach(function (nm) {
        Object.keys(need.used[nm]).forEach(function (h) { n += need.used[nm][h]; });
      });
      var pick3 = chalChoiceText(planChal && planChal.selectable);
      return { days: "0", date: immediate,
        plan: "挑战者成长宝箱全开" + (pick3 ? "（选【" + pick3 + "】）" : "") + " + 固定小时箱按需开启 " + n + " 个即可达成（无需开方舟/30天箱）",
        fixedNeed: need.used || {}, diag: diagOk() };
    }
    // ④ 全箱梭哈可达成：按「当前正在渲染的这个目标等级」现算开够即停方案
    //   （此前误用 target_selectable_* —— 那是按「目标同步器等级」预计算的，导致「后续追求目标等级」显示的是别个目标的方案）
    if (maxLv >= tgt) {
      var plan = S.planForTarget(snap, tgt, future ? "future" : "now");
      var arr = plan ? plan.selectable : null;
      return { days: "0", date: immediate, plan: boxPlanText(arr, true), selectablePlan: arr,
        fixedNeed: plan ? plan.fixed_used : null,
        diag: diagOk(),
        selCaption: "开箱方案（挑战者全开 → 固定小时箱按需 → 自选箱按下表逐箱开启）：" };
    }
    // ⑤ 全资源投入也无法达成：给「最优均衡能到的最高等级」方案 + 该方案下的真实逐资源缺口
    var gap = tgt - maxLv;
    var be = B.bestEffortPlan(s2, baseRes, steps, income);
    var beLv = be.found ? (snap.current_sync_level + be.steps) : snap.current_sync_level;
    return { days: "-", date: "全箱梭哈也无法达成",
      plan: "全资源投入后仍差 " + gap + " 级（全箱梭哈上限 " + maxLv + " 级，需补充资源）",
      diag: {
        feasible: false,
        /* ⚠ 必须取 target_shortage，不能取 plan.remaining_shortage：
           bestEffortPlan 返回的方案在**缩小的步数**上可行 → 其 remaining_shortage 恒为 0，
           拿来当缺口会渲染成「三项 ✅ 足够」。target_shortage 由 boxes.js 在求解器内
           按「目标步数所需 − 底盘 − 该方案实际开出的箱子」算好（同源，渲染层只展示）。 */
        shortage: (be.found && be.plan && be.plan.target_shortage) ? be.plan.target_shortage : C.zeroRes(),
        steps: be.steps,
      },
      fixedNeed: (be.found && be.plan) ? be.plan.fixed_used : null,
      selectablePlan: (be.found && be.plan) ? be.plan.selectable : null,
      bestEffort: { found: be.found, level: beLv, steps: be.steps },
      selCaption: "最优均衡开箱方案（最多升到同步器 " + beLv + " 级）：" };
  }

  /* 三资源配平诊断（目标等级口径）
     旧版（R38 之前）逐资源给「单项资源上限」（把自选箱全给该项时的乐观上界）——
     用户已判定该思路不成立（「各自梭哈一项的极限说明不了整体，梭哈一项之后另外两项不达标」）。
     R38 起只展示「按最优均衡方案开完全部箱子后，仍缺的真实资源量」并折算成 1H 箱；
     数据直接取求解器的 target_shortage（与方案同源），**渲染层不得重算**。
     R40（2026-10-16 用户反馈）：由「一行引导语 + 2 列 3 行表格」**压缩成一行文本**，
     且**只列仍缺的资源**（已达标的项直接省略），瓶颈标记内联为「瓶颈：X（最难补）」。 */
  /* 缺口折算 1H 箱（R38 / R36 / R40 共用）：{ byH: {r: 个数}, max, maxRes }
     ⚠ 必须折算成 1H 箱：红球「个」与战斗数据「个」量纲不可比，用原始量会得出相反结论。
     rate 为 0 且缺口 > 0 时该资源折算记 0（无法折算，不参与瓶颈判定）。 */
  function foldNeed(shortage, income) {
    var byH = {}, maxH = 0, maxRes = null;
    C.RESOURCES.forEach(function (r) {
      var need = (shortage && shortage[r]) || 0, rate = (income && income[r]) || 0;
      /* R62（2026-10-26）：红球走「定点累计」口径 —— k 个 1H 盒给 floor(rate × k)，
         不是 k × floor(rate)。官方 OutpostBattleTable.Character_exp2 / Time_charexp2(60s)
         / 10000 × 3600 决定 rate，且每 60 秒仅产 0.2326 个 → 内部必为万分之一定点数。
         故此处按「总量 floor」折算：先按精确 rate 求最少箱数，若 floor 吃掉 <1 个则补 1 个。 */
      var k = 0;
      if (need > 1e-6 && rate > 0) {
        k = Math.ceil(need / rate - 1e-9);
        if (r === "core_dust" && Math.floor(rate * k + 1e-9) < need - 1e-6) k += 1;
      }
      byH[r] = k;
      if (byH[r] > maxH) { maxH = byH[r]; maxRes = r; }
    });
    return { byH: byH, max: maxH, maxRes: maxRes };
  }

  /* 缺口一行文本（R40）；只列 still-short 的资源，足够的项不显示 */
  function shortageLine(diag, tgt, income) {
    var RLb = C.RESOURCE_LABELS || { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };
    var ONE_H_BOX = { credit: "信用点盒", battle_data: "战斗数据辑盒", core_dust: "芯尘盒" };
    var sh = (diag && diag.shortage) || {};
    var fo = foldNeed(sh, income);
    var parts = [];
    C.RESOURCES.forEach(function (r) {
      var need = sh[r] || 0;
      if (!(need > 1e-6)) return;      // 已达标的资源不显示
      var seg = resIconHtml(r) + esc(RLb[r]) + " <b>" + fmtNum(need) + "</b>";
      if (fo.byH[r] > 0) seg += "（≈ <b>" + fmtInt(fo.byH[r]) + "</b> 个 1H " + ONE_H_BOX[r] + "）";
      parts.push(seg);
    });
    var head = "按上述方案开完全部箱子后，距目标 <b>同步器 " + tgt + "</b> 级仍缺：";
    if (!parts.length) return head + "三项资源<b>均已足够</b>。";
    return head + parts.join("、") +
      (fo.maxRes ? "<span class=\"shortage-bottle\">｜瓶颈：<b>" + esc(RLb[fo.maxRes]) + "</b>（最难补）</span>" : "");
  }

  /* R40：把「多推 n 关困难图」的一次性红球按**章汇总**近似出来（仓库无逐关奖励数据）。
     从 startKey 这一章起逐章扣关数，章内不足时按该章 dust_hard / n_hard 等比例取。
     仅用于整合结论 ② 的「推图一次性红球」项，属**近似值**，不参与任何求解。 */
  function hardPushDust(stagesLeft, startKey) {
    var entries = state.stageClearEntries || {};
    var keys = Object.keys(entries);
    if (!keys.length || !(stagesLeft > 0)) return 0;
    var maxKey = keys.reduce(function (a, b) { return parseInt(a, 10) >= parseInt(b, 10) ? a : b; });
    var left = stagesLeft, sum = 0, guard = 0;
    for (var k = startKey; k <= parseInt(maxKey, 10) && left > 0 && guard++ < 200; k++) {
      var e = entries[String(k)];
      if (!e) continue;
      var nh = e.n_hard || 0;
      if (nh <= 0) continue;
      var take = Math.min(left, nh);
      sum += (e.dust_hard || 0) * (take / nh);
      left -= take;
    }
    return sum;
  }

  function renderResult(result, snap) {
    var box = $("tabResult"); box.innerHTML = "";
    var recDate = new Date(snap.recorded_at.getTime());

    // 1. 整体等级概览（四卡各带一个信息图标；原来挤在一段说明里的 ①②③④ 移入各自卡片的信息窗，⑤ 活动收益说明删除）
    var cards = el("div", "", "cards");
    function card(num, lbl, warn, tipId, tipHtml) {
      var c = el("div", "<div class='num'>" + num + "</div><div class='lbl'>" + lbl + "</div>",
        "card" + (warn ? " warn" : "") + (tipId ? " info-host" : ""));
      if (tipId) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "info-tip";
        b.setAttribute("data-tip", tipId);
        b.setAttribute("aria-label", "查看说明");
        b.setAttribute("aria-expanded", "false");
        if (tipHtml) b.setAttribute("data-tip-html", tipHtml);
        c.insertBefore(b, c.firstChild);
      }
      return c;
    }
    cards.appendChild(card("同步器 " + snap.current_sync_level, "当前同步器等级", false, "tip-card-1",
      "当前等级（" + snap.current_sync_level + "）；仅用现有资源（不含新主线推图收益 · 不开箱）还可升到 " + result.bare.level + "。"));
    cards.appendChild(card("同步器 " + result.fixed.level, "仅使用固定小时箱", false, "tip-card-2",
      "只开固定小时箱能达到的等级（已计入成长套组）。"));
    var fullPick = chalChoiceText(result.selectable && result.selectable.selectable);
    cards.appendChild(card("同步器 " + result.selectable.level, "全箱梭哈", false, "tip-card-3",
      "按开箱顺序（挑战者成长宝箱全开" + (fullPick ? "，选【" + fullPick + "】· " + chalPrefNote(snap) : "") +
      " → 固定小时箱 → 自选箱）全部消耗能达到的等级。"));
    cards.appendChild(card(fmtDays(result.no_box.days) + " 天", "自然升级（不开箱）", true, "tip-card-4",
      "完全不开箱，靠每日收益与一举歼灭自然增长，" + fmtDays(result.no_box.days) + " 天到目标 " + result.no_box.target + "。"));
    box.appendChild(cards);

    // 2. 省流版结论（全箱梭哈口径）
    box.appendChild(renderSummary(result, snap));

    // 3. 达成目标方案（按目标，样式参考省流版，独立区块）
    box.appendChild(renderTargetPlans(result, snap));

    // 动态生成的图标按钮也要挂上点击行为（幂等）
    initInfoTips(box);
  }

  /* ---------- 达成目标方案：目标同步器等级 / 后续追求目标等级（只展示可行方案） ---------- */
  function renderTargetPlans(result, snap) {
    var wrap = el("div", "", "target-card");
    var tTitle = el("div", "", "target-title");
    tTitle.innerHTML = "达成目标方案";
    var tBtn = document.createElement("button");
    tBtn.type = "button"; tBtn.className = "info-tip";
    tBtn.setAttribute("data-tip", "tip-target");
    tBtn.setAttribute("aria-label", "查看说明");
    tBtn.setAttribute("aria-expanded", "false");
    tTitle.appendChild(tBtn);
    wrap.appendChild(tTitle);
    var targets = [
      { lv: snap.target_sync_level, name: "目标同步器等级" },
      { lv: snap.alternate_target_level, name: "后续追求目标等级" }
    ];
    var futureAvail = result.future_main_story.available;
    var incNow = snap.income_per_hour;
    var incFut = snap.future_income_per_hour || snap.income_per_hour;
    var futDate = result.future_main_story.open_at ? localDateStr(result.future_main_story.open_at) : "";
    targets.forEach(function (t) {
      var b = el("div", "", "summary-block");
      b.appendChild(el("div", t.name + " " + t.lv, "sb-head"));
      var np = planByLevels(result, snap, t.lv, false);
      var nowOk = np.days !== "-";
      var fp = null, fOk = false;
      if (futureAvail) { fp = planByLevels(result, snap, t.lv, true); fOk = fp.days !== "-"; }
      /* 方案明细：固定小时箱矩阵 + 自选箱卡片（都为空时不渲染）
         preferFb：优先用调用方给的 fbCaption（不可达口径下 headline 已写明等级，
                   再用 planByLevels 的 selCaption 会重复同一句话） */
      function pushDetail(parent, p, fbCaption, preferFb) {
        if (p.fixedNeed && Object.keys(p.fixedNeed).length) parent.appendChild(fixedPlanTable(p.fixedNeed));
        var sel = p.selectablePlan;
        if (sel && sel.some(function (x) { return x.used > 0; })) {
          parent.appendChild(el("div", (preferFb ? fbCaption : (p.selCaption || fbCaption)), "sb-plan"));
          parent.appendChild(selectableBoxTable(sel));
        }
      }
      /* R40：两套口径（现状 / 开放日）各包一个分段容器 —— 左侧色条 + 分段标题 + 状态药丸。
         用户反馈「现状不可达（全箱梭哈只到 557 级）与开放日可达两套开箱方案划分很模糊」，
         故把方案按口径分组，不同口径之间不再是一条虚线。kind: 'now'（灰）| 'fut'（蓝）。 */
      function segBox(kind, titleText, statusText, statusKind) {
        var seg = el("div", "", "sb-seg sb-seg-" + kind);
        var head = el("div", "", "sb-seg-head");
        head.appendChild(el("span", esc(titleText), "sb-seg-title"));
        if (statusText) head.appendChild(el("span", esc(statusText), "sb-seg-status " + (statusKind || "")));
        seg.appendChild(head);
        return seg;
      }
      /* R38/R40 不可达口径：最优均衡方案 + 该方案下的真实逐资源缺口
         （缺口取求解器 target_shortage，与方案同源，渲染层不重算；R40 起缺口压缩为一行） */
      function pushBestEffort(parent, p, who, inc) {
        if (!(p.bestEffort && p.bestEffort.found)) return;
        parent.appendChild(el("div", who + "最优均衡开箱方案（最多升到 同步器 " + p.bestEffort.level + " 级）", "sb-big"));
        pushDetail(parent, p, "开箱方案（按下表逐箱开启）：", true);
        parent.appendChild(el("div", shortageLine(p.diag, t.lv, inc), "sb-text shortage-line"));
      }
      // 现状与未来都无法达成 → 逐口径给「最优均衡方案 + 真实缺口」
      if (!nowOk && !fOk) {
        var segN0 = segBox("now", "现状（今天）方案", "❌ 不可达", "bad");
        segN0.appendChild(el("div", "全箱梭哈上限 同步器 " + result.selectable.level + " 级，距目标仍差 " +
          Math.max(0, t.lv - result.selectable.level) + " 级。", "sb-text"));
        pushBestEffort(segN0, np, "现状", incNow);
        b.appendChild(segN0);
        if (futureAvail && fp) {
          var segF0 = segBox("fut", "开放日（" + futDate + "）方案", "❌ 也不可达", "bad");
          segF0.appendChild(el("div", "开放日全箱梭哈上限 同步器 " + result.future_main_story.result.level + " 级。", "sb-text"));
          pushBestEffort(segF0, fp, "开放日", incFut);
          b.appendChild(segF0);
        }
        b.appendChild(el("p", "「仍缺」= 按<b>最优均衡</b>分配开完全部箱子后仍缺的资源量，已折算为该资源的 <b>1H 箱</b>个数；只列出还缺的资源（已足够的项不显示）。各项缺口<b>共用同一批自选箱</b>、需同时补足（<b>不是各自独立可补</b>），标「瓶颈」的一项是缺口最大、最难补的。把箱子全堆给某一项并不会升得更高。", "caption"));
        wrap.appendChild(b);
        return;
      }
      if (nowOk) {
        var segN1 = segBox("now", "现状（今天）方案", "✅ 可达", "ok");
        segN1.appendChild(el("div", "现状可达（" + np.date + "）", "sb-big"));
        if (np.plan) segN1.appendChild(el("div", np.plan, "sb-text"));
        pushDetail(segN1, np, "开箱方案（按下表逐箱开启）：");
        segN1.appendChild(el("p", "现有箱子足够达成，按上方方案开箱即可。", "caption"));
        b.appendChild(segN1);
      } else {
        // 现状不可达但未来可达：两套方案各占一个分段（左色条 + 状态药丸），视觉上明确分开
        var segN2 = segBox("now", "现状（今天）方案", "❌ 不可达（全箱梭哈只到 " + result.selectable.level + " 级）", "bad");
        pushBestEffort(segN2, np, "现状", incNow);
        b.appendChild(segN2);
        var segF2 = segBox("fut", "开放日（" + futDate + "）方案", "✅ 可达", "ok");
        if (fp.plan) segF2.appendChild(el("div", fp.plan, "sb-text"));
        pushDetail(segF2, fp, "开箱方案（等新主线开放后，按新基地收益逐箱开启）：");
        segF2.appendChild(el("p", "叠加等待期到账资源后箱子足够达成，按开放日方案开箱即可。", "caption"));
        b.appendChild(segF2);
      }
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ---------- 活动收益区块（补充信息 tab 顶部） ---------- */
  function renderEventSection(box, result, snap) {
    var es = result.event_summary;
    if (!es || (!es.meta || !es.meta.length)) return;
    box.appendChild(el("h3", "活动收益（按具体日期计入）", "sec"));

    if (!es.available) {
      var msgs = (es.meta || []).map(function (m) {
        if (m.error) return "「" + (m.label || m.template) + "」模板数据异常：" + esc(m.error);
        return "「" + (m.label || m.template) + "」" + (m.start || "-") + " ~ " + (m.end || "-") +
               "：<b>已结束或未到计入区间，贡献 0</b>（该活动已到手的奖励已包含在你填写的箱量中）";
      });
      box.appendChild(el("p", msgs.join("<br>"), "caption"));
      return;
    }

    // 1. 活动清单
    var rows = es.meta.map(function (m) {
      var st = m.error ? ("⚠ " + m.error)
             : (m.active ? ("计入 " + m.inject_days + " 天") : "贡献 0（已结束/未开始）");
      return [m.label || m.template, (m.start || "-") + " ~ " + (m.end || "-"),
              m.active ? (m.inject_start + " ~ " + m.inject_end) : "-",
              String(m.inject_days || 0), st];
    });
    box.appendChild(table(["活动模板", "活动窗口", "实际计入区间", "计入天数", "状态"], rows));
    box.appendChild(el("p", "计入区间 = [max(活动开始日, 数据日期+1), 活动结束日]：你填写的箱量与资源是「截至数据日期的当前持仓」，<b>已包含数据日期当天及以前领到的活动奖励</b>，故活动收益一律从<b>数据日期次日起算</b>，避免重复计入；已结束的活动贡献恒为 0。", "caption"));

    // 2. 累计产出（本表单 / 活动 / 合计）—— 资源名与箱名统一带图标（R26 ②）
    var t = es.totals;
    var resLabels = C.RESOURCE_LABELS;
    var outRows = C.RESOURCES.map(function (r) {
      var base = snap.bare_resources[r] || 0, add = (t.res && t.res[r]) || 0;
      return [resIconHtml(r) + esc(resLabels[r]) + "（现有资源）", fmtNum(base), fmtNum(add), fmtNum(base + add)];
    });
    Object.keys(DEFAULT_FIXED).forEach(function (lab) {
      var base = 0;
      Object.keys(snap.fixed_boxes[lab] || {}).forEach(function (h) { base += snap.fixed_boxes[lab][h] || 0; });
      var add = 0;
      Object.keys((t.fixed && t.fixed[lab]) || {}).forEach(function (h) { add += t.fixed[lab][h]; });
      outRows.push([boxIconHtml(lab) + esc(lab) + "（固定箱）", String(base), String(add), String(base + add)]);
    });
    (snap.selectable_boxes || []).forEach(function (b) {
      var add = (t.selectable && t.selectable[b.name]) || 0;
      if (b.quantity || add) outRows.push([boxIconHtml(b.name) + esc(b.name) + "（自选箱）", String(b.quantity), String(add), String(b.quantity + add)]);
    });
    box.appendChild(table(["资源 / 箱", "本表单（现有持仓）", "活动计入", "合计"], outRows));
    // 固定小时箱：活动计入部分按「箱型 × 时长」矩阵单列一张表（与表单内实时预览同表形）
    var tfix = t.fixed || {};
    var anyFixed = FIXED_BOX_ORDER.some(function (nm) {
      var m = tfix[nm] || {};
      return FIXED_BOX_HOURS.some(function (h) { return (m[String(h)] || 0) > 0; });
    });
    if (anyFixed) {
      var mrows = FIXED_BOX_ORDER.map(function (nm) {
        var m = tfix[nm] || {};
        return [boxIconHtml(nm) + esc(nm)].concat(FIXED_BOX_HOURS.map(function (h) {
          var c = m[String(h)] || 0;
          return c > 0 ? '<b>' + c + "</b>" : "—";
        }));
      });
      box.appendChild(el("p", "活动计入的固定小时箱（按箱型 × 时长，— 表示该档无到账）：", "caption"));
      box.appendChild(table(["箱子 \\ 小时"].concat(FIXED_BOX_HOURS.map(function (h) { return h + "h"; })), mrows));
    }
    box.appendChild(el("p", "活动箱已并入箱子管线：参与开箱顺序（①挑战者成长宝箱全开 → ②固定小时箱按需 → ③方舟/30天自选箱按需）与全箱梭哈上限；但<b>不写回上方表单输入框</b>（活动箱是分日到账的）。挑战者成长宝箱按固定数值（units）计入、不走引擎的箱子折算，其<b>二选一选项由「其他」段的「挑战者箱资源选择」决定</b>（默认自动择优）。", "caption"));

    // 3. 折合等级增量 + 与开放日的关系
    box.appendChild(el("p", "折合等级增量：同一底盘（现有资源 + 全部箱）下，含活动 vs 不含活动的全箱梭哈等级 = <b>" +
      es.without_event_level + " → " + es.with_event_level + "（+" + es.level_gain + " 级）</b>。", "caption"));
    if (es.future_open) {
      var seg = [];
      if (es.days_before_open) seg.push("开放日前到账 <b>" + es.days_before_open + " 天</b>（计入等待期自然积累，抬高开放日快照）");
      if (es.days_after_open) seg.push("开放日后到账 <b>" + es.days_after_open + " 天</b>（计入开放日后的未来收益）");
      box.appendChild(el("p", "与「预计新主线开放日（" + es.future_open + "）」的关系：" + (seg.length ? seg.join("；") : "无交集") + "。", "caption"));
    }
    box.appendChild(el("p", "商店按既有兑换节点自动兑换（Hard 开放日清一轮固定物资；活动结束前把剩余代币一次性兑成信用点）；每日任务与签到奖励按模板规则逐日/定时到账。活动「一天」= 一次凌晨 04:00 服务器重置。", "caption"));
  }

  /* ---------- 补充信息：各类资源最大等级 / 收益折算 / 自然升级 ---------- */
  function renderExtra(result, snap) {
    var box = $("tabExtra"); box.innerHTML = "";
    var resLabels = { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };

    // 0. 活动收益（有活动时才出现）
    renderEventSection(box, result, snap);

    // 1. 自然升级到 N（不开箱）
    box.appendChild(el("h3", "自然升级到" + result.no_box.target + "（不开箱）", "sec"));
    var nb = result.no_box;
    var nbRows = C.RESOURCES.map(function (r) {
      var isB = r === nb.bottleneck;
      return [resLabels[r], fmtNum(nb.required[r]), fmtNum(snap.bare_resources[r]), fmtNum(nb.shortage[r]), fmtNum(nb.daily_income[r]), fmtDays(nb.days_by_resource[r]), isB ? "✅ 瓶颈" : ""];
    });
    box.appendChild(table(["资源", "总需求", "现有余额", "缺口", "每日收益", "需要天数", "是否瓶颈"], nbRows));
    box.appendChild(el("p", "瓶颈资源：" + resLabels[nb.bottleneck] + "；预计日期：" + nb.estimated_at + "；需 " + nb.steps + " 级。", "caption"));

    // 2. 各类资源可达到的最大等级（全箱梭哈口径）
    box.appendChild(el("h3", "各类资源可达到的最大等级（全箱梭哈）", "sec"));
    var prRows = [];
    var hasFuturePR = result.per_resource.future_bare && result.per_resource.future_fixed && result.per_resource.future_selectable;
    C.RESOURCES.forEach(function (r) {
      var before = result.per_resource.selectable[r];
      var after = hasFuturePR ? result.per_resource.future_selectable[r] : null;
      prRows.push([resLabels[r], "同步器 " + before, after !== null ? "同步器 " + after : "-"]);
    });
    box.appendChild(table(["资源", "新主线开启前最大等级", "新主线开启后最大等级"], prRows));
    box.appendChild(el("p", "以上为「固定小时箱 + 资源自选箱」（全箱梭哈）口径下，三类资源各自单独计算能升到的最大等级（只看单资源）；开启前不含「预计新主线推图收益」（属新主线开放后的一次性资源）；开启后 = 新主线开放日按未来收益 + 等待期自然积累。", "caption"));

    // 3. 固定小时箱收益折算（含差值换算）
    box.appendChild(el("h3", "固定小时箱收益折算（开主线前 vs 开主线后）", "sec"));
    var before = result.fixed.fixed || {};
    var after = result.future_main_story.available ? result.future_main_story.result.fixed || {} : null;
    var fixRows = C.RESOURCES.map(function (r) {
      var bv = before[r] || 0, av = after ? (after[r] || 0) : 0, diff = av - bv;
      var diffLevels = diff > 0 ? C.affordableLevelsSingle({ credit: 0, battle_data: 0, core_dust: 0, [r]: diff }, snap, snap.current_sync_level, r) : 0;
      return [C.RESOURCE_LABELS[r], fmtNum(bv), after ? fmtNum(av) : "-", after ? fmtNum(diff) : "-", diff > 0 ? ("≈" + diffLevels + " 级（" + C.RESOURCE_LABELS[r] + "单资源）") : "-"];
    });
    box.appendChild(table(["资源", "开主线前折算（当前收益）", "开主线后折算（新收益）", "差值", "差值≈可升等级"], fixRows));
    box.appendChild(el("p", "固定小时箱按开启时的基地收益折算：开主线前用当前收益、开主线后用新基地收益；其中「成长套组」计入固定小时箱折算（对信用/战斗/芯尘按小时收益×数量计）。挑战者成长宝箱属于自选箱（不计入此处）。", "caption"));

    // 4. 全资源梭哈收益折算（开主线前 vs 开主线后）
    box.appendChild(el("h3", "全资源梭哈收益折算（开主线前 vs 开主线后）", "sec"));
    if (result.future_main_story.available) {
      var futIncome2 = snap.future_income_per_hour || snap.income_per_hour;
      // 用「开放日快照」比较（含等待期内到账的活动资源与箱量；无活动时等同当前快照）
      var futSnap2 = result.future_main_story.projected_snapshot
        ? Object.assign({}, result.future_main_story.projected_snapshot)
        : JSON.parse(JSON.stringify(snap));
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
      var bgFine = result.future_main_story.box_gain_vs_now || 0;   // R60：连续值（小数级）
      var bgExtra = Math.round(bgFine);   // 拆解仍用整数，保证 wvE / ovE 相加 === levelDiff
      var gsE = levelGainSplit(result);
      var wvE = (gsE.waitLv !== null) ? Math.min(gsE.waitLv, Math.max(0, levelDiff)) : Math.max(0, levelDiff - bgExtra);
      var ovE = Math.max(0, levelDiff - wvE - bgExtra);
      box.appendChild(el("p", "立即全箱梭哈可到 <b>同步器 " + result.selectable.level + "</b>；等到开放日（" + localDateStr(result.future_main_story.open_at) + "）再全箱梭哈可到 <b>同步器 " + result.future_main_story.result.level + "</b>（多升 " + levelDiff + " 级：等待期到账资源 +" + wvE + " 级，开箱 +" + ovE + " 级；箱子按新收益折算另 +" + lvText(bgFine) + " 级）。全资源 = 现有 + 推图 + 固定小时箱 + 自选箱全部；前/后列为全资源总量（与固定箱折算同口径：只比资源获取量，不减升级消耗）；差值 = 等新主线再梭哈多获得的资源；差值≈可升等级为单资源视角的粗略换算。", "caption"));
      var hasFutIncome2 = (futIncome2.credit || 0) > 0 || (futIncome2.battle_data || 0) > 0 || (futIncome2.core_dust || 0) > 0;
      if (!hasFutIncome2) {
        box.appendChild(el("p", "⚠ 未填写「预计新收益」，开主线后的折算暂按当前收益估算，结果与开主线前接近属正常；填上预计新基地收益后会更准确。", "caption"));
      }
    } else {
      box.appendChild(el("p", result.future_main_story.reason + "；可在「预计新主线进度」中填写后重新计算。"));
    }
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

  /* 自选箱分配（无标题；供达成目标方案与省流卡复用，格式统一）
     planArr = 开箱方案条目数组（含 name/used/keep/choices） */
  function selectableBoxTable(planArr, note) {
    note = note || "无需开箱（现有资源 + 固定小时箱已满足目标）";
    var hasUsed = (planArr || []).some(function (p) { return p.used > 0; });
    if (!planArr || !planArr.length || !hasUsed) return el("p", note, "caption");
    // PC 与移动版统一走卡片：5 列表格在 400px（桌面结果栏）与 314px（竖屏）里都要横滑、
    // 且「分配明细」「备注」被截断；卡片竖排零横滑、长文本不截断
    return selectableBoxCards(planArr);
  }

  /* 分配表卡片：一箱一张（数值 + 明细 + 备注竖排） */
  function selectableBoxCards(planArr) {
    var box = el("div", "", "box-cards");
    (planArr || []).forEach(function (p) {
      var detail = Object.keys(p.choices || {}).filter(function (k) { return p.choices[k]; })
        .map(function (k) { return k + " x" + p.choices[k]; }).join("、") || "无需开启";
      var card = el("div", "", "box-card");
      card.appendChild(el("div", p.name, "bc-name"));
      card.appendChild(el("div",
        "<span>使用 <b>" + p.used + "</b></span><span>保留 <b>" + p.keep + "</b></span>", "bc-nums"));
      card.appendChild(el("div", detail, "bc-detail"));
      if (p.name.indexOf("挑战者") >= 0) {
        // R31：不再写死「默认全部消耗」——写明实际选中的那一项
        var pick = chalChoiceText([p]);
        card.appendChild(el("div", "固定数值奖励，全部消耗" + (pick ? "，选【" + pick + "】" : "") + "（不受基地等级影响）", "bc-note"));
      }
      box.appendChild(card);
    });
    return box;
  }

  /* 固定小时箱按需开启明细：与「固定小时箱数量」输入表【同形状】的 6 时长矩阵
     （行 = 箱类按输入表顺序、列 = 24h…1h、格 = 开启数量；0 记作 —）
     此前是 30 行「箱子/时长/数量」三列表，一屏放不下且无法和输入值对照 */
  var FIXED_BOX_ORDER = ["芯尘盒", "战斗数据辑盒", "信用点盒", "成长套组"];
  var FIXED_BOX_ICON = {
    "芯尘盒": "box_core_dust.webp", "战斗数据辑盒": "box_battle.webp",
    "信用点盒": "box_credit.webp", "成长套组": "box_growth.webp"
  };
  /* 自选箱图标（与输入区「自选箱数量」同素材：mbox_*）。桌面的 30 天箱是 .jpg，见 boxIconHtml */
  var SELECTABLE_BOX_ICON = {
    "挑战者成长宝箱": "mbox_challenger.webp",
    "方舟官方补给物资Ⅰ": "mbox_ark.webp",
    "30天成长补给箱": "mbox_30d.webp"
  };
  var FIXED_BOX_HOURS = [24, 12, 8, 4, 2, 1];
  /* 图标目录跟随页面上输入表实际使用的资源目录（桌面 assets/、移动版 assets/m/） */
  function fixedIconDir() {
    var img = document.querySelector(".fixed-table td:first-child img.box-icon");
    var src = img ? (img.getAttribute("src") || "") : "";
    return src ? src.replace(/[^/]*$/, "") : "";
  }
  function fixedPlanTable(need) {
    var names = FIXED_BOX_ORDER.filter(function (nm) {
      var m = need && need[nm];
      if (!m) return false;
      return FIXED_BOX_HOURS.some(function (h) { return (m[String(h)] || 0) > 0; });
    });
    var total = 0;
    names.forEach(function (nm) {
      FIXED_BOX_HOURS.forEach(function (h) { total += (need[nm][String(h)] || 0); });
    });
    var wrap = el("div", "", "sb-plan");
    if (!total) { wrap.appendChild(el("div", "无需开启固定小时箱（现有资源已足够）。", "sb-text")); return wrap; }
    var dir = fixedIconDir();
    var head = "<tr><th>箱子 \\ 小时</th>" + FIXED_BOX_HOURS.map(function (h) { return "<th>" + h + "h</th>"; }).join("") + "</tr>";
    var body = names.map(function (nm) {
      var map = need[nm] || {};
      var tds = FIXED_BOX_HOURS.map(function (h) {
        var c = map[String(h)] || 0;
        return c > 0 ? '<td class="on">' + c + "</td>" : '<td class="off">—</td>';
      }).join("");
      var icon = (dir && FIXED_BOX_ICON[nm]) ? '<img class="box-icon" alt="" src="' + dir + FIXED_BOX_ICON[nm] + '">' : "";
      return "<tr><td>" + icon + esc(nm) + "</td>" + tds + "</tr>";
    }).join("");
    var t = el("table", "<thead>" + head + "</thead><tbody>" + body + "</tbody>", "fixed-table plan");
    wrap.appendChild(el("div", "开箱方案 · 固定小时箱", "sb-plan"));
    wrap.appendChild(t);
    wrap.appendChild(el("div", "共需开启固定小时箱 <b>" + total + "</b> 个。", "caption"));
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
  /* 「较现状多升 N 级」的分层拆解（三资源取 min = 瓶颈）：
     裸资源可到 → ＋固定小时箱 → ＋自选箱；再配 box_gain_vs_now（箱子按新收益折算）。
       waitLv     = 裸资源层的抬升 = 「等待期到账资源」（与是否开箱无关）
       fixedDelta/selDelta = 固定小时箱 / 自选箱 在开放日相对现状多出的边际等级（= 开箱贡献）
     任一字段为 null 表示 per_resource 数据不足，调用方自行兜底 */
  function levelGainSplit(result) {
    var pr = (result && result.per_resource) || {};
    function lvMinOf(o) {
      if (!o) return null;
      var v = null;
      C.RESOURCES.forEach(function (r) {
        if (typeof o[r] === "number") v = (v === null ? o[r] : Math.min(v, o[r]));
      });
      return v;
    }
    var out = {
      NB: lvMinOf(pr.bare), NF: lvMinOf(pr.fixed), NS: lvMinOf(pr.selectable),
      FB: lvMinOf(pr.future_bare), FF: lvMinOf(pr.future_fixed), FS: lvMinOf(pr.future_selectable),
      waitLv: null, fixedDelta: null, selDelta: null
    };
    if (out.NB !== null && out.FB !== null) out.waitLv = Math.max(0, out.FB - out.NB);
    if (out.NB !== null && out.NF !== null && out.FB !== null && out.FF !== null) {
      out.fixedDelta = (out.FF - out.FB) - (out.NF - out.NB);
    }
    if (out.NF !== null && out.NS !== null && out.FF !== null && out.FS !== null) {
      out.selDelta = (out.FS - out.FF) - (out.NS - out.NF);
    }
    return out;
  }

  function renderSummary(result, snap) {
    var wrap = el("div", "", "summary-card");
    wrap.appendChild(el("div", "即刻飞升（不做规划，直接梭哈）", "summary-title"));
    var target = snap.target_sync_level;

    // 全箱梭哈口径：现状 / 新主线开放后 的最高等级与配套方案
    var nowLv = result.selectable.level;
    var fut = result.future_main_story;
    var hasFut = !!(fut && fut.available && fut.result);
    var futLv = hasFut ? fut.result.level : null;
    var gs = levelGainSplit(result);

    // Block ① 不等新主线（当前基地 · 直接全箱梭哈）
    var b1 = el("div", "", "summary-block");
    b1.appendChild(el("div", "① 不等新主线 · 直接全箱梭哈", "sb-head"));
    var big1 = "全箱梭哈最高可到 <b>同步器 " + nowLv + "</b>";
    if (nowLv >= target) big1 += ' <span class="ok-tag">✅ 已达目标级 ' + target + "</span>";
    else big1 += "（目标 " + target + " 还差 " + Math.max(0, target - nowLv) + " 级）";
    b1.appendChild(el("div", big1, "sb-big"));
    var selPlan1 = (result.selectable && result.selectable.selectable) || null;
    // selPlan1 = 开箱方案对象（.selectable 为逐箱分配数组、.fixed_used 为固定箱按需明细）
    var sellArr = selPlan1 ? (Array.isArray(selPlan1) ? selPlan1 : selPlan1.selectable) : null;
    var sellUsed = sellArr && sellArr.some(function (p) { return p.used > 0; });
    var fixedUsed1 = selPlan1 && !Array.isArray(selPlan1) ? selPlan1.fixed_used : null;
    var hasFixed1 = fixedUsed1 && Object.keys(fixedUsed1).length > 0;
    if (sellUsed || hasFixed1) {
      var chal1 = chalChoiceText(sellArr);
      b1.appendChild(el("div", "开箱顺序（全箱梭哈）：① 挑战者成长宝箱全开" +
        (chal1 ? "（选【" + chal1 + "】· " + chalPrefNote(snap) + "）" : "") +
        " → ② 固定小时箱按需 → ③ 自选箱按下表逐箱开启：", "sb-plan"));
      if (hasFixed1) b1.appendChild(fixedPlanTable(fixedUsed1));
      if (sellUsed) b1.appendChild(selectableBoxTable(sellArr));
    } else {
      b1.appendChild(el("div", "无需开箱（现有资源已足够全箱梭哈）。", "sb-text"));
    }
    wrap.appendChild(b1);

    // Block ② 新主线开放后升级（开放后按新基地收益全箱梭哈）
    var b2 = el("div", "", "summary-block");
    b2.appendChild(el("div", "② 新主线开放后升级", "sb-head"));
    if (hasFut) {
      var date = fut.open_at ? localDateStr(fut.open_at) : "";
      var diff = futLv - nowLv;
      var big2 = "新主线开放日（" + date + "），全箱梭哈可到 <b>同步器 " + futLv + "</b>";
      if (diff > 0) {
        // 分层拆解：「等待期到账资源」（不开箱也有）与「开箱贡献」分开列，
        // 避免旧的「另有等待期自然积累 N 级」被误读成「这 N 级都不用开箱」
        // R35/§9.7：等级用 N、增量用 +Δ，避免两个 N 混指
        var boxGainFine = fut.box_gain_vs_now || 0;   // R60：连续值（小数级）
        var boxGain = Math.round(boxGainFine);        // 拆解用整数，保证 wv + ov + boxGain === diff
        var wv = (gs.waitLv !== null) ? gs.waitLv : Math.max(0, diff - boxGain);
        var ov = Math.max(0, diff - wv - boxGain);
        // R42：口径翻正 —— 不再说「屯箱子多升」（读者的「少赚/亏」视角），改说「等到开放日再开箱可多赚」
        // R59：「比现在多赚 +N 级」有歧义 —— N 是「现在 → 开放日」的总升幅，不是白赚的量。
        //      改「一共升 N 级」，三项用加号拆成可验算的加法（wv + ov + boxGain === diff）；
        //      只有「同一批箱子等到开放日再开箱多赚」这一项才是真·多赚，标红（.em-earn）。
        // R60：这一项本身只有 ≈1 级以内（收益差 1.85%），取整后会「有/无」乱跳 → 显示真值（小数）。
        var parts = ["等待期到账资源 <b>+" + wv + "</b> 级", "开箱 <b>+" + ov + "</b> 级"];
        if (boxGainFine >= 0.05) parts.push('<span class="em-earn">同一批箱子等到开放日再开箱可多赚 <b>+' + lvText(boxGainFine) + "</b> 级</span>");
        big2 += "（一共升 <b>" + diff + "</b> 级 = " + parts.join(" + ") + "）";
      }
      if (futLv >= target) big2 += ' <span class="ok-tag">✅ 已达目标级 ' + target + "</span>";
      b2.appendChild(el("div", big2, "sb-big"));
      if (diff > 0 && gs.NB !== null && gs.FB !== null) {
        // 只用同口径的裸资源层（per_resource 的 bare 层与联合口径等价）
        // 自选箱层是「全给单项」的乐观上界，与 futLv 不同口径，不能混用
        b2.appendChild(el("div", "其中：不开箱可到 " + gs.NB + " → " + gs.FB + " 级；全箱梭哈 " + nowLv + " → " + futLv + " 级。", "sb-text"));
      }
      // 与 Block① 对称：取「开放日全箱梭哈到该最高等级」的真实逐箱分配
      //   （此前误用 target_selectable_future —— 那是为「达成目标等级」优化的方案，目标被裸资源+固定箱满足时会是空表）
      var futPlanNode = (fut.result && fut.result.selectable) || null;
      var futPlan = futPlanNode ? (Array.isArray(futPlanNode) ? { selectable: futPlanNode } : futPlanNode) : null;
      var fsell = futPlan ? futPlan.selectable : null;
      var fSellUsed = fsell && fsell.some(function (p) { return p.used > 0; });
      var fFixedUsed = futPlan ? futPlan.fixed_used : null;
      var fHasFixed = fFixedUsed && Object.keys(fFixedUsed).length > 0;
      if (fSellUsed || fHasFixed) {
        var chalF = chalChoiceText(fsell);
        b2.appendChild(el("div", "开箱顺序（全箱梭哈）：① 挑战者成长宝箱全开" +
          (chalF ? "（选【" + chalF + "】· " + chalPrefNote(snap) + "）" : "") +
          " → ② 固定小时箱按需 → ③ 自选箱按下表逐箱开启：", "sb-plan"));
        if (fHasFixed) b2.appendChild(fixedPlanTable(fFixedUsed));
        if (fSellUsed) b2.appendChild(selectableBoxTable(fsell));
      } else {
        b2.appendChild(el("div", "无需开箱（等待期自然积累已足够全箱梭哈到该等级）。", "sb-text"));
      }
      var fIn = snap.future_income_per_hour || {};
      var hasF = (fIn.credit || 0) > 0 || (fIn.battle_data || 0) > 0 || (fIn.core_dust || 0) > 0;
      if (!hasF) b2.appendChild(el("div", "⚠ 未填写「预计新收益」，新主线口径暂按当前收益估算。", "summary-warn"));
    } else {
      b2.appendChild(el("div", "未填写新主线进度，无法评估该口径；可在「预计新主线进度」中填写后重新计算。", "sb-text"));
    }
    wrap.appendChild(b2);

    /* Block ③ 整合结论（R36）：结论 ≤3 行；原长「口径」段整段移入信息窗 #tip-block3。
       ⚠ 禁止双重计算：stage_clear 在 future 口径已计入一次（项目铁律 5）→
         ① 只做「提前到账的时点收益」比较：把已填的推图收益当【底盘增量】单独跑一次
         affordableLevels，**绝不并入 open-day 快照**，也不回写 snapshot。 */
    var b3 = el("div", "", "summary-block");
    var head3 = el("div", "③ 整合结论", "sb-head");
    var tip3 = document.createElement("button");
    tip3.type = "button"; tip3.className = "info-tip";
    tip3.setAttribute("data-tip", "tip-block3");
    tip3.setAttribute("aria-label", "查看说明");
    tip3.setAttribute("aria-expanded", "false");
    head3.appendChild(tip3);
    b3.appendChild(head3);

    var stageRes = snap.stage_clear_resources || {};
    var hasStage = C.RESOURCES.some(function (r) { return (stageRes[r] || 0) > 0; });
    // 赚 = 推图一次性收益折合等级（当底盘增量单跑，不并入开放日快照）
    var earn = hasStage ? C.affordableLevels(stageRes, snap, snap.current_sync_level) : 0;
    /* R40（2026-10-16 用户反馈「亏的等级是屯箱子多升的 N 级」）：
       提前开箱的代价 ≠ futLv − nowLv。后者是「等到开放日总共多升多少级」，其中「等待期到账资源」与
       「等待期多攒出来的箱子」两部分跟是否提前开箱无关；真正构成代价的只有
       **屯箱子多升** = box_gain_vs_now（同一批箱子在更高的基地收益下更值钱而多升的级数）。
       旧口径把代价说大（如 17 级 vs 实际 1 级），会让「提前升」显得远比实际不划算。
       R42（2026-10-16 用户要求「整体结论改为赚多少的口径」）：面向用户的文案一律翻成正向说法
       ——「等到开放日再开箱可多赚 N 级」，不再出现「亏 / 屯箱子多升」。lose 变量名与数值不变。 */
    var lose = hasFut
      ? (typeof fut.box_gain_vs_now === "number" ? Math.max(0, fut.box_gain_vs_now) : Math.max(0, futLv - nowLv))
      : 0;
    var loseTxt = lvText(lose);   // R60：连续值 → 整数就写整数，小数保留 1 位
    var line1;
    if (!hasFut) {
      line1 = "① 提前升：未填写「预计新主线进度」→ 无法比较「现在梭哈 vs 等开放日」；当前全箱梭哈可到 <b>同步器 " + nowLv + "</b>。";
    } else if (!hasStage) {
      line1 = "① 提前升：赚 <b>—</b>（未填推图收益）/ 等到开放日再开箱可多赚 <b>" + loseTxt + "</b> 级 → 没有可提前拿到的推图收益，"
        + (lose > 0 ? "<b>建议等新主线开放后再梭哈</b>。" : "现在梭哈即可。");
    } else {
      line1 = "① 提前升：赚 <b>" + earn + "</b> 级（提前推图收益）/ 等到开放日再开箱可多赚 <b>" + loseTxt + "</b> 级（同一批箱子按更高基地收益折算）→ "
        + (earn >= lose
          ? "<b>现在就升更划算</b>（赚 " + earn + " 级 ≥ 多赚 " + loseTxt + " 级）"
          : "<b>等新主线开放后再升更划算</b>（赚 " + earn + " 级 &lt; 多赚 " + loseTxt + " 级）") + "。";
    }
    b3.appendChild(el("div", line1, "sb-text"));

    /* ② 推图节点（R40 按用户口径重定义）
       用户定义：我如果今天提前开一些等级 →（战力够）推困难 → 推到「基地红球收益 +2/h」
                 → 从那天到新主线开放日期间多累积的收益，跟「主线开放日那天再开箱」比，亏还是赚。
       实现：赚 = 等待期红球收益增量（+2/h × 每日小时数 × 到开放日天数）
                  + 这段困难推图的一次性红球（按章汇总近似，仓库无逐关奖励数据）；
            亏 = 提前开箱的代价「屯箱子多升 lose 级」→ 按「全箱梭哈多升 1 级 ≈ plus1 个 1H 箱」折合。
       ⚠ 「红球上限」= 当前基地红球每小时收益；+2 = 在此基础上 +2/h（用户 2026-10-16 明确）。 */
    // 「全箱梭哈再多升 1 级」需多少 1H 箱：以 nowLv+1 为目标跑最优均衡求解（不可达 → 必给 target_shortage）
    var plus1 = 0;
    var be1 = B.bestEffortPlan(snap, snap.bare_resources, Math.max(1, nowLv - snap.current_sync_level + 1), snap.income_per_hour);
    if (be1 && be1.found && be1.plan && be1.plan.target_shortage) {
      plus1 = foldNeed(be1.plan.target_shortage, snap.income_per_hour).max;
    }
    var rateNow = (snap.income_per_hour || {}).core_dust || 0;
    var RATE_ADD = 2;
    var rateTarget = rateNow + RATE_ADD;
    var lbNow = snap.base_level || 0;
    var lbTarget = null;
    if (rateNow > 0 && O && O.incomeForLevel) {
      // 收益表有 _mul（战术加成）与非 _mul 两套：先按当前收益判定用的是哪一套，再逐级反查
      var pT = O.incomeForLevel(lbNow, true), pF = O.incomeForLevel(lbNow, false);
      var useMul = (!pT || !pF) ? true
        : (Math.abs((pT.core_dust || 0) - rateNow) <= Math.abs((pF.core_dust || 0) - rateNow));
      for (var lv2 = lbNow; lv2 <= 800; lv2++) {
        var inc2 = O.incomeForLevel(lv2, useMul);
        if (inc2 && (inc2.core_dust || 0) >= rateTarget - 1e-9) { lbTarget = lv2; break; }
      }
    }
    var dBase = (lbTarget !== null) ? Math.max(0, lbTarget - lbNow) : 0;
    var dStage = dBase * 5;                 // 每 5 关（普通+困难合计）+1 基地等级 → 推困难 dStage 关
    var dHardDust = dStage > 0 ? hardPushDust(dStage, chapterNum(val("f_hard_chapter")) + 1) : 0;
    var dailyHours2 = 24 + (snap.daily_full === false ? 0
      : (snap.daily_wipeout_count || 0) * (snap.wipeout_hours_each || 0));
    var openMs2 = snap.main_story_open_at ? new Date(snap.main_story_open_at).getTime() : null;
    /* R62：收益按精确小时算（连续流），展示与歼灭按完整天数算（floor）。
       此前同一个变量既当收益乘数又当展示天数、且用 round，与 scenarios.js 的 floor 口径不一致。 */
    var daysToOpenExact = (openMs2 && !isNaN(openMs2))
      ? Math.max(0, (openMs2 - snap.recorded_at.getTime()) / 86400000) : 0;
    var daysToOpen = Math.floor(daysToOpenExact + 1e-9);
    var rateGainDust = RATE_ADD * dailyHours2 * daysToOpenExact;
    var gainDust = rateGainDust + dHardDust;
    var gainBoxes = rateNow > 0 ? gainDust / rateNow : 0;   // 1H 芯尘盒 = 该资源 1 小时的收益
    var costBoxes = lose * plus1;
    var line2;
    if (rateNow <= 0) {
      line2 = "② 推图节点：未填写红球收益，无法折算「提前开箱推图」的收益。";
    } else {
      line2 = "② 推图节点：今天提前开箱升级、把困难推到「基地红球收益 +" + RATE_ADD + "/h」"
        + (lbTarget !== null
          ? "（基地 " + lbNow + " → <b>" + lbTarget + "</b> 级、约 +" + dStage + " 关）"
          : "（当前收益表内已无更高档，视为推满）")
        + "：到开放日（" + daysToOpen + " 天）多累积红球 ≈ <b>" + fmtNum(gainDust) + "</b> 个"
        + "（收益增量 " + fmtNum(rateGainDust) + " + 推图一次性 " + fmtNum(dHardDust) + "）"
        + " ≈ <b>" + fmtInt(Math.round(gainBoxes)) + " 个 1H 芯尘盒</b>；"
        + "而提前开箱要放弃「等到开放日再开箱可多赚」的 <b>" + lose + "</b> 级 ≈ <b>" + fmtInt(costBoxes) + " 个 1H 箱</b> → "
        + (costBoxes <= 0
          ? "提前开箱没有代价，<b>可提前开箱推图</b>"
          : (gainBoxes >= costBoxes
            ? "提前推图的收益 <b>≥</b> 放弃的多赚，<b>提前开箱推图划算</b>"
            : "提前推图的收益 <b>&lt;</b> 放弃的多赚，<b>不如等新主线开放日再开箱推图</b>"))
        + "。（红球收益按基地等级表反查；一次性红球按章汇总近似，仓库无逐关红球节点数据）";
    }
    b3.appendChild(el("div", line2, "sb-text"));

    // ③ 自然升级
    var days = result.no_box ? result.no_box.days : null;
    var line3 = "③ 自然升级：完全不开箱，靠每日收益自然增长到目标 <b>同步器 " + target + "</b> 需 <b>"
      + ((days != null && isFinite(days)) ? fmtDays(days) : "—") + "</b> 天。";
    b3.appendChild(el("div", line3, "sb-text"));
    wrap.appendChild(b3);
    return wrap;
  }

  function renderRaw(result) {
    $("tabRaw").innerHTML = "";
    var bar = el("div", "", "raw-toolbar");
    var exportBtn = el("button", "⬇ 下载原始 JSON", "btn btn-export");
    exportBtn.addEventListener("click", exportResultJson);
    bar.appendChild(exportBtn);
    $("tabRaw").appendChild(bar);
    var pre = el("pre", JSON.stringify(result, null, 2), "raw");
    $("tabRaw").appendChild(pre);
  }

  /* ---------- 收益账单：独立工具页（ledger.html）的数据来源 ----------
     R47：账单从「结果区第 3 个 tab」拆到左侧导航的独立工具页，口径与渲染全部在 js/ledger.js（唯一来源）。
     这里只做一件事：每次计算完把「账单需要的指标切片」落进 localStorage，供 ledger.html 读取。
     ⚠ 只存费率 / 推图收益 / 活动 / 开放日这几个字段，不存整份表单，也不参与任何计算口径。 */
  function saveLedgerSnapshot(snap) {
    if (!LEDGER || typeof LEDGER.snapSlice !== "function") return;
    try {
      localStorage.setItem(LEDGER.SNAP_KEY, JSON.stringify(LEDGER.snapSlice(snap, state.form)));
    } catch (e) { /* 隐私模式 / 配额满：静默降级，账单页会提示「还没有数据」 */ }
  }

  /* ---------- 计算入口 ---------- */
  /* 对外入口：先亮 loading，再让出主线程两帧（确保 loading 已被真正绘制），最后跑同步计算。
     ⚠ 不要在这里直接写业务逻辑：真正的计算在 runCalc() 里。
     ⚠ 计算期间按钮 disabled：避免用户连点导致多次渲染。 */
  function calculate() {
    showCalcLoading();
    var fired = false;
    function go() {
      if (fired) return;      // 正常走 rAF，兜底定时器到点后直接返回
      fired = true;
      try {
        runCalc();
      } finally {
        hideCalcLoading();
      }
    }
    // 双 rAF：第一帧把 loading 写进渲染树，第二帧确保已经绘制出来，之后才跑同步计算
    // （后台标签页 / 无头环境下 rAF 可能被节流甚至不触发 → 用 setTimeout 兜底，绝不让计算卡住）
    requestAnimationFrame(function () {
      requestAnimationFrame(go);
    });
    setTimeout(go, 260);
  }

  function runCalc() {
    try {
      var snap = buildSnapshot();
      // 「每种箱保留 1 个」：计算用保留后的快照（表单与页面显示仍为原始库存）
      var snapCalc = S.applyKeepOneBox(snap);
      state.lastSnapshot = snap;
      state.lastResult = S.evaluate(snapCalc);
      $("resultSection").style.display = "";
      renderResult(state.lastResult, snapCalc);
      renderExtra(state.lastResult, snapCalc);
      renderRaw(state.lastResult);
      saveForm();
      // 收益账单快照（独立工具页 ledger.html 的数据来源）：必须在 saveForm() 之后，
      // 才能把本次的 saved_at / capture_time 一起记进切片，供账单页判断「表单是否又改过」
      saveLedgerSnapshot(snapCalc);
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
      // 快捷同步（默认开）：本地已在上面 saveForm()，这里补云端上传（未登录则静默跳过）
      autoSyncAfterCalc();
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
  /* 导出 loading 遮罩（纯 CSS 动画，html2canvas 期间主线程繁忙仍能转动） */
  function showExportLoading() {
    var l = $("exportLoading");
    if (!l) {
      l = el("div", "", "export-loading");
      l.id = "exportLoading";
      l.innerHTML = '<div class="export-loading-box"><div class="export-spinner"></div><div class="export-loading-text">正在生成图片，请稍候…</div></div>';
      document.body.appendChild(l);
    }
    l.style.display = "flex";
  }
  function hideExportLoading() {
    var l = $("exportLoading");
    if (l) l.style.display = "none";
  }

  function exportResultJson() {
    if (!state.lastResult) { alert("请先点击「开始计算」生成结果后再导出。"); return; }
    download("NIKKE计算结果_" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(state.lastResult, null, 2), "application/json");
  }

  function exportResultImage() {
    if (!state.lastResult) { alert("请先点击「开始计算」生成结果后再导出。"); return; }
    showExportLoading();   // 先出遮罩：首次导出需现加载 html2canvas（约 200KB，之后走缓存）
    ensureVendor("html2canvas").then(runExportResultImage).catch(function () {
      hideExportLoading();
      alert("图片导出组件加载失败，请检查网络后重试。");
    });
  }

  function runExportResultImage() {
    var rs = $("resultSection");
    // 固定导出画布宽度：手机窄屏导出时按桌面宽度排版，避免多列文本被压缩显示不齐
    var EXPORT_W = 1080;
    // 仅导出「计算结果」内容：只展开 tabResult，补充信息 / 原始 JSON 不纳入
    // 注意：必须显式 display:"block"（空字符串会被 .tab-panel{display:none} 类规则重新隐藏，导致内容截不到）
    var panels = document.querySelectorAll(".tab-panel");
    var prev = [];
    panels.forEach(function (p) {
      prev.push(p.style.display);
      p.style.display = (p.id === "tabResult") ? "block" : "none";
    });
    showExportLoading();
    // 先让 loading 渲染一帧再启动截图（避免首帧空白）；截图期间主线程繁忙，CSS 动画仍可播放
    setTimeout(function () {
      // 按实际内容高度裁剪，避免 fixed 全屏背景层把画布撑出大段空白
      // 预留：顶部注入标题约 104px + 导出面板上下 padding 约 44px + 底部留白约 14px
      var H = rs.scrollHeight + 160;
      html2canvas(rs, {
        backgroundColor: "#ffffff",
        scale: 1.5,           // 降低 scale 显著减少生成耗时（原 2）
        width: EXPORT_W,
        height: H,
        windowWidth: EXPORT_W,
        windowHeight: H,
        useCORS: true,
        logging: false,
        onclone: function (clonedDoc) {
          // 将克隆文档整体固定到内容高度并裁掉溢出，避免固定背景层/悬浮物残留成大段空白
          var root = clonedDoc.documentElement;
          var cbody = clonedDoc.body;
          root.style.height = H + "px";
          root.style.overflow = "hidden";
          cbody.style.height = H + "px";
          cbody.style.minHeight = "0";
          cbody.style.overflow = "hidden";
          // 隐藏 body 级 fixed 全屏背景（角色立绘/渐变遮罩）
          var st = clonedDoc.createElement("style");
          st.textContent = "html,body{background-image:none !important;}body::before,body::after{content:none !important;display:none !important;background-image:none !important;}";
          clonedDoc.head.appendChild(st);
          // 隐藏页面固定悬浮元素（仅保留结果内容）
          clonedDoc.querySelectorAll(".btn-calc-fab,.save-tip,#exportLoading")
            .forEach(function (n) { n.style.display = "none"; });
          var panel = clonedDoc.getElementById("resultSection");
          if (panel) {
            panel.classList.add("export-mode");
            // 导出按固定宽排版，避免文本压缩
            panel.style.width = EXPORT_W + "px";
            panel.style.maxWidth = "none";
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
            hideExportLoading();
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
          hideExportLoading();
          alert("导出失败：" + e.message);
        });
    }, 60);
  }

  /* ---------- XLSX 导入/导出 ---------- */
  function buildXlsxTemplate() {
    var f = collectForm();
    f.capture_time = nowTime();                  // 下载时自动写入采集时刻，免手填
    var aoa = [
      ["字段", "值"],
      ["数据日期", f.recorded], ["最近保存日期", f.saved_at], ["采集时刻", f.capture_time], ["采集前已回收基地", f.collected_before], ["当前同步器等级", f.current], ["目标同步器等级", f.target], ["后续追求目标等级", f.alternate],
      ["普通主线进度", f.normal_stage], ["困难主线进度", f.hard_stage], ["基地防御等级", f.base], ["战术学院满级", f.tactics],
      ["信用点收益", f.credit_rate], ["战斗数据收益", f.battle_rate], ["红球收益", f.dust_rate],
      ["每日歼灭次数", f.wipeouts], ["每次小时数", f.wipeout_hours], ["今天已完成", f.completed],
      ["现有信用点", f.bare_credit], ["现有战斗数据", f.bare_battle], ["现有红球", f.bare_dust],
      ["推图计入范围", f.stage_clear_mode],
      ["推图信用点(普通)", f.stage_clear_credit], ["推图战斗数据(普通)", f.stage_clear_battle], ["推图红球(普通)", f.stage_clear_dust],
      ["推图信用点(困难)", f.stage_clear_credit2], ["推图战斗数据(困难)", f.stage_clear_battle2], ["推图红球(困难)", f.stage_clear_dust2],
      ["主线任务信用点", f.stage_clear_task_credit], ["主线任务战斗数据", f.stage_clear_task_battle], ["主线任务红球", f.stage_clear_task_dust],
      ["每级信用点(覆盖)", f.cost_credit], ["每级战斗数据(覆盖)", f.cost_battle], ["每级红球(覆盖)", f.cost_dust],
      ["方舟箱", f.ark], ["30天箱", f.growth], ["挑战者箱", f.challenger],
      ["预计新主线开放日", f.future_open], ["预计普通进度", f.future_normal_stage], ["预计困难进度", f.future_hard_stage], ["预计基地等级", f.future_base],
    ];
    // 固定小时箱数量（每日收益采集需保全各色/时长，导入时会回填表单）
    var FL = ["芯尘盒", "信用点盒", "战斗数据辑盒", "成长套组"], DH = ["24", "12", "8", "4", "2", "1"];
    FL.forEach(function (l) { DH.forEach(function (h) { aoa.push(["固定箱·" + l + "·" + h + "h", ((f.fixed && f.fixed[l]) ? f.fixed[l][h] : 0)]); }); });
    aoa.push(["备注", ""]);   // 每日采集填写：今日是否升级/开箱/领一次性奖励（供收益差分参考）
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 24 }, { wch: 20 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "账号评估");
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  function importXlsx(file) {
    ensureVendor("xlsx").then(function () { readXlsxFile(file); }).catch(function () {
      alert("Excel 组件加载失败，请检查网络后重试。");
    });
  }

  function readXlsxFile(file) {
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
          "数据日期": "recorded", "最近保存日期": "saved_at", "采集时刻": "capture_time", "采集前已回收基地": "collected_before", "当前同步器等级": "current", "目标同步器等级": "target", "后续追求目标等级": "alternate",
          "普通主线进度": "normal_stage", "困难主线进度": "hard_stage", "基地防御等级": "base", "战术学院满级": "tactics",
          "信用点收益": "credit_rate", "战斗数据收益": "battle_rate", "红球收益": "dust_rate",
          "每日歼灭次数": "wipeouts", "每次小时数": "wipeout_hours", "今天已完成": "completed",
          "现有信用点": "bare_credit", "现有战斗数据": "bare_battle", "现有红球": "bare_dust",
          "推图计入范围": "stage_clear_mode",
          "推图信用点(普通)": "stage_clear_credit", "推图战斗数据(普通)": "stage_clear_battle", "推图红球(普通)": "stage_clear_dust",
          "推图信用点(困难)": "stage_clear_credit2", "推图战斗数据(困难)": "stage_clear_battle2", "推图红球(困难)": "stage_clear_dust2",
          "主线任务信用点": "stage_clear_task_credit", "主线任务战斗数据": "stage_clear_task_battle", "主线任务红球": "stage_clear_task_dust",
          "每级信用点(覆盖)": "cost_credit", "每级战斗数据(覆盖)": "cost_battle", "每级红球(覆盖)": "cost_dust",
          "方舟箱": "ark", "30天箱": "growth", "挑战者箱": "challenger",
          "预计新主线开放日": "future_open", "预计普通进度": "future_normal_stage", "预计困难进度": "future_hard_stage", "预计基地等级": "future_base",
        };
        Object.keys(FIELD).forEach(function (k) {
          if (map[k] !== undefined && map[k] !== "") f[FIELD[k]] = map[k];
        });
        // 回填固定小时箱数量
        var FL = ["芯尘盒", "信用点盒", "战斗数据辑盒", "成长套组"], DH = ["24", "12", "8", "4", "2", "1"];
        FL.forEach(function (l) { DH.forEach(function (h) {
          var key = "固定箱·" + l + "·" + h + "h";
          if (map[key] !== undefined && map[key] !== "") {
            if (!f.fixed[l]) f.fixed[l] = {};
            f.fixed[l][h] = parseInt(map[key], 10) || 0;
          }
        }); });
        state.form = f;
        renderForm();
        // 直接持久化并保留导入的「最近保存日期」，不覆盖为今天
        try { localStorage.setItem(LS_KEY, JSON.stringify(state.form)); } catch (e) {}
        tip("XLSX 导入成功，已刷新表单");
      } catch (err) {
        alert("XLSX 读取失败：" + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------- 计算中的加载反馈（顶部进度条 + 按钮 spinner） ----------
     计算是**同步阻塞**的：若「点击 → 立刻算」，浏览器根本没机会把 loading 画出来，
     用户只会感觉「卡了一下、然后结果突然出现」。故先亮起 loading，等浏览器真正
     绘制出两帧之后再跑计算。

     ⚠ 进度条必须用 transform 动画（合成线程）：主线程被 JS 占满时它照样能滑；
       若用 left / width 动画会跟着主线程一起冻住，等于没有反馈。 */
  var CALC_MIN_MS = 240;      // loading 最短可见时长，避免"闪一下"完全看不出发生了什么
  var calcLoadingT0 = 0;      // 本轮 loading 的起始时间戳
  var calcHideTimer = null;   // 延迟隐藏的定时器

  function calcBar() {
    var bar = $("calcBar");
    if (!bar) {
      bar = el("div", "", "calc-bar");
      bar.id = "calcBar";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", "正在计算");
      document.body.appendChild(bar);
    }
    return bar;
  }

  function showCalcLoading() {
    if (calcHideTimer) { clearTimeout(calcHideTimer); calcHideTimer = null; }
    calcLoadingT0 = Date.now();
    calcBar().classList.add("is-on");
    [$("btnCalc"), $("btnCalcFab")].forEach(function (b) {
      if (!b) return;
      b.classList.add("is-loading");
      b.setAttribute("aria-busy", "true");
      b.disabled = true;
    });
  }

  function hideCalcLoading() {
    // 不足最短时长则补足，避免"一瞬间全白"看不出发生了计算
    var wait = Math.max(0, CALC_MIN_MS - (Date.now() - calcLoadingT0));
    if (calcHideTimer) clearTimeout(calcHideTimer);
    calcHideTimer = setTimeout(function () {
      calcHideTimer = null;
      var bar = $("calcBar");
      if (bar) bar.classList.remove("is-on");
      [$("btnCalc"), $("btnCalcFab")].forEach(function (b) {
        if (!b) return;
        // 文字由 markCalculated()/resetCalcButton() 管理，这里只撤 loading 态
        b.classList.remove("is-loading");
        b.removeAttribute("aria-busy");
        b.disabled = false;
      });
    }, wait);
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 跨设备同步：弹窗
    $("btnShare").addEventListener("click", function () { buildShareModal().open(); });

    // 活动收益：添加/移除活动行（动态行用事件委托，避免重复绑定）+ 实时刷新预览
    $("btnAddEvent").addEventListener("click", function () {
      syncActivitiesFromRows();
      var tpls = EV ? EV.templateList() : [];
      state.form.activities = state.form.activities || [];
      state.form.activities.push({ template: tpls.length ? tpls[0].id : "large28", start_date: todayLocal() });
      renderActivityRows();
      onFormChange();
    });
    $("eventRows").addEventListener("click", function (e) {
      var btn = (e.target && e.target.closest) ? e.target.closest(".ev-del") : null;
      if (!btn) return;
      var row = btn.closest(".event-row");
      if (row) row.parentNode.removeChild(row);
      syncActivitiesFromRows();
      updateActivityTotals();
      onFormChange();
    });
    $("eventRows").addEventListener("change", function (e) {
      if (e.target && e.target.classList &&
          (e.target.classList.contains("ev-template") || e.target.classList.contains("ev-start"))) {
        updateActivityTotals();
      }
    });
    // 数据日期变化 → 活动计入区间随之变化
    $("f_recorded").addEventListener("change", updateActivityTotals);
    // 「更新为今天」：先把日期写成今天，再同时跑两条链
    //   ① updateActivityTotals()：数据日期是活动状态的基准日（F5）
    //   ② onFormChange()：collectForm / saveForm / resetCalcButton
    // 注意：不能只调其中一个 —— f_recorded 的 change 只绑了 updateActivityTotals，
    //       而 form 的 change 委托链不覆盖它，故此处显式两条都跑。
    if ($("btnToday")) {
      $("btnToday").addEventListener("click", function (e) {
        e.preventDefault();
        setVal("f_recorded", todayLocal());
        updateActivityTotals();
        onFormChange();
      });
    }

    // R15/§9.5：「今天已完成歼灭次数」默认跟随「每日一举歼灭次数」，用户单独改过即不再跟随；
    //          边界 = completed ≤ wipeouts（越界截断 + 轻提示）
    function syncCompletedFromWipeouts() {
      var w = parseInt(val("f_wipeouts"), 10);
      if (isNaN(w) || w < 0) { w = 0; setVal("f_wipeouts", "0"); return; }
      if (!state.completedAuto) return;
      setVal("f_completed", String(w));
    }
    $("f_wipeouts").addEventListener("input", syncCompletedFromWipeouts);
    $("f_wipeouts").addEventListener("change", syncCompletedFromWipeouts);
    $("f_completed").addEventListener("change", function () {
      var w = parseInt(val("f_wipeouts"), 10); if (isNaN(w) || w < 0) w = 0;
      var c = parseInt(val("f_completed"), 10); if (isNaN(c) || c < 0) c = 0;
      if (c > w) {
        c = w; setVal("f_completed", String(c));
        tip("「今天已完成歼灭次数」不能超过「每日一举歼灭次数」，已截断为 " + w + "。");
      }
      // 与 wipeouts 相等 → 视为仍跟随；不等 → 用户已自定义（不再被 wipeouts 覆盖）
      state.completedAuto = (String(c) === String(w));
      onFormChange();
    });
    // 同一页面内改 #data= hash（如直接粘贴/扫码改链接）也即时恢复
    window.addEventListener("hashchange", restoreFromShareHash);
    // 普通章节 -> 困难跟随 + 未来+2
    $("f_normal_chapter").addEventListener("change", function () {
      syncStageOptions("normal");
      setVal("f_normal_stage", lastStage("normal", val("f_normal_chapter")));
      // 先让困难章节强制跟降（enforceHardCap 会改写困难章节/关卡），再做基地推算，避免推算用了旧的困难状态
      enforceHardCap();
      syncCurrentBase(true);
      syncFutureNormal();
      onFormChange();
    });
    $("f_normal_stage").addEventListener("change", function () { syncCurrentBase(true); onFormChange(); });

    // 困难章节（手动 -> 标记 + 上限约束 + 未来困难+2）
    $("f_hard_chapter").addEventListener("change", function () {
      state.normalManual = true;
      syncStageOptions("hard");
      setVal("f_hard_stage", lastStage("hard", val("f_hard_chapter")));
      enforceHardCap();
      syncCurrentBase(true);
      syncFutureHard();
      onFormChange();
    });
    $("f_hard_stage").addEventListener("change", function () { state.normalManual = true; syncCurrentBase(true); onFormChange(); });

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

    // 切服：先收敛越界值再重绘（不走通用 change 绑定，避免"先保存旧值再修正"的时序问题）
    var srvSel = $("f_server");
    if (srvSel) srvSel.addEventListener("change", function () {
      paintServerTabs(srvSel.value);
      applyServerSwitch(srvSel.value);
    });
    /* R66：「关卡进度」标题行的分段选项卡。点一下把值写回隐藏的 #f_server 再走同一条链路，
       所以行为与原来下拉框完全一致（含越界关卡收敛与存档落盘），只是不再弹 toast。
       ⚠ 选项卡长在 <legend> 里，而手机端 legend 的 click 会折叠整个分组
       （setupMobileForm）→ 必须 stopPropagation，否则点一下切服就把「关卡进度」收起来。 */
    document.querySelectorAll(".srv-tab").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = b.getAttribute("data-srv");
        if (!srvSel) return;
        if (srvSel.value !== key) { srvSel.value = key; applyServerSwitch(key); }
        paintServerTabs(key);   // 同值点击也刷一次选中态，避免外部改过值后视觉不同步
      });
      // 触屏上 mousedown/touchstart 也会冒泡到 legend，一并掐掉
      ["mousedown", "touchstart"].forEach(function (n) {
        b.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true });
      });
    });

    $("f_tactics").addEventListener("change", function () { syncCurrentBase(); syncIncomeFromBase(); syncFutureBase(); onFormChange(); });
    // R40：「计入范围」决定「预计新主线推图收益」标题里列哪几章 → 变更后必须重刷标题
    $("f_stage_mode").addEventListener("change", function () {
      updateStageClearUI();
      if (state.stageClearEntries && Object.keys(state.stageClearEntries).length) syncStageClearFromFuture();
      onFormChange();
    });
    $("f_future_open").addEventListener("change", onFormChange);
    $("f_base").addEventListener("change", function () { syncIncomeFromBase(); syncCurrentBase(); onFormChange(); });
    $("btnAdoptBase").addEventListener("click", function () {
      var level = currentCalculatedBase();
      if (!level) return;
      setVal("f_base", level);
      syncIncomeFromBase();
      syncCurrentBase();
      onFormChange();
    });
    $("f_current").addEventListener("change", function () { syncCostFromLevel(); onFormChange(); });
    $("f_target").addEventListener("change", function () { renderCostPreview(); onFormChange(); });
    $("f_alternate").addEventListener("change", function () { renderCostPreview(); onFormChange(); });

    // 通用输入变化 -> 自动保存
    document.querySelectorAll("#formSection input, #formSection select").forEach(function (el) {
      if (["f_normal_chapter", "f_normal_stage", "f_hard_chapter", "f_hard_stage",
           "f_future_normal_chapter", "f_future_normal_stage", "f_future_hard_chapter", "f_future_hard_stage",
           "f_tactics", "f_stage_mode", "f_server"].indexOf(el.id) >= 0) return;
      el.addEventListener("change", onFormChange);
      el.addEventListener("input", onFormChange);
    });

    $("btnCalc").addEventListener("click", calculate);
    $("btnExportImg").addEventListener("click", exportResultImage);
    $("btnSave").addEventListener("click", function () { saveForm(); tip("已保存当前表单"); });
    bindAutoSync();
    $("btnTemplate").addEventListener("click", function () {
      ensureVendor("xlsx").then(function () {
        download("账号评估表单.xlsx", buildXlsxTemplate(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }).catch(function () {
        alert("Excel 组件加载失败，请检查网络后重试。");
      });
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

    // 悬浮进度球已移除（用户 2026-10-17：基本没啥用）
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
    loadAutoSyncPref();
    /* 顺序有依赖：先读服务器档案 → 再读关卡表 → 才能按档案截断出章节/关卡列表 */
    (SV ? SV.load() : Promise.resolve(null))
      .then(function () { return Promise.all([O.loadStageMap(), O.loadIncomeTable()]); })
      .then(function () {
        // servers.js 若被浏览器拦截/加载失败，退回国际服口径（此时 outpost.js 的默认值就是国际服）
        if (SV) applyServerRuntime(state.form.server || "cn");
        else rebuildStageTables();
        if (state.fresh) applyServerDefaults();
        // 阶梯消耗表（带版本参数，避开 Pages/浏览器缓存导致档位表不生效）
        return fetch("data/level_cost_table.json?v=20260917b").then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.kind === "tiered_per_level") COST_TIERS = d.tiers || [];
        }).catch(function () { COST_TIERS = []; });
      })
      .then(function () {
        return fetch("data/stage_clear_resources.json?v=20261014a").then(function (r) { return r.json(); }).then(function (d) {
          state.stageClearEntries = (d && d.chapters) || {};
          state.stageClearFallback = (d && d.fallback_chapter) || null;
        }).catch(function () { state.stageClearEntries = {}; state.stageClearFallback = null; });
      })
      .then(loadEventTemplates)
      .then(function () {
        renderForm();
        bindEvents();
        setupMobileForm();
        // 表单区静态信息图标（基地/关卡/推图收益/活动/其他）在此绑定；结果区动态图标由 renderResult 内自行再调一次
        initInfoTips(document);
        syncCostFromLevel();
        tip("就绪");
        // 携带 #data= 分享链接进入：自动恢复表单并出结果
        restoreFromShareHash();
      })
      .catch(function (e) {
        alert("数据加载失败：" + e.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
