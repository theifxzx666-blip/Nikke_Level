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
  function blankGear() {
    var g = {};
    C.SLOTS.forEach(function (s) {
      g[s] = { lv: GEAR_LV_MAX, before: [clone(EMPTY), clone(EMPTY), clone(EMPTY)], after: [clone(EMPTY), clone(EMPTY), clone(EMPTY)] };
    });
    return g;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** 清洗任意来源的装备结构（存档 / byChar）为规范形状，缺项补空；lv = 该部位的装备等级 0~5 */
  function normalizeGear(g) {
    var out = blankGear();
    C.SLOTS.forEach(function (s) {
      if (!g || !g[s]) return;
      out[s].lv = Math.max(0, Math.min(GEAR_LV_MAX, Math.trunc(num(g[s].lv, GEAR_LV_MAX))));
      ["before", "after"].forEach(function (side) {
        ((g[s] && g[s][side]) || []).slice(0, 3).forEach(function (row, i) {
          if (!row) return;
          out[s][side][i] = { key: String(row.key || ""), level: Math.max(0, Math.min(15, Math.trunc(num(row.level)))) };
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
      panel: { attack: "", hp: "", defense: "", critRate: 15, critDamage: 150, extraBP: "", skill1: 10, skill2: 10, burst: 10 },
      gear: blankGear(),
      sim: { rolls: 5000, slots: 12, min: 1, max: 15, pool: D.overload.map(function (g) { return g.key; }) }
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
        d.sim.rolls = num(raw.sim.rolls, d.sim.rolls);
        d.sim.slots = num(raw.sim.slots, d.sim.slots);
        d.sim.min = num(raw.sim.min, d.sim.min);
        d.sim.max = num(raw.sim.max, d.sim.max);
        if (Array.isArray(raw.sim.pool) && raw.sim.pool.length) d.sim.pool = raw.sim.pool;
      }
      if (raw.mode) d.mode = raw.mode;
      if (raw.byChar && typeof raw.byChar === "object") d.byChar = raw.byChar;
      if (raw.gearByChar && typeof raw.gearByChar === "object") d.gearByChar = raw.gearByChar;
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
      $("char-meta").textContent = "未在角色目录中匹配到（请从下拉里选）";
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

  /* ---------------- 角色选择器 ----------------
   * 原实现是 <input list=datalist>：输入框被预填成「拉毗：小红帽」，浏览器按当前值过滤候选，
   * 点开只看到 1 条，等于没法选人。改为「筛选框 + 原生 <select>（按企业分组、拼音排序）」，
   * 当前角色永远保留在列表里，切人后立即用新 rid 重推面板。 */
  var CORP_ORDER = ["极乐净土", "米西利斯", "泰特拉", "朝圣者", "反常"];
  /** 角色名前的稀有度标记（R/SR/SSR），让下拉里一眼可辨 */
  function rarTag(r) { return "[" + (RARITY[r && r.rarity] || "?") + "] "; }
  function rosterSorted() {
    return D.roster.slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
    });
  }
  /** 重建角色下拉；kw 为筛选关键字（子串匹配，空=全量）。返回匹配人数。 */
  function buildCharOptions(kw) {
    var sel = $("char-input");
    kw = String(kw || "").trim();
    var keep = (sel.value || state.char || "").trim();
    var list = rosterSorted();
    if (kw) list = list.filter(function (r) { return String(r.name).indexOf(kw) >= 0; });

    var pinned = null;
    for (var i = 0; i < D.roster.length; i++) {
      if (D.roster[i].name === keep) { pinned = D.roster[i]; break; }
    }
    var shown = pinned && list.some(function (r) { return r.rid === pinned.rid; });

    var groups = {};
    list.forEach(function (r) {
      var c = CORP[r.corp] || ("企业" + r.corp);
      (groups[c] = groups[c] || []).push(r);
    });

    var h = "";
    if (pinned && !shown) {
      h += '<optgroup label="当前角色"><option value="' + esc(pinned.name) + '">'
        + esc(rarTag(pinned) + pinned.name) + "</option></optgroup>";
    }
    CORP_ORDER.concat(Object.keys(groups).filter(function (c) { return CORP_ORDER.indexOf(c) < 0; }))
      .forEach(function (c) {
        var arr = groups[c];
        if (!arr || !arr.length) return;
        h += '<optgroup label="' + esc(c) + "（" + arr.length + '）">'
          + arr.map(function (r) { return '<option value="' + esc(r.name) + '">' + esc(rarTag(r) + r.name) + "</option>"; }).join("")
          + "</optgroup>";
      });
    if (!h) h = '<option value="">（无匹配角色）</option>';

    sel.innerHTML = h;
    if (pinned) sel.value = pinned.name;

    var el = $("char-count");
    if (el) el.textContent = kw ? (list.length + " / " + D.roster.length + " 名") : (D.roster.length + " 名角色");
    return list.length;
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
    save(true);
  }

  /* ---------------- 练度模式 ---------------- */
  function renderLoadout() {
    var lo = state.loadout;
    var sel = $("char-input");
    if (!sel.options.length) buildCharOptions("");
    sel.value = state.char || "";
    if (!sel.value && sel.options.length) { sel.selectedIndex = 0; state.char = sel.value; lo.rid = currentRid(); }
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
  function renderTiers() {
    var lo = loadoutOf();
    var lv = [lo.level].concat(tierLevels(lo.level).slice(1));
    var res = P.tierPreview(D, Object.assign({}, lo, {
      skill1: Math.trunc(num(state.panel.skill1, 1)), skill2: Math.trunc(num(state.panel.skill2, 1)), burst: Math.trunc(num(state.panel.burst, 1))
    }), D.config, C, lv);
    $("tier-table").innerHTML = "<thead><tr><th>同步器</th><th>攻击</th><th>生命</th><th>防御</th><th>战力</th></tr></thead><tbody>"
      + res.map(function (r) {
        return "<tr><td>" + r.level + (r.level === lo.level ? " <span class=\"tag\">当前</span>" : "") + "</td><td>"
          + fmt(r.atk) + "</td><td>" + fmt(r.hp) + "</td><td>" + fmt(r.def) + "</td><td><b>" + fmt(r.bp) + "</b></td></tr>";
      }).join("") + "</tbody>";
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
  function typeOptions(selected) {
    var h = '<option value="">空（无词条）</option>';
    D.overload.forEach(function (g) {
      h += '<option value="' + esc(g.key) + '"' + (g.key === selected ? " selected" : "") + '>' + esc(g.name) + "</option>";
    });
    return h;
  }
  /** 阶数下拉：选项文本「N 阶 · X.XX%」；数值 = 静态表 FunctionValue ÷ 100（游戏内显示口径） */
  function levelOptions(key, selected) {
    var sel = Math.max(0, Math.min(15, Math.trunc(num(selected))));
    var h = '<option value="0"' + (sel === 0 ? " selected" : "") + ">— 无阶数</option>";
    if (!key) return h;
    for (var lv = 1; lv <= 15; lv++) {
      var vt = C.statValueText(D, key, lv);
      h += '<option value="' + lv + '"' + (lv === sel ? " selected" : "") + ">" + lv + " 阶 · " + esc(vt) + "</option>";
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
  /* ① 当前装备：整块可编辑，是洗练的锚点记录（每部位 = 装备等级 + 3 条词条） */
  function renderGearCurrent() {
    var html = "";
    C.SLOTS.forEach(function (slot) {
      html += '<article class="gear-card" data-grid="before" data-slot="' + slot + '"><h3>'
        + SLOT_LABEL[slot] + gearLvControl(slot, state.gear[slot].lv) + "</h3>";
      for (var i = 0; i < 3; i++) {
        var b = state.gear[slot].before[i];
        html += '<div class="opt-row" data-index="' + i + '"><div class="opt-idx" data-label>' + (i + 1) + "</div>"
          + '<div class="opt-side solo before">'
          + '<select class="ty" data-side="before" data-index="' + i + '" aria-label="当前装备词条类型">' + typeOptions(b.key) + "</select>"
          + '<select class="lv" data-side="before" data-index="' + i + '" aria-label="当前装备阶数">' + levelOptions(b.key, b.level) + "</select>"
          + "</div></div>";
      }
      html += "</article>";
    });
    $("gear-current").innerHTML = html;
    bindGearSelects($("gear-current"));
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
          + '<span class="cur-ref' + (b.level ? "" : " empty") + '" title="当前装备：' + esc(ref) + '">' + esc(ref) + "</span>"
          + '<span class="arrow">→</span>'
          + '<div class="opt-side solo after">'
          + '<select class="ty" data-side="after" data-index="' + i + '" aria-label="洗练目标词条类型">' + typeOptions(a.key) + "</select>"
          + '<select class="lv" data-side="after" data-index="' + i + '" aria-label="洗练目标阶数">' + levelOptions(a.key, a.level) + "</select>"
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
    // 当前装备被改动 → 标记「未保存」，并同步刷新洗练面板左列的参照文本
    if (side === "before") {
      gearDirty = true; renderGearState(); syncTargetRef(slot, idx);
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
    ref.className = "cur-ref" + (b.level ? "" : " empty");
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
      $("m-minmax").textContent = $("m-pct").textContent = $("m-mean").textContent = $("m-vs").textContent = "--";
      $("m-hist").innerHTML = "";
      $("s-cur").textContent = $("s-tgt").textContent = $("s-delta").textContent = "--";
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
    $("r-skillfactor").textContent = res.afterPower.skillFactor.toFixed(4);

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
        lines.push('<div class="line"><span class="nm">' + SLOT_LABEL[slot] + " 词条" + (i + 1) + "　" + esc(b.name) + " " + lvlText(b) + " → " + esc(a.name) + " " + lvlText(a) + "</span><b class=\""
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
    renderSim(pf);
    renderSingle(pf);
  }

  /* ---------------- 单价表 ---------------- */
  function renderUnitTable(pf) {
    var tbl = C.unitTable(D.config, pf, D);
    var head = "<thead><tr><th>词条类型</th>";
    for (var lv = 1; lv <= 15; lv++) head += "<th>" + lv + "</th>";
    head += "</tr></thead><tbody>";
    var body = tbl.map(function (g) {
      var tr = "<tr><td>" + esc(g.name) + (g.isElement ? " ★" : "") + "</td>";
      g.rows.forEach(function (r) {
        var vt = C.statValueText(D, g.key, r.level);
        tr += "<td>" + fmt(r.powerDelta) + (vt ? '<span class="sub">' + esc(vt) + "</span>" : "") + "</td>";
      });
      return tr + "</tr>";
    }).join("");
    $("unit-table").innerHTML = head + body + "</tbody>";
    $("unit-sub").textContent = "上排战力增量 / 下排词条数值";
  }

  /* ---------------- 单条试算 ---------------- */
  function renderSingleOptions(preferLevel) {
    $("s-slot").innerHTML = C.SLOTS.map(function (s) { return '<option value="' + s + '">' + SLOT_LABEL[s] + "</option>"; }).join("");
    $("s-index").innerHTML = [1, 2, 3].map(function (i) { return '<option value="' + (i - 1) + '">词条 ' + i + "</option>"; }).join("");
    $("s-type").innerHTML = '<option value="">空（无词条）</option>' + D.overload.map(function (g) { return '<option value="' + esc(g.key) + '">' + esc(g.name) + "</option>"; }).join("");
    var lv = preferLevel == null ? 1 : Math.max(0, Math.min(15, Math.trunc(num(preferLevel, 1))));
    $("s-level").innerHTML = levelOptions($("s-type").value, lv);
  }
  function oneText(r) {
    return r.level ? (r.name + " " + r.level + " 阶 " + (r.valueText || "") + "（内部战力 " + fmt(r.bp) + "）") : (r.name + "（无词条）");
  }
  function renderSingle(pf) {
    var slot = $("s-slot").value || "head";
    var idx = Number($("s-index").value || 0);
    var key = $("s-type").value;
    var lv = Math.max(0, Math.min(15, Math.trunc(num($("s-level").value))));
    var r = C.singleSwap(D.config, pf, D, flatGear("before"), slot, idx, key, lv);
    $("s-cur").textContent = oneText(r.current);
    $("s-tgt").textContent = oneText(r.target);
    var el = $("s-delta");
    el.textContent = sfmt(r.powerDelta) + "　(" + fmt(r.basePower) + " → " + fmt(r.afterPower) + ")";
    el.className = r.powerDelta > 0 ? "pos" : r.powerDelta < 0 ? "neg" : "";
  }

  /* ---------------- 洗练模拟 ---------------- */
  function renderPool() {
    $("m-pool").innerHTML = D.overload.map(function (g) {
      var on = state.sim.pool.indexOf(g.key) >= 0;
      return '<label><input type="checkbox" value="' + esc(g.key) + '"' + (on ? " checked" : "") + ">" + esc(g.name) + "</label>";
    }).join("");
    $("m-pool").querySelectorAll("input").forEach(function (cb) {
      cb.addEventListener("change", function () {
        state.sim.pool = Array.prototype.slice.call($("m-pool").querySelectorAll("input:checked")).map(function (x) { return x.value; });
        renderSim(profile());
      });
    });
  }
  function renderSim(pf) {
    if (!hasPanel()) { $("m-minmax").textContent = $("m-pct").textContent = $("m-mean").textContent = $("m-vs").textContent = "--"; $("m-hist").innerHTML = ""; return; }
    var pool = state.sim.pool.length ? state.sim.pool : D.overload.map(function (g) { return g.key; });
    var rolls = Math.max(100, Math.min(200000, Math.trunc(num($("m-rolls").value, 5000))));
    var slots = Math.max(1, Math.min(12, Math.trunc(num($("m-slots").value, 12))));
    var minL = Math.max(1, Math.min(15, Math.trunc(num($("m-min").value, 1))));
    var maxL = Math.max(minL, Math.min(15, Math.trunc(num($("m-max").value, 15))));
    // 未参与洗练的部位保留「洗前」词条的内部战力
    var keepAll = C.gearSummary(D, flatGear("before")).bp;
    var sim = C.simulate(D.config, pf, D, { pool: pool, rolls: rolls, slots: slots, minLevel: minL, maxLevel: maxL, keepBP: keepAll });
    $("m-minmax").textContent = fmt(sim.min) + " / " + fmt(sim.max);
    $("m-pct").textContent = fmt(sim.p10) + " / " + fmt(sim.p50) + " / " + fmt(sim.p90);
    $("m-mean").textContent = fmt(Math.round(sim.mean));
    var cur = C.calcBattlePower(D.config, pf, keepAll).value;
    var dv = Math.round(sim.mean) - cur;
    var el = $("m-vs");
    el.textContent = sfmt(dv);
    el.className = dv > 0 ? "pos" : dv < 0 ? "neg" : "";
    // 直方图（20 桶）
    var B = 20, lo = sim.min, hi = sim.max, span = (hi - lo) || 1;
    var buckets = new Array(B).fill(0);
    sim.values.forEach(function (v) { var i = Math.min(B - 1, Math.floor((v - lo) / span * B)); buckets[i]++; });
    var m = Math.max.apply(null, buckets) || 1;
    $("m-hist").innerHTML = buckets.map(function (c) { return '<i style="height:' + Math.max(2, Math.round(c / m * 66)) + 'px"></i>'; }).join("");
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
    renderSingleOptions();
    $("m-rolls").value = state.sim.rolls;
    $("m-slots").value = state.sim.slots;
    $("m-min").value = state.sim.min;
    $("m-max").value = state.sim.max;
    renderPool();
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
    d.gear.head.before = [opt("优越代码伤害", 5), opt("攻击力", 3), opt("暴击伤害", 2)];
    d.gear.body.before = [opt("攻击力", 5), opt("暴击率", 3), opt("防御力", 1)];
    d.gear.arms.before = [opt("最大装弹数", 5), opt("攻击力", 2), opt("命中率", 2)];
    d.gear.legs.before = [opt("优越代码伤害", 3), opt("攻击力", 4), opt("蓄力伤害", 2)];
    d.gear.head.after = [opt("攻击力", 5), opt("攻击力", 3), opt("暴击伤害", 2)];
    d.gear.body.after = [opt("攻击力", 5), opt("暴击率", 5), opt("防御力", 1)];
    d.gear.arms.after = [opt("最大装弹数", 5), opt("攻击力", 5), opt("命中率", 2)];
    d.gear.legs.after = [opt("优越代码伤害", 3), opt("攻击力", 4), opt("优越代码伤害", 5)];
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
    buildCharOptions("");   // 角色下拉必须在 load() 之后建，否则选不中存档里的角色
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
    $("char-input").addEventListener("change", onCharPicked);
    $("char-input").addEventListener("input", onCharPicked);
    $("char-search").addEventListener("input", function () { buildCharOptions($("char-search").value); });
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

    ["s-slot", "s-index"].forEach(function (id) {
      $(id).addEventListener("change", function () { collectPanel(); renderSingle(profile()); });
    });
    $("s-type").addEventListener("change", function () {
      $("s-level").innerHTML = levelOptions($("s-type").value, 1); // 换类型 → 阶数下拉整体重算（文本带数值）
      collectPanel(); renderSingle(profile());
    });
    $("s-level").addEventListener("change", function () { collectPanel(); renderSingle(profile()); });
    ["m-rolls", "m-slots", "m-min", "m-max"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        state.sim.rolls = num($("m-rolls").value, 5000);
        state.sim.slots = num($("m-slots").value, 12);
        state.sim.min = num($("m-min").value, 1);
        state.sim.max = num($("m-max").value, 15);
        collectPanel(); renderSim(profile());
      });
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
