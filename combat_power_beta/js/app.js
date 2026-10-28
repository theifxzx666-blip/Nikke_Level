/* app.js — NIKKE 战力计算器 前端 */
(function () {
  "use strict";
  var D = window.NIKKE_POWER_DATA;
  var C = window.NikkePowerCore;
  var P = window.NikkePanel;
  var PK = window.NikkePinkuro;
  var R = window.NikkeReroll;   // 洗词条概率 / 消耗模型（js/reroll.js）
  var KEY = "nikke_power_calc_v2";
  /* Pinkuro Key 单独一个 localStorage 键：**不放进 state**，因此不会出现在「导出 JSON」和云同步里 */
  var PKEY = "nikke_pinkuro_key";
  /* 可选公网中转地址（同样不进 state）。留空则走下面的本机转发 */
  var PRELAY = "nikke_pinkuro_relay";
  /**
   * 内置公网中转（项目自建）。
   * 一旦在这里填上地址，页面就「只让用户填 Key」：
   *   - 不再显示「中转地址」输入行，用户看不到也不需要理解这一层；
   *   - 所有访问者默认走这个中转，手机 / 别的电脑 / 别人的电脑都直接可用；
   *   - 站长（本机开发）仍可在地址后加 ?relay=http://127.0.0.1:8785 覆盖回本机通道。
   * 留空 = 维持现状（默认本机转发，需自己部署）。
   */
  var PRELAY_DEFAULT = "https://nikke-lv-relay.netlify.app/api/relay";
  /* 本机转发服务（仓库根目录 pinkuro_server.py）。远端接口无 CORS 头，浏览器不能直连 */
  var PAGENT = "http://127.0.0.1:8785";
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
      /* 账号级研究表（Pinkuro 同步写入）：企业研究 corp{1..7} / 职业研究 cls{1,2,3}。
         auto = true 时，切角色会按该角色的企业与职业自动取对应等级填入 l-rk / l-rc。 */
      account: { enabled: false, auto: true, qq: null, level: null, corp: {}, cls: {}, syncedAt: null },
      fav: [],              // 收藏角色 rid 列表（检索区「★ 收藏」范围用）
      scope: "all",         // 角色检索范围：all | fav | recorded
      panel: { attack: "", hp: "", defense: "", critRate: 15, critDamage: 150, extraBP: "", skill1: 10, skill2: 10, burst: 10 },
      gear: blankGear(),
      /* 洗练模拟（按部位 · 目标驱动）：给某一件装备设 1~3 条目标词条，算「洗到目标要多少石头」。
         mode = auto（先洗词条出名 → 再洗数值拉档位，实际最省）｜change（只洗词条）｜value（只洗数值）；
         rule = cn（国服旧规则）｜global（国际服新规则，排除与当前相同的档位后重抽）；
         target[部位][行] = { key, level }，level 是「最低档数」（≥ 口径）。 */
      sim: {
        slot: "head",
        mode: "auto",
        rule: "cn",
        rolls: 4000,
        target: {}
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
        d.sim.rolls = Math.max(200, Math.min(200000, Math.trunc(num(raw.sim.rolls, d.sim.rolls))));
        // mode 取值集变了（旧版只有 change / value，勾选锁定那套已废弃）→ 只认白名单
        if (raw.sim.mode === "change" || raw.sim.mode === "value") d.sim.mode = raw.sim.mode;
        if (raw.sim.rule === "global") d.sim.rule = "global";
        /* 旧目标结构带 autoKey / autoLevel（跟随「当前装备」），新版只留 key + level；
           顺手丢掉已经不存在的 active（勾选锁定）字段。 */
        if (raw.sim.target && typeof raw.sim.target === "object") {
          C.SLOTS.forEach(function (s) {
            var arr = raw.sim.target[s];
            if (!Array.isArray(arr)) return;
            var out = [];
            for (var i = 0; i < 3; i++) {
              var t = arr[i] || {};
              out.push({
                key: String(t.key || ""),
                level: Math.max(0, Math.min(15, Math.trunc(num(t.level))))
              });
            }
            d.sim.target[s] = out;
          });
        }
      }
      if (raw.mode) d.mode = raw.mode;
      if (raw.byChar && typeof raw.byChar === "object") d.byChar = raw.byChar;
      if (raw.gearByChar && typeof raw.gearByChar === "object") d.gearByChar = raw.gearByChar;
      if (raw.account && typeof raw.account === "object") {
        var ac = raw.account;
        d.account.enabled = !!ac.enabled;
        d.account.auto = ac.auto !== false;
        d.account.qq = ac.qq || null;
        d.account.level = ac.level || null;
        d.account.syncedAt = ac.syncedAt || null;
        if (ac.corp && typeof ac.corp === "object") d.account.corp = ac.corp;
        if (ac.cls && typeof ac.cls === "object") d.account.cls = ac.cls;
      }
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
  /** 检索词：输入框平时显示的是「当前角色名」（选中回显）。
   *  若把它当检索词，一打开候选就只剩自己一个 → 切「已记录」后无法再挑别的角色（2026-10-28 修）。
   *  因此只有和当前角色名不同时才视为用户真的在搜。 */
  function searchQuery() {
    var si = $("char-search"), v = si ? String(si.value) : "";
    var cur = String(state.char || "");
    if (cur && v.trim() === cur) return "";
    return v;
  }
  /** 按「范围 + 关键词」筛出角色，并按命中质量 + 拼音序排序 */
  function filterRoster() {
    decorateRoster();
    var kws = kwList(searchQuery());
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
    var raw = searchQuery().trim();
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
  function openPicker() {
    var p = $("char-pop");
    if (!p) return;
    renderPicker();
    p.hidden = false;
    /* 没输检索词时把当前角色滚到浮层可视区，省得每次从头翻 */
    if (!searchQuery().trim()) {
      var cur = p.querySelector("button.roster-item.cur");
      if (cur) {
        var top = cur.offsetTop - p.clientHeight / 2 + cur.offsetHeight / 2;
        p.scrollTop = top > 0 ? top : 0;
      }
    }
  }
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
  /* 角色级记忆：突破档 / 收藏品 / 好感 / 魔方等级 / 收藏等级 / 技能三项 / 整套装备词条
   * —— 全部随角色切换而存取。
   * 2026-10-28 扩展：原来只记 bt、coll，其余是全局字段；接 Pinkuro 同步后这些值都是**按角色**回来的，
   * 若不跟着切，拉完 25 个角色再切换就会把上一个角色的技能/魔方等级套到下一个角色身上。 */
  var CHAR_KEYS = ["bt", "coll", "attr", "cubeLv", "collLv"];
  function rememberChar(rid) {
    if (rid == null) return;
    var o = {};
    CHAR_KEYS.forEach(function (k) { o[k] = state.loadout[k]; });
    o.skills = { s1: state.panel.skill1, s2: state.panel.skill2, burst: state.panel.burst };
    o.gear = clone(state.gear);       // 该角色的整套装备：4 部位装备等级 + 当前词条 + 洗练目标
    state.byChar[String(rid)] = o;
  }
  function recallChar(rid) {
    var d = defaults().loadout, saved = state.byChar[String(rid)];
    CHAR_KEYS.forEach(function (k) {
      state.loadout[k] = (saved && saved[k] !== undefined && saved[k] !== null) ? saved[k] : d[k];
    });
    var dp = defaults().panel, sk = saved && saved.skills;
    state.panel.skill1 = (sk && sk.s1 !== undefined) ? sk.s1 : dp.skill1;
    state.panel.skill2 = (sk && sk.s2 !== undefined) ? sk.s2 : dp.skill2;
    state.panel.burst = (sk && sk.burst !== undefined) ? sk.burst : dp.burst;
    // 恢复该角色的整套装备（含装备等级）；没记录就从零录入（新角色各录各的，等级默认满级 5）
    state.gear = (saved && saved.gear) ? normalizeGear(saved.gear) : blankGear();
  }
  /** 切换角色：记住旧角色 → 落新 rid → 恢复新角色的档位/收藏品/装备 → 重挂下拉 → 重推面板 */
  function onCharPicked() {
    rememberChar(state.loadout.rid);
    state.char = $("char-input").value.trim();
    state.loadout.rid = currentRid();
    recallChar(state.loadout.rid);
    /* recall 恢复的是 state，输入框还是上一个角色的值 —— 必须先回写，否则随后的 collectLoadout
       会把旧值又抄回 state，等于「切了角色但练度没切」（2026-10-28 修） */
    $("l-attr").value = state.loadout.attr;
    $("l-cubelv").value = state.loadout.cubeLv;
    $("l-colllv").value = state.loadout.collLv;
    renderPanelValues();
    applyAccountRecycle();
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
    $("l-auto").checked = lo.auto !== false;
    var ra = $("l-recycle-auto"); if (ra) ra.checked = state.account.auto !== false;
    renderBreakthroughOptions();
    renderCubeOptions();
    renderCollOptions();
    renderCharMeta();
    // 研究联动放最后：直接改 l-rk / l-rc 的输入值，随后的 collectLoadout 读到的就是联动结果
    applyAccountRecycle();
    renderPanelValues();          // 技能三项已随角色记忆恢复，回写到输入框
  }
  /** 账号研究表 → 当前角色的企业研究 / 职业研究（联动关闭或尚未同步时不动） */
  function applyAccountRecycle() {
    var ac = state.account;
    if (!ac || !ac.enabled || ac.auto === false) return false;
    var ch = P.findRoster(D, currentRid());
    if (!ch) return false;
    var hit = false;
    var rk = ac.corp[String(ch.corp)], rc = ac.cls[String(ch.cls)];
    if (rk !== undefined && rk !== null) { state.loadout.rk = Math.trunc(num(rk)); $("l-rk").value = state.loadout.rk; hit = true; }
    if (rc !== undefined && rc !== null) { state.loadout.rc = Math.trunc(num(rc)); $("l-rc").value = state.loadout.rc; hit = true; }
    return hit;
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
    /* 魔方类型已屏蔽（2026-10-28）：静态表 16 款魔方的 stats/bp 逐元素相同，只保留等级。
       这个 hidden 的 #l-cube 仅作状态载体，collectLoadout 已不再读取它的值。 */
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
    /* 魔方类型不参与计算（16 款数值一致），固定第一款；字段保留只为兼容旧存档与导出结构 */
    lo.cubeId = 1000301;
    lo.cubeLv = Math.max(0, Math.min(15, Math.trunc(num($("l-cubelv").value, 0))));
    lo.coll = $("l-coll").value || null;
    lo.collLv = Math.max(0, Math.trunc(num($("l-colllv").value, 0)));
    lo.rp = Math.max(0, Math.trunc(num($("l-rp").value, 0)));
    lo.rc = Math.max(0, Math.trunc(num($("l-rc").value, 0)));
    lo.rk = Math.max(0, Math.trunc(num($("l-rk").value, 0)));
    /* 装备同厂加成开关已移除（2026-10-28）：UI 不再提供，固定关闭（panel.js 仍保留该分支以便日后复核） */
    lo.corpBonus = false;
    lo.auto = $("l-auto").checked;
    var ra = $("l-recycle-auto");
    if (ra) state.account.auto = ra.checked;
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
      $("c-goal").textContent = $("c-per").textContent = $("c-p").textContent = "--";
      $("c-route").textContent = $("c-exp").textContent = "--";
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
   * 概率与消耗口径全部交给 js/reroll.js（对齐 ChrisLu7899/NIKKE-Workshop），
   * 这里只做三件事：收输入 → 调求解 → 把结果铺到 DOM。
   *
   * 与旧实现的差别，正是「反直觉」的根因：
   *   旧：期望总消耗 = 上锁一次性 + 每次重洗 × (1 / 一次性全命中率)
   *       —— 口径是「所有目标必须同一把同时命中」，三目标会算出几百颗，跟实际手感差一个量级。
   *   新：洗出一条就锁一条、逐条推进（子集 DP，精确值），三目标通常只有几十颗。
   *       同时区分国服旧规则（可能抽出与当前完全相同的档位）与国际服新规则（排除原档位后重新归一）。
   */
  var SIM_MIN_TIER_DEFAULT = 10;   // 新设一条目标时，最低档数默认按 T10（通用毕业线）
  function renderSimSlotOptions() {
    $("m-slot").innerHTML = C.SLOTS.map(function (s) {
      return '<option value="' + s + '"' + (s === state.sim.slot ? " selected" : "") + ">" + SLOT_LABEL[s] + "</option>";
    }).join("");
  }
  /** 该部位的目标（最多 3 条：类型 + 最低档数）。
   *  ⚠ **必须原地维护并返回同一个数组引用** —— 渲染出来的下拉闭包持有它，
   *  若每次都新建数组，闭包写进的是旧数组、`renderSim()` 读的是新数组，用户设定会被静默丢弃。 */
  function ensureTargets(slot) {
    if (!state.sim.target || typeof state.sim.target !== "object") state.sim.target = {};
    var arr = state.sim.target[slot];
    if (!Array.isArray(arr)) { arr = []; state.sim.target[slot] = arr; }
    while (arr.length > 3) arr.pop();
    for (var i = 0; i < 3; i++) {
      if (!arr[i] || typeof arr[i] !== "object") arr[i] = {};
      var t = arr[i];
      t.key = String(t.key || "");
      t.level = Math.max(0, Math.min(15, Math.trunc(num(t.level))));
      if (!t.key) t.level = 0;
      else if (!(t.level > 0)) t.level = SIM_MIN_TIER_DEFAULT;
    }
    return arr;
  }
  /** 目标类型下拉：空 = 不设；同一部位其它目标已选走的类型置灰（同一件装备不会出现重复词条） */
  function targetTypeOptions(selected, exclude) {
    var ex = {};
    (exclude || []).forEach(function (k) { if (k && k !== selected) ex[k] = 1; });
    var h = '<option value="">— 不设 —</option>';
    D.overload.forEach(function (g) {
      h += '<option value="' + esc(g.key) + '"' + (g.key === selected ? " selected" : "") + (ex[g.key] ? " disabled" : "") + ">" + esc(g.name) + "</option>";
    });
    return h;
  }
  /** 最低档数下拉（1 ~ 15，「≥」口径：洗到更高档也算达成） */
  function minTierOptions(key, selected) {
    var sel = Math.max(1, Math.min(15, Math.trunc(num(selected, SIM_MIN_TIER_DEFAULT))));
    var h = "";
    for (var lv = 1; lv <= 15; lv++) {
      var vt = key ? C.statValueText(D, key, lv) : "";
      var tc = tierCls(lv);
      h += '<option value="' + lv + '"' + (tc ? ' class="' + tc + '"' : "") + (lv === sel ? " selected" : "") + ">≥ " + lv + " 阶" + (vt ? " · " + esc(vt) : "") + "</option>";
    }
    return h;
  }
  /** 3 行「目标词条 + 最低档数」 */
  function renderSimTargets() {
    var el = $("m-target");
    if (!el) return;
    var slot = state.sim.slot;
    var tgt = ensureTargets(slot);
    var html = "";
    for (var i = 0; i < 3; i++) {
      var sib = [];
      for (var j = 0; j < 3; j++) if (j !== i && tgt[j].key) sib.push(tgt[j].key);
      html += '<div class="trow' + (tgt[i].key ? " on" : "") + '" title="第 ' + (i + 1) + ' 条目标">'
        + '<label class="tchk"><em>' + (i + 1) + "</em></label>"
        + '<select class="ty" data-idx="' + i + '" aria-label="目标词条 ' + (i + 1) + '">' + targetTypeOptions(tgt[i].key, sib) + "</select>"
        + '<select class="lv ' + tierCls(tgt[i].level) + '" data-lv="' + i + '" aria-label="最低档数 ' + (i + 1) + '"'
        + (tgt[i].key ? "" : " disabled") + ">" + minTierOptions(tgt[i].key, tgt[i].level) + "</select>"
        + "</div>";
    }
    el.innerHTML = html;
    el.querySelectorAll("select.ty").forEach(function (s) {
      s.addEventListener("change", function () {
        var i = Number(s.dataset.idx);
        tgt[i].key = s.value;
        tgt[i].level = s.value ? Math.max(1, tgt[i].level || SIM_MIN_TIER_DEFAULT) : 0;
        renderSimTargets();                          // 兄弟行的置灰状态要跟着变
        renderSim(profile()); save(true);
      });
    });
    el.querySelectorAll("select.lv").forEach(function (s) {
      s.addEventListener("change", function () {
        var i = Number(s.dataset.lv);
        tgt[i].level = Math.max(1, Math.min(15, Math.trunc(num(s.value, 1))));
        s.className = "lv " + tierCls(tgt[i].level);
        renderSim(profile()); save(true);
      });
    });
  }
  /* 洗练权重（社区实测口径，非官方）：优越/攻击/暴伤/防御 = 10，其余 = 12。
     reroll.js 不硬编码词条 key，权重由这里从静态表映射后传进去。 */
  var TYPE_WNAMES = { "优越代码伤害": 10, "命中率": 12, "最大装弹数": 12, "攻击力": 10, "蓄力伤害": 12,
    "蓄力时间": 12, "暴击率": 12, "暴击伤害": 10, "防御力": 10 };
  function typeWeights() {
    var o = {};
    D.overload.forEach(function (g) { o[g.key] = TYPE_WNAMES[g.name] !== undefined ? TYPE_WNAMES[g.name] : 12; });
    return o;
  }
  function simModel() {
    return R.makeModel(D.overload.map(function (g) { return g.key; }), typeWeights());
  }
  /** 稳定哈希（FNV-1a 32 位）→ 模拟种子：同输入必得同输出，改其它地方时抽样序列不跳变 */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** mulberry32：小而够用的可复现随机数发生器 */
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 石头数：< 100 留一位小数，≥ 100 取整（几千颗时小数没意义） */
  function stones(v) {
    if (!Number.isFinite(v)) return "—";
    return v >= 100 ? fmt(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
  }
  /** 蒙特卡洛：在当前记录上把这个部位重洗一次，抽 rolls 次看战力分布 */
  function sampleSlot(pf, base, slot, lines, targets, mode, rule, rolls, seed) {
    var model = simModel();
    var rng = mulberry32(hashStr(seed));
    var otherBP = base.bp - base.slots[slot].bp;    // 另外三个部位；本部位每次重算后加回来
    var bpCache = {};
    function rowBP(k, lv) {
      var kk = k + "@" + lv;
      if (bpCache[kk] === undefined) bpCache[kk] = C.resolveOption(D, k, lv).bp;
      return bpCache[kk];
    }
    var vals = new Array(rolls), i, j;
    for (i = 0; i < rolls; i++) {
      var out = R.drawOnce(model, { lines: lines, targets: targets, mode: mode, rule: rule }, rng);
      var sbp = 0;
      for (j = 0; j < 3; j++) sbp += rowBP(out[j].key, out[j].level);
      vals[i] = C.calcBattlePower(D.config, pf, otherBP + sbp).value;
    }
    vals.sort(function (a, b) { return a - b; });
    function q(p) { return vals[Math.max(0, Math.min(vals.length - 1, Math.round((vals.length - 1) * p)))]; }
    var sum = 0;
    for (i = 0; i < vals.length; i++) sum += vals[i];
    return { values: vals, min: vals[0], max: vals[vals.length - 1], p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: sum / vals.length };
  }
  var SIM_MODE_TXT = { auto: "自动（先洗词条 → 再洗数值）", change: "只洗词条", value: "只洗数值" };
  var SIM_NOTE = {
    auto: "口径：洗出一条就锁一条、逐条推进 —— 不是「三条必须同一把同时命中」，所以消耗比按概率相乘估的小一个量级。",
    change: "只洗词条（变更效果）：类型和档位要同一把抽到位，已达标的那几条自动锁住。",
    value: "只洗数值（重置属性）：类型不变，只重抽目标词条的档位。"
  };
  var lastSimKey = null, lastSim = null;
  function renderSim(pf) {
    var IDS = ["m-cur", "m-slotcur", "m-minmax", "m-pct", "m-mean", "m-vs", "m-pctgain",
      "c-goal", "c-per", "c-p", "c-route", "c-exp"];
    function blank() {
      IDS.forEach(function (id) { var el = $(id); if (el) el.textContent = "--"; });
      $("m-hist").innerHTML = "";
      $("c-note").textContent = "…";
      lastSimKey = null; lastSim = null;
    }
    if (!hasPanel()) { blank(); return; }

    var slot = state.sim.slot;
    var mode = state.sim.mode === "change" ? "change" : (state.sim.mode === "value" ? "value" : "auto");
    var rule = state.sim.rule === "global" ? "global" : "cn";
    var tgt = ensureTargets(slot);
    var rolls = Math.max(200, Math.min(200000, Math.trunc(num($("m-rolls").value, 4000))));

    var base = C.gearSummary(D, flatGear("before"));
    var cur = C.calcBattlePower(D.config, pf, base.bp).value;
    var slotCur = base.slots[slot];
    var lines = slotCur.rows.map(function (r) { return { key: r.key || "", level: r.level || 0 }; });

    var targets = [];
    for (var i = 0; i < 3; i++) {
      if (tgt[i].key) targets.push({ key: tgt[i].key, minTier: Math.max(1, Math.min(15, tgt[i].level || 1)) });
    }

    $("m-cur").textContent = fmt(cur);
    $("m-slotcur").textContent = SLOT_LABEL[slot] + " · 内部 " + fmt(slotCur.bp) + " · 词条 "
      + slotCur.rows.map(function (r) { return r.level ? (overloadName(r.key) + " " + r.level + "阶") : "空"; }).join(" / ");
    $("c-per").textContent = "1 颗起（每锁 1 条 +1，锁满 3 条 4 颗）";

    /* ---- 消耗：精确求解（DP），不是「概率相乘取倒数」 ---- */
    if (!targets.length) {
      $("c-goal").textContent = "—";
      $("c-p").textContent = "—"; $("c-p").className = "";
      $("c-route").textContent = "—";
      $("c-exp").textContent = "—";
      $("c-note").textContent = "先给这个部位设 1 ~ 3 条目标词条（类型 + 最低档数），才会算「洗到目标要多少石头」。";
    } else {
      var res = R.plan(simModel(), { lines: lines, targets: targets, mode: mode, rule: rule });
      $("c-goal").textContent = targets.length + " 条 · 已达成 " + (res.has || 0) + " 条 · "
        + (rule === "global" ? "国际服新规则" : "国服旧规则");
      if (res.firstHitProb !== undefined && Number.isFinite(res.firstHitProb)) {
        $("c-p").textContent = (res.firstHitProb * 100).toFixed(res.firstHitProb < 0.01 ? 3 : 1) + "%";
        $("c-p").className = res.firstHitProb > 0 ? "pos" : "neg";
      } else { $("c-p").textContent = "—"; $("c-p").className = ""; }

      if (!res.ok) {
        $("c-route").textContent = "—";
        $("c-exp").textContent = "—";
        $("c-note").textContent = res.reason === "missing-name"
          ? "「" + (res.missing || []).map(overloadName).join("、") + "」还不在这个部位的盘面上 —— "
            + "只洗数值改不了词条类型，得先用「自动」或「只洗词条」把它洗出来。"
          : "这个目标组合不可达（最低档数设得过高或盘面冲突），把档数调低再试。";
      } else if (res.done) {
        $("c-route").textContent = "—";
        $("c-exp").textContent = "0 颗";
        $("c-note").textContent = "当前记录的" + SLOT_LABEL[slot] + "已经满足全部目标，不用洗。";
      } else {
        $("c-route").textContent = mode === "auto"
          ? ((res.nameStones < 0.05 ? "词条阶段 无需（名字已在盘上）" : "词条阶段 " + stones(res.nameStones) + " 颗")
            + " → 数值阶段 " + stones(res.valueStones) + " 颗")
          : "重洗 " + stones(res.rerollStones) + " 颗（≈ "
            + (Number.isFinite(res.rerolls) ? res.rerolls.toFixed(1) : "—") + " 次）+ 上锁 " + stones(res.lockStones) + " 颗";
        $("c-exp").textContent = "≈ " + stones(res.total) + " 颗";
        $("c-note").textContent = SIM_NOTE[mode] + (rule === "global"
          ? "　国际服新规则：抽到与当前完全相同的档位会被排除后重抽，所以洗数值阶段更快。"
          : "　国服旧规则：抽到与当前完全相同的档位也算一次结果。");
      }
    }

    /* ---- 「洗一次会变成什么样」：蒙特卡洛 ---- */
    var mcMode = (mode === "value" && targets.length) ? "value" : "change";
    var seedKey = [state.loadout.rid, slot, mode, rule, mcMode,
      targets.map(function (t) { return t.key + ">=" + t.minTier; }).join(","),
      lines.map(function (l) { return l.key + "@" + l.level; }).join(","), rolls].join("|");
    var cacheKey = seedKey + "|" + base.bp
      + "|" + Math.round(num(pf.attack)) + "|" + Math.round(num(pf.hp)) + "|" + Math.round(num(pf.defense))
      + "|" + Math.round(num(pf.critRatio)) + "|" + Math.round(num(pf.critDamage))
      + "|" + Math.round(num(pf.skill1)) + "|" + Math.round(num(pf.skill2)) + "|" + Math.round(num(pf.burst))
      + "|" + Math.round(num(pf.extraBP));
    if (cacheKey !== lastSimKey) {
      lastSimKey = cacheKey;
      lastSim = sampleSlot(pf, base, slot, lines, targets, mcMode, rule, rolls, seedKey);
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
    $("m-mode").value = state.sim.mode || "auto";
    $("m-rule").value = state.sim.rule === "global" ? "global" : "cn";
    compute();
  }
  /* ---------------- 信息窗（InfoTip） ----------------
   *  说明类长文案不再常驻页面，收进分组标题旁的 ⓘ 浮层，点开才看。
   *  HTML 端只留 <button type="button" class="info-tip" data-tip="tip-xxx" aria-expanded="false">，
   *  图标 SVG 与正文都写在本文件 —— 文案集中一处，免得 HTML / JS 两头漂移。
   *  交互：点图标开/关、点面板外收起、Esc 收起、同一时刻只开一个。 */
  var INFO_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
    + '<circle cx="8" cy="8" r="6.4"/><path d="M8 7.4v4" stroke-linecap="round"/>'
    + '<circle cx="8" cy="4.9" r="0.95" fill="currentColor" stroke="none"/></svg>';
  var INFO_TEXTS = {
    "tip-sync": {
      title: "导入阿卡数据",
      html: "Key 在<b>顶栏</b>填写，保存一次长期有效、不用每次重填。<br>"
        + "导入回填：<b>词条明细 / 装备等级 / 突破 / 收藏 / 技能 / 魔方等级 / 企业·职业研究等级</b>。<br>"
        + "Key 只存<b>本机浏览器</b>，不写进导出文件、不进链接、不写日志。"
    },
    "tip-gear": {
      title: "① 当前装备怎么录",
      html: "先选好角色，再把该角色在游戏里的<b>整套装备</b>录入这里并<b>保存</b>：每个部位先填<b>装备等级</b>"
        + "（强化 0 ~ 5，每级 +10% 装备基础属性），再填 3 条<b>装备词条</b>"
        + "（T12~14 蓝字、T15 黑底白字，与游戏内一致）。<br>"
        + "同一件装备<b>不会出现重复词条</b>，被本部位其它行选走的类型会自动置灰。<br>"
        + "这份记录是下方「② 装备词条洗练」与右栏「洗练模拟」的<b>基准</b>，且<b>按角色分别记录</b>。"
    },
    "tip-sim": {
      title: "洗练模拟的算法口径",
      html: "概率模型对齐开源实现 <b>ChrisLu7899/NIKKE-Workshop</b>，不是「概率相乘取倒数」那种估算。<br>"
        + "<b>每次重洗</b>：1 / 2 / 3 号词条位出词条的概率分别是 <b>100% / 50% / 30%</b>；"
        + "阶数 1~5 各占 12、6~10 各占 7、11~15 各占 1（合计 100）；"
        + "九类词条里优越 / 攻击 / 暴伤 / 防御权重 10，其余 12；同一次重洗<b>类型不重复</b>。<br>"
        + "<b>石头</b>：每次重洗 <b>锁定条数 + 1</b> 颗；点锁定本身一次性付费，锁到 1 / 2 / 3 条累计 <b>2 / 5 / 9</b> 颗，解锁不退。<br>"
        + "<b>打法</b>：洗出一条就锁一条、逐条推进 —— 所以三条目标的期望消耗是几十颗，不是几百颗。<br>"
        + "<b>服务器差异</b>：国服（旧规则）结果直接覆盖，可能抽出与当前完全相同的档位；"
        + "国际服（新规则）会把与当前完全相同的档位排除后重新归一，因此<b>洗数值阶段更快</b>。"
    }
  };
  var _openTip = null;
  function closeInfoPanel() {
    if (!_openTip) return;
    try { if (_openTip.panel.parentNode) _openTip.panel.parentNode.removeChild(_openTip.panel); } catch (e) { /* 已被移除 */ }
    try { _openTip.btn.setAttribute("aria-expanded", "false"); } catch (e) { }
    _openTip = null;
  }
  function openInfoPanel(btn) {
    var def = INFO_TEXTS[btn.getAttribute("data-tip")];
    if (!def) return;
    var host = btn.parentNode;
    while (host && host !== document.body && !(host.classList && host.classList.contains("tip-host"))) host = host.parentNode;
    if (!host || host === document.body) host = btn.parentNode;
    var p = document.createElement("div");
    p.className = "info-panel";
    p.setAttribute("role", "dialog");
    p.innerHTML = '<div class="ip-title">' + def.title + "</div>"
      + '<button type="button" class="ip-close" aria-label="关闭">✕</button>'
      + '<div class="ip-body">' + def.html + "</div>";
    host.appendChild(p);
    p.querySelector(".ip-close").addEventListener("click", function (e) { e.stopPropagation(); closeInfoPanel(); });
    btn.setAttribute("aria-expanded", "true");
    _openTip = { btn: btn, panel: p };
  }
  function initInfoTips(root) {
    var list = (root || document).querySelectorAll(".info-tip[data-tip]");
    Array.prototype.forEach.call(list, function (btn) {
      if (btn._tipBound) return;
      btn._tipBound = true;
      if (!btn.firstChild) btn.innerHTML = INFO_SVG;
      btn.addEventListener("click", function (e) {
        e.stopPropagation(); e.preventDefault();
        if (_openTip && _openTip.btn === btn) { closeInfoPanel(); return; }
        closeInfoPanel();
        openInfoPanel(btn);
      });
    });
  }
  document.addEventListener("click", function (e) {
    if (!_openTip) return;
    if (_openTip.btn && _openTip.btn.contains(e.target)) return;   // 图标自身交给它的 handler toggle
    closeInfoPanel();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Esc") closeInfoPanel();
  });

  /* ---------------- 导入阿卡数据（数据源 pinkuro 服务端） ----------------
   *  通路：页面 →（POST，本机）127.0.0.1:8785/api/pinkuro/import →（GET，带 X-API-KEY）pinkuro.top:9984
   *  为什么不让浏览器直连：远端预检 OPTIONS 返回 204 且不带 Access-Control-Allow-Origin，
   *  带自定义头 X-API-KEY 的跨域请求必被浏览器拦下（2026-10-28 实测）。
   *  Key 存单独 localStorage 键，不进 state ⇒ 不进「导出 JSON」、不进云同步。
   */
  function pkGetKey() { try { return String(localStorage.getItem(PKEY) || ""); } catch (e) { return ""; } }
  function pkSetKey(v) { try { if (v) localStorage.setItem(PKEY, String(v)); else localStorage.removeItem(PKEY); } catch (e) { /* 隐私模式忽略 */ } }
  /** 有效中转地址：?relay= 覆盖 > 用户保存值 > 内置默认（空则本机通道） */
  function pkGetRelay() {
    var q = "";
    try { q = String(new URLSearchParams(location.search).get("relay") || "").trim(); } catch (e) { q = ""; }
    if (q) return q.replace(/\/+$/, "");
    var saved = "";
    try { saved = String(localStorage.getItem(PRELAY) || "").trim(); } catch (e) { saved = ""; }
    if (saved) return saved.replace(/\/+$/, "");
    return String(PRELAY_DEFAULT || "").trim().replace(/\/+$/, "");
  }
  /** 走的是内置默认中转（而非用户自填）→ 中转地址行、通道名对用户都没有意义，一律不显示 */
  function pkIsBuiltin() {
    return !!PRELAY_DEFAULT && pkGetRelay() === String(PRELAY_DEFAULT).replace(/\/+$/, "");
  }
  function pkHideRelayRowIfBuiltin() {
    var row = $("pk-relay") && $("pk-relay").closest(".key-row");
    var btn = $("btn-relay-save");
    var builtin = pkIsBuiltin();
    if (row) row.style.display = builtin ? "none" : "";
    if (btn) btn.style.display = builtin ? "none" : "";
  }
  function pkSetRelay(v) {
    try { if (v) localStorage.setItem(PRELAY, String(v).trim().replace(/\/+$/, "")); else localStorage.removeItem(PRELAY); }
    catch (e) { /* 隐私模式忽略 */ }
  }
  function pkChannelName() {
    var r = pkGetRelay();
    if (!r) return "本机转发";
    try { return "公网中转 " + new URL(r).host; } catch (e) { return "公网中转"; }
  }
  function pkStatus(t, k) {
    var el = $("pk-status");
    if (!el) return;
    el.textContent = t || "";
    el.className = "hint tight" + (k ? " " + k : "");
  }
  function pkMaskedKey(k) { return k ? ("已保存 Key · " + k.slice(0, 4) + "…" + k.slice(-3) + " · " + k.length + " 位") : "未保存 Key"; }
  function pkRefreshUI() {
    var k = pkGetKey(), inp = $("pk-key"), tag = $("sync-tag"), rin = $("pk-relay"), r = pkGetRelay();
    /* Key 输入框现在在顶栏（2026-10-28），宽度有限 → placeholder 只说要点，细节交给下方状态行 */
    if (inp) inp.placeholder = k ? "已保存 · 覆盖请输入" : "粘贴 Key";
    if (rin) rin.placeholder = r ? r.replace(/^https?:\/\//, "") : "中转地址（留空=本机）";
    if (tag) tag.textContent = state.account && state.account.enabled ? ("已导入 " + (state.account.qq || "")).trim() : "未导入";
    pkHideRelayRowIfBuiltin();
    pkStatus((k ? pkMaskedKey(k) : "未保存 Key · 每次打开都要重新填")
      + (pkIsBuiltin() ? "" : " · 通道：" + pkChannelName()), k ? "ok" : "");
  }
  /** 清掉「没有归属」的可选键，避免脏数据把 state 撑大 */
  function pkApply(raw, from) {
    if (!PK) { setNotice("映射模块 pinkuro.js 未加载", "error"); return; }
    var res = PK.mapBundle(raw, D);
    if (!res.ok) { pkStatus("响应无法识别：" + (res.message || ""), "error"); setNotice("阿卡数据无法识别", "error"); return; }
    var ac = res.account || {};
    if (ac.level) state.loadout.level = ac.level;
    state.account = {
      enabled: true,
      auto: state.account.auto !== false,
      qq: ac.qq || null,
      level: ac.level || null,
      corp: ac.corp || {},
      cls: ac.cls || {},
      syncedAt: Date.now()
    };
    var applied = 0;
    res.characters.forEach(function (c) {
      if (c.rid === null) return;                 // 站点角色表里没有 → 无法入库
      var k = String(c.rid), rec = state.byChar[k] || {};
      rec.bt = c.patch.bt;
      rec.attr = c.patch.attr;
      rec.cubeLv = c.patch.cubeLv;
      rec.coll = c.patch.coll;
      rec.collLv = c.patch.collLv;
      rec.skills = { s1: c.patch.skill1, s2: c.patch.skill2, burst: c.patch.burst };
      rec.gear = normalizeGear(c.gear);
      state.byChar[k] = rec;
      state.gearByChar[k] = normalizeGear(c.gear);
      applied++;
    });
    /* 落到「当前角色」若它也在同步结果里，否则落到第一个可用角色 */
    var cur = res.characters.filter(function (c) { return c.rid !== null && c.rid === state.loadout.rid; })[0]
      || res.characters.filter(function (c) { return c.rid !== null; })[0];
    if (cur) {
      state.char = cur.name;
      state.loadout.rid = cur.rid;
      recallChar(cur.rid);
    }
    renderAll();
    setMode("loadout");
    save(true);
    pkRefreshUI();
    var miss = res.report.missing || [];
    var msg = from + "成功 · " + applied + " 个角色已回填（响应 " + res.report.total + " 条）";
    if (miss.length) msg += " · 站点角色表缺 " + miss.join("、");
    pkStatus(msg + " · 阶数自检 " + res.report.verifyOk + "/" + res.report.total, "ok");
    setNotice(msg + " · 同步器 Lv." + (ac.level || "-") + " · 企业/职业研究随角色自动取值", "ok");
  }
  function pkPull() {
    var key = ($("pk-key").value || "").trim() || pkGetKey();
    if (!key) { pkStatus("请先在顶栏填写阿卡 Key（填一次保存即可）", "error"); setNotice("请先填写阿卡 Key", "error"); return; }
    var btn = $("btn-sync-pull");
    if (btn) btn.disabled = true;
    var relay = pkGetRelay(), req;
    if (relay) {
      /* 通道 A：公网中转（GET + X-API-KEY；中继端已放行 CORS，手机/别的电脑也能用）
         走内置中转时对用户不提「中转」二字，只当它是一次普通请求 */
      pkStatus(pkIsBuiltin() ? "正在获取数据…（只发一次，不重试）" : "正在通过公网中转请求…（只发一次，不重试）", "");
      req = fetch(relay, {
        method: "GET",
        headers: { "X-API-KEY": key, "Accept": "application/json" },
        cache: "no-store"
      });
    } else {
      /* 通道 B：本机转发（loopback，服务端补了 CORS） */
      pkStatus("正在向本机转发服务请求…（只发一次，不重试）", "");
      req = fetch(PAGENT + "/api/pinkuro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
      });
    }
    req.then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("Key 无效或无权限（HTTP " + r.status + "）");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (json) {
      pkSetKey(key);
      pkApply(json, relay && !pkIsBuiltin() ? "中转导入" : "导入");
    }).catch(function (e) {
      var m = String((e && e.message) || e), hint;
      if (/Failed to fetch|NetworkError|load failed/i.test(m)) {
        if (!relay) {
          hint = "连不上本机转发（127.0.0.1:8785）—— 先双击 start-pinkuro-agent.bat，或在左侧「导入阿卡数据」里填一个公网中转地址";
        } else if (PRELAY_DEFAULT && relay === String(PRELAY_DEFAULT).replace(/\/+$/, "")) {
          hint = "同步服务暂时不可用，请稍后重试（也可用下方「粘贴 JSON 导入」）";
        } else {
          hint = "连不上中转 " + relay + " —— 地址是否写对 / 服务是否已部署？清空中转地址即可切回本机通道";
        }
      } else {
        hint = "请求失败：" + m;
      }
      pkStatus(hint, "error");
      setNotice("阿卡数据导入未完成", "error");
    }).then(function () { if (btn) btn.disabled = false; });
  }
  function pkPaste() {
    var txt = ($("pk-json").value || "").trim();
    if (!txt) { pkStatus("请先粘贴接口原始响应", "error"); return; }
    var json;
    try { json = JSON.parse(txt); }
    catch (e) { pkStatus("不是合法 JSON：" + e.message, "error"); return; }
    pkApply(json, "粘贴导入");
  }
  function pkBind() {
    var btnSave = $("btn-key-save"), btnClear = $("btn-key-clear"), btnPull = $("btn-sync-pull"),
      btnPaste = $("btn-sync-paste"), btnEye = $("btn-key-eye"), inp = $("pk-key"),
      rin = $("pk-relay"), btnRelay = $("btn-relay-save");
    if (btnRelay) btnRelay.addEventListener("click", function () {
      var v = (rin.value || "").trim();
      if (v && !/^https?:\/\//i.test(v)) { pkStatus("中转地址要以 http:// 或 https:// 开头", "error"); return; }
      pkSetRelay(v);
      rin.value = "";
      pkRefreshUI();
      setNotice(v ? ("已切换到公网中转：" + v) : "已清空中转地址，回到本机转发通道", "ok");
    });
    if (btnSave) btnSave.addEventListener("click", function () {
      var v = (inp.value || "").trim();
      if (!v) { pkStatus("输入框为空：要清除 Key 请点右侧「×」", "error"); return; }
      pkSetKey(v);
      pkRefreshUI();
      setNotice("Key 已保存到本机浏览器（不写进导出文件、不进链接、不写日志）", "ok");
    });
    if (btnClear) btnClear.addEventListener("click", function () {
      if (!window.confirm("清除本机保存的阿卡 Key？已导入的练度数据不会删除。")) return;
      pkSetKey(""); inp.value = ""; pkRefreshUI();
      setNotice("已清除本机 Key", "ok");
    });
    if (btnEye) btnEye.addEventListener("click", function () {
      if (inp.type === "password") {
        if (!inp.value) inp.value = pkGetKey();     // 输入框空 → 把已保存的 Key 调出来看
        inp.type = "text";
        btnEye.textContent = "🙈";
      } else { inp.type = "password"; btnEye.textContent = "👁"; }
    });
    if (btnPull) btnPull.addEventListener("click", pkPull);
    if (btnPaste) btnPaste.addEventListener("click", pkPaste);
    /* 研究联动：手动改 rk / rc 就视为「不想联动」，自动关掉勾选，避免下次切角色被覆盖 */
    ["l-rk", "l-rc"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        var box = $("l-recycle-auto");
        if (box && box.checked && state.account.enabled) {
          box.checked = false;
          state.account.auto = false;
          setNotice("已关闭「企业/职业研究自动取值」，当前为手动值", "");
        }
      });
    });
    var box = $("l-recycle-auto");
    if (box) box.addEventListener("change", function () {
      state.account.auto = box.checked;
      if (box.checked) { collectLoadout(); applyAccountRecycle(); collectLoadout(); derivePanel(); save(true); }
      else { save(true); }
    });
    pkRefreshUI();
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
   *   · 「保存」右侧一个圆形云开关（与资源规划计算器同款交互）：
   *       开 → 点「保存」时本地落盘后顺手推云端；关 → 只留本机；
   *   · 「👤 账号面板」→ 唤起父页面账号面板（登录 / 下载覆盖 / 看云端时间，面板会定位到本 Tab 的卡片）；
   *   · 单独打开本页（没有父页面接口）→ 这两个入口保持隐藏，不误导用户。
   *   2026-10-28：原独立「☁ 同步到云端」按钮按需求移除，功能并入保存。
   */
  var CLOUD_FID = "combat_power_beta";
  var CLOUD_TOG = "nikke_power_cloud_auto";   // 开关本身也存本机，刷新后保持上次选择
  var cloudApiRef = null;

  function cloudApi() {
    try {
      if (window.parent && window.parent !== window && window.parent.__nikkeSync) return window.parent.__nikkeSync;
    } catch (e) { /* 跨域等异常：视为不可用 */ }
    return null;
  }
  function cloudStatus(api) {
    try { return (api && api.status) ? api.status() : null; } catch (e) { return null; }
  }
  function cloudAutoOn() { try { return localStorage.getItem(CLOUD_TOG) !== "0"; } catch (e) { return true; } }
  function setCloudAuto(v) { try { localStorage.setItem(CLOUD_TOG, v ? "1" : "0"); } catch (e) { /* 隐私模式忽略 */ } }

  /** 重绘云开关：可点状态只看 [data-on]，文案（含未登录提示）只放 hover 气泡里 */
  function paintCloudUI() {
    var tog = $("cloud-tog"), chk = $("chk-cloud-auto"), btnAcct = $("btn-account");
    if (!tog) return;
    var st = cloudStatus(cloudApiRef);
    var logged = !!(st && st.loggedIn), want = cloudAutoOn();
    tog.dataset.on = want ? "1" : "0";
    if (chk) chk.checked = want;
    var txt = !want ? "云同步已关：保存只留在本机"
      : (logged ? "已开启：点「保存」时同步到云端" + (st.email ? "（" + st.email + "）" : "")
                : "已开启，但还没登录：点「账号面板」登录后生效");
    var tip = tog.querySelector(".cloud-tip");
    if (tip) tip.textContent = txt;
    tog.title = txt;
    if (btnAcct) btnAcct.title = logged ? "打开账号云同步面板（可下载覆盖 / 查看云端时间）" : "登录并管理云端数据";
  }

  /** 保存之后的云同步尾巴：开关关着 / 没登录 / 不在工具箱里 → 静默跳过，不打扰 */
  function cloudPushAfterSave() {
    var api = cloudApiRef;
    if (!api || !cloudAutoOn()) return;
    var st = cloudStatus(api);
    if (!st || !st.configured) return;                       // 云端组件没就绪：当纯本地保存
    if (!st.loggedIn) { setNotice("已保存到本机浏览器 · 未登录，未上传云端", ""); return; }
    setNotice("已保存，正在同步到云端…", "");
    var p = api.quickUpload(CLOUD_FID);
    if (p && typeof p.then === "function") {
      p.then(function (r) {
        paintCloudUI();
        if (r && r.ok) setNotice("已保存并同步到云端 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false }), "ok");
        else if (r && (r.reason === "nologin" || r.reason === "noconfig" || r.reason === "noclient")) setNotice("已保存到本机 · 云端未登录，未同步", "");
        else if (r && r.reason === "empty") setNotice("已保存到本机浏览器（云端：本机暂无数据）", "error");
        else setNotice("已保存到本机，云端同步失败：" + ((r && r.message) || "未知错误"), "error");
      });
    }
  }

  function initCloudSync() {
    var api = cloudApi();
    var tog = $("cloud-tog"), chk = $("chk-cloud-auto"), btnAcct = $("btn-account");
    cloudApiRef = api;
    if (!tog && !btnAcct) return;
    if (!api) {                              // 独立打开：本页不适用云同步入口
      if (tog) tog.hidden = true;
      if (btnAcct) btnAcct.hidden = true;
      return;
    }
    if (tog) tog.hidden = false;
    if (btnAcct) btnAcct.hidden = false;
    paintCloudUI();
    window.addEventListener("focus", paintCloudUI);
    document.addEventListener("visibilitychange", paintCloudUI);

    if (chk) chk.addEventListener("change", function () {
      setCloudAuto(chk.checked);
      paintCloudUI();
      setNotice(chk.checked ? "已开启云同步：点「保存」时会同时上传到云端" : "已关闭云同步：保存只留在本机浏览器", "");
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
    ["l-level", "l-attr", "l-cubelv", "l-colllv", "l-rp", "l-rc", "l-rk", "l-cube", "l-coll", "l-bt"].forEach(function (id) {
      $(id).addEventListener("input", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); else { renderTiers(); compute(); } save(true); });
      $(id).addEventListener("change", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); else { renderTiers(); compute(); } save(true); });
    });
    $("l-auto").addEventListener("change", function () { collectLoadout(); if (state.loadout.auto) derivePanel(); });
    $("btn-derive").addEventListener("click", function () { collectLoadout(); derivePanel(); save(true); setNotice("已按练度参数重新推导面板", "ok"); });
    // 整合式角色搜索：输入即筛 → 浮层点选。#char-input 只作状态载体，change 仍触发切角色
    $("char-input").addEventListener("change", onCharPicked);
    var si = $("char-search"), pop = $("char-pop");
    if (si) {
      si.addEventListener("focus", function () {
        openPicker();
        /* 回显态整段选中 → 直接打字就替换，退格也不会把名字拆成检索词 */
        if (state.char && si.value.trim() === String(state.char)) { try { si.select(); } catch (e) { } }
      });
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
    /* 保存 = 本地落盘（+ 云开关打开且已登录时顺手上传）。同厂加成已移除，不再参与联动 */
    $("btn-save").addEventListener("click", function () { save(false); cloudPushAfterSave(); });
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
      var v = $("m-mode").value;
      state.sim.mode = (v === "value" || v === "change") ? v : "auto";
      renderSimTargets(); renderSim(profile()); save(true);
    });
    $("m-rule").addEventListener("change", function () {
      state.sim.rule = $("m-rule").value === "global" ? "global" : "cn";
      renderSim(profile()); save(true);
    });
    $("m-rolls").addEventListener("input", function () {
      state.sim.rolls = Math.max(200, Math.min(200000, Math.trunc(num($("m-rolls").value, 4000))));
      collectPanel(); renderSim(profile());
    });

    var s = D.sources || {};
    $("src-line").innerHTML = "数据版本 " + esc(D.generatedAt) + "（" + esc(D.sourcePack || "") + "） · 角色 " + D.roster.length
      + " 人 · 词条 " + D.overload.length + " 类 × 15 阶 · 魔方 " + D.cubes.length + " · 属性曲线组 "
      + Object.keys(D.curves).length + " · CharacterStatTable <code>" + esc((s.CharacterStatTable || "").slice(0, 8))
      + "</code> · ConfigGameTable <code>" + esc((s.ConfigGameTable || "").slice(0, 8)) + "</code>";

    initCloudSync();
    pkBind();     // 导入阿卡数据：Key 存取 / 导入 / 粘贴导入 / 研究联动
    initInfoTips(document);   // 分组标题旁的说明浮层
  }
  document.addEventListener("DOMContentLoaded", init);
})();
