/* app.js — NIKKE 战力计算器 前端 */
(function () {
  "use strict";
  var D = window.NIKKE_POWER_DATA;
  var C = window.NikkePowerCore;
  var P = window.NikkePanel;
  var KEY = "nikke_power_calc_v2";
  var SLOT_LABEL = { head: "头部", body: "衣服", arms: "手部", legs: "鞋子" };
  /* 企业与职业枚举：取自 CharacterTable.Corporation / .Class（实测取值 1/2/3/4/7 与 1/2/3） */
  var CORP = { 1: "极乐净土", 2: "米西利斯", 3: "泰特拉", 4: "朝圣者", 5: "反常", 6: "反常", 7: "反常" };
  var CLS = { 1: "火力型", 2: "防御型", 3: "辅助型" };
  var WEAPON = { 1: "AR 步枪", 2: "RL 发射器", 3: "SR 狙击", 4: "MG 机枪", 5: "SG 霰弹", 9: "SMG 冲锋" };
  /* 稀有度：OriginalRare 1/2/3 → R/SR/SSR（拆包实地取值） */
  var RARITY = { 1: "R", 2: "SR", 3: "SSR" };
  var EMPTY = { key: "", level: 0 };
  /* 手填面板已屏蔽（2026-10-13）：面板三围一律由练度参数推导，输入层不再暴露 manual 模式。
     改成 true 即可恢复双模式（DOM 里的 #mode-switch / 标定按钮已保留，仅 hidden）。 */
  var MANUAL_MODE_ENABLED = false;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var fmt = function (v) { return Number(v || 0).toLocaleString("zh-CN"); };
  var sfmt = function (v) { return (v > 0 ? "+" : "") + fmt(v); };
  function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); }

  /* 装备等级（= 游戏内装备强化等级）上限：EquipmentGradeTable 里 T9/T10 的 MaxLevel = 5 */
  var GEAR_LV_MAX = 5;
  /* 游戏内过载词条档位配色（实证口径）：
   *   1 ~ 11 阶 → 默认色；12 ~ 14 阶 → 蓝字（Blue Label）；15 阶 → 黑底白字（Black Label）。
   *   来源：Prydwen / Rappy-World / vortexgaming 的过载装备攻略，与游戏内显示一致。 */
  function tierCls(level) {
    var lv = Math.trunc(num(level));
    if (lv >= 15) return "t-max";
    if (lv >= 12) return "t-hi";
    return "";
  }
  function blankGear() {
    var g = {};
    C.SLOTS.forEach(function (s) {
      g[s] = { lv: GEAR_LV_MAX, before: [clone(EMPTY), clone(EMPTY), clone(EMPTY)], after: [clone(EMPTY), clone(EMPTY), clone(EMPTY)] };
    });
    return g;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** 清洗任意来源的装备结构（存档 / byChar）为规范形状，缺项补空；lv = 该部位的装备等级 0~5。
   *  ① 当前装备（before）侧额外去重：同一件装备不可能出现重复词条，重复的保留首个、其余置空。
   *  ② 洗练目标（after）侧不去重 —— 洗练时词条位置可能被打乱，重复类型是允许的。 */
  function normalizeGear(g) {
    var out = blankGear();
    C.SLOTS.forEach(function (s) {
      if (!g || !g[s]) return;
      out[s].lv = Math.max(0, Math.min(GEAR_LV_MAX, Math.trunc(num(g[s].lv, GEAR_LV_MAX))));
      ["before", "after"].forEach(function (side) {
        var seen = {};
        ((g[s] && g[s][side]) || []).slice(0, 3).forEach(function (row, i) {
          if (!row) return;
          var key = String(row.key || "");
          var lv = Math.max(0, Math.min(15, Math.trunc(num(row.level))));
          if (side === "before" && key) {
            if (seen[key]) { key = ""; lv = 0; }
            else seen[key] = 1;
          }
          out[s][side][i] = { key: key, level: lv };
        });
      });
    });
    return out;
  }
  /** state.gear 按位分开存，内核按 {head:[…],body:[…],…} 取用，这里做扁平化 */
  function flatGear(side) {
    var o = {};
    C.SLOTS.forEach(function (s) { o[s] = state.gear[s][side]; });
    return o;
  }

  function defaults() {
    return {
      schemaVersion: 2,
      mode: "loadout",
      char: "拉毗：小红帽",
      loadout: {
        rid: 16, level: 492, bt: 10, attr: 40,
        cubeId: 1000301, cubeLv: 15, coll: "SR", collLv: 15,
        rp: 100, rc: 100, rk: 100, corpBonus: false, auto: true
      },
      /* 角色级参数按 rid 记忆：切换角色时不会因为新角色档位更少而被清空
         （R 只有 1 档 / SR 只有 3 档，切过去会把突破压到 0，切回来必须能恢复）；
         gear 一并按角色记忆 —— 每个角色各有自己的整套装备（4 个部位的装备等级 + 词条）。 */
      byChar: {},
      gearByChar: {},
      fav: [],              // 收藏角色 rid 列表（检索区「★ 收藏」范围用）
      scope: "all",         // 角色检索范围：all | fav | recorded
      panel: { attack: "", hp: "", defense: "", critRate: 15, critDamage: 150, extraBP: "", skill1: 10, skill2: 10, burst: 10 },
      gear: blankGear(),
      /* 洗练模拟（按部位）：只重洗「该部位被勾选的词条位」，其余词条保持现状。
         active[部位] = 该部位 3 条词条的「参与重洗」开关（1 = 参与，0 = 锁定保留）。 */
      sim: {
        slot: "head",
        mode: "change",   // change = 换词条（Change Effects）｜value = 只洗数值（Reset Attributes）
        active: { head: [1, 1, 1], body: [1, 1, 1], arms: [1, 1, 1], legs: [1, 1, 1] },
        rolls: 5000,
        target: {}        // target[部位][行] = { key, level, autoKey, autoLevel }
      }
    };
  }

  var state = defaults();

  /* ---------------- 状态读写 ---------------- */
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw) return;
      var d = defaults();
      if (raw.char) d.char = raw.char;
      Object.keys(d.panel).forEach(function (k) { if (raw.panel && raw.panel[k] !== undefined && raw.panel[k] !== null) d.panel[k] = raw.panel[k]; });
      d.gear = normalizeGear(raw.gear);
      // 旧存档迁移：装备等级原先存在 loadout.e1..e4（不随角色记忆），现统一进 gear[slot].lv
      if (raw.loadout) {
        var legacyEq = [raw.loadout.e1, raw.loadout.e2, raw.loadout.e3, raw.loadout.e4];
        C.SLOTS.forEach(function (s, i) {
          var had = raw.gear && raw.gear[s] && raw.gear[s].lv !== undefined && raw.gear[s].lv !== null;
          if (!had && legacyEq[i] !== undefined && legacyEq[i] !== null) {
            d.gear[s].lv = Math.max(0, Math.min(GEAR_LV_MAX, Math.trunc(num(legacyEq[i], GEAR_LV_MAX))));
          }
        });
      }
      if (raw.sim) {
        if (C.SLOTS.indexOf(raw.sim.slot) >= 0) d.sim.slot = raw.sim.slot;   // 旧存档无 slot → 默认 head
        d.sim.rolls = Math.max(100, Math.min(200000, Math.trunc(num(raw.sim.rolls, d.sim.rolls))));
        if (raw.sim.mode === "value") d.sim.mode = "value";
        if (raw.sim.active && typeof raw.sim.active === "object") {
          C.SLOTS.forEach(function (s) {
            var a = raw.sim.active[s];
            if (Array.isArray(a) && a.length === 3) {
              var norm = a.map(function (v) { return v ? 1 : 0; });
              d.sim.active[s] = norm.some(Boolean) ? norm : [1, 1, 1];
            }
          });
        }
        if (raw.sim.target && typeof raw.sim.target === "object") {
          C.SLOTS.forEach(function (s) {
            var arr = raw.sim.target[s];
            if (!Array.isArray(arr)) return;
            var out = [];
            for (var i = 0; i < 3; i++) {
              var t = arr[i] || {};
              out.push({
                key: String(t.key || ""),
                level: Math.max(0, Math.min(15, Math.trunc(num(t.level)))),
                autoKey: t.autoKey !== false, autoLevel: t.autoLevel !== false
              });
            }
            d.sim.target[s] = out;
          });
        }
      }
      if (raw.mode) d.mode = raw.mode;
      if (raw.byChar && typeof raw.byChar === "object") d.byChar = raw.byChar;
      if (raw.gearByChar && typeof raw.gearByChar === "object") d.gearByChar = raw.gearByChar;
      if (Array.isArray(raw.fav)) d.fav = raw.fav;
      if (raw.scope === "fav" || raw.scope === "recorded") d.scope = raw.scope;
      if (raw.loadout) {
        Object.keys(d.loadout).forEach(function (k) {
          if (raw.loadout[k] !== undefined && raw.loadout[k] !== null) d.loadout[k] = raw.loadout[k];
        });
      }
      state = d;
      // 装备词条按角色恢复：该角色有记录就用它；没有则把工作副本回写成它的记录（兼容旧存档）
      var gb = state.gearByChar[String(state.loadout.rid)];
      if (gb) state.gear = normalizeGear(gb);
      else state.gearByChar[String(state.loadout.rid)] = clone(state.gear);
    } catch (e) { /* 忽略损坏存档 */ }
  }
  function save(silent) {
    collectPanel();
    // 落盘前把「当前角色的工作副本」写回按角色的记录，保证云同步/导出都带上整套装备词条
    state.gearByChar[String(state.loadout.rid)] = clone(state.gear);
    try { localStorage.setItem(KEY, JSON.stringify(state)); if (!silent) setNotice("已保存到本机浏览器", "ok"); }
    catch (e) { setNotice("保存失败：" + e.message, "error"); }
  }
  function setNotice(t, k) { var el = $("notice"); el.textContent = t || ""; el.className = "notice" + (k ? " " + k : ""); }

  /* ---------------- 面板 ---------------- */
  function panelFields() {
    return [
      ["attack", "p-attack"], ["hp", "p-hp"], ["defense", "p-defense"],
      ["critRate", "p-critRate"], ["critDamage", "p-critDamage"], ["extraBP", "p-extraBP"],
      ["skill1", "p-skill1"], ["skill2", "p-skill2"], ["burst", "p-burst"]
    ];
  }
  function renderPanelValues() {
    panelFields().forEach(function (p) { $(p[1]).value = state.panel[p[0]] === 0 ? 0 : (state.panel[p[0]] || ""); });
  }
  function renderPanel() {
    renderPanelValues();
    renderLoadout();
  }
  function collectPanel() {
    panelFields().forEach(function (p) {
      var el = $(p[1]);
      state.panel[p[0]] = el.value === "" ? "" : num(el.value);
    });
    if (state.mode !== "loadout") state.char = $("char-input").value.trim();
  }
  function profile() {
    // 客户端静态表常量：CriticalRatio=1500 / CriticalDamage=15000（全部 1927 角色一致）
    // 界面按「百分比」输入（15 / 150），此处 ×100 还原为表值。
    return {
      attack: state.panel.attack, hp: state.panel.hp, defense: state.panel.defense,
      critRatio: num(state.panel.critRate) * 100,
      critDamage: num(state.panel.critDamage) * 100,
      skill1: state.panel.skill1, skill2: state.panel.skill2, burst: state.panel.burst,
      extraBP: state.panel.extraBP
    };
  }
  function hasPanel() {
    return state.panel.attack !== "" && state.panel.hp !== "" && state.panel.defense !== "";
  }

  function renderCharMeta() {
    var rid = currentRid();
    var hit = P.findRoster(D, rid);
    if (!hit) {
      $("char-meta").textContent = "未在角色目录中匹配到（请从搜索结果里选一个）";
      $("anchor-cls").textContent = "—"; $("anchor-corp").textContent = "—";
      return;
    }
    var corpName = CORP[hit.corp] || ("企业" + hit.corp);
    var clsName = CLS[hit.cls] || ("职业" + hit.cls);
    $("char-meta").textContent = [(RARITY[hit.rarity] || ""), corpName, clsName,
      WEAPON[hit.weapon] || ("武器" + hit.weapon), "增强组 " + hit.enh].filter(Boolean).join(" · ");
    // 循环室「职业研究 / 企业研究」按当前角色自动锚定
    $("anchor-cls").textContent = clsName;
    $("anchor-corp").textContent = corpName;
  }
  function currentRid() {
    var name = $("char-input").value.trim();
    for (var i = 0; i < D.roster.length; i++) if (D.roster[i].name === name) return D.roster[i].rid;
    return state.loadout.rid;
  }

  /* ---------------- 角色选择器（整合式搜索框） ----------------
   * 旧实现是「筛选框 + 原生 <select>」两段式：先打关键词、再去下拉里翻第二次，用户反馈很别扭。
   * 现在合并成一个控件：#char-search 输入即筛、#char-pop 浮层直接列候选、点一下就是选中。
   * 原 #char-input（<select>）保留但隐藏 —— 它是「当前选中角色」的状态载体，
   * currentRid() / collectLoadout() 等既有调用点一行都不用改。 */
  var CORP_ORDER = ["极乐净土", "米西利斯", "泰特拉", "朝圣者", "反常"];

  /* ---- 归一化：小写 + 全角转半角 + 丢弃分隔符（保留中文 / 字母 / 数字）----
   * 「拉毗：小红帽」「拉毗 小红帽」「拉毗:小红帽」「拉毗小红帽」归一化后都是「拉毗小红帽」。 */
  function normChar(ch) {
    var c = String(ch).toLowerCase();
    if (c.charCodeAt(0) === 0x3000) return "";                       // 全角空格
    var code = c.charCodeAt(0);
    if (code >= 0xff01 && code <= 0xff5e) c = String.fromCharCode(code - 0xfee0);  // 全角 → 半角
    return /[a-z0-9\u4e00-\u9fff]/.test(c) ? c : "";                 // 其余（冒号/括号/空白…）全丢
  }
  /** 归一化，并返回「归一化串下标 → 原串下标」的映射（用于在原文里做命中高亮） */
  function normMap(s) {
    var str = String(s == null ? "" : s), out = "", map = [];
    for (var i = 0; i < str.length; i++) {
      var n = normChar(str[i]);
      if (!n) continue;
      out += n;
      for (var k = 0; k < n.length; k++) map.push(i);
    }
    return { norm: out, map: map };
  }
  function normText(s) { return normMap(s).norm; }
  /** roster 每项挂上归一化串 / 全拼 / 首字母（只算一次，惰性） */
  function decorateRoster() {
    D.roster.forEach(function (r) {
      if (r._nrm !== undefined) return;
      var nm = String(r.name);
      r._nrm = normText(nm);
      r._py = String(r.py || r._nrm);
      r._ini = String(r.ini || "");
      r._py2 = String(r.py2 || "");     // 别名拼音（如「拉毗」圈内读「拉比」→ labi）
      r._ini2 = String(r.ini2 || "");
    });
  }
  /** 输入串 → 归一化关键词数组（空白 / 逗号 / 顿号 分隔，AND 关系） */
  function kwList(raw) {
    return String(raw || "").split(/[\s,，、]+/).map(normText).filter(Boolean);
  }
  /** 单关键词命中：归一化名字 / 全拼 / 首字母缩写 / 别名拼音 */
  function matchOne(r, kw) {
    return r._nrm.indexOf(kw) >= 0 || r._py.indexOf(kw) >= 0 || (r._ini && r._ini.indexOf(kw) >= 0)
      || (r._py2 && r._py2.indexOf(kw) >= 0) || (r._ini2 && r._ini2.indexOf(kw) >= 0);
  }
  function scoreOf(r, kws) {
    var s = 0;
    kws.forEach(function (k) {
      var a = r._nrm.indexOf(k), b = r._py.indexOf(k), c = r._ini ? r._ini.indexOf(k) : -1;
      var d = r._py2 ? r._py2.indexOf(k) : -1, e = r._ini2 ? r._ini2.indexOf(k) : -1;
      if (a === 0) s += 100;
      else if (a > 0) s += 60;
      else if (b === 0 || d === 0) s += 45;
      else if (c === 0 || e === 0) s += 35;
      else if (b > 0 || d > 0) s += 25;
      else if (c > 0 || e > 0) s += 15;
    });
    return s;
  }
  /* ---- 收藏 / 已记录 ---- */
  function favSet() { var o = {}; (state.fav || []).forEach(function (r) { o[String(r)] = 1; }); return o; }
  function isFav(rid) { return !!favSet()[String(rid)]; }
  function toggleFav(rid) {
    var id = String(rid), i = (state.fav || []).map(String).indexOf(id);
    if (!state.fav) state.fav = [];
    if (i >= 0) state.fav.splice(i, 1); else state.fav.push(rid);
    save(true);
  }
  /** 「已记录」= 存档里真有内容的角色（填过词条 / 动过装备等级 / 改过突破档 / 存过收藏品） */
  function recordedSet() {
    var out = {}, defBt = defaults().loadout.bt;
    function scanGear(g) {
      if (!g) return false;
      var hit = false;
      C.SLOTS.forEach(function (s) {
        if (!g[s]) return;
        if (g[s].lv !== undefined && Math.trunc(num(g[s].lv, GEAR_LV_MAX)) !== GEAR_LV_MAX) hit = true;
        ["before", "after"].forEach(function (side) {
          ((g[s] && g[s][side]) || []).forEach(function (r) { if (r && r.key) hit = true; });
        });
      });
      return hit;
    }
    Object.keys(state.byChar || {}).forEach(function (k) {
      var o = state.byChar[k]; if (!o) return;
      if (scanGear(o.gear) || (o.bt !== undefined && Math.trunc(num(o.bt, defBt)) !== defBt) || o.coll) out[k] = 1;
    });
    Object.keys(state.gearByChar || {}).forEach(function (k) { if (scanGear(state.gearByChar[k])) out[k] = 1; });
    return out;
  }
  /** 按「范围 + 关键词」筛出角色，并按命中质量 + 拼音序排序 */
  function filterRoster() {
    decorateRoster();
    var kws = kwList($("char-search") ? $("char-search").value : "");
    var pool = D.roster.slice();
    if (state.scope === "fav") { var fs = favSet(); pool = pool.filter(function (r) { return fs[String(r.rid)]; }); }
    else if (state.scope === "recorded") { var rs = recordedSet(); pool = pool.filter(function (r) { return rs[String(r.rid)]; }); }
    var list = pool.filter(function (r) { return kws.every(function (k) { return matchOne(r, k); }); });
    list.sort(function (a, b) {
      var d = scoreOf(b, kws) - scoreOf(a, kws);
      return d ? d : String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
    });
    return { list: list, total: pool.length, kws: kws };
  }
  /** 在原始名字里把命中的关键词包成 <mark>（归一化下标 → 原串下标回映射） */
  function highlightName(r, kws) {
    var nm = String(r.name);
    if (!kws.length) return esc(nm);
    var nmMap = normMap(nm), marks = [];
    kws.forEach(function (k) {
      var from = 0, p;
      while ((p = nmMap.norm.indexOf(k, from)) >= 0) {
        marks.push([nmMap.map[p], nmMap.map[p + k.length - 1] + 1]);
        from = p + 1;
      }
    });
    if (!marks.length) return esc(nm);
    marks.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    marks.forEach(function (m) {
      var last = merged[merged.length - 1];
      if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
      else merged.push(m.slice());
    });
    var out = "", cur = 0;
    merged.forEach(function (m) {
      out += esc(nm.slice(cur, m[0])) + "<mark>" + esc(nm.slice(m[0], m[1])) + "</mark>";
      cur = m[1];
    });
    return out + esc(nm.slice(cur));
  }
  /** 角色计数标签 */
  function updateCharCount(f) {
    var el = $("char-count");
    if (!el) return;
    var raw = $("char-search") ? $("char-search").value.trim() : "";
    el.textContent = (raw || (state.scope && state.scope !== "all"))
      ? (f.list.length + " / " + f.total + " 名")
      : (D.roster.length + " 名角色");
  }
  /** 渲染候选浮层（分组：★收藏置顶 + 按企业） */
  function renderPicker() {
    var pop = $("char-pop");
    if (!pop) return;
    var f = filterRoster();
    updateCharCount(f);
    var fs = favSet(), curRid = String(state.loadout.rid);
    var groupTitle = { fav: "★ 收藏（{n}）", rec: "已记录（{n}）" };

    function itemHTML(r) {
      var on = String(r.rid) === curRid;
      var fav = fs[String(r.rid)];
      return '<button type="button" class="roster-item' + (on ? " cur" : "") + '" data-rid="' + r.rid + '"'
        + ' role="option" aria-selected="' + (on ? "true" : "false") + '">'
        + '<span class="rar r' + num(r.rarity, 1) + '">' + esc(RARITY[r.rarity] || "?") + "</span>"
        + '<span class="nm">' + highlightName(r, f.kws) + "</span>"
        + '<i class="fav' + (fav ? " on" : "") + '" data-fav="' + r.rid + '" title="'
        + (fav ? "取消收藏" : "加入收藏") + '">' + (fav ? "★" : "☆") + "</i></button>";
    }
    var h = "";
    if (state.scope === "fav") {
      h = f.list.length ? f.list.map(itemHTML).join("") : "";
    } else if (state.scope === "recorded") {
      h = f.list.length ? f.list.map(itemHTML).join("") : "";
    } else {
      var favs = f.list.filter(function (r) { return fs[String(r.rid)]; });
      var recs = {}, rs2 = recordedSet();
      f.list.forEach(function (r) { if (rs2[String(r.rid)]) recs[String(r.rid)] = 1; });
      var rest = f.list.filter(function (r) { return !fs[String(r.rid)]; });
      if (favs.length) h += '<div class="roster-grp">' + groupTitle.fav.replace("{n}", favs.length) + "</div>" + favs.map(itemHTML).join("");
      var groups = {};
      rest.forEach(function (r) {
        var c = CORP[r.corp] || ("企业" + r.corp);
        (groups[c] = groups[c] || []).push(r);
      });
      CORP_ORDER.concat(Object.keys(groups).filter(function (c) { return CORP_ORDER.indexOf(c) < 0; }))
        .forEach(function (c) {
          var arr = groups[c];
          if (!arr || !arr.length) return;
          h += '<div class="roster-grp">' + esc(c) + "（" + arr.length + "）</div>" + arr.map(itemHTML).join("");
        });
    }
    if (!h) h = '<div class="roster-empty">没有匹配的角色</div>';
    pop.innerHTML = h;
    pop.querySelectorAll("button.roster-item").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });   // 保住输入框焦点
      b.addEventListener("click", function (e) {
        if (e.target.classList.contains("fav")) {          // 点星标只切收藏，不选中
          e.stopPropagation();
          toggleFav(e.target.dataset.fav);
          renderPicker();
          return;
        }
        pickRoster(Number(b.dataset.rid));
      });
    });
  }
  function openPicker() { var p = $("char-pop"); if (p) { renderPicker(); p.hidden = false; } }
  function closePicker() { var p = $("char-pop"); if (p) p.hidden = true; }
  /** 选中某角色：写输入框 + 状态载体 → 走既有切角色流程 */
  function pickRoster(rid) {
    var hit = null;
    for (var i = 0; i < D.roster.length; i++) if (D.roster[i].rid === rid) { hit = D.roster[i]; break; }
    if (!hit) return;
    $("char-search").value = String(hit.name);
    $("char-input").value = String(hit.name);
    closePicker();
    onCharPicked();
  }
  /** ↑↓ 在候选里移动、Enter 选中、Esc 关闭 */
  function pickerKey(e) {
    var pop = $("char-pop");
    if (!pop || pop.hidden) {
      if (e.key === "ArrowDown") { openPicker(); e.preventDefault(); }
      return;
    }
    var items = Array.prototype.slice.call(pop.querySelectorAll("button.roster-item"));
    if (!items.length) return;
    var cur = items.findIndex(function (b) { return b.classList.contains("active"); });
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var next = e.key === "ArrowDown" ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
      items.forEach(function (b) { b.classList.remove("active"); });
      items[next].classList.add("active");
      items[next].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      var t = cur >= 0 ? items[cur] : items[0];
      pickRoster(Number(t.dataset.rid));
    } else if (e.key === "Escape") {
      closePicker();
    }
  }
  /** 同步范围开关的选中态 */
  function renderScopeSwitch() {
    var box = $("char-scope");
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("input"), function (r) {
      r.checked = (r.value === (state.scope || "all"));
    });
  }
  /** 切完角色后同步检索区：输入框文本 + 计数（浮层开着才重建浮层） */
  function syncPickerUI() {
    var si = $("char-search");
    if (si && document.activeElement !== si) si.value = state.char || "";
    var pop = $("char-pop");
    if (pop && !pop.hidden) renderPicker();
    else updateCharCount(filterRoster());
  }
  /* 角色级记忆：突破档 / 收藏品 / 整套装备词条 —— 都随角色切换而存取 */
  var CHAR_KEYS = ["bt", "coll"];
  function rememberChar(rid) {
    if (rid == null) return;
    var o = {};
    CHAR_KEYS.forEach(function (k) { o[k] = state.loadout[k]; });
    o.gear = clone(state.gear);       // 该角色的整套装备：4 部位装备等级 + 当前词条 + 洗练目标
    state.byChar[String(rid)] = o;
  }
  function recallChar(rid) {
    var d = defaults().loadout, saved = state.byChar[String(rid)];
    CHAR_KEYS.forEach(function (k) {
      state.loadout[k] = (saved && saved[k] !== undefined && saved[k] !== null) ? saved[k] : d[k];
    });
    // 恢复该角色的整套装备（含装备等级）；没记录就从零录入（新角色各录各的，等级默认满级 5）
    state.gear = (saved && saved.gear) ? normalizeGear(saved.gear) : blankGear();
  }
  /** 切换角色：记住旧角色 → 落新 rid → 恢复新角色的档位/收藏品/装备 → 重挂下拉 → 重推面板 */
  function onCharPicked() {
    rememberChar(state.loadout.rid);
    state.char = $("char-input").value.trim();
    state.loadout.rid = currentRid();
    recallChar(state.loadout.rid);
    renderBreakthroughOptions(); renderCollOptions(); renderCharMeta();
    renderGear(); gearDirty = false; renderGearState();
    collectLoadout();
    if (state.mode === "loadout" && state.loadout.auto) derivePanel();
    syncPickerUI();
    save(true);
  }

  /* ---------------- 练度模式 ---------------- */
  function renderLoadout() {
    var lo = state.loadout;
    var sel = $("char-input");
    sel.value = state.char || "";
    if (!sel.value) {                     // 存档里的名字对不上目录（旧存档）→ 落到目录第一名
      sel.value = (D.roster[0] && D.roster[0].name) || "";
      state.char = sel.value;
      lo.rid = currentRid();
    }
    decorateRoster();
    var si = $("char-search"); if (si) si.value = state.char || "";
    renderScopeSwitch();
    updateCharCount(filterRoster());
    $("l-level").value = lo.level;
    $("l-attr").value = lo.attr;
    $("l-cubelv").value = lo.cubeLv;
    $("l-colllv").value = lo.collLv;
    $("l-rp").value = lo.rp; $("l-rc").value = lo.rc; $("l-rk").value = lo.rk;
    $("l-corpbonus").checked = !!lo.corpBonus;
    $("l-auto").checked = lo.auto !== false;
    renderBreakthroughOptions();
    renderCubeOptions();
    renderCollOptions();
    renderCharMeta();
  }
  function renderBreakthroughOptions() {
    var lim = P.limits(D, currentRid());
    if (!lim) { $("l-bt").innerHTML = ""; return; }
    $("l-bt").innerHTML = lim.map(function (x) {
      var star = x.breakthrough + 1;
      var tag = x.core > 0 ? ("突破" + star + "（核心 +" + x.core + "）") : ("突破" + star);
      return '<option value="' + x.breakthrough + '"' + (x.breakthrough === Math.trunc(state.loadout.bt) ? " selected" : "") + ">" + tag + "</option>";
    }).join("");
  }
  function renderCubeOptions() {
    $("l-cube").innerHTML = D.cubes.map(function (c) {
      var nm = String(c.name || "").replace(/^Locale_Item:/, "");
      return '<option value="' + c.id + '"' + (c.id === Math.trunc(state.loadout.cubeId) ? " selected" : "") + ">" + esc(nm) + "</option>";
    }).join("");
  }
  function renderCollOptions() {
    var ch = P.findRoster(D, currentRid());
    var opts = [['<option value="">无</option>']];
    if (ch && ch.coll) {
      if (ch.coll.R) opts.push('<option value="R">R 级收藏品</option>');
      if (ch.coll.SR) opts.push('<option value="SR">SR 级收藏品</option>');
      if (ch.coll.SSR) opts.push('<option value="SSR">SSR 专属收藏品</option>');
    }
    $("l-coll").innerHTML = opts.join("");
    $("l-coll").value = state.loadout.coll || "";
    if (!$("l-coll").value && state.loadout.coll) state.loadout.coll = "";
  }
  function collectLoadout() {
    var lo = state.loadout;
    state.char = $("char-input").value.trim();
    lo.rid = currentRid();
    lo.level = Math.max(1, Math.trunc(num($("l-level").value, 492)));
    lo.bt = Math.max(0, Math.min(10, Math.trunc(num($("l-bt").value, 0))));
    lo.attr = Math.max(0, Math.trunc(num($("l-attr").value, 0)));
    lo.cubeId = Math.trunc(num($("l-cube").value, 1000301));
    lo.cubeLv = Math.max(0, Math.min(15, Math.trunc(num($("l-cubelv").value, 0))));
    lo.coll = $("l-coll").value || null;
    lo.collLv = Math.max(0, Math.trunc(num($("l-colllv").value, 0)));
    lo.rp = Math.max(0, Math.trunc(num($("l-rp").value, 0)));
    lo.rc = Math.max(0, Math.trunc(num($("l-rc").value, 0)));
    lo.rk = Math.max(0, Math.trunc(num($("l-rk").value, 0)));
    lo.corpBonus = $("l-corpbonus").checked;
    lo.auto = $("l-auto").checked;
  }
  function loadoutOf() {
    var lo = state.loadout;
    return {
      rid: lo.rid, level: lo.level, breakthrough: lo.bt, attrLv: lo.attr,
      /* 装备等级（每部位 0~5）取自「① 当前装备」的按角色记录 —— 它进装备基础属性 → 面板三围 → 战力 */
      equip: { 1: state.gear.head.lv, 2: state.gear.body.lv, 3: state.gear.arms.lv, 4: state.gear.legs.lv },
      cubeId: lo.cubeId, cubeLv: lo.cubeLv,
      collRarity: lo.coll, collLv: lo.collLv,
      recycle: { personal: lo.rp, cls: lo.rc, corp: lo.rk },
      corpBonus: lo.corpBonus
    };
  }
  var lastDerive = null;
  function derivePanel(silent) {
    var d = P.derive(D, loadoutOf());
    if (d.error) { $("derive-note").textContent = "推导失败：" + d.error; return null; }
    lastDerive = d;
    state.panel.attack = d.atk;
    state.panel.hp = d.hp;
    state.panel.defense = d.def;
    state.panel.extraBP = d.extraBP;
    // 暴击取自角色静态表
    var ch = P.findRoster(D, state.loadout.rid);
    if (ch) { state.panel.critRate = ch.critR / 100; state.panel.critDamage = ch.critD / 100; }
    renderPanelValues();
    $("derive-note").innerHTML = "已按练度推导面板　·　魔方技能 " + fmt(d.detail.cubeBP) + " + 收藏技能 " + fmt(d.detail.collBP)
      + " = 附加效果战力 <b>" + fmt(d.extraBP) + "</b>"
      + (d.warn && d.warn.length ? "　⚠ " + esc(d.warn.join("；")) : "");
    renderTiers();
    if (!silent) compute();
    return d;
  }
  /** 4 档位预览：tier2 = ceil(level/20)*20+1，其后 +20 / +40（规则实测自参考站） */
  function tierLevels(level) {
    var base = Math.ceil(level / 20) * 20 + 1;
    return [level, base, base + 20, base + 40];
  }
  /** 4 档位预览（A 方案 · 双行横条）：上行「档位 + 战力（+ 较当前增量）」，下行「攻 / 生 / 防」完整展开。
   *  左栏内容宽只有 270px，5 列大数字表会溢出把「战力」列裁掉，故改为两行横条。 */
  function renderTiers() {
    var lo = loadoutOf();
    var lv = [lo.level].concat(tierLevels(lo.level).slice(1));
    var res = P.tierPreview(D, Object.assign({}, lo, {
      skill1: Math.trunc(num(state.panel.skill1, 1)), skill2: Math.trunc(num(state.panel.skill2, 1)), burst: Math.trunc(num(state.panel.burst, 1))
    }), D.config, C, lv);
    var base = 0, found = false;
    res.forEach(function (r) { if (r.level === lo.level && !r.error) { base = r.bp; found = true; } });
    if (!found && res.length && !res[0].error) base = res[0].bp;
    $("tier-list").innerHTML = res.map(function (r) {
      if (r.error) return '<div class="tier-item"><div class="tier-top"><span class="tier-lv">' + r.level + "</span><b class=\"tier-bp\">" + esc(r.error) + "</b></div></div>";
      var isCur = r.level === lo.level;
      return '<div class="tier-item' + (isCur ? " cur" : "") + '">'
        + '<div class="tier-top"><span class="tier-lv">' + r.level + (isCur ? '<i class="tier-cur">当前</i>' : "") + "</span>"
        + '<b class="tier-bp">' + fmt(r.bp) + "</b>"
        + (isCur ? "" : '<span class="tier-delta">' + sfmt(r.bp - base) + "</span>")
        + "</div>"
        + '<div class="tier-sub"><span>攻 ' + fmt(r.atk) + "</span><span>生 " + fmt(r.hp) + "</span><span>防 " + fmt(r.def) + "</span></div>"
        + "</div>";
    }).join("");
  }
  function setMode(m) {
    if (!MANUAL_MODE_ENABLED) m = "loadout";   // 手填面板已屏蔽：任何来源都被拉回练度模式
    state.mode = m;
    var load = m === "loadout";
    $("loadout-box").hidden = !load;
    var mb = $("manual-box"); if (mb) mb.hidden = true;   // 旧 DOM 兜底（现已移除该容器）
    $("mode-tag").textContent = load ? "练度模式" : "手填面板";
    var sw = $("mode-switch");
    if (sw) Array.prototype.forEach.call(sw.querySelectorAll("input"), function (r) { r.checked = (r.value === m); });
    if (load) derivePanel(true);
    compute();
  }

  /* ---------------- 词条编辑 ---------------- */
  /** 词条类型下拉。
   *  exclude = 同部位其它行已占用的 key —— 同一件装备不可能出现重复词条，这些项置灰不可选。
   *  仅 ① 当前装备（before）侧传 exclude；② 洗练目标（after）侧不传 —— 洗练时词条位置可能被打乱，
   *  重复类型在目标侧是允许的，不做限制。 */
  function typeOptions(selected, exclude) {
    var ex = {};
    (exclude || []).forEach(function (k) { if (k && k !== selected) ex[k] = 1; });
    var h = '<option value="">空（无词条）</option>';
    D.overload.forEach(function (g) {
      h += '<option value="' + esc(g.key) + '"' + (g.key === selected ? " selected" : "") + (ex[g.key] ? " disabled" : "") + '>' + esc(g.name) + "</option>";
    });
    return h;
  }
  /** 阶数下拉：选项文本「N 阶 · X.XX%」；数值 = 静态表 FunctionValue ÷ 100（游戏内显示口径）。
   *  选项带游戏内档位配色类：T12~14 蓝字、T15 黑底白字。 */
  function levelOptions(key, selected) {
    var sel = Math.max(0, Math.min(15, Math.trunc(num(selected))));
    var h = '<option value="0"' + (sel === 0 ? " selected" : "") + ">— 无阶数</option>";
    if (!key) return h;
    for (var lv = 1; lv <= 15; lv++) {
      var vt = C.statValueText(D, key, lv);
      var tc = tierCls(lv);
      h += '<option value="' + lv + '"' + (tc ? ' class="' + tc + '"' : "") + (lv === sel ? " selected" : "") + ">" + lv + "阶·" + esc(vt) + "</option>";
    }
    return h;
  }
  function lvlText(r) { return r.level ? (r.level + " 阶 " + (r.valueText || "")) : "空"; }
  function overloadName(key) {
    for (var i = 0; i < D.overload.length; i++) if (D.overload[i].key === key) return D.overload[i].name;
    return "";
  }
  /** 洗练面板左列的「当前装备」只读参照文本 */
  function curRefText(r) {
    if (!r || !r.level || !r.key) return "空";
    var vt = C.statValueText(D, r.key, r.level);
    return (overloadName(r.key) || "—") + " " + r.level + " 阶" + (vt ? " · " + vt : "");
  }
  /* 当前装备记录的保存状态（「未录入 / 未保存 / 已保存」） */
  var gearDirty = false;
  function gearFilled() {
    var any = false;
    C.SLOTS.forEach(function (s) {
      state.gear[s].before.forEach(function (r) { if (r.key && r.level) any = true; });
    });
    return any;
  }
  function renderGearState() {
    var el = $("gear-save-tag");
    if (!el) return;
    var txt, warn = false;
    if (!gearFilled()) txt = "未录入";
    else if (gearDirty) { txt = "未保存"; warn = true; }
    else txt = "已保存";
    el.textContent = txt;
    el.className = "tag" + (warn ? " warn" : "");
  }
  function renderGear() { renderGearCurrent(); renderGearTarget(); }
  /** 装备等级下拉（0 ~ 5；T9/T10 的 MaxLevel = 5，取自 EquipmentGradeTable） */
  function gearLvOptions(sel) {
    var s = Math.max(0, Math.min(GEAR_LV_MAX, Math.trunc(num(sel, GEAR_LV_MAX))));
    var h = "";
    for (var lv = 0; lv <= GEAR_LV_MAX; lv++) h += '<option value="' + lv + '"' + (lv === s ? " selected" : "") + ">" + lv + "</option>";
    return h;
  }
  /** 部位卡头部的「装备等级」控件（挂在 ① 的每张部位卡上） */
  function gearLvControl(slot, cur) {
    return '<span class="lv-wrap"><em>装备等级</em><select class="slot-lv" data-slot="'
      + slot + '" aria-label="' + SLOT_LABEL[slot] + '装备等级">' + gearLvOptions(cur) + "</select></span>";
  }
  /** 同一部位里「除第 idx 行以外」已被占用的词条类型（用于把类型下拉里的重复项置灰） */
  function beforeSiblingKeys(slot, idx) {
    var out = [];
    for (var j = 0; j < 3; j++) {
      if (j === idx) continue;
      var k = state.gear[slot].before[j] && state.gear[slot].before[j].key;
      if (k) out.push(k);
    }
    return out;
  }
  /* ① 当前装备：整块可编辑，是洗练的锚点记录（每部位 = 装备等级 + 3 条词条，词条类型同部位不重复） */
  function renderGearCurrent() {
    var html = "";
    C.SLOTS.forEach(function (slot) {
      html += '<article class="gear-card" data-grid="before" data-slot="' + slot + '"><h3>'
        + SLOT_LABEL[slot] + gearLvControl(slot, state.gear[slot].lv) + "</h3>";
      for (var i = 0; i < 3; i++) {
        var b = state.gear[slot].before[i];
        html += '<div class="opt-row" data-index="' + i + '"><div class="opt-idx" data-label>' + (i + 1) + "</div>"
          + '<div class="opt-side solo before">'
          + '<select class="ty" data-side="before" data-index="' + i + '" aria-label="当前装备词条类型">' + typeOptions(b.key, beforeSiblingKeys(slot, i)) + "</select>"
          + '<select class="lv ' + tierCls(b.level) + '" data-side="before" data-index="' + i + '" aria-label="当前装备阶数">' + levelOptions(b.key, b.level) + "</select>"
          + "</div></div>";
      }
      html += "</article>";
    });
    $("gear-current").innerHTML = html;
    bindGearSelects($("gear-current"));
  }
  /** ① 当前装备：某行类型变化后，重算同部位各行的类型下拉（刷新「已被占用」的置灰项） */
  function refreshBeforeTypes(slot) {
    var card = $("gear-current").querySelector('[data-slot="' + slot + '"]');
    if (!card) return;
    for (var i = 0; i < 3; i++) {
      var row = card.querySelectorAll(".opt-row")[i];
      if (!row) continue;
      var ty = row.querySelector('select.ty[data-side="before"]');
      if (!ty) continue;
      ty.innerHTML = typeOptions(state.gear[slot].before[i].key, beforeSiblingKeys(slot, i));
    }
  }
  /* ② 装备词条洗练：左=当前（只读参照） → 右=洗练目标（可编辑） */
  function renderGearTarget() {
    var html = "";
    C.SLOTS.forEach(function (slot) {
      html += '<article class="gear-card" data-grid="after" data-slot="' + slot + '"><h3>' + SLOT_LABEL[slot] + "</h3>";
      for (var i = 0; i < 3; i++) {
        var b = state.gear[slot].before[i], a = state.gear[slot].after[i];
        var ref = curRefText(b);
        html += '<div class="opt-row" data-index="' + i + '"><div class="opt-idx" data-label>' + (i + 1) + "</div>"
          + '<div class="opt-cmp">'
          + '<span class="cur-ref ' + tierCls(b.level) + (b.level ? "" : " empty") + '" title="当前装备：' + esc(ref) + '">' + esc(ref) + "</span>"
          + '<span class="arrow">→</span>'
          + '<div class="opt-side solo after">'
          + '<select class="ty" data-side="after" data-index="' + i + '" aria-label="洗练目标词条类型">' + typeOptions(a.key) + "</select>"
          + '<select class="lv ' + tierCls(a.level) + '" data-side="after" data-index="' + i + '" aria-label="洗练目标阶数">' + levelOptions(a.key, a.level) + "</select>"
          + "</div></div></div>";
      }
      html += '<div class="gear-foot"><span>内部战力 / 战力变化</span><b data-gear-delta>--</b></div></article>';
    });
    $("gear-target").innerHTML = html;
    bindGearSelects($("gear-target"));
  }
  function bindGearSelects(root) {
    root.querySelectorAll("select").forEach(function (el) { el.addEventListener("change", onGearChange); });
  }
  function onGearChange(e) {
    var card = e.target.closest(".gear-card");
    // 部位卡头部的「装备等级」：进 state.gear[slot].lv → 直接影响面板三围 → 战力
    if (e.target.classList.contains("slot-lv")) {
      var sl = (card && card.dataset.slot) || e.target.dataset.slot;
      state.gear[sl].lv = Math.max(0, Math.min(GEAR_LV_MAX, Math.trunc(num(e.target.value, 0))));
      gearDirty = true; renderGearState();
      collectLoadout();
      if (state.loadout.auto) derivePanel(); else { renderTiers(); compute(); }
      save(true);
      return;
    }
    var slot = card.dataset.slot;
    var side = e.target.dataset.side;
    var idx = Number(e.target.dataset.index);
    var row = card.querySelectorAll('.opt-row[data-index="' + idx + '"]')[0];
    var ty = row.querySelector('select.ty[data-side="' + side + '"]');
    var lv = row.querySelector('select.lv[data-side="' + side + '"]');
    // 类型变化 → 重算该行阶数下拉（文本带数值）；越界阶数自动收敛
    if (e.target.classList.contains("ty")) {
      lv.innerHTML = levelOptions(ty.value, Math.trunc(num(lv.value)));
    }
    state.gear[slot][side][idx] = { key: ty.value, level: Math.max(0, Math.min(15, Math.trunc(num(lv.value)))) };
    // 阶数下拉本体也带上档位配色（T12~14 蓝字 / T15 黑底白字），与游戏内显示一致
    lv.className = "lv " + tierCls(state.gear[slot][side][idx].level);
    // 当前装备被改动 → 标记「未保存」；同步刷新洗练面板左列的参照文本；
    // 并重算同部位各行的类型下拉（把被占用的重复类型置灰 / 释放）
    if (side === "before") {
      gearDirty = true; renderGearState(); syncTargetRef(slot, idx);
      if (e.target.classList.contains("ty")) refreshBeforeTypes(slot);
    }
    compute();
  }
  /** 只更新洗练面板某一行的「当前」参照文本，避免整块重绘打断编辑 */
  function syncTargetRef(slot, idx) {
    var card = $("gear-target").querySelector('[data-slot="' + slot + '"]');
    if (!card) return;
    var row = card.querySelectorAll('.opt-row[data-index="' + idx + '"]')[0];
    var ref = row && row.querySelector(".cur-ref");
    if (!ref) return;
    var b = state.gear[slot].before[idx], txt = curRefText(b);
    ref.textContent = txt;
    ref.title = "当前装备：" + txt;
    ref.className = "cur-ref " + tierCls(b.level) + (b.level ? "" : " empty");
  }

  /* ---------------- 计算与渲染 ---------------- */
  function compute() {
    collectPanel();
    if (!hasPanel()) {
      $("r-before").textContent = $("r-after").textContent = $("r-delta").textContent = "--";
      $("r-bp").textContent = $("r-totallevel").textContent = $("r-skillfactor").textContent = "--";
      $("r-gear-table").querySelector("tbody").innerHTML = "";
      $("r-lines").innerHTML = '<p class="hint">请先完成左侧练度参数填写，面板三围为自动推导，无需手工输入。</p>';
      $("unit-table").innerHTML = "";
      $("m-cur").textContent = $("m-slotcur").textContent = $("m-minmax").textContent = "--";
      $("m-pct").textContent = $("m-mean").textContent = $("m-vs").textContent = $("m-pctgain").textContent = "--";
      $("m-hist").innerHTML = "";
      $("c-per").textContent = $("c-lock").textContent = $("c-p").textContent = "--";
      $("c-rolls").textContent = $("c-exp").textContent = "--";
      setNotice("等待面板数据：请先在左侧选好角色与练度参数（面板三围会自动推导）", "");
      return;
    }
    // 面板已就绪：清掉初始化阶段留下的「等待面板数据」提示
    if ($("notice").textContent.indexOf("等待面板数据") === 0) setNotice("", "");
    var pf = profile();
    var res = C.compare(D.config, pf, D, flatGear("before"), flatGear("after"));

    $("r-before").textContent = fmt(res.beforePower.value);
    $("r-after").textContent = fmt(res.afterPower.value);
    var dEl = $("r-delta");
    dEl.textContent = sfmt(res.powerDelta);
    dEl.className = res.powerDelta > 0 ? "pos" : (res.powerDelta < 0 ? "neg" : "");
    $("r-bp").textContent = fmt(res.before.bp) + " → " + fmt(res.after.bp) + "（" + sfmt(res.bpDelta) + "）";
    $("r-totallevel").textContent = res.totalLevelBefore.toFixed(1) + " → " + res.totalLevelAfter.toFixed(1);
    $("r-skillfactor").textContent = "技能系数 " + res.afterPower.skillFactor.toFixed(4);

    // 部位归因
    $("r-gear-table").querySelector("tbody").innerHTML = res.gearRows.map(function (r) {
      return "<tr><td>" + SLOT_LABEL[r.slot] + "</td><td>" + sfmt(r.bpDelta) + "</td><td class='"
        + (r.powerDelta > 0 ? "pos" : r.powerDelta < 0 ? "neg" : "") + "'>" + sfmt(r.powerDelta) + "</td></tr>";
    }).join("");

    // 词条行明细
    var lines = [];
    C.SLOTS.forEach(function (slot) {
      for (var i = 0; i < 3; i++) {
        var b = res.before.slots[slot].rows[i], a = res.after.slots[slot].rows[i];
        var d = a.bp - b.bp;
        if (b.level === 0 && a.level === 0) continue;
        lines.push('<div class="line"><span class="nm">' + SLOT_LABEL[slot] + " 词条" + (i + 1) + "　" + esc(b.name) + " " + lvlText(b) + " → "
          + '<span class="' + tierCls(a.level) + '">' + esc(a.name) + " " + lvlText(a) + "</span></span><b class=\""
          + (d > 0 ? "pos" : d < 0 ? "neg" : "") + '">参数 ' + sfmt(d) + "</b></div>");
      }
    });
    $("r-lines").innerHTML = lines.length ? lines.join("") : '<p class="hint">尚未设置任何词条。</p>';

    // 每个部位脚的汇总（挂在洗练面板的部位卡上）
    C.SLOTS.forEach(function (slot) {
      var card = $("gear-target").querySelector('[data-slot="' + slot + '"]');
      var row = res.gearRows.filter(function (x) { return x.slot === slot; })[0];
      var b = card.querySelector("[data-gear-delta]");
      b.textContent = sfmt(row.bpDelta) + " / " + sfmt(row.powerDelta);
      b.className = row.powerDelta > 0 ? "pos" : row.powerDelta < 0 ? "neg" : "";
    });

    renderUnitTable(pf);
    renderSimTargets();
    renderSim(pf);
  }

  /* ---------------- 单价表 ---------------- */
  function renderUnitTable(pf) {
    var tbl = C.unitTable(D.config, pf, D);
    var head = "<thead><tr><th>词条类型</th>";
    for (var lv = 1; lv <= 15; lv++) head += '<th class="' + tierCls(lv) + '">' + lv + "</th>";
    head += "</tr></thead><tbody>";
    var body = tbl.map(function (g) {
      var tr = "<tr><td>" + esc(g.name) + (g.isElement ? " ★" : "") + "</td>";
      g.rows.forEach(function (r) {
        var vt = C.statValueText(D, g.key, r.level);
        tr += "<td>" + fmt(r.powerDelta) + (vt ? '<span class="sub ' + tierCls(r.level) + '">' + esc(vt) + "</span>" : "") + "</td>";
      });
      return tr + "</tr>";
    }).join("");
    $("unit-table").innerHTML = head + body + "</tbody>";
    $("unit-sub").textContent = "上排战力增量 / 下排词条数值";
  }

  /* ---------------- 洗练模拟（按部位 · 目标驱动） ----------------
   * 对照游戏实际：洗练是针对「一件装备」做的 —— 可以锁住满意的词条、只重洗其余。
   * 交互顺序与游戏一致：① 选部位 → ② 选操作类型 → ③ 给参与重洗的行设定「目标词条 + 目标阶数」
   *                      → ④ 输出「达成概率 / 期望次数 / 期望总消耗（含上锁一次性成本）」。
   * 达成口径（Q2 裁决）：目标行的类型命中 且 阶数 ≥ 目标阶数（洗得更高也算成）。 */
  function renderSimSlotOptions() {
    $("m-slot").innerHTML = C.SLOTS.map(function (s) {
      return '<option value="' + s + '"' + (s === state.sim.slot ? " selected" : "") + ">" + SLOT_LABEL[s] + "</option>";
    }).join("");
  }
  /** 该部位 3 行的目标。
   *  ⚠ **必须原地修改并返回「同一个数组引用」** —— 目标行的下拉 change 闭包持有这个引用，
   *  若每次都新建数组，闭包写进的是旧数组、`renderSim()` 读的是新数组，用户设定会被静默丢弃。
   *  autoKey / autoLevel 为 true 时该字段跟随「当前装备」，用户手动改过就置 false 保留其设定。 */
  function ensureTargets(slot) {
    if (!state.sim.target || typeof state.sim.target !== "object") state.sim.target = {};
    var arr = state.sim.target[slot];
    if (!Array.isArray(arr)) { arr = []; state.sim.target[slot] = arr; }
    while (arr.length > 3) arr.pop();
    for (var i = 0; i < 3; i++) {
      if (!arr[i] || typeof arr[i] !== "object") arr[i] = {};
      var t = arr[i];
      if (t.autoKey === undefined) t.autoKey = true;
      if (t.autoLevel === undefined) t.autoLevel = true;
      t.key = String(t.key || "");
      t.level = Math.max(0, Math.min(15, Math.trunc(num(t.level))));
      var b = state.gear[slot].before[i] || { key: "", level: 0 };
      if (t.autoKey) t.key = b.key || "";
      if (t.autoLevel) t.level = t.key ? Math.max(0, Math.min(15, Math.trunc(num(b.level)))) : 0;
      else if (!t.key) t.level = 0;
    }
    return arr;
  }
  /* 洗练概率模型（社区实测口径，非官方）：类型权重 优越/攻击/暴伤/防御 = 10，其余 = 12；
     阶数按段概率 60% / 35% / 5%，段内暂按平均占位（C.LEVEL_TABLE_AVG）。 */
  var TYPE_WNAMES = { "优越代码伤害": 10, "命中率": 12, "最大装弹数": 12, "攻击力": 10, "蓄力伤害": 12,
    "蓄力时间": 12, "暴击率": 12, "暴击伤害": 10, "防御力": 10 };
  function typeWeights() {
    var o = {};
    D.overload.forEach(function (g) { o[g.key] = TYPE_WNAMES[g.name] !== undefined ? TYPE_WNAMES[g.name] : 12; });
    return o;
  }
  /** 稳定哈希（FNV-1a 32 位）→ 模拟种子：同输入必得同输出，修掉「改任意词条分布就整体跳变」 */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** 3 行「目标词条 + 目标阶数」，带「参与重洗」勾选（不勾 = 锁定保留现状） */
  function renderSimTargets() {
    var el = $("m-target");
    if (!el) return;
    var slot = state.sim.slot;
    var act = (state.sim.active[slot] || [1, 1, 1]).slice(0, 3);
    var tgt = ensureTargets(slot);
    var isVal = state.sim.mode === "value";
    var html = "";
    for (var i = 0; i < 3; i++) {
      var b = state.gear[slot].before[i] || { key: "", level: 0 };
      var opts = '<option value="">空（无词条）</option>';
      D.overload.forEach(function (g) {
        opts += '<option value="' + esc(g.key) + '"' + (g.key === tgt[i].key ? " selected" : "") + ">" + esc(g.name) + "</option>";
      });
      html += '<div class="trow' + (act[i] ? " on" : "") + '" title="该部位现状：' + esc(curRefText(b)) + '">'
        + '<label class="tchk" title="勾选 = 参与重洗；不勾 = 锁定保留现状（锁定要额外付费）">'
        + '<input type="checkbox" data-act="' + i + '"' + (act[i] ? " checked" : "") + "><em>" + (i + 1) + "</em></label>"
        + '<select class="ty" data-tgt="ty" data-idx="' + i + '" aria-label="目标词条 ' + (i + 1) + '"'
        + (act[i] && !isVal ? "" : " disabled") + ">" + opts + "</select>"
        + '<select class="lv ' + tierCls(tgt[i].level) + '" data-tgt="lv" data-idx="' + i + '" aria-label="目标阶数 ' + (i + 1) + '"'
        + (act[i] ? "" : " disabled") + ">" + levelOptions(tgt[i].key, tgt[i].level) + "</select>"
        + "</div>";
    }
    el.innerHTML = html;

    function setRowEnabled(i, on) {
      var row = el.querySelectorAll(".trow")[i];
      if (!row) return;
      row.className = "trow" + (on ? " on" : "");
      row.querySelectorAll("select").forEach(function (s) {
        s.disabled = !on || (s.classList.contains("ty") && state.sim.mode === "value");
      });
    }
    el.querySelectorAll("input[data-act]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var i = Number(cb.dataset.act);
        if (!state.sim.active[slot]) state.sim.active[slot] = [1, 1, 1];
        state.sim.active[slot][i] = cb.checked ? 1 : 0;
        if (!state.sim.active[slot].some(Boolean)) {          // 不允许一条都不洗
          cb.checked = true; state.sim.active[slot][i] = 1;
          setNotice("至少要留 1 条词条参与重洗（不参与的行会被锁定，需要额外付费）", "error");
        }
        setRowEnabled(i, cb.checked);
        renderSim(profile()); save(true);
      });
    });
    el.querySelectorAll('select[data-tgt="ty"]').forEach(function (s) {
      s.addEventListener("change", function () {
        var i = Number(s.dataset.idx);
        tgt[i].key = s.value; tgt[i].autoKey = false;            // 手动设过 → 不再跟随「当前装备」
        if (!s.value) { tgt[i].level = 0; tgt[i].autoLevel = true; }
        var lv = el.querySelector('select[data-tgt="lv"][data-idx="' + i + '"]');
        lv.innerHTML = levelOptions(tgt[i].key, tgt[i].level);   // 类型换了 → 阶数文本的数值要跟着换
        lv.className = "lv " + tierCls(tgt[i].level);
        lv.disabled = !(state.sim.active[slot] || [1, 1, 1])[i];
        renderSim(profile()); save(true);
      });
    });
    el.querySelectorAll('select[data-tgt="lv"]').forEach(function (s) {
      s.addEventListener("change", function () {
        var i = Number(s.dataset.idx);
        tgt[i].level = Math.max(0, Math.min(15, Math.trunc(num(s.value))));
        tgt[i].autoLevel = false;                                // 手动设过 → 不再跟随「当前装备」
        s.className = "lv " + tierCls(tgt[i].level);
        renderSim(profile()); save(true);
      });
    });
  }
  var lastSimKey = null, lastSim = null;
  function renderSim(pf) {
    function blank() {
      $("m-cur").textContent = $("m-slotcur").textContent = $("m-minmax").textContent = "--";
      $("m-pct").textContent = $("m-mean").textContent = $("m-vs").textContent = $("m-pctgain").textContent = "--";
      $("m-hist").innerHTML = "";
      $("c-per").textContent = $("c-lock").textContent = $("c-p").textContent = "--";
      $("c-rolls").textContent = $("c-exp").textContent = "--";
      lastSimKey = null; lastSim = null;
    }
    if (!hasPanel()) { blank(); return; }
    var slot = state.sim.slot;
    var mode = state.sim.mode === "value" ? "value" : "change";
    var act = (state.sim.active[slot] || [1, 1, 1]).slice(0, 3);
    var tgt = ensureTargets(slot);
    var rolls = Math.max(100, Math.min(200000, Math.trunc(num($("m-rolls").value, 5000))));

    var base = C.gearSummary(D, flatGear("before"));
    var cur = C.calcBattlePower(D.config, pf, base.bp).value;
    var slotCur = base.slots[slot];

    // 参与重洗的行。「只洗数值」模式下「当前为空」的行没什么可洗，自动排除。
    var activeIdx = [];
    for (var i = 0; i < 3; i++) {
      if (!act[i]) continue;
      if (mode === "value" && !(slotCur.rows[i] && slotCur.rows[i].key)) continue;
      activeIdx.push(i);
    }
    // 锁定条数 = 本部位「不参与重洗」且当前有词条的行（空行没有可保住的值，不计费）
    var lockCount = 0;
    for (var j = 0; j < 3; j++) if (!act[j] && slotCur.rows[j] && slotCur.rows[j].level > 0) lockCount++;
    var perRoll = lockCount + 1;
    var lockCost = lockCount * (lockCount + 3) / 2;   // 锁到 1 条 2 颗 / 2 条 5 颗 / 3 条 9 颗

    $("m-cur").textContent = fmt(cur);
    $("m-slotcur").textContent = SLOT_LABEL[slot] + " 内部战力 " + fmt(slotCur.bp) + " · 等效总阶 " + slotCur.totalLevel.toFixed(1)
      + " · 重洗 " + activeIdx.length + " 条" + (lockCount ? " · 锁定 " + lockCount + " 条" : "");
    $("c-per").textContent = perRoll + " 颗" + (lockCount ? "（锁定 " + lockCount + " 条）" : "（不锁定）");
    $("c-lock").textContent = lockCount ? (lockCost + " 颗（锁 " + lockCount + " 条 · 解锁不退）") : "0 颗（无需锁定）";

    if (!activeIdx.length) {
      $("m-minmax").textContent = $("m-pct").textContent = $("m-mean").textContent = "—";
      $("m-vs").textContent = $("m-pctgain").textContent = "—";
      $("m-hist").innerHTML = "";
      $("c-p").textContent = "—（没有可洗的行）";
      $("c-rolls").textContent = "—";
      $("c-exp").textContent = "—";
      lastSimKey = null; lastSim = null;
      return;
    }

    var activeBP = 0;
    activeIdx.forEach(function (i) { activeBP += slotCur.rows[i].bp; });
    var keepBP = base.bp - activeBP;      // 锁定行 + 另外三个部位，保持现状

    // 目标：参与行都要有「类型 + 阶数」，才谈得上「达成」
    var target = [], tgtOK = true;
    activeIdx.forEach(function (i, k) {
      var t = tgt[i];
      if (!t || !t.key || !(t.level > 0)) { tgtOK = false; return; }
      target.push({ i: k, key: t.key, minLevel: t.level });
    });
    if (!tgtOK || !target.length) target = null;

    var curKeys = activeIdx.map(function (i) { return (slotCur.rows[i] && slotCur.rows[i].key) || ""; });
    /* 种子只由「模拟的随机部分」决定 —— 这样改其它部位 / 改面板时，抽样序列保持不变，
     * 分布只会整体平移、形状稳定，不会再出现「点一下词条数值就整体乱跳」。
     * 缓存键则用完整输入，保证该重算时一定重算。 */
    var seedKey = [state.loadout.rid, slot, mode, act.join(""), activeIdx.join(","),
      target ? target.map(function (t) { return t.key + "@" + t.minLevel; }).join(",") : "-",
      curKeys.join(","), rolls].join("|");
    var cacheKey = seedKey + "|" + keepBP
      + "|" + Math.round(num(pf.attack)) + "|" + Math.round(num(pf.hp)) + "|" + Math.round(num(pf.defense))
      + "|" + Math.round(num(pf.critRatio)) + "|" + Math.round(num(pf.critDamage))
      + "|" + Math.round(num(pf.skill1)) + "|" + Math.round(num(pf.skill2)) + "|" + Math.round(num(pf.burst))
      + "|" + Math.round(num(pf.extraBP));
    if (cacheKey !== lastSimKey) {
      lastSimKey = cacheKey;
      lastSim = C.simulate(D.config, pf, D, {
        pool: D.overload.map(function (g) { return g.key; }),
        rolls: rolls, slots: activeIdx.length, keepBP: keepBP,
        mode: mode, curKeys: curKeys, seed: hashStr(seedKey),
        typeWeights: typeWeights(), levelTable: C.LEVEL_TABLE_AVG,
        target: target
      });
    }
    var sim = lastSim;

    $("m-minmax").textContent = fmt(sim.min) + " / " + fmt(sim.max);
    $("m-pct").textContent = fmt(sim.p10) + " / " + fmt(sim.p50) + " / " + fmt(sim.p90);
    $("m-mean").textContent = fmt(Math.round(sim.mean));
    var dv = Math.round(sim.mean) - cur;
    var vsEl = $("m-vs");
    vsEl.textContent = sfmt(dv);
    vsEl.className = dv > 0 ? "pos" : dv < 0 ? "neg" : "";
    var gEl = $("m-pctgain");
    gEl.textContent = sfmt(sim.p10 - cur) + " / " + sfmt(sim.p50 - cur) + " / " + sfmt(sim.p90 - cur);
    gEl.className = (sim.p50 - cur) > 0 ? "pos" : (sim.p50 - cur) < 0 ? "neg" : "";
    // 直方图（20 桶，横轴 = 洗后战力，从最低到最高）
    var B = 20, lo = sim.min, hi = sim.max, span = (hi - lo) || 1;
    var buckets = new Array(B).fill(0);
    sim.values.forEach(function (v) { var k = Math.min(B - 1, Math.floor((v - lo) / span * B)); buckets[k]++; });
    var mx = Math.max.apply(null, buckets) || 1;
    $("m-hist").innerHTML = buckets.map(function (c) { return '<i style="height:' + Math.max(2, Math.round(c / mx * 100)) + 'px"></i>'; }).join("");

    /* ---- 定制模组消耗预估 ----
     * 游戏规则（nikke.gg 口径）：
     *   · 重洗一次   = 锁定条数 + 1 颗；
     *   · 点「锁定」本身也要付费，同样是「锁到 N 条 = N+1 颗」，解锁不退 →
     *     锁 1 条 2 颗 / 锁 2 条 2+3=5 颗 / 锁 3 条 2+3+4=9 颗（一次性）。
     *   → 期望总消耗 = 上锁一次性成本 + 每次重洗成本 × 期望次数（1/p）。 */
    var pEl = $("c-p");
    var pw = sim.p;
    if (pw === null || pw === undefined) {
      pEl.textContent = "—（请给参与行设目标）"; pEl.className = "";
      $("c-rolls").textContent = "—";
      $("c-exp").textContent = "—";
    } else if (pw > 0) {
      pEl.textContent = (pw * 100).toFixed(1) + "%";
      pEl.className = "pos";
      $("c-rolls").textContent = "≈ " + (1 / pw).toFixed(1) + " 次";
      var expCost = lockCost + perRoll / pw;
      $("c-exp").textContent = "≈ " + (expCost >= 100 ? fmt(Math.round(expCost)) : expCost.toFixed(1)) + " 颗";
    } else {
      pEl.textContent = "0.0%";
      pEl.className = "neg";
      $("c-rolls").textContent = "—";
      $("c-exp").textContent = "该目标在 " + fmt(rolls) + " 次抽样内未出现（几乎不可能达成）";
    }
  }

  /* ---------------- 标定 ---------------- */
  function calibrate() {
    collectPanel();
    if (!hasPanel()) { setNotice("请先填写攻击力 / 生命 / 防御力", "error"); return; }
    var target = window.prompt("输入游戏内当前显示的战力（整数）：", "");
    if (target === null) return;
    var t = Math.trunc(num(target));
    if (!t) { setNotice("战力需为正整数", "error"); return; }
    var beforeBP = C.gearSummary(D, flatGear("before")).bp;
    var r = C.calibrate(D.config, profile(), t, beforeBP);
    state.panel.extraBP = r.extraBP;
    renderPanel();
    setNotice(r.exact
      ? ("标定成功：附加效果战力 = " + r.extraBP + "（复算战力 " + fmt(r.achieved) + "）")
      : ("已按解析值填入 " + r.extraBP + "，但无法完全命中 " + fmt(t) + "（复算 " + fmt(r.achieved) + "）请核对面板三围。"),
      r.exact ? "ok" : "error");
    compute();
    save(true);
  }

  /* ---------------- 导入导出 ---------------- */
  function exportJson() {
    collectPanel();
    var blob = new Blob([JSON.stringify({ schemaVersion: 1, dataVersion: D.generatedAt, config: state }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "NIKKE战力计算配置.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(String(reader.result || "{}"));
        var cfg = raw.config || raw;
        localStorage.setItem(KEY, JSON.stringify(cfg));
        load(); renderAll(); save(true);
        setNotice("导入成功", "ok");
      } catch (e) { setNotice("导入失败：" + e.message, "error"); }
    };
    reader.readAsText(file, "utf-8");
  }

  /* ---------------- 初始化 ---------------- */
  function renderAll() {
    renderPanel();
    renderGear();
    renderGearState();
    renderSimSlotOptions();
    renderSimTargets();
    $("m-rolls").value = state.sim.rolls;
    $("m-mode").value = state.sim.mode || "change";
    compute();
  }
  /* ---------------- 示例数据（?demo=1）---------------- */
  function keyOf(name) {
    var g = D.overload.filter(function (x) { return x.name === name; })[0];
    return g ? g.key : "";
  }
  function applyDemo() {
    function opt(name, lv) { return { key: keyOf(name), level: lv }; }
    var d = defaults();
    d.char = "拉毗：小红帽";
    d.mode = "loadout";
    d.loadout = { rid: 16, level: 492, bt: 10, attr: 40,
      cubeId: 1000301, cubeLv: 15, coll: "SR", collLv: 15, rp: 100, rc: 100, rk: 100, corpBonus: false, auto: true };
    d.gear.head.before = [opt("优越代码伤害", 15), opt("攻击力", 12), opt("暴击伤害", 8)];
    d.gear.body.before = [opt("攻击力", 14), opt("最大装弹数", 10), opt("防御力", 5)];
    d.gear.arms.before = [opt("攻击力", 13), opt("命中率", 9), opt("蓄力伤害", 6)];
    d.gear.legs.before = [opt("攻击力", 11), opt("优越代码伤害", 15), opt("暴击率", 4)];
    d.gear.head.after = [opt("优越代码伤害", 15), opt("攻击力", 15), opt("暴击伤害", 12)];
    d.gear.body.after = [opt("攻击力", 15), opt("最大装弹数", 14), opt("防御力", 5)];
    d.gear.arms.after = [opt("攻击力", 15), opt("命中率", 13), opt("蓄力伤害", 6)];
    d.gear.legs.after = [opt("攻击力", 15), opt("优越代码伤害", 15), opt("暴击率", 12)];
    d.gearByChar = { "16": clone(d.gear) };   // 装备词条按角色记录，示例角色 rid=16
    return d;
  }

  /* ---------------- 云端同步（同源 iframe 内直连父页面的账号同步模块） ----------------
   * 本页在「工具箱」里是以同源 iframe 打开的，父页面（资源规划计算器）的 js/sync.js 通过
   * window.__nikkeSync 暴露了账号状态与「快速上传」。因此这里不需要重复一套登录 UI：
   *   · 已登录 → 一键把本 Tab 的练度 + 整套装备词条（localStorage: KEY）推到云端；
   *   · 未登录 → 唤起父页面账号面板完成登录（面板会自动定位到「战力计算Beta」卡片）；
   *   · 单独打开本页（没有父页面接口）→ 两个按钮保持隐藏，不误导用户。
   */
  var CLOUD_FID = "combat_power_beta";

  function cloudApi() {
    try {
      if (window.parent && window.parent !== window && window.parent.__nikkeSync) return window.parent.__nikkeSync;
    } catch (e) { /* 跨域等异常：视为不可用 */ }
    return null;
  }
  function cloudStatus(api) {
    try { return (api && api.status) ? api.status() : null; } catch (e) { return null; }
  }

  function initCloudSync() {
    var api = cloudApi();
    var btnQuick = $("btn-cloud-sync");
    var btnAcct = $("btn-account");
    if (!btnQuick && !btnAcct) return;
    if (!api) {                              // 独立打开：本页不适用云同步入口
      if (btnQuick) btnQuick.hidden = true;
      if (btnAcct) btnAcct.hidden = true;
      return;
    }
    if (btnQuick) btnQuick.hidden = false;
    if (btnAcct) btnAcct.hidden = false;

    function paint() {
      var st = cloudStatus(api);
      var on = !!(st && st.loggedIn);
      if (btnQuick) {
        btnQuick.dataset.state = on ? "in" : "out";
        btnQuick.title = on
          ? "把本页的角色练度 + 整套装备词条一键同步到云端" + (st.email ? "（" + st.email + "）" : "")
          : "尚未登录：点击后打开账号面板，登录后可一键同步";
      }
      if (btnAcct) btnAcct.title = on ? "打开账号云同步面板（可下载覆盖 / 查看云端时间）" : "登录并管理云端数据";
    }

    paint();
    window.addEventListener("focus", paint);
    document.addEventListener("visibilitychange", paint);

    if (btnQuick) btnQuick.addEventListener("click", function () {
      var st = cloudStatus(api);
      if (!st || !st.configured) { setNotice("云同步暂不可用（组件未就绪或网络受限）", "error"); return; }
      if (!st.loggedIn) {
        api.open(CLOUD_FID);                 // 打开面板走登录；面板会高亮本功能卡片
        setNotice("请先登录账号，登录后点「上传本地」即可同步", "");
        return;
      }
      setNotice("正在同步到云端…", "");
      // 先把「当前页面所见」静默落盘再上传：本页若从未交互过，localStorage 里还没有存档，
      // 直接上传会得到「本地无数据」。这样点一下 = 同步当前状态，不用先手动点「保存」。
      try { save(true); } catch (e) { /* 落盘失败也让上传按现有存档走，由 reason=empty 兜底 */ }
      var p = api.quickUpload(CLOUD_FID);
      if (p && typeof p.then === "function") {
        p.then(function (r) {
          paint();
          if (r && r.ok) setNotice("已同步到云端 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false }), "ok");
          else if (r && (r.reason === "nologin" || r.reason === "noconfig" || r.reason === "noclient")) setNotice("未同步：请在弹出的账号面板中完成登录后重试", "error");
          else if (r && r.reason === "empty") setNotice("本机暂无数据可同步（存档为空）", "error");
          else setNotice("同步失败：" + ((r && r.message) || "未知错误"), "error");
        });
      }
    });

    if (btnAcct) btnAcct.addEventListener("click", function () { api.open(CLOUD_FID); });
  }

  function init() {
    window.addEventListener("error", function (e) {
      setNotice("运行错误：" + e.message + " @ " + String(e.filename || "").split("/").pop() + ":" + e.lineno, "error");
    });
    if (!D || !C || !P) { setNotice("数据或内核加载失败", "error"); return; }
    load();
    if (/[?&]demo=1/.test(window.location.search)) state = applyDemo();
    decorateRoster();       // 角色目录必须在 load() 之后装饰（存档里选中的角色得能命中）
    renderAll();
    setMode(state.mode || "loadout");
    if (/[?&]demo=1/.test(window.location.search)) setNotice("已载入示例（拉毗：小红帽 · 同步器 492 · SR15 收藏 · 魔方15）—— 左上「角色」可切换全部 " + D.roster.length + " 名角色，改中间栏词条即可看战力变化", "ok");

    panelFields().forEach(function (p) { $(p[1]).addEventListener("input", compute); });

    // 练度模式联动
    ["l-level", "l-attr", "l-cubelv", "l-colllv", "l-rp", "l-rc", "l-rk", "l-cube", "l-coll", "l-bt", "l-corpbonus"].forEach(function (id) {
      $(id).addEventListener("input", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); else { renderTiers(); compute(); } save(true); });
      $(id).addEventListener("change", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); else { renderTiers(); compute(); } save(true); });
    });
    $("l-auto").addEventListener("change", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); });
    $("btn-derive").addEventListener("click", function () { collectLoadout(); derivePanel(); save(true); setNotice("已按练度参数重新推导面板", "ok"); });
    // 整合式角色搜索：输入即筛 → 浮层点选。#char-input 只作状态载体，change 仍触发切角色
    $("char-input").addEventListener("change", onCharPicked);
    var si = $("char-search"), pop = $("char-pop");
    if (si) {
      si.addEventListener("focus", openPicker);
      si.addEventListener("click", openPicker);
      si.addEventListener("input", function () { renderPicker(); openPicker(); });
      si.addEventListener("keydown", pickerKey);
    }
    if (pop) pop.addEventListener("mousedown", function (e) { e.preventDefault(); });
    document.addEventListener("mousedown", function (e) {
      var pk = $("char-picker");
      if (pk && !pk.contains(e.target)) closePicker();
    });
    var scopeBox = $("char-scope");
    if (scopeBox) Array.prototype.forEach.call(scopeBox.querySelectorAll("input"), function (r) {
      r.addEventListener("change", function () {
        state.scope = r.value; save(true); renderPicker(); openPicker();
      });
    });
    var sw = $("mode-switch");
    if (sw) Array.prototype.forEach.call(sw.querySelectorAll("input"), function (r) {
      r.addEventListener("change", function () { collectLoadout(); setMode(r.value); save(true); });
    });

    $("btn-copy-before").addEventListener("click", function () {
      C.SLOTS.forEach(function (s) { state.gear[s].after = clone(state.gear[s].before); });
      renderGear(); compute(); save(true); setNotice("已把「当前装备」复制到「洗练目标」", "ok");
    });
    /* ① 保存「当前装备词条」记录（每角色一套，随存档 / 云同步一起走） */
    $("btn-save-gear").addEventListener("click", function () {
      collectLoadout();
      gearDirty = false;
      save(false);
      renderGearState();
      setNotice("已保存「" + (state.char || "当前角色") + "」的当前装备（4 部位的装备等级 + 3 条词条，按角色分别记录）", "ok");
    });
    $("btn-clear-gear").addEventListener("click", function () {
      if (!window.confirm("清空「" + (state.char || "当前角色") + "」的整套装备？装备等级会恢复为满级 5，词条清空。")) return;
      state.gear = blankGear(); gearDirty = false;
      renderGear(); derivePanel(); renderGearState(); save(true);
      setNotice("已清空当前角色的装备（词条清空，装备等级回到 5）", "ok");
    });
    /* 洗练满意 → 把「洗练目标」固化为「当前装备」并保存（装备套装随存档一起落盘） */
    $("btn-commit-after").addEventListener("click", function () {
      if (!hasPanel()) { setNotice("请先在左侧选好角色与练度参数（面板三围会自动推导）", "error"); return; }
      if (!window.confirm("把「洗练目标」覆盖为「当前装备」并保存？原「当前装备」词条将被替换。")) return;
      C.SLOTS.forEach(function (s) { state.gear[s].before = clone(state.gear[s].after); });
      gearDirty = false;
      renderGear(); derivePanel(); renderGearState(); save(true);
      setNotice("已用洗练结果覆盖「当前装备」——练度 + 整套装备（等级 + 词条）已一并保存", "ok");
    });
    $("btn-save").addEventListener("click", function () { save(false); });
    $("btn-load").addEventListener("click", function () { load(); renderAll(); setMode(state.mode || "loadout"); setNotice("已读取本机保存", "ok"); });
    $("btn-export").addEventListener("click", exportJson);
    $("btn-import").addEventListener("click", function () { $("file-import").click(); });
    $("file-import").addEventListener("change", function () { if (this.files && this.files[0]) importJson(this.files[0]); this.value = ""; });
    $("btn-reset").addEventListener("click", function () {
      if (!window.confirm("清空当前全部输入并重置？")) return;
      localStorage.removeItem(KEY); state = defaults(); gearDirty = false;
      renderAll(); setMode(state.mode); setNotice("已重置", "ok");
    });
    $("btn-calibrate").addEventListener("click", calibrate);

    /* 洗练模拟（按部位 · 目标驱动）：切部位 → 重绘该部位的目标行 → 重算；操作类型同理 */
    $("m-slot").addEventListener("change", function () {
      state.sim.slot = C.SLOTS.indexOf($("m-slot").value) >= 0 ? $("m-slot").value : "head";
      collectPanel(); renderSimTargets(); renderSim(profile()); save(true);
    });
    $("m-mode").addEventListener("change", function () {
      state.sim.mode = $("m-mode").value === "value" ? "value" : "change";
      renderSimTargets(); renderSim(profile()); save(true);
    });
    $("m-rolls").addEventListener("input", function () {
      state.sim.rolls = num($("m-rolls").value, 5000);
      collectPanel(); renderSim(profile());
    });

    var s = D.sources || {};
    $("src-line").innerHTML = "数据版本 " + esc(D.generatedAt) + "（" + esc(D.sourcePack || "") + "） · 角色 " + D.roster.length
      + " 人 · 词条 " + D.overload.length + " 类 × 15 阶 · 魔方 " + D.cubes.length + " · 属性曲线组 "
      + Object.keys(D.curves).length + " · CharacterStatTable <code>" + esc((s.CharacterStatTable || "").slice(0, 8))
      + "</code> · ConfigGameTable <code>" + esc((s.ConfigGameTable || "").slice(0, 8)) + "</code>";

    initCloudSync();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
