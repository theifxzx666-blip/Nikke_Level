/* route.js — 双线路访问（自动 / 国内 / GitHub）
 *
 * 执行时机：放在 <head> 末尾。首屏渲染之前用「系统时区」同步判定该走哪条线，
 * 需要切就立刻 location.replace —— 用户只会看到目标页一次加载，没有中间白屏。
 *
 * 三条硬规则（2026-11-27 19:50 重构；此前版本造成过两页互跳的死循环）：
 *   1) 自动模式只做单向：GitHub → 国内。国内页永不自动跳回，从物理上杜绝互跳
 *   2) 跳转后 15 秒内不再自动跳。时间戳写 sessionStorage，清 URL / reload 都不丢
 *   3) 不做跨域存档迁移、不 reload。上一版用 #carry= + reload 搬存档，
 *      而 reload 又制造了一次「无 hop 标记」的判定，正是死循环的放大器
 *
 * 依赖：无。不引第三方库，不做网络探测（探测要 1~2 秒，与「无感」互斥）。
 */
(function () {
  "use strict";

  var MODE_KEY = "nikke_route_mode_v1";
  var HOP_KEY = "nikke_route_hop_at";
  var HOP_COOLDOWN = 15000;

  var SITES = {
    cn: {
      url: "https://nikke-level-planner-07475.app.workbuddy.host/?sharecode=YHW5333IQR",
      label: "国内线路",
      short: "国内",
      desc: "WorkBuddy 镜像"
    },
    gh: {
      url: "https://theifxzx666-blip.github.io/Nikke_Level/",
      label: "GitHub 线路",
      short: "GitHub",
      desc: "原始站点"
    }
  };

  /* ---------------- 基础 ---------------- */

  function readMode() {
    try {
      var m = localStorage.getItem(MODE_KEY);
      return (m === "cn" || m === "gh" || m === "auto") ? m : "auto";
    } catch (e) { return "auto"; }
  }

  function writeMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  }

  function currentLine() {
    var h = location.hostname || "";
    if (location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "::1") return "local";
    if (h.indexOf("workbuddy.host") >= 0) return "cn";
    if (h.indexOf("github.io") >= 0) return "gh";
    return "other";
  }

  /* 中国大陆时区：能拿到时区名就只信它；拿不到才用 UTC+8 兜底。
     （不能「名字判定失败后再跑 offset」——那会把 Intl 明确给出的海外时区又翻回中国） */
  function tzIsCN() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    if (tz) return /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi)$/.test(tz);
    try { return new Date().getTimezoneOffset() === -480; } catch (e) { return false; }
  }

  function parseQuery() {
    var out = {};
    try {
      var s = location.search.replace(/^\?/, "");
      if (!s) return out;
      s.split("&").forEach(function (kv) {
        var i = kv.indexOf("=");
        var k = i < 0 ? kv : kv.slice(0, i);
        var v = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1));
        out[decodeURIComponent(k)] = v;
      });
    } catch (e) {}
    return out;
  }

  /* 只删指定参数，sharecode 等原有参数原样保留 */
  function cleanQuery(key) {
    try {
      var u = new URL(location.href);
      u.searchParams.delete(key);
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) {}
  }

  function hoppedRecently() {
    try {
      var t = Number(sessionStorage.getItem(HOP_KEY) || 0);
      return !!t && (Date.now() - t) < HOP_COOLDOWN;
    } catch (e) { return false; }
  }

  function markHop() {
    try { sessionStorage.setItem(HOP_KEY, String(Date.now())); } catch (e) {}
  }

  function siteUrl(line, params) {
    var u = SITES[line].url;
    if (!params) return u;
    var extra = [];
    for (var k in params) {
      if (params.hasOwnProperty(k) && params[k]) extra.push(k + "=" + encodeURIComponent(params[k]));
    }
    if (!extra.length) return u;
    return u + (u.indexOf("?") < 0 ? "?" : "&") + extra.join("&");
  }

  /* ---------------- 阶段 1：首屏前判定 ---------------- */

  var qs = parseQuery();
  var dry = qs.dry === "1";     // 本地调试：只显示判定，不跳

  if (qs.hop === "1") { markHop(); cleanQuery("hop"); }
  if (qs.route === "auto" || qs.route === "cn" || qs.route === "gh") {
    writeMode(qs.route);
    cleanQuery("route");
  }

  var state = { cur: currentLine(), mode: readMode() };

  function earlyTarget() {
    if (dry) return "";
    if (state.cur !== "gh" && state.cur !== "cn") return "";
    var want = state.mode === "auto" ? (tzIsCN() ? "cn" : "gh") : state.mode;
    if (want === state.cur) return "";
    // 自动模式只单向：GitHub → 国内（反向自动跳就是死循环的来源）
    if (state.mode === "auto" && !(state.cur === "gh" && want === "cn")) return "";
    if (hoppedRecently()) return "";
    return want;
  }

  var jump = earlyTarget();
  if (jump) {
    markHop();
    location.replace(siteUrl(jump, { hop: 1, route: state.mode !== "auto" ? state.mode : "" }));
    return;   // 页面即将离开，不再注入 UI
  }

  /* ---------------- 阶段 2：UI（手动切换） ---------------- */

  var CSS = [
    "#nkRoute{position:fixed;right:14px;bottom:14px;z-index:9990;",
    "font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;",
    "color:var(--text,#222);-webkit-tap-highlight-color:transparent}",
    "body.m-body #nkRoute{bottom:76px}",
    "#nkRouteBtn{display:flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid var(--border,#dde3e0);",
    "border-radius:999px;background:var(--card,#fff);box-shadow:0 4px 14px rgba(0,0,0,.12);",
    "cursor:pointer;font:inherit;color:inherit}",
    "#nkRouteBtn:hover{border-color:var(--primary,#1d9e75)}",
    "#nkRoute .nk-dot{width:7px;height:7px;border-radius:50%;background:var(--primary,#1d9e75);flex:0 0 auto}",
    "#nkRoutePanel{position:absolute;right:0;bottom:calc(100% + 8px);width:218px;padding:6px;",
    "background:var(--card,#fff);border:1px solid var(--border,#dde3e0);border-radius:12px;",
    "box-shadow:0 10px 30px rgba(0,0,0,.16)}",
    "#nkRoutePanel[hidden]{display:none}",
    "#nkRoute .nk-head{padding:6px 8px 8px;font-size:11px;color:var(--muted,#667);",
    "display:flex;justify-content:space-between;gap:8px}",
    "#nkRoute button.nk-opt{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:none;",
    "border-radius:8px;cursor:pointer;font:inherit;color:inherit}",
    "#nkRoute button.nk-opt:hover{background:rgba(29,158,117,.09)}",
    "#nkRoute button.nk-opt[aria-checked='true']{background:rgba(29,158,117,.14);font-weight:600}",
    "#nkRoute button.nk-opt span{display:block;font-size:11px;font-weight:400;color:var(--muted,#667);margin-top:1px}",
    "#nkRoute .nk-foot{padding:8px 8px 4px;margin-top:4px;border-top:1px solid var(--border,#dde3e0);",
    "font-size:11px;color:var(--muted,#667);line-height:1.45}",
    "@media (max-width:720px){#nkRoute .nk-prefix{display:none}",
    "#nkRouteBtn{padding:6px 10px;font-size:11px;max-width:46vw}}"
  ].join("");

  function injectStyle() {
    if (document.getElementById("nkRouteStyle")) return;
    var st = document.createElement("style");
    st.id = "nkRouteStyle";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function paint() {
    var labelText = document.getElementById("nkRouteText");
    var nowEl = document.getElementById("nkRouteNow");
    var foot = document.getElementById("nkRouteFoot");
    if (!labelText) return;

    var mobile = document.body.classList.contains("m-body");
    var curName = SITES[state.cur] ? SITES[state.cur].short : "本地";

    if (state.mode === "auto") {
      var want = (state.cur === "gh" || state.cur === "cn") ? (tzIsCN() ? "cn" : "gh") : "";
      var hint = (want && want !== state.cur && SITES[want]) ? SITES[want].short : "";
      labelText.textContent = mobile
        ? (hint ? "自动·" + hint : "自动")
        : "自动" + (hint ? "（建议" + hint + "）" : "");
    } else {
      labelText.textContent = SITES[state.mode] ? SITES[state.mode].short : state.mode;
    }

    if (nowEl) nowEl.textContent = "当前 " + curName;

    document.querySelectorAll("#nkRoute button.nk-opt").forEach(function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-m") === state.mode ? "true" : "false");
    });

    if (foot) {
      if (state.cur === "local") foot.textContent = "本地环境，不参与线路切换。";
      else if (state.cur === "other") foot.textContent = "当前域名未登记，可手动选择线路。";
      else if (state.mode === "auto") foot.textContent = "按系统时区自动选择，只在「GitHub → 国内」方向自动切。";
      else foot.textContent = "已记住你的选择。两条线路的本地存档各自独立。";
    }
  }

  /* 移动版底部 Tab 会换行，高度不固定，必须实测后再抬高 */
  function placeUi() {
    var wrap = document.getElementById("nkRoute");
    if (!wrap) return;
    if (!document.body || !document.body.classList.contains("m-body")) {
      wrap.style.bottom = "";
      return;
    }
    var nav = document.getElementById("appNav");
    var h = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
    wrap.style.bottom = (h > 0 ? h + 12 : 76) + "px";
  }

  function render() {
    if (document.getElementById("nkRoute")) return;
    injectStyle();

    var wrap = document.createElement("div");
    wrap.id = "nkRoute";
    wrap.innerHTML =
      '<button type="button" id="nkRouteBtn" aria-haspopup="true" aria-expanded="false">' +
        '<i class="nk-dot"></i><span id="nkRouteLabel"><span class="nk-prefix">线路 · </span><span id="nkRouteText">自动</span></span>' +
      '</button>' +
      '<div id="nkRoutePanel" hidden>' +
        '<div class="nk-head">访问线路<b id="nkRouteNow"></b></div>' +
        '<button type="button" class="nk-opt" data-m="auto" role="menuitemradio">自动<span>按地区自动选择</span></button>' +
        '<button type="button" class="nk-opt" data-m="cn" role="menuitemradio">线路 1 · 国内<span>' + SITES.cn.desc + '</span></button>' +
        '<button type="button" class="nk-opt" data-m="gh" role="menuitemradio">线路 2 · GitHub<span>' + SITES.gh.desc + '</span></button>' +
        '<div class="nk-foot" id="nkRouteFoot"></div>' +
      '</div>';

    document.body.appendChild(wrap);

    var btn = document.getElementById("nkRouteBtn");
    var panel = document.getElementById("nkRoutePanel");

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    panel.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("button[data-m]") : null;
      if (!el) return;
      e.stopPropagation();
      var m = el.getAttribute("data-m");
      writeMode(m);
      state.mode = m;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");

      // 选「自动」：按当前地区结算，命中另一条才跳；选具体线路：不同就跳
      var want = m === "auto" ? (tzIsCN() ? "cn" : "gh") : m;
      if (want && want !== state.cur) {
        markHop();
        location.href = siteUrl(want, { hop: 1, route: m });
        return;
      }
      paint();
    });

    document.addEventListener("click", function () {
      if (!panel.hidden) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    placeUi();
    paint();
    window.addEventListener("resize", placeUi);
    if (window.ResizeObserver) {
      try { new ResizeObserver(placeUi).observe(document.getElementById("appNav")); } catch (e) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
