/* scenarios.js — 场景 A-F 与总评估（自 Python calculator/scenarios 移植） */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var O = global.NikkeOutpost;
  var B = global.NikkeBoxes;
  var RESOURCES = C.RESOURCES;
  var addRes = C.addRes;
  var subRes = C.subRes;

  function daysToTarget(shortage, daily) {
    var days = {};
    RESOURCES.forEach(function (r) {
      days[r] = (daily[r] || 0.0) > 0 ? shortage[r] / daily[r] : Infinity;
    });
    var bottleneck = RESOURCES.reduce(function (mx, r) { return days[r] > days[mx] ? r : mx; }, RESOURCES[0]);
    return { days_by_resource: days, days: days[bottleneck], bottleneck: bottleneck };
  }

  function noBoxToTarget(snapshot, target) {
    target = target || snapshot.target_sync_level;
    var steps = Math.max(0, target - snapshot.current_sync_level);
    var required = C.costForLevels(snapshot, snapshot.current_sync_level, steps);
    var shortage = {};
    RESOURCES.forEach(function (r) { shortage[r] = Math.max(0.0, required[r] - snapshot.bare_resources[r]); });
    var daily = C.dailyIncome(snapshot, snapshot.daily_wipeout_count, snapshot.wipeout_hours_each);
    var result = daysToTarget(shortage, daily);
    result.target = target; result.steps = steps; result.required = required; result.shortage = shortage;
    result.daily_income = daily; result.uses_boxes = false;
    var start = new Date(snapshot.recorded_at.getTime());
    result.estimated_at = C.isoMinutes(new Date(start.getTime() + result.days * 86400000));
    return result;
  }

  function immediateLevels(snapshot, includeFixed, includeSelectable, incomePerHour) {
    incomePerHour = incomePerHour || snapshot.income_per_hour;
    var resources = addRes(snapshot.bare_resources, snapshot.stage_clear_resources || {});
    var fixed = includeFixed ? B.fixedBoxResources(snapshot, incomePerHour) : C.zeroRes();
    resources = addRes(resources, fixed);
    var steps = C.affordableLevels(resources, snapshot, snapshot.current_sync_level);
    var result = { level: snapshot.current_sync_level + steps, steps: steps, resources_before_selectable: resources, fixed: fixed, selectable: null };
    if (includeSelectable) {
      var low = steps + 1, high = steps + 60;
      while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var plan = B.optimizeSelectableForTarget(snapshot, addRes(snapshot.bare_resources, snapshot.stage_clear_resources || {}), mid, incomePerHour);
        if (plan.feasible) {
          result.level = snapshot.current_sync_level + mid;
          result.selectable = plan;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
    }
    return result;
  }

  function futureMainStoryScenario(snapshot) {
    if (!snapshot.main_story_open_at || !snapshot.future_base_level) {
      return { available: false, reason: "未填写新主线开放时间或未来基地收益" };
    }
    var openAt = new Date(snapshot.main_story_open_at.getTime());
    var start = new Date(snapshot.recorded_at.getTime());
    var natural = C.incomeBetween(snapshot, start, openAt);
    var wipeoutHours = snapshot.daily_wipeout_count * snapshot.wipeout_hours_each;
    var days = Math.max(0, Math.round((openAt.getTime() - start.getTime()) / 86400000));
    RESOURCES.forEach(function (r) {
      natural[r] += (snapshot.income_per_hour[r] || 0.0) * wipeoutHours * days;
    });
    var future = JSON.parse(JSON.stringify(snapshot));
    future.bare_resources = addRes(snapshot.bare_resources, natural);
    future.income_per_hour = snapshot.future_income_per_hour || snapshot.income_per_hour;
    var fixed = immediateLevels(future, true, true, future.income_per_hour);
    return { available: true, open_at: C.isoMinutes(openAt), natural_before_open: natural, projected_bare: future.bare_resources, result: fixed };
  }

  function effectiveRate(snapshot, when) {
    var source = snapshot.income_per_hour;
    if (snapshot.main_story_open_at && when >= snapshot.main_story_open_at) {
      source = snapshot.future_income_per_hour || source;
    }
    var factor = 1.0 + (snapshot.daily_wipeout_count * snapshot.wipeout_hours_each / 24.0);
    return { credit: (source.credit || 0.0) * factor, battle_data: (source.battle_data || 0.0) * factor, core_dust: (source.core_dust || 0.0) * factor };
  }

  function naturalToTarget(snapshot, target) {
    var level = snapshot.current_sync_level;
    var balance = { credit: snapshot.bare_resources.credit, battle_data: snapshot.bare_resources.battle_data, core_dust: snapshot.bare_resources.core_dust };
    var when = new Date(snapshot.recorded_at.getTime());
    var start = when.getTime();
    var guard = 0;
    while (level < target && guard < 10000) {
      guard += 1;
      var cost = C.costForLevel(snapshot.upgrade_cost, level);
      if (balance.credit >= cost.credit && balance.battle_data >= cost.battle_data && balance.core_dust >= cost.core_dust) {
        balance = subRes(balance, cost);
        level += 1;
        continue;
      }
      var rate = effectiveRate(snapshot, when);
      var waits = [];
      RESOURCES.forEach(function (r) {
        if (cost[r] > balance[r] && rate[r] > 0) waits.push((cost[r] - balance[r]) / rate[r]);
      });
      if (!waits.length) break;
      var waitHours = Math.max.apply(null, waits);
      var nextSwitch = snapshot.main_story_open_at ? new Date(snapshot.main_story_open_at.getTime()) : null;
      if (nextSwitch && when < nextSwitch && nextSwitch.getTime() < when.getTime() + waitHours * 3600000) {
        var hours = (nextSwitch.getTime() - when.getTime()) / 3600000.0;
        var rate2 = effectiveRate(snapshot, when);
        balance = addRes(balance, { credit: rate2.credit * hours, battle_data: rate2.battle_data * hours, core_dust: rate2.core_dust * hours });
        when = new Date(nextSwitch.getTime());
      } else {
        balance = addRes(balance, { credit: rate.credit * waitHours, battle_data: rate.battle_data * waitHours, core_dust: rate.core_dust * waitHours });
        when = new Date(when.getTime() + waitHours * 3600000);
      }
    }
    return {
      level: level, target: target,
      estimated_at: C.isoMinutes(when),
      days: (when.getTime() - start) / 86400000.0,
      remaining: balance, uses_boxes: false,
    };
  }

  function scenarioF(snapshot, target) {
    target = target || snapshot.alternate_target_level;
    var start = new Date(snapshot.recorded_at.getTime());
    var currentIncome = snapshot.income_per_hour;
    var futureIncome = snapshot.future_income_per_hour || currentIncome;
    var stage = snapshot.stage_clear_resources || {};

    var immediatePlan = B.optimizeSelectableForTarget(snapshot, addRes(snapshot.bare_resources, stage), target - snapshot.current_sync_level, currentIncome);
    var immediateFixed = B.fixedBoxResources(snapshot, currentIncome);
    var allBoxesRes = addRes(addRes(snapshot.bare_resources, stage), immediateFixed);
    var immediateLevelAfter = snapshot.current_sync_level + C.affordableLevels(allBoxesRes, snapshot, snapshot.current_sync_level);
    if (immediatePlan.feasible) immediateLevelAfter = Math.max(immediateLevelAfter, target);
    var immediate = {
      name: "现在立即开箱冲级", target: target,
      feasible: immediatePlan.feasible,
      level: immediateLevelAfter,
      date: C.isoMinutes(start),
      days: 0.0,
      boxes: immediatePlan.selectable || [],
      fixed_box_resources: immediateFixed,
      assumption: "不动现有箱子，直接按当前仓库道具数量在当前基地收益下开箱升级，得到开箱后的预计等级",
    };

    var post;
    if (snapshot.main_story_open_at && snapshot.main_story_open_at > start && futureIncome) {
      var natural = C.incomeBetween(snapshot, start, snapshot.main_story_open_at);
      var daysF = (snapshot.main_story_open_at.getTime() - start.getTime()) / 86400000.0;
      var wipeoutHours = snapshot.daily_wipeout_count * snapshot.wipeout_hours_each;
      RESOURCES.forEach(function (r) {
        natural[r] += (currentIncome[r] || 0.0) * wipeoutHours * Math.floor(daysF);
      });
      var postBase = addRes(snapshot.bare_resources, natural);
      var postPlan = B.optimizeSelectableForTarget(snapshot, postBase, target - snapshot.current_sync_level, futureIncome);
      var postFixed = B.fixedBoxResources(snapshot, futureIncome);
      var postLevelAfter = snapshot.current_sync_level + C.affordableLevels(addRes(postBase, postFixed), snapshot, snapshot.current_sync_level);
      if (postPlan.feasible) postLevelAfter = Math.max(postLevelAfter, target);
      post = {
        name: "等新主线开放后再开箱", target: target, feasible: postPlan.feasible,
        date: C.isoMinutes(snapshot.main_story_open_at),
        days: postPlan.feasible ? daysF : null,
        level: postLevelAfter,
        boxes: postPlan.selectable || [],
        fixed_box_resources: postFixed,
        natural_before_open: natural,
        assumption: "从今天到新主线开放日按当前收益自然积累（含每日歼灭），开放日后按新基地收益开完全部箱子，得到开放日当天的预计等级",
      };
    } else {
      post = { name: "等新主线开放后再开箱", target: target, feasible: false, level: snapshot.current_sync_level, days: null, assumption: "未填写新主线开放日期或未来基地收益，无法计算此方案" };
    }

    var naturalRow = naturalToTarget(snapshot, target);
    naturalRow.name = "先升级再自然增长";
    naturalRow.assumption = "完全不开箱子，先用现有资源升到当前能到的等级，之后靠每日收益和一举歼灭自然增长到目标等级";
    return {
      target: target,
      rows: [immediate, post, naturalRow],
      recommendation: post.feasible ? "等新主线开放后再开箱" : "先升级再自然增长",
    };
  }

  function evaluate(snapshot) {
    var noBox = noBoxToTarget(snapshot, snapshot.target_sync_level);
    var bare = immediateLevels(snapshot);
    var fixed = immediateLevels(snapshot, true);
    var selectable = immediateLevels(snapshot, true, true);
    var future = futureMainStoryScenario(snapshot);
    var stage = snapshot.stage_clear_resources || {};
    var bareRes = addRes(snapshot.bare_resources, stage);
    var fixedRes = addRes(bareRes, B.fixedBoxResources(snapshot, snapshot.income_per_hour));
    var selRes = {};
    RESOURCES.forEach(function (r) {
      var rv = fixedRes[r] || 0.0;
      (snapshot.selectable_boxes || []).forEach(function (box) {
        if (!box.options || !box.options.length) return;
        var best = 0.0;
        box.options.forEach(function (opt) {
          var v = (opt.rewards && opt.rewards[r]) || 0.0;
          if (opt.mode === "units") best = Math.max(best, v);
          else best = Math.max(best, v * (snapshot.income_per_hour[r] || 0.0));
        });
        rv += best * box.quantity;
      });
      selRes[r] = rv;
    });
    var perResource = {
      bare: {}, fixed: {}, selectable: {}
    };
    RESOURCES.forEach(function (r) {
      perResource.bare[r] = snapshot.current_sync_level + C.affordableLevelsSingle(bareRes, snapshot, snapshot.current_sync_level, r);
      perResource.fixed[r] = snapshot.current_sync_level + C.affordableLevelsSingle(fixedRes, snapshot, snapshot.current_sync_level, r);
      perResource.selectable[r] = snapshot.current_sync_level + C.affordableLevelsSingle(selRes, snapshot, snapshot.current_sync_level, r);
    });
    // 按「目标同步器等级」优化的自选箱分配（当前收益）：到 target 需要怎么开箱
    var targetSteps = Math.max(0, snapshot.target_sync_level - snapshot.current_sync_level);
    var targetPlanNow = null;
    if (targetSteps > 0) {
      targetPlanNow = B.optimizeSelectableForTarget(snapshot, bareRes, targetSteps, snapshot.income_per_hour);
    }
    // 按「目标同步器等级」优化的自选箱分配（新主线开放后，未来收益 + 等待期自然积累）
    var targetPlanFuture = null;
    if (targetSteps > 0 && future.available) {
      var openAt = new Date(snapshot.main_story_open_at.getTime());
      var startAt = new Date(snapshot.recorded_at.getTime());
      var futSnap = JSON.parse(JSON.stringify(snapshot));
      var natural2 = C.incomeBetween(snapshot, startAt, openAt);
      var wHours = snapshot.daily_wipeout_count * snapshot.wipeout_hours_each;
      var d2 = Math.max(0, Math.round((openAt.getTime() - startAt.getTime()) / 86400000));
      RESOURCES.forEach(function (r) { natural2[r] += (snapshot.income_per_hour[r] || 0.0) * wHours * d2; });
      futSnap.bare_resources = addRes(snapshot.bare_resources, natural2);
      futSnap.income_per_hour = snapshot.future_income_per_hour || snapshot.income_per_hour;
      targetPlanFuture = B.optimizeSelectableForTarget(futSnap, futSnap.bare_resources, targetSteps, futSnap.income_per_hour);
    }
    return {
      no_box: noBox, bare: bare, fixed: fixed, selectable: selectable,
      future_main_story: future,
      scenario_f: scenarioF(snapshot, snapshot.alternate_target_level),
      scenario_f_target: scenarioF(snapshot, snapshot.target_sync_level),
      scenario_f_alt: scenarioF(snapshot, snapshot.alternate_target_level),
      per_resource: perResource,
      // 目标等级口径的自选箱分配（当前收益 / 新主线后）
      target_selectable_now: targetPlanNow,
      target_selectable_future: targetPlanFuture,
    };
  }

  global.NikkeScenarios = {
    noBoxToTarget: noBoxToTarget,
    immediateLevels: immediateLevels,
    futureMainStoryScenario: futureMainStoryScenario,
    scenarioF: scenarioF,
    naturalToTarget: naturalToTarget,
    evaluate: evaluate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeScenarios;
})(typeof window !== "undefined" ? window : globalThis);
