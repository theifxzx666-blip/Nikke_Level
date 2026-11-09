/*! pinkuro.js — 阿卡 Bot 官方 API 响应 → 本页 state 的映射层
 *
 *  数据源（2026-11-09 换成官方文档接口，旧 /api/nikke/public/combat/import 弃用）：
 *      GET https://pinkuro.top:9984/third/bot/nikke/v1/getUserInfo
 *      Header: X-API-KEY（阿卡机器人里取到的 Key）
 *      响应：{ success, message, data: { synchronizerLevel, elysionCorp…, characterList: [ … ] } }
 *      官方文档：https://pinkuro.top:9984/scalar.html
 *
 *  为什么能直连：官方 /third/bot/** 这组接口带 `Access-Control-Allow-Origin: *`，
 *  预检也放行 X-API-KEY，浏览器可以直连，不再需要中转/本机代理。
 *
 *  原则：
 *    ① 只取「明细」——词条类型/档位、装备等级、突破、收藏、技能；**不取对方算出的战力**，
 *       本页战力一律由 core.js/panel.js 自己推导。
 *    ② 官方接口**不返回**好感度（attractiveLv）与魔方（cubeLv/cubeName），这两项保留本地值，
 *       映射结果用 `report.provided` 标出来，由 UI 提示。
 *    ③ 对方 characterId 与本页 rid 是两套编号，**按名字匹配**（见 findRosterByName）。
 *
 *  词条编号（statNo）顺序由官方文档确认：
 *      0 优越 / 1 命中 / 2 装弹 / 3 攻击 / 4 蓄伤 / 5 蓄速 / 6 暴率 / 7 暴伤 / 8 防御
 *  与 data.bundle.js 的 overload 数组同序，故 STAT_NO_KEYS 直接按下标取。
 *  若日后顺序变化，只改 STAT_NO_KEYS 这一张表（9 行），其余逻辑不动。
 */
(function (root) {
  "use strict";

  var API_URL = "https://pinkuro.top:9984/third/bot/nikke/v1/getUserInfo";

  /* statNo（0~8）→ data.overload 里的 key，顺序 = data.bundle.js 的 overload 数组顺序 */
  var STAT_NO_KEYS = [
    "Locale_Skill:incelementdmg_description",        /* 0 优越代码伤害（1.2 倍） */
    "Locale_Skill:stataccuracycircle_description",   /* 1 命中率 */
    "Locale_Skill:statammo_description",             /* 2 最大装弹数 */
    "Locale_Skill:statatk_description",              /* 3 攻击力 */
    "Locale_Skill:statchargedamage_description",     /* 4 蓄力伤害 */
    "Locale_Skill:statchargetime_description",       /* 5 蓄力时间 */
    "Locale_Skill:statcriticaldamage_description",   /* 6 暴击率 */
    "Locale_Skill:statcritical_description",         /* 7 暴击伤害 */
    "Locale_Skill:statdef_description"               /* 8 防御力 */
  ];
  var STAT_NO_NAMES = ["优越代码", "命中率", "最大装弹", "攻击力", "蓄力伤害", "蓄力时间", "暴击率", "暴击伤害", "防御力"];

  /* 官方 slotNo：0 头 / 1 衣 / 2 手 / 3 鞋 */
  var SLOT_BY_NO = { 0: "head", 1: "body", 2: "arms", 3: "legs" };
  var SLOT_ORDER = ["head", "body", "arms", "legs"];

  /* 企业：1 极乐净土 / 2 米西利斯 / 3 泰特拉 / 4 朝圣者 / 5·6·7 反常 */
  var CORP_FIELD = { 1: "elysionCorp", 2: "missilisCorp", 3: "tetraCorp", 4: "pilgrimCorp", 5: "abnormalCorp", 6: "abnormalCorp", 7: "abnormalCorp" };
  /* 职业：1 火力 / 2 防御 / 3 辅助 */
  var CLS_FIELD = { 1: "fireType", 2: "defenseType", 3: "supportType" };

  var GEAR_LV_MAX = 5;
  var STAT_LV_MAX = 15;

  function num(v, d) {
    var x = Number(v);
    return Number.isFinite(x) ? x : (d === undefined ? 0 : d);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.trunc(num(v)))); }
  function has(v) { return v !== undefined && v !== null && v !== ""; }
  /* 名字归一：去空白、全角冒号转半角、去「（真）」之类括注后再兜底比较 */
  function normName(s) {
    return String(s == null ? "" : s)
      .replace(/\s+/g, "")
      .replace(/：/g, ":")
      .replace(/[（(].*?[）)]/g, "")
      .toLowerCase();
  }
  function findRosterByName(data, name) {
    var roster = (data && data.roster) || [];
    var key = normName(name), i;
    for (i = 0; i < roster.length; i++) if (roster[i].name === name) return roster[i];
    for (i = 0; i < roster.length; i++) if (normName(roster[i].name) === key) return roster[i];
    /* 末级兜底：拼音 / 缩写 */
    var compact = String(name || "").replace(/\s+/g, "").toLowerCase();
    for (i = 0; i < roster.length; i++) {
      if (roster[i].py && roster[i].py === compact) return roster[i];
      if (roster[i].ini && roster[i].ini === compact) return roster[i];
    }
    return null;
  }

  /** 只认官方结构：{success, data:{characterList:[]}} */
  function pickUserInfo(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.success === false) return null;
    var d = raw.data && typeof raw.data === "object" ? raw.data : null;
    if (!d) return null;
    return Array.isArray(d.characterList) ? d : null;
  }

  /** 单角色：equipmentInfos[4] → { head:{lv,rows}, … } */
  function mapGearFromEquip(infos) {
    var out = {}, bySlot = {};
    (Array.isArray(infos) ? infos : []).forEach(function (e) {
      var slot = SLOT_BY_NO[num(e && e.slotNo, -1)];
      if (slot && !bySlot[slot]) bySlot[slot] = e;          /* 同部位重复上报只认第一条 */
    });
    SLOT_ORDER.forEach(function (slot) {
      var e = bySlot[slot] || {};
      var rows = [];
      var stats = Array.isArray(e.statInfos) ? e.statInfos : [];
      stats.forEach(function (si) {
        if (!si) return;
        var no = Math.trunc(num(si.statNo, -1));
        var lvl = clamp(si.statValueLevel, 0, STAT_LV_MAX);
        var key = (no >= 0 && no < STAT_NO_KEYS.length && lvl > 0) ? STAT_NO_KEYS[no] : "";
        if (!key) return;
        if (rows.some(function (r) { return r && r.key === key; })) return;   /* 同件装备不重复词条 */
        var idx = Math.trunc(num(si.index, 1)) - 1;                          /* index 1~3 */
        if (idx < 0 || idx > 2 || rows[idx]) { for (var i = 0; i < 3; i++) if (!rows[i]) { idx = i; break; } }
        rows[idx] = { key: key, level: lvl };
      });
      for (var i = 0; i < 3; i++) if (!rows[i]) rows[i] = { key: "", level: 0 };
      out[slot] = {
        lv: has(e.lv) ? clamp(e.lv, 0, GEAR_LV_MAX) : 0,
        before: rows,
        after: JSON.parse(JSON.stringify(rows))
      };
    });
    return out;
  }

  /** 词条总阶数：Σ档位 + 0.2×优越档位（与旧服务端 statTotalValue 同口径，仅作展示） */
  function statTotal(gear) {
    var plain = 0, elem = 0;
    SLOT_ORDER.forEach(function (slot) {
      (gear[slot] ? gear[slot].before : []).forEach(function (r) {
        if (!r || !r.key) return;
        plain += num(r.level);
        if (r.key === STAT_NO_KEYS[0]) elem += num(r.level);
      });
    });
    return Math.round((plain + 0.2 * elem) * 100) / 100;
  }

  /**
   * 主入口。
   * @param {object} raw  官方 getUserInfo 原始响应
   * @param {object} data data.bundle.js 的 NIKKE_POWER_DATA（用于按名字找 rid / corp / cls）
   * @returns {{ok:boolean, message?:string, account:object, characters:Array, report:object}}
   */
  function mapBundle(raw, data) {
    var d = pickUserInfo(raw);
    if (!d) {
      var msg = (raw && raw.success === false && raw.message) ? String(raw.message) : "响应结构无法识别（不是官方 getUserInfo 结构）";
      return { ok: false, message: msg, account: null, characters: [], report: null };
    }
    var account = {
      qq: null,                                   /* 官方接口不再返回 QQ 号 */
      playerName: has(d.playerName) ? String(d.playerName) : null,
      level: has(d.synchronizerLevel) ? clamp(d.synchronizerLevel, 1, 1400) : null,
      rp: null,                                   /* 响应无「通用研究（个人）」字段 */
      corp: {
        1: num(d.elysionCorp, 0),
        2: num(d.missilisCorp, 0),
        3: num(d.tetraCorp, 0),
        4: num(d.pilgrimCorp, 0),
        5: num(d.abnormalCorp, 0),
        6: num(d.abnormalCorp, 0),
        7: num(d.abnormalCorp, 0)
      },
      cls: { 1: num(d.fireType, 0), 2: num(d.defenseType, 0), 3: num(d.supportType, 0) },
      updatedAt: null
    };

    var list = Array.isArray(d.characterList) ? d.characterList : [];
    var characters = [], missing = [], slotOk = 0, attrN = 0, cubeN = 0, statTotalSum = 0;

    list.forEach(function (it) {
      var name = String(it.characterName || "").trim();
      var hit = findRosterByName(data, name);
      var gear = mapGearFromEquip(it.equipmentInfos);
      var patch = {
        bt: clamp(it.breakthroughLevel, 0, 10),
        /* 没有收藏品的角色，接口直接不返回 collectionRarity → 置空（与旧口径一致） */
        coll: has(it.collectionRarity) ? String(it.collectionRarity) : null,
        collLv: has(it.collectionRarity) ? clamp(it.collectionLv, 0, 15) : 0,
        skill1: clamp(it.skill1Lv, 1, 10),
        skill2: clamp(it.skill2Lv, 1, 10),
        burst: clamp(it.ultiSkillLv, 1, 10)
      };
      /* 好感度 / 魔方：官方接口不返回 → 不覆盖本地（report.provided 里计数为 0） */
      if (has(it.attractiveLv)) { patch.attr = clamp(it.attractiveLv, 0, 40); attrN++; }
      if (has(it.cubeLv)) { patch.cubeLv = clamp(it.cubeLv, 0, 15); cubeN++; }
      /* 收藏品稀有度必须落在该角色真实拥有的档位里，否则置空避免推导取错表 */
      if (patch.coll && hit && hit.coll && !hit.coll[patch.coll]) patch.coll = null;

      var slots = (Array.isArray(it.equipmentInfos) ? it.equipmentInfos : []).length;
      if (slots >= 4) slotOk++;
      var total = statTotal(gear);
      statTotalSum += total;
      if (!hit) missing.push(name);

      characters.push({
        name: name,
        rid: hit ? hit.rid : null,
        corp: hit ? hit.corp : null,
        cls: hit ? hit.cls : null,
        patch: patch,
        gear: gear,
        recycle: hit ? { corp: account.corp[hit.corp] || 0, cls: account.cls[hit.cls] || 0 } : null,
        statTotalValue: total
      });
    });

    return {
      ok: true,
      account: account,
      characters: characters,
      report: {
        total: list.length,
        matched: characters.length - missing.length,
        missing: missing,
        slotOk: slotOk,
        statTotalSum: Math.round(statTotalSum * 100) / 100,
        provided: { attr: attrN, cube: cubeN },
        names: STAT_NO_NAMES
      }
    };
  }

  /** 一个角色一条文字摘要（用于同步日志，不参与计算） */
  function describe(rec) {
    if (!rec) return "";
    var p = rec.patch;
    var slots = SLOT_ORDER.map(function (s) {
      var rows = rec.gear[s].before.filter(function (r) { return r.key; });
      return s + " lv" + rec.gear[s].lv + "[" + rows.map(function (r) {
        var i = STAT_NO_KEYS.indexOf(r.key);
        return (i >= 0 ? STAT_NO_NAMES[i] : "?") + r.level;
      }).join(" ") + "]";
    });
    return rec.name + " 突" + p.bt + (p.attr === undefined ? "" : " 好" + p.attr)
      + (p.cubeLv === undefined ? "" : " 魔" + p.cubeLv)
      + " " + (p.coll || "无") + p.collLv + " 技" + p.skill1 + "/" + p.skill2 + "/" + p.burst + " | " + slots.join(" ");
  }

  root.NikkePinkuro = {
    API_URL: API_URL,
    STAT_NO_KEYS: STAT_NO_KEYS,
    STAT_NO_NAMES: STAT_NO_NAMES,
    SLOT_ORDER: SLOT_ORDER,
    SLOT_BY_NO: SLOT_BY_NO,
    CORP_FIELD: CORP_FIELD,
    CLS_FIELD: CLS_FIELD,
    normName: normName,
    findRosterByName: findRosterByName,
    pickUserInfo: pickUserInfo,
    mapGearFromEquip: mapGearFromEquip,
    statTotal: statTotal,
    mapBundle: mapBundle,
    describe: describe
  };
})(typeof window !== "undefined" ? window : globalThis);
