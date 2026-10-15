/*! 战力公式内核 core.js
 *  唯一依据：反编译源码 NK_Common_System_Stat_StatUtility.cs
 *    Path : D:\Codex\Nikke\Nikke\outputs\词条战力拆包研究\临时\NK_Common_System_Stat_StatUtility.cs
 *    SHA256: 3b14e1e6093fd0e027fcf407b591fc966ad3934e0a5007e60424074f2c05cbe6
 *  常量来源：ConfigGameTable.json（实测值，非推测）
 *
 *  客户端公式：
 *    critFactor = 1 + CriticalRatio*1e-4*(CriticalDamage*1e-4 - 1)
 *    num3       = Attack * critFactor * AttackToBattlePower
 *    num4       = (Hp + Defense*DefenseToBattlePower) * HpToBattlePower
 *    num5       = SkillBaseToBattlePower + s1*Skill1ToBattlePower + s2*Skill2ToBattlePower
 *                 + burst*BurstSkillToBattlePower + itemStateEffectBattlePower*1e-4
 *    battlePower= round((num3 + num4) * num5 * 0.01)
 */
(function (root) {
  "use strict";

  var ELEMENT_KEY = "Locale_Skill:incelementdmg_description"; // 优越代码伤害（唯一 1.2 倍词条）

  function n(v, d) {
    var x = Number(v);
    return Number.isFinite(x) ? x : (d === undefined ? 0 : d);
  }

  function cfgNumber(cfg, key) { return n(cfg && cfg[key]); }

  /* ---------- 词条解析 ---------- */

  function findGroup(data, key) {
    for (var i = 0; i < data.overload.length; i++) {
      if (data.overload[i].key === key) return data.overload[i];
    }
    return null;
  }

  /** 词条游戏内显示的数值文本。
   *  实证：过载（Overload）九类词条在游戏内**统一以百分比显示**，
   *  数值 = |FunctionValue| / 100（如 攻击力 15 阶 FunctionValue=1463 → 14.63%）。
   *  表内 命中率 / 蓄力速度 为负值（内部方向），显示取绝对值。
   *  锚点：nikke.gg / gamevika / gamewith / rappy-world 四源 T1/T15 值与本表逐位吻合。 */
  function statValueText(data, key, level) {
    var lv = Math.trunc(n(level));
    if (!key || lv <= 0) return "";
    var g = findGroup(data, key);
    var row = g && g.levels[String(Math.min(15, lv))];
    if (!row || row.value === undefined || row.value === null) return "";
    return (Math.abs(Number(row.value)) / 100).toFixed(2) + "%";
  }

  function resolveOption(data, key, level) {
    var lv = Math.trunc(n(level));
    if (!key || lv <= 0) return { key: "", name: "空", level: 0, bp: 0, value: 0, valueText: "", isElement: false };
    var g = findGroup(data, key);
    var row = g && g.levels[String(Math.min(15, lv))];
    if (!row) return { key: key, name: g ? g.name : key, level: lv, bp: 0, value: 0, valueText: "", isElement: key === ELEMENT_KEY };
    return {
      key: key, name: g.name, level: lv, bp: row.bp, value: row.value,
      valueText: statValueText(data, key, lv),
      stateEffectId: row.stateEffectId, functionId: row.functionId,
      isElement: key === ELEMENT_KEY
    };
  }

  /** 单个部位（3 条词条）-> { bp: 内部战力合计, totalLevel: 等效总阶数(优越×1.2) } */
  function slotSummary(data, slots) {
    var bp = 0, totalLevel = 0, rows = [];
    (slots || []).forEach(function (s) {
      var r = resolveOption(data, s && s.key, s && s.level);
      rows.push(r);
      bp += r.bp;
      totalLevel += r.isElement ? r.level * 1.2 : r.level;
    });
    while (rows.length < 3) rows.push(resolveOption(data, "", 0));
    return { bp: bp, totalLevel: totalLevel, rows: rows };
  }

  /** 四部位整体 -> { bp, totalLevel, slots: {head,body,arms,legs} } */
  function gearSummary(data, gear) {
    var SLOTS = ["head", "body", "arms", "legs"];
    var out = { bp: 0, totalLevel: 0, slots: {} };
    SLOTS.forEach(function (k) {
      var s = slotSummary(data, gear[k] || []);
      out.slots[k] = s;
      out.bp += s.bp;
      out.totalLevel += s.totalLevel;
    });
    return out;
  }

  /* ---------- 战力计算 ---------- */

  function calcBattlePower(cfg, panel, internalBP) {
    var critFactor = 1 + n(panel.critRatio) * 1e-4 * (n(panel.critDamage) * 1e-4 - 1);
    var attackPart = n(panel.attack) * critFactor * cfgNumber(cfg, "AttackToBattlePower");
    var hpDefPart = (n(panel.hp) + n(panel.defense) * cfgNumber(cfg, "DefenseToBattlePower"))
      * cfgNumber(cfg, "HpToBattlePower");
    var skillFactor = cfgNumber(cfg, "SkillBaseToBattlePower")
      + n(panel.skill1) * cfgNumber(cfg, "Skill1ToBattlePower")
      + n(panel.skill2) * cfgNumber(cfg, "Skill2ToBattlePower")
      + n(panel.burst) * cfgNumber(cfg, "BurstSkillToBattlePower")
      + (n(panel.extraBP) + n(internalBP)) * 1e-4;
    var S = attackPart + hpDefPart;
    var raw = S * skillFactor * 0.01;
    return {
      value: Math.round(raw), raw: raw,
      attackPart: attackPart, hpDefPart: hpDefPart, S: S,
      skillFactor: skillFactor, critFactor: critFactor
    };
  }

  /** 洗前/洗后整体对比（含逐部位归因） */
  function compare(cfg, panel, data, beforeGear, afterGear) {
    var b = gearSummary(data, beforeGear);
    var a = gearSummary(data, afterGear);
    var bp = calcBattlePower(cfg, panel, b.bp);
    var ap = calcBattlePower(cfg, panel, a.bp);
    var rows = [];
    var runBP = b.bp, runVal = bp.value;
    ["head", "body", "arms", "legs"].forEach(function (k) {
      var d = a.slots[k].bp - b.slots[k].bp;
      var next = calcBattlePower(cfg, panel, runBP + d);
      rows.push({
        slot: k,
        beforeBP: b.slots[k].bp, afterBP: a.slots[k].bp, bpDelta: d,
        powerDelta: next.value - runVal
      });
      runBP += d; runVal = next.value;
    });
    return {
      before: b, after: a, beforePower: bp, afterPower: ap,
      bpDelta: a.bp - b.bp, powerDelta: ap.value - bp.value, gearRows: rows,
      totalLevelBefore: b.totalLevel, totalLevelAfter: a.totalLevel
    };
  }

  /** 单条词条替换预览：把 (slot,index) 换成 key@level，其余不动 */
  function singleSwap(cfg, panel, data, gear, slot, index, key, level) {
    var base = gearSummary(data, gear);
    var basePW = calcBattlePower(cfg, panel, base.bp).value;
    var clone = JSON.parse(JSON.stringify(gear));
    clone[slot][index] = { key: key, level: level };
    var after = gearSummary(data, clone);
    var afterPW = calcBattlePower(cfg, panel, after.bp).value;
    var cur = resolveOption(data, gear[slot][index] && gear[slot][index].key, gear[slot][index] && gear[slot][index].level);
    var tgt = resolveOption(data, key, level);
    return {
      current: cur, target: tgt, basePower: basePW, afterPower: afterPW,
      bpDelta: tgt.bp - cur.bp, powerDelta: afterPW - basePW
    };
  }

  /** 九类 × 15 阶 战力单价表（相对"当前词条不变"的增量） */
  function unitTable(cfg, panel, data) {
    var base = { bp: 0, totalLevel: 0, slots: {} };
    var zero = calcBattlePower(cfg, panel, 0);
    return data.overload.map(function (g) {
      var rows = [];
      for (var lv = 1; lv <= 15; lv++) {
        var r = resolveOption(data, g.key, lv);
        var withIt = calcBattlePower(cfg, panel, r.bp);
        rows.push({
          level: lv, bp: r.bp, value: r.value,
          powerDelta: withIt.value - zero.value,
          totalLevel: r.isElement ? lv * 1.2 : lv
        });
      }
      return { key: g.key, name: g.name, isElement: g.key === ELEMENT_KEY, rows: rows };
    });
    void base;
  }

  /** 标定：已知游戏内显示的战力 + 面板三围 + 技能等级，反解「附加状态效果战力」(魔方+收藏品技能战力)
   *  原理：extraBP 每 +1 单位使战力约 +S×1e-6；先解析求解，再在整数邻域内搜索使 round 完全命中的值。
   *  返回 { extraBP, exact, achieved }。 */
  function calibrate(cfg, panel, targetCombat, gear) {
    var internalBP = n(gear);
    var p = Object.assign({}, panel, { extraBP: 0 });
    var S = calcBattlePower(cfg, p, internalBP).S;
    var base = cfgNumber(cfg, "SkillBaseToBattlePower")
      + n(panel.skill1) * cfgNumber(cfg, "Skill1ToBattlePower")
      + n(panel.skill2) * cfgNumber(cfg, "Skill2ToBattlePower")
      + n(panel.burst) * cfgNumber(cfg, "BurstSkillToBattlePower");
    if (!(S > 0)) return { extraBP: 0, exact: false, achieved: null };
    var guess = ((n(targetCombat) / (S * 0.01)) - base) * 1e4;
    var lo = Math.floor(guess) - 3, hi = Math.ceil(guess) + 3;
    for (var v = lo; v <= hi; v++) {
      var got = calcBattlePower(cfg, Object.assign({}, panel, { extraBP: v }), internalBP).value;
      if (got === Math.round(n(targetCombat))) return { extraBP: v, exact: true, achieved: got };
    }
    var g = Math.round(guess);
    return { extraBP: g, exact: false, achieved: calcBattlePower(cfg, Object.assign({}, panel, { extraBP: g }), internalBP).value };
  }

  /* ---------- 确定性伪随机（mulberry32） ----------
   * 动机：原实现用 Math.random() 且无种子，而 app.js::compute() 结尾无条件重跑 renderSim()，
   * 导致「改任意部位、任意一行的词条 → 本部位的洗练分布整体跳变」。
   * 传入 opts.seed 后同一份输入必得同一份输出；不传则退回 Math.random()（保持旧语义）。 */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 按权重抽下标（权重全 0 时返回 -1，由调用方兜底） */
  function pickWeighted(weights, rng) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) { if (weights[i] > 0) total += weights[i]; }
    if (!(total > 0)) return -1;
    var r = rng() * total;
    for (i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      r -= weights[i];
      if (r < 0) return i;
    }
    for (i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return -1;
  }

  /* 洗练概率模型的缺省占位（**实测口径，非游戏逐阶真值**）
   *   类型权重（gamevika，9 类共 100）：优越 10 / 命中 12 / 装弹 12 / 攻击 10 / 蓄力伤害 12
   *                                      / 蓄力时间 12 / 暴击率 12 / 暴击伤害 10 / 防御 10
   *   阶数段概率（gamevika + fandom）：1~5 段 60% / 6~10 段 35% / 11~15 段 5%
   *   段内分布**未证实** → 这里按段内平均占位（1~5 各 12、6~10 各 7、11~15 各 1）。
   *   拿到拆包逐阶表后，把下面这个数组整体换掉即可，内核与 UI 都不用动。 */
  var LEVEL_TABLE_AVG = [12, 12, 12, 12, 12, 7, 7, 7, 7, 7, 1, 1, 1, 1, 1];

  /** 蒙特卡洛：多次洗练的战力分布。
   *  opts（全部可选，缺省 = 原「池内等概率 + 区间内均匀 + Math.random」行为，向后兼容）：
   *    pool       参与洗练的词条类型
   *    slots      每次重洗的行数
   *    rolls      抽样次数
   *    minLevel / maxLevel   阶数区间（未给 levelTable 时生效）
   *    keepBP     未参与洗练部分的内部战力（锁定保留）
   *    seed       确定性种子（缺省用 Math.random）
   *    typeWeights {key: weight} 类型权重（缺省等权）
   *    levelTable 长度 15 的逐阶权重（缺省用 min/max 区间均匀）
   *    mode       "change"（默认，类型+数值一起换）| "value"（只洗数值：类型不变只重掷阶数）
   *    curKeys    mode="value" 时每行保留的词条类型
   *    target     [{i, key, minLevel}] —— 给出时额外统计「全部目标行命中」的占比 p
   *  返回原字段 + { hit, p }（未给 target 时 p = null）。 */
  function simulate(cfg, panel, data, opts) {
    opts = opts || {};
    var pool = opts.pool && opts.pool.length ? opts.pool : data.overload.map(function (g) { return g.key; });
    var slots = Math.max(1, Math.trunc(n(opts.slots, 3)));
    var rolls = Math.max(1, Math.trunc(n(opts.rolls, 1000)));
    var minLv = Math.max(1, Math.trunc(n(opts.minLevel, 1)));
    var maxLv = Math.min(15, Math.trunc(n(opts.maxLevel, 15)));
    var keepBP = n(opts.keepBP, 0);           // 未参与洗练的词条内部战力
    var mode = opts.mode === "value" ? "value" : "change";
    var curKeys = opts.curKeys || [];
    var target = (opts.target && opts.target.length) ? opts.target : null;
    var rng = (opts.seed === undefined || opts.seed === null)
      ? Math.random : mulberry32(Math.trunc(n(opts.seed)));

    // 类型权重向量（与 pool 对齐）；未给或全 0 → null（回到等概率）
    var typeVec = null;
    if (opts.typeWeights) {
      typeVec = pool.map(function (k) { return Math.max(0, n(opts.typeWeights[k], 1)); });
      if (!typeVec.some(function (w) { return w > 0; })) typeVec = null;
    }
    // 阶数权重向量（长度 15）；未给 → null（回到区间均匀）
    var lvVec = null;
    if (opts.levelTable && opts.levelTable.length === 15) {
      lvVec = opts.levelTable.map(function (w) { return Math.max(0, n(w)); });
      if (minLv > 1 || maxLv < 15) {           // 定了区间就把区间外的权重清零
        for (var z = 0; z < 15; z++) if (z + 1 < minLv || z + 1 > maxLv) lvVec[z] = 0;
        if (!lvVec.some(function (w) { return w > 0; })) lvVec = null;
      }
    }

    var values = new Array(rolls);
    var sum = 0, min = Infinity, max = -Infinity, hit = 0;
    for (var i = 0; i < rolls; i++) {
      var set = [];
      var bp = keepBP;
      for (var s = 0; s < slots; s++) {
        var key;
        if (mode === "value") {
          key = curKeys[s] || pool[0];
        } else if (typeVec) {
          var ti = pickWeighted(typeVec, rng);
          key = pool[ti >= 0 ? ti : 0];
        } else {
          key = pool[Math.floor(rng() * pool.length)];
        }
        var lv;
        if (lvVec) {
          var li = pickWeighted(lvVec, rng);
          lv = (li >= 0 ? li : minLv - 1) + 1;
        } else {
          lv = minLv + Math.floor(rng() * (maxLv - minLv + 1));
        }
        lv = Math.max(minLv, Math.min(maxLv, lv));
        var r = resolveOption(data, key, lv);
        set.push({ key: key, level: lv });
        bp += r.bp;
      }
      var v = calcBattlePower(cfg, panel, bp).value;
      values[i] = v; sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      if (target) {
        var ok = true;
        for (var t = 0; t < target.length; t++) {
          var tg = target[t], got = set[tg.i];
          if (!got || got.key !== tg.key || got.level < Math.trunc(n(tg.minLevel))) { ok = false; break; }
        }
        if (ok) hit++;
      }
    }
    values.sort(function (a, b) { return a - b; });
    function pct(p) { return values[Math.min(values.length - 1, Math.floor(p * values.length))]; }
    return {
      rolls: rolls, mean: sum / rolls, min: min, max: max,
      p10: pct(0.10), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p90: pct(0.90),
      values: values,
      hit: hit, p: target ? (hit / rolls) : null
    };
  }

  root.NikkePowerCore = {
    ELEMENT_KEY: ELEMENT_KEY,
    SLOTS: ["head", "body", "arms", "legs"],
    LEVEL_TABLE_AVG: LEVEL_TABLE_AVG,
    resolveOption: resolveOption,
    statValueText: statValueText,
    slotSummary: slotSummary,
    gearSummary: gearSummary,
    calcBattlePower: calcBattlePower,
    compare: compare,
    singleSwap: singleSwap,
    unitTable: unitTable,
    calibrate: calibrate,
    simulate: simulate
  };
})(typeof window !== "undefined" ? window : globalThis);
