/* NIKKE 资源规划计算器 · 错误上报  js/errlog.js
 *
 * 为什么要有这个文件：玩家报「连不上云端」时，我们手上只有一句话，看不到错误码、
 * 时间、网络状态、设备。同一个症状可能来自超时 / 阻断 / 限流 / 账号问题，靠猜。
 *
 * 这里做三件事：
 *   ① 给每类错误一个固定编号（E1xxx 网络 / E2xxx 账号 / E9xxx 其他），错误条上直接
 *      显示，玩家把编号报过来就能定位，不必截图。
 *   ② 入队并落 localStorage —— 连不上云端的时候恰恰是最需要记录的时候，先存下来。
 *   ③ 等网络恢复（或下次打开页面）批量 POST 到 Supabase 的 client_errors 表。
 *
 * 实现上只用 fetch 直连 PostgREST，**不创建 supabase-js 客户端** —— 两个 client 会
 * 抢同一份 session 存储，得不偿失。
 *
 * ⚠ 隐私：绝不上报邮箱、密码、表单内容。message 会先过 redact() 抹掉邮箱形式与 JWT。
 * ⚠ 静默失败：表没建（404）、被 RLS 拒、断网 —— 一律不打扰玩家，队列留着下次重试。
 */
(function (global) {
  "use strict";

  /* 与 js/sync.js 的 SUPABASE_URL / KEY 必须保持一致（改一处要同步另一处） */
  var SUPABASE_URL = "https://oologpjskkpjkvcpddhf.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_6FzpENHzylm1M-NSvX6RBQ__Xlpv7Oc";
  var ENDPOINT = SUPABASE_URL + "/rest/v1/client_errors";

  var QKEY = "nikke_errlog_q_v1";     /* 待发队列 */
  var CKEY = "nikke_errlog_cid_v1";   /* 匿名设备 id（随机，不含任何个人信息） */
  var DKEY = "nikke_errlog_dedup_v1"; /* 去重表（同一条错误短时间内不重复记） */

  var MAXQ = 80;        /* 队列上限，超了丢最旧的 */
  var BATCH = 20;       /* 单次最多发 20 条 */
  var POST_TIMEOUT = 8000;
  var DEDUP_MS = 5 * 60 * 1000;

  /* ============ 错误码字典（前后端唯一事实源） ============
     E0 系列不用（0 表示成功）；E1 = 网络层；E2 = 账号层；E9 = 兜底。
     新增分支请在这里登记，别在别处直接写字面量。 */
  var CODES = {
    E1001: "请求超时（15 秒无响应）",
    E1002: "连接被中断 / 阻断",
    E1003: "浏览器报告离线",
    E1004: "云端组件未加载",
    E2001: "邮箱或密码不对",
    E2002: "邮箱未完成确认",
    E2003: "邮箱已注册",
    E2004: "密码太短",
    E2005: "邮箱格式不对",
    E2006: "请求被限流",
    E2007: "站点关闭注册",
    E2008: "站点发信失败",
    E2009: "数据库报错",
    E2010: "注册返回已存在（防枚举）",
    E9001: "页面脚本异常",
    E9002: "云端数据读写失败",
    E9000: "其他未分类"
  };

  /* ---------- 本地存储（都包 try，隐私模式 / 配额满都不该让页面崩） ---------- */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function loadQ() {
    try {
      var a = JSON.parse(lsGet(QKEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveQ(a) {
    try { lsSet(QKEY, JSON.stringify(a.slice(-MAXQ))); } catch (e) {}
  }

  function clientId() {
    var v = lsGet(CKEY);
    if (v) return v;
    /* 随机 id：优先 crypto，退化为时间 + 随机串。不含任何设备指纹 */
    var s = "";
    try {
      if (global.crypto && global.crypto.randomUUID) s = global.crypto.randomUUID();
    } catch (e) {}
    if (!s) s = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    lsSet(CKEY, s);
    return s;
  }

  function pageName() {
    try {
      var p = location.pathname.split("/").pop() || "index.html";
      return p;
    } catch (e) { return ""; }
  }
  /* 记 sync.js 的版本：这张表主要收账号 / 网络错误，定位时要的是「账号模块是哪一版」。
     页面没有 sync.js（如 ledger.html）时回退取全页最大的 ?v=。 */
  function appVer() {
    try {
      var s = document.querySelector('script[src*="sync.js"]');
      var m = s && /[?&]v=([0-9A-Za-z]+)/.exec(s.src);
      if (m) return m[1];
      var best = "", list = document.querySelectorAll('script[src*="?v="]');
      for (var i = 0; i < list.length; i++) {
        var x = /[?&]v=([0-9A-Za-z]+)/.exec(list[i].src);
        if (x && x[1] > best) best = x[1];
      }
      return best;
    } catch (e) { return ""; }
  }

  /* ---------- 脱敏：邮箱、JWT、长串 token 一律抹掉 ---------- */
  function redact(s) {
    s = String(s == null ? "" : s);
    s = s.replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[A-Za-z]{2,}/g, "[email]");
    s = s.replace(/ey[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "[jwt]");
    s = s.replace(/\b[A-Za-z0-9_\-]{40,}\b/g, "[token]");
    return s.slice(0, 500);
  }

  /* ---------- 去重：同 kind+code+message 5 分钟内只记一次 ----------
     全局脚本异常很容易一次刷出十几条，没有去重队列会被瞬间塞满。 */
  function dup(kind, code, msg) {
    var k = kind + "|" + code + "|" + String(msg).slice(0, 80);
    var map = {};
    try { map = JSON.parse(lsGet(DKEY) || "{}") || {}; } catch (e) { map = {}; }
    var now = Date.now();
    if (map[k] && now - map[k] < DEDUP_MS) return true;
    map[k] = now;
    /* 顺手清理过期键 */
    Object.keys(map).forEach(function (x) { if (now - map[x] > DEDUP_MS * 4) delete map[x]; });
    try { lsSet(DKEY, JSON.stringify(map)); } catch (e) {}
    return false;
  }

  /* ---------- 发送 ---------- */
  var flushing = false;
  function postBatch(rows) {
    if (typeof fetch !== "function") return Promise.resolve(false);
    var ctrl = null, opts = {
      method: "POST",
      cache: "no-store",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(rows)
    };
    try {
      if (typeof AbortController !== "undefined") {
        ctrl = new AbortController();
        opts.signal = ctrl.signal;
      }
    } catch (e) { ctrl = null; }
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, POST_TIMEOUT) : 0;
    return fetch(ENDPOINT, opts).then(function (r) {
      clearTimeout(timer);
      return r.ok;
    }, function () {
      clearTimeout(timer);
      return false;
    });
  }

  function flush() {
    if (flushing) return;
    var q = loadQ();
    if (!q.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushing = true;
    var batch = q.slice(0, BATCH);
    postBatch(batch).then(function (ok) {
      flushing = false;
      if (!ok) return;                      /* 失败就留着，等下次 online / 定时器 */
      var rest = loadQ();
      rest = rest.slice(batch.length);      /* 发出去的从队头摘掉 */
      saveQ(rest);
      if (rest.length) setTimeout(flush, 900);
    }, function () { flushing = false; });
  }

  /* ---------- 对外：记一条 ---------- */
  function track(kind, code, opt) {
    opt = opt || {};
    try {
      var msg = redact(opt.message || "");
      if (dup(kind, code, msg)) return true;   /* 去重命中，视为已处理 */
      var q = loadQ();
      q.push({
        cid: clientId(),
        kind: kind || "other",
        code: code || "E9000",
        context: String(opt.context || "").slice(0, 60),
        message: msg,
        page: pageName(),
        app_ver: appVer(),
        online: (typeof navigator === "undefined" || navigator.onLine !== false),
        ua: (typeof navigator === "undefined" ? "" : String(navigator.userAgent || "")).slice(0, 300),
        client_at: new Date().toISOString(),
        detail: opt.detail || null
      });
      if (q.length > MAXQ) q = q.slice(q.length - MAXQ);
      saveQ(q);
      flush();
      return true;
    } catch (e) {
      return false; /* 上报本身绝不允许影响页面 */
    }
  }

  /* ---------- 自动补发时机 ---------- */
  try {
    global.addEventListener("online", function () { flush(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) flush();
    });
    setTimeout(flush, 1500);              /* 页面起来先冲一次上次没发掉的 */
    setInterval(flush, 45000);            /* 之后定期重试 */
  } catch (e) {}

  /* ---------- 兜底采集：未捕获异常 / Promise 拒绝 ----------
     只收同源脚本的错误，插件注入的 blob: / chrome-extension: 不算账。 */
  try {
    global.addEventListener("error", function (ev) {
      try {
        var src = (ev && ev.filename) || "";
        if (/^chrome-extension:|^moz-extension:|^blob:/.test(src)) return;
        track("js", "E9001", {
          context: "window.onerror",
          message: (ev && ev.message) || "unknown error",
          detail: { src: redact(src).slice(0, 200), line: ev && ev.lineno, col: ev && ev.colno }
        });
      } catch (e) {}
    });
    global.addEventListener("unhandledrejection", function (ev) {
      try {
        var r = ev && ev.reason;
        var m = (r && (r.message || r)) || "unhandled rejection";
        track("js", "E9001", { context: "unhandledrejection", message: String(m) });
      } catch (e) {}
    });
  } catch (e) {}

  global.NikkeErrLog = {
    VERSION: "1.0.0",
    CODES: CODES,
    track: track,
    flush: flush,
    /* 调试用：不联网也能看到队列里有什么 */
    queue: function () { return loadQ(); },
    clear: function () { saveQ([]); },
    cid: clientId,
    redact: redact
  };
})(window);
