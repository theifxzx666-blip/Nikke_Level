/* NIKKE 资源规划计算器 · 账号云同步  js/sync.js
 * 依赖：index.html 已用 CDN 引入 @supabase/supabase-js@2（全局 window.supabase）
 * 职责：邮箱+密码登录、每个功能独立「上传本地/下载云端」，登录后云端无数据时绝不覆盖本地。
 * 说明：只管 localStorage 数据，不侵入 app.js（IIFE）；下载后整页重载使界面生效。
 */
(function () {
  "use strict";

  /* ============ 配置（Supabase Project URL + 公开 key） ============ */
  /* 注意 URL 必须是 base（不带 /rest/v1/ 等路径），supabase-js 会自动拼接 */ 
  var SUPABASE_URL = "https://oologpjskkpjkvcpddhf.supabase.co";
  /* 新版 publishable key（等同 anon key，公开可用），受 RLS 保护 */
  var SUPABASE_ANON_KEY = "sb_publishable_6FzpENHzylm1M-NSvX6RBQ__Xlpv7Oc";

  /* ============ 数据源映射（feature id -> localStorage 键） ============ */
  var FEATURES = [
    { id: "planner",   name: "资源规划计算器", ls: "nikke_planner_form_v1" },
    { id: "mod_stats", name: "定制模组统计",   ls: "nikke_mod_stats_v3" }
  ];

  var sdk = window.supabase;
  var supabase = null;
  var curUser = null;

  /* ---------- 基础工具 ---------- */
  function configured() {
    return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !!sdk;
  }
  function getLocal(f) {
    try { return localStorage.getItem(f.ls); } catch (e) { return null; }
  }
  function hasLocal(f) {
    var v = getLocal(f); return !!(v && v !== "null");
  }
  function parseSafe(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function setLocalObject(f, obj) {
    try { localStorage.setItem(f.ls, JSON.stringify(obj)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(t) {
    if (!t) return "—";
    var d = new Date(t);
    return isNaN(d) ? "—" : d.toLocaleString("zh-CN", { hour12: false });
  }

  /* ---------- 样式（内联注入，浅色主题对齐） ---------- */
  var CSP = "synccss";
  function injectStyle() {
    if (document.getElementById(CSP)) return;
    var s = document.createElement("style");
    s.id = CSP;
    s.textContent =
      ".nk-acc-btn{background:#1d9e75;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:600 14px/1.4 'MaiYuan','Microsoft YaHei',sans-serif;cursor:pointer}" +
      ".nk-acc-btn:hover{background:#178a64}" +
      ".nk-ov{position:fixed;inset:0;background:rgba(15,35,28,.45);z-index:5000;display:none;align-items:flex-start;justify-content:center;padding:6vh 16px;box-sizing:border-box;overflow:auto}" +
      ".nk-ov.show{display:flex}" +
      ".nk-panel{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:min(520px,94vw);padding:20px 22px;box-sizing:border-box;font-family:'MaiYuan','Microsoft YaHei',sans-serif;color:#223}" +
      ".nk-panel h3{margin:0 0 4px;font-size:18px;color:#1d9e75}" +
      ".nk-hint{font-size:12px;color:#78817d;margin:0 0 14px}" +
      ".nk-field{margin-bottom:10px}" +
      ".nk-field label{display:block;font-size:12px;color:#556;margin-bottom:4px}" +
      ".nk-in{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #dde3e0;border-radius:8px;font-size:14px;background:#fbfdfc}" +
      ".nk-in:focus{outline:none;border-color:#1d9e75}" +
      ".nk-row{display:flex;gap:10px;margin-top:12px}" +
      ".nk-btn{flex:1;padding:10px 0;border:none;border-radius:9px;cursor:pointer;font-weight:600;font-size:14px;background:#1d9e75;color:#fff}" +
      ".nk-btn.ghost{background:#e8f3ef;color:#178a64}" +
      ".nk-btn.ghost2{background:#f1f3f2;color:#556}" +
      ".nk-btn:disabled{opacity:.55;cursor:not-allowed}" +
      ".nk-close{float:right;border:none;background:none;font-size:20px;cursor:pointer;color:#78817d;line-height:1}" +
      ".nk-user{font-size:13px;color:#334;margin-bottom:6px;word-break:break-all}" +
      ".nk-lock{float:right;font-size:11px;color:#fff;background:#9aa6a1;border-radius:20px;padding:2px 8px;margin-left:8px}" +
      ".nk-fea{border:1px solid #e4e9e6;border-radius:10px;padding:10px 12px;margin-top:10px;background:#fbfdfc}" +
      ".nk-fea h4{margin:0 0 6px;font-size:14px;color:#334}" +
      ".nk-stat{display:flex;justify-content:space-between;font-size:12px;color:#5a6660;margin-bottom:6px;flex-wrap:wrap;gap:4px}" +
      ".nk-empty{background:#fff7e6;border:1px solid #f2d48c;color:#9a6b00;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px}" +
      ".nk-bar{display:flex;gap:8px}" +
      ".nk-bar .nk-btn{font-size:13px;padding:7px 0}" +
      ".nk-tab{display:flex;gap:6px;margin-bottom:12px}" +
      ".nk-tab button{flex:1;padding:8px 0;border:1px solid #dde3e0;background:#fbfdfc;border-radius:8px;cursor:pointer;font:600 13px 'MaiYuan','Microsoft YaHei',sans-serif;color:#556}" +
      ".nk-tab button.on{background:#1d9e75;border-color:#1d9e75;color:#fff}" +
      ".nk-errbar{background:#fdeaea;border:1px solid #f2c1c1;color:#b3312d;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px}" +
      ".nk-pwrow{position:relative}" +
      ".nk-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;color:#1d9e75;background:none;border:none;cursor:pointer;padding:2px 4px}";
    document.head.appendChild(s);
  }

  /* ============ 面板 DOM ============ */
  var $ov, $panel, $inner;
  function buildUI() {
    if (document.getElementById("nkSyncPanel")) return;
    $ov = document.createElement("div");
    $ov.className = "nk-ov";
    $ov.id = "nkSyncPanel";
    $ov.innerHTML =
      '<div class="nk-panel">' +
        '<span class="nk-close" id="nkClose">×</span>' +
        '<h3>账号云同步</h3>' +
        '<p class="nk-hint">登录后按功能分别「上传本地 / 下载云端」。云端无数据时绝不覆盖当前页面。</p>' +
        '<div id="nkInner"></div>' +
      "</div>";
    $panel = $ov.firstChild;
    $inner = $panel.querySelector("#nkInner");
    $panel.querySelector("#nkClose").addEventListener("click", close);
    $ov.addEventListener("click", function (e) { if (e.target === $ov) close(); });
    document.body.appendChild($ov);
  }

  function open() { buildUI(); injectStyle(); $ov.classList.add("show"); render(); }
  function close() { if ($ov) $ov.classList.remove("show"); }
  function tip(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    // 已在显示中则只更新文字、不重放动画，避免与 app.js 的提示"弹两次"
    var showing = t.classList.contains("show");
    t.textContent = msg;
    if (!showing) { t.classList.remove("show"); void t.offsetWidth; t.classList.add("show"); }
    clearTimeout(tip._t); tip._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ============ 渲染 ============ */
  function render() {
    if (!configured()) {
      var noCfg = !SUPABASE_URL || !SUPABASE_ANON_KEY;
      $inner.innerHTML = '<div class="nk-empty">' +
        (noCfg
          ? "云同步功能当前未配置，暂时无法使用云端同步。"
          : "同步组件加载失败，可能是网络受限导致。请刷新页面重试；若仍不行，请更换网络后稍后再来。") +
        "</div>";
      return;
    }
    if (!curUser) { renderAuth(); return; }
    renderAccount();
  }

  var authMode = "login";
  function renderAuth() {
    var m = authMode;
    var confirm = m === "register" ?
      '<div class="nk-field"><label>确认密码</label><div class="nk-pwrow"><input class="nk-in" id="nkPass2" type="password" placeholder="再输一次" autocomplete="new-password"></div><button type="button" class="nk-eye" data-eyes data-for="nkPass2">显示</button></div>' :
      "";
    $inner.innerHTML =
      '<div class="nk-tab">' +
        '<button class="' + (m === "login" ? "on" : "") + '" data-mode="login">登录</button>' +
        '<button class="' + (m === "register" ? "on" : "") + '" data-mode="register">注册</button>' +
      "</div>" +
      '<div class="nk-field"><label>邮箱</label><input class="nk-in" id="nkEmail" type="email" placeholder="you@example.com" autocomplete="username"></div>' +
      '<div class="nk-field"><label>密码</label><div class="nk-pwrow"><input class="nk-in" id="nkPass" type="password" placeholder="至少 6 位" autocomplete="current-password"></div><button type="button" class="nk-eye" data-eyes data-for="nkPass">显示</button></div>' +
      confirm +
      '<div id="nkAuthErr"></div>' +
      '<div class="nk-row"><button class="nk-btn" id="nkAuthGo">' + (m === "login" ? "登录" : "注册") + "</button></div>" +
      '<p class="nk-hint" style="margin-top:10px">注册后需到邮箱点确认邮件再登录。</p>';
    $inner.querySelectorAll("[data-eyes]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = $inner.querySelector("#" + b.getAttribute("data-for"));
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        b.textContent = show ? "隐藏" : "显示";
      });
    });
    $inner.querySelector("#nkAuthGo").addEventListener("click", function () { doAuth(m); });
    $inner.querySelectorAll("[data-mode]").forEach(function (t) {
      t.addEventListener("click", function () {
        var nm = t.getAttribute("data-mode");
        if (nm === m) return;
        authMode = nm === "register" ? "register" : "login";
        renderAuth();
      });
    });
    $inner.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("keydown", function (e) { if (e.key === "Enter") doAuth(m); });
    });
  }

  function renderAccount() {
    var u = curUser;
    $inner.innerHTML =
      '<div><span class="nk-close" style="position:static" id="nkLogout">登出</span></div>' +
      '<p class="nk-user">已登录：' + esc(u.email || u.id) + "</p>" +
      '<div id="nkFeaList"><div class="nk-empty">正在检查云端数据…</div></div>';
    $inner.querySelector("#nkLogout").addEventListener("click", function () {
      supabase.auth.signOut().finally(function () { curUser = null; render(); });
    });
    refreshFeatures();
  }

  /* ============ 云端状态检查（登录后） ============ */
  async function serverRow(fid) {
    var r = await supabase.from("sync_data")
      .select("feature,updated_at,data_json")
      .eq("uid", curUser.id).eq("feature", fid).limit(1);
    if (r.error) throw r.error;
    return (r.data && r.data[0]) || null;
  }
  function uploadOne(f, record) {
    return supabase.from("sync_data").upsert({
      uid: curUser.id, feature: f.id,
      data_json: record, updated_at: new Date().toISOString()
    }, { onConflict: "uid,feature" });
  }

  async function refreshFeatures() {
    var wrap = $inner.querySelector("#nkFeaList");
    if (!wrap) return;
    var states = [];
    var anyErr = false;
    for (var i = 0; i < FEATURES.length; i++) {
      var f = FEATURES[i];
      var st = { f: f, loc: hasLocal(f), ok: true, cloud: null, err: null };
      try { st.cloud = await serverRow(f.id); }
      catch (e) { st.ok = false; st.err = e.message; anyErr = true; }
      states.push(st);
    }
    var html = "";
    for (i = 0; i < states.length; i++) {
      var s = states[i];
      var cloudAt = s.ok ? (s.cloud ? s.cloud.updated_at : null) : "unknown";
      html += feaCard(s.f.id, s.f.name, s.loc, cloudAt);
      if (s.ok && s.cloud === null && s.loc) {
        // 核心需求：云端无 → 不覆盖本地，提示上传
        html += '<div class="nk-empty" data-for="' + s.f.id + '">云端尚无该功能数据。当前页面已保留，不会覆盖。请点「上传本地」同步。</div>';
      } else if (s.ok && s.cloud === null && !s.loc) {
        html += '<div class="nk-empty">云端与本地暂无数据。</div>';
      }
    }
    var pre = anyErr ? '<div class="nk-errbar">云端检查有异常，云端状态未知（本地数据未受影响）。上传仍可操作，「用云端覆盖」暂不可用。</div>' : "";
    wrap.innerHTML = pre + html;
    for (i = 0; i < states.length; i++) {
      attachFeaEvents(wrap, states[i].f.id, states[i].cloud, states[i].ok);
    }
  }

  function feaCard(fid, name, local, cloudAt) {
    var cloudText = cloudAt === "unknown" ? "未知（检查失败）" : (cloudAt ? fmtTime(cloudAt) : "无");
    return '<div class="nk-fea" data-fid="' + fid + '">' +
      '<h4>' + esc(name) + '</h4>' +
      '<div class="nk-stat"><span>本地：' + (local ? "有数据" : "无数据") + '</span>' +
      '<span>云端：' + cloudText + "</span></div>" +
      '<div class="nk-bar">' +
      '<button class="nk-btn" data-act="up">上传本地</button>' +
      '<button class="nk-btn ghost2" data-act="down">用云端覆盖</button>' +
      "</div></div>";
  }

  function attachFeaEvents(wrap, fid, cloud, ok) {
    var f = null;
    for (var i = 0; i < FEATURES.length; i++) if (FEATURES[i].id === fid) f = FEATURES[i];
    var isOk = ok !== false;
    var downBtn = wrap.querySelector("[data-fid='" + fid + "'] [data-act='down']");
    if (!isOk && downBtn) { downBtn.disabled = true; downBtn.title = "云端状态未知，暂不可下载"; }
    wrap.querySelectorAll("[data-fid='" + fid + "'] [data-act]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        var act = btn.getAttribute("data-act");
        try {
          if (act === "up") {
            var raw = getLocal(f);
            var obj = parseSafe(raw);
            if (!obj) { tip("本地无有效数据，无法上传"); return; }
            var r = await uploadOne(f, obj);
            if (r.error) throw r.error;
            tip("「" + f.name + "」已上传到云端");
          } else {
            if (!isOk) { tip("云端状态未知，暂不可下载"); return; }
            if (!cloud) { tip("云端无数据，无需下载"); return; }
            var dl = await supabase.from("sync_data")
              .select("data_json").eq("uid", curUser.id).eq("feature", fid).limit(1);
            if (dl.error) throw dl.error;
            var row = dl.data && dl.data[0];
            if (!row) { tip("云端数据已不存在"); return; }
            setLocalObject(f, row.data_json);
            tip("已下载「" + f.name + "」，正在刷新页面…");
            setTimeout(function () { location.reload(); }, 700);
          }
        } catch (e) {
          tip("操作失败：" + esc(e.message));
        } finally {
          btn.disabled = false;
          refreshFeatures();
        }
      });
    });
  }

  /* ============ 认证 ============ */
  async function doAuth(mode) {
    var email = $inner.querySelector("#nkEmail").value.trim();
    var pass = $inner.querySelector("#nkPass").value;
    var errEl = $inner.querySelector("#nkAuthErr");
    function setErr(s) { if (errEl) errEl.innerHTML = s ? '<div class="nk-errbar">' + esc(s) + "</div>" : ""; }
    setErr("");
    if (!email) { setErr("请输入邮箱"); return; }
    if (!pass) { setErr("请输入密码"); return; }
    if (pass.length < 6) { setErr("密码至少 6 位"); return; }
    if (mode === "register") {
      var pass2 = $inner.querySelector("#nkPass2").value;
      if (!pass2) { setErr("请再次输入确认密码"); return; }
      if (pass !== pass2) { setErr("两次输入的密码不一致，请重新输入"); return; }
    }
    var go = $inner.querySelector("#nkAuthGo");
    if (go) go.disabled = true;
    try {
      if (mode === "login") {
        var r = await supabase.auth.signInWithPassword({ email: email, password: pass });
        if (r.error) throw r.error;
        tip("登录成功");
        render();
      } else {
        var s = await supabase.auth.signUp({ email: email, password: pass });
        if (s.error) throw s.error;
        tip(s.data.session ? "注册成功，已登录" : "注册成功，请到邮箱确认后登录");
        if (s.data.session) { curUser = s.data.session.user; render(); }
      }
    } catch (e) {
      setErr("操作失败：" + e.message);
    } finally {
      if (go) go.disabled = false;
    }
  }

  /* ============ 按钮注入 ============ */
  function addTrigger() {
    var toolbar = document.querySelector(".hero-toolbar");
    if (!toolbar || document.querySelector("#nkSyncOpen")) return;
    var b = document.createElement("button");
    b.id = "nkSyncOpen";
    b.textContent = "👤 账号同步";
    b.title = "登录后云端同步你的数据";
    b.classList.add("nk-acc-btn");
    b.addEventListener("click", open);
    toolbar.appendChild(b);
  }

  /* 与「保存当前表单」联动：已登录时保存即自动上传计算器数据到云端 */
  function addSaveSync() {
    var save = document.getElementById("btnSave");
    if (!save || !configured()) return;
    save.addEventListener("click", function () {
      if (!supabase || !curUser) return;      // 未配置或未登录：保持原保存行为
      var f = FEATURES[0];                    // #btnSave 对应「资源规划计算器」数据
      setTimeout(function () {
        var obj = parseSafe(getLocal(f));
        if (!obj) { tip("已保存（本地无有效数据，未同步）"); return; }
        uploadOne(f, obj).then(function (r) {
          if (r.error) tip("已保存，但同步到云端失败：" + (r.error.message || "未知错误"));
          else tip("已保存并同步到云端");
        });
      }, 300);
    });
  }

  /* ============ 初始化 ============ */
  async function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { initSoon(); });
    } else initSoon();
  }
  function initSoon() {
    injectStyle();
    addTrigger();
    var btn = document.getElementById("nkSyncOpen");
    if (btn && configured()) btn.classList.add("nk-on");
    if (configured()) {
      try {
        supabase = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabase.auth.getSession().then(function (r) { if (r && r.data) curUser = r.data.session ? r.data.session.user : null; });
        supabase.auth.onAuthStateChange(function (e, s) {
          curUser = s ? s.user : null;
        });
      } catch (e) { supabase = null; }
      addSaveSync();
    }
  }

  /* 暴露给同源 iframe（定制模组统计页）复用账号同步面板；放在 init 之前，不依赖初始化是否成功 */
  window.__nikkeSync = { open: open };

  init();
})();