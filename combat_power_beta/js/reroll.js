/*! 洗词条概率与消耗模型 reroll.js
 *
 *  口径来源（逐条对齐，非自创）：ChrisLu7899/NIKKE-Workshop（GPL-3.0-or-later）
 *    src/calculator/engine.js         SLOT_PROBS = [1, 0.5, 0.3]
 *                                     TIER_PROBS = 5×12 + 5×7 + 5×1（合计 100）
 *                                     STAT_PROBS_BASE 九类词条权重 10 / 12
 *                                     换词条时同一次重洗内「类型不重复」，且不与锁定行的类型重复
 *                                     洗数值（重置属性）只重抽目标词条的档位，类型不变
 *    src/calculator/forcedRetention.js lockTransitionCost：锁第 a 条付 a+1 颗 ⇒ 锁 1/2/3 条累计 2/5/9
 *                                     rerollStoneCost：每次重洗 = 锁定条数 + 1 颗
 *    src/calculator/calculationRules.js 国服 = 旧规则：结果直接覆盖，可能抽到与当前完全相同的档位
 *                                     国际服 = 新规则：排除与当前完全相同的档位，且可保留原结果
 *    src/calculator/duplicateReroll.js  duplicateSafeTierOutcomes：排除当前档位后重新归一
 *
 *  三种玩法（对应游戏里的两个按钮 + 常用路线）：
 *    change  只洗词条（变更效果）—— 类型和档位都要一次抽到位
 *    value   只洗数值（重置属性）—— 目标词条必须已经在盘面上，只重抽档位
 *    auto    先洗词条拿到「名字」（档位随缘，达标就赚），再洗数值把档位拉上去 ← 实际最省
 *
 *  本文件只算「概率 / 期望消耗」，不碰 DOM、不碰面板三围，可在 Node 里直接单测。
 *  状态按「哪个词条位锁着哪个目标」枚举（≤ 34 个），精确求解，不是蒙特卡洛。
 */
(function (root) {
  "use strict";

  /* 三个词条位「本次重洗出词条」的概率：1 号位必出，2 / 3 号位要解禁 */
  var SLOT_APPEAR = [1, 0.5, 0.3];
  /* 阶数权重：1~5 各 12 / 6~10 各 7 / 11~15 各 1 */
  var TIER_WEIGHT = [12, 12, 12, 12, 12, 7, 7, 7, 7, 7, 1, 1, 1, 1, 1];
  var TIER_TOTAL = 100;

  function clampTier(v) {
    var t = Math.trunc(Number(v) || 0);
    return t < 1 ? 1 : (t > 15 ? 15 : t);
  }

  /** 阶数 ≥ minTier 的概率；excludeTier 给定时按「排除该档后归一」处理（国际服新规则） */
  function tierOkProb(minTier, excludeTier) {
    var t = clampTier(minTier);
    var ok = 0, i;
    for (i = t - 1; i < 15; i++) ok += TIER_WEIGHT[i];
    var ex = (excludeTier >= 1 && excludeTier <= 15) ? TIER_WEIGHT[excludeTier - 1] : 0;
    if (!ex) return ok / TIER_TOTAL;
    var den = TIER_TOTAL - ex;
    if (den <= 0) return 0;
    if (excludeTier >= t) ok -= ex;        // 被排除的那档本身达标，要从分子里扣掉
    return ok / den;
  }

  /** 洗数值时「每次重洗达标」的长期命中率。
   *  国服（旧规则）：档位权重原样 ⇒ 就是 tierOkProb。
   *  国际服（新规则）：抽到与当前相同档位会被重抽，于是当前档位越常见越吃亏。
   *  对 15 档链求稳态（π_x ∝ w_x·(100-w_x)）后加权，得闭式：
   *      q̄ = (100·Σok − Σ_{ok} w²) / (100² − Σ w²)
   *  下限/上限截到 (0,1]；minTier=1 时退化为 1。 */
  function valueRate(minTier, rule) {
    var t = clampTier(minTier);
    if (rule !== "global") return tierOkProb(t);
    var okSum = 0, okSq = 0, allSq = 0, i;
    for (i = 0; i < 15; i++) {
      var w = TIER_WEIGHT[i];
      allSq += w * w;
      if (i + 1 >= t) { okSum += w; okSq += w * w; }
    }
    if (okSum <= 0) return 0;
    if (okSum >= 100) return 1;
    var den = 10000 - allSq;
    if (den <= 0) return tierOkProb(t);
    var q = (100 * okSum - okSq) / den;
    return q > 1 ? 1 : (q < 0 ? 0 : q);
  }

  /** 锁到 from+1 .. to 条的一次性费用：锁第 a 条付 a+1 颗 ⇒ 1 条 2 / 2 条 5 / 3 条 9 */
  function lockUpCost(from, to) {
    var c = 0;
    for (var a = from + 1; a <= to; a++) c += a + 1;
    return c;
  }
  /** 每次重洗的石头数 = 锁定条数 + 1 */
  function rerollCost(locks) { return locks + 1; }

  /** 建立模型：statKeys / statWeights 由调用方从静态表给出（避免此处硬编码词条 key） */
  function makeModel(statKeys, statWeights) {
    var keys = (statKeys || []).slice();
    var w = {};
    var sum = 0;
    keys.forEach(function (k) {
      var v = Math.max(0, Number(statWeights && statWeights[k]) || 0);
      w[k] = v; sum += v;
    });
    if (!keys.length || sum <= 0) {            // 权重表异常时退化为等概率，不让整块功能失效
      w = {}; keys.forEach(function (k) { w[k] = 1; });
    }
    return { keys: keys, weights: w };
  }

  function normLines(lines) {
    var out = [];
    for (var i = 0; i < 3; i++) {
      var l = (lines && lines[i]) || {};
      out.push({ key: String(l.key || ""), level: Math.max(0, Math.min(15, Math.trunc(Number(l.level) || 0))) });
    }
    return out;
  }

  /** 目标归一：去重（同一类型只算一次）、按给定顺序保留 */
  function normTargets(targets) {
    var seen = {}, out = [];
    (targets || []).forEach(function (t) {
      if (!t || !t.key) return;
      var k = String(t.key);
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ key: k, minTier: clampTier(t.minTier) });
    });
    return out;
  }

  /** 盘面上已经出现的目标词条 → slot 位对应的目标序号（-1 = 没有） */
  function presentMap(lines, targets) {
    var map = [-1, -1, -1], used = {};
    for (var i = 0; i < 3; i++) {
      var ln = lines[i];
      if (!ln.key || !(ln.level > 0)) continue;
      for (var t = 0; t < targets.length; t++) {
        if (used[t] || targets[t].key !== ln.key) continue;
        map[i] = t; used[t] = 1; break;
      }
    }
    return map;
  }

  /** 已达标的词条位（类型命中且档数 ≥ 目标）→ okMask（按目标序号置位） */
  function okMaskOf(lines, targets, map) {
    var mask = 0;
    for (var i = 0; i < 3; i++) {
      var t = map[i];
      if (t < 0) continue;
      if (lines[i].level >= targets[t].minTier) mask |= 1 << t;
    }
    return mask;
  }

  function bitCount(x) {
    var c = 0;
    for (var v = x; v; v >>>= 1) c += v & 1;
    return c;
  }

  /* ---------------- 只洗词条：精确 DP（已达标即锁，其余重洗，命中新目标立刻锁） ----------------
   *  状态 = 三个词条位各自「锁着哪个目标」（-1 = 未锁）。锁定只增不减 ⇒ 按锁定数从多变少递推。
   *  返回 { ok, total, rerolls, rerollStones, lockStones, firstHitProb } */

  function transitionsChange(model, lines, targets, lock, rule) {
    var lockedStats = {}, usedTarget = {};
    var i, t;
    for (i = 0; i < 3; i++) {
      t = lock[i];
      if (t >= 0) { lockedStats[targets[t].key] = 1; usedTarget[t] = 1; }
    }
    var open = [];
    for (i = 0; i < 3; i++) if (lock[i] < 0) open.push(i);

    var acc = {};
    function addOut(cur, p) {
      if (!(p > 0)) return;
      var key = cur.join(",");
      acc[key] = (acc[key] || 0) + p;
    }
    function targetIndexAt(key) {
      for (var k = 0; k < targets.length; k++) if (targets[k].key === key) return k;
      return -1;
    }

    var pool = [];
    model.keys.forEach(function (k) {
      if (lockedStats[k]) return;
      if (model.weights[k] > 0) pool.push({ key: k, w: model.weights[k] });
    });

    function rec(oi, poolNow, cur, p) {
      if (oi === open.length) { addOut(cur, p); return; }
      var slot = open[oi];
      var app = SLOT_APPEAR[slot];
      var e = cur.slice(); e[slot] = -1;
      if (app < 1) rec(oi + 1, poolNow, e, p * (1 - app));
      var total = 0, gi;
      for (gi = 0; gi < poolNow.length; gi++) total += poolNow[gi].w;
      if (!(total > 0)) return;
      for (gi = 0; gi < poolNow.length; gi++) {
        var st = poolNow[gi];
        var rest = poolNow.slice(0, gi).concat(poolNow.slice(gi + 1));
        var pStat = app * st.w / total;
        var ti = targetIndexAt(st.key);
        if (ti < 0 || usedTarget[ti]) { rec(oi + 1, rest, e, p * pStat); continue; }
        var ln = lines[slot];
        var ex = (rule === "global" && ln.key === st.key && ln.level > 0) ? ln.level : 0;
        var okP = tierOkProb(targets[ti].minTier, ex);
        if (okP > 0) { var a = cur.slice(); a[slot] = ti; rec(oi + 1, rest, a, p * pStat * okP); }
        if (okP < 1) rec(oi + 1, rest, e, p * pStat * (1 - okP));
      }
    }
    rec(0, pool, lock.slice(), 1);

    return Object.keys(acc).map(function (key) {
      return { lock: key.split(",").map(Number), p: acc[key] };
    });
  }

  function planChange(model, lines, targets, rule) {
    var map = presentMap(lines, targets);
    var okMask = okMaskOf(lines, targets, map);
    var lock0 = [-1, -1, -1];
    for (var i = 0; i < 3; i++) {
      var t = map[i];
      if (t < 0) continue;
      if (okMask & (1 << t)) lock0[i] = t;      // 只锁「已经达标」的行
    }
    var has = bitCount(okMask);
    var need = targets.length - has;
    if (need <= 0) return { ok: true, done: true, has: has, need: 0, total: 0, rerolls: 0, rerollStones: 0, lockStones: 0, firstHitProb: 0 };

    var memo = {}, unreachable = false;
    function solve(lock) {
      var k = 0;
      for (var j = 0; j < 3; j++) if (lock[j] >= 0) k++;
      if (k >= targets.length) return { rolls: 0, lockS: 0, rerollS: 0 };
      var key = lock.join(",");
      if (memo[key] !== undefined) return memo[key];
      var r = rerollCost(k);
      var tr = transitionsChange(model, lines, targets, lock, rule);
      var pSame = 0, aRolls = 0, aLock = 0, aReroll = 0, bad = false;
      tr.forEach(function (x) {
        var k2 = 0;
        for (var j = 0; j < 3; j++) if (x.lock[j] >= 0) k2++;
        if (k2 <= k) { pSame += x.p; return; }
        var sub = solve(x.lock);
        if (!sub) { bad = true; return; }
        var up = (k2 >= targets.length) ? 0 : lockUpCost(k, k2);   // 最后一条命中就收工，不必再锁
        aRolls += x.p * sub.rolls;
        aLock += x.p * (up + sub.lockS);
        aReroll += x.p * sub.rerollS;
      });
      var den = 1 - pSame;
      if (bad || !(den > 1e-12)) { memo[key] = null; return null; }
      var res = { rolls: (1 + aRolls) / den, lockS: aLock / den, rerollS: (r + aReroll) / den };
      memo[key] = res;
      return res;
    }

    var r0 = solve(lock0);
    var tr0 = transitionsChange(model, lines, targets, lock0, rule);
    var pSame0 = 0, k0 = bitCount(okMask);
    tr0.forEach(function (x) {
      var k2 = 0;
      for (var j = 0; j < 3; j++) if (x.lock[j] >= 0) k2++;
      if (k2 <= k0) pSame0 += x.p;
    });
    if (!r0) {
      unreachable = true;
      return { ok: false, reason: "unreachable", has: has, need: need, firstHitProb: 1 - pSame0 };
    }
    return {
      ok: true, done: false, has: has, need: need,
      rerolls: r0.rolls, rerollStones: r0.rerollS, lockStones: r0.lockS,
      total: r0.rerollS + r0.lockS, firstHitProb: 1 - pSame0
    };
  }

  /* ---------------- 只洗数值 / 洗数值阶段 ----------------
   *  洗数值（重置属性）只重抽「目标词条」的档位，类型不变。已达标的那几条锁住不动，
   *  其余继续洗；每洗一次消耗「已锁条数 + 1」颗。
   *  注意：不能用「一次全部命中」的 1/Πq 估算 —— 真实玩法是洗出一条就锁一条，
   *  所以这里对「已达标集合」做子集 DP（状态 ≤ 2^3 = 8），精确值。 */

  /** 求解器：total = 名字/档位两阶段取更省；value = 只走洗数值。
   *  present[i] = 第 i 个词条位上的目标序号（-1 = 没有目标词条）；okMask = 已达标的目标位。
   *
   *  所有返回值统一成 { c, n, v }：
   *    c = 期望总消耗（颗）
   *    n = 其中花在「洗词条 / 出名字」阶段的
   *    v = 其中花在「洗数值 / 拉档位」阶段的
   *  不可达返回 InfinityCost。数值口径与只算 c 的版本逐项一致，n / v 只是同步累加的拆分。 */
  var InfinityCost = { c: Infinity, n: 0, v: 0 };
  var ZeroCost = { c: 0, n: 0, v: 0 };

  function makeSolver(model, lines, targets, rule) {
    var memoTotal = {}, memoValue = {};
    var FULL = (1 << targets.length) - 1;

    function presentAt(present, t) {
      for (var i = 0; i < 3; i++) if (present[i] === t) return i;
      return -1;
    }
    function okCount(mask) { return bitCount(mask); }

    function total(present, okMask) {
      if (okCount(okMask) >= targets.length) return ZeroCost;
      var key = presentKey(present, okMask);
      if (memoTotal[key] !== undefined) return memoTotal[key];
      var a = nameCost(present, okMask);
      var b = valueEntry(present, okMask, false);
      var best = a.c <= b.c ? a : b;
      memoTotal[key] = best;
      return best;
    }

    /* 洗词条：名字都锁着，只重洗还没出名字的位 */
    function nameCost(present, okMask) {
      var k = 0, i;
      for (i = 0; i < 3; i++) if (present[i] >= 0) k++;
      if (k >= 3) return InfinityCost;
      var cost = k + 1;
      var tr = nextNameOutcomes(model, lines, targets, present, okMask, rule);
      var pSelf = 0, acc = 0, accN = 0, accV = 0;
      tr.forEach(function (x) {
        var k2 = 0, j;
        for (j = 0; j < 3; j++) if (x.present[j] >= 0) k2++;
        if (k2 <= k) { pSelf += x.p; return; }
        if (okCount(x.okMask) >= targets.length) { return; }    // 这一把直接全达标 → 0 成本收工

        /* 本次出现了新名字，两条路取更省：
         *   ⓐ 锁上它继续洗名字（lockUp(k→k') + 后续）；
         *   ⓑ 先不锁、马上改洗数值 —— 只有目标词条全都出现时才有意义。
         *      单目标场景这条明显更便宜：锁了再洗数值等于白付一次上锁费。 */
        var bc = Infinity, bn = 0, bv = 0;
        var a1 = total(x.present, x.okMask);
        if (Number.isFinite(a1.c)) {
          var up = lockUpCost(k, k2);
          bc = up + a1.c; bn = up + a1.n; bv = a1.v;
        }
        var allIn = true, tt;
        for (tt = 0; tt < targets.length; tt++) {
          var got = false;
          for (j = 0; j < 3; j++) if (x.present[j] === tt) { got = true; break; }
          if (!got) { allIn = false; break; }
        }
        if (allIn) {
          var a2 = valueRec(x.present, x.okMask);
          if (Number.isFinite(a2.c) && a2.c < bc) { bc = a2.c; bn = 0; bv = a2.c; }
        }
        if (Number.isFinite(bc)) { acc += x.p * bc; accN += x.p * bn; accV += x.p * bv; }
        else pSelf += x.p;                                      // 走不通 → 当成原地重洗
      });
      var den = 1 - pSelf;
      if (!(den > 1e-12)) return InfinityCost;
      // 本次改写词条的 (k+1) 颗整体算进「词条阶段」
      return { c: (cost + acc) / den, n: (cost + accN) / den, v: accV / den };
    }

    /* 从 total 进洗数值。
     * chargeLock=false（自动路线的中途切换）：名字阶段已经把词条锁上了，不再重复收上锁费；
     * chargeLock=true（一上来就只洗数值）：起手要把已达标的锁上。 */
    function valueEntry(present, okMask, chargeLock) {
      var has = false, t;
      for (t = 0; t < targets.length; t++) {
        if (okMask & (1 << t)) continue;
        if (presentAt(present, t) >= 0) { has = true; break; }
      }
      if (!has) return InfinityCost;
      var r = valueRec(present, okMask);
      if (!Number.isFinite(r.c)) return InfinityCost;
      var lock = chargeLock ? lockUpCost(0, okCount(okMask)) : 0;
      return { c: lock + r.c, n: 0, v: lock + r.v };
    }

    function valueRec(present, okMask) {
      if (okCount(okMask) >= targets.length) return ZeroCost;
      var key = presentKey(present, okMask);
      if (memoValue[key] !== undefined) return memoValue[key];
      var locked = okCount(okMask);
      var cost = locked + 1;

      var list = [], t;
      for (t = 0; t < targets.length; t++) {
        if (okMask & (1 << t)) continue;
        if (presentAt(present, t) >= 0) list.push(t);
      }
      if (!list.length) { memoValue[key] = ZeroCost; return ZeroCost; }

      var qs = [], bad = false;
      list.forEach(function (tt) {
        var q = valueRate(targets[tt].minTier, rule);
        if (!(q > 0)) bad = true;
        qs.push(q);
      });
      if (bad) { memoValue[key] = InfinityCost; return InfinityCost; }

      /* 每次重洗：未锁的目标行各自独立达标，枚举 2^r 种组合 */
      var r = list.length, pSelf = 0, acc = 0, accV = 0;
      for (var m = 0; m < (1 << r); m++) {
        var p = 1, cnt = 0, newOk = okMask;
        for (var j = 0; j < r; j++) {
          if (m & (1 << j)) { p *= qs[j]; cnt++; newOk |= 1 << list[j]; }
          else p *= (1 - qs[j]);
        }
        if (m === 0) { pSelf = p; continue; }
        var done = okCount(newOk) >= targets.length;
        var nxt = done ? ZeroCost : total(present, newOk);
        var up2 = done ? 0 : lockUpCost(locked, locked + cnt);
        acc += p * (up2 + nxt.c);
        accV += p * (up2 + nxt.c);        // 进了数值阶段之后，后续全部计入数值阶段
      }
      var den = 1 - pSelf;
      if (!(den > 1e-12)) { memoValue[key] = InfinityCost; return InfinityCost; }
      var out = { c: (cost + acc) / den, n: 0, v: (cost + accV) / den };
      memoValue[key] = out;
      return out;
    }

    return { total: total, value: valueRec, valueEntry: valueEntry, FULL: FULL };
  }

  function planValue(model, lines, targets, rule) {
    var map = presentMap(lines, targets);
    var okMask = okMaskOf(lines, targets, map);
    var missing = [], t, i;
    for (t = 0; t < targets.length; t++) {
      var at = -1;
      for (i = 0; i < 3; i++) if (map[i] === t) { at = i; break; }
      if (at < 0) missing.push(targets[t].key);
    }
    var has = bitCount(okMask), need = targets.length - has;
    if (missing.length) return { ok: false, reason: "missing-name", missing: missing, has: has, need: need };
    if (need <= 0) return { ok: true, done: true, has: has, need: 0, total: 0, rerolls: 0, rerollStones: 0, lockStones: 0, firstHitProb: 0 };

    /* lines 里同类型重复时只认第一个位 */
    var present = [], usedT = {};
    for (i = 0; i < 3; i++) {
      t = map[i];
      if (t >= 0 && usedT[t]) { present.push(-1); continue; }
      if (t >= 0) usedT[t] = 1;
      present.push(t);
    }
    var sol = makeSolver(model, lines, targets, rule);
    var locked = bitCount(okMask);
    var lockS = lockUpCost(0, locked);
    var rec = sol.value(present, okMask);
    if (!Number.isFinite(rec.c)) return { ok: false, reason: "unreachable", has: has, need: need };
    var v = lockS + rec.c;

    /* 展示用：每次重洗同时命中的概率（不锁时）、期望次数按 DP 的粒度折算 */
    var prod = 1;
    for (t = 0; t < targets.length; t++) if (!(okMask & (1 << t))) prod *= valueRate(targets[t].minTier, rule);
    var rolls = prod > 0 ? 1 / prod : Infinity;
    return {
      ok: true, done: false, has: has, need: need,
      rerolls: rolls, rerollStones: v - lockS,
      lockStones: lockS, total: v, firstHitProb: prod,
      nameStones: 0, valueStones: v
    };
  }

  /* ---------------- 自动路线：先洗出词条名，再洗数值 ----------------
   *  第一阶段只求「名字出现」，顺手抽到好档位就是白赚；名字一到手就锁上。
   *  第二阶段把档位一条条洗到达标（洗出一条锁一条）。两阶段都允许中途改主意。 */

  function presentKey(present, okMask) { return present.join(",") + "|" + okMask; }

  /** 洗一次词条（只重洗「还没有目标词条」的位），返回 [{present, p}]；
   *  present 项带 ok 位（新到的词条按目标档位判定是否直接达标）。 */
  function nextNameOutcomes(model, lines, targets, present, okMask, rule) {
    var lockedStats = {};
    var i;
    for (i = 0; i < 3; i++) if (present[i] >= 0) lockedStats[targets[present[i]].key] = 1;
    var open = [];
    for (i = 0; i < 3; i++) if (present[i] < 0) open.push(i);

    var pool = [];
    model.keys.forEach(function (k) {
      if (lockedStats[k]) return;
      if (model.weights[k] > 0) pool.push({ key: k, w: model.weights[k] });
    });

    var acc = {};
    function addOut(cur, mask, p) {
      if (!(p > 0)) return;
      var key = presentKey(cur, mask);
      if (acc[key]) acc[key].p += p;
      else acc[key] = { present: cur.slice(), okMask: mask, p: p };
    }
    function targetIndexAt(key) {
      for (var k = 0; k < targets.length; k++) if (targets[k].key === key) return k;
      return -1;
    }

    function rec(oi, poolNow, cur, mask, p) {
      if (oi === open.length) { addOut(cur, mask, p); return; }
      var slot = open[oi];
      var app = SLOT_APPEAR[slot];
      if (app < 1) rec(oi + 1, poolNow, cur, mask, p * (1 - app));
      var total = 0, gi;
      for (gi = 0; gi < poolNow.length; gi++) total += poolNow[gi].w;
      if (!(total > 0)) return;
      for (gi = 0; gi < poolNow.length; gi++) {
        var st = poolNow[gi];
        var rest = poolNow.slice(0, gi).concat(poolNow.slice(gi + 1));
        var pStat = app * st.w / total;
        var ti = targetIndexAt(st.key);
        if (ti < 0 || (mask & (1 << ti)) || presentIn(cur, ti)) { rec(oi + 1, rest, cur, mask, p * pStat); continue; }
        var q = tierOkProb(targets[ti].minTier);          // 新抽的类型与原类型不同 ⇒ 新规则也不排除档位
        var nxt = cur.slice(); nxt[slot] = ti;
        if (q > 0) rec(oi + 1, rest, nxt, mask | (1 << ti), p * pStat * q);
        if (q < 1) rec(oi + 1, rest, nxt, mask, p * pStat * (1 - q));
      }
    }
    function presentIn(arr, ti) {
      for (var k = 0; k < 3; k++) if (arr[k] === ti) return true;
      return false;
    }
    rec(0, pool, present.slice(), okMask, 1);

    return Object.keys(acc).map(function (k) {
      var x = acc[k];
      return { present: x.present, okMask: x.okMask, p: x.p };
    });
  }

  function planAuto(model, lines, targets, rule) {
    var map = presentMap(lines, targets);
    var okMask0 = okMaskOf(lines, targets, map);
    var i, t;
    var present0 = [], usedT = {};
    for (i = 0; i < 3; i++) {
      t = map[i];
      if (t >= 0 && usedT[t]) { present0.push(-1); continue; }
      if (t >= 0) usedT[t] = 1;
      present0.push(t);
    }
    var k0 = 0;
    for (i = 0; i < 3; i++) if (present0[i] >= 0) k0++;
    var has0 = bitCount(okMask0);
    if (has0 >= targets.length) {
      return { ok: true, done: true, has: has0, need: 0, total: 0, rerolls: 0, rerollStones: 0, lockStones: 0, firstHitProb: 0 };
    }

    var sol = makeSolver(model, lines, targets, rule);
    var core = sol.total(present0, okMask0);
    var tr0 = nextNameOutcomes(model, lines, targets, present0, okMask0, rule);
    var pSelf0 = 0;
    tr0.forEach(function (x) {
      var k2 = 0;
      for (var j = 0; j < 3; j++) if (x.present[j] >= 0) k2++;
      if (k2 <= k0) pSelf0 += x.p;
    });
    if (!Number.isFinite(core.c)) {
      return { ok: false, reason: "unreachable", has: has0, need: targets.length - has0, firstHitProb: 1 - pSelf0 };
    }
    var initLock = lockUpCost(0, k0);          // 起手盘面上已有的目标词条 → 先付一次上锁费
    /* 起手的上锁费归属：名字还没齐 → 算词条阶段；名字已齐、直接洗数值 → 算数值阶段 */
    var nameStones = core.n + (core.n > 0 ? initLock : 0);
    var valueStones = core.v + (core.n > 0 ? 0 : initLock);
    /* 「本次重洗能让进度往前走」的概率 —— 按当前所处阶段给：
     *   名字还没齐 → 这一把洗出新名字（或直接达标）的概率；
     *   名字都齐了 → 洗数值时至少一条达标的概率（= Π q，与只洗数值同口径）。 */
    var namesReady = true;
    for (t = 0; t < targets.length; t++) {
      var hasT = false;
      for (i = 0; i < 3; i++) if (present0[i] === t) { hasT = true; break; }
      if (!hasT) { namesReady = false; break; }
    }
    var hit = 1 - pSelf0;
    if (namesReady) {
      hit = 1;
      for (t = 0; t < targets.length; t++) if (!(okMask0 & (1 << t))) hit *= valueRate(targets[t].minTier, rule);
    }
    return {
      ok: true, done: false, has: has0, need: targets.length - has0,
      rerolls: null, rerollStones: null, lockStones: null,
      total: core.c + initLock, firstHitProb: hit,
      nameStones: nameStones, valueStones: valueStones
    };
  }

  /** 统一入口
   *  opts: { lines:[{key,level}×3], targets:[{key,minTier}], mode:'auto'|'change'|'value', rule:'cn'|'global' }
   */
  function plan(model, opts) {
    opts = opts || {};
    var lines = normLines(opts.lines);
    var targets = normTargets(opts.targets);
    var rule = opts.rule === "global" ? "global" : "cn";
    var mode = opts.mode === "change" ? "change" : (opts.mode === "value" ? "value" : "auto");
    var perRoll = [1, 2, 3, 4];
    if (!targets.length) return { ok: false, reason: "no-target", perRoll: perRoll, mode: mode };
    var r = mode === "change" ? planChange(model, lines, targets, rule)
      : mode === "value" ? planValue(model, lines, targets, rule)
        : planAuto(model, lines, targets, rule);
    r.mode = mode;
    r.rule = rule;
    r.perRoll = perRoll;
    return r;
  }

  /* ---------------- 蒙特卡洛：洗一次会变成什么样 ---------------- */

  function drawWeighted(list, rng) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].w;
    var x = rng() * total;
    for (i = 0; i < list.length; i++) { x -= list[i].w; if (x < 0) return i; }
    return list.length - 1;
  }

  function drawTier(rng, excludeTier) {
    var w = TIER_WEIGHT.slice(), total = TIER_TOTAL;
    if (excludeTier >= 1 && excludeTier <= 15) { total -= w[excludeTier - 1]; w[excludeTier - 1] = 0; }
    if (!(total > 0)) return 1;
    var x = rng() * total;
    for (var i = 0; i < 15; i++) { x -= w[i]; if (x < 0) return i + 1; }
    return 15;
  }

  /** 抽一次重洗后的词条集合（已达标的行锁住不动）。
   *  mode='value' 只重抽目标行的档位（类型不变）；其它按「换词条」处理。
   *  返回 [{key, level} × 3]。 */
  function drawOnce(model, opts, rng) {
    var lines = normLines(opts.lines);
    var targets = normTargets(opts.targets);
    var rule = opts.rule === "global" ? "global" : "cn";
    var mode = opts.mode === "value" ? "value" : "change";
    var map = presentMap(lines, targets);
    var okMask = okMaskOf(lines, targets, map);

    var lockedStats = {}, i;
    for (i = 0; i < 3; i++) {
      var t = map[i];
      if (t >= 0 && (okMask & (1 << t))) lockedStats[targets[t].key] = 1;
    }

    var out = [];
    var pool = [];
    model.keys.forEach(function (k) { if (!lockedStats[k] && model.weights[k] > 0) pool.push({ key: k, w: model.weights[k] }); });

    for (i = 0; i < 3; i++) {
      var ti = map[i];
      if (ti >= 0 && (okMask & (1 << ti))) { out.push({ key: lines[i].key, level: lines[i].level }); continue; }  // 锁定
      if (mode === "value") {
        if (ti < 0) { out.push({ key: lines[i].key, level: lines[i].level }); continue; }   // 非目标行洗数值不动
        var exv = rule === "global" ? lines[i].level : 0;
        out.push({ key: lines[i].key, level: drawTier(rng, exv) });
        continue;
      }
      if (rng() >= SLOT_APPEAR[i]) { out.push({ key: "", level: 0 }); continue; }
      if (!pool.length) { out.push({ key: "", level: 0 }); continue; }
      var gi = drawWeighted(pool, rng);
      var st = pool.splice(gi, 1)[0];
      var ex = (rule === "global" && lines[i].key === st.key && lines[i].level > 0) ? lines[i].level : 0;
      out.push({ key: st.key, level: drawTier(rng, ex) });
    }
    return out;
  }

  root.NikkeReroll = {
    SLOT_APPEAR: SLOT_APPEAR,
    TIER_WEIGHT: TIER_WEIGHT,
    tierOkProb: tierOkProb,
    valueRate: valueRate,
    lockUpCost: lockUpCost,
    rerollCost: rerollCost,
    makeModel: makeModel,
    normTargets: normTargets,
    presentMap: presentMap,
    okMaskOf: okMaskOf,
    plan: plan,
    drawOnce: drawOnce
  };
})(typeof window !== "undefined" ? window : globalThis);
