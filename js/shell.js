/* NIKKE 工具箱 · 外壳导航  js/shell.js
 * 职责：读 tools.json → 动态渲染导航按钮与视图容器 → 接管 iframe 懒加载与高度自适应。
 * 设计：工具清单的唯一事实来源是 tools.json；本文件不得硬编码任何工具。
 * 兼容：内联视图（inline:true，如资源规划计算器）不建 iframe，仅切换显隐。
 */
(function () {
  "use strict";

  var NAV_SEL = "#appNav";
  var DEFAULT_ID = "planner"; // tools.json 不可用时的兜底

  var tools = [];
  var iframes = {};      // toolId -> HTMLIFrameElement
  var activeId = null;

  /* ---------- 遗留按钮兜底（尚未纳入注册表的工具） ---------- */
  /* 页面里可能残留硬编码的 .app-nav-btn（如「洗练战力」）。它们不参与注册表，
     但为避免"点了没反应"，这里按 data-app 走通用的视图切换（不建 iframe，行为与改造前一致）。 */
  function bindLegacyButtons() {
    document.querySelectorAll(NAV_SEL + " .app-nav-btn:not([data-tool])").forEach(function (b) {
      if (b.__shellBound) return;
      b.__shellBound = true;
      b.addEventListener("click", function () {
        var vid = b.getAttribute("data-app");
        if (!vid) return;
        document.querySelectorAll(".app-nav-btn").forEach(function (x) {
          x.classList.toggle("active", x === b);
        });
        document.querySelectorAll(".app-view").forEach(function (v) {
          v.classList.toggle("active", v.id === vid);
        });
        var isInline = vid === "appPlanner";
        var toolbar = document.querySelector(".hero-toolbar");
        if (toolbar) toolbar.style.display = isInline ? "" : "none";
        document.body.classList.toggle("tool-mode", !isInline);
        setFullscreen(false);
        try { history.replaceState(null, "", "#" + vid); } catch (e) {}
      });
    });
  }

  /* ---------- 读取注册表 ---------- */
  function loadTools() {
    var url = "tools.json?ts=" + Date.now();
    if (window.fetch) {
      return fetch(url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
    // 老浏览器降级：同步 XHR（仅在无 fetch 时兜底）
    return new Promise(function (resolve, reject) {
      try {
        var x = new XMLHttpRequest();
        x.open("GET", url, false);
        x.send();
        resolve(JSON.parse(x.responseText));
      } catch (e) { reject(e); }
    });
  }

  function normalize(list) {
    return (list || [])
      .filter(function (t) { return t && t.enabled !== false && t.id; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  /* ---------- 视图容器 ---------- */
  function viewIdOf(t) { return t.viewId || ("app_" + t.id); }

  function ensureView(t) {
    var vid = viewIdOf(t);
    var el = document.getElementById(vid);
    if (el) return el;
    el = document.createElement("section");
    el.id = vid;
    el.className = "app-view";
    // 插到导航之后的第一个 .app-view 之前；若无则直接追加到 appNav 之后
    var first = document.querySelector(NAV_SEL + " ~ .app-view");
    if (first && first.parentNode) first.parentNode.insertBefore(el, first);
    else document.querySelector(NAV_SEL).parentNode.appendChild(el);
    return el;
  }

  /* ---------- 导航按钮 ---------- */
  function renderNav() {
    var nav = document.querySelector(NAV_SEL);
    if (!nav) return;
    // 只清除本脚本上一轮生成的按钮，保留页面里硬编码的按钮（如尚未纳入注册表的工具）
    nav.querySelectorAll('[data-tool]').forEach(function (b) { b.remove(); });
    var anchor = nav.querySelector('[data-app]:not([data-tool])'); // 第一个硬编码按钮，插它前面
    tools.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "app-nav-btn";
      b.setAttribute("data-app", viewIdOf(t));
      b.setAttribute("data-tool", t.id);
      var label = document.createTextNode(t.name || t.id);
      if (t.icon) {
        var img = document.createElement("img");
        img.className = "app-nav-icon";
        img.src = t.icon;
        img.alt = "";
        // 图标缺失时不要显示破图
        img.addEventListener("error", function () { img.style.display = "none"; });
        b.appendChild(img);
      }
      b.appendChild(label);
      b.addEventListener("click", function () { switchTo(t.id); });
      if (anchor) nav.insertBefore(b, anchor);
      else nav.appendChild(b);
      ensureView(t);
    });
  }

  /* ---------- 全屏工具模式（头像预览等） ---------- */
  function setFullscreen(on) {
    on = !!on;
    var was = document.body.classList.contains("avatar-full");
    document.body.classList.toggle("avatar-full", on);
    if (on && !was) window.scrollTo(0, 0);
  }

  /* ---------- iframe 高度自适应 ---------- */
  function fitFrame(id) {
    var iframe = iframes[id];
    if (!iframe) return;
    try {
      var doc = iframe.contentDocument;
      if (!doc || !iframe.isConnected) return;
      var root = doc.documentElement;
      var t = findTool(id);
      var lock = !!(t && t.fullscreen);
      if (root) root.classList.toggle("locked", lock);
      if (lock) {
        iframe.style.height = "";
        if (window.__frameRO && window.__frameRO[id]) {
          window.__frameRO[id].disconnect();
          window.__frameRO[id] = null;
        }
        if (window.__frameBody) window.__frameBody[id] = null;
        return;
      }
      var body = doc.body;
      var appEl = doc.querySelector(".app");
      function apply() {
        var h = Math.max(
          (body && body.scrollHeight) || 0,
          (doc.documentElement && doc.documentElement.scrollHeight) || 0
        );
        if (h <= 0) h = (appEl && appEl.getBoundingClientRect().height) || 0;
        if (h <= 0) return;
        /* 收敛判定：iframe 内 documentElement.scrollHeight 的下限就是 iframe 自身的视口高度，
           当内容比视口矮时它会返回视口高度，于是「+6 → 视口变高 → 又返回视口高度」每轮自举 +6px。
           R70 实测：mod_stats 曾因 body{min-height:100vh} 把 100vh 取成 iframe 高度，
           演变成无限增长（6 秒 492 → 3768px，页面滚动条跟着无限变长）。
           目标高度与当前高度相差 ≤6px 即视为已收敛，不再改动。 */
        var target = h + 6;
        if (Math.abs(target - iframe.getBoundingClientRect().height) <= 6) return;
        iframe.style.height = target + "px";
      }
      apply();
      /* R79：ResizeObserver 必须绑在「当前这份文档的 body」上。iframe 刚 append 时里面还是
         about:blank，此时若已建过 RO，观察的就是那份马上被丢弃的 body —— 真实文档换进来后
         再没有观察者，高度永远停在默认 480px（GH Pages 首访实测必现，要等父页 resize 才撑开）。
         这里用 __frameBody 记住上次观察的 body，换了就重建。 */
      var roMap = window.__frameRO || (window.__frameRO = {});
      var bodyMap = window.__frameBody || (window.__frameBody = {});
      if (!roMap[id] || bodyMap[id] !== body) {
        if (roMap[id] && roMap[id].disconnect) roMap[id].disconnect();
        roMap[id] = null;
        if ("ResizeObserver" in window && body) {
          var ro = new ResizeObserver(function () { apply(); });
          ro.observe(body);
          if (appEl && appEl !== body) ro.observe(appEl);
          roMap[id] = ro;
        }
        bodyMap[id] = body;
      }
    } catch (e) { /* 跨域等异常静默 */ }
  }

  /* R79：iframe 的 load 事件可能因某个子资源迟迟不完成而延后，而 switchTo 里那次
     fitFrame 又常在 about:blank 阶段（h=0，什么都没设）—— 于是两头落空。
     这里做有限次重试（250ms×3 + 600ms×6，共约 4.4s）：已收敛时 fitFrame 内部直接 return，
     不会反复改高度，也不碰 R70 那套「目标与当前差 ≤6px 即视为收敛」的正反馈防线。 */
  function scheduleFit(id) {
    var tries = 0;
    (function step() {
      fitFrame(id);
      tries++;
      if (tries < 10 && iframes[id]) setTimeout(step, tries < 4 ? 250 : 600);
    })();
  }

  function findTool(id) {
    for (var i = 0; i < tools.length; i++) if (tools[i].id === id) return tools[i];
    return null;
  }

  /* ---------- 切换 ---------- */
  function switchTo(id) {
    var t = findTool(id);
    if (!t) return;
    activeId = id;
    // 非全屏页量滚动条宽度（全屏模式 overflow:hidden 量出来恒 0）。
    // 这个值只用于桌面端头像全屏模式的 15px 级宽度补偿，所以：
    //   ① 只接受 (0, 40] 的合理值 —— 移动端页面缩放 / 地址栏收放时 innerWidth 与
    //      clientWidth 会差出上百 px（实测 390 视口上 511-390 = 121px），写进 --sbw
    //      会把整个头像工具区永久挤窄（且只增不减、从不重算）；
    //   ② 超出合理范围就清掉变量、退回 CSS 默认值。
    if (!t.fullscreen) {
      var sbw = window.innerWidth - document.documentElement.clientWidth;
      if (sbw > 0 && sbw <= 40) document.documentElement.style.setProperty("--sbw", sbw + "px");
      else document.documentElement.style.removeProperty("--sbw");
    }
    var vid = viewIdOf(t);
    document.querySelectorAll(".app-nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tool") === id);
    });
    document.querySelectorAll(".app-view").forEach(function (v) {
      v.classList.toggle("active", v.id === vid);
    });
    // hero（顶图 + 工具按钮）仅对计算器（inline 视图）有意义
    var isInline = !!t.inline;
    var toolbar = document.querySelector(".hero-toolbar");
    if (toolbar) toolbar.style.display = isInline ? "" : "none";
    document.body.classList.toggle("tool-mode", !isInline);
    setFullscreen(!!t.fullscreen);

    // 懒加载 iframe
    if (!isInline && t.entry && !iframes[id]) {
      var iframe = document.createElement("iframe");
      iframe.id = t.frameId || (id + "Frame");
      iframe.src = t.entry;
      iframe.title = t.name || id;
      iframe.addEventListener("load", function () { fitFrame(id); });
      iframes[id] = iframe;
      document.getElementById(vid).appendChild(iframe);
    }
    if (iframes[id]) scheduleFit(id);   /* R79：有限次重试，兜住 load 迟到 / about:blank 空跑 */
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }

  /* ---------- 尺寸变化重适配 ---------- */
  var rsTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(function () {
      var t = findTool(activeId);
      setFullscreen(!!(t && t.fullscreen));
      Object.keys(iframes).forEach(fitFrame);
    }, 150);
  });

  /* ---------- 初始化 ---------- */
  function boot() {
    loadTools()
      .then(function (data) {
        tools = normalize(data && data.tools);
        if (!tools.length) throw new Error("tools.json 为空或格式不符");
        renderNav();
        bindLegacyButtons();
        var want = (location.hash || "").replace(/^#/, "");
        switchTo(findTool(want) ? want : (tools[0] && tools[0].id) || DEFAULT_ID);
      })
      .catch(function (err) {
        // tools.json 读不到时给出可见提示，而不是白屏
        var nav = document.querySelector(NAV_SEL);
        if (nav) {
          nav.innerHTML = '<span style="color:#b3312d;font:13px/1.6 \'Microsoft YaHei\',sans-serif">' +
            "工具列表加载失败（tools.json 无法读取）：" + (err && err.message ? err.message : err) + "</span>";
        }
      });
  }

  // 暴露给外部（同步面板等）查询工具清单
  window.__nikkeShell = {
    getTools: function () { return tools.slice(); },
    switchTo: switchTo,
    getActive: function () { return activeId; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
