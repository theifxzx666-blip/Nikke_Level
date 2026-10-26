/* NIKKE 资源规划计算器 · 账号云同步  js/sync.js
 * 依赖：index.html 已用 CDN 引入 @supabase/supabase-js@2（全局 window.supabase）
 * 职责：邮箱+密码登录、每个功能独立「上传本地/下载云端」，登录后云端无数据时绝不覆盖本地。
 * 说明：只管 localStorage 数据，不侵入 app.js（IIFE）；下载后整页重载使界面生效。
 *
 * ---------- R53（2026-10-19）：注册/找回链路加固 ----------
 * 起因：玩家反馈「注册不了」，且忘记密码时站点没有任何补救入口。
 * ① signUp 补 emailRedirectTo（取当前页面所在目录，GH Pages 是子路径，不能用 origin）；
 * ② 注册返回 session（站点关闭邮箱确认时的正常返回）→ 直接登录，不再让玩家去邮箱；
 * ③ 注册只返回 user 不给 session（邮箱确认仍开着）→ 进「待确认」视图，可重发确认信；
 * ④ 登录撞上 email_not_confirmed / invalid_credentials → 中文解释 + 一键重发确认信；
 * ⑤ 所有 Supabase 英文报错统一走 explainAuthError()，玩家看到的是「原因 + 该怎么办」。
 *
 * ---------- R61（2026-10-26）：下载覆盖不再可能吞掉进度 ----------
 * 分服上线后存档多了 server/_schema。跨设备、跨新旧版本、跨国服/国际服直接覆盖都不可逆，
 * 因此下载链路加了四道闸门（版本闸门 / 覆盖前自动备份 / 差异逐项确认 / 写入结果校验），
 * 并在面板里提供「恢复上一份」。详见下方 FEATURES 之后的注释。
 */
(function () {
  "use strict";

  /* ============ 配置（Supabase Project URL + 公开 key） ============ */
  /* 注意 URL 必须是 base（不带 /rest/v1/ 等路径），supabase-js 会自动拼接 */ 
  var SUPABASE_URL = "https://oologpjskkpjkvcpddhf.supabase.co";
  /* 新版 publishable key（等同 anon key，公开可用），受 RLS 保护 */
  var SUPABASE_ANON_KEY = "sb_publishable_6FzpENHzylm1M-NSvX6RBQ__Xlpv7Oc";

  /* ============ 数据源映射（feature id -> localStorage 键） ============ */
  /* combat_power_beta 是内嵌 iframe（同源），其存档键与主页面共享同一 localStorage，
     因此主页面直接读写即可；下载后整页 reload 会让 iframe 一并重载生效。 */
  var FEATURES = [
    { id: "planner",   name: "资源规划计算器", ls: "nikke_planner_form_v1" },
    { id: "mod_stats", name: "定制模组统计",   ls: "nikke_mod_stats_v3" },
    { id: "combat_power_beta", name: "战力计算Beta（角色练度 + 装备词条套装）", ls: "nikke_power_calc_v2" }
  ];

  /* ============ 存档安全（R61，2026-10-26） ============
     起因：分服上线后存档多了 server/_schema 字段。若玩家在两台设备上分别用新旧页面，
     或一边国服一边国际服，直接「用云端覆盖」会把本地进度整份换掉 —— 这是不可逆的。
     这里做四道闸门：
       ① 版本闸门：云端 _schema 比本页面能读的版本高 → 拒绝下载（老页面读新数据必丢字段）；
       ② 覆盖前自动备份：本地原样存一份（每个功能最多留 3 份），面板里可一键恢复；
       ③ 差异告知：服务器/数据日期/基地等级不一致时，弹窗逐项列出再让人决定；
       ④ 写入校验：写 localStorage 失败（配额满/隐私模式）时明确报错，而不是假装成功。
     ⚠ 只有 planner 有 _schema/server 概念；另两个功能按原样整份搬运，不做版本判断。 */
  var BACKUP_PREFIX = "nk_bak_";
  var BACKUP_MAX = 3;
  function schemaSupport() {
    return (window.NikkeServers && window.NikkeServers.SCHEMA) || 2;
  }
  function isPlanner(f) { return f.id === "planner"; }
  function backupKey(f) { return BACKUP_PREFIX + f.id; }
  function readBackups(f) {
    try {
      var raw = localStorage.getItem(backupKey(f));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function pushBackup(f, obj) {
    if (!obj || typeof obj !== "object") return false;
    var arr = readBackups(f);
    arr.unshift({ at: new Date().toISOString(), data: obj });
    arr = arr.slice(0, BACKUP_MAX);
    try { localStorage.setItem(backupKey(f), JSON.stringify(arr)); return true; }
    catch (e) { return false; }   // 配额满：备份失败要让调用方知道，不能默默继续覆盖
  }
  /* 存档摘要：用于弹窗里对比"云端 vs 本地"，让玩家自己判断该不该覆盖 */
  function summarize(f, obj, fallbackTime) {
    if (!obj || typeof obj !== "object") return "（无数据）";
    var sv = window.NikkeServers;
    var srvText = isPlanner(f)
      ? (sv ? sv.get(obj.server).name : (obj.server === "cn" ? "国服" : "国际服"))
      : "";
    var parts = [];
    if (srvText) parts.push(srvText);
    if (isPlanner(f)) parts.push("存档版本 v" + (Number(obj._schema) || 1));
    if (obj.saved_at) parts.push("数据日期 " + obj.saved_at);
    if (isPlanner(f)) {
      if (obj.current) parts.push("同步器 Lv" + obj.current);
      if (obj.base) parts.push("基地 Lv" + obj.base);
    }
    if (fallbackTime) parts.push("云端更新于 " + fmtTime(fallbackTime));
    return parts.join(" · ");
  }
  /* 上传前盖章：确保云端不会存到"无版本号"的数据（老客户端读到时按 v1 处理即可） */
  function stampSchema(f, obj) {
    if (!isPlanner(f) || !obj || typeof obj !== "object") return obj;
    if (!obj.server) obj.server = "intl";
    obj._schema = schemaSupport();
    return obj;
  }

  var sdk = window.supabase;
  var supabase = null;
  var curUser = null;

  /* ---------- 网络可靠性（R54） ----------
     现场反馈：网页能打开、一点账号就提示「没能连上云端」，玩家也没开代理。
     原因不是站点故障 —— GitHub Pages（页面）和 Supabase（数据库）走的是两套完全
     不同的境外线路，国内部分运营商只掐掉后一套，于是「站能开、云连不上」。
     而 supabase-js 默认**不给请求设超时**：弱网下会一直转圈，最后只抛一句
     Failed to fetch，既分不清是超时还是被阻断，玩家也无从下手。

     这里统一做法：给 SDK 注入带 15 秒超时的 fetch，并给错误打 __netStage 标记
     （timeout / unreachable），供报错翻译和「连接自检」区分断在哪一段。 */
  var NET_TIMEOUT = 15000;
  function netErr(stage, detail) {
    var e = new Error(detail || stage);
    e.name = stage === "timeout" ? "TimeoutError" : "NetworkError";
    e.__netStage = stage;
    return e;
  }
  function timeoutFetch(input, init) {
    var opts = init || {};
    var ctrl = null;
    /* SDK 自带 signal 时不接管（覆盖会破坏它自己的取消能力，此时它自己会中止） */
    if (!opts.signal) {
      try {
        if (typeof AbortController !== "undefined") {
          ctrl = new AbortController();
          opts.signal = ctrl.signal;
        }
      } catch (e) { ctrl = null; }
    }
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, NET_TIMEOUT) : 0;
    return fetch(input, opts).then(function (r) {
      clearTimeout(timer);
      return r;
    }, function (e) {
      clearTimeout(timer);
      var msg = (e && e.message) || "";
      if (e && (e.name === "AbortError" || /abort/i.test(msg))) {
        /* message 里保留 timeout 字样：SDK 会用它包一层新错误，靠这个才能识别出超时 */
        throw netErr("timeout", "请求超时（timeout）：超过 " + (NET_TIMEOUT / 1000) + " 秒没有响应");
      }
      throw netErr("unreachable", msg || "无法建立 HTTPS 连接");
    });
  }
  function newClient() {
    if (!sdk) return null;
    try {
      return sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { fetch: timeoutFetch }
      });
    } catch (e) { return null; }
  }

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
    try { localStorage.setItem(f.ls, JSON.stringify(obj)); return true; }
    catch (e) { return false; }   // 配额满 / 隐私模式：调用方必须据此中止，不能当成写成功
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

  /* ---------- 认证辅助（R53） ---------- */
  /* 邮件里的回跳地址：取「当前页面所在目录」而不是 origin。
     GH Pages 是 /Nikke_Level/index.html 这种子路径，只给 origin 会掉到根目录 404；
     WorkBuddy 与 localhost 同为一级路径时两者等价。结果必须在 Supabase 的 Redirect URLs 白名单里。 */
  function mailRedirect() {
    try { return location.origin + location.pathname.replace(/[^/]*$/, ""); }
    catch (e) { return undefined; }
  }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "")); }

  /* Supabase 的报错是英文原文，直接甩给玩家等于没说。
     这里翻成「什么原因 + 该怎么办」。优先看 code（新版 auth-js 的规范化错误码），
     message 关键字兜底老版本 / 网关层错误。返回 resend=true 的表示「重发确认信」能救。 */
  function explainAuthError(e) {
    var code = (e && (e.code || e.__netStage)) || "";
    var msg = (e && e.message) || "未知错误";
    var low = String(msg).toLowerCase();
    function hit() {
      for (var i = 0; i < arguments.length; i++) if (low.indexOf(arguments[i]) >= 0) return true;
      return false;
    }
    /* 每条都带一个固定编号：错误条上显示，玩家报编号即可定位；
       同时作为上报的分类键（字典见 js/errlog.js 的 CODES）。
       raw 保留 Supabase 英文原文，只进上报、不给玩家看。 */
    function R(ec, text, o) {
      var r = o || {};
      r.text = text; r.code = ec; r.raw = msg;
      return r;
    }
    if (code === "invalid_credentials" || hit("invalid login credentials", "invalid credentials")) {
      return R("E2001", "邮箱或密码不对。如果确认邮箱没敲错，也可能是这个邮箱当初注册到一半、没有完成确认 —— 点下面的按钮重发确认信试试。", { resend: true });
    }
    if (code === "email_not_confirmed" || hit("email not confirmed", "not confirmed")) {
      return R("E2002", "这个邮箱还没完成确认，所以暂时不能登录。点下面的按钮重发一封确认信，点开邮件里的链接后再回来登录。", { resend: true });
    }
    if (code === "user_already_exists" || code === "email_exists" ||
        hit("already registered", "already been registered", "user already exists")) {
      return R("E2003", "这个邮箱已经注册过了，直接用同一个密码登录即可（切到左边的「登录」）。");
    }
    if (code === "weak_password" || hit("should be at least", "password is too short", "password should")) {
      return R("E2004", "密码太短了，至少要 6 位。建议 8 位以上，字母和数字混着来。");
    }
    if (code === "validation_failed" || code === "email_address_invalid" ||
        hit("invalid format", "unable to validate email", "invalid email")) {
      return R("E2005", "邮箱格式不对。检查一下有没有多打空格，或者漏掉 @ 后面那一段。");
    }
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" ||
        hit("rate limit", "too many requests", "only request this after")) {
      return R("E2006", "操作太频繁，被服务器限流了。等 1 小时再试。如果每次注册都这样，多半是站点的发信服务配额用完了，请把这条提示发给作者。");
    }
    if (code === "signup_disabled" || hit("signups not allowed", "signup is disabled")) {
      return R("E2007", "站点当前关闭了新用户注册，请联系作者。");
    }
    if (hit("error sending", "sending confirmation", "sending recovery", "smtp")) {
      return R("E2008", "邮件发不出去 —— 这是站点发信服务没配好，不是你操作的问题。请把这条提示发给作者，让作者手动帮你确认账号。");
    }
    if (code === "timeout" || hit("timeout", "timed out")) {
      return R("E1001", "等了 15 秒云端都没回应：你的网络到不了这台境外服务器，不是你操作错了。可以试 ① 手机流量和 WiFi 互切一下；② 挂上代理 / VPN 再登录；③ 点下面的「连接自检」看断在哪一步。本地数据不会丢，连不上只影响云端同步。", { net: true });
    }
    if (code === "unreachable" || hit("failed to fetch", "networkerror", "network request failed", "load failed", "fetch failed", "connection closed")) {
      return R("E1002", "浏览器没能连上云端服务器。注意这和「网页能打开」并不矛盾：网页和数据库走的是两条不同的境外线路，国内部分网络只掐后一条。请挂代理 / VPN 后重试，或换个网络（流量 ↔ WiFi）。点下面的「连接自检」可以看具体断在哪。本地数据不会丢。", { net: true });
    }
    if (hit("database error")) {
      return R("E2009", "云端数据库报错，通常过一会儿重试就好；如果一直出现请联系作者。");
    }
    return R("E9000", "操作失败：" + msg);
  }

  /* ---------- 上报（R55） ----------
     一步到位地把「编号 + 原始报错 + 场景 + 网络状态」交给 js/errlog.js。
     errlog.js 没加载（老缓存、资源被拦）时这里静默跳过，绝不影响登录流程。 */
  function report(kind, code, context, message, detail) {
    try {
      if (window.NikkeErrLog && window.NikkeErrLog.track) {
        window.NikkeErrLog.track(kind, code, {
          context: context,
          message: message,
          detail: detail || null
        });
      }
    } catch (e) {}
  }

  /* ---------- 连接自检（R54） ----------
     打的是 Supabase 的 /auth/v1/health。不带 apikey 会返回 401，但**只要拿到任意
     HTTP 响应就说明 DNS / TCP / TLS 三段全通**，问题不在网络。所以判定标准是
     「有没有响应」而不是「状态码是不是 200」。 */
  async function netSelfTest() {
    var url = SUPABASE_URL + "/auth/v1/health";
    var t0 = Date.now();
    var out = {
      url: url, ms: 0, reached: false, status: 0, stage: "", msg: "",
      online: (typeof navigator === "undefined" || navigator.onLine !== false)
    };
    try {
      var r = await timeoutFetch(url, { method: "GET", cache: "no-store" });
      out.ms = Date.now() - t0;
      out.reached = true;
      out.status = r.status;
      out.stage = "http";
    } catch (e) {
      out.ms = Date.now() - t0;
      out.stage = (e && e.__netStage) || "unreachable";
      out.msg = (e && e.message) || "";
    }
    return out;
  }
  function netVerdict(r) {
    if (!r.online) {
      return { cls: "bad", text: "浏览器当前报告「离线」—— 先确认设备真的连上了网络（有些游戏加速器 / VPN 会把状态标记成离线）。" };
    }
    if (r.reached) {
      var note = (r.status >= 200 && r.status < 300)
        ? ""
        : "（返回 " + r.status + " 是正常的：没带钥匙的探测本来就会被拒）";
      return { cls: "ok", text: "云端可以访问，耗时 " + r.ms + " 毫秒" + note + "。网络这一段没问题，那问题出在别的地方 —— 请把上面那条报错原文发给作者。" };
    }
    if (r.stage === "timeout") {
      return { cls: "bad", text: "等了 15 秒没有任何回应：你的网络到不了这台境外服务器。网页能打开是因为网页和数据走两条不同线路。办法：① 手机流量 ↔ WiFi 互切；② 挂代理 / VPN 后重试。本地数据不会丢。" };
    }
    return { cls: "bad", text: "连接被当场中断：典型的运营商阻断或丢包（不是你的操作问题，也不是站点挂了）。办法同上 —— 换网络，或挂代理 / VPN。本地数据不会丢。" };
  }
  async function runSelfTest() {
    var link = $inner.querySelector("#nkNetTest");
    var box = $inner.querySelector("#nkNetOut");
    if (link) link.textContent = "正在检测…";
    if (box) box.innerHTML = "";
    var r = await netSelfTest();
    var v = netVerdict(r);
    /* 自检失败是最有价值的一条数据：说明这台设备此刻真的到不了云端。
       成功了不用报（那是正常状态，报了只会淹没真正的问题）。 */
    if (!r.reached) {
      report("selftest", r.stage === "timeout" ? "E1001" : "E1002", "selftest",
        "self-test failed: " + (r.msg || r.stage), { ms: r.ms, online: r.online });
    }
    if (box) {
      box.innerHTML = '<div class="nk-netout ' + v.cls + '">' + esc(v.text)
        + '<div class="nk-nettip">检测目标 ' + esc(r.url) + " · 耗时 " + r.ms + " 毫秒"
        + (r.status ? " · HTTP " + r.status : "") + "</div></div>";
    }
    if (link) link.textContent = "再检测一次";
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
      ".nk-errbar{background:#fdeaea;border:1px solid #f2c1c1;color:#b3312d;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px;position:relative;padding-right:52px}" +
      ".nk-ec{position:absolute;right:9px;top:8px;font-style:normal;font-size:10.5px;font-weight:600;color:#b3312d;opacity:.55;letter-spacing:.3px;cursor:help}" +
      ".nk-okbar{background:#e9f7f1;border:1px solid #b6e2d1;color:#177a59;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:8px;line-height:1.6}" +
      ".nk-okbar b{word-break:break-all}" +
      ".nk-link{background:none;border:none;padding:0;color:#178a64;font:12px inherit;cursor:pointer;text-decoration:underline}" +
      ".nk-sub{margin:10px 0 0;font-size:11.5px;color:#8a938e;line-height:1.7}" +
      ".nk-net{margin:8px 0 0;font-size:12px}" +
      ".nk-net a{color:#1d9e75;text-decoration:none;border-bottom:1px dashed #9fd4c2;cursor:pointer}" +
      ".nk-net a:hover{color:#178a64}" +
      ".nk-netout{margin-top:8px;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.65}" +
      ".nk-netout.ok{background:#eefaf4;border:1px solid #bfe6d5;color:#1a6b50}" +
      ".nk-netout.bad{background:#fdf3ec;border:1px solid #f2d3b8;color:#96531f}" +
      ".nk-nettip{margin-top:4px;font-size:11px;opacity:.72;word-break:break-all}" +
      ".nk-pwrow{position:relative}" +
      /* 按钮挪进 .nk-pwrow 后才是相对输入框定位；右侧留白防止密码被「显示」压住 */
      ".nk-pwrow .nk-in{padding-right:52px}" +
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

  /* open(focusFid)：可选传入功能 id，面板打开后自动定位并高亮该功能卡片
     （供同源 iframe——如「战力计算Beta」——从自己的 Tab 直接唤起同步面板）。 */
  var pendingFocus = null;
  function open(focusFid) {
    if (focusFid) pendingFocus = focusFid;
    buildUI(); injectStyle(); $ov.classList.add("show"); render();
  }
  function close() { if ($ov) $ov.classList.remove("show"); pendingFocus = null; }
  function highlightFeature(fid) {
    var card = $inner.querySelector('[data-fid="' + fid + '"]');
    if (!card) return;
    try { card.scrollIntoView({ block: "nearest" }); } catch (e) {}
    card.style.transition = "box-shadow .25s";
    card.style.boxShadow = "0 0 0 2px #1d9e75";
    setTimeout(function () { card.style.boxShadow = ""; }, 1800);
  }
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

  var authMode = "login";      // login | register | pending
  var pendingEmail = "";       // 已提交注册、等确认邮件的邮箱（重发确认信用）
  var draftEmail = "";         // 切换 登录/注册 时保留已输入的邮箱，别让玩家重敲
  var flashMsg = "";           // 重新渲染后仍要显示的一句话（渲染时消费后清空）

  function errBar(s, code) {
    return '<div class="nk-errbar">' + esc(s)
      + (code ? '<i class="nk-ec" title="错误编号，报给作者可快速定位">' + esc(code) + "</i>" : "")
      + "</div>";
  }
  function okBar(s) { return '<div class="nk-okbar">' + s + "</div>"; }

  function renderAuth() {
    if (authMode === "pending") { renderPending(); return; }
    var m = authMode;
    var isReg = m === "register";
    var confirm = isReg ?
      '<div class="nk-field"><label>确认密码</label><div class="nk-pwrow"><input class="nk-in" id="nkPass2" type="password" placeholder="再输一次" autocomplete="new-password"><button type="button" class="nk-eye" data-eyes data-for="nkPass2">显示</button></div></div>' :
      "";
    var msg = flashMsg; flashMsg = "";
    $inner.innerHTML =
      '<div class="nk-tab">' +
        '<button class="' + (m === "login" ? "on" : "") + '" data-mode="login">登录</button>' +
        '<button class="' + (isReg ? "on" : "") + '" data-mode="register">注册</button>' +
      "</div>" +
      '<div class="nk-field"><label>邮箱</label><input class="nk-in" id="nkEmail" type="email" inputmode="email" placeholder="you@example.com" autocomplete="username" value="' + esc(draftEmail) + '"></div>' +
      '<div class="nk-field"><label>密码</label><div class="nk-pwrow"><input class="nk-in" id="nkPass" type="password" placeholder="至少 6 位" autocomplete="' + (isReg ? "new-password" : "current-password") + '"><button type="button" class="nk-eye" data-eyes data-for="nkPass">显示</button></div></div>' +
      confirm +
      '<div id="nkAuthErr">' + (msg ? errBar(msg) : "") + "</div>" +
      '<div class="nk-row"><button class="nk-btn" id="nkAuthGo">' + (isReg ? "注册" : "登录") + "</button></div>" +
      '<p class="nk-sub">' + (isReg
        ? "填邮箱 + 设个密码就行，注册完直接可用云端同步。"
        : "用注册时的邮箱和密码登录；换设备也能把云端数据拉回来。") + "</p>" +
      '<p class="nk-net"><a id="nkNetTest">连不上云端？点这里自检</a></p>' +
      '<div id="nkNetOut"></div>';
    $inner.querySelectorAll("[data-eyes]").forEach(function (b) {
      b.addEventListener("click", function () {
        var inp = $inner.querySelector("#" + b.getAttribute("data-for"));
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        b.textContent = show ? "隐藏" : "显示";
      });
    });
    $inner.querySelector("#nkAuthGo").addEventListener("click", function () { doAuth(m); });
    var nt = $inner.querySelector("#nkNetTest");
    if (nt) nt.addEventListener("click", function () { runSelfTest(); });
    $inner.querySelectorAll("[data-mode]").forEach(function (t) {
      t.addEventListener("click", function () {
        var nm = t.getAttribute("data-mode");
        if (nm === m) return;
        var cur = $inner.querySelector("#nkEmail");
        draftEmail = cur ? cur.value.trim() : "";
        authMode = nm === "register" ? "register" : "login";
        renderAuth();
      });
    });
    $inner.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("keydown", function (e) { if (e.key === "Enter") doAuth(m); });
    });
  }

  /* 「待确认」视图（R53）：邮箱确认还开着的站点上，注册只返回 user 不给 session。
     这一步必须能自助重发，否则玩家就卡在「注册不了」的黑洞里。 */
  function renderPending() {
    var msg = flashMsg; flashMsg = "";
    $inner.innerHTML =
      okBar("邮箱 <b>" + esc(pendingEmail) + "</b> 已登记，最后一步是去邮箱点确认链接。") +
      '<p class="nk-hint" style="margin:0 0 12px">没收到先翻一下垃圾邮件 / 广告邮件，有时会延迟 1–2 分钟。点开邮件里的链接后再回来登录。</p>' +
      '<div id="nkAuthErr">' + (msg ? errBar(msg) : "") + "</div>" +
      '<div class="nk-row"><button class="nk-btn" id="nkResend">重发确认邮件</button></div>' +
      '<div class="nk-row">' +
        '<button class="nk-btn ghost" id="nkGoLogin">去登录</button>' +
        '<button class="nk-btn ghost2" id="nkGoReg">换邮箱重注册</button>' +
      "</div>" +
      '<p class="nk-sub">反复收不到？多半是站点发信服务没配好 —— 把注册用的邮箱发给作者，让作者在后台手动确认。</p>';
    $inner.querySelector("#nkResend").addEventListener("click", doResend);
    $inner.querySelector("#nkGoLogin").addEventListener("click", function () {
      draftEmail = pendingEmail; authMode = "login"; renderAuth();
    });
    $inner.querySelector("#nkGoReg").addEventListener("click", function () {
      draftEmail = ""; pendingEmail = ""; authMode = "register"; renderAuth();
    });
  }

  async function doResend() {
    var btn = $inner.querySelector("#nkResend");
    var box = $inner.querySelector("#nkAuthErr");
    if (!pendingEmail) { authMode = "register"; renderAuth(); return; }
    if (btn) { btn.disabled = true; btn.textContent = "正在发送…"; }
    try {
      var r = await supabase.auth.resend({
        type: "signup", email: pendingEmail,
        options: { emailRedirectTo: mailRedirect() }
      });
      if (r.error) throw r.error;
      if (box) box.innerHTML = okBar("已重新发送，请等 1–2 分钟再查收（含垃圾邮件箱）。");
    } catch (e) {
      var ex = explainAuthError(e);
      if (box) box.innerHTML = errBar(ex.text, ex.code);
      report("auth", ex.code, "resend", ex.raw, { net: !!ex.net });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "重发确认邮件"; }
    }
  }

  function renderAccount() {
    var u = curUser;
    $inner.innerHTML =
      '<div><span class="nk-close" style="position:static" id="nkLogout">登出</span></div>' +
      '<p class="nk-user">已登录：' + esc(u.email || u.id) + "</p>" +
      '<div id="nkFeaList"><div class="nk-empty">正在检查云端数据…</div></div>';
    $inner.querySelector("#nkLogout").addEventListener("click", function () {
      supabase.auth.signOut().finally(function () {
        curUser = null;
        authMode = "login";      // 登出后回登录页，别停在「待确认」
        pendingEmail = "";
        render();
      });
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
      var st = { f: f, loc: hasLocal(f), ok: true, cloud: null, err: null, bak: readBackups(f).length };
      try { st.cloud = await serverRow(f.id); }
      catch (e) { st.ok = false; st.err = e.message; anyErr = true; }
      states.push(st);
    }
    var html = "";
    for (i = 0; i < states.length; i++) {
      var s = states[i];
      var cloudAt = s.ok ? (s.cloud ? s.cloud.updated_at : null) : "unknown";
      html += feaCard(s.f.id, s.f.name, s.loc, cloudAt, s.bak);
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
    // 由 iframe 唤起时定位到对应功能卡片（refreshFeatures 是异步重建的，只能在这里消费）
    if (pendingFocus) {
      var focusFid = pendingFocus;
      pendingFocus = null;
      highlightFeature(focusFid);
    }
  }

  function feaCard(fid, name, local, cloudAt, bakCount) {
    var cloudText = cloudAt === "unknown" ? "未知（检查失败）" : (cloudAt ? fmtTime(cloudAt) : "无");
    var bak = Number(bakCount) || 0;
    return '<div class="nk-fea" data-fid="' + fid + '">' +
      '<h4>' + esc(name) + '</h4>' +
      '<div class="nk-stat"><span>本地：' + (local ? "有数据" : "无数据") + '</span>' +
      '<span>云端：' + cloudText + "</span></div>" +
      (bak ? '<div class="nk-stat"><span>覆盖前备份：' + bak + ' 份</span>'
        + '<span><button type="button" class="nk-link" data-act="restore">恢复上一份</button></span></div>' : "") +
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
          if (act === "restore") {
            /* 覆盖前自动备份的反向操作：一键回到上一次被覆盖前的状态 */
            var baks = readBackups(f);
            if (!baks.length) { tip("本机没有可恢复的备份"); return; }
            var b = baks[0];
            var curObj0 = parseSafe(getLocal(f));
            var okGo = window.confirm(
              "用本机备份覆盖当前数据？\n\n"
              + "备份时间：" + fmtTime(b.at) + "\n备份内容：" + summarize(f, b.data) + "\n\n"
              + "当前内容：" + (curObj0 ? summarize(f, curObj0) : "（无数据）")
              + "\n\n覆盖前会把「当前」也存一份备份，恢复错了还能换回来。");
            if (!okGo) { return; }
            if (curObj0) pushBackup(f, curObj0);
            if (!setLocalObject(f, b.data)) { tip("写入本机失败，本地数据未改动"); return; }
            tip("已恢复备份，正在刷新页面…");
            setTimeout(function () { location.reload(); }, 700);
            return;
          }
          if (act === "up") {
            var raw = getLocal(f);
            var obj = parseSafe(raw);
            if (!obj) { tip("本地无有效数据，无法上传"); return; }
            stampSchema(f, obj);
            /* 云端更"新"时先问一句：多数人不想用旧手机上的旧数据盖掉新进度 */
            if (cloud && cloud.updated_at && isPlanner(f)) {
              var cloudSaved = String((cloud.data_json && cloud.data_json.saved_at) || "");
              var localSaved = String(obj.saved_at || "");
              if (cloudSaved && localSaved && cloudSaved > localSaved) {
                var goUp = window.confirm(
                  "云端存档的数据日期（" + cloudSaved + "）比本地（" + localSaved + "）更新。\n\n"
                  + "继续上传会用本地数据覆盖云端，确定吗？\n（点「取消」可先改用「用云端覆盖」把云端拉下来）");
                if (!goUp) { return; }
              }
            }
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
            var cloudObj = row.data_json;
            /* ① 结构校验：云端可能存了字符串/数组/null（历史脏数据或旧版写入），一律不覆盖本地 */
            if (!cloudObj || typeof cloudObj !== "object" || Array.isArray(cloudObj)) {
              tip("云端存档格式异常，已中止（本地数据未改动）");
              report("sync", "E3001", "download", "cloud payload not an object", { fid: fid });
              return;
            }
            /* ② 版本闸门：云端版本高于本页面能读的版本 → 拒绝，让玩家先刷新页面 */
            var cVer = Number(cloudObj._schema) || 1;
            if (isPlanner(f) && cVer > schemaSupport()) {
              tip("云端存档来自更新版本（v" + cVer + "），本页面只能读到 v" + schemaSupport()
                + "。请先刷新页面更新计算器再下载（本地数据未改动）。");
              return;
            }
            /* ③ 差异告知：把"云端 / 本地"逐项摆出来，尤其是服务器不同 */
            var localObj = parseSafe(getLocal(f));
            var mismatch = [];
            if (localObj && isPlanner(f)) {
              var lSrv = window.NikkeServers ? window.NikkeServers.get(localObj.server).key : (localObj.server === "cn" ? "cn" : "intl");
              var cSrv = window.NikkeServers ? window.NikkeServers.get(cloudObj.server).key : (cloudObj.server === "cn" ? "cn" : "intl");
              if (lSrv !== cSrv) {
                mismatch.push("服务器不同：本地 " + (lSrv === "cn" ? "国服" : "国际服")
                  + " → 云端 " + (cSrv === "cn" ? "国服" : "国际服") + "（覆盖后表单会整体变成云端那一服）");
              }
              if (String(cloudObj.saved_at || "") && String(localObj.saved_at || "")
                  && String(cloudObj.saved_at) < String(localObj.saved_at)) {
                mismatch.push("云端存档的数据日期更旧：云端 " + cloudObj.saved_at + " / 本地 " + localObj.saved_at);
              }
            }
            var msg = "将用云端数据覆盖本机「" + f.name + "」：\n\n"
              + "云端：" + summarize(f, cloudObj, row.updated_at || cloud.updated_at) + "\n"
              + "本地：" + (localObj ? summarize(f, localObj) : "（无数据）");
            if (mismatch.length) msg += "\n\n⚠ 注意：\n· " + mismatch.join("\n· ");
            msg += "\n\n覆盖前会把本地现状自动备份一份（本面板可一键恢复）。确定继续？";
            if (!window.confirm(msg)) { return; }
            /* ④ 先备份再覆盖；备份失败就不能覆盖（否则真丢进度） */
            if (localObj && !pushBackup(f, localObj)) {
              tip("本机存储空间不足，无法备份本地数据，已中止覆盖（本地未改动）");
              return;
            }
            if (!setLocalObject(f, cloudObj)) {
              tip("写入本机失败（浏览器存储已满或处于隐私模式），本地数据未改动");
              return;
            }
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

  /* ============ 对外直连接口（供同源 iframe 在自己的 Tab 里快速同步） ============
     典型调用方：combat_power_beta/index.html（战力计算Beta）的工具栏按钮。
     - status()            → { configured, loggedIn, email }
     - quickUpload(fid)    → 已登录：直接把本地存档推到云端；未登录/未配置：打开面板引导
     - open(fid)           → 打开完整面板（上传 / 下载覆盖 / 查看云端时间）并定位到该功能
     注意：面板未打开过时 supabase 客户端可能还没建，这里做一次兜底创建。 */
  function featureById(id) {
    for (var i = 0; i < FEATURES.length; i++) if (FEATURES[i].id === id) return FEATURES[i];
    return null;
  }
  function status() {
    return { configured: configured(), loggedIn: !!curUser, email: curUser ? (curUser.email || curUser.id || "") : "" };
  }
  function ensureClient() {
    if (supabase) return true;
    if (!configured()) return false;
    supabase = newClient();
    return !!supabase;
  }
  async function currentUser() {
    if (curUser) return curUser;
    try {
      var r = await supabase.auth.getSession();
      curUser = r && r.data && r.data.session ? r.data.session.user : null;
    } catch (e) { /* 忽略，按未登录处理 */ }
    return curUser;
  }
  async function quickUpload(fid) {
    var f = featureById(fid);
    if (!f) { tip("未知的功能：" + fid); return { ok: false, reason: "unknown" }; }
    if (!configured()) { tip("云同步功能当前未配置，暂时无法使用"); return { ok: false, reason: "noconfig" }; }
    if (!ensureClient()) { tip("同步组件加载失败，请刷新页面后重试"); return { ok: false, reason: "noclient" }; }
    if (!(await currentUser())) {
      open(fid);                                   // 未登录 → 打开面板走登录（登录后点「上传本地」）
      tip("请先登录账号，登录后点「上传本地」即可同步");
      return { ok: false, reason: "nologin" };
    }
    var obj = parseSafe(getLocal(f));
    if (!obj) { tip("本地暂无有效数据，无法上传"); return { ok: false, reason: "empty" }; }
    stampSchema(f, obj);   // 保证云端永远带版本号与服务标识，避免跨版本读不懂
    try {
      var r = await uploadOne(f, obj);
      if (r.error) throw r.error;
      tip("「" + f.name + "」已同步到云端");
      return { ok: true, at: new Date().toISOString() };
    } catch (e) {
      tip("同步失败：" + (e.message || "未知错误"));
      return { ok: false, reason: "error", message: e.message };
    }
  }

  /* ============ 认证 ============ */
  async function doAuth(mode) {
    var email = $inner.querySelector("#nkEmail").value.trim();
    var pass = $inner.querySelector("#nkPass").value;
    var errEl = $inner.querySelector("#nkAuthErr");
    draftEmail = email;
    function setErr(s, code) { if (errEl) errEl.innerHTML = s ? errBar(s, code) : ""; }
    setErr("");
    if (!email) { setErr("请输入邮箱"); return; }
    if (!isEmail(email)) { setErr("邮箱格式不太对，检查一下有没有多打空格、或漏掉 @ 后面那一段。"); return; }
    if (!pass) { setErr("请输入密码"); return; }
    if (pass.length < 6) { setErr("密码至少 6 位"); return; }
    if (mode === "register") {
      var pass2 = $inner.querySelector("#nkPass2").value;
      if (!pass2) { setErr("请再次输入确认密码"); return; }
      if (pass !== pass2) { setErr("两次输入的密码不一致，请重新输入"); return; }
    }
    var go = $inner.querySelector("#nkAuthGo");
    if (!ensureClient()) {
      setErr("云端组件没加载出来（页面资源被拦截、或浏览器版本太旧）。先刷新页面重试；还是不行就换最新版 Chrome / Edge，或关掉广告拦截插件再试。", "E1004");
      report("net", "E1004", mode, "ensureClient failed: sdk=" + !!sdk + " configured=" + configured());
      return;
    }
    if (go) { go.disabled = true; go.textContent = mode === "login" ? "登录中…" : "注册中…"; }
    try {
      if (mode === "login") {
        var r = await supabase.auth.signInWithPassword({ email: email, password: pass });
        if (r.error) throw r.error;
        draftEmail = "";
        tip("登录成功");
        render();
      } else {
        /* emailRedirectTo 必须给：否则确认信里的回跳地址会落到 Supabase 的默认 Site URL */
        var s = await supabase.auth.signUp({
          email: email, password: pass,
          options: { emailRedirectTo: mailRedirect() }
        });
        if (s.error) throw s.error;
        if (s.data && s.data.session) {
          /* 站点关闭邮箱确认时的正常返回：注册即登录，不用去邮箱 */
          curUser = s.data.session.user;
          draftEmail = "";
          tip("注册成功，已登录");
          render();
        } else {
          /* 没有 session：邮箱确认还开着。Supabase 出于防枚举，邮箱已存在时也返回 user 但 identities 为空 */
          var dup = !!(s.data && s.data.user && Array.isArray(s.data.user.identities) && s.data.user.identities.length === 0);
          if (dup) {
            authMode = "login";
            flashMsg = "这个邮箱已经注册过了，输入原密码直接登录即可；忘记密码的话请把邮箱发给作者帮你重置。";
            renderAuth();
          } else {
            pendingEmail = email;
            authMode = "pending";
            flashMsg = "";
            renderAuth();
            tip("注册信息已提交，请到邮箱点确认链接");
          }
        }
      }
    } catch (e) {
      var ex = explainAuthError(e);
      setErr(ex.text, ex.code);
      /* 上报云端：带上编号、原始报错、操作场景与网络状态。
         连不上时上报也发不出去 —— errlog 会把它留在本地队列，等恢复后补发。 */
      report("auth", ex.code, mode, ex.raw, { net: !!ex.net });
      // 能靠「重发确认信」救的情况，直接在错误条下面给入口，别让玩家自己找
      if (ex.resend && errEl) {
        var b = document.createElement("button");
        b.className = "nk-link";
        b.style.display = "block";
        b.style.marginTop = "6px";
        b.textContent = "收不到 / 没确认过？点这里重发确认邮件 →";
        b.addEventListener("click", function () {
          pendingEmail = email;
          authMode = "pending";
          renderAuth();
        });
        errEl.appendChild(b);
      }
    } finally {
      if (go) {
        go.disabled = false;
        go.textContent = mode === "login" ? "登录" : "注册";
      }
    }
  }

  /* ============ 按钮注入 ============ */
  /* 桌面挂在 hero 工具栏；移动版没有 .hero-toolbar（顶栏是 .m-top-act），
     原来这一处只认桌面选择器 → 手机端连登录入口都没有。R53 补上兜底。 */
  function addTrigger() {
    if (document.querySelector("#nkSyncOpen")) return;
    var desk = document.querySelector(".hero-toolbar");
    var mob = desk ? null : document.querySelector(".m-top-act");
    var host = desk || mob;
    if (!host) return;
    var b = document.createElement("button");
    b.id = "nkSyncOpen";
    b.type = "button";
    b.textContent = mob ? "账号" : "👤 账号同步";
    b.title = "登录后云端同步你的数据";
    b.classList.add(mob ? "m-top-btn" : "nk-acc-btn");
    b.addEventListener("click", function () { open(); });
    host.appendChild(b);
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
        supabase = newClient();
        supabase.auth.getSession().then(function (r) { if (r && r.data) curUser = r.data.session ? r.data.session.user : null; });
        supabase.auth.onAuthStateChange(function (e, s) {
          curUser = s ? s.user : null;
        });
      } catch (e) { supabase = null; }
      addSaveSync();
    }
  }

  /* 暴露给同源 iframe 复用账号同步能力（定制模组统计页 / 战力计算Beta 等）；
     放在 init 之前，不依赖初始化是否成功。 */
  window.__nikkeSync = {
    open: function (focusFid) { open(focusFid); },
    close: close,
    status: status,
    quickUpload: quickUpload,
    features: function () {
      return FEATURES.map(function (f) { return { id: f.id, name: f.name, ls: f.ls }; });
    }
  };

  init();
})();