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

  function optimizeSelectableForTarget(snapshot, baseResources, targetSteps, incomePerHour) {
    var needed = C.costForLevels(snapshot, snapshot.current_sync_level, targetSteps);
    var fixed = fixedBoxResources(snapshot, incomePerHour);
    var available = addRes(baseResources, fixed);
    var shortage = {};
    RESOURCES.forEach(function (r) { shortage[r] = Math.max(0.0, needed[r] - available[r]); });
    // 裸资源 + 固定小时箱已满足目标：不开任何自选箱（挑战者也保留），无需优化
    if (RESOURCES.every(function (r) { return shortage[r] <= 1e-6; })) {
      var emptyPlan = (snapshot.selectable_boxes || []).filter(function (b) { return b.quantity > 0; })
        .map(function (b) { return { name: b.name, used: 0, keep: b.quantity, choices: {} }; });
      return { target_steps: targetSteps, needed: needed, fixed: fixed, selectable: emptyPlan, boxes_used: 0, remaining_shortage: { credit: 0.0, battle_data: 0.0, core_dust: 0.0 }, feasible: true };
    }
    var remaining = {};
    RESOURCES.forEach(function (r) { remaining[r] = shortage[r]; });

    var boxes = [];
    (snapshot.selectable_boxes || []).forEach(function (box) {
      if (box.quantity > 0 && box.options && box.options.length) {
        boxes.push({ box: box, left: box.quantity, choices: {} });
      }
    });

    var fast = fastThreeTwoFlexiblePlan(boxes, shortage, needed, fixed, incomePerHour, targetSteps);
    if (fast) return fast;

    var hasMulti = boxes.some(function (item) {
      return item.box.options.some(function (opt) { return !single(opt); });
    });
    if (hasMulti) {
      return { target_steps: targetSteps, needed: needed, fixed: fixed, selectable: [], boxes_used: 0, remaining_shortage: shortage, feasible: false, error: "存在多资源同时奖励箱子，需扩展枚举规则" };
    }

    // 挑战者（units 模式二选一箱）全消耗（与 fast 路径一致：单位数值奖励无分配损耗）
    boxes.forEach(function (item) {
      var opts = item.box.options || [];
      if (opts.length === 2 && opts.every(function (o) { return o.mode === "units"; })) {
        var o0 = opts[0];
        item.left = 0;
        item.choices[o0.label] = item.box.quantity;
        if (o0.rewards) {
          RESOURCES.forEach(function (r) { remaining[r] = Math.max(0.0, remaining[r] - (o0.rewards[r] || 0) * item.box.quantity); });
        }
      }
    });

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

    var plans = boxes.map(function (item) {
      return { name: item.box.name, used: item.box.quantity - item.left, keep: item.left, choices: item.choices };
    });
    var feasible = !RESOURCES.some(function (r) { return remaining[r] > 1e-6; });
    return { target_steps: targetSteps, needed: needed, fixed: fixed, selectable: plans, boxes_used: totalUsed, remaining_shortage: remaining, feasible: feasible };
  }

  /* 快速有界求解器：方舟(三选一) + 30天(三选一) + 挑战者(二选一 units) 形态 */
  function fastThreeTwoFlexiblePlan(boxes, shortage, needed, fixed, incomePerHour, targetSteps) {
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
        // 挑战者箱（two，二选一 units）：单位数值奖励、无分配损耗，应该全消耗
        // 简化：全选第一个选项（battle_data，挑战者主收益方向）
        var contrib2 = { credit: contrib.credit, battle_data: contrib.battle_data, core_dust: contrib.core_dust };
        var labels2 = {};
        for (var idx = 0; idx < 2; idx++) labels2[twoOptions[idx].label] = 0;
        labels2[twoOptions[0].label] = two.box.quantity;
        var usedTwo = two.box.quantity;
        contrib2[twoOptions[0].resource] += two.box.quantity * twoOptions[0].value;
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
              target_steps: targetSteps, needed: needed, fixed: fixed,
              selectable: [
                { name: three.box.name, used: count0 + count1 + count2, keep: three.box.quantity - count0 - count1 - count2, choices: labels3 },
                { name: two.box.name, used: usedTwo, keep: two.box.quantity - usedTwo, choices: labels2 },
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
    optionValue: optionValue,
    single: single,
    optimizeSelectableForTarget: optimizeSelectableForTarget,
    fastThreeTwoFlexiblePlan: fastThreeTwoFlexiblePlan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeBoxes;
})(typeof window !== "undefined" ? window : globalThis);
