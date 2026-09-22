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

  // 头像圆形遮罩在 compositeTo 内用 msk 画布完成

  const state = { tab: 'avatar', q: '', filter: { avatar: '全部', frame: '全部', pendant: '全部' },
                  avatar: null, frame: null, pendant: null };

  /* ---------------- 筛选卡 ----------------
     头像 Tab：按企业（全部/极乐净土/米西利斯/泰特拉/朝圣者/反常/其他）
     框 Tab：按类型（全部/动态/静态/其他）。「其他」= 未匹配到汉化名的条目 */
  const MFG_CHIPS = [
    { k: '全部' },
    { k: '极乐净土', icon: 'icons/mfg_elysion.png' },
    { k: '米西利斯', icon: 'icons/mfg_missilis.png' },
    { k: '泰特拉',   icon: 'icons/mfg_tetra.png' },
    { k: '朝圣者',   icon: 'icons/mfg_pilgrim.png' },
    { k: '反常',     icon: 'icons/mfg_abnormal.png' },
    { k: '其他' },
  ];
  const FRAME_CHIPS = ['全部', '动态', '静态', '其他'];
  const PENDANT_CHIPS = ['全部', '冠军竞技场', '博物馆'];

  function pendantCat(o) {
    if (o.名称.indexOf('champion_arena') === 0) return '冠军竞技场';
    if (o.名称.indexOf('icn_soloraid_museum') === 0) return '博物馆';
    return '其他';
  }

  function chipCount(tab, k) {
    if (tab === 'avatar') {
      if (k === '全部') return D.头像.length;
      return D.头像.filter(o => (o.企业 || '其他') === k).length;
    }
    if (tab === 'pendant') {
      if (k === '全部') return D.挂件.length;
      return D.挂件.filter(o => pendantCat(o) === k).length;
    }
    if (k === '全部') return D.静态框.length + D.动态框.length;
    if (k === '动态') return D.动态框.filter(o => o.中文名).length;
    if (k === '静态') return D.静态框.filter(o => o.中文名).length;
    return D.静态框.filter(o => !o.中文名).length + D.动态框.filter(o => !o.中文名).length;
  }

  function renderChips() {
    const box = document.getElementById('chips');
    const cur = state.filter[state.tab];
    box.innerHTML = '';
    const defs = state.tab === 'avatar'
      ? MFG_CHIPS.map(c => ({ k: c.k, icon: c.icon }))
      : state.tab === 'pendant'
        ? PENDANT_CHIPS.map(k => ({ k }))
        : FRAME_CHIPS.map(k => ({ k }));
    defs.forEach(d => {
      const b = document.createElement('button');
      b.className = 'chip' + (cur === d.k ? ' on' : '');
      b.type = 'button';
      b.dataset.k = d.k;
      if (d.icon) {
        const im = document.createElement('img');
        im.src = d.icon;          // icons/ 与页面同级，不拼资源根前缀
        im.alt = '';
        im.draggable = false;
        b.appendChild(im);
      }
      const t = document.createElement('span');
      t.textContent = d.k;
      b.appendChild(t);
      const n = document.createElement('em');
      n.textContent = chipCount(state.tab, d.k);
      b.appendChild(n);
      b.onclick = () => {
        if (state.filter[state.tab] === d.k) return;
        state.filter[state.tab] = d.k;
        renderChips(); renderGrid();
      };
      box.appendChild(b);
    });
  }

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

  /* ---------------- 合成绘制 ----------------
     层级（自底向上）：头像（圆形遮罩）→ 头像框 → 头像框挂件（顶层，非必选） */
  const msk = document.createElement('canvas');   // 遮罩画布（任意尺寸复用）
  const mctx = msk.getContext('2d');

  function compositeTo(g, size, frameImg, pendantImg) {
    g.clearRect(0, 0, size, size);
    if (state.avatar && state.avatar.img) {
      // 注意：width/height 是 canvas 元素的属性，必须设在 msk 上（设在 ctx 上只是无效扩展属性，
      // 画布会保持默认 300×150，头像被压扁成左上角一小块 —— R13 线上事故根因）
      if (msk.width !== size) msk.width = size;
      if (msk.height !== size) msk.height = size;
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, size, size);
      mctx.drawImage(state.avatar.img, 0, 0, size, size);
      mctx.globalCompositeOperation = 'destination-in';
      mctx.beginPath();
      mctx.arc(size / 2, size / 2, size * CIRCLE / 2, 0, Math.PI * 2);
      mctx.fill();
      g.drawImage(msk, 0, 0);
    }
    if (frameImg) g.drawImage(frameImg, 0, 0, size, size);
    if (pendantImg) g.drawImage(pendantImg, 0, 0, size, size);
  }

  function paint(frameImg) {
    compositeTo(ctx, SIZE, frameImg, state.pendant && state.pendant.img);
  }

  let timer = null;
  function stopPlay() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function repaint() {
    stopPlay();
    updateGifBtn();
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
        state.frame = { name: raw.名称, zh: raw.中文名 || '', kind: 'dynamic', frames: frames, durs: durs };
      } else {
        state.frame = { name: entry.raw.名称, zh: entry.raw.中文名 || '', kind: 'static',
                        img: await IMG(ROOT + entry.raw.文件) };
      }
    } catch (e) { console.warn(e); }
    loadingEl.hidden = true;
    updateInfo(); markGrid(); repaint();
  }

  async function pickPendant(entry) {        // entry 为 null 表示「无挂件」
    if (!entry) {
      state.pendant = null;
      updateInfo(); markGrid(); repaint();
      return;
    }
    loadingEl.hidden = false;
    try {
      state.pendant = { name: entry.名称, zh: entry.中文名 || '',
                        img: await IMG(ROOT + entry.文件) };
    } catch (e) { console.warn(e); }
    loadingEl.hidden = true;
    updateInfo(); markGrid(); repaint();
  }

  function onPick(o) {
    if (o.kind === 'avatar') pickAvatar(o.raw);
    else if (o.kind === 'none') pickFrame(null);
    else if (o.kind === 'no-pendant') pickPendant(null);
    else if (o.kind === 'pendant') pickPendant(o.raw);
    else pickFrame(o);
  }

  /* ---------------- 网格 ---------------- */
  function list() {
    if (state.tab === 'avatar') {
      return D.头像.map(o => ({ key: o.名称, label: o.中文名 || label(o.名称), code: label(o.名称),
                                kind: 'avatar', raw: o, thumb: o.文件 }));
    }
    if (state.tab === 'pendant') {
      const arr = [{ key: '__nopendant__', label: '无挂件', kind: 'no-pendant', thumb: null }];
      D.挂件.forEach(o => arr.push({ key: o.名称, label: o.中文名 || label(o.名称), code: label(o.名称),
                                     kind: 'pendant', raw: o, thumb: o.文件 }));
      return arr;
    }
    const arr = [{ key: '__none__', label: '无框', kind: 'none', thumb: null }];
    D.静态框.forEach(o => arr.push({ key: o.名称, label: o.中文名 || label(o.名称), code: label(o.名称),
                                     kind: 'static', raw: o, thumb: o.文件 }));
    D.动态框.forEach(o => arr.push({ key: o.名称, label: o.中文名 || o.名称, code: o.名称,
                                     kind: 'dynamic', raw: o, thumb: o.帧[0], badge: '动' }));
    return arr;
  }

  function renderGrid() {
    const q = state.q.trim().toLowerCase();
    const flt = state.filter[state.tab];
    const all = list().filter(o => {
      if (state.tab === 'avatar') {
        return flt === '全部' || (o.raw.企业 || '其他') === flt;
      }
      if (state.tab === 'pendant') {
        if (o.kind === 'no-pendant') return flt === '全部';
        return flt === '全部' || pendantCat(o.raw) === flt;
      }
      if (o.kind === 'none') return flt === '全部';   // 「无框」只在全部里出现
      if (flt === '动态') return o.kind === 'dynamic' && o.raw.中文名;
      if (flt === '静态') return o.kind === 'static' && o.raw.中文名;
      if (flt === '其他') return !o.raw.中文名;        // 未匹配到汉化名的都归「其他」
      return true;
    });
    const items = q
      ? all.filter(o => (o.key + ' ' + o.label + ' ' + (o.code || '') + ' ' +
                         (o.raw && o.raw.中文名 || '') + ' ' + (o.raw && o.raw.企业 || ''))
                        .toLowerCase().indexOf(q) >= 0)
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
      cap.title = (o.code && o.code !== o.label) ? o.label + '（' + o.code + '）' : o.label;

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
    let cur;
    if (state.tab === 'avatar') cur = state.avatar && state.avatar.item.名称;
    else if (state.tab === 'pendant') cur = state.pendant ? state.pendant.name : '__nopendant__';
    else cur = state.frame ? state.frame.name : '__none__';
    Array.prototype.forEach.call(gridEl.children, c => {
      c.classList.toggle('on', !!c.dataset && c.dataset.key === cur);
    });
  }

  function updateInfo() {
    const aEl = document.getElementById('cur-avatar');
    const a = state.avatar && state.avatar.item;
    aEl.textContent = a ? (a.中文名 || a.名称) : '未选择';
    aEl.title = a ? a.名称 : '';
    const fEl = document.getElementById('cur-frame');
    const f = state.frame;
    fEl.textContent = f ? (f.zh || f.name) : '无框（白环）';
    fEl.title = f ? f.name : '';
    const pEl = document.getElementById('cur-pendant');
    const p = state.pendant;
    pEl.textContent = p ? (p.zh || p.name) : '无挂件';
    pEl.title = p ? p.name : '';
  }

  /* ---------------- 交互 ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), t => {
    t.onclick = () => {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'),
        x => x.classList.toggle('on', x === t));
      state.tab = t.dataset.tab;
      renderChips(); renderGrid();
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
    // 挂件不参与随机：保留用户当前选择（含"无挂件"）
  };

  document.getElementById('seg-bg').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    Array.prototype.forEach.call(e.currentTarget.children,
      x => x.classList.toggle('on', x === b));
    bgEl.className = b.dataset.bg;
  };

  /* ---------------- 导出 ---------------- */
  function fname(part) {
    return (part || '').replace(/[\\/:*?"<>|\s]+/g, '_');
  }
  function comboName() {
    const a = state.avatar && state.avatar.item;
    const f = state.frame;
    const p = state.pendant;
    return [
      a ? (a.中文名 || label(a.名称)) : 'nochar',
      f ? (f.zh || f.name) : 'noframe',
      p ? (p.zh || p.name) : null,
    ].map(fname).join('_');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = name;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  document.getElementById('btn-export').onclick = () => {
    cv.toBlob(blob => download(blob, 'nikke_' + comboName() + '.png'), 'image/png');
  };

  /* GIF 导出：头像（遮罩）+ 动态框逐帧 + 挂件，按游戏逐帧时长编码 256px 循环 GIF */
  const gifCv = document.createElement('canvas');
  gifCv.width = gifCv.height = 256;
  const gifCtx = gifCv.getContext('2d', { willReadFrequently: true });

  document.getElementById('btn-gif').onclick = async () => {
    const f = state.frame;
    const enc = window.gifenc;
    if (!f || f.kind !== 'dynamic' || !enc) return;
    const btn = document.getElementById('btn-gif');
    btn.disabled = true;
    loadingEl.hidden = false;
    try {
      // 1) 先合成全部帧并缓存像素：全程共用一张全局调色板。
      //    逐帧各自 quantize 会造成帧间颜色漂移（播放时闪烁噪点）——旧实现根因。
      const framesData = [];
      for (let i = 0; i < f.frames.length; i++) {
        compositeTo(gifCtx, gifCv.width, f.frames[i], state.pendant && state.pendant.img);
        framesData.push(gifCtx.getImageData(0, 0, gifCv.width, gifCv.height).data);
      }
      // 2) 只采样不透明像素建调色板（透明角落不参与配色，避免被映射成角部色块）
      const sample = [];
      for (const d of framesData) {
        for (let p = 0; p < d.length; p += 4 * 5) { // 每帧约 1/5 抽样，足够代表全部颜色
          if (d[p + 3] >= 128) sample.push(d[p], d[p + 1], d[p + 2], 255);
        }
      }
      const palette = enc.quantize(new Uint8Array(sample), 255, { format: 'rgb565' });
      const T = palette.length; // 末位索引保留为透明色
      palette.push([0, 0, 0]);
      // 3) 逐帧索引：alpha<128 的像素（圈外角落+半透明边缘）归透明索引，避免光晕
      const gif = enc.GIFEncoder();
      for (let i = 0; i < framesData.length; i++) {
        const d = framesData[i];
        const idx = enc.applyPalette(d, palette, 'rgb565');
        for (let p = 3, o = 0; o < idx.length; p += 4, o++) {
          if (d[p] < 128) idx[o] = T;
        }
        gif.writeFrame(idx, gifCv.width, gifCv.height,
                       { palette: palette, delay: f.durs[i] || 100,
                         transparent: true, transparentIndex: T, dispose: 2 });
      }
      gif.finish();
      download(new Blob([gif.bytes()], { type: 'image/gif' }), 'nikke_' + comboName() + '.gif');
    } catch (e) {
      console.warn(e);
      alert('GIF 导出失败：' + e.message);
    }
    loadingEl.hidden = true;
    updateGifBtn();
  };

  function updateGifBtn() {
    const f = state.frame;
    document.getElementById('btn-gif').disabled =
      !(f && f.kind === 'dynamic' && window.gifenc);
  }

  /* ---------------- 启动 ---------------- */
  document.getElementById('n-avatar').textContent = D.头像.length;
  document.getElementById('n-frame').textContent = D.静态框.length + D.动态框.length;
  document.getElementById('n-pendant').textContent = (D.挂件 || []).length;
  document.getElementById('stat').textContent =
    '素材源自游戏原始资源 ｜ 头像 ' + D.头像.length +
    ' ｜ 静态框 ' + D.静态框.length + ' ｜ 动态框 ' + D.动态框.length +
    ' 组 ｜ 挂件 ' + (D.挂件 || []).length;

  renderChips();
  renderGrid();
  pickAvatar(D.头像.filter(o => o.名称 === 'si_c100_00_s')[0] || D.头像[0]);

  // file:// 下可正常预览，但 canvas 会被标记为跨源，导出 PNG 必然失败——提前告知
  if (location.protocol === 'file:') {
    const w = document.getElementById('warn');
    w.hidden = false;
    w.innerHTML = '当前以 <code>file://</code> 打开，预览可用，但「导出 PNG / GIF」会被浏览器的跨源策略拦截。'
      + '请在 <code>头像框预览</code> 目录下执行 <code>python -m http.server 8777</code>，'
      + '再访问 <code>http://127.0.0.1:8777/重构方案_v2.0/阶段4_预览工具/工具/index.html</code>。';
  }
})();
