/* route.js — 双线路访问（自动 / 国内 / GitHub）
 * 职责：识别当前线路 → 按用户选择的模式决策 → 跳转或提示；选择跨域记住（靠 URL 参数）
 * 依赖：无。数据迁移仅在 window.LZString 存在时启用。
 *
 * 红线（改代码前先读）：
 *   1) 本地环境（localhost / 127.0.0.1 / file:）只渲染 UI，绝不跳转
 *   2) 探测失败一律回退当前线路，绝不把用户弹到不可达的站
 *   3) 自动模式遇到已有表单存档时不跳，只提示，避免跨域丢数据
 *   4) UI 在 DOMContentLoaded 后注入，检测全异步，不阻塞首屏
 *   5) 清理 URL 参数时只删 route / hop，sharecode 等原有参数必须保留
 */
(function () {
  "use strict";

  var MODE_KEY = "nikke_route_mode_v1";
  var PROBE_KEY = "nikke_route_probe_v1";
  var FORM_KEY = "nikke_planner_form_v1";

  var PROBE_TIMEOUT = 2000;   // 单条线路探测上限（ms）；跨境慢链路 1.4s 会误伤
  var PROBE_MARGIN = 400;     // 另一条线快这么多，才推翻地区判断
  var PROBE_FLOOR = 8;        // 低于此值视为缓存/失败，不作有效样本
  var PROBE_TTL = 30 * 60 * 1000;

  /* WorkBuddy 镜像带访问鉴权：不带 sharecode 的请求一律 403。
     探测地址必须同带 sharecode，否则「403 快速失败」会被误判成「国内线路不可达」。 */
  var CN_ORIGIN = "https://nikke-level-planner-07475.app.workbuddy.host";
  var CN_SHARE = "?sharecode=YHW5333IQR";

  var LINES = {
    cn: {
      label: "国内线路",
      short: "国内",
      desc: "WorkBuddy 镜像",
      url: CN_ORIGIN + "/" + CN_SHARE,
      probe: CN_ORIGIN + "/assets/m/favicon.webp" + CN_SHARE
    },
    gh: {
      label: "GitHub 线路",
      short: "GitHub",
      desc: "原始站点",
      url: "https://theifxzx666-blip.github.io/Nikke_Level/",
      probe: "https://theifxzx666-blip.github.io/Nikke_Level/assets/m/favicon.webp"
    }
  };

  var state = { mode: "auto", cur: "other", target: null, detail: null };

  /* ---------------- 基础工具 ---------------- */

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

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

  /* 中国大陆时区判定：tz 名称优先，UTC+8 兜底 */
  function tzIsCN() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (/^Asia\/(Shanghai|Chongqing|Harbin|Urumqi)$/.test(tz)) return true;
    } catch (e) {}
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

  /* 只删指定参数，其余（尤其 sharecode）与 hash 原样保留 */
  function cleanQuery(key) {
    try {
      var u = new URL(location.href);
      u.searchParams.delete(key);
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) {}
  }

  /* ---------------- 探测 ---------------- */

  function probe(src, ms) {
    return new Promise(function (resolve) {
      var img = new Image();
      var t0 = now();
      var done = false;
      var timer = setTimeout(function () { finish(null); }, ms);

      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        try { img.src = ""; } catch (e) {}
        resolve(v);
      }
      img.onload = function () { finish(now() - t0); };
      img.onerror = function () { finish(now() - t0); }; // 404/403 也算“有响应”
      img.src = src + (src.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();
    });
  }

  function valid(t) { return t != null && t >= PROBE_FLOOR; }

  function measure() {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(PROBE_KEY) || "null"); } catch (e) {}
    if (cached && (Date.now() - cached.at) < PROBE_TTL) return Promise.resolve(cached);

    return Promise.all([
      probe(LINES.cn.probe, PROBE_TIMEOUT),
      probe(LINES.gh.probe, PROBE_TIMEOUT)
    ]).then(function (r) {
      var out = { at: Date.now(), cn: r[0], gh: r[1] };
      try { sessionStorage.setItem(PROBE_KEY, JSON.stringify(out)); } catch (e) {}
      return out;
    });
  }

  /* 决策：地区偏好优先，另一条明显更快时改走另一条 */
  function decide() {
    var cur = currentLine();
    var mode = readMode();

    if (mode === "cn" || mode === "gh") {
      return Promise.resolve({ target: mode, why: "manual" });
    }

    var prefer = tzIsCN() ? "cn" : "gh";
    var other = prefer === "cn" ? "gh" : "cn";

    return measure().then(function (m) {
      var pv = valid(m[prefer]);
      var ov = valid(m[other]);
      var out = { m: m, prefer: prefer };

      if (!pv && !ov) { out.target = cur; out.why = "fail"; return out; }
      if (!pv) { out.target = other; out.why = "fallback"; return out; }
      if (!ov) { out.target = prefer; out.why = "region"; return out; }
      if (m[other] + PROBE_MARGIN < m[prefer]) { out.target = other; out.why = "speed"; return out; }
      out.target = prefer; out.why = "region";
      return out;
    });
  }

  function hasForm() {
    try {
      var raw = localStorage.getItem(FORM_KEY);
      return !!(raw && raw.length > 2);
    } catch (e) { return false; }
  }

  /* ---------------- 跳转 ---------------- */

  function buildUrl(line, opt) {
    opt = opt || {};
    var url = LINES[line].url;
    var qs = [];
    if (opt.mode) qs.push("route=" + encodeURIComponent(opt.mode));
    if (opt.hop) qs.push("hop=1");
    if (qs.length) url += (url.indexOf("?") < 0 ? "?" : "&") + qs.join("&");

    // carry 传的是已压缩好的载荷（见 carryPayload），这里不再自己压缩
    if (opt.carry) url += "#carry=" + opt.carry;
    return url;
  }

  /* 把表单存档压成可放进 URL 的串。超过 MAX_CARRY 返回 ""——
     宁可不带，也不让跳转 URL 被浏览器截断成半截。 */
  var MAX_CARRY = 1600;

  function carryPayload() {
    try {
      var raw = localStorage.getItem(FORM_KEY);
      if (!raw || !window.LZString) return "";
      var z = window.LZString.compressToEncodedURIComponent(raw);
      return z.length > MAX_CARRY ? "" : z;
    } catch (e) { return ""; }
  }

  function go(line, opt) {
    var url = buildUrl(line, opt);
    try { location.replace(url); } catch (e) { location.href = url; }
  }

  /* 目标页：把 #carry= 解码回本域 localStorage，然后重载让 app.js 读新存档 */
  function handleCarry() {
    var hash = location.hash || "";
    var m = /^#carry=([^&]+)/.exec(hash);
    if (!m || !window.LZString) return false;
    try {
      var raw = window.LZString.decompressFromEncodedURIComponent(m[1]);
      if (raw && raw.charAt(0) === "{") {
        localStorage.setItem(FORM_KEY, raw);
        history.replaceState(null, "", location.pathname + location.search);
        location.reload();
        return true;
      }
    } catch (e) {}
    return false;
  }

  /* ---------------- UI ---------------- */

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
    "#nkRoute .nk-dot.warn{background:#e6a23c}",
    "@media (max-width:720px){#nkRoute .nk-prefix{display:none}",
    "#nkRouteBtn{padding:6px 10px;font-size:11px;max-width:46vw}}",
    "#nkRoutePanel{position:absolute;right:0;bottom:calc(100% + 8px);width:218px;padding:6px;",
    "background:var(--card,#fff);border:1px solid var(--border,#dde3e0);border-radius:12px;",
    "box-shadow:0 10px 30px rgba(0,0,0,.16)}",
    "#nkRoutePanel[hidden]{display:none}",
    "#nkRoute .nk-head{padding:6px 8px 8px;font-size:11px;color:var(--muted,#667);",
    "display:flex;justify-content:space-between;gap:8px}",
    "#nkRoute .nk-head b{color:var(--primary-dark,#0f6e56);font-weight:600}",
    "#nkRoute button.nk-opt{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:none;",
    "border-radius:8px;cursor:pointer;font:inherit;color:inherit}",
    "#nkRoute button.nk-opt:hover{background:rgba(29,158,117,.09)}",
    "#nkRoute button.nk-opt[aria-checked='true']{background:rgba(29,158,117,.14);font-weight:600}",
    "#nkRoute button.nk-opt span{display:block;font-size:11px;font-weight:400;color:var(--muted,#667);margin-top:1px}",
    "#nkRoute .nk-foot{padding:8px 8px 4px;margin-top:4px;border-top:1px solid var(--border,#dde3e0);",
    "font-size:11px;color:var(--muted,#667);line-height:1.45}",
    "#nkRouteToast{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9992;",
    "display:flex;align-items:center;gap:10px;max-width:calc(100vw - 28px);padding:9px 14px;",
    "background:var(--card,#fff);border:1px solid var(--border,#dde3e0);border-radius:10px;",
    "box-shadow:0 8px 24px rgba(0,0,0,.16);font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;",
    "color:var(--text,#222)}",
    "#nkRouteToast button{border:0;background:var(--primary,#1d9e75);color:#fff;border-radius:7px;",
    "padding:4px 10px;font:inherit;cursor:pointer;flex:0 0 auto}",
    "#nkRouteToast.out{transition:opacity .25s;opacity:0}"
  ].join("");

  function injectStyle() {
    if (document.getElementById("nkRouteStyle")) return;
    var st = document.createElement("style");
    st.id = "nkRouteStyle";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
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
        '<button type="button" class="nk-opt" data-m="auto" role="menuitemradio">自动<span>按地区与网络自动选择</span></button>' +
        '<button type="button" class="nk-opt" data-m="cn" role="menuitemradio">线路 1 · 国内<span>' + LINES.cn.desc + '</span></button>' +
        '<button type="button" class="nk-opt" data-m="gh" role="menuitemradio">线路 2 · GitHub<span>' + LINES.gh.desc + '</span></button>' +
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
      paint();

      if (m === "auto") {
        // 回到自动：重新检测，只给建议不擅自跳（避免把正在填表的人弹走）
        decide().then(function (d) {
          state.target = d.target;
          paint(d);
          if (d.target !== state.cur) {
            toast("检测到更快的" + LINES[d.target].label, "切换", function () {
              go(d.target, { hop: true, carry: hasForm() ? carryPayload() : "" });
            });
          }
        });
        return;
      }
      if (m !== state.cur) {
        // 手动切到另一条线：带上模式与当前存档，目标页读到后写入本域
        go(m, { mode: m, hop: true, carry: hasForm() ? carryPayload() : "" });
      } else {
        paint();
      }
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
    window.addEventListener("resize", placeUi);
    if (window.ResizeObserver) {
      try { new ResizeObserver(placeUi).observe(document.getElementById("appNav")); } catch (e) {}
    }
  }

  /* 移动版底部 Tab 会换行（5 个工具两行），高度不固定，必须实测后再抬高，
     否则线路按钮会压在 Tab 上。桌面版无固定底栏，用 CSS 默认值即可。 */
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

  function paint(d) {
    var label = document.getElementById("nkRouteLabel");
    var labelText = document.getElementById("nkRouteText");
    var nowEl = document.getElementById("nkRouteNow");
    var foot = document.getElementById("nkRouteFoot");
    var dot = document.querySelector("#nkRoute .nk-dot");
    if (!label || !labelText) return;

    state.mode = readMode();
    var curName = LINES[state.cur] ? LINES[state.cur].short : "本地";
    var mobile = document.body.classList.contains("m-body");

    if (state.mode === "auto") {
      var tgt = (d && d.target) || state.target;
      var suggest = (tgt && tgt !== state.cur && LINES[tgt]) ? LINES[tgt].short : "";
      labelText.textContent = mobile
        ? (suggest ? "自动·" + suggest : "自动")
        : "自动" + (suggest ? "（建议" + suggest + "）" : "");
    } else {
      labelText.textContent = LINES[state.mode] ? LINES[state.mode].short : state.mode;
    }

    if (nowEl) nowEl.textContent = "当前 " + curName;
    if (dot) {
      var ok = state.cur === "cn" || state.cur === "gh";
      dot.className = "nk-dot" + (ok ? "" : " warn");
    }

    document.querySelectorAll("#nkRoute button.nk-opt").forEach(function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-m") === state.mode ? "true" : "false");
    });

    if (foot) {
      if (d) {
        var m = d.m;
        var txt;
        if (d.why === "fail") txt = "检测超时，已停留当前线路。可手动切换。";
        else if (d.why === "manual") txt = "已记住你的选择，下次打开自动走这条线。";
        else if (d.why === "fallback") txt = "推荐线路不可达，已改走另一条。";
        else if (m && valid(m.cn) && valid(m.gh)) txt = "实测 国内 " + Math.round(m.cn) + "ms · GitHub " + Math.round(m.gh) + "ms";
        else txt = "当前线路可用。";
        foot.textContent = txt;
      } else if (state.mode !== "auto") {
        foot.textContent = "已记住你的选择，下次打开自动走这条线。";
      }
    }
  }

  function setFoot(text) {
    var foot = document.getElementById("nkRouteFoot");
    if (foot) foot.textContent = text;
  }

  function toast(msg, btnText, onBtn) {
    var old = document.getElementById("nkRouteToast");
    if (old) old.parentNode.removeChild(old);

    var el = document.createElement("div");
    el.id = "nkRouteToast";
    var span = document.createElement("span");
    span.textContent = msg;
    el.appendChild(span);

    if (btnText && onBtn) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = btnText;
      b.addEventListener("click", function () {
        remove();
        onBtn();
      });
      el.appendChild(b);
    }
    document.body.appendChild(el);

    var timer = setTimeout(remove, btnText ? 8000 : 4500);
    function remove() {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.className = "out";
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    var qs = parseQuery();
    var dry = qs.dry === "1";   // 预演：只显示判定结果，绝不跳转（本地验收用）

    // 1) 跨域带来的模式参数：写入本域后立即清掉，避免污染分享链接
    if (qs.route === "auto" || qs.route === "cn" || qs.route === "gh") {
      writeMode(qs.route);
      cleanQuery("route");
    }
    var justHopped = qs.hop === "1";
    if (justHopped) cleanQuery("hop");

    // 2) 存档迁移：解码后重载，本轮到此为止
    if (handleCarry()) return;

    state.cur = currentLine();
    state.mode = readMode();
    render();
    paint();
    // shell.js 渲染导航可能有延迟，load 后再校一次位置
    window.addEventListener("load", function () { setTimeout(placeUi, 300); });

    if (state.cur === "local" && !dry) { setFoot("本地环境，不参与线路切换。"); return; }
    if (state.cur === "other") { setFoot("当前域名未登记，可在上方手动选择线路。"); return; }
    if (justHopped) { setFoot("已切换，选择已记住。"); return; }

    decide().then(function (d) {
      state.target = d.target;
      state.detail = d;
      paint(d);

      var need = d.target !== state.cur;

      if (dry) {
        var extra = "（已在目标线路）";
        if (need) {
          var demo = buildUrl(d.target, { hop: true, carry: hasForm() ? carryPayload() : "" });
          extra = " → " + demo.replace(/sharecode=[^&]*/, "sharecode=***").slice(0, 130);
        }
        setFoot("预演：" + d.why + " · 当前 " + (LINES[state.cur] ? LINES[state.cur].short : state.cur) + extra);
        return;
      }

      if (!need) {
        if (d.why === "fail") toast("线路检测超时，已使用当前线路", null, null);
        return;
      }

      var carry = hasForm() ? carryPayload() : "";

      // 存档大到 URL 装不下：跳过去必然丢数据，降级成「提示 + 用户确认」
      if (state.mode === "auto" && hasForm() && !carry) {
        toast("检测到更快的" + LINES[d.target].label + "，但当前存档较大，切换后需手动导入", "仍要切换", function () {
          go(d.target, { hop: true });
        });
        return;
      }

      // 自动模式一律真跳；存档用 #carry= 带过去，目标页解码写入后重载
      go(d.target, { hop: true, carry: carry });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
