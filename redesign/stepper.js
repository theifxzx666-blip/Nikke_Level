/* P1 分页壳：把既有 fieldset 分成三页，字段 id / 事件 / 计算全部沿用原实现。
   原则：只做 DOM 分组与显隐，不改任何 input 的值、id、name，也不碰 app.js。 */
(function () {
  'use strict';

  var PAGES = [
    { id: 1, title: '现状', sub: '账号 · 资源 · 进度',
      match: ['账号状态', '现有资源', '当前基地等级', '关卡进度', '当前收益'] },
    { id: 2, title: '目标', sub: '新主线 · 推图 · 活动',
      match: ['预计新主线', '预计新主线推图收益', '活动收益'] },
    { id: 3, title: '库存', sub: '箱子 · 自选 · 其他',
      match: ['升级消耗', '固定小时箱', '自选箱', '其他'] }
  ];

  var section = document.getElementById('formSection');
  if (!section) return;

  var fieldsets = Array.prototype.slice.call(section.querySelectorAll(':scope > fieldset'));
  if (!fieldsets.length) return;

  function legendOf(fs) {
    var lg = fs.querySelector('legend');
    return lg ? lg.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function pageOf(fs) {
    var t = legendOf(fs);
    for (var i = 0; i < PAGES.length; i++) {
      for (var j = 0; j < PAGES[i].match.length; j++) {
        if (t.indexOf(PAGES[i].match[j]) === 0) return PAGES[i].id;
      }
    }
    return 3; // 未识别的一律归到库存页，保证不丢字段
  }

  // ---------- 信息窗：字段全部直接可见，长说明收进 ⓘ 浮层 ----------
  // 复用站点既有 .info-tip / .info-panel 样式；说明正文直接取原 p.hint，不另写一份文案。
  var INFO_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="6.4"/><path d="M8 7.4v4" stroke-linecap="round"/>'
    + '<circle cx="8" cy="4.9" r="0.95" fill="currentColor" stroke="none"/></svg>';
  var tipPanel = null, tipBtn = null;

  function findFieldset(prefix) {
    for (var i = 0; i < fieldsets.length; i++) {
      if (legendOf(fieldsets[i]).indexOf(prefix) === 0) return fieldsets[i];
    }
    return null;
  }

  function closeTip() {
    if (!tipPanel) return;
    tipPanel.style.display = 'none';
    tipPanel = null;
    if (tipBtn) { tipBtn.setAttribute('aria-expanded', 'false'); tipBtn = null; }
  }

  function openTip(btn, title, html) {
    var panel = document.getElementById('rdTipPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'rdTipPanel';
      panel.className = 'info-panel';
      panel.style.position = 'fixed';
      document.body.appendChild(panel);
      document.addEventListener('click', function (e) {
        if (panel.contains(e.target)) return;
        if (tipBtn && tipBtn.contains(e.target)) return;
        closeTip();
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') closeTip();
      });
      window.addEventListener('resize', closeTip);
    }
    panel.innerHTML = '<button type="button" class="ip-close" aria-label="关闭">✕</button>'
      + '<div class="ip-title">' + title + '</div>'
      + '<div class="ip-body">' + html + '</div>';
    panel.querySelector('.ip-close').addEventListener('click', function (ev) {
      ev.stopPropagation();
      closeTip();
    });
    panel.style.display = 'block';
    var r = btn.getBoundingClientRect();
    var w = Math.min(380, window.innerWidth - 24);
    panel.style.width = w + 'px';
    panel.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + 'px';
    panel.style.top = Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 220)) + 'px';
    tipPanel = panel;
    tipBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
  }

  function installTip(prefix, title) {
    var fs = findFieldset(prefix);
    if (!fs) return;
    var lg = fs.querySelector('legend');
    if (!lg || lg.querySelector('.rd-tip')) return;
    // 取该分组里第一条「无 id」的 p.hint 当正文（带 id 的是动态文案，不能动）
    var src = null;
    Array.prototype.forEach.call(fs.querySelectorAll('p.hint'), function (p) {
      if (!src && !p.id) src = p;
    });
    if (!src) return;
    var html = src.innerHTML.trim();
    src.style.display = 'none';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'info-tip rd-tip';
    btn.setAttribute('aria-label', '查看说明');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = INFO_SVG;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (tipBtn === btn) { closeTip(); return; }
      closeTip();
      openTip(btn, title, html);
    });
    lg.appendChild(document.createTextNode(' '));
    lg.appendChild(btn);
  }

  installTip('当前收益', '当前收益与每日收益');
  installTip('预计新主线推图收益', '预计新主线推图收益');
  installTip('预计新主线', '预计新主线进度');
  installTip('升级消耗', '升级消耗素材量');

  // 分组容器：插在第一个 fieldset 之前，fieldset 原位保留（避免 app.js 依赖父级）
  var wrap = document.createElement('div');
  wrap.className = 'stepPages';
  var bar = document.createElement('nav');
  bar.id = 'stepperBar';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', '填写步骤');
  var nav = document.createElement('div');
  nav.id = 'stepperNav';

  fieldsets[0].parentNode.insertBefore(bar, fieldsets[0]);
  fieldsets[0].parentNode.insertBefore(wrap, fieldsets[0]);

  var groups = { 1: [], 2: [], 3: [] };
  fieldsets.forEach(function (fs) {
    var p = pageOf(fs);
    fs.setAttribute('data-pg', p);
    groups[p].push(fs);
    wrap.appendChild(fs); // 移动位置但不改内部结构
  });

  // 补充信息：把「基本不需要用户填」的分组搬出三步，集中放到表单末尾（不折叠、不隐藏）
  (function () {
    var EXTRAS = ['预计新主线推图收益', '升级消耗'];
    var picked = [];
    EXTRAS.forEach(function (prefix) {
      var fs = findFieldset(prefix);
      if (fs) picked.push(fs);
    });
    if (!picked.length) return;
    var box = document.createElement('section');
    box.id = 'extrasPanel';
    var h = document.createElement('div');
    h.className = 'extras-head';
    h.innerHTML = '<b>补充信息</b><span>以下由系统按章节与等级自动带出，一般不用改；要手填时直接改，仍参与计算</span>';
    box.appendChild(h);
    picked.forEach(function (fs) {
      fs.removeAttribute('data-pg');
      box.appendChild(fs);
    });
    wrap.parentNode.insertBefore(box, wrap.nextSibling);
  })();

  // 步骤条
  PAGES.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'stp';
    b.dataset.pg = p.id;
    b.setAttribute('role', 'tab');
    b.innerHTML = '<span class="no">' + p.id + '</span><span class="tx">' + p.title +
                  '<small>' + p.sub + '</small></span>';
    b.addEventListener('click', function () { go(p.id); });
    bar.appendChild(b);
  });
  var cnt = document.createElement('span');
  cnt.className = 'pgcount';
  cnt.id = 'stepCount';
  bar.appendChild(cnt);

  // 翻页按钮
  var prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = '上一步';
  var next = document.createElement('button');
  next.type = 'button';
  next.className = 'pri';
  nav.appendChild(prev);
  nav.appendChild(next);
  wrap.parentNode.insertBefore(nav, wrap.nextSibling);

  var cur = 1;

  function requiredFilled() {
    // 只统计「必填」：日期、当前等级、三资源、基地、目标
    var ids = ['f_recorded', 'f_current', 'f_bare_credit', 'f_bare_battle', 'f_bare_dust', 'f_base', 'f_target'];
    var n = 0;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && String(el.value || '').trim() !== '') n++;
    });
    return { filled: n, total: ids.length };
  }

  function paintCount(r) {
    cnt.innerHTML = '<span class="c-long" aria-hidden="true">必填 ' + r.filled + '/' + r.total +
                    '</span><span class="c-short" aria-hidden="true">' + r.filled + '/' + r.total + '</span>';
    cnt.setAttribute('aria-label', '必填项已完成 ' + r.filled + ' / ' + r.total);
    cnt.title = '必填项已完成 ' + r.filled + ' / ' + r.total;
  }

  function refresh() {
    Array.prototype.forEach.call(wrap.children, function (fs) {
      fs.classList.toggle('on', +fs.dataset.pg === cur);
    });
    Array.prototype.forEach.call(bar.querySelectorAll('.stp'), function (b) {
      var on = +b.dataset.pg === cur;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.dataset.done = +b.dataset.pg < cur ? '1' : '0';
    });
    prev.hidden = cur === 1;
    next.textContent = cur === 3 ? '回到第 1 步' : '下一步：' + PAGES[cur].title;
    var r = requiredFilled();
    paintCount(r);
    document.body.setAttribute('data-step', String(cur));
    try { localStorage.setItem('nk_step_page', String(cur)); } catch (e) {}
    window.dispatchEvent(new CustomEvent('stepper:change', { detail: { page: cur } }));
  }

  function go(n) {
    cur = Math.min(3, Math.max(1, n));
    refresh();
    var top = bar.getBoundingClientRect().top + window.scrollY - 12;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  prev.addEventListener('click', function () { go(cur - 1); });
  next.addEventListener('click', function () { go(cur === 3 ? 1 : cur + 1); });

  // 记录填写进度
  section.addEventListener('input', function () {
    paintCount(requiredFilled());
  });

  // 计算完自动跳到结果（结果区出现后滚过去），不改变既有行为
  var calc = document.getElementById('btnCalc');
  if (calc) {
    calc.addEventListener('click', function () {
      setTimeout(function () {
        var rs = document.getElementById('resultSection');
        if (rs && rs.style.display !== 'none') {
          rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 350);
    }, true);
  }

  var saved = 0;
  try { saved = parseInt(localStorage.getItem('nk_step_page') || '1', 10) || 1; } catch (e) {}
  cur = saved >= 1 && saved <= 3 ? saved : 1;
  refresh();
})();
