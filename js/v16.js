/* ============================================================
   v3 原型：保留 hero / 工具导航，只加分页 + 设置弹窗
   window.__PROTO_DASH__ === true 时，结果页改用仪表盘视图
   ============================================================ */
(function () {
  'use strict';

  var byId = function (id) { return document.getElementById(id); };
  var DASH = !!window.__PROTO_DASH__;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function legendText(fs) {
    var lg = fs.querySelector('legend');
    return lg ? lg.textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function fsByPrefix(p) {
    var list = document.querySelectorAll('#formSection fieldset');
    for (var i = 0; i < list.length; i++) if (legendText(list[i]).indexOf(p) === 0) return list[i];
    return null;
  }
  function labelOf(id) { var n = byId(id); return n ? n.closest('label') : null; }
  function hideLabel(id) { var l = labelOf(id); if (l) l.classList.add('v3-hide'); }
  function hideGridOf(id) {
    var n = byId(id); var g = n ? n.closest('.grid') : null;
    if (g) g.classList.add('v3-hide');
  }

  /* ---------------- v9：推图奖励表格 ---------------- */
  var STAGE_ROWS = [
    { key: 'credit', label: '信用点（K）', icon: 'res_credit',
      ids: ['f_stage_credit', 'f_stage_credit2', 'f_stage_task_credit'] },
    { key: 'battle', label: '战斗数据（K）', icon: 'res_battle',
      ids: ['f_stage_battle', 'f_stage_battle2', 'f_stage_task_battle'] },
    { key: 'dust', label: '红球', icon: 'res_dust',
      ids: ['f_stage_dust', 'f_stage_dust2', 'f_stage_task_dust'] }
  ];

  function buildStageTable() {
    /* 用 grid 不用 table：table-layout 在「隐藏列」时会重排列宽，
       实测两列输入框会叠在一起；grid 只要换 template-columns 就行。 */
    var box = el('div', 'v9-reward');
    box.id = 'v9StageTbl';

    [['奖励', ''], ['普通通关', 'c-n'], ['困难通关', 'c-h'], ['主线任务', 'c-t'], ['合计', 'c-s']]
      .forEach(function (h) { box.appendChild(el('div', 'rh ' + h[1], h[0])); });

    var emptied = [];
    STAGE_ROWS.forEach(function (r) {
      var th = el('div', 'rc');
      th.innerHTML = (ICONS[r.icon] ? '<img class="res-icon" alt="" src="' + ICONS[r.icon] + '">' : '') + r.label;
      box.appendChild(th);

      ['c-n', 'c-h', 'c-t'].forEach(function (cls, i) {
        var cell = el('div', 'rv ' + cls);
        var inp = byId(r.ids[i]);
        if (inp) {
          var lb0 = inp.closest('label');
          if (lb0) emptied.push(lb0);
          if (inp.parentNode) inp.parentNode.removeChild(inp);
          /* 只读展示：值仍由 app.js 写入，但不给用户改 */
          inp.setAttribute('readonly', 'readonly');
          inp.setAttribute('tabindex', '-1');
          cell.appendChild(inp);
        }
        box.appendChild(cell);
      });

      var sum = el('div', 'rv c-s');
      sum.id = 'v9sum-' + r.key;
      sum.textContent = '0';
      box.appendChild(sum);
    });

    emptied.forEach(function (lb) {
      if (lb && lb.parentNode && !lb.querySelector('input')) lb.parentNode.removeChild(lb);
    });
    return box;
  }

  /* ---------------- v11：新主线开放后的前哨基地收益 ---------------- */
  var FUT_ITEMS = [
    { key: 'credit', label: '信用点', icon: 'res_credit', fut: 'f_future_credit', cur: 'f_credit_rate' },
    { key: 'battle', label: '战斗数据辑', icon: 'res_battle', fut: 'f_future_battle', cur: 'f_battle_rate' },
    { key: 'dust', label: '红球', icon: 'res_dust', fut: 'f_future_dust', cur: 'f_dust_rate' }
  ];

  function rateNum(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[,，\s]/g, '').replace(/\/h$/, ''));
    return isFinite(n) ? n : null;
  }
  function fmtRate(n) {
    if (n == null) return '—';
    return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '/h';
  }

  function buildFutureIncome() {
    var box = el('div', 'v11-fut');
    box.id = 'v11Fut';
    box.innerHTML =
      '<div class="hd">新主线开放后 · 前哨基地 <b id="v11FutBase">—</b>' +
      '<small id="v11FutDelta"></small></div>' +
      '<div class="its" id="v11FutIts"></div>';
    return box;
  }

  function paintFutureIncome() {
    var box = byId('v11Fut'); if (!box) return;
    var futBase = rateNum(byId('f_future_base') ? byId('f_future_base').value : '');
    var curBase = rateNum(byId('f_base') ? byId('f_base').value : '');

    var baseEl = byId('v11FutBase'), dEl = byId('v11FutDelta');
    if (baseEl) baseEl.textContent = futBase != null ? ('Lv ' + futBase) : '待填预计关卡';
    if (dEl) {
      dEl.textContent = (futBase != null && curBase != null && futBase !== curBase)
        ? '当前 Lv ' + curBase + '，+' + (futBase - curBase) + ' 级'
        : (curBase != null ? '当前 Lv ' + curBase : '');
    }

    var its = byId('v11FutIts'); if (!its) return;
    var rows = FUT_ITEMS.map(function (it) {
      var fv = rateNum(byId(it.fut) ? byId(it.fut).value : '');
      var cv = rateNum(byId(it.cur) ? byId(it.cur).value : '');
      var delta = '';
      if (fv != null && cv != null) {
        var d = cv > 0 ? (fv - cv) / cv * 100 : 0;
        var cls = d >= 0 ? 'up' : 'down';
        var abs = fv - cv;
        var absTxt = (abs >= 0 ? '+' : '-') + Math.abs(abs).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
        delta = '<span class="deltas">' +
          '<i class="' + cls + '">' + absTxt + '/h</i>' +
          '<i class="' + cls + ' pct">' + (d >= 0 ? '+' : '') + d.toFixed(1) + '%</i>' +
          '</span>';
      }
      return '<span class="it">' +
        (ICONS[it.icon] ? '<img src="' + ICONS[it.icon] + '" alt="">' : '') +
        '<b>' + fmtRate(fv) + '</b><small>' + it.label + '</small>' + delta + '</span>';
    }).join('');
    its.innerHTML = rows || '<span class="empty">还没填预计关卡</span>';
  }

  function stageNum(id) {
    var n = byId(id);
    var v = parseFloat(String(n && n.value || '').replace(/,/g, ''));
    return isFinite(v) ? v : 0;
  }

  function updStageSum() {
    STAGE_ROWS.forEach(function (r) {
      var total = r.ids.reduce(function (a, id) { return a + stageNum(id); }, 0);
      var cell = byId('v9sum-' + r.key);
      if (!cell) return;
      cell.textContent = total
        ? total.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
        : '0';
    });
  }

  /* 困难 / 任务两列跟着 app.js 对原 grid 的显隐走 */
  function syncStageCols() {
    var tbl = byId('v9StageTbl'); if (!tbl) return;
    var mode = byId('f_stage_mode') ? byId('f_stage_mode').value : '';
    /* 用下拉值判断，别去猜 app.js 有没有写过 style.display（启动时序不可控） */
    tbl.classList.toggle('no-hard', mode !== '普通+困难');
    tbl.classList.toggle('no-task', mode === '不计算');
  }

  /* ---------------- v7：图标修复 / 信息窗 ---------------- */
  /* 图标表：
     - 单文件预览版由构建脚本注入 window.__NK_ICONS__（data URI）
     - 线上站点 assets 正常加载，按路径拼，目录从页面已有的 res-icon 反推 */
  var ICONS = (function () {
    var injected = window.__NK_ICONS__;
    if (injected && Object.keys(injected).length) return injected;
    var base = 'assets/';
    var probe = document.querySelector('img.res-icon, img.box-icon');
    if (probe) {
      var s = probe.getAttribute('src') || '';
      if (s && s.indexOf('data:') !== 0 && s.indexOf('/') >= 0) base = s.replace(/[^/]*$/, '');
    }
    var ext = function (k) { return /^mbox_30d/.test(k) ? '.jpg' : '.webp'; };
    var out = {};
    ['res_credit', 'res_battle', 'res_dust', 'box_core_dust', 'box_battle', 'box_credit', 'box_growth',
     'mbox_ark', 'mbox_challenger', 'mbox_30d'].forEach(function (k) { out[k] = base + k + ext(k); });
    return out;
  })();

  /* 单文件里 assets/*.webp 被内联成 data URI，而 app.js 的 resIconDir()/fixedIconDir()
     会把「第一张图的 src」当目录去拼「目录 + 文件名」→ 拼出一串坏地址。
     唯一可靠特征是：data: 开头、却仍带 .webp/.jpg 后缀（正常内联是纯 base64）。
     相对路径（用 http 打开时）不在此列，必须放过。 */
  function isBrokenIcon(src) {
    return src.indexOf('data:') === 0 && (src.indexOf('.webp') >= 0 || src.indexOf('.jpg') >= 0);
  }
  var IK_RES = [['战斗数据', 'res_battle'], ['红球', 'res_dust'], ['芯尘', 'res_dust'], ['信用点', 'res_credit']];
  var IK_BOX = [['方舟官方补给物资', 'mbox_ark'], ['30天成长补给箱', 'mbox_30d'], ['挑战者成长宝箱', 'mbox_challenger'],
                ['战斗数据辑盒', 'box_battle'], ['芯尘盒', 'box_core_dust'], ['信用点盒', 'box_credit'], ['成长套组', 'box_growth']];

  function pickIcon(txt, isRes) {
    var t = String(txt || '').replace(/\s+/g, '');
    var list = isRes ? IK_RES : IK_BOX;
    for (var i = 0; i < list.length; i++) if (t.indexOf(list[i][0]) >= 0) return list[i][1];
    return '';
  }

  /* ① 把坏图换成内联图标（认不出来就摘掉，绝不留破图）
     ② 活动明细的表若压根没生成 img（目录推导返回空），按首列文字补上 */
  function fixIcons(root) {
    var scope = root || document;

    Array.prototype.forEach.call(scope.querySelectorAll('img.box-icon, img.res-icon'), function (im) {
      var src = im.getAttribute('src') || '';
      if (!isBrokenIcon(src)) return;
      var isRes = im.classList.contains('res-icon');
      var host = im.parentNode, txt = '';
      for (var k = 0; k < 4 && host && host.nodeType === 1; k++) {
        txt = host.textContent || '';
        if (txt.replace(/\s+/g, '').length > 1) break;
        host = host.parentNode;
      }
      var key = pickIcon(txt, isRes);
      if (key && ICONS[key]) im.setAttribute('src', ICONS[key]);
      else if (im.parentNode) im.parentNode.removeChild(im);
    });

    Array.prototype.forEach.call(scope.querySelectorAll('.event-preview table'), function (tb) {
      var th = tb.querySelector('thead th');
      var h = th ? th.textContent.replace(/\s+/g, '') : '';
      var isRes = h.indexOf('资源') === 0;
      var isBox = h.indexOf('箱子') === 0 || h.indexOf('自选箱') === 0;
      if (!isRes && !isBox) return;
      Array.prototype.forEach.call(tb.querySelectorAll('tbody tr'), function (tr) {
        var td = tr.cells[0];
        if (!td || td.querySelector('img')) return;
        var key = pickIcon(td.textContent, isRes);
        if (!key || !ICONS[key]) return;
        var im = document.createElement('img');
        im.className = isRes ? 'res-icon' : 'box-icon';
        im.alt = '';
        im.setAttribute('src', ICONS[key]);
        td.insertBefore(im, td.firstChild);
      });
    });
  }

  /* #eventTotals 每次都是整体重渲染，图标要跟着修 */
  var iconTimer = 0;
  function watchIcons() {
    var t = byId('eventTotals');
    if (!t) return;
    new MutationObserver(function () {
      clearTimeout(iconTimer);
      iconTimer = setTimeout(function () { fixIcons(t); }, 40);
    }).observe(t, { childList: true, subtree: true });
    fixIcons(t);
  }

  /* 字段名补资源图标：必须包成 .v4-lab（.grid label 是 flex column，否则图标独占一行） */
  function putResIcon(lb, key) {
    if (!lb || !key || lb.querySelector('img.res-icon')) return;
    var span = lb.querySelector('.v4-lab');
    if (!span) {
      span = document.createElement('span');
      span.className = 'v4-lab';
      if (lb.firstChild && lb.firstChild.nodeType === 3) {
        span.textContent = lb.firstChild.nodeValue;
        lb.replaceChild(span, lb.firstChild);
      } else {
        lb.insertBefore(span, lb.firstChild);
      }
    }
    var im = document.createElement('img');
    im.className = 'res-icon';
    im.alt = '';
    im.setAttribute('src', ICONS[key] || ('assets/' + key + '.webp'));
    span.insertBefore(im, span.firstChild);
  }

  /* ---------------- v9：活动行预置 ---------------- */
  /* 用户给的配置：模板 + 起始日期（旧版显示效果里就是这 7 行）。
     活动名未匹配到（B 站官号/国际服时间表都与这 7 个日期不重合），先用模板名；
     想补名字直接往 EVENT_NAMES 里加 "模板id|起始日期": "活动名"。 */
  /* 国服（胜利女神：新的希望）官方活动名，按「模板id|起始日期」索引。
     来源：国服制作组笔记 + 11/4 更新公告 + 1.5 周年前瞻。
     2026-12-30 与 2027-01-13 两期官方还没公布，先用模板名。 */
  var EVENT_NAMES = {
    'large28map|2026-10-21': 'Lie cause Recoil',       /* 莉可丽丝联动 · 28 天带地图 */
    'small14|2026-11-04': 'TRUE FLAVOR 真味心意',
    'large21|2026-11-18': 'GODDESS FALL 女神陨落',
    'small14|2026-12-02': 'COINS IN RUSH 金币追逐战',
    'large21|2026-12-16': 'ICE DRAGON SAGA 冰龙传奇'
  };
  var SEED_EVENTS = [
    { tpl: 'large28map', date: '2026-10-21' },   /* 联动大型活动，28 天带地图 */
    { tpl: 'small14', date: '2026-11-04' },
    { tpl: 'large21', date: '2026-11-18' },
    { tpl: 'small14', date: '2026-12-02' },
    { tpl: 'large21', date: '2026-12-16' },
    { tpl: 'small14', date: '2026-12-30' },
    { tpl: 'large21', date: '2027-01-13' }
  ];

  var _seedTries = 0, _seedDone = false;

  function fillSeedRows() {
    if (_seedDone) return;
    _seedDone = true;

    var guard = 0;
    while (document.querySelectorAll('#eventRows .event-row').length < SEED_EVENTS.length && guard++ < 20) {
      byId('btnAddEvent').click();
    }
    Array.prototype.forEach.call(document.querySelectorAll('#eventRows .event-row'), function (row, i) {
      var s = SEED_EVENTS[i]; if (!s) return;
      var sel = row.querySelector('.ev-template');
      if (sel && sel.value !== s.tpl) {
        sel.value = s.tpl;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var dt = row.querySelector('.ev-start');
      if (dt) {
        dt.value = s.date;
        dt.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    paintEventNames();

    var box = byId('eventRows');
    if (box && !box._nameWatch) {
      box._nameWatch = 1;
      new MutationObserver(paintEventNames).observe(box, { childList: true, subtree: true, characterData: true });
    }
  }

  function seedEvents() {
    if (!byId('btnAddEvent')) return;
    /* 用户已经存过活动（localStorage 里 loadForm 出来的）就不动，绝不覆盖 */
    if (document.querySelectorAll('#eventRows .event-row').length) { paintEventNames(); return; }

    /* boot 可能早于 app.js 的 bindEvents()：点一次没反应就等下一轮 */
    (function tick() {
      if (document.querySelectorAll('#eventRows .event-row').length) { fillSeedRows(); return; }
      try { byId('btnAddEvent').click(); } catch (e) {}
      if (document.querySelectorAll('#eventRows .event-row').length) { fillSeedRows(); return; }
      if (_seedTries++ < 40) setTimeout(tick, 150);
    })();
  }

  function paintEventNames() {
    Array.prototype.forEach.call(document.querySelectorAll('#eventRows .event-row'), function (row) {
      /* 状态徽章的上色由 app.js 的 refreshActivityStatus 负责（连文本带 class 一起写）；
         这里只补活动名，不要再去 toggle .on/.off —— 会把黄/红判据覆盖成绿。 */
      if (row.querySelector('.ev-name')) return;
      var sel = row.querySelector('.ev-template');
      var dt = row.querySelector('.ev-start');
      var key = (sel ? sel.value : '') + '|' + (dt ? dt.value : '');
      var nm = EVENT_NAMES[key] || '';
      /* 没名字也插占位：既保证下拉不会顶到最左，也避免左侧留一大段空白 */
      row.insertBefore(el('span', 'ev-name' + (nm ? '' : ' empty'), nm || '待公布活动'), row.firstChild);
    });
  }

  /* 已结束活动 → 历史留档（2026-11-19）
     主列表隐藏、卡头「历史」图标带条数角标；浮层只读展示，不参与计算。 */
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function eventRowsAll() {
    return Array.prototype.slice.call(document.querySelectorAll('#eventRows .event-row'));
  }
  function isExpiredRow(row) {
    var st = row ? row.querySelector('.ev-status') : null;
    if (!st) return false;
    return st.classList.contains('done') || /已结束/.test(st.textContent || '');
  }
  function refreshEventHistory() {
    var n = 0;
    eventRowsAll().forEach(function (row) {
      var ex = isExpiredRow(row);
      row.classList.toggle('v3-ev-expired', ex);
      if (ex) n++;
    });
    var badge = byId('v6EvHistN');
    if (badge) { badge.textContent = n ? String(n) : ''; badge.hidden = !n; }
    var b = byId('v6EvHist');
    if (b) b.classList.toggle('is-empty', !n);
    return n;
  }
  function renderEventHistory() {
    var rows = eventRowsAll().filter(isExpiredRow);
    if (!rows.length) return '<p class="ft">还没有已结束的活动。活动结束后会自动收进这里，只做留档、不参与计算。</p>';
    var html = '<div class="hd">已结束的活动<small>只做留档，不参与计算</small></div>' +
      '<table class="v3-histtbl"><thead><tr><th>活动</th><th>起始</th><th>最后一天</th><th>状态</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      var nm = row.querySelector('.ev-name');
      var st = row.querySelector('.ev-start');
      var en = row.querySelector('.ev-end');
      html += '<tr><td>' + escHtml((nm ? nm.textContent : '').trim() || '（未命名）') + '</td>' +
        '<td>' + escHtml(st ? st.value : '—') + '</td>' +
        '<td>' + escHtml(en && en.value ? en.value : '按模板') + '</td>' +
        '<td class="muted">已结束</td></tr>';
    });
    return html + '</tbody></table>';
  }

  /* 信息窗开关：里面有输入框，只认点击（鼠标划过不关），Esc / 点外部关闭 */
  function bindPop(btn, pop) {
    if (!btn || !pop) return;
    var locked = false;
    var place = function () {
      var host = pop.parentNode;
      var br = btn.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      pop.style.right = 'auto';
      pop.style.left = Math.max(8, Math.min(br.left - hr.left, host.clientWidth - pw - 8)) + 'px';
      var below = br.bottom - hr.top + 6;
      var above = br.top - hr.top - ph - 6;
      /* 按钮已经在卡片底部，下方就是下一张卡片；放不下就向上弹 */
      if (below + ph > window.innerHeight && above > 8) pop.style.top = above + 'px';
      else pop.style.top = below + 'px';
    };
    var open = function () { place(); pop.classList.add('on'); btn.classList.add('on'); };
    var close = function () { locked = false; pop.classList.remove('on'); btn.classList.remove('on'); };
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      locked = !locked;
      if (locked) open(); else close();
    });
    document.addEventListener('click', function (e) {
      if (pop.contains(e.target) || btn.contains(e.target)) return;
      if (locked) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && locked) close(); });
  }

  /* 给字段挂一个 i 信息窗：长说明收进浮层，卡片上只留一个小圆点。
     label 是 flex column，必须把字段名包成 span 才能与按钮同行（同 decorateBase 的做法）。
     hostEl 必须是 position:relative 的容器（fieldset 已由 #formSection fieldset 统一设置）。 */
  function attachInfo(labelEl, title, html, hostEl) {
    if (!labelEl || !hostEl) return null;
    var btn = el('button', 'v4-info');
    btn.type = 'button';
    btn.setAttribute('aria-label', '查看说明');
    btn.title = title || '查看说明';
    btn.textContent = 'i';
    if (labelEl.firstChild && labelEl.firstChild.nodeType === 3) {
      var span = document.createElement('span');
      span.className = 'v4-lab';
      span.textContent = labelEl.firstChild.nodeValue;
      labelEl.replaceChild(span, labelEl.firstChild);
      span.appendChild(btn);
    } else {
      labelEl.insertBefore(btn, labelEl.querySelector('input, select'));
    }
    var pop = el('div', 'v4-pop v3-pop-sm');
    pop.innerHTML = '<div class="hd">' + (title || '说明') + '</div><div class="ft">' + html + '</div>';
    hostEl.appendChild(pop);
    bindPop(btn, pop);
    return pop;
  }

  var CFG = {
    version: '2026-11-15.1', publishedAt: '2026-11-15 04:00',
    events: [
      { name: 'LIE CAUSE RECOIL', label: '28天大活动 · 地图', start: '2026-11-04', end: '2026-12-02', days: 27, state: 'on' },
      { name: 'NYA NYA PARADISE', label: '21天大活动', start: '2026-10-14', end: '2026-11-03', days: 0, state: 'off' }
    ]
  };

  var S = { page: 1, p1: null, p2: null, steps: null };

  /* ---------------- 步骤条（放在工具导航下方、表单上方） ---------------- */
  function buildSteps() {
    var plan = byId('appPlanner'), layout = byId('layout');
    if (!plan || !layout) return false;
    var steps = el('nav', 'v3-steps');
    steps.setAttribute('aria-label', '填写步骤');
    [{ id: 1, t: '填写', s: '账号 · 资源 · 库存' },
     { id: 2, t: '推图进度&amp;活动', s: '基地 · 新主线 · 活动' },
     { id: 3, t: '结果', s: '汇总 · 明细' }].forEach(function (p) {
      var b = el('button', 'v3-step');
      b.type = 'button'; b.dataset.pg = p.id;
      b.innerHTML = '<span class="no">' + p.id + '</span><span class="tx">' + p.t + '<small>' + p.s + '</small></span>';
      b.addEventListener('click', function () { go(p.id); });
      steps.appendChild(b);
    });
    plan.insertBefore(steps, layout);
    S.steps = steps;
    return true;
  }

  /* ---------------- 分页容器 ---------------- */
  function buildPages() {
    var form = byId('formSection');
    var wrap = el('div', '');
    var p1 = el('div', 'v3-page on'); p1.dataset.pg = '1';
    var p2 = el('div', 'v3-page'); p2.dataset.pg = '2';
    wrap.appendChild(p1); wrap.appendChild(p2);
    form.insertBefore(wrap, form.firstChild);
    S.p1 = p1; S.p2 = p2;

    /* 页头按用户要求去掉，不再占一行 */
  }
  function addHead(page, t, s) {
    page.appendChild(el('div', 'ph', '<h3>' + t + '</h3><p>' + s + '</p>'));
  }

  function arrange() {
    /* 账号状态拆两栏：左边账号，右边目标 —— 一行两个区块 */
    var acc = fsByPrefix('账号状态');
    var tgt = null;
    if (acc) {
      tgt = document.createElement('fieldset');
      tgt.className = acc.className;
      tgt.innerHTML = '<legend>目标</legend>';
      var g2 = el('div', 'grid g2');
      ['f_target', 'f_alternate'].forEach(function (id) {
        var lb = labelOf(id); if (lb) g2.appendChild(lb);
      });
      tgt.appendChild(g2);
      var g0 = acc.querySelector('.grid');
      if (g0) g0.className = 'grid g2';
    }
    var row1 = el('div', 'v4-row');
    if (acc) row1.appendChild(acc);
    if (tgt) row1.appendChild(tgt);
    /* 2026-11-19：前哨基地防御等级是一切收益的输入，从第 2 页挪回第 1 页、紧贴现有资源上一行 */
    var baseFs = fsByPrefix('当前基地');
    if (S.p1) {
      S.p1.appendChild(row1);
      if (baseFs) S.p1.appendChild(baseFs);
      ['现有资源', '固定小时箱数量', '自选箱数量'].forEach(function (k) {
        var fs = fsByPrefix(k); if (fs) S.p1.appendChild(fs);
      });
      /* 每日一举歼灭次数：从设置弹窗搬回第 1 页（默认 1 次，信息窗注明含每日免费次数） */
      var resFs = fsByPrefix('现有资源');
      var wipe = labelOf('f_wipeouts');
      if (resFs && wipe) {
        var wg = el('div', 'grid g3 v3-wipe');
        wg.appendChild(wipe);
        resFs.appendChild(wg);
        attachInfo(wipe, '每日一举歼灭次数',
          '填<b>每天一共打几次</b>，<b>包含每日免费的那 1 次</b>。免费次数也占一次，所以「只打免费的一把」填 1。' +
          '<br>每次等价小时数默认 2 小时（歼灭一次折算的挂机时长），影响每日收益里的额外积累。', resFs);
      }
    }

    /* 新主线：预计进度 + 推图收益 并排 */
    var row2 = el('div', 'v4-row');
    ['预计新主线进度', '预计新主线推图收益'].forEach(function (k) {
      var fs = fsByPrefix(k); if (fs) row2.appendChild(fs);
    });
    if (S.p2) S.p2.appendChild(row2);
    /* 原活动组整块隐藏；真实活动行（含委托）搬进 P2 的「额外活动」折叠 */
    var ev = fsByPrefix('活动收益');
    if (ev) {
      var card = buildCfgCard();

      /* 活动排期直接摆在卡面上（之前塞进「我有额外活动」折叠，用户以为没生效） */
      /* 「+ 添加活动」挪到卡头右上，省掉底部孤零零一行 */
      var addBtn = byId('btnAddEvent');
      if (addBtn) card.querySelector('.ch').appendChild(addBtn);

      var body = el('div', 'v3-evbody');
      /* 2026-11-19：去掉「最后一天」列（按用户要求），数据仍保留在 .ev-end 输入里，
         只是不展示；已结束的活动收进右上角「历史」浮层。 */
      body.appendChild(el('div', 'v3-evhead',
        '<span class="h-name">活动</span>' +
        '<span class="h-tpl">模板</span>' +
        '<span class="h-dt">起始日期</span>' +
        '<span class="h-st">状态</span><i></i>'));
      ['eventRows'].forEach(function (id) {
        var n = byId(id); if (n) body.appendChild(n);
      });
      card.appendChild(body);

      /* 已结束活动 → 历史浮层（图标在卡头，带条数角标） */
      var ch = card.querySelector('.ch');
      if (ch) {
        var hist = el('button', 'v6-more v3-histbtn');
        hist.type = 'button'; hist.id = 'v6EvHist';
        hist.title = '已结束的活动';
        hist.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4.5V9h4.5"/><path d="M12 7.5V12l3 1.8"/></svg>' +
          '<span>历史</span><b class="v3-histn" id="v6EvHistN"></b>';
        ch.appendChild(hist);
        var hpop = el('div', 'v4-pop v3-histpop');
        var hbody = el('div', 'v3-histbody', '<p class="ft">还没有已结束的活动。</p>');
        hpop.appendChild(hbody);
        card.appendChild(hpop);
        hist.addEventListener('click', function () {
          hbody.innerHTML = renderEventHistory();
        });
        bindPop(hist, hpop);
        refreshEventHistory();
        if (window.MutationObserver) {
          var t = 0;
          new MutationObserver(function () {
            clearTimeout(t); t = setTimeout(refreshEventHistory, 120);
          }).observe(byId('eventRows') || card, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
        }
      }

      S.p2.appendChild(card);
      ev.classList.add('v3-hide');

      seedEvents();

      /* 收益明细搬进卡片右上角的信息窗 */
      var host = byId('v6EvHost'), tot = byId('eventTotals');
      if (host && tot) host.appendChild(tot);
      bindPop(byId('v6EvBtn'), byId('v6EvPop'));
      watchIcons();
    }
    /* 收益组 / 升级消耗 整块隐藏；账号两项隐藏 */
    var daily = fsByPrefix('当前收益与每日收益'); if (daily) daily.classList.add('v3-hide');
    var cost = fsByPrefix('升级消耗素材量'); if (cost) cost.classList.add('v3-hide');
    hideLabel('f_saved_at'); hideLabel('f_collected_before');
    /* 月卡：搬进设置弹窗，同行说明一起藏 */
    var mc = byId('f_monthly_card');
    if (mc) {
      var g = mc.closest('.grid');
      if (g) Array.prototype.forEach.call(g.querySelectorAll('.hint'), function (h) { h.classList.add('v3-hide'); });
    }
    /* 预计收益 4 格随关卡自动带出，仍隐藏；推图奖励 9 格改为搬进「奖励明细」信息窗 */
    ['f_future_base', 'f_future_credit', 'f_future_battle', 'f_future_dust'].forEach(hideGridOf);
    /* 推图收益：标题去掉「官方拆包」字样（app.js 会随章节重写，需持续纠正） */
    (function () {
      var tEl = byId('stageClearTitle');
      var fixTitle = function () {
        if (!tEl) return;
        var t = tEl.textContent;
        var n = t.replace('（官方拆包逐章数据）', '').replace('· 官方拆包）', '）').replace('（官方拆包）', '');
        if (n !== t) tEl.textContent = n;
      };
      fixTitle();
      if (tEl) new MutationObserver(fixTitle).observe(tEl, { childList: true, characterData: true, subtree: true });
    })();

    /* 推图收益的数据来源说明整段移除 */
    (function () {
      var fs = fsByPrefix('预计新主线推图收益');
      if (!fs) return;
      Array.prototype.forEach.call(fs.querySelectorAll('p.hint.note'), function (p) {
        if (p.id === 'stageClearNote') return;          // 动态图例保留
        if (p.textContent.indexOf('CampaignStageTable') >= 0) p.classList.add('v3-hide');
      });
    })();

    /* P2 顶部文案：收益字段已隐藏，改成准确说法 */
    var ffs = fsByPrefix('预计新主线进度');
    var hint = ffs ? ffs.querySelector('.hint') : null;
    if (hint && hint.textContent.indexOf('自动推算') >= 0) {
      hint.textContent = '填开放日期与预计关卡才会把新主线收益算进去；不填就按当前进度规划。';
    }
  }

  /* ---------------- 基地：ⓘ + 关卡推算折叠 ---------------- */
  function decorateBase() {
    var fs = fsByPrefix('当前基地'); if (!fs) return;
    fs.style.position = 'relative';

    var lg = fs.querySelector('legend');
    if (lg) {
      var btn = el('button', 'v4-info');
      btn.type = 'button';
      btn.setAttribute('aria-label', '查看前哨基地收益');
      btn.title = '前哨基地收益';
      btn.textContent = 'i';
      /* 紧跟在「前哨基地防御等级」字段名后面。
         注意：.grid label 是 flex column，直接插按钮会独占一行 —— 必须把字段名包成 span，
         再把按钮放进同一个 span，才会和文字同行。 */
      var baseLabel = labelOf('f_base');
      if (baseLabel && baseLabel.firstChild && baseLabel.firstChild.nodeType === 3) {
        var span = document.createElement('span');
        span.className = 'v4-lab';
        span.textContent = baseLabel.firstChild.nodeValue;
        baseLabel.replaceChild(span, baseLabel.firstChild);
        span.appendChild(btn);
      } else if (baseLabel) {
        baseLabel.insertBefore(btn, baseLabel.querySelector('input'));
      } else {
        fs.appendChild(btn);
      }

      var pop = el('div', 'v4-pop');
      pop.innerHTML = '<div class="hd">前哨基地收益<small>随等级自动带出，可手动覆盖</small></div>';
      var daily = fsByPrefix('当前收益与每日收益');
      if (daily) {
        /* 收益三项也要道具图标（和前哨基地奖励一块儿显示，不能只在明细里有） */
        [['f_credit_rate', 'res_credit'], ['f_battle_rate', 'res_battle'], ['f_dust_rate', 'res_dust']].forEach(function (p) {
          putResIcon(labelOf(p[0]), p[1]);
        });
        var g = daily.querySelector('.grid.g3');
        if (g) pop.appendChild(g);
        daily.classList.add('v3-hide');
      }
      pop.appendChild(el('p', 'ft', '一般不用改；一举歼灭折算等特殊情形可直接改，仍参与计算。'));
      fs.appendChild(pop);

      var locked = false, timer = 0;
      var place = function () {
        var br = btn.getBoundingClientRect(), fr = fs.getBoundingClientRect();
        pop.style.right = 'auto';
        pop.style.left = Math.max(8, Math.min(br.left - fr.left, fs.clientWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (br.bottom - fr.top + 6) + 'px';
      };
      var show = function () { clearTimeout(timer); place(); pop.classList.add('on'); };
      var hide = function () { if (locked) return; timer = setTimeout(function () { pop.classList.remove('on'); }, 180); };
      btn.addEventListener('mouseenter', show);
      btn.addEventListener('mouseleave', hide);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        locked = !locked;
        if (locked) { place(); pop.classList.add('on'); btn.classList.add('on'); }
        else { pop.classList.remove('on'); btn.classList.remove('on'); }
      });
      pop.addEventListener('mouseenter', show);
      pop.addEventListener('mouseleave', hide);
      document.addEventListener('click', function (e) {
        if (pop.contains(e.target) || btn.contains(e.target)) return;
        locked = false; btn.classList.remove('on'); pop.classList.remove('on');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { locked = false; btn.classList.remove('on'); pop.classList.remove('on'); }
      });
    }

    /* 现有资源补图标：顺带恢复 23a23c8 删掉的 res-icon（旧版本来就有） */
    var bareRes = { f_bare_credit: 'res_credit', f_bare_battle: 'res_battle', f_bare_dust: 'res_dust' };
    Object.keys(bareRes).forEach(function (id) { putResIcon(labelOf(id), bareRes[id]); });

    /* 推图收益：奖励明细收进 i 信息窗；卡片上改贴「新主线开放后的前哨基地收益」 */
    var sc = fsByPrefix('预计新主线推图收益');
    if (sc) {
      sc.classList.add('v8-corner');

      /* ---- 信息窗：口径说明 + 奖励明细 ---- */
      var spop = el('div', 'v4-pop v6-pop-med v9-scpop');
      spop.id = 'v6ScPop';
      spop.appendChild(el('div', 'hd', '推图收益怎么算的'));
      var shint = sc.querySelector('p.hint');
      if (shint && shint.textContent.indexOf('新主线推图给的一次性资源') >= 0) {
        spop.appendChild(shint);
      } else {
        spop.appendChild(el('p', 'ft', '新主线推图给的一次性资源 = 该章关卡通关奖励 + 该章主线任务奖励；默认值随「预计普通主线关卡」所选章节自动带出。'));
      }

      /* 三个 grid 必须在搬 input 之前记下来（input 一进表格，closest('.grid') 就是 null） */
      var gN = byId('f_stage_credit') ? byId('f_stage_credit').closest('.grid') : null;
      var gH = byId('stageHardRow');
      var gT = byId('stageTaskRow');

      var tbl = buildStageTable();
      spop.appendChild(tbl);

      /* 浮层挂到整行上：单张卡片只有 ~400px，奖励表 5 列会被压扁 */
      (sc.parentNode || sc).appendChild(spop);
      var stash = el('div', 'v9-stash');
      [gN, gH, gT].forEach(function (g) { if (g) stash.appendChild(g); });
      sc.appendChild(stash);

      var sbtn = el('button', 'v4-info v4-info--corner');
      sbtn.type = 'button'; sbtn.id = 'v6ScBtn';
      sbtn.title = '奖励明细与口径';
      sbtn.setAttribute('aria-label', '奖励明细与口径');
      sbtn.textContent = 'i';
      sc.appendChild(sbtn);
      bindPop(sbtn, spop);
      /* 浮层里是只读数字，打开时补算一次合计（值由 app.js 程序化写入，不触发事件） */
      sbtn.addEventListener('click', function () { setTimeout(function () { updStageSum(); }, 0); });

      /* ---- 卡片正文：新主线开放后的前哨基地收益 ---- */
      sc.appendChild(buildFutureIncome());

      syncStageCols();
      updStageSum();
      var modeSel = byId('f_stage_mode');
      if (modeSel) modeSel.addEventListener('change', function () { setTimeout(syncStageCols, 0); });
      ['stageHardRow', 'stageTaskRow'].forEach(function (id) {
        var n = byId(id);
        if (n) new MutationObserver(syncStageCols).observe(n, { attributes: true, attributeFilter: ['style'] });
      });
      /* 章节 / 日期变化会重算未来收益，这里只是把面板同步过去 */
      var ff = fsByPrefix('预计新主线进度');
      if (ff) ff.addEventListener('change', function () { setTimeout(paintFutureIncome, 60); });
      /* 2026-11-19 修：手填前哨基地等级、战术学院、收益字段变化时这张卡不跟着刷新（用户报障）。
         之前只监听「预计新主线进度」这一个块，改 f_base 只重算了隐藏输入框，卡片还是旧值。 */
      ['f_base', 'f_tactics', 'f_credit_rate', 'f_battle_rate', 'f_dust_rate'].forEach(function (id) {
        var n = byId(id);
        if (!n) return;
        n.addEventListener('change', function () { setTimeout(paintFutureIncome, 60); });
        n.addEventListener('input', function () { setTimeout(paintFutureIncome, 90); });
      });
    }

    var stage = fsByPrefix('关卡进度');
    if (stage) {
      /* 2026-11-19：由 <details> 折叠条改成「字段名旁的算器图标 + 可收起面板」，
         参照 pinkuro 的做法：基地等级是手填输入框，章节进度只是它的换算器，默认收起。 */
      var lg2 = stage.querySelector('legend'); if (lg2) lg2.remove();
      var wrap = el('div', 'v3-progwrap');
      wrap.hidden = true;
      while (stage.firstChild) wrap.appendChild(stage.firstChild);
      fs.appendChild(wrap);
      stage.classList.add('v3-hide');

      var pb = el('button', 'v4-icobtn');
      pb.type = 'button'; pb.title = '章节进度换算'; pb.setAttribute('aria-label', '章节进度换算');
      pb.setAttribute('aria-expanded', 'false');
      pb.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M7.5 7.5h9"/>' +
        '<path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></svg>';
      var labSpan = baseLabel ? baseLabel.querySelector('.v4-lab') : null;
      (labSpan || baseLabel || fs).appendChild(pb);
      pb.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        wrap.hidden = !wrap.hidden;
        pb.classList.toggle('on', !wrap.hidden);
        pb.setAttribute('aria-expanded', String(!wrap.hidden));
      });
    }
  }

  /* ---------------- 自选箱：挑战者箱说明收进信息窗 ---------------- */
  function decorateBoxes() {
    var note = byId('challengerNote');
    if (!note) return;
    var sel = byId('f_challenger_pref');
    var lab = sel ? sel.closest('label') : null;
    var fs = fsByPrefix('自选箱数量');
    if (!lab || !fs) return;
    var html = note.innerHTML;
    var cell = note.parentNode;
    if (cell) { note.remove(); if (!cell.textContent.trim()) cell.classList.add('v3-hide'); }
    attachInfo(lab, '挑战者箱资源选择', html, fs);
  }

  /* ---------------- 云端配置卡 ---------------- */
  function buildCfgCard() {
    var card = el('div', 'v3-cfg');
    card.innerHTML =
      '<div class="ch"><b>活动收益</b>' +
      '<button type="button" class="v4-info" id="v6EvBtn" title="活动收益明细" aria-label="活动收益明细">i</button>' +
      '<span class="ver">' + CFG.version + '</span>' +
      '<span class="when">发布于 ' + CFG.publishedAt + '</span></div>' +
      '<div class="v4-pop v6-pop-wide" id="v6EvPop">' +
        '<div class="hd">活动收益明细<small>随活动行与计算口径实时汇总</small></div>' +
        '<div id="v6EvHost"></div>' +
        '<div class="ft">活动「最后一天」留空 = 按模板天数（28/21/14 天，按 04:00 重置次数计）推算。'
          + '官方公告若写明实际结束时间、或该期受强更（强制更新停服）影响顺延/缩短，'
          + '把公告里的最后一天填进每行末列，状态、计入天数与收益都会按它重算。</div>' +
        '<div class="ft">活动期间的资源与箱子按日计入，并参与开箱顺序与全箱梭哈上限。</div>' +
      '</div>';
    return card;
  }

  /* ---------------- 设置弹窗（居中） ---------------- */
  function buildModal() {
    var mask = el('div', 'v3-mask');
    var modal = el('div', 'v3-modal');
    modal.innerHTML = '<div class="mh"><b>设置</b><button type="button" class="x" id="v3Close">✕</button></div><div class="mb"></div>';
    document.body.appendChild(mask); document.body.appendChild(modal);
    var mb = modal.querySelector('.mb');

    var s1 = el('div', 'sec', '<h4>计算设置</h4>');

    /* 服务器：只影响推算说明的标注（关卡表两服共用，见 R66 口径） */
    var srvBox = el('div', 'v11-srv');
    srvBox.innerHTML =
      '<label>服务器' +
      '<select id="v11Srv">' +
      '<option value="cn">国服 · 胜利女神：新的希望</option>' +
      '<option value="intl">国际服 · GODDESS OF VICTORY</option>' +
      '</select></label>' +
      '<p class="hint">关卡表两服共用（Chapter 0~48 · 基地上限 Lv712），切换不改数值，只改推算说明的写法。</p>';
    s1.appendChild(srvBox);

    var srvSel = srvBox.querySelector('#v11Srv');
    srvSel.value = getServer();
    srvSel.addEventListener('change', function () {
      try { localStorage.setItem('nikke_planner_server', srvSel.value); } catch (e) {}
      /* 切回国际服：我刚改过的文案得让 app.js 重写一遍才会恢复成原文 */
      if (srvSel.value !== 'cn') {
        var b = byId('f_base');
        if (b) b.dispatchEvent(new Event('change', { bubbles: true }));
      }
      paintServerLabel();
    });

    /* 战术学院：固定口径，搬进设置更合理（默认「是」）。
       搬走后基地卡那一行只剩「前哨基地防御等级」，把 g2 降成单列，别留半个空位。 */
    var tactics = labelOf('f_tactics');
    if (tactics) {
      var bg = byId('f_base') ? byId('f_base').closest('.grid') : null;
      if (bg && bg.querySelectorAll('label').length <= 2) bg.classList.remove('g2');
      s1.appendChild(tactics);
    }

    var card = labelOf('f_monthly_card'), keep = labelOf('f_keep_one_box');
    /* 每日一举歼灭次数已搬回第 1 页（arrange 里处理），设置里不再重复放一份 */
    if (card) s1.appendChild(card);
    if (keep) {
      if (keep.firstChild && keep.firstChild.nodeType === 3) keep.firstChild.nodeValue = '每种箱留 1 个';
      var kg = keep.closest('.grid');
      if (kg) Array.prototype.forEach.call(kg.querySelectorAll('.hint'), function (h) {
        var p = h.closest('div'); if (p) p.classList.add('v3-hide');
      });
      s1.appendChild(keep);
    }

    /* 计算后自动同步（R46 原口径，23a23c8 连同 UI 一起删了，这里放回设置）。
       用 select 是沿用「战术学院」那套写法，样式全在 .v3-modal .row 里，不用新增 CSS。 */
    var syncRow = el('div', 'row',
      '<span class="lb">计算后自动同步云端<small>未登录时只存本机，不弹面板打扰；要立刻上传点右侧云图标</small></span>' +
      '<select id="v16Autosync"><option value="1">是</option><option value="0">否</option></select>');
    s1.appendChild(syncRow);
    var syncSel = syncRow.querySelector('#v16Autosync');
    syncSel.value = autosyncOn() ? '1' : '0';
    syncSel.addEventListener('change', function () {
      try { localStorage.setItem(SYNC_PREF, syncSel.value); } catch (e) {}
      paintSyncBtn();
    });

    mb.appendChild(s1);

    var s2 = el('div', 'sec', '<h4>内置默认（只读，仅在此处与日志可见）</h4>');
    [['服务器每日重置', '04:00'], ['每次歼灭等价小时', '2 h'],
     ['今天已完成歼灭', '跟随每日次数'], ['后续每天完成全部', '是'],
     ['升级消耗来源', '内置阶梯表（每 50 级一档）']].forEach(function (r) {
      s2.appendChild(el('div', 'row', '<span class="lb">' + r[0] + '</span><span class="ro">' + r[1] + '</span>'));
    });
    mb.appendChild(s2);

    var s3 = el('div', 'sec', '<h4>运行日志</h4>');
    var log = el('div', 'log'); log.id = 'v3Log';
    s3.appendChild(log); mb.appendChild(s3);

    var s4 = el('div', 'sec', '<h4>我的数据</h4>');
    s4.appendChild(el('div', 'row',
      '<span class="lb">导出当前表单<small>JSON 备份，可留底或换机导入</small></span>' +
      '<button type="button" class="v3-btn" id="v3Export">导出</button>'));
    s4.appendChild(el('div', 'row',
      '<span class="lb">清空本地表单<small>删除浏览器里已保存的输入，需二次确认</small></span>' +
      '<button type="button" class="v3-btn" id="v3Clear">清空</button>'));
    mb.appendChild(s4);

    var open = function () { modal.classList.add('on'); mask.classList.add('on'); paintLog(); };
    var close = function () { modal.classList.remove('on'); mask.classList.remove('on'); };
    byId('v3Gear').addEventListener('click', open);
    byId('v3Close').addEventListener('click', close);
    mask.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    byId('v3Export').addEventListener('click', function () {
      var out = {};
      try { out = JSON.parse(localStorage.getItem('nikke_planner_form_v1') || '{}'); } catch (e) {}
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      a.download = 'nikke_form_backup.json'; a.click();
    });
    byId('v3Clear').addEventListener('click', function () {
      if (!confirm('确定清空浏览器里保存的表单？建议先导出备份。')) return;
      try { localStorage.removeItem('nikke_planner_form_v1'); } catch (e) {}
      location.reload();
    });
  }

  function paintLog() {
    var log = byId('v3Log'); if (!log) return;
    var v = function (id) { var n = byId(id); return n && n.value ? n.value : '—'; };
    log.innerHTML =
      '配置         云端 ' + CFG.version + '\n' +
      '数据日期     ' + v('f_recorded') + '\n' +
      '最近保存     ' + v('f_saved_at') + '\n' +
      '采集前已回收 ' + v('f_collected_before') + '（默认是）\n' +
      '今天已完成   ' + v('f_completed') + ' / ' + v('f_wipeouts') + '\n' +
      '后续每天全勤 ' + v('f_daily_full') + '\n' +
      '每日重置     ' + v('f_reset_time') + '\n' +
      '等价小时     ' + v('f_wipeout_hours') + ' h\n' +
      '升级消耗     内置阶梯表（每 50 级一档）\n' +
      '活动奖励     云端下发（用户不可改）';
  }

  /* ---------------- 结果页：长小数收成 1 位 ---------------- */
  /* app.js 有些地方直接把浮点算出来的等级写进文案（+1.77405712395236 级），
     这里只处理「3 位以上小数」的机器精度尾巴，1~2 位的正常数字（51.6 天 / 1.85%）不动。 */
  function roundResultNumbers(root) {
    var box = root || byId('tabResult');
    if (!box || box._rounding) return;
    box._rounding = 1;
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var t = node.nodeValue;
      if (!t || t.indexOf('.') < 0 || !/\d\.\d{3,}/.test(t)) return;
      var nt = t.replace(/-?\d+\.\d{3,}/g, function (m) {
        var v = Number(m);
        return isFinite(v) ? v.toFixed(1) : m;
      });
      if (nt !== t && node.nodeValue !== nt) node.nodeValue = nt;
    });
    setTimeout(function () { box._rounding = 0; }, 0);
  }

  /* ---------------- 收益明细：分区块 + 补图标 ---------------- */
  var EXTRA_LABELS = { '（现有资源）': 'res', '（固定箱）': 'fixed', '（自选箱）': 'sel' };

  function putIcon(td, isRes) {
    if (!td || td.querySelector('img')) return;
    var key = pickIcon(td.textContent, isRes);
    if (!key || !ICONS[key]) return;
    var im = document.createElement('img');
    im.className = isRes ? 'res-icon' : 'box-icon';
    im.alt = '';
    im.setAttribute('src', ICONS[key]);
    td.insertBefore(im, td.firstChild);
  }

  function mkBlkTable(title, rows, isRes) {
    var wrap = el('div', 'v16-blk');
    wrap.appendChild(el('h4', 'v16-h', title));
    var t = document.createElement('table');
    t.className = 'v16-tbl';
    t.innerHTML = '<thead><tr><th>名称</th><th>本表单（现有持仓）</th><th>活动计入</th><th>合计</th></tr></thead>';
    var tb = document.createElement('tbody');
    rows.forEach(function (tr) {
      var td = tr.cells[0];
      td.textContent = td.textContent.replace(/\s*（(现有资源|固定箱|自选箱)）\s*$/, '');
      putIcon(td, isRes);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  /* 站点 table() 生成的是无 thead 的表：表头行直接躺在 tbody 里，得按 th 找 */
  function headText(t) {
    var th = t.querySelector('th');
    return th ? th.textContent.replace(/\s+/g, '') : '';
  }

  /* 「资源 / 箱」那张表把三类混在一起，按 资源 / 固定小时箱 / 自选箱 拆成三块 */
  function splitTotalsTable(box) {
    var tbl = null;
    Array.prototype.forEach.call(box.querySelectorAll('table'), function (t) {
      if (t._split) return;
      if (headText(t).indexOf('资源/箱') < 0) return;
      tbl = t;
    });
    if (!tbl) return;

    var groups = { res: [], fixed: [], sel: [] };
    Array.prototype.forEach.call(tbl.querySelectorAll('tbody tr'), function (tr) {
      if (!tr.cells.length || tr.querySelector('th')) return;   /* 跳过表头行 */
      var name = tr.cells[0].textContent;
      var key = 'sel';
      Object.keys(EXTRA_LABELS).forEach(function (suffix) {
        if (name.indexOf(suffix) >= 0) key = EXTRA_LABELS[suffix];
      });
      groups[key].push(tr.cloneNode(true));
    });

    var frag = document.createDocumentFragment();
    if (groups.res.length) frag.appendChild(mkBlkTable('资源', groups.res, true));
    if (groups.fixed.length) frag.appendChild(mkBlkTable('固定小时箱', groups.fixed, false));
    if (groups.sel.length) frag.appendChild(mkBlkTable('自选箱', groups.sel, false));

    tbl.parentNode.insertBefore(frag, tbl);
    tbl._split = 1;
    tbl.parentNode.removeChild(tbl);
  }

  /* 其它表（自然升级 / 单资源上限 / 固定箱折算 / 全梭哈折算）首列也是资源名，统一补图标 */
  function iconizeTables(box) {
    Array.prototype.forEach.call(box.querySelectorAll('table'), function (t) {
      if (t._iconed) return;
      t._iconed = 1;
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        if (!tr.cells.length || tr.querySelector('th')) return;
        var txt = tr.cells[0].textContent;
        var isRes = /信用点|战斗数据|红球|芯尘/.test(txt) && !/盒|箱|套组/.test(txt);
        putIcon(tr.cells[0], isRes);
      });
    });
  }

  function decorateExtra() {
    var box = byId('tabExtra');
    if (!box || !box.children.length) return;
    splitTotalsTable(box);
    iconizeTables(box);
    roundResultNumbers(box);
    fixIcons(box);
  }

  function watchResult() {
    var rt = byId('tabResult'), re = byId('tabExtra');
    var t1 = 0, t2 = 0;
    if (rt && !rt._roundWatch) {
      rt._roundWatch = 1;
      new MutationObserver(function () {
        clearTimeout(t1);
        t1 = setTimeout(function () { roundResultNumbers(rt); decorateCards(); }, 60);
      }).observe(rt, { childList: true, subtree: true });
    }
    if (re && !re._extraWatch) {
      re._extraWatch = 1;
      new MutationObserver(function () {
        clearTimeout(t2);
        t2 = setTimeout(decorateExtra, 60);
      }).observe(re, { childList: true, subtree: true });
    }
    roundResultNumbers(rt);
    decorateCards();
    decorateExtra();
  }

  /* ---------------- 服务器口径标注 ---------------- */
  function getServer() {
    try { return localStorage.getItem('nikke_planner_server') || 'cn'; } catch (e) { return 'cn'; }
  }

  /* app.js 把「国际服口径 / 国服多 3 关」写死在 #baseHint 里，
     选国服时把这段改写成不误导的表述（数值不变，只改标注）。 */
  var srvBusy = false;
  function paintServerLabel() {
    var hint = byId('baseHint');
    if (!hint) return;
    if (getServer() !== 'cn') return;          /* 国际服保持 app.js 原文 */
    var t = hint.textContent;
    var n = t
      .replace(/国际服口径/g, '国服口径')
      .replace(/国服统计进度约比国际服多 3 关，推算值可能偏高/g, '国服进度比国际服略靠后，建议以游戏内实际等级为准')
      .replace(/国服统计进度约多 3 关，推算值可能偏高/g, '国服进度比国际服略靠后，以游戏内实际等级为准')
      .replace(/国服统计进度约多 3 关，可能偏高/g, '国服进度比国际服略靠后，可能偏高');
    if (n !== t) {
      srvBusy = true;
      hint.textContent = n;
      setTimeout(function () { srvBusy = false; }, 0);
    }
  }

  function watchServerLabel() {
    var hint = byId('baseHint');
    if (!hint) return;
    if (!hint._srvWatch) {
      hint._srvWatch = 1;
      new MutationObserver(function () {
        if (srvBusy) return;
        paintServerLabel();
      }).observe(hint, { childList: true, characterData: true, subtree: true });
    }
    paintServerLabel();
  }

  /* ---------------- 顶部入口（挂在既有 hero 工具条里） ---------------- */
  function buildEntry() {
    /* 只放「设置」：配置版本与控制台属开发者侧，不进入用户页面。
       2026-11-19：文字按钮改成小图标（齿轮），省一行横向空间，鼠标悬停给 title。 */
    var bar = document.querySelector('.hero-toolbar');
    if (!bar) return;
    var gear = el('button', 'btn v3-gear');
    gear.type = 'button'; gear.id = 'v3Gear';
    gear.title = '设置';
    gear.setAttribute('aria-label', '设置');
    gear.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9c.13.6.64 1.03 1.25 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.07z"/></svg>';
    bar.appendChild(gear);
  }

  /* ---------------- 翻页 ---------------- */
  /* 云同步按钮（R88 修复）：23a23c8 删掉 R46 的快捷同步后，v16 只把壳画了回来 ——
     一个没有监听、没有上传调用的空勾选框，点下去只会变色。现在拆成两件事：
       ① 这个圆形云图标 = 点一下立即上传（未登录会自动打开同步面板引导）
       ② 「计算后自动同步」= 设置里的开关，键名沿用 R46 的 nikke_calc_autosync */
  var SYNC_PREF = 'nikke_calc_autosync';
  function autosyncOn() {
    try { return localStorage.getItem(SYNC_PREF) !== '0'; } catch (e) { return true; }
  }
  /* 云同步按钮 = 开关（2026-11-19 用户口径）
     开启：点「开始计算」会把表单同步到云端；关闭：点计算不同步（数据只在本机）。
     以前这颗按钮是「点一下立即上传」，与设置里的开关是两套逻辑，用户分不清哪个说了算。 */
  function paintSyncBtn() {
    var b = byId('asTog'); if (!b) return;
    var on = autosyncOn();
    b.setAttribute('data-on', on ? '1' : '0');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on
      ? '已开启：点「开始计算」会同步到云端（点击关闭）'
      : '已关闭：点「开始计算」不会同步，只存本机（点击开启）';
    var t = b.querySelector('.as-tip');
    if (t) t.textContent = on ? '计算后自动同步' : '不同步';
    /* 设置弹窗里那个下拉是同一个开关，按钮一改要同步回显 */
    var sel = byId('v16Autosync');
    if (sel) sel.value = on ? '1' : '0';
  }
  function toggleSync() {
    var on = !autosyncOn();
    try { localStorage.setItem(SYNC_PREF, on ? '1' : '0'); } catch (e) {}
    if (on) {
      var st = null;
      try { st = (window.__nikkeSync && window.__nikkeSync.status) ? window.__nikkeSync.status() : null; } catch (e) {}
      if (!(st && st.loggedIn) && window.__nikkeSync && window.__nikkeSync.open) {
        try { window.__nikkeSync.open('planner'); } catch (e) {}
      }
    }
    paintSyncBtn();
  }
  function syncNow() {
    var b = byId('asTog');
    var SY = window.__nikkeSync;
    if (!SY || typeof SY.quickUpload !== 'function') return;
    if (b) b.classList.add('is-busy');
    var fin = function (r) {
      if (b) {
        b.classList.remove('is-busy');
        if (r && r.ok) {
          b.classList.add('is-ok');
          setTimeout(function () { b.classList.remove('is-ok'); }, 1600);
        }
      }
      paintSyncBtn();
    };
    try {
      var p = SY.quickUpload('planner');    /* 内部已有 toast：成功 / 未登录 / 本地为空 都会提示 */
      if (p && typeof p.then === 'function') p.then(fin, function () { fin(null); });
      else fin(null);
    } catch (e) { fin(null); }
  }
  function buildSyncBtn() {
    var b = el('button', 'as-tog');
    b.type = 'button';
    b.id = 'asTog';
    b.title = '同步到云端';
    b.innerHTML =
      '<svg class="as-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6.4 15.2h7.2a3.5 3.5 0 0 0 .4-6.98 4.6 4.6 0 0 0-8.85-1.1A3.4 3.4 0 0 0 6.4 15.2Z"/>' +
      '<path d="M10 12.1V8.3"/><path d="M8.3 9.9 10 8.2l1.7 1.7"/></svg>' +
      '<span class="as-tip">同步到云端</span>';
    b.addEventListener('click', toggleSync);
    /* 首次登录态由 sync.js 异步 getSession 拿，不会触发 onAuthStateChange，
       所以补一次延时重画；之后的登录/登出走 onAuth 订阅 */
    setTimeout(paintSyncBtn, 1200);
    try {
      if (window.__nikkeSync && window.__nikkeSync.onAuth) window.__nikkeSync.onAuth(function () { paintSyncBtn(); });
    } catch (e) {}
    return b;
  }

  function buildNav() {
    var form = byId('formSection');
    var nav = el('div', 'v3-nav');
    /* 一行搞定：左端返回类，右端「下一步 + 开始计算 + 同步」 */
    nav.innerHTML =
      '<button type="button" class="v3-btn" id="v3Prev" hidden>上一步</button>' +
      '<button type="button" class="v3-btn" id="v3Recalc" hidden>重新填写</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="v3-btn" id="v3Next">下一步：推图进度&amp;活动</button>';

    var calcBtn = byId('btnCalc');
    if (calcBtn) nav.appendChild(calcBtn);     /* 开始计算搬进同一行 */
    nav.appendChild(buildSyncBtn());

    form.appendChild(nav);
    byId('v3Next').addEventListener('click', function () { go(2); });
    byId('v3Prev').addEventListener('click', function () { go(1); });
    byId('v3Recalc').addEventListener('click', function () { go(1); });
  }

  /* 必填项：与表单一致（数据日期 / 当前等级 / 三资源 / 基地等级 / 目标等级） */
  var REQUIRED = [
    ['f_recorded', '数据日期'],
    ['f_current', '当前同步器等级'],
    ['f_bare_credit', '信用点'],
    ['f_bare_battle', '战斗数据辑'],
    ['f_bare_dust', '红球'],
    ['f_base', '前哨基地防御等级'],
    ['f_target', '目标同步器等级']
  ];
  function missingRequired() {
    return REQUIRED.filter(function (x) {
      var el = byId(x[0]);
      return !el || String(el.value || '').trim() === '';
    }).map(function (x) { return x[1]; });
  }

  function go(n) {
    if (n === 3) {
      var rs = byId('resultSection');
      if (!S.hasResult) {
        var miss = missingRequired();
        if (miss.length) {
          alert('还未完成填写，请继续完善：\n· ' + miss.join('\n· '));
          return;
        }
        if (!confirm('必填内容已填完，现在开始计算？')) return;
        var calcBtn = byId('btnCalc');
        if (calcBtn) calcBtn.click();     /* 算完由 click 监听自动跳到结果页 */
        return;
      }
      byId('layout').classList.remove('has-result');
      byId('layout').classList.add('v3-result');
      byId('resultSection').style.display = '';
      if (DASH) renderDash();
      S.page = 3;
    } else {
      byId('layout').classList.remove('v3-result');
      /* 已经算过的话，填表页不再把结果区挂在下面 */
      if (S.hasResult) byId('resultSection').style.display = 'none';
      S.page = n;
    }
    if (S.rhead) S.rhead.style.display = (DASH ? (S.page === 3) : (byId('resultSection').style.display !== 'none')) ? '' : 'none';
    sync();
    scrollPageTop();
  }

  /* 切页后回到该页第一行。步骤条与表单已经并成一张卡，滚到步骤条顶部即可。 */
  function scrollPageTop() {
    var bar = document.querySelector('.v3-steps');
    if (!bar) return;
    var y = bar.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0) - 10;
    y = Math.max(0, y);
    try { window.scrollTo({ top: y, behavior: 'smooth' }); }
    catch (e) { window.scrollTo(0, y); }
  }

  function sync() {
    var p = S.page;
    Array.prototype.forEach.call(S.steps.children, function (b) {
      var n = +b.dataset.pg;
      b.classList.toggle('on', n === p);
      b.classList.toggle('done', n < p);
    });
    [S.p1, S.p2].forEach(function (pg) { if (pg) pg.classList.toggle('on', +pg.dataset.pg === p); });
    var prev = byId('v3Prev'), next = byId('v3Next'), calc = byId('btnCalc'), rc = byId('v3Recalc');
    if (prev) prev.hidden = p === 1;
    if (next) next.hidden = p !== 1;
    if (calc) calc.hidden = p === 3;
    if (rc) rc.hidden = p !== 3;
    var sync = byId('asTog');
    if (sync) sync.style.display = p === 3 ? 'none' : '';

  }

  /* ---------------- 结果页：标题条 ---------------- */
  function decorateResult() {
    var rs = byId('resultSection'); if (!rs) return;
    /* 「生成于 …」时间条已去掉：规划结果和计算时刻无关，反而占掉一行。
       四张卡的口径也不再挤成一个总弹窗，改为每张卡各挂一个 i（见 decorateCards）。 */
    var tabText = { tabResult: '总览', tabExtra: '收益明细', tabRaw: '原始数据' };
    Array.prototype.forEach.call(rs.querySelectorAll('.tab[data-tab]'), function (b) {
      var k = b.dataset.tab;
      if (tabText[k]) b.textContent = tabText[k];
    });

    /* 「返回修改」挪进结果页自己的 tab 行，紧挨「导出图片」 */
    var backBtn = el('button', 'btn btn-back-edit');
    backBtn.type = 'button'; backBtn.id = 'v3Back';
    backBtn.textContent = '← 返回修改';
    var expBtn = byId('btnExportImg');
    if (expBtn && expBtn.parentNode) expBtn.parentNode.insertBefore(backBtn, expBtn);
    else if (rs.querySelector('.tabs')) rs.querySelector('.tabs').appendChild(backBtn);
    backBtn.addEventListener('click', function () { go(2); });

    new MutationObserver(function () {
      if (rs.style.display !== 'none') S.hasResult = true;
    }).observe(rs, { attributes: true, attributeFilter: ['style'] });
  }

  /* ---------------- 四张卡：各自挂一个口径信息窗 ---------------- */
  /* app.js 把四条口径拼成一段 .cards-caption（①②③④，有活动时追加⑤）。
     这里按序号拆开，分别挂到对应的数字卡右上角；⑤ 讲的是「①②③都不含活动收益」，
     并入第 1 张卡。document 级关闭监听全页只注册一次，避免每次重算堆监听。 */
  var CAP_MARK = ['①', '②', '③', '④'];
  var CAP_TITLE = ['当前同步器等级', '仅使用固定小时箱', '全箱梭哈', '自然升级（不开箱）'];
  var CARD_POPS = [], cardPopBound = false;

  function bindCardPop(btn, pop) {
    var rec = { btn: btn, pop: pop, locked: false };
    CARD_POPS.push(rec);

    var place = function () {
      var host = pop.parentNode;
      if (!host) return;
      var br = btn.getBoundingClientRect(), hr = host.getBoundingClientRect();
      var pw = pop.offsetWidth;
      pop.style.right = 'auto';
      pop.style.left = Math.max(8, Math.min(br.left - hr.left, host.clientWidth - pw - 8)) + 'px';
      pop.style.top = (br.bottom - hr.top + 6) + 'px';
    };
    var show = function () { place(); pop.classList.add('on'); btn.classList.add('on'); };
    var hide = function () { rec.locked = false; pop.classList.remove('on'); btn.classList.remove('on'); };

    btn.addEventListener('mouseenter', show);
    btn.addEventListener('mouseleave', function () { if (!rec.locked) hide(); });
    pop.addEventListener('mouseenter', show);
    pop.addEventListener('mouseleave', function () { if (!rec.locked) hide(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      rec.locked = !rec.locked;
      if (rec.locked) show(); else hide();
    });

    if (cardPopBound) return;
    cardPopBound = true;
    document.addEventListener('click', function (e) {
      CARD_POPS.forEach(function (r) {
        if (!r.locked) return;
        if (r.pop.contains(e.target) || r.btn.contains(e.target)) return;
        r.locked = false; r.pop.classList.remove('on'); r.btn.classList.remove('on');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      CARD_POPS.forEach(function (r) { r.locked = false; r.pop.classList.remove('on'); r.btn.classList.remove('on'); });
    });
  }

  function decorateCards() {
    var rt = byId('tabResult'); if (!rt) return;
    var cards = rt.querySelectorAll('.cards .card');
    if (!cards.length) return;
    if (cards[0].getAttribute('data-cap')) return;      /* 这一轮已经处理过 */

    CARD_POPS = CARD_POPS.filter(function (r) { return document.body.contains(r.btn); });

    var cap = rt.querySelector('.cards-caption');
    var parts = {};
    if (cap) {
      var lines = [], buf = '';
      Array.prototype.forEach.call(cap.childNodes, function (n) {
        if (n.nodeType === 1 && n.nodeName === 'BR') { lines.push(buf); buf = ''; }
        else buf += (n.textContent || '');
      });
      if (buf.trim()) lines.push(buf);
      lines.forEach(function (t) {
        var s = String(t).replace(/^\s+/, '');
        var k = s.charAt(0);
        if (CAP_MARK.indexOf(k) >= 0 || k === '⑤') parts[k] = s.replace(/^[①②③④⑤]\s*/, '').trim();
      });
      cap.classList.add('v3-hide');
    }

    var host = rt.querySelector('.cards');
    if (host) host.classList.add('v3-cards-rel');

    Array.prototype.forEach.call(cards, function (cardEl, i) {
      var txt = parts[CAP_MARK[i]]; if (!txt) return;
      cardEl.setAttribute('data-cap', '1');

      var btn = el('button', 'v4-info v4-info--card');
      btn.type = 'button'; btn.textContent = 'i';
      btn.title = CAP_TITLE[i] + '：口径说明';
      btn.setAttribute('aria-label', btn.title);

      var pop = el('div', 'v4-pop v7-card-pop');
      pop.appendChild(el('div', 'hd', CAP_TITLE[i]));
      var p = document.createElement('p'); p.className = 'ft'; p.textContent = txt;
      pop.appendChild(p);
      if (i === 0 && parts['⑤']) {
        var p5 = document.createElement('p');
        p5.className = 'ft'; p5.textContent = parts['⑤'];
        pop.appendChild(p5);
      }

      (host || cardEl).appendChild(pop);
      cardEl.appendChild(btn);
      bindCardPop(btn, pop);
    });
  }

  /* ---------------- 仪表盘结果 ---------------- */
  var dashBox = null;
  function renderDash() {
    var rs = byId('resultSection'); if (!rs) return;
    var pre = rs.querySelector('#tabRaw pre');
    var data = null;
    try { data = JSON.parse(pre ? pre.textContent : ''); } catch (e) { data = null; }
    if (!data) return;

    var cur = +((byId('f_current') || {}).value || 0);
    var tgt = +((byId('f_target') || {}).value || 0);
    var noBox = data.no_box || {}, bare = data.bare || {}, fixed = data.fixed || {}, sel = data.selectable || {};
    var fut = data.future_main_story || {};
    var res = (data.per_resource && data.per_resource._res) || {};

    if (!dashBox) {
      dashBox = el('div', 'v3-dash'); dashBox.id = 'v3Dash';
      rs.parentNode.insertBefore(dashBox, rs);
    }
    var hiAll = Math.max(tgt || 0, sel.level || 0, fixed.level || 0, bare.level || 0, cur + 1);
    var pct = function (lv) {
      return Math.max(0, Math.min(100, (lv - cur) / (hiAll - cur) * 100));
    };
    var marks = [
      { lv: cur, t: '现状', cls: 'end' },
      { lv: fixed.level, t: '固定箱' },
      { lv: sel.level, t: '全箱', cls: '' },
      { lv: tgt, t: '目标', cls: 'end' }
    ].filter(function (m) { return m.lv; });

    var track = marks.map(function (m) {
      return '<div class="mk ' + (m.cls || '') + '" style="left:' + pct(m.lv).toFixed(1) + '%">' +
        '<i></i><b>' + m.lv + '</b><span>' + m.t + '</span></div>';
    }).join('');

    var resRows = [['credit', '信用点'], ['battle_data', '战斗数据辑'], ['core_dust', '红球']].map(function (x) {
      var b = (res.bare && res.bare[x[0]]) || 0, s = (res.selectable && res.selectable[x[0]]) || 0;
      var w = s > 0 ? Math.max(4, Math.min(100, b / s * 100)) : 0;
      return '<div class="rr"><span class="nm">' + x[1] + '</span>' +
        '<span class="bar"><i class="' + (w < 18 ? 'warn' : '') + '" style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="val">' + fmt(b) + ' / ' + fmt(s) + '</span></div>';
    }).join('');

    var route = [
      ['不开箱（自然积累到目标）', tgt, noBox.days != null ? (Math.round(noBox.days * 10) / 10) + ' 天' : '—'],
      ['仅开固定小时箱', fixed.level, '—'],
      ['全箱梭哈', sel.level, '—'],
      ['目标同步器', tgt, (sel.level >= tgt) ? '全箱已达' : '还差 ' + (tgt - sel.level) + ' 级']
    ].map(function (r) {
      return '<tr><td>' + r[0] + '</td><td class="n">' + (r[1] || '—') + '</td><td class="n">' + r[2] + '</td></tr>';
    }).join('');

    var gain = fut.box_gain_vs_now;
    var verdict = gain > 0
      ? '新主线开放后，同样这批箱子因为收益更高，能多换 <b>' + (Math.round(gain * 100) / 100) + '</b> 级。'
      : '收益没变化时，箱子不会因为等待而变得更值钱。';

    dashBox.innerHTML =
      '<div class="v3-dcard"><h4>等级推进路线</h4><div class="v3-track">' +
        '<span class="rail"></span><span class="fill" style="width:' + pct(sel.level || cur).toFixed(1) + '%"></span>' +
        track + '</div></div>' +
      '<div class="v3-kpis">' +
        '<div class="v3-kpi"><div class="k">当前同步器</div><div class="v">' + cur + '<small>级</small></div><div class="d">手填基准</div></div>' +
        '<div class="v3-kpi"><div class="k">仅固定小时箱</div><div class="v">' + (fixed.level || '—') + '<small>级</small></div><div class="d">不消耗自选箱</div></div>' +
        '<div class="v3-kpi key"><div class="k">全箱梭哈</div><div class="v">' + (sel.level || '—') + '<small>级</small></div><div class="d">按最优开箱顺序</div></div>' +
        '<div class="v3-kpi"><div class="k">自然升级到目标</div><div class="v">' + (noBox.days != null ? Math.round(noBox.days * 10) / 10 : '—') + '<small>天</small></div><div class="d">完全不开箱</div></div>' +
      '</div>' +
      '<div class="v3-dcard"><h4>三资源可用量（条长 = 裸资源占「含箱全开」的比例，偏短说明主要得靠箱子）</h4><div class="v3-res">' + resRows + '</div>' +
        '<p style="font-size:11.5px;color:var(--muted);margin:8px 0 0">' + verdict + '</p></div>' +
      '<div class="v3-dcard"><h4>里程碑对比</h4><table class="v3-mil">' +
        '<tr><th>口径</th><th>可达等级</th><th>耗时 / 差距</th></tr>' + route + '</table></div>' +
      '<details class="v3-fold" open><summary>收益明细</summary><div class="fc" id="v3Detail"></div></details>' +
      '<details class="v3-fold"><summary>完整计算结果</summary><div class="fc" id="v3Raw"></div></details>';

    var extra = rs.querySelector('#tabExtra');
    if (extra && byId('v3Detail')) byId('v3Detail').innerHTML = extra.innerHTML;
    var raw = rs.querySelector('#tabResult');
    if (raw) byId('v3Raw').innerHTML = raw.innerHTML;
    rs.style.display = 'none';
  }

  function fmt(n) {
    if (!isFinite(n)) return '—';
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(Math.round(n));
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    try { bootInner(); }
    catch (e) { console.error('[proto3] 重排失败：', e); }
  }
  function bootInner() {
    if (!byId('formSection')) return;
    if (!buildSteps()) return;
    buildPages();
    arrange();
    decorateBase();
    decorateBoxes();
    buildEntry();
    buildModal();
    buildNav();
    decorateResult();
    if (DASH) document.body.classList.add('v3-dash-mode');

    /* 「开始计算」点完自动跳结果页 */
    var calc = byId('btnCalc');
    if (calc) {
      calc.addEventListener('click', function () {
        setTimeout(function () {
          if (byId('resultSection').style.display === 'none') return;
          go(3);
        }, 600);
      }, true);
    }
    /* 仪表盘：重算后刷新 */
    if (DASH) {
      var rs = byId('resultSection');
      new MutationObserver(function () {
        if (dashBox && rs.style.display !== 'none' && S.page === 3) { dashBox.style.display = ''; renderDash(); }
      }).observe(rs, { attributes: true, attributeFilter: ['style'] });
    }
    document.body.classList.add('v3-ready');
    sync();

    /* localStorage 恢复表单 / app.js 自动带出未来值，都不触发事件 —— 补几次延迟同步 */
    [0, 150, 500, 1200, 2000].forEach(function (t) {
      setTimeout(function () { syncStageCols(); updStageSum(); paintFutureIncome(); watchServerLabel(); watchResult(); }, t);
    });

    /* localStorage 恢复表单是不触发 change 的，表格列会停在默认态 —— 补几次延迟同步 */
    [0, 150, 500, 1200].forEach(function (t) { setTimeout(function () { syncStageCols(); updStageSum(); }, t); });
  }

  /* 启动时机：
     不能只等 window.load —— 线上字体 / Supabase 等外部资源慢的时候 load 可能迟迟不触发，
     整页会停在「没分页」的原始形态。改为 DOMContentLoaded 后启动，再留 3 秒兜底。
     仍要晚于 app.js：它在 DOMContentLoaded 里遍历 #formSection 绑 onFormChange，
     我们用 setTimeout 让出这一轮，保证搬移字段时事件已经绑好。 */
  var booted = false;
  function bootOnce() { if (booted) return; booted = true; boot(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(bootOnce, 0); });
  } else {
    setTimeout(bootOnce, 0);
  }
  window.addEventListener('load', function () { setTimeout(bootOnce, 0); });
  setTimeout(bootOnce, 3000);
})();
