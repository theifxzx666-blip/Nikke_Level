'use strict';
/* NIKKE 头像预览 · 阶段4
   装配模型（来自阶段3 装配模型_v1.md，已用实机截图验证）：
     头像与头像框都等比填充到同一正方形区域，且严格同心重叠；
     头像再按「画布中心 100/128 的内切圆」加圆形遮罩。 */
(function () {
  const D = window.NIKKE_DATA;
  const ROOT = D.资源根;
  const SIZE = 512;                       // 画布内部分辨率（导出质量）
  const CIRCLE = D.装配.头像圆直径比;

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const bgEl = document.getElementById('bg');
  const gridEl = document.getElementById('grid');
  const loadingEl = document.getElementById('loading');

  // 离屏画布：头像做圆形遮罩用（复用以避免每帧新建）
  const off = document.createElement('canvas');
  off.width = off.height = SIZE;
  const octx = off.getContext('2d');

  const state = { tab: 'avatar', q: '', avatar: null, frame: null };

  /* ---------------- 图片加载 ---------------- */
  const cache = new Map();
  function IMG(src) {
    if (!cache.has(src)) {
      cache.set(src, new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('加载失败：' + src));
        im.src = src;
      }));
    }
    return cache.get(src);
  }

  /* ---------------- 合成绘制 ---------------- */
  function paint(frameImg) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (state.avatar && state.avatar.img) {
      octx.globalCompositeOperation = 'source-over';
      octx.clearRect(0, 0, SIZE, SIZE);
      octx.drawImage(state.avatar.img, 0, 0, SIZE, SIZE);
      octx.globalCompositeOperation = 'destination-in';
      octx.beginPath();
      octx.arc(SIZE / 2, SIZE / 2, SIZE * CIRCLE / 2, 0, Math.PI * 2);
      octx.fill();
      ctx.drawImage(off, 0, 0);
    }
    if (frameImg) ctx.drawImage(frameImg, 0, 0, SIZE, SIZE);
  }

  let timer = null;
  function stopPlay() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function repaint() {
    stopPlay();
    const f = state.frame;
    if (!f) { paint(null); return; }
    if (f.frames && f.frames.length) {          // 动态框：按游戏逐帧时长循环
      let i = 0;
      const loop = () => {
        paint(f.frames[i]);
        const d = (f.durs && f.durs[i]) || 100;
        i = (i + 1) % f.frames.length;
        timer = setTimeout(loop, d);
      };
      loop();
    } else {
      paint(f.img);
    }
  }

  /* ---------------- 选择 ---------------- */
  function label(name) {
    // 列表已按类别分组，前缀冗余，缩短后更易辨认
    return name
      .replace(/^si_/, '').replace(/_s$/, '')
      .replace(/^(icn|dynamic)_soloraid_/, '')
      .replace(/_frame$/, '');
  }

  async function pickAvatar(item) {
    state.avatar = { item: item, img: null };
    updateInfo(); markGrid();
    loadingEl.hidden = false;
    try { state.avatar.img = await IMG(ROOT + item.文件); }
    catch (e) { console.warn(e); }
    loadingEl.hidden = true;
    repaint();
  }

  async function pickFrame(entry) {          // entry 为 null 表示「无框」
    if (!entry) {
      state.frame = null;
      updateInfo(); markGrid(); repaint();
      return;
    }
    loadingEl.hidden = false;
    try {
      if (entry.kind === 'dynamic') {
        const raw = entry.raw;
        const imgs = await Promise.all(raw.帧.map(p => IMG(ROOT + p).catch(() => null)));
        const frames = [], durs = [];
        imgs.forEach((im, i) => {
          if (im) {
            frames.push(im);
            durs.push((raw.逐帧时长毫秒 || [])[i] || 100);
          }
        });
        state.frame = { name: raw.名称, kind: 'dynamic', frames: frames, durs: durs };
      } else {
        state.frame = { name: entry.raw.名称, kind: 'static',
                        img: await IMG(ROOT + entry.raw.文件) };
      }
    } catch (e) { console.warn(e); }
    loadingEl.hidden = true;
    updateInfo(); markGrid(); repaint();
  }

  function onPick(o) {
    if (o.kind === 'avatar') pickAvatar(o.raw);
    else if (o.kind === 'none') pickFrame(null);
    else pickFrame(o);
  }

  /* ---------------- 网格 ---------------- */
  function list() {
    if (state.tab === 'avatar') {
      return D.头像.map(o => ({ key: o.名称, label: label(o.名称), kind: 'avatar',
                                raw: o, thumb: o.文件 }));
    }
    const arr = [{ key: '__none__', label: '无框', kind: 'none', thumb: null }];
    D.静态框.forEach(o => arr.push({ key: o.名称, label: label(o.名称), kind: 'static',
                                     raw: o, thumb: o.文件 }));
    D.动态框.forEach(o => arr.push({ key: o.名称, label: o.名称, kind: 'dynamic',
                                     raw: o, thumb: o.帧[0], badge: '动' }));
    return arr;
  }

  function renderGrid() {
    const q = state.q.trim().toLowerCase();
    const all = list();
    const items = q
      ? all.filter(o => (o.key + ' ' + o.label).toLowerCase().indexOf(q) >= 0)
      : all;

    gridEl.innerHTML = '';
    if (!items.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '没有匹配的条目';
      gridEl.appendChild(e);
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(o => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.key = o.key;

      const th = document.createElement('div');
      th.className = 'thumb' + (o.thumb ? '' : ' none');
      if (o.thumb) {
        const im = document.createElement('img');
        im.loading = 'lazy';
        im.decoding = 'async';
        im.src = ROOT + o.thumb;
        im.alt = o.label;
        th.appendChild(im);
      } else {
        th.textContent = '—';
      }

      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = o.label;
      cap.title = o.label;

      cell.appendChild(th);
      cell.appendChild(cap);
      if (o.badge) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = o.badge;
        cell.appendChild(b);
      }
      cell.onclick = () => onPick(o);
      frag.appendChild(cell);
    });
    gridEl.appendChild(frag);
    markGrid();
  }

  function markGrid() {
    const cur = state.tab === 'avatar'
      ? (state.avatar && state.avatar.item.名称)
      : (state.frame ? state.frame.name : '__none__');
    Array.prototype.forEach.call(gridEl.children, c => {
      c.classList.toggle('on', !!c.dataset && c.dataset.key === cur);
    });
  }

  function updateInfo() {
    document.getElementById('cur-avatar').textContent =
      state.avatar ? state.avatar.item.名称 : '未选择';
    document.getElementById('cur-frame').textContent =
      state.frame ? state.frame.name : '无框（白环）';
  }

  /* ---------------- 交互 ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), t => {
    t.onclick = () => {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'),
        x => x.classList.toggle('on', x === t));
      state.tab = t.dataset.tab;
      renderGrid();
    };
  });

  const qEl = document.getElementById('q');
  qEl.oninput = () => { state.q = qEl.value; renderGrid(); };
  document.getElementById('btn-clear').onclick = () => {
    qEl.value = ''; state.q = ''; renderGrid(); qEl.focus();
  };

  document.getElementById('btn-none').onclick = () => {
    if (state.tab !== 'frame') {
      state.tab = 'frame';
      Array.prototype.forEach.call(document.querySelectorAll('.tab'),
        x => x.classList.toggle('on', x.dataset.tab === 'frame'));
      renderGrid();
    }
    pickFrame(null);
  };

  document.getElementById('btn-random').onclick = () => {
    pickAvatar(D.头像[Math.floor(Math.random() * D.头像.length)]);
    const pool = D.静态框.map(o => ({ kind: 'static', raw: o }))
      .concat(D.动态框.map(o => ({ kind: 'dynamic', raw: o })));
    pickFrame(pool[Math.floor(Math.random() * pool.length)]);
  };

  document.getElementById('seg-bg').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    Array.prototype.forEach.call(e.currentTarget.children,
      x => x.classList.toggle('on', x === b));
    bgEl.className = b.dataset.bg;
  };

  document.getElementById('btn-export').onclick = () => {
    const a = (state.avatar && state.avatar.item.名称) || 'nochar';
    const f = (state.frame && state.frame.name) || 'noframe';
    cv.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = 'nikke_' + a + '_' + f + '.png';
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  };

  /* ---------------- 启动 ---------------- */
  document.getElementById('n-avatar').textContent = D.头像.length;
  document.getElementById('n-frame').textContent = D.静态框.length + D.动态框.length;
  document.getElementById('stat').textContent =
    '素材源自游戏原始资源 ｜ 头像 ' + D.头像.length +
    ' ｜ 静态框 ' + D.静态框.length + ' ｜ 动态框 ' + D.动态框.length + ' 组';

  renderGrid();
  pickAvatar(D.头像.filter(o => o.名称 === 'si_c100_00_s')[0] || D.头像[0]);

  // file:// 下可正常预览，但 canvas 会被标记为跨源，导出 PNG 必然失败——提前告知
  if (location.protocol === 'file:') {
    const w = document.getElementById('warn');
    w.hidden = false;
    w.innerHTML = '当前以 <code>file://</code> 打开，预览可用，但「导出 PNG」会被浏览器的跨源策略拦截。'
      + '请在 <code>头像框预览</code> 目录下执行 <code>python -m http.server 8777</code>，'
      + '再访问 <code>http://127.0.0.1:8777/重构方案_v2.0/阶段4_预览工具/工具/index.html</code>。';
  }
})();
