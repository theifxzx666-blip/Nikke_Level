/*! pinkuro.js — Pinkuro 练度响应 → 本页 state 的映射层
 *
 *  数据源：GET https://pinkuro.top:9984/api/nikke/public/combat/import
 *          （ArcanaHelper 客户端采集后写库的结果，Header 鉴权 X-API-KEY）
 *
 *  原则（2026-10-28 定稿）：
 *    ① 只取「明细」——词条类型/阶数、装备等级、突破、好感、收藏、技能、魔方等级、企业与职业研究等级；
 *       **不取对方算出的战力**，本页战力一律由 core.js/panel.js 自己推导。
 *    ② 魔方类型无信息量（16 个魔方 stats/bp 逐元素相同），只同步等级。
 *    ③ 对方 characterId 与本页 rid 是两套编号，**按名字匹配**。
 *
 *  词条编号映射的证据（详见 00-任务书/任务书.md 第二阶段 §3.3）：
 *    E1 强证：statTotalValue = Σ阶数 + 0.2×Σ(某类阶数)，穷举 X∈0..8 只有 X=0 时 27/27 角色全中
 *             → index 0 = 优越代码伤害（唯一 1.2 倍词条）
 *    E2 佐证：拆包 EquipmentOptionTable 九组编号同步递增（seGrp 100100→100900 / seId 7000501→7001301
 *             / optionRecordId 1001001→1009001），首组即优越代码，与 data.bundle.js 的 overload 同序
 *    E3 佐证：300 条词条频次 优越73 > 攻击39 > 暴伤32 > 装弹26 > 防御20 = 蓄时20 > 暴率18 > 命中13 > 蓄伤12
 *    E4 强证：第 4 组为空的角色（拉普拉斯/安克）恰好 legEquipmentLv=null && legEquipmentAvailable=false
 *             → 第 4 组 = 腿（鞋子）
 *
 *  若日后游戏内核对发现类型顺序不符，只需改下面 STAT_NO_KEYS 这一张表（9 行），其余逻辑不动。
 */
(function (root) {
  "use strict";

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

  /* 部位顺序：第 4 组强实证为腿；前 3 组依字段命名（head/torso/arm）与游戏 UI 顺序 */
  var SLOT_ORDER = ["head", "body", "arms", "legs"];

  /* 企业：Corporation 1 极乐净土 / 2 米西利斯 / 3 泰特拉 / 4 朝圣者 / 5·6·7 反常 */
  var CORP_FIELD = { 1: "elysionCorp", 2: "missilisCorp", 3: "tetraCorp", 4: "pilgrimCorp", 5: "abnormalCorp", 6: "abnormalCorp", 7: "abnormalCorp" };
  /* 职业：Class 1 火力 / 2 防御 / 3 辅助 */
  var CLS_FIELD = { 1: "fireType", 2: "defenseType", 3: "supportType" };

  var GEAR_LV_MAX = 5;

  function num(v, d) {
    var x = Number(v);
    return Number.isFinite(x) ? x : (d === undefined ? 0 : d);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.trunc(num(v)))); }
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

  /** 从响应里剥出 cnData，兼容 {data:{cnData}} / {cnData} / cnData 三种形态 */
  function pickCnData(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.data && raw.data.cnData) return raw.data.cnData;
    if (raw.cnData) return raw.cnData;
    if (raw.userInfo || raw.characters) return raw;
    return null;
  }

  /** 单角色：4 组 statNo/阶数 → { head:{lv,rows}, … } */
  function mapGear(it) {
    var nos = it.equipmentStatNos || [];
    var vals = it.equipmentStatValueNos || [];
    var lvMap = {
      head: it.headEquipmentLv,
      body: it.torsoEquipmentLv,
      arms: it.armEquipmentLv,
      legs: it.legEquipmentLv
    };
    var out = {};
    SLOT_ORDER.forEach(function (slot, i) {
      var lv = clamp(lvMap[slot], 0, GEAR_LV_MAX);
      var a = nos[i], b = vals[i];
      var rows = [];
      for (var j = 0; j < 3; j++) {
        var no = (a && a[j] !== undefined && a[j] !== null) ? Math.trunc(num(a[j], -1)) : -1;
        var lvl = (b && b[j] !== undefined && b[j] !== null) ? clamp(b[j], 0, 15) : 0;
        /* 同一件装备不会重复词条：类型为空或越界即置空（与 app.js normalizeGear 口径一致） */
        var key = (no >= 0 && no < STAT_NO_KEYS.length && lvl > 0) ? STAT_NO_KEYS[no] : "";
        if (key && rows.some(function (r) { return r.key === key; })) key = "";
        rows.push({ key: key, level: key ? lvl : 0 });
      }
      out[slot] = { lv: lv, before: rows, after: JSON.parse(JSON.stringify(rows)) };
    });
    return out;
  }

  /** 阶数自检：Σ阶数 + 0.2×Σ(优越阶数) 应等于响应里的 statTotalValue（只用于校验，不入库） */
  function checkStatTotal(it) {
    var nos = it.equipmentStatNos || [];
    var vals = it.equipmentStatValueNos || [];
    var plain = 0, elem = 0;
    for (var i = 0; i < nos.length; i++) {
      var a = nos[i] || [], b = vals[i] || [];
      for (var j = 0; j < a.length; j++) {
        if (a[j] === null || a[j] === undefined || b[j] === null || b[j] === undefined) continue;
        plain += num(b[j]);
        if (Math.trunc(num(a[j])) === 0) elem += num(b[j]);
      }
    }
    var calc = Math.round((plain + 0.2 * elem) * 100) / 100;
    var want = Number(it.statTotalValue);
    return { calc: calc, want: Number.isFinite(want) ? want : null, ok: Number.isFinite(want) ? Math.abs(calc - want) < 0.01 : null };
  }

  /**
   * 主入口。
   * @param {object} raw  接口原始响应（任意上述形态）
   * @param {object} data data.bundle.js 的 NIKKE_POWER_DATA（用于按名字找 rid / corp / cls）
   * @returns {{ok:boolean, account:object, characters:Array, report:object}}
   */
  function mapBundle(raw, data) {
    var cn = pickCnData(raw);
    if (!cn) return { ok: false, message: "响应结构无法识别（找不到 cnData）", account: null, characters: [], report: null };
    var ui = cn.userInfo || {};
    var account = {
      qq: cn.userQQId || ui.userQQId || null,
      level: clamp(ui.synchronizerLevel, 1, 1400) || null,
      rp: null,                                   /* 响应无「通用研究（个人）」字段 */
      corp: {
        1: num(ui.elysionCorp, 0),
        2: num(ui.missilisCorp, 0),
        3: num(ui.tetraCorp, 0),
        4: num(ui.pilgrimCorp, 0),
        5: num(ui.abnormalCorp, 0),
        6: num(ui.abnormalCorp, 0),
        7: num(ui.abnormalCorp, 0)
      },
      cls: { 1: num(ui.fireType, 0), 2: num(ui.defenseType, 0), 3: num(ui.supportType, 0) },
      updatedAt: ui.updateTime || null
    };

    var list = Array.isArray(cn.characters) ? cn.characters : [];
    var characters = [], missing = [], verifyOk = 0, verifyBad = [];

    list.forEach(function (it) {
      var name = String(it.characterName || "").trim();
      var u = it.userCharacter || {};
      var hit = findRosterByName(data, name);
      var chk = checkStatTotal(it);
      if (chk.ok) verifyOk++;
      else if (chk.ok === false) verifyBad.push(name);

      var patch = {
        bt: clamp(u.breakthroughLevel, 0, 10),
        attr: clamp(it.attractiveLvMax, 0, 40),
        cubeLv: clamp(u.cubeLv, 0, 15),
        coll: u.collectionRarity || null,
        collLv: clamp(u.collectionLv, 0, 15),
        skill1: clamp(u.skill1Lv, 1, 10),
        skill2: clamp(u.skill2Lv, 1, 10),
        burst: clamp(u.ultiSkillLv, 1, 10)
      };
      /* 收藏品稀有度必须落在该角色真实拥有的档位里，否则置空避免推导取错表 */
      if (patch.coll && hit && hit.coll && !hit.coll[patch.coll]) patch.coll = null;

      var rec = {
        name: name,
        rid: hit ? hit.rid : null,
        corp: hit ? hit.corp : null,
        cls: hit ? hit.cls : null,
        pinkuroId: u.characterId,
        patch: patch,
        gear: mapGear(it),
        recycle: hit ? { corp: account.corp[hit.corp] || 0, cls: account.cls[hit.cls] || 0 } : null,
        verify: chk
      };
      if (!hit) missing.push(name);
      characters.push(rec);
    });

    return {
      ok: true,
      account: account,
      characters: characters,
      report: {
        total: list.length,
        matched: characters.length - missing.length,
        missing: missing,
        verifyOk: verifyOk,
        verifyBad: verifyBad,
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
    return rec.name + " 突" + p.bt + " 好" + p.attr + " 魔" + p.cubeLv + " " + (p.coll || "无") + p.collLv
      + " 技" + p.skill1 + "/" + p.skill2 + "/" + p.burst + " | " + slots.join(" ");
  }

  root.NikkePinkuro = {
    STAT_NO_KEYS: STAT_NO_KEYS,
    STAT_NO_NAMES: STAT_NO_NAMES,
    SLOT_ORDER: SLOT_ORDER,
    CORP_FIELD: CORP_FIELD,
    CLS_FIELD: CLS_FIELD,
    normName: normName,
    findRosterByName: findRosterByName,
    pickCnData: pickCnData,
    mapGear: mapGear,
    checkStatTotal: checkStatTotal,
    mapBundle: mapBundle,
    describe: describe
  };
})(typeof window !== "undefined" ? window : globalThis);
