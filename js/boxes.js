/* boxes.js — 固定小时箱折算 + 自选箱优化（自 Python calculator/boxes 移植）
   R62（2026-10-26）红球口径定案：见下方 dustTrunc / hoursOfFixed 注释 */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var RESOURCES = C.RESOURCES;
  var addRes = C.addRes;

  /* ================= 红球（core_dust）定点口径 · R62 定案 =================
     官方 OutpostBattleTable（800 行，20261026 包）三资源公式：
       信用点     = Credit         / Time_credit   / 10000 × 3600
       战斗数据辑  = Character_exp1 / Time_charexp1 / 10000 × 3600
       红球(芯尘)  = Character_exp2 / Time_charexp2 / 10000 × 3600
     实测：lv1 2326/60/10000×3600 = 13.956/h、lv500 10348/60/... = 62.088/h、
           lv800 14466/60/... = 86.796/h —— 与 outpost_income.json 全 800 级逐级吻合
           （表内为向下截断到 0.01，故有 -0.01~0 的尾差）。
     关键：Time_charexp2 恒为 60 秒，每 60 秒只产 2326/10000 = 0.2326 个 < 1。
          若「每次结算取整成整数」，0.2326 → 0，玩家永远拿不到红球 ——
          故游戏内部必然以【万分之一为单位的定点数】持续累计，只在显示时取整。
     ⇒ 开箱加的是定点数值，正确折算 = floor(rate × 总小时数)：
       必须先把所有箱（固定小时箱 + 自选箱的「X 小时」选项）折算成总小时数、
       最后统一取整一次。旧的「逐箱 floor」在 100 个 1H 盒上少算 41~95 个
       （lv518 少 0.65%、lv1 少 6.8%），因为每箱都丢掉 rate 的小数部分。
     ---------------------------------------------------------------- */

  /* 定点取整：加 1e-9 防 0.7*30 = 20.999999999999996 这类浮点少算 1 个 */
  function dustTrunc(v) { return Math.floor(v + 1e-9); }

  /* 固定小时箱 → 各资源总小时数（成长套组对三资源同时计）。
     只累计小时数、不折算资源，供 joinHours 统一乘收益率并取整。 */
  function hoursOfFixed(snapshot) {
    var hours = { credit: 0, battle_data: 0, core_dust: 0 };
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    Object.keys(snapshot.fixed_boxes || {}).forEach(function (name) {
      var map = snapshot.fixed_boxes[name] || {};
      if (name === "成长套组") {
        Object.keys(map).forEach(function (h) {
          var hh = parseInt(h, 10) || 0, cnt = map[h] || 0;
          RESOURCES.forEach(function (r) { hours[r] += hh * cnt; });
        });
        return;
      }
      var r0 = names[name];
      if (!r0) return;
      Object.keys(map).forEach(function (h) { hours[r0] += (parseInt(h, 10) || 0) * (map[h] || 0); });
    });
    return hours;
  }

  /* 总小时数 → 三资源量。红球最后统一取整一次（定点口径），其余资源本就是整数。 */
  function joinHours(hours, incomePerHour) {
    var inc = incomePerHour || {};
    function out(r) {
      var v = (inc[r] || 0.0) * (hours[r] || 0);
      return r === "core_dust" ? dustTrunc(v) : v;
    }
    return { credit: out("credit"), battle_data: out("battle_data"), core_dust: out("core_dust") };
  }

  function fixedBoxResources(snapshot, incomePerHour) {
    /* R62：先累加总小时数、最后一次折算（定点口径）。
       旧实现逐箱 floor(rate*h) 再乘数量，100 个 1H 盒在 lv518 会少算 41 个红球。 */
    return joinHours(hoursOfFixed(snapshot), incomePerHour);
  }

  /* 固定小时箱按缺口最小开启：单资源箱从大时长到小时长，成长套组同时补三资源。
     gaps = 三资源剩余缺口；返回 { used, remaining_shortage } */
  function fixedFillGaps(snapshot, gaps, incomePerHour) {
    var remaining = {};
    RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, gaps[r] || 0.0); });
    var used = {};
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    var inc = incomePerHour || {};
    /* R62：决策一律用**精确值** rate×h（不逐箱 floor）——
       定点口径下 N 个箱的总贡献是 floor(rate×h×N)，与逐箱 floor 之和不同；
       用精确值做贪心才能得到最少箱数。实际开出的数值统一由 planResources 按
       「总小时数 → 一次 floor」给出，两边差 < 1 个红球。 */
    function boxVal(res, h) { return (inc[res] || 0.0) * h; }
    ["芯尘盒", "信用点盒", "战斗数据辑盒"].forEach(function (name) {
      var res = names[name];
      var map = snapshot.fixed_boxes[name] || {};
      Object.keys(map).map(Number).sort(function (a, b) { return b - a; }).forEach(function (h) {
        if (remaining[res] <= 1e-6) return;
        var val = boxVal(res, h);
        if (val <= 0) return;
        var take = Math.min(map[h], Math.ceil(remaining[res] / val));
        if (take > 0) { used[name] = used[name] || {}; used[name][h] = take; }
        remaining[res] = Math.max(0.0, remaining[res] - take * val);
      });
    });
    // 成长套组：同时补齐三种资源的剩余缺口
    var gmap = snapshot.fixed_boxes["成长套组"] || {};
    Object.keys(gmap).map(Number).sort(function (a, b) { return b - a; }).forEach(function (h) {
      var gv = {};
      RESOURCES.forEach(function (r) { gv[r] = boxVal(r, h); });
      var take = 0;
      while (take < gmap[h] && RESOURCES.some(function (r) { return remaining[r] > 1e-6; })) {
        var progressed = false;
        RESOURCES.forEach(function (r) { if (remaining[r] > 1e-6 && gv[r] > 0) { remaining[r] = Math.max(0.0, remaining[r] - gv[r]); progressed = true; } });
        if (!progressed) break;
        take += 1;
      }
      if (take > 0) { used["成长套组"] = used["成长套组"] || {}; used["成长套组"][h] = take; }
    });
    return { used: used, remaining_shortage: remaining };
  }

  /* 方案实际开出的三资源量（固定小时箱按 used 逐格折算 + 自选箱按 choices 命中的选项奖励）
     R38（2026-10-16）：不可达时「距目标仍缺」必须基于**最优均衡方案自己的分配**来算，
     而该方案的 remaining_shortage 恒为 0（它在缩小的步数上可行），不能当缺口用。
     口径与本文件其它折算保持一致：红球 TRUNC、非 units 选项 × 该资源每小时收益。 */
  function planResources(snapshot, plan, incomePerHour) {
    if (!plan) return C.zeroRes();
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    var hours = { credit: 0, battle_data: 0, core_dust: 0 };   // 小时制（固定箱 + 自选箱的「X 小时」选项）
    var units = C.zeroRes();                                    // 直接给数量的选项（units 模式）
    var used = plan.fixed_used || {};
    Object.keys(used).forEach(function (name) {
      var hm = used[name] || {};
      if (name === "成长套组") {
        Object.keys(hm).forEach(function (h) {
          var hh = parseInt(h, 10) || 0, cnt = hm[h] || 0;
          RESOURCES.forEach(function (r) { hours[r] += hh * cnt; });
        });
        return;
      }
      var r0 = names[name];
      if (!r0) return;
      Object.keys(hm).forEach(function (h) { hours[r0] += (parseInt(h, 10) || 0) * (hm[h] || 0); });
    });
    (plan.selectable || []).forEach(function (p) {
      var box = null;
      (snapshot.selectable_boxes || []).forEach(function (b) { if (!box && b.name === p.name) box = b; });
      if (!box) return;
      Object.keys(p.choices || {}).forEach(function (label) {
        var cnt = p.choices[label] || 0;
        if (cnt <= 0) return;
        var opt = null;
        (box.options || []).forEach(function (o) { if (!opt && o.label === label) opt = o; });
        if (!opt) return;
        RESOURCES.forEach(function (r) {
          var v = (opt.rewards && opt.rewards[r]) || 0;
          /* R62：hours 模式也累加进总小时数，与固定小时箱走同一条折算路径
             （旧实现自选箱直接用 rate×v×cnt 不取整，与固定箱的逐箱 floor 口径不一致） */
          if (opt.mode === "units") units[r] += v * cnt;
          else hours[r] += v * cnt;
        });
      });
    });
    var out = joinHours(hours, incomePerHour);
    return {
      credit: out.credit + units.credit,
      battle_data: out.battle_data + units.battle_data,
      core_dust: out.core_dust + units.core_dust,
    };
  }

  /* 固定小时箱按需计算：从最大时长箱开始，开够「达到 target」所需的最少固定箱数量。
     baseResources 必须是**完整底盘**（裸资源 + 可选等待期自然积累 + 可选推图收益），
     本函数不再自行叠加推图收益 —— 否则会与调用方叠加成 ×2（2026-10-14 修）。
     preConsumed（可选）：开箱顺序①挑战者成长宝箱已贡献的资源，先从缺口中扣除 */
  function fixedBoxesNeeded(snapshot, baseResources, targetSteps, incomePerHour, preConsumed) {
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var balance = baseResources;
    var gaps = {};
    RESOURCES.forEach(function (r) {
      var g = Math.max(0.0, needed[r] - balance[r]);
      if (preConsumed) g = Math.max(0.0, g - (preConsumed[r] || 0));
      gaps[r] = g;
    });
    return fixedFillGaps(snapshot, gaps, incomePerHour);
  }

  /* ---------- 挑战者成长宝箱（二选一 units 固定数值）的选项解析 ----------
     R31（2026-10-16）：原先两处写死 options[0]（战斗数据辑），现改为
     「用户偏好（snapshot.challenger_pref）+ 自动择优」共同决定。
     偏好取值：auto（默认）/ battle（战斗数据辑优先）/ dust（芯尘优先）。
     注意：选项按 rewards 的键定位（battle_data / core_dust），不依赖数组顺序。 */
  var CHALLENGER_REWARD_KEY = { battle: "battle_data", dust: "core_dust" };

  /* 返回「第一个 二选一 units 箱」的 options 数组；找不到则 null */
  function challengerOptionsOf(snapshot) {
    var list = (snapshot && snapshot.selectable_boxes) || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.quantity > 0 && b.options && b.options.length === 2 &&
          b.options.every(function (o) { return o.mode === "units"; })) return b.options;
    }
    return null;
  }

  /* 由偏好解析出「第几个选项」的索引；解析不出（无箱 / 非 units / auto）时返回 fallbackIdx */
  function challengerIndexForPref(snapshot, pref, fallbackIdx) {
    var opts = challengerOptionsOf(snapshot);
    if (!opts) return (fallbackIdx === undefined ? 0 : fallbackIdx);
    var key = CHALLENGER_REWARD_KEY[pref];
    if (!key) return (fallbackIdx === undefined ? 0 : fallbackIdx);
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].rewards && opts[i].rewards[key] > 0) return i;
    }
    return (fallbackIdx === undefined ? 0 : fallbackIdx);
  }

  /* 1H 箱折算总缺口：Σ_r remaining_shortage[r] ÷ income_per_hour[r]（R31 次判据）
     ⚠ 必须折算：红球的「个」与战斗数据的「个」量纲不可比，用原始量会得出相反结论。
     拿不到 income 的资源计 +∞（不可比时保守对待）。 */
  function gapHours(plan, incomePerHour) {
    if (!plan || !plan.remaining_shortage) return 0;
    var inc = incomePerHour || {}, total = 0;
    RESOURCES.forEach(function (r) {
      var g = plan.remaining_shortage[r] || 0;
      if (g <= 1e-6) return;
      var rate = inc[r] || 0;
      total += rate > 0 ? (g / rate) : Infinity;
    });
    return total;
  }

  /* 挑战者成长宝箱全开的资源贡献（开箱顺序①，始终全消耗）
     idx：第几个选项；缺省（undefined）= 按 snapshot.challenger_pref 解析；
          传入数字则强制该项（battle/dust 单跑用） */
  function challengerUnitsResources(snapshot, idx) {
    var res = C.zeroRes();
    var useIdx = (typeof idx === "number") ? idx : challengerIndexForPref(snapshot, (snapshot && snapshot.challenger_pref) || "auto", 0);
    (snapshot.selectable_boxes || []).forEach(function (b) {
      if (b.quantity <= 0 || !b.options || b.options.length !== 2) return;
      var allUnits = b.options.every(function (o) { return o.mode === "units"; });
      if (!allUnits) return;
      var o = b.options[useIdx] || b.options[b.options.length - 1];
      if (o && o.rewards) RESOURCES.forEach(function (r) { res[r] += (o.rewards[r] || 0) * b.quantity; });
    });
    return res;
  }

  function single(option) {
    var vals = [];
    Object.keys(option.rewards || {}).forEach(function (r) {
      if (option.rewards[r] > 0) vals.push([r, option.rewards[r]]);
    });
    return vals.length === 1 ? vals[0] : null;
  }

  function optionValue(option, resource, incomePerHour) {
    var value = (option.rewards && option.rewards[resource]) || 0.0;
    return option.mode === "units" ? value : value * (incomePerHour[resource] || 0.0);
  }

  /* 自选箱优化（开箱顺序：①挑战者成长宝箱全开 → ②固定小时箱按需 → ③方舟/30天自选箱按需）
     baseResources = **完整底盘**，由调用方决定口径：
       现状（now）  = 裸资源（**不含**推图收益，见项目铁律 5）
       开放日（future）= 裸资源 + 等待期自然积累 + 推图收益 ×1
     本函数不再自行叠加 stage_clear_resources —— 否则会与调用方叠加成 ×2，
     凭空多出一份推图收益（2026-10-14 修：曾导致「达成目标方案」漏开信用点盒）。

     R31（2026-10-16）：本函数只负责「以第 idx 个挑战者箱选项硬跑一遍」，不再解析偏好。
     对外请用 optimizeSelectableForTarget（它按 snapshot.challenger_pref 决定单跑或双跑择优）。 */
  function solveWithChallenger(snapshot, baseResources, targetSteps, incomePerHour, idx) {
    var chalIdx = (typeof idx === "number" && idx >= 0) ? idx : 0;
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var base = baseResources;
    var shortage = {};
    RESOURCES.forEach(function (r) { shortage[r] = Math.max(0.0, needed[r] - base[r]); });
    // 裸资源已满足目标：什么都不开（挑战者也保留）
    if (RESOURCES.every(function (r) { return shortage[r] <= 1e-6; })) {
      var emptyPlan = (snapshot.selectable_boxes || []).filter(function (b) { return b.quantity > 0; })
        .map(function (b) { return { name: b.name, used: 0, keep: b.quantity, choices: {} }; });
      return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: {}, selectable: emptyPlan, boxes_used: 0, remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 }, feasible: true, challenger_index: chalIdx };
    }

    var boxes = [];
    (snapshot.selectable_boxes || []).forEach(function (box) {
      if (box.quantity > 0 && box.options && box.options.length) {
        boxes.push({ box: box, left: box.quantity, choices: {} });
      }
    });

    // 开箱顺序①：挑战者成长宝箱（units 固定数值二选一）优先全消耗（按选中项，无分配损耗）
    var challengerRes = C.zeroRes();
    boxes.forEach(function (item) {
      var opts = item.box.options || [];
      if (item.left > 0 && opts.length === 2 && opts.every(function (o) { return o.mode === "units"; })) {
        var o = opts[chalIdx] || opts[opts.length - 1];
        item.left = 0;
        item.choices[o.label] = item.box.quantity;
        if (o.rewards) {
          RESOURCES.forEach(function (r) { challengerRes[r] += (o.rewards[r] || 0) * item.box.quantity; });
        }
      }
    });
    var remaining = {};
    RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, shortage[r] - challengerRes[r]); });

    // 开箱顺序②：固定小时箱按需开启（从大时长到小时长，成长套组收尾）
    var fixedFill = fixedFillGaps(snapshot, remaining, incomePerHour);
    RESOURCES.forEach(function (r) { remaining[r] = fixedFill.remaining_shortage[r]; });

    // 开箱顺序③：方舟/30天自选箱按需
    var fast = fastThreeTwoFlexiblePlan(boxes, remaining, needed, fixedFill.used, incomePerHour, targetSteps);
    if (fast) {
      fast.fixed = fixedBoxResources(snapshot, incomePerHour);
      fast.fixed_used = fixedFill.used;
      fast.challenger_index = chalIdx;
      return fast;
    }

    var hasMulti = boxes.some(function (item) {
      return item.box.options.some(function (opt) { return !single(opt); });
    });
    if (hasMulti) {
      return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: fixedFill.used, selectable: [], boxes_used: 0, remaining_shortage: shortage, feasible: false, challenger_index: chalIdx, error: "存在多资源同时奖励箱子，需扩展枚举规则" };
    }

    // 挑战者已在顺序①全消耗；此处只剩单资源三选一箱的贪心
    var totalUsed = boxes.reduce(function (s, it) { return s + (it.box.quantity - it.left); }, 0);
    while (Object.keys(remaining).some(function (r) { return remaining[r] > 1e-6; })) {
      var candidates = [];
      boxes.forEach(function (item) {
        if (item.left <= 0) return;
        item.box.options.forEach(function (option) {
          var s = single(option);
          if (!s) return;
          var resource = s[0];
          var value = optionValue(option, resource, incomePerHour);
          if (value > 0 && remaining[resource] > 0) {
            candidates.push({ ratio: remaining[resource] / value, item: item, option: option, resource: resource, value: value });
          }
        });
      });
      if (!candidates.length) break;
      var best = candidates.reduce(function (mx, c) { return (!mx || c.ratio > mx.ratio) ? c : mx; }, null);
      best.item.left -= 1;
      best.item.choices[best.option.label] = (best.item.choices[best.option.label] || 0) + 1;
      remaining[best.resource] = Math.max(0.0, remaining[best.resource] - best.value);
      totalUsed += 1;
    }

    // 方案条目按开箱顺序展示：挑战者排最前，其余按表单顺序
    var plans = boxes.map(function (item) {
      return { name: item.box.name, used: item.box.quantity - item.left, keep: item.left, choices: item.choices };
    });
    plans.sort(function (a, b) {
      return (a.name.indexOf("挑战") >= 0 ? 0 : 1) - (b.name.indexOf("挑战") >= 0 ? 0 : 1);
    });
    var feasible = !RESOURCES.some(function (r) { return remaining[r] > 1e-6; });
    return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: fixedFill.used, selectable: plans, boxes_used: totalUsed, remaining_shortage: remaining, feasible: feasible, challenger_index: chalIdx };
  }

  /* ============ R31 对外入口：按 snapshot.challenger_pref 单跑或双跑择优 ============
     优先序（已定稿）：① 可达步数高者胜 → ② 1H 箱折算总缺口小者胜 → ③ 芯尘优先。
     实现在两处：
       · 本函数 —— 目标步数固定时，先比「该步数是否可达」；都可达(或都不可达)时比折算缺口，相等则芯尘；
         「可达步数」的全局比较由调用方（immediateLevels 的外层二分）自然完成：
         每个 mid 都优先返回可行的那一项 ⇒ 二分收敛到「两项中能到的最大步数」。
       · bestEffortPlan —— 目标不可达时显式二分两次，先比步数、再比折算缺口。
     —— 返回被选中那一份的完整方案对象，并挂 challenger_index 便于 UI 显示实际选项。 */
  function optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour) {
    var pref = (snapshot && snapshot.challenger_pref) || "auto";
    var opts = challengerOptionsOf(snapshot);
    // 没有「二选一 units 箱」→ 偏好无意义，单跑 idx=0（与旧行为一致）
    if (!opts) return solveWithChallenger(snapshot, baseResources, targetSteps, incomePerHour, 0);
    // 用户强制指定 → 跳过择优
    if (pref === "battle" || pref === "dust") {
      var forced = challengerIndexForPref(snapshot, pref, 0);
      return solveWithChallenger(snapshot, baseResources, targetSteps, incomePerHour, forced);
    }
    // auto：双跑（实测单跑 0.1ms，双跑 0.2ms，无需预筛）
    var run0 = solveWithChallenger(snapshot, baseResources, targetSteps, incomePerHour, 0);
    var run1 = solveWithChallenger(snapshot, baseResources, targetSteps, incomePerHour, 1);
    if (run0.feasible !== run1.feasible) return run0.feasible ? run0 : run1;
    if (run0.feasible && run1.feasible) {
      // 都可达 → 步数相同、折算缺口都为 0 → 依 ③「芯尘优先」，固定取 idx=1
      return run1;
    }
    // 都不可达 → 比 1H 箱折算总缺口（小者胜），相等 ⇒ 芯尘优先
    return gapHours(run0, incomePerHour) < gapHours(run1, incomePerHour) ? run0 : run1;
  }

  /* ---- 有界 DP：三选一箱 × 弹性箱的箱数配比（原三重全枚举的等价加速）----
     数学模型：minimize  Σ c_k + Σ f_r
               s.t.      c_k·V_k + f_r·F_r ≥ S_k（每个资源一条约束）
                         Σ c_k ≤ q3、Σ f_r ≤ qF、c_k / f_r 为非负整数
     关键性质：给定 c 之后，f_r = ceil(max(0, S_k − c_k·V_k) / F_k) 已是**最小可行值**
               ⇒ 只需在 c 空间上寻优（原三重全枚举枚举的正是这个空间）。
     实现：dp(资源 1..2, 恰好 j 个三选一箱) = 该子问题的最小弹性箱数；收尾再遍历 (c_0, j)。
           全程纯标量运算、无循环内对象分配（原型实测：带对象分配的写法慢 18×）。
     复杂度 O(3·Jmax²)，Jmax ≤ min(q3, Σceil(S_k/V_k), 「全用弹性箱」的总箱数)。
     ⚠ tie-break 必须与旧实现逐字一致（否则总箱数相同但箱量明细会变）：
       旧实现 `if (!best || total < best.boxes_used)` 是**严格小于**，且枚举顺序为
       c_0 外层 → c_2 内层 ⇒ 同总箱数时保留 **(c_0, c_1, c_2) 字典序最小**者。
     入参：S/V 按 threeOptions 下标（= RES 顺序），F 为对应资源的弹性箱单箱值（0 = 该资源无弹性箱可补）。
     返回 { c: [c0,c1,c2], flexByRes: {资源名: 数量}, flexUsed, total }（total 不含挑战者箱）。 */
  function dpFlexiblePlan(S, V, RES, flexValues, q3, qF) {
    var INF = Infinity;
    var F = [0, 0, 0];
    for (var kf = 0; kf < RES.length; kf++) {
      F[kf] = flexValues[RES[kf]] ? flexValues[RES[kf]].value : 0;
    }
    function needOf(k, c) {
      var rest = S[k] - c * V[k];
      if (rest <= 1e-6) return 0;
      if (!F[k]) return INF;
      return Math.ceil(rest / F[k]);
    }
    /* Jmax 裁剪（不损失最优解）：
       · 单个资源用超过 ceil(S_k / V_k) 个三选一箱纯属浪费 ⇒ Σc 不会超过该和；
       · 若「全部用弹性箱」可行，则它给出总箱数上界 UB，而任何解的 Σc ≤ 其总箱数 ⇒ Σc ≤ UB。 */
    var sumCeil = 0, allFlex = 0, allFlexOk = true;
    for (var k0 = 0; k0 < 3; k0++) {
      if (S[k0] > 1e-6 && V[k0] > 0) sumCeil += Math.ceil(S[k0] / V[k0]);
      if (S[k0] > 1e-6) {
        if (!F[k0]) allFlexOk = false;
        else allFlex += Math.ceil(S[k0] / F[k0]);
      }
    }
    var ub = Math.min(q3, sumCeil);
    if (allFlexOk && allFlex <= qF && allFlex < ub) ub = allFlex;
    var J = Math.max(0, ub);

    /* 后两条资源合并成一层：need12[j] = 用恰好 j 个三选一箱覆盖资源 1、2 的最小弹性箱数；
       c1best[j] = 同值下字典序最小的 c_1（供 tie-break 用） */
    var need12 = [], c1best = [];
    var j, c1;
    for (j = 0; j <= J; j++) {
      var bn = INF, bc = -1;
      for (c1 = 0; c1 <= j; c1++) {
        var n1 = needOf(1, c1);
        if (n1 === INF) continue;
        var n2 = needOf(2, j - c1);
        if (n2 === INF) continue;
        var vv = n1 + n2;
        if (vv < bn || (vv === bn && (bc < 0 || c1 < bc))) { bn = vv; bc = c1; }
      }
      need12[j] = bn; c1best[j] = bc;
    }
    /* 收尾：先比总箱数；同总箱数时按 (c_0, c_1, c_2) 字典序最小（复现旧枚举的取舍规则） */
    var T = INF, bC0 = -1, bJ = -1, c0, j2;
    for (c0 = 0; c0 <= J; c0++) {
      var n0 = needOf(0, c0);
      if (n0 === INF) continue;
      for (j2 = 0; j2 <= J - c0; j2++) {
        var n12 = need12[j2];
        if (n12 === INF) continue;
        var fu = n0 + n12;
        if (fu > qF) continue;
        var total = c0 + j2 + fu;
        if (total > T) continue;
        if (total < T) { T = total; bC0 = c0; bJ = j2; continue; }
        if (bC0 < 0) { bC0 = c0; bJ = j2; continue; }
        if (c0 < bC0) { bC0 = c0; bJ = j2; continue; }
        if (c0 === bC0 && c1best[j2] >= 0 && c1best[bJ] >= 0) {
          if (c1best[j2] < c1best[bJ] || (c1best[j2] === c1best[bJ] && j2 < bJ)) bJ = j2;
        }
      }
    }
    if (T === INF || bC0 < 0 || bJ < 0) return null;
    var c = [bC0, c1best[bJ], bJ - c1best[bJ]];
    var flexByRes = {};
    var flexUsed = 0;
    for (var k1 = 0; k1 < 3; k1++) {
      var n = needOf(k1, c[k1]);
      if (n === INF || flexUsed + n > qF) return null;
      flexUsed += n;
      if (n > 0) flexByRes[RES[k1]] = n;
    }
    return { c: c, flexByRes: flexByRes, flexUsed: flexUsed, total: T };
  }

  /* ---- 全枚举兜底（精确但 O(q³)）----
     仅当三选一箱的三个选项**不是**一一对应三条资源时才会用到（DP 按选项逐层、要求各补一条不同资源）。
     实际数据恒为一一对应（方舟箱 / 30天箱都是 信用点·战斗数据·芯尘 三选一），此路径不会走到；
     保留它是为了在任何「选项→资源」映射下都给出精确最优解，而不是退回启发式贪心。
     返回结构与 dpFlexiblePlan 一致。 */
  function enumerateFlexiblePlan(threeOptions, flexValues, shortage, q3, qF, twoAddRes, twoAddVal) {
    var best = null;
    for (var count0 = 0; count0 <= q3; count0++) {
      for (var count1 = 0; count1 <= q3 - count0; count1++) {
        for (var count2 = 0; count2 <= q3 - count0 - count1; count2++) {
          var combos = [count0, count1, count2];
          var contrib = C.zeroRes();
          for (var i = 0; i < threeOptions.length; i++) {
            contrib[threeOptions[i].resource] += combos[i] * threeOptions[i].value;
          }
          if (twoAddRes) contrib[twoAddRes] += twoAddVal;
          var flexByRes = {};
          var flexUsed = 0;
          var possible = true;
          RESOURCES.forEach(function (r) {
            var rem = Math.max(0.0, shortage[r] - contrib[r]);
            if (rem <= 1e-6) return;
            if (!flexValues[r]) { possible = false; return; }
            var fv = flexValues[r].value;
            var cntF = fv ? Math.ceil(rem / fv) : 1e9;
            flexByRes[r] = cntF;
            flexUsed += cntF;
          });
          if (!possible || flexUsed > qF) continue;
          var total = count0 + count1 + count2 + flexUsed;
          if (!best || total < best.total) {
            best = { c: combos, flexByRes: flexByRes, flexUsed: flexUsed, total: total };
          }
        }
      }
    }
    return best;
  }

  /* 快速有界求解器：方舟(三选一) + 挑战者(二选一 units) + 30天(三选一) 形态
     shortage = 开箱顺序①挑战者全开、②固定箱按需之后的剩余缺口；固定箱明细由 fixedUsed 传入

     R44（2026-10-16）两处改动：
       ① 箱数配比的求解由「三重全枚举 O(q³)」改为「有界 DP O(3·Jmax²)」，数学模型严格同构
          （最优值 / 可行性 / 同分方案归属三类对拍 0 差异，见 临时文件/out/proto_dp.txt）；
       ② 去掉原 `three.quantity <= 100` 阈值 —— 该阈值唯一作用是防枚举爆炸（见 git 历史注释）；
          DP 无此顾虑，故去掉后**任意箱量都取精确最优解**。旧行为在 `q3 > 100` 时 pick 落空
          → 整个函数返回 null → 调用方退回启发式贪心（可能比最优解多开箱），
          并且「箱量跨过 100」会让同一份数据换算法、耗时出现 215× 悬崖（实测 100→2,470ms、101→11.5ms）。 */
  function fastThreeTwoFlexiblePlan(boxes, shortage, needed, fixedUsed, incomePerHour, targetSteps) {
    if (boxes.length !== 3) return null;
    function pick(cond) { for (var i = 0; i < boxes.length; i++) if (cond(boxes[i])) return boxes[i]; return null; }
    var three = pick(function (b) { return b.box.options.length === 3; });
    var two = pick(function (b) { return b.box.options.length === 2; });
    var flex = pick(function (b) { return b !== three && b !== two; });
    if (!three || !two || !flex) return null;

    function buildOptions(box) {
      var out = [];
      for (var i = 0; i < box.box.options.length; i++) {
        var opt = box.box.options[i];
        var s = single(opt);
        if (!s) return null;
        out.push({ resource: s[0], value: optionValue(opt, s[0], incomePerHour), label: opt.label });
      }
      return out;
    }
    var threeOptions = buildOptions(three);
    var twoOptions = buildOptions(two);
    if (!threeOptions || !twoOptions) return null;
    var flexValues = {};
    for (var i = 0; i < flex.box.options.length; i++) {
      var opt = flex.box.options[i];
      var s = single(opt);
      if (!s) return null;
      flexValues[s[0]] = { value: optionValue(opt, s[0], incomePerHour), label: opt.label };
    }

    var q3 = three.box.quantity;
    var qF = flex.box.quantity;

    // 挑战者（two）已在开箱顺序①全消耗（units 固定数值、无分配损耗），其贡献已从 shortage 中扣除，
    // 这里只汇总方案条目；非 units 二选一箱（罕见，顺序①不消耗）维持旧口径：全消耗选第一项。
    // —— 该副作用原本写在最内层循环里（幂等，仅首轮真正生效），现提前到求解之前做一次。
    var usedTwo = two.box.quantity - two.left;
    var labels2 = {};
    var twoAdd = null;
    if (two.left > 0) {
      usedTwo = two.box.quantity;
      two.left = 0;
      labels2[twoOptions[0].label] = two.box.quantity;
      two.choices[twoOptions[0].label] = two.box.quantity;
      twoAdd = twoOptions[0];
    } else {
      Object.keys(two.choices).forEach(function (k) { labels2[k] = two.choices[k]; });
    }
    var twoBonus = twoAdd ? two.box.quantity * twoAdd.value : 0;

    // 三个选项分别补哪条资源（供 DP 分层用）；要求两两不同，否则回落全枚举兜底
    var S = [], V = [], RES = [], bijective = true, seenRes = {};
    for (var kt = 0; kt < threeOptions.length; kt++) {
      var opt3 = threeOptions[kt];
      if (seenRes[opt3.resource] || RESOURCES.indexOf(opt3.resource) < 0) { bijective = false; break; }
      seenRes[opt3.resource] = true;
      var baseRes = shortage[opt3.resource] - (twoAdd && twoAdd.resource === opt3.resource ? twoBonus : 0);
      S.push(Math.max(0.0, baseRes));
      V.push(opt3.value);
      RES.push(opt3.resource);
    }

    var solved = bijective
      ? dpFlexiblePlan(S, V, RES, flexValues, q3, qF)
      : enumerateFlexiblePlan(threeOptions, flexValues, shortage, q3, qF, twoAdd ? twoAdd.resource : null, twoBonus);
    if (!solved) return null;

    var combos = solved.c;
    var used3 = combos[0] + combos[1] + combos[2];
    var labels3 = {};
    for (var i3 = 0; i3 < threeOptions.length; i3++) labels3[threeOptions[i3].label] = combos[i3];
    // 与旧行为一致：弹性箱的 choices 写出**全部**候选标签（未用到的记 0），不是只写用到的
    var labelsFlex = {};
    Object.keys(flexValues).forEach(function (r) { labelsFlex[flexValues[r].label] = solved.flexByRes[r] || 0; });

    return {
      target_steps: targetSteps, needed: needed,
      fixed_used: fixedUsed,
      selectable: [
        { name: two.box.name, used: usedTwo, keep: two.box.quantity - usedTwo, choices: labels2 },
        { name: three.box.name, used: used3, keep: three.box.quantity - used3, choices: labels3 },
        { name: flex.box.name, used: solved.flexUsed, keep: flex.box.quantity - solved.flexUsed, choices: labelsFlex },
      ],
      boxes_used: solved.total + usedTwo,
      remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 },
      feasible: true,
    };
  }

  /* 以「固定第 idx 个挑战者选项」二分最大可达步数（内部用；不含偏好解析） */
  function bestEffortSolve(snapshot, baseResources, targetSteps, incomePerHour, idx) {
    var hi = Math.max(0, targetSteps - 1);
    if (hi <= 0) return { found: false, steps: 0, plan: null };
    var lo = 1, best = null;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2);
      var p = solveWithChallenger(snapshot, baseResources, mid, incomePerHour, idx);
      if (p && p.feasible) { best = p; best.target_steps = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!best) return { found: false, steps: 0, plan: null };
    /* R38（2026-10-16）：附带「距原目标仍缺」。
       ⚠ 不能直接用 plan.remaining_shortage —— 该方案在缩小的步数上是**可行**的，
         所以它的 remaining_shortage 恒为 0，拿来当缺口会渲染成「三项✅足够」。
       真实缺口 = 目标步数所需 − 底盘 − 方案实际开出的全部箱子；
       全部在本函数内算好（渲染层只展示，禁重算）。 */
    var needT = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var got = planResources(snapshot, best, incomePerHour);
    var ts = {};
    RESOURCES.forEach(function (r) {
      ts[r] = Math.max(0.0, (needT[r] || 0.0) - (baseResources[r] || 0.0) - (got[r] || 0.0));
    });
    best.target_shortage = ts;
    return { found: true, steps: best.target_steps, plan: best, target_shortage: ts };
  }

  /* 目标不可达时的「最优均衡」回退方案
     直接按目标等级调用求解器时，若不可达会退化成「把全部自选箱堆给最难补的那一项」
     （贪心按 remaining/value 比值的自然结果），该分配既不能最大化可达等级、剩余缺口也偏悲观。
     本函数二分「联合优化器能达成的最大步数」，返回该步数下的方案：
       { found, steps, plan } —— found=false 表示连 1 级都开不出来。
     仅在目标不可达时调用（调用方已知 feasible=false），避免与 immediateLevels 的
     外层二分叠加造成 O(log²) 重复枚举。

     R31：偏好随 snapshot.challenger_pref 传递（auto 时双跑，按
     「① 步数高者胜 → ② 1H 折算总缺口小者胜 → ③ 芯尘优先」择优）。 */
  function bestEffortPlan(snapshot, baseResources, targetSteps, incomePerHour) {
    var pref = (snapshot && snapshot.challenger_pref) || "auto";
    var opts = challengerOptionsOf(snapshot);
    if (!opts) return bestEffortSolve(snapshot, baseResources, targetSteps, incomePerHour, 0);
    if (pref === "battle" || pref === "dust") {
      return bestEffortSolve(snapshot, baseResources, targetSteps, incomePerHour, challengerIndexForPref(snapshot, pref, 0));
    }
    var r0 = bestEffortSolve(snapshot, baseResources, targetSteps, incomePerHour, 0);
    var r1 = bestEffortSolve(snapshot, baseResources, targetSteps, incomePerHour, 1);
    if (r0.found !== r1.found) return r0.found ? r0 : r1;
    if (!r0.found) return r0;                                  // 两项都开不出 1 级
    if (r0.steps !== r1.steps) return r0.steps > r1.steps ? r0 : r1;
    // 步数相同 → 比 1H 折算总缺口（小者胜；相等 ⇒ 芯尘优先 = r1）
    return gapHours(r0.plan, incomePerHour) < gapHours(r1.plan, incomePerHour) ? r0 : r1;
  }

  global.NikkeBoxes = {
    fixedBoxResources: fixedBoxResources,
    fixedBoxesNeeded: fixedBoxesNeeded,
    fixedFillGaps: fixedFillGaps,
    challengerUnitsResources: challengerUnitsResources,
    challengerOptionsOf: challengerOptionsOf,
    challengerIndexForPref: challengerIndexForPref,
    gapHours: gapHours,
    planResources: planResources,
    optionValue: optionValue,
    single: single,
    solveWithChallenger: solveWithChallenger,
    optimizeSelectableForTarget: optimizeSelectableForTarget,
    bestEffortSolve: bestEffortSolve,
    bestEffortPlan: bestEffortPlan,
    fastThreeTwoFlexiblePlan: fastThreeTwoFlexiblePlan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeBoxes;
})(typeof window !== "undefined" ? window : globalThis);
