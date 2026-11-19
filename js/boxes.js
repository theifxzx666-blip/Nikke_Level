/* boxes.js — 固定小时箱折算（红球 TRUNC）+ 自选箱优化（自 Python calculator/boxes 移植） */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var RESOURCES = C.RESOURCES;
  var addRes = C.addRes;

  /* ===== 红球定点口径（R62）：先把所有箱折算成总小时数、最后统一 floor 一次 =====
     逐箱 floor 在 100 个 1H 盒上少算 41~95 个（lv518 少 0.65%、lv1 少 6.8%）。
     2026-11-15 从 bc4d8a8 恢复（23a23c8 曾把此处退回逐箱 floor）。 */
  function dustTrunc(v) { return Math.floor(v + 1e-9); }
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
  function joinHours(hours, incomePerHour) {
    var inc = incomePerHour || {};
    function out(r) {
      var v = (inc[r] || 0.0) * (hours[r] || 0);
      return r === "core_dust" ? dustTrunc(v) : v;
    }
    return { credit: out("credit"), battle_data: out("battle_data"), core_dust: out("core_dust") };
  }

  function fixedBoxResources(snapshot, incomePerHour) {
    return joinHours(hoursOfFixed(snapshot), incomePerHour);
  }

  /* 固定小时箱按缺口最小开启：单资源箱从大时长到小时长，成长套组同时补三资源。
     gaps = 三资源剩余缺口；返回 { used, remaining_shortage } */
  function fixedFillGaps(snapshot, gaps, incomePerHour) {
    var remaining = {};
    RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, gaps[r] || 0.0); });
    var used = {};
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    /* R62：决策一律用精确值 rate×h（不逐箱 floor）——
       定点口径下 N 个箱的总贡献是 floor(rate×h×N)，与逐箱 floor 之和不同；
       用精确值做贪心才能得到最少箱数，实际开出的数值由 planResources 按「总小时数 → 一次 floor」给出 */
    function boxVal(res, h) {
      return (incomePerHour[res] || 0.0) * h;
    }
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

  /* ===== 挑战者箱二选一：偏好解析 + 折算缺口（2026-11-18 从 aacdd86 恢复）=====
     23a23c8 曾把这里改成「永远选第一项（战斗数据辑）」，导致「自动择优 / 芯尘优先」两项设置整体消失。 */
  var CHALLENGER_REWARD_KEY = { battle: "battle_data", dust: "core_dust" };

  /* 找出「units 二选一」的挑战者箱选项数组；没有则返回 null */
  function challengerOptionsOf(snapshot) {
    var list = (snapshot && snapshot.selectable_boxes) || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.quantity > 0 && b.options && b.options.length === 2 &&
          b.options.every(function (o) { return o.mode === "units"; })) return b.options;
    }
    return null;
  }

  /* 偏好 → 选项下标；解析不出（无箱 / 非 units / auto）时用 fallbackIdx（缺省 0） */
  function challengerIndexForPref(snapshot, pref, fallbackIdx) {
    var opts = challengerOptionsOf(snapshot);
    var fb = (fallbackIdx === undefined ? 0 : fallbackIdx);
    if (!opts) return fb;
    var key = CHALLENGER_REWARD_KEY[pref];
    if (!key) return fb;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].rewards && opts[i].rewards[key] > 0) return i;
    }
    return fb;
  }

  /* 1H 箱折算总缺口（小时）：auto 双跑时用来比谁更省缺口（旧版 R31 定稿口径） */
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

  /* 挑战者成长宝箱（units 固定数值二选一）全开的资源贡献：开箱顺序①
     idx 缺省 = 按 snapshot.challenger_pref 解析（battle→战斗数据辑 / dust→芯尘 / auto→第一项；
     auto 的「双跑择优」在 optimizeSelectableForTarget 里做，本函数只负责单跑取数）。 */
  function challengerUnitsResources(snapshot, idx) {
    var res = C.zeroRes();
    var useIdx = (typeof idx === "number") ? idx
      : challengerIndexForPref(snapshot, (snapshot && snapshot.challenger_pref) || "auto", 0);
    (snapshot.selectable_boxes || []).forEach(function (b) {
      if (b.quantity <= 0 || !b.options || b.options.length !== 2) return;
      var allUnits = b.options.every(function (o) { return o.mode === "units"; });
      if (!allUnits) return;
      var o0 = b.options[useIdx] || b.options[0];
      if (o0.rewards) RESOURCES.forEach(function (r) { res[r] += (o0.rewards[r] || 0) * b.quantity; });
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
     凭空多出一份推图收益（2026-10-14 修：曾导致「达成目标方案」漏开信用点盒）。 */
  function optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour, chalForceIdx) {
    /* 挑战者箱二选一：auto 走「双跑择优」（2026-11-18 从 aacdd86 恢复，旧版 R31 定稿口径）
       ① 一方可达 → 取可达那方；② 都可达 → 芯尘优先；③ 都不可达 → 比 1H 箱折算缺口小者，相等取芯尘。 */
    var chalPref = (snapshot && snapshot.challenger_pref) || "auto";
    if (typeof chalForceIdx !== "number" && chalPref === "auto" && challengerOptionsOf(snapshot)) {
      /* 两个候选下标按「奖励内容」解析，不写死 0/1：当前挑战者箱是 [战斗数据辑, 芯尘]，
         但顺序若被上表调整，写死的 1 会静默变成「战斗优先」，与「都可达取芯尘」的口径相反。 */
      var iBattle = challengerIndexForPref(snapshot, "battle", 0);
      var iDust = challengerIndexForPref(snapshot, "dust", 1);
      if (iBattle === iDust) return optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour, iBattle);
      var runA = optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour, iBattle);
      var runB = optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour, iDust);
      if (runA.feasible !== runB.feasible) return runA.feasible ? runA : runB;
      if (runA.feasible && runB.feasible) {
        /* 都可达：默认芯尘（红球长期最稀缺），但**先比箱子数** ——
           典型反例（2026-11-20 用户报障）：芯尘早被裸资源覆盖，选芯尘等于白开一个方舟箱，
           此时选战斗数据辑反而更省。箱数相同才按「芯尘优先」定。 */
        var na = runA.boxes_used || 0, nb = runB.boxes_used || 0;
        if (na !== nb) return na < nb ? runA : runB;
        return runB;
      }
      return gapHours(runA, incomePerHour) < gapHours(runB, incomePerHour) ? runA : runB;
    }
    var chalIdx = (typeof chalForceIdx === "number") ? chalForceIdx
      : challengerIndexForPref(snapshot, chalPref, 0);
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var base = baseResources;
    var shortage = {};
    RESOURCES.forEach(function (r) { shortage[r] = Math.max(0.0, needed[r] - base[r]); });
    // 裸资源已满足目标：什么都不开（挑战者也保留）
    if (RESOURCES.every(function (r) { return shortage[r] <= 1e-6; })) {
      var emptyPlan = (snapshot.selectable_boxes || []).filter(function (b) { return b.quantity > 0; })
        .map(function (b) { return { name: b.name, used: 0, keep: b.quantity, choices: {} }; });
      return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: {}, selectable: emptyPlan, boxes_used: 0, remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 }, feasible: true };
    }

    var boxes = [];
    (snapshot.selectable_boxes || []).forEach(function (box) {
      if (box.quantity > 0 && box.options && box.options.length) {
        boxes.push({ box: box, left: box.quantity, choices: {} });
      }
    });

    // 开箱顺序①：挑战者成长宝箱（units 固定数值二选一）优先全消耗（按 chalIdx 取项，无分配损耗）
    var challengerRes = C.zeroRes();
    boxes.forEach(function (item) {
      var opts = item.box.options || [];
      if (item.left > 0 && opts.length === 2 && opts.every(function (o) { return o.mode === "units"; })) {
        var o0 = opts[chalIdx] || opts[0];
        item.left = 0;
        item.choices[o0.label] = item.box.quantity;
        if (o0.rewards) {
          RESOURCES.forEach(function (r) { challengerRes[r] += (o0.rewards[r] || 0) * item.box.quantity; });
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
      return fast;
    }

    var hasMulti = boxes.some(function (item) {
      return item.box.options.some(function (opt) { return !single(opt); });
    });
    if (hasMulti) {
      return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: fixedFill.used, selectable: [], boxes_used: 0, remaining_shortage: shortage, feasible: false, error: "存在多资源同时奖励箱子，需扩展枚举规则" };
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
    return { target_steps: targetSteps, needed: needed, fixed: fixedBoxResources(snapshot, incomePerHour), fixed_used: fixedFill.used, selectable: plans, boxes_used: totalUsed, remaining_shortage: remaining, feasible: feasible };
  }

  /* 快速有界求解器：方舟(三选一) + 挑战者(二选一 units) + 30天(三选一) 形态
     shortage = 开箱顺序①挑战者全开、②固定箱按需之后的剩余缺口；固定箱明细由 fixedUsed 传入 */
  function fastThreeTwoFlexiblePlan(boxes, shortage, needed, fixedUsed, incomePerHour, targetSteps) {
    if (boxes.length !== 3) return null;
    function pick(cond) { for (var i = 0; i < boxes.length; i++) if (cond(boxes[i])) return boxes[i]; return null; }
    var three = pick(function (b) { return b.box.options.length === 3 && b.box.quantity <= 100; });
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

    var best = null;
    var q3 = three.box.quantity;

    /* 二选一箱（挑战者）已在开箱顺序①消耗：它的贡献与方案条目在整个枚举里恒定，先算一次。
       旧实现把它们放在三重循环内部，且就地改 two.left / two.choices —— 一旦循环没产出方案，
       被改过的状态会污染后面的贪心兜底。改为只算局部量、命中方案时才回写。 */
    var usedTwo = two.box.quantity - two.left;
    var labels2 = {};
    var contribTwo = C.zeroRes();
    if (two.left > 0) {
      usedTwo = two.box.quantity;
      labels2[twoOptions[0].label] = two.box.quantity;
      contribTwo[twoOptions[0].resource] += two.box.quantity * twoOptions[0].value;
    } else {
      Object.keys(two.choices).forEach(function (k) { labels2[k] = two.choices[k]; });
    }
    var R = RESOURCES;
    var remBase = [0.0, 0.0, 0.0];
    for (var ri = 0; ri < R.length; ri++) {
      remBase[ri] = Math.max(0.0, (shortage[R[ri]] || 0.0) - (contribTwo[R[ri]] || 0.0));
    }
    var o0res = R.indexOf(threeOptions[0].resource), o0val = threeOptions[0].value;
    var o1res = R.indexOf(threeOptions[1].resource), o1val = threeOptions[1].value;
    var o2res = R.indexOf(threeOptions[2].resource), o2val = threeOptions[2].value;
    var flexVal = [0.0, 0.0, 0.0];
    for (var fi = 0; fi < R.length; fi++) {
      flexVal[fi] = flexValues[R[fi]] ? flexValues[R[fi]].value : 0.0;
    }

    /* 枚举上界（等价裁剪）：每个箱子只贡献一种资源、成本恒为 1 个箱子，
       因此某项投给某资源的数量超过 ceil(该资源剩余缺口 / 单箱价值) 之后全是溢出浪费，
       永远不会出现在「总箱数最少」的解里 —— 砍掉这部分不改变最优解，只砍搜索空间。
       旧实现固定枚举 (q3³)/6 组：方舟箱 86 个即 10.6 万组、单次求解 ≈78ms，evaluate() 全量 ≈2s。 */
    function capOf(res, val) {
      if (res < 0 || !(val > 0)) return 0;
      var need = remBase[res];
      if (need <= 1e-6) return 0;
      return Math.min(q3, Math.ceil(need / val));
    }
    var cap0 = capOf(o0res, o0val);
    var cap1 = capOf(o1res, o1val);
    var cap2 = capOf(o2res, o2val);

    for (var count0 = 0; count0 <= cap0; count0++) {
      for (var count1 = 0; count1 <= cap1 && count0 + count1 <= q3; count1++) {
        var add0 = count0 * o0val, add1 = count1 * o1val;
        var used01 = count0 + count1;
        for (var count2 = 0; count2 <= cap2 && used01 + count2 <= q3; count2++) {
          var used3 = used01 + count2;
          if (best && used3 + usedTwo >= best.boxes_used) continue;   // 还没加 flex 就已经不更优
          var add2 = count2 * o2val;
          var rem0 = remBase[0], rem1 = remBase[1], rem2 = remBase[2];
          if (o0res === 0) rem0 -= add0; else if (o0res === 1) rem1 -= add0; else if (o0res === 2) rem2 -= add0;
          if (o1res === 0) rem0 -= add1; else if (o1res === 1) rem1 -= add1; else if (o1res === 2) rem2 -= add1;
          if (o2res === 0) rem0 -= add2; else if (o2res === 1) rem1 -= add2; else if (o2res === 2) rem2 -= add2;
          if (rem0 < 0) rem0 = 0;
          if (rem1 < 0) rem1 = 0;
          if (rem2 < 0) rem2 = 0;

          var flexCounts = [0, 0, 0];
          var flexUsed = 0;
          var possible = true;
          var rems = [rem0, rem1, rem2];
          for (var k = 0; k < 3; k++) {
            if (rems[k] <= 1e-6) continue;
            var fv = flexVal[k];
            if (!(fv > 0)) { possible = false; break; }
            var cntF = Math.ceil(rems[k] / fv);
            flexCounts[k] = cntF;
            flexUsed += cntF;
          }
          if (!possible || flexUsed > flex.box.quantity) continue;
          var total = used3 + usedTwo + flexUsed;
          if (best && total >= best.boxes_used) continue;

          var labels3 = {};
          labels3[threeOptions[0].label] = count0;
          labels3[threeOptions[1].label] = count1;
          labels3[threeOptions[2].label] = count2;
          var labelsFlex = {};
          Object.keys(flexValues).forEach(function (r) {
            var ix = R.indexOf(r);
            labelsFlex[flexValues[r].label] = ix >= 0 ? flexCounts[ix] : 0;
          });
          best = {
            target_steps: targetSteps, needed: needed,
            fixed_used: fixedUsed,
            selectable: [
              { name: two.box.name, used: usedTwo, keep: two.box.quantity - usedTwo, choices: labels2 },
              { name: three.box.name, used: used3, keep: three.box.quantity - used3, choices: labels3 },
              { name: flex.box.name, used: flexUsed, keep: flex.box.quantity - flexUsed, choices: labelsFlex },
            ],
            boxes_used: total,
            remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 },
            feasible: true,
          };
        }
      }
    }
    /* 命中方案后回写二选一箱的消耗状态（与旧行为一致：供后续条目汇总） */
    if (best && two.left > 0) {
      two.left = 0;
      two.choices[twoOptions[0].label] = two.box.quantity;
    }
    return best;
  }

  /* 目标不可达时的「最优均衡」回退方案
     直接按目标等级调用 optimizeSelectableForTarget 时，若不可达会退化成「把全部自选箱
     堆给最难补的那一项」（贪心按 remaining/value 比值的自然结果），该分配既不能最大化
     可达等级、剩余缺口也偏悲观。
     本函数二分「联合优化器能达成的最大步数」，返回该步数下的方案：
       { found, steps, plan } —— found=false 表示连 1 级都开不出来。
     仅在目标不可达时调用（调用方已知 feasible=false），避免与 immediateLevels 的
     外层二分叠加造成 O(log²) 重复枚举。 */
  function bestEffortPlan(snapshot, baseResources, targetSteps, incomePerHour) {
    var hi = Math.max(0, targetSteps - 1);
    if (hi <= 0) return { found: false, steps: 0, plan: null };
    var lo = 1, best = null;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2);
      var p = optimizeSelectableForTarget(snapshot, baseResources, mid, incomePerHour);
      if (p && p.feasible) { best = p; best.target_steps = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best ? { found: true, steps: best.target_steps, plan: best } : { found: false, steps: 0, plan: null };
  }

  global.NikkeBoxes = {
    fixedBoxResources: fixedBoxResources,
    fixedBoxesNeeded: fixedBoxesNeeded,
    fixedFillGaps: fixedFillGaps,
    challengerUnitsResources: challengerUnitsResources,
    optionValue: optionValue,
    single: single,
    optimizeSelectableForTarget: optimizeSelectableForTarget,
    bestEffortPlan: bestEffortPlan,
    fastThreeTwoFlexiblePlan: fastThreeTwoFlexiblePlan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeBoxes;
})(typeof window !== "undefined" ? window : globalThis);
