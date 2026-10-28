/*! 练度 → 面板 推导内核 panel.js
 *  唯一依据：反编译源码
 *    NK_Common_System_Stat_CharacterStatHelper.cs  （Group1/Group2 分组 + 核心率）
 *    NK_Common_System_Stat_StatCalculateInfo.cs    （Builder 取值链：等级/星级/好感/装备/魔方/收藏品/循环室）
 *    NK_Common_System_Stat_StatUtility.cs          （CalcEquipWithoutCorp / CalcHarmonyStat / CalcFavoriteItemStat / CalcItemStateEffectBattlePower）
 *
 *  客户端链条：
 *    Group1 = (CharacterStatTable[增强组,等级] × 星级 + 循环室 + 好感) × (1 + 核心×0.02)
 *    Group2 = 装备 + 魔方 + 收藏品
 *    面板    = Group1 + Group2
 *    itemStateEffectBattlePower = 过载词条 + 魔方技能 + 收藏品技能
 *
 *  本文件与参考站 pinkuro.top 逐位对拍一致（13/13 用例，2026-10-13）。
 */
(function (root) {
  "use strict";

  /** C# Convert.ToInt64(double)：四舍六入五成双（与客户端一致，不可换成 Math.round） */
  function bankRound(x) {
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  }

  function pick(list, i) { return (list && i >= 0 && i < list.length) ? list[i] : null; }

  function findRoster(data, rid) {
    for (var i = 0; i < data.roster.length; i++) if (data.roster[i].rid === rid) return data.roster[i];
    return null;
  }
  function findCubes(data) { return data.cubes || []; }
  function findCube(data, id) {
    var c = findCubes(data);
    for (var i = 0; i < c.length; i++) if (c[i].id === id) return c[i];
    return c[0] || null;
  }

  /**
   * 推导面板。
   * loadout = {
   *   rid, level, breakthrough(0..10), attrLv(0..40),
   *   equip:{1:0..5,2:..,3:..,4:..},          // 1头 2胸 3臂 4腿（ItemSubType）
   *   cubeId, cubeLv(0..15),
   *   collRarity:"R"|"SR"|"SSR"|null, collLv,
   *   recycle:{personal, cls, corp},
   *   corpBonus:false                        // 同厂加成开关（参考站不开；客户端逻辑待验证）
   * }
   * 返回 { atk, hp, def, extraBP, detail:{...} }
   */
  function derive(data, lo) {
    var ch = findRoster(data, lo.rid);
    if (!ch) return { error: "未找到角色" };
    var out = { atk: 0, hp: 0, def: 0, extraBP: 0, detail: {}, warn: [] };

    /* ---- 基础表 + 星级 ---- */
    var bt = Math.max(0, Math.min(10, Math.trunc(lo.breakthrough || 0)));
    var gcid = ch.gc[bt];
    var gc = data.gradeCore[String(gcid)] || { grade: 0, core: 0 };
    var enh = data.enhance[String(ch.enh)] || { gr: 0, gh: 0, ga: 0, gd: 0, ch: 0, ca: 0, cd: 0 };
    var curve = data.curves[String(ch.enh)];
    var lvl = Math.max(1, Math.trunc(lo.level || 1));
    var maxLv = (data.curvesMax || {})[String(ch.enh)] || (curve ? curve.length : 0);
    if (lvl > maxLv) { out.warn.push("等级超表上限 " + maxLv + "，已截断"); lvl = maxLv; }
    var base = curve && curve[lvl - 1];
    if (!base) return { error: "属性曲线缺失" };
    var bHp = base[0], bAtk = base[1], bDef = base[2];

    var g = gc.grade, core = gc.core;
    var mult = 1 + g * enh.gr * 1e-4;
    var atk1 = Math.floor(bAtk * mult + g * enh.ga);
    var def1 = Math.floor(bDef * mult + g * enh.gd);
    var hp1  = Math.floor(bHp  * mult + g * enh.gh);
    out.detail.base = { atk: atk1, hp: hp1, def: def1, grade: g, core: core, gcid: gcid };
    out.detail.level = lvl;

    /* ---- 循环室：个人 + 职业 + 厂商 ---- */
    var rp = Math.max(0, Math.trunc((lo.recycle && lo.recycle.personal) || 0));
    var rc = Math.max(0, Math.trunc((lo.recycle && lo.recycle.cls) || 0));
    var rk = Math.max(0, Math.trunc((lo.recycle && lo.recycle.corp) || 0));
    var REC_CLS  = { 1: 2, 2: 3, 3: 4 };
    var REC_CORP = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 7: 9 };
    [[rp, 1], [rc, REC_CLS[ch.cls]], [rk, REC_CORP[ch.corp]]].forEach(function (p) {
      var rec = data.recycle[String(p[1])];
      if (rec && p[0]) { atk1 += p[0] * rec[0]; def1 += p[0] * rec[1]; hp1 += p[0] * rec[2]; }
    });
    out.detail.recycle = { personal: rp, cls: rc, corp: rk };

    /* ---- 好感度（绝对值） ---- */
    var attrLv = Math.max(0, Math.trunc(lo.attrLv || 0));
    var a = data.attractive[String(attrLv)];
    if (a) {
      var key = ch.cls === 1 ? "a" : (ch.cls === 2 ? "d" : "s");
      var v = a[key];
      atk1 += v[0]; def1 += v[1]; hp1 += v[2];
    }
    out.detail.attrLv = attrLv;

    /* ---- Group1 × (1 + 核心率) ---- */
    var atk = bankRound(atk1 * (1 + core * enh.ca * 1e-4));
    var def = bankRound(def1 * (1 + core * enh.cd * 1e-4));
    var hp  = bankRound(hp1  * (1 + core * enh.ch * 1e-4));

    /* ---- Group2-装备（T10 常驻） ---- */
    var eqT = (data.equipT10 || {})[String(ch.cls)];
    var eqLv = (lo.equip || {});
    if (eqT) {
      [1, 2, 3, 4].forEach(function (sub) {
        var t = eqT[String(sub)];
        if (!t) return;
        var lv = Math.max(0, Math.min(5, Math.trunc(eqLv[sub] || 0)));
        var r = lv * 0.1;
        [[0, "atk"], [1, "hp"], [2, "def"]].forEach(function (m) {
          var b = t[m[0]];
          if (!b) return;
          var val = b + bankRound(b * r);
          if (lo.corpBonus) val += bankRound(b * 0.3);
          if (m[1] === "atk") atk += val; else if (m[1] === "hp") hp += val; else def += val;
        });
      });
    }

    /* ---- Group2-魔方 ----
     * 类型不参与计算（2026-10-28 定稿）：静态表 16 款魔方（1000301~1000316）的 stats 与 bp
     * 两组数组**逐元素完全相同**，类型不产生任何差异 → 只按等级取表，固定用第一款。
     * 页面上的魔方类型下拉已移除，cubeId 仅作为旧存档兼容字段保留。 */
    var cubeBP = 0;
    var cubeLv = Math.max(0, Math.min(15, Math.trunc(lo.cubeLv || 0)));
    if (cubeLv) {
      var cube = findCubes(data)[0] || findCube(data, lo.cubeId);
      if (cube) {
        var cs = pick(cube.stats, cubeLv - 1);
        if (cs) { atk += cs[0]; hp += cs[1]; def += cs[2]; }
        cubeBP = pick(cube.bp, cubeLv - 1) || 0;
      } else out.warn.push("未找到魔方");
    }
    out.detail.cube = { id: lo.cubeId, lv: cubeLv, bp: cubeBP };

    /* ---- Group2-收藏品 ---- */
    var collBP = 0;
    var collLv = Math.max(0, Math.trunc(lo.collLv || 0));
    var collItem = null;
    if (lo.collRarity) {
      var bucket = (data.favorites || {})[lo.collRarity] || {};
      if (lo.collRarity === "SSR") {
        // 专属收藏品按角色绑定 id 反查（FavoriteItemTable.NameCode → CharacterTable.NameCode）
        for (var k in bucket) {
          if (bucket[k] && (bucket[k].id === (ch.coll && ch.coll.SSR))) { collItem = bucket[k]; break; }
        }
      } else {
        collItem = bucket[String(ch.weapon)] || null;
      }
      if (collItem && collLv) {
        var fs = pick(collItem.stats, collLv);
        if (fs) { atk += fs[0]; hp += fs[1]; def += fs[2]; }
        collBP = pick(collItem.bp, collLv) || 0;
      }
    }
    out.detail.coll = { rarity: lo.collRarity, lv: collLv, bp: collBP, id: collItem && collItem.id };

    out.atk = atk; out.hp = hp; out.def = def;
    out.detail.group1 = { atk: atk1, hp: hp1, def: def1, coreRate: 1 + core * enh.ca * 1e-4 };
    out.detail.cubeBP = cubeBP;
    out.detail.collBP = collBP;
    out.extraBP = cubeBP + collBP;   // 物品状态效果战力（不含过载词条）
    return out;
  }

  /** 角色可用上限（星级→最大好感、收藏品等） */
  function limits(data, rid) {
    var ch = findRoster(data, rid);
    if (!ch) return null;
    var out = [];
    ch.gc.forEach(function (gcid, i) {
      var gc = data.gradeCore[String(gcid)];
      out.push({ breakthrough: i, gcid: gcid, grade: gc.grade, core: gc.core, maxAttr: gc.maxAttr, maxLevel: gc.maxLevel });
    });
    return out;
  }

  /** 4 档位同步器预览：给定练度，把同步器等级换成 4 个候选档，返回各档面板与战力 */
  function tierPreview(data, lo, cfg, core, tiers) {
    var res = [];
    (tiers || []).forEach(function (lv) {
      var c = JSON.parse(JSON.stringify(lo));
      c.level = lv;
      var d = derive(data, c);
      if (d.error) { res.push({ level: lv, error: d.error }); return; }
      var bp = core.calcBattlePower(cfg, {
        attack: d.atk, hp: d.hp, defense: d.def,
        critRatio: rosterCritR(data, lo.rid), critDamage: rosterCritD(data, lo.rid),
        skill1: lo.skill1, skill2: lo.skill2, burst: lo.burst,
        extraBP: d.extraBP
      }, 0);
      res.push({ level: lv, atk: d.atk, hp: d.hp, def: d.def, bp: bp.value });
    });
    return res;
  }

  function rosterCritR(data, rid) { var c = findRoster(data, rid); return c ? c.critR : 1500; }
  function rosterCritD(data, rid) { var c = findRoster(data, rid); return c ? c.critD : 15000; }

  root.NikkePanel = {
    bankRound: bankRound,
    derive: derive,
    limits: limits,
    tierPreview: tierPreview,
    findRoster: findRoster,
    critR: rosterCritR,
    critD: rosterCritD
  };
})(typeof window !== "undefined" ? window : globalThis);
