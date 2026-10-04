/* boxes.js — 固定小时箱折算（红球 TRUNC）+ 自选箱优化（自 Python calculator/boxes 移植） */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var RESOURCES = C.RESOURCES;
  var addRes = C.addRes;

  function fixedBoxResources(snapshot, incomePerHour) {
    var result = C.zeroRes();
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    function boxValue(resource, hours) {
      var rate = incomePerHour[resource] || 0.0;
      if (resource === "core_dust") return Math.floor(rate * hours);
      return rate * hours;
    }
    Object.keys(snapshot.fixed_boxes || {}).forEach(function (name) {
      var hoursMap = snapshot.fixed_boxes[name] || {};
      if (name === "成长套组") {
        // 成长套组计入固定箱折算：对信用/战斗/芯尘三类各按小时收益*数量叠加（纳入计算口径）
        Object.keys(hoursMap).forEach(function (h) {
          var count = hoursMap[h];
          RESOURCES.forEach(function (r) { result[r] += boxValue(r, parseInt(h, 10)) * count; });
        });
        return;
      }
      var resource = names[name];
      if (!resource) return;
      Object.keys(hoursMap).forEach(function (h) {
        result[resource] += boxValue(resource, parseInt(h, 10)) * hoursMap[h];
      });
    });
    return result;
  }

  /* 固定小时箱按缺口最小开启：单资源箱从大时长到小时长，成长套组同时补三资源。
     gaps = 三资源剩余缺口；返回 { used, remaining_shortage } */
  function fixedFillGaps(snapshot, gaps, incomePerHour) {
    var remaining = {};
    RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, gaps[r] || 0.0); });
    var used = {};
    var names = { "芯尘盒": "core_dust", "信用点盒": "credit", "战斗数据辑盒": "battle_data" };
    function boxVal(res, h) {
      return res === "core_dust" ? Math.floor((incomePerHour[res] || 0.0) * h) : (incomePerHour[res] || 0.0) * h;
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
     preConsumed（可选）：开箱顺序①挑战者成长宝箱已贡献的资源，先从缺口中扣除 */
  function fixedBoxesNeeded(snapshot, baseResources, targetSteps, incomePerHour, preConsumed) {
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var balance = addRes(baseResources, snapshot.stage_clear_resources || {});
    var gaps = {};
    RESOURCES.forEach(function (r) {
      var g = Math.max(0.0, needed[r] - balance[r]);
      if (preConsumed) g = Math.max(0.0, g - (preConsumed[r] || 0));
      gaps[r] = g;
    });
    return fixedFillGaps(snapshot, gaps, incomePerHour);
  }

  /* 挑战者成长宝箱（units 固定数值二选一）全开的资源贡献：开箱顺序①，始终全消耗选第一项 */
  function challengerUnitsResources(snapshot) {
    var res = C.zeroRes();
    (snapshot.selectable_boxes || []).forEach(function (b) {
      if (b.quantity <= 0 || !b.options || b.options.length !== 2) return;
      var allUnits = b.options.every(function (o) { return o.mode === "units"; });
      if (!allUnits) return;
      var o0 = b.options[0];
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
     baseResources = 裸资源（调用方决定是否含推图/等待期积累） */
  function optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour) {
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var base = addRes(baseResources, snapshot.stage_clear_resources || {});
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

    // 开箱顺序①：挑战者成长宝箱（units 固定数值二选一）优先全消耗（选第一项，无分配损耗）
    var challengerRes = C.zeroRes();
    boxes.forEach(function (item) {
      var opts = item.box.options || [];
      if (item.left > 0 && opts.length === 2 && opts.every(function (o) { return o.mode === "units"; })) {
        var o0 = opts[0];
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
    for (var count0 = 0; count0 <= q3; count0++) {
      for (var count1 = 0; count1 <= q3 - count0; count1++) {
        for (var count2 = 0; count2 <= q3 - count0 - count1; count2++) {
        var contrib = C.zeroRes();
        var labels3 = {};
        var combos = [count0, count1, count2];
        for (var i = 0; i < 3; i++) {
          var o = threeOptions[i];
          contrib[o.resource] += combos[i] * o.value;
          labels3[o.label] = combos[i];
        }
        // 挑战者（two）已在开箱顺序①全消耗（units 固定数值、无分配损耗），
        // 其贡献已从 shortage 中扣除，这里只汇总方案条目；
        // 非 units 二选一箱（罕见，顺序①不消耗）维持旧口径：全消耗选第一项
        var contrib2 = { credit: contrib.credit, battle_data: contrib.battle_data, core_dust: contrib.core_dust };
        var labels2 = {};
        var usedTwo = two.box.quantity - two.left;
        if (two.left > 0) {
          usedTwo = two.box.quantity;
          two.left = 0;
          labels2[twoOptions[0].label] = two.box.quantity;
          two.choices[twoOptions[0].label] = two.box.quantity;
          contrib2[twoOptions[0].resource] += two.box.quantity * twoOptions[0].value;
        } else {
          Object.keys(two.choices).forEach(function (k) { labels2[k] = two.choices[k]; });
        }
        var remaining = {};
        RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, shortage[r] - contrib2[r]); });
          var flexCounts = {};
          var flexUsed = 0;
          var possible = true;
          RESOURCES.forEach(function (r) {
            if (remaining[r] <= 1e-6) return;
            if (!flexValues[r]) { possible = false; return; }
            var fv = flexValues[r].value;
            var cntF = fv ? Math.ceil(remaining[r] / fv) : 1e9;
            flexCounts[r] = cntF;
            flexUsed += cntF;
          });
          if (!possible || flexUsed > flex.box.quantity) continue;
          var total = count0 + count1 + count2 + usedTwo + flexUsed;
          if (!best || total < best.boxes_used) {
            var labelsFlex = {};
            Object.keys(flexValues).forEach(function (r) { labelsFlex[flexValues[r].label] = flexCounts[r] || 0; });
            best = {
              target_steps: targetSteps, needed: needed,
              fixed_used: fixedUsed,
              selectable: [
                { name: two.box.name, used: usedTwo, keep: two.box.quantity - usedTwo, choices: labels2 },
                { name: three.box.name, used: count0 + count1 + count2, keep: three.box.quantity - count0 - count1 - count2, choices: labels3 },
                { name: flex.box.name, used: flexUsed, keep: flex.box.quantity - flexUsed, choices: labelsFlex },
              ],
              boxes_used: total,
              remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 },
              feasible: true,
            };
          }
        }
      }
      }
    return best;
  }

  global.NikkeBoxes = {
    fixedBoxResources: fixedBoxResources,
    fixedBoxesNeeded: fixedBoxesNeeded,
    fixedFillGaps: fixedFillGaps,
    challengerUnitsResources: challengerUnitsResources,
    optionValue: optionValue,
    single: single,
    optimizeSelectableForTarget: optimizeSelectableForTarget,
    fastThreeTwoFlexiblePlan: fastThreeTwoFlexiblePlan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeBoxes;
})(typeof window !== "undefined" ? window : globalThis);
