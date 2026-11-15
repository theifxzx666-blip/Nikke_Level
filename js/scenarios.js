/* scenarios.js — 场景 A-F 与总评估（自 Python calculator/scenarios 移植） */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var O = global.NikkeOutpost;
  var B = global.NikkeBoxes;
  var EV = global.NikkeEvents;   // 活动收益（事件模块未加载时按「无活动」处理，行为与本改动前逐项一致）
  var RESOURCES = C.RESOURCES;
  var addRes = C.addRes;
  var subRes = C.subRes;

  /* ---------- 月卡（默认关闭） ----------
     月卡每日到账 1 个「30 天成长补给箱」，属自选箱（芯尘 10h / 信用 30h / 战斗 10h 三选一）。
     计入区间 = [数据日期, 新主线开放日]，天数与等待期自然积累同口径（等待 N 天 → N 个）。
     只并入「开放日快照」（future 口径）；现状四档与 box_gain_vs_now 均不涉及。 */
  var MONTHLY_CARD_BOX = "30天成长补给箱";
  var MONTHLY_CARD_OPTIONS = [
    { label: "芯尘", rewards: { core_dust: 10 }, mode: "hours" },
    { label: "信用点", rewards: { credit: 30 }, mode: "hours" },
    { label: "战斗数据辑", rewards: { battle_data: 10 }, mode: "hours" },
  ];
  /* 等待期天数 → 月卡箱总数（未开启/天数为 0 或负 → 0） */
  function monthlyCardBoxCount(snapshot, days) {
    if (!snapshot || !snapshot.monthly_card) return 0;
    var per = snapshot.monthly_card_per_day;
    if (per === undefined || per === null || per === "") per = 1;
    per = Number(per);
    if (!isFinite(per) || per <= 0) return 0;
    return Math.round(Math.max(0, Math.round(days)) * per);   // 箱数取整，避免出现小数个箱
  }
  /* 把月卡箱并入快照的自选箱（就地改副本，调用方保证是副本） */
  function addMonthlyCardBoxes(snap, count) {
    if (!(count > 0)) return snap;
    var list = snap.selectable_boxes || (snap.selectable_boxes = []);
    var hit = null;
    list.forEach(function (b) { if (b.name === MONTHLY_CARD_BOX) hit = b; });
    if (hit) hit.quantity = (hit.quantity || 0) + count;
    else list.push({ name: MONTHLY_CARD_BOX, quantity: count, options: MONTHLY_CARD_OPTIONS });
    return snap;
  }

  /* 「每种箱保留 1 个」：对固定小时箱（箱型 × 档位）与自选箱（按名称）各减 1，下限 0。
     返回新快照（浅拷贝 + 箱对象深拷贝），不改原快照 —— 供「收藏向」开关使用。
     注意不能用 JSON 深拷贝（会把 recorded_at 等 Date 转成字符串）。 */
  function applyKeepOneBox(snapshot) {
    if (!snapshot || !snapshot.keep_one_box) return snapshot;
    var out = Object.assign({}, snapshot);
    out.fixed_boxes = {};
    Object.keys(snapshot.fixed_boxes || {}).forEach(function (label) {
      var row = snapshot.fixed_boxes[label] || {}, copy = {};
      Object.keys(row).forEach(function (h) { copy[h] = Math.max(0, (row[h] || 0) - 1); });
      out.fixed_boxes[label] = copy;
    });
    out.selectable_boxes = (snapshot.selectable_boxes || []).map(function (b) {
      return Object.assign({}, b, { quantity: Math.max(0, (b.quantity || 0) - 1) });
    });
    out.keep_one_box_applied = true;
    return out;
  }

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
    var daily = C.dailyIncome(snapshot, snapshot.daily_wipeout_count, snapshot.wipeout_hours_each);
    var sched = EV ? EV.schedule(snapshot) : null;
    var t0 = (EV && snapshot.recorded_at) ? EV.localISO(new Date(snapshot.recorded_at)) : null;
    function solve(evRes) {
      var shortage = {};
      RESOURCES.forEach(function (r) {
        shortage[r] = Math.max(0.0, required[r] - snapshot.bare_resources[r] - ((evRes && evRes[r]) || 0));
      });
      return daysToTarget(shortage, daily);
    }
    var result = solve(null);
    var evRes = null;
    if (sched && sched.dates.length && t0 && isFinite(result.days)) {
      // 活动直接资源计入（本口径不开箱，箱子不计入）：等待天数与活动到账天数互为前提，迭代到自洽
      var d = result.days;
      for (var it = 0; it < 8; it++) {
        var e = EV.totalsForWindow(sched, EV.addDays(t0, 1), EV.addDays(t0, Math.ceil(d))).res;
        var trial = solve(e);
        evRes = e;
        if (!isFinite(trial.days)) { d = trial.days; break; }
        if (trial.days >= d - 1e-9) { d = trial.days; break; }   // 不再下降 → 收敛
        d = trial.days;
      }
      result = solve(evRes);
    }
    var shortage2 = {};
    RESOURCES.forEach(function (r) {
      shortage2[r] = Math.max(0.0, required[r] - snapshot.bare_resources[r] - ((evRes && evRes[r]) || 0));
    });
    result.target = target; result.steps = steps; result.required = required; result.shortage = shortage2;
    result.daily_income = daily; result.uses_boxes = false;
    result.event_resources = evRes || C.zeroRes();
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
      // 二分上界：按「所有自选箱各自取最优单资源价值」的松弛估计动态确定，
      // 松弛值 ≥ 真实最优，避免箱量很大时被固定 +60 截断（此前 high = steps + 60 是硬上限）
      var pool = { credit: resources.credit, battle_data: resources.battle_data, core_dust: resources.core_dust };
      (snapshot.selectable_boxes || []).forEach(function (b) {
        if (!b.options || !b.options.length) return;
        RESOURCES.forEach(function (r) {
          var best = 0;
          b.options.forEach(function (opt) {
            var v = (opt.rewards && opt.rewards[r]) || 0;
            best = Math.max(best, opt.mode === "units" ? v : v * (incomePerHour[r] || 0));
          });
          pool[r] += best * b.quantity;
        });
      });
      var low = steps + 1, high = Math.max(steps + 1, C.affordableLevels(pool, snapshot, snapshot.current_sync_level));
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

  /* 开放日当天的快照：裸资源按等待期自然积累（当前收益 + 每日歼灭），收益切换到新基地收益 */
  function futureSnapshot(snapshot) {
    var openAt = new Date(snapshot.main_story_open_at.getTime());
    var start = new Date(snapshot.recorded_at.getTime());
    var natural = C.incomeBetween(snapshot, start, openAt);
    var wipeoutHours = snapshot.daily_wipeout_count * snapshot.wipeout_hours_each;
    /* R62（2026-10-26）口径统一：歼灭次数与月卡箱都只能按「完整过去的天数」计
       —— 7.5 天只做得了 7 天的歼灭、只领得到 7 天的月卡箱。
       此处原为 Math.round（7.5→8），与 scenarioPlans 里 floor(daysF) 的同一指标相差 1 次歼灭，
       导致「全箱梭哈」与「场景对比」两块给出不同的开放日等级。 */
    var days = Math.max(0, Math.floor((openAt.getTime() - start.getTime()) / 86400000 + 1e-9));
    RESOURCES.forEach(function (r) {
      natural[r] += (snapshot.income_per_hour[r] || 0.0) * wipeoutHours * days;
    });
    var future = JSON.parse(JSON.stringify(snapshot));
    future.bare_resources = addRes(snapshot.bare_resources, natural);
    future.income_per_hour = snapshot.future_income_per_hour || snapshot.income_per_hour;
    // 活动收益：等待期内（到开放日当天为止）到账的活动资源 + 箱量并入开放日快照
    if (EV) {
      var sched = EV.schedule(snapshot);
      if (sched.dates.length) future = EV.inject(future, sched, EV.localISO(openAt));
    }
    // 月卡（默认关闭）：等待期每日 1 个「30 天成长补给箱」并入开放日箱量
    var mcCount = monthlyCardBoxCount(snapshot, days);
    if (mcCount > 0) addMonthlyCardBoxes(future, mcCount);
    future.monthly_card_boxes = mcCount;
    return future;
  }

  /* 箱类折算总额（固定小时箱 + 自选箱各取该资源最优选项）：只用于「同一批箱在新旧收益下的差」 */
  function boxResourcesOf(snapshot, income) {
    var fx = B.fixedBoxResources(snapshot, income);
    var out = { credit: fx.credit || 0, battle_data: fx.battle_data || 0, core_dust: fx.core_dust || 0 };
    RESOURCES.forEach(function (r) {
      var best = 0;
      (snapshot.selectable_boxes || []).forEach(function (b) {
        if (!b.options || !b.options.length) return;
        var bv = 0;
        b.options.forEach(function (opt) {
          var v = (opt.rewards && opt.rewards[r]) || 0;
          bv = Math.max(bv, opt.mode === "units" ? v : v * (income[r] || 0));
        });
        best += bv * (b.quantity || 0);
      });
      out[r] += best;
    });
    return out;
  }

  function futureMainStoryScenario(snapshot) {
    if (!snapshot.main_story_open_at || !snapshot.future_base_level) {
      return { available: false, reason: "未填写新主线开放时间或未来基地收益" };
    }
    var openAt = new Date(snapshot.main_story_open_at.getTime());
    var future = futureSnapshot(snapshot);
    var fixed = immediateLevels(future, true, true, future.income_per_hour);
    /* 开箱收益对比：同一批箱子（现状库存）按新基地收益 vs 当前收益折算出的资源差额，
       再除以箱子落地等级的单级消耗 —— 只反映「箱子更值钱」这部分，不含等待期自然积累。
       R60：改成**连续口径（小数级）**。旧口径是「两次整数等级之差」，1.85% 的收益差折合 ≈0.9 级，
             正好压在 0/1 边界上：实测同一库存 10-16~10-26 恒为 0，而箱量 ±3% 就能在 0/1 之间来回翻，
             表现为「多赚 1 级」忽然变「多赚 0 级」。连续值不再受取整边界影响。 */
    var boxGain = 0;
    if (snapshot.future_income_per_hour) {
      var boxNow = boxResourcesOf(snapshot, snapshot.income_per_hour);
      var boxFut = boxResourcesOf(snapshot, snapshot.future_income_per_hour);
      var costAt = C.costForLevel(snapshot.upgrade_cost, fixed.level) || {};
      var minLv = Infinity;
      RESOURCES.forEach(function (r) {
        var d = (boxFut[r] || 0) - (boxNow[r] || 0);
        if (d > 0 && (costAt[r] || 0) > 0) minLv = Math.min(minLv, d / costAt[r]);
      });
      boxGain = isFinite(minLv) ? Math.max(0, minLv) : 0;
    }
    return {
      available: true, open_at: C.isoMinutes(openAt),
      natural_before_open: subRes(future.bare_resources, snapshot.bare_resources),
      projected_bare: future.bare_resources, result: fixed,
      box_gain_vs_now: boxGain,
      monthly_card_boxes: future.monthly_card_boxes || 0,   // 月卡并入开放日快照的箱数（0 = 未开启）
      projected_snapshot: future,   // 开放日快照（含活动箱；供 future 口径算箱量）
    };
  }

  /* 指定目标等级的「开够即停」自选箱方案
     mode = "now"（当前基地收益，**不含推图收益**）| "future"（开放日新基地收益 + 等待期自然积累 + 推图收益）
     与 immediateLevels 同口径：可用资源 = 裸资源 + 固定小时箱
     推图收益（stage_clear_resources）只在 future 口径计入，且**只计一次** ——
     现状口径一律不计（项目铁律 5），boxes.js 侧也不再叠加（2026-10-14 修 ×2） */
  function planForTarget(snapshot, targetLevel, mode) {
    var snap2 = snapshot;
    if (mode === "future") {
      if (!snapshot.main_story_open_at || !snapshot.future_base_level) return null;
      snap2 = futureSnapshot(snapshot);
    }
    var steps = Math.max(0, targetLevel - snapshot.current_sync_level);
    var base = snap2.bare_resources;
    if (mode === "future") base = addRes(base, snapshot.stage_clear_resources || {});
    return B.optimizeSelectableForTarget(snap2, base, steps, snap2.income_per_hour);
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
    var sched = EV ? EV.schedule(snapshot) : null;
    var eventTotal = C.zeroRes();
    /* 时间轴推进时把「凌晨 04:00 到账」的活动日产出入账 */
    function harvestTo(toMs) {
      if (!sched || !sched.dates.length) return;
      var h = EV.harvest(sched, when.getTime(), toMs);
      if (!h.days) return;
      balance = addRes(balance, h.res);
      eventTotal = addRes(eventTotal, h.res);
    }
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
        harvestTo(nextSwitch.getTime());
        when = new Date(nextSwitch.getTime());
      } else {
        balance = addRes(balance, { credit: rate.credit * waitHours, battle_data: rate.battle_data * waitHours, core_dust: rate.core_dust * waitHours });
        harvestTo(when.getTime() + waitHours * 3600000);
        when = new Date(when.getTime() + waitHours * 3600000);
      }
    }
    return {
      level: level, target: target,
      estimated_at: C.isoMinutes(when),
      days: (when.getTime() - start) / 86400000.0,
      remaining: balance, uses_boxes: false,
      event_resources: eventTotal,
    };
  }

  /* 场景 F（三方案对比）
     stageClear：原始推图收益（evaluate 传入的是已置零的 snapNow，故必须显式透传）。
     口径：立即行（现状）不计推图收益；「等新主线开放后再开箱」行计入推图收益 ×1 */
  function scenarioF(snapshot, target, stageClear) {
    target = target || snapshot.alternate_target_level;
    var start = new Date(snapshot.recorded_at.getTime());
    var currentIncome = snapshot.income_per_hour;
    var futureIncome = snapshot.future_income_per_hour || currentIncome;
    var stageNow = snapshot.stage_clear_resources || {};
    var stageFuture = stageClear || stageNow;

    var immediatePlan = B.optimizeSelectableForTarget(snapshot, snapshot.bare_resources, target - snapshot.current_sync_level, currentIncome);
    var immediateFixed = B.fixedBoxResources(snapshot, currentIncome);
    var allBoxesRes = addRes(addRes(snapshot.bare_resources, stageNow), immediateFixed);
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
      var postBase = addRes(addRes(snapshot.bare_resources, natural), stageFuture);
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

  /* 活动收益汇总（供结果区渲染）
     计入区间 = [max(活动开始日, 数据日期+1), 活动结束日]；已结束的活动贡献恒为 0 */
  function eventSummary(snapshot) {
    var out = { available: false, meta: [], totals: null, days: 0, level_gain: 0,
                hits_future: false, future_open: null, income: null };
    if (!EV) return out;
    var sched = EV.schedule(snapshot);
    out.meta = sched.meta;
    out.totals = sched.totals;
    out.days = sched.dates.length;
    out.available = out.days > 0;
    if (!out.available) return out;
    // 折合等级增量：同一底盘（裸资源 + 全部箱）下「有活动 vs 无活动」的全箱梭哈等级差
    var withEv = EV.inject(snapshot, sched, null);
    var lv1 = immediateLevels(withEv, true, true, withEv.income_per_hour).level;
    var lv0 = immediateLevels(snapshot, true, true, withEv.income_per_hour).level;
    out.level_gain = Math.max(0, lv1 - lv0);
    out.with_event_level = lv1;
    out.without_event_level = lv0;
    // 活动到账与新主线开放日的关系（影响等待期积累 / 开放日后的收益）
    if (snapshot.main_story_open_at) {
      var od = EV.localISO(new Date(snapshot.main_story_open_at));
      out.future_open = od;
      out.days_before_open = sched.dates.filter(function (d) { return d < od; }).length;
      out.days_after_open = sched.dates.filter(function (d) { return d >= od; }).length;
      out.hits_future = out.days_before_open > 0 || out.days_after_open > 0;
      out.before_open = EV.sumThrough(sched, EV.addDays(od, -1));
      out.after_open = EV.totalsForWindow(sched, od, null);
    }
    return out;
  }

  function evaluate(snapshot) {
    // 「预计新主线推图收益」是新主线开放后才拿得到的一次性资源：
    // 现状口径（不开箱 / 仅固定箱 / 全箱梭哈）一律不计入；新主线（future）口径保留
    var stage = snapshot.stage_clear_resources || {};
    var hasStage = RESOURCES.some(function (r) { return (stage[r] || 0) > 1e-9; });
    var snapNow = hasStage ? Object.assign({}, snapshot, { stage_clear_resources: C.zeroRes() }) : snapshot;
    // 「现状」四档（no_box / bare / fixed / selectable）一律不注入活动收益：
    // 活动从「数据日期次日」才到账，今天能拿到的东西里没有活动剩余产出（详见提示词 3.1-4 / 7.1）
    var hasAct = !!(snapshot.activities && snapshot.activities.length);
    var snapNowPlain = hasAct ? Object.assign({}, snapNow, { activities: [] }) : snapNow;
    var noBox = noBoxToTarget(snapNowPlain, snapshot.target_sync_level);
    var bare = immediateLevels(snapNow);
    var fixed = immediateLevels(snapNow, true);
    var selectable = immediateLevels(snapNow, true, true);
    var future = futureMainStoryScenario(snapshot);
    var bareRes = addRes(snapNow.bare_resources, snapNow.stage_clear_resources || {});
    var fixedRes = addRes(bareRes, B.fixedBoxResources(snapNow, snapshot.income_per_hour));
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
      bare: {}, fixed: {}, selectable: {},
      // 三资源的「全箱梭哈口径可用量」（与上面三组单资源等级同源）：
      // 供上层做缺口折算（还缺多少个 1H 箱）与配平诊断；不参与任何既有数值。
      //   bare     = 裸资源（现状口径：不含推图收益、不含活动）
      //   fixed    = 裸资源 + 固定小时箱全开
      //   selectable = 裸资源 + 固定小时箱全开 + 自选箱（每箱按该资源最优选项）
      _res: { bare: bareRes, fixed: fixedRes, selectable: selRes }
    };
    RESOURCES.forEach(function (r) {
      perResource.bare[r] = snapshot.current_sync_level + C.affordableLevelsSingle(bareRes, snapshot, snapshot.current_sync_level, r);
      perResource.fixed[r] = snapshot.current_sync_level + C.affordableLevelsSingle(fixedRes, snapshot, snapshot.current_sync_level, r);
      perResource.selectable[r] = snapshot.current_sync_level + C.affordableLevelsSingle(selRes, snapshot, snapshot.current_sync_level, r);
    });
    // 按「目标同步器等级」优化的自选箱分配（当前收益）：到 target 需要怎么开箱
    var targetSteps = Math.max(0, snapshot.target_sync_level - snapshot.current_sync_level);
    var targetPlanNow = targetSteps > 0 ? planForTarget(snapNow, snapshot.target_sync_level, "now") : null;
    // 按「目标同步器等级」优化的自选箱分配（新主线开放后，未来收益 + 等待期自然积累）
    var targetPlanFuture = (targetSteps > 0 && future.available) ? planForTarget(snapshot, snapshot.target_sync_level, "future") : null;
    // 各类资源最大等级（开启后 / future 三档）：按未来收益 + 等待期自然积累
    var futureIncome = snapshot.future_income_per_hour || snapshot.income_per_hour;
    if (future.available) {
      var fSnap = future.projected_snapshot || snapshot;   // 开放日快照（无活动时 == snapshot 的克隆）
      var fBare = addRes(future.projected_bare, snapshot.stage_clear_resources || {});
      var fFixed = addRes(fBare, B.fixedBoxResources(fSnap, futureIncome));
      var fSel = {};
      RESOURCES.forEach(function (r) {
        var rv = fFixed[r] || 0;
        (fSnap.selectable_boxes || []).forEach(function (box) {
          if (!box.options || !box.options.length) return;
          var best = 0;
          box.options.forEach(function (opt) {
            var v = (opt.rewards && opt.rewards[r]) || 0;
            if (opt.mode === "units") best = Math.max(best, v);
            else best = Math.max(best, v * (futureIncome[r] || 0));
          });
          rv += best * box.quantity;
        });
        fSel[r] = rv;
      });
      perResource.future_bare = {};
      perResource.future_fixed = {};
      perResource.future_selectable = {};
      // 未来口径的三资源可用量（裸 + 等待期积累 + 推图 ×1 + 固定箱全开 + 自选箱全给该项）
      // 供「三资源配平诊断」开放日口径折算 1H 箱；不参与任何既有数值。
      perResource._res.future_selectable = fSel;
      RESOURCES.forEach(function (r) {
        perResource.future_bare[r] = snapshot.current_sync_level + C.affordableLevelsSingle(fBare, snapshot, snapshot.current_sync_level, r);
        perResource.future_fixed[r] = snapshot.current_sync_level + C.affordableLevelsSingle(fFixed, snapshot, snapshot.current_sync_level, r);
        perResource.future_selectable[r] = snapshot.current_sync_level + C.affordableLevelsSingle(fSel, snapshot, snapshot.current_sync_level, r);
      });
    }
    return {
      no_box: noBox, bare: bare, fixed: fixed, selectable: selectable,
      future_main_story: future,
      scenario_f: scenarioF(snapNow, snapshot.alternate_target_level, stage),
      scenario_f_target: scenarioF(snapNow, snapshot.target_sync_level, stage),
      scenario_f_alt: scenarioF(snapNow, snapshot.alternate_target_level, stage),
      per_resource: perResource,
      // 目标等级口径的自选箱分配（当前收益 / 新主线后）
      target_selectable_now: targetPlanNow,
      target_selectable_future: targetPlanFuture,
      // 活动收益汇总（供结果区渲染；无活动时 available=false）
      event_summary: eventSummary(snapshot),
    };
  }

  global.NikkeScenarios = {
    noBoxToTarget: noBoxToTarget,
    immediateLevels: immediateLevels,
    futureSnapshot: futureSnapshot,
    futureMainStoryScenario: futureMainStoryScenario,
    monthlyCardBoxCount: monthlyCardBoxCount,
    applyKeepOneBox: applyKeepOneBox,
    planForTarget: planForTarget,
    scenarioF: scenarioF,
    naturalToTarget: naturalToTarget,
    evaluate: evaluate,
    eventSummary: eventSummary,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeScenarios;
})(typeof window !== "undefined" ? window : globalThis);
