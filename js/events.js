/* events.js — 活动收益置入（自 活动收益引擎/skills/activity_income.py 1:1 移植）
   口径来源：工作区根《活动收益置入-实施提示词.md》（v2.3）
   铁律：算法禁止"优化"，逐函数与 Python 同构；活动数值一律来自 data/event_templates.json（禁止手写）。 */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var RESOURCES = C.RESOURCES;              // ["credit", "battle_data", "core_dust"]
  var RES = ["credit", "battle", "dust"];   // 引擎侧三资源键

  /* 引擎箱键（含每日任务/签到用到的成长套组与方舟箱） */
  var BOX_KEYS = ["credit_box_1h", "battle_box_1h", "dust_box_1h",
                  "credit_box_2h", "battle_box_2h", "dust_box_2h", "challenger_box",
                  "growth_box_1h", "growth_box_8h", "growth_box_12h", "ark_box"];

  /* 引擎箱键 → 计算器固定小时箱落点 */
  var FIXED_LABEL = {
    credit_box_1h: ["信用点盒", 1], credit_box_2h: ["信用点盒", 2],
    battle_box_1h: ["战斗数据辑盒", 1], battle_box_2h: ["战斗数据辑盒", 2],
    dust_box_1h: ["芯尘盒", 1], dust_box_2h: ["芯尘盒", 2],
    growth_box_1h: ["成长套组", 1], growth_box_8h: ["成长套组", 8], growth_box_12h: ["成长套组", 12],
  };
  /* 引擎箱键 → 计算器自选箱落点（禁止照搬引擎 box_value：挑战者走 units 数量口径） */
  var SELECTABLE_LABEL = { challenger_box: "挑战者成长宝箱", ark_box: "方舟官方补给物资Ⅰ" };

  var TYPE_DURATION = { large28: 28, small14: 14 };
  var TYPE_RUSH = { large28: 70, small14: 45 };

  /* ---------------- 日期工具（纯日期，内部用 UTC 做加减，避免时区/DST 误差） ---------------- */
  function toD(isoStr) {
    var p = String(isoStr).split("-");
    return new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  }
  function isoOf(d) { return d.toISOString().slice(0, 10); }
  function addDays(isoStr, n) { var d = toD(isoStr); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); }
  function maxISO(a, b) { return a > b ? a : b; }
  function minISO(a, b) { return a < b ? a : b; }
  /* Date → 本地日历 YYYY-MM-DD（不能用 toISOString：本地零点会退到前一天） */
  function localISO(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  /* 某日凌晨 04:00（服务器重置）的本地时间戳 */
  function resetMs(isoStr) {
    var p = String(isoStr).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 4, 0, 0, 0).getTime();
  }

  function copy(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; }); return r; }

  /* ---------------- 模板库（由 app.js fetch data/event_templates.json 后注入） ---------------- */
  var templates = null;
  function setTemplates(json) { templates = json || null; }
  function getTemplates() { return templates; }
  function templateById(id) { return (templates && templates.templates) ? templates.templates[id] : null; }
  function templateList() {
    var out = [];
    if (templates && templates.templates) {
      Object.keys(templates.templates).forEach(function (k) {
        var t = templates.templates[k];
        out.push({ id: k, label: t.label || k, duration: t.duration });
      });
    }
    return out.sort(function (a, b) { return a.duration - b.duration; });
  }

  /* ---------------- 以下为 activity_income.py 的 1:1 移植 ---------------- */
  function newDay() {
    var d = { token: 0 };
    RES.forEach(function (r) { d[r] = 0; });
    BOX_KEYS.forEach(function (k) { d[k] = 0; });
    return d;
  }

  function addInto(dst, src, times) {
    if (!src) return;
    if (times == null) times = 1;
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (typeof v !== "number" || v <= 0) return;
      dst[k] = (dst[k] || 0) + v * times;
    });
  }

  function instantiate(ev, start) {
    ev = copy(ev);
    if (!start) return ev;
    var dur = ev.duration != null ? parseInt(ev.duration, 10)
            : (TYPE_DURATION[ev.type] != null ? TYPE_DURATION[ev.type] : 15);
    if (!(dur > 0)) throw new Error("活动 duration 非法：" + dur);
    ev.window = { start: start, end: addDays(start, dur - 1) };
    function shift(lst) {
      return (lst || []).map(function (it) {
        it = copy(it);
        if (it.open_day != null) { it.open = addDays(start, parseInt(it.open_day, 10)); delete it.open_day; }
        else if (it.open == null) throw new Error("活动实体缺 open/open_day：" + JSON.stringify(it));
        return it;
      });
    }
    ev.challenges = shift(ev.challenges);
    ev.stages = shift(ev.stages);
    ev.stage_blocks = shift(ev.stage_blocks);
    return ev;
  }

  function defaultRush(ev, blockId) {
    var rb = ev.rush_buy || {};
    if (rb[blockId] != null) return parseInt(rb[blockId], 10);
    return TYPE_RUSH[ev.type] != null ? TYPE_RUSH[ev.type] : 45;
  }

  function bestDustStage(ev, day) {
    var bestR = null, bestT = 0;
    (ev.stages || []).forEach(function (st) {
      if (st.open > day) return;
      var r = st.reward || {};
      var cur = bestR ? (bestR.dust_box_1h || 0) : -1;
      if ((r.dust_box_1h || 0) > cur) { bestR = r; bestT = st.tokens || 0; }
    });
    return [bestR, bestT];
  }

  function sweepTarget(ev, day) {
    var sid = ev.stage_target;
    if (sid) {
      var list = ev.stages || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === sid && list[i].open <= day) return [list[i].reward || {}, list[i].tokens || 0];
      }
    }
    return bestDustStage(ev, day);
  }

  function simStages(ev, stageAttempts, stageMode) {
    var ordered = [];
    (ev.stage_blocks || []).slice().sort(function (a, b) { return a.open < b.open ? -1 : (a.open > b.open ? 1 : 0); })
      .forEach(function (b) {
        (b.chapters || []).forEach(function (cid) { ordered.push([b.open, cid, b.id, !!b.rush]); });
      });
    var d0 = ev.window.start, d1 = ev.window.end;
    var rushDays = {};
    ordered.forEach(function (o) { if (o[3] && rushDays[o[0]] == null) rushDays[o[0]] = o[2]; });
    var dayClear = {}, daySweep = {}, i = 0, day = d0;
    while (day <= d1) {
      var att = stageAttempts;
      if (rushDays[day] != null) att += defaultRush(ev, rushDays[day]);
      while (i < ordered.length && att > 0 && ordered[i][0] <= day) {
        (dayClear[day] = dayClear[day] || []).push(ordered[i][1]);
        att -= 1; i += 1;
      }
      if (att > 0 && stageMode === "dust") daySweep[day] = att;
      day = addDays(day, 1);
    }
    ordered.forEach(function (o) {
      if (o[0] > d1) throw new Error("章节 " + o[1] + " 开放日超出事件窗口，stage_blocks/open 有误");
    });
    return { clear: dayClear, sweep: daySweep };
  }

  function shopRedeem(items, budget, day) {
    items.forEach(function (item) {
      var rew = item.reward || {}, cost = item.cost || 0, cnt = item.count == null ? 1 : item.count;
      if (cost <= 0) return;
      var buy = Math.min(cnt > 0 ? cnt : 1e9, Math.floor(budget / cost));
      if (buy <= 0) return;
      budget -= buy * cost;
      Object.keys(rew).forEach(function (k) {
        if (RES.indexOf(k) >= 0 || BOX_KEYS.indexOf(k) >= 0) day[k] = (day[k] || 0) + rew[k] * buy;
      });
    });
    return budget;
  }

  function findHardDay(ev) {
    var out = null;
    (ev.stage_blocks || []).forEach(function (b) {
      if (out == null && b.rush && b.chapters && b.chapters.length) out = b.open;
    });
    return out;
  }

  function shopRedeemDaily(shop, ev, days, hi) {
    var ordered = Object.keys(days).sort();
    if (!ordered.length) return;
    if (hi == null) hi = ordered[ordered.length - 1];
    var d1 = ev.window.end;
    if (!(d1 <= hi)) return;
    var hardDay = findHardDay(ev);
    var fixedItems = (shop.items || []).filter(function (it) { return it.fixed; });
    var creditItem = null;
    (shop.items || []).forEach(function (it) {
      if (creditItem) return;
      if ((it.count == null ? 1 : it.count) === -1 && (it.reward || {}).credit) creditItem = it;
    });
    var budget = 0;
    ordered.forEach(function (cur) {
      var order = days[cur];
      budget += order.token || 0;
      if (cur === hardDay && fixedItems.length) budget = shopRedeem(fixedItems, budget, order);
    });
    if (creditItem && hardDay != null && hardDay <= ordered[ordered.length - 1]) {
      var last = addDays(d1, -1);
      if (last > hi) last = hi;
      if (last < ordered[0]) last = ordered[ordered.length - 1];
      var cost = creditItem.cost, rew = (creditItem.reward || {}).credit || 0;
      var buy = Math.floor(budget / cost);
      if (buy > 0) { days[last].credit = (days[last].credit || 0) + buy * rew; budget -= buy * cost; }
    }
  }

  function aggregate(ev, dayMin, dayMax, sweeps, stageAttempts, stageMode) {
    var d0 = ev.window.start, d1 = ev.window.end;
    var lo = maxISO(dayMin, d0), hi = minISO(dayMax, d1);
    var days = {}, cur = lo;
    while (cur <= hi) { days[cur] = newDay(); cur = addDays(cur, 1); }

    var chs = (ev.challenges || []).slice().sort(function (a, b) { return a.open < b.open ? -1 : (a.open > b.open ? 1 : 0); });
    Object.keys(days).forEach(function (d) {
      var day = days[d], active = null;
      chs.forEach(function (c) { if (c.open <= d) active = c; });
      if (!active) return;
      if (d === active.open) addInto(day, active.first);
      else addInto(day, active.sweep, sweeps);
    });

    var sim = simStages(ev, stageAttempts, stageMode);
    Object.keys(days).forEach(function (d) {
      var day = days[d];
      (sim.clear[d] || []).forEach(function (cid) {
        var st = null;
        (ev.stages || []).forEach(function (s) { if (s.id === cid) st = s; });
        if (st) { addInto(day, st.reward); day.token += st.tokens || 0; }
      });
      var n = sim.sweep[d] || 0;
      if (n) {
        var t = sweepTarget(ev, d);
        addInto(day, t[0], n);
        day.token += t[1] * n;
      }
      day._swept = n;
    });

    var tsk = ev.tasks || {};
    if (tsk.one_time && days[d0]) days[d0].token += tsk.tokens || 0;

    if (ev.shop) shopRedeemDaily(ev.shop, ev, days, dayMax);
    return days;
  }

  /* ---------------- 计算器落点：引擎日产出 → 三资源 / 固定箱 / 自选箱 ---------------- */
  function emptyTotals() {
    return { res: C.zeroRes(), fixed: {}, selectable: {}, days: 0 };
  }

  /* 计算器资源键 ← 引擎资源键（名字不同，必须显式映射） */
  var RES_KEY = { credit: "credit", battle_data: "battle", core_dust: "dust" };

  function mergeDays(tot, day) {
    RESOURCES.forEach(function (r) {
      tot.res[r] += day[RES_KEY[r]] || 0;
    });
    Object.keys(FIXED_LABEL).forEach(function (k) {
      var n = day[k] || 0;
      if (n <= 0) return;
      var lab = FIXED_LABEL[k][0], h = FIXED_LABEL[k][1];
      tot.fixed[lab] = tot.fixed[lab] || {};
      tot.fixed[lab][h] = (tot.fixed[lab][h] || 0) + n;
    });
    Object.keys(SELECTABLE_LABEL).forEach(function (k) {
      var n = day[k] || 0;
      if (n <= 0) return;
      var name = SELECTABLE_LABEL[k];
      tot.selectable[name] = (tot.selectable[name] || 0) + n;
    });
  }

  function mergeTotals(a, b) {
    RESOURCES.forEach(function (r) { a.res[r] += b.res[r] || 0; });
    Object.keys(b.fixed).forEach(function (lab) {
      a.fixed[lab] = a.fixed[lab] || {};
      Object.keys(b.fixed[lab]).forEach(function (h) { a.fixed[lab][h] = (a.fixed[lab][h] || 0) + b.fixed[lab][h]; });
    });
    Object.keys(b.selectable).forEach(function (name) {
      a.selectable[name] = (a.selectable[name] || 0) + b.selectable[name];
    });
    a.days += b.days;
    return a;
  }

  function boxCount(tot) {
    var n = 0;
    Object.keys(tot.fixed).forEach(function (lab) {
      Object.keys(tot.fixed[lab]).forEach(function (h) { n += tot.fixed[lab][h]; });
    });
    Object.keys(tot.selectable).forEach(function (name) { n += tot.selectable[name]; });
    return n;
  }

  /* 单活动实例：把模板按起始日实例化 → 全窗口跑一次引擎 → 按计入区间裁剪
     计入区间 = [ max(Estart, T0+1), Eend ]；t0 为 null 时取整窗口（用于基线断言）
     注意：必须先用「完整窗口」跑 aggregate（商店清仓逻辑依赖 d1 <= hi），再裁剪 —— 顺序不可颠倒 */
  function planActivity(tplId, startDate, t0) {
    var tpl = templateById(tplId);
    if (!tpl || !startDate) return null;
    var ev = instantiate(tpl, startDate);
    var start = ev.window.start, end = ev.window.end;
    var lo = t0 ? maxISO(start, addDays(t0, 1)) : start;
    var hi = end;
    var meta = {
      template: tplId, label: tpl.label || tplId, start: start, end: end,
      inject_start: lo, inject_end: hi, inject_days: 0, active: lo <= hi, error: null,
    };
    var tot = emptyTotals();
    if (meta.active) {
      var days = aggregate(ev, start, end, 1, 5, "dust");
      var dates = Object.keys(days).sort();
      dates.forEach(function (d) {
        if (d < lo || d > hi) return;
        mergeDays(tot, days[d]);
        meta.inject_days += 1;
      });
      /* 每日任务：计入区间内每一天各发一份 */
      var perDay = (tpl.daily_task || {}).per_day || {};
      Object.keys(perDay).forEach(function (k) {
        var per = {};
        per[k] = perDay[k];
        for (var i = 0; i < meta.inject_days; i++) mergeDays(tot, per);
      });
      /* 签到：offset_day 落绝对日期，仅落区间的计入（「活动第 N 天」= offset_day N-1） */
      (tpl.checkin || []).forEach(function (c) {
        var abs = addDays(start, parseInt(c.offset_day, 10));
        if (abs < lo || abs > hi) return;
        mergeDays(tot, c.reward || {});
      });
    }
    tot.days = meta.inject_days;
    meta.totals = tot;
    return meta;
  }

  var EMPTY_SCHEDULE = { byDate: {}, dates: [], meta: [], totals: emptyTotals() };

  /* 汇总多个活动：按日合并（供按日期注入 / 时间轴推进） */
  function schedule(snapshot) {
    var acts = snapshot && snapshot.activities;
    if (!acts || !acts.length) return EMPTY_SCHEDULE;
    var t0 = snapshot.recorded_at ? localISO(new Date(snapshot.recorded_at)) : null;
    if (!t0) return EMPTY_SCHEDULE;
    var byDate = {}, meta = [], totals = emptyTotals(), dates = [];
    acts.forEach(function (a, idx) {
      var m = null;
      try { m = planActivity(a.template, a.start_date, t0); }
      catch (e) { m = { template: a.template, start: a.start_date, error: String(e && e.message || e), active: false, totals: emptyTotals() }; }
      if (!m) return;
      m.index = idx;
      meta.push(m);
      if (!m.active) return;
      /* 逐日重算该活动的按日产出（供时间轴推进；与 planActivity 同源） */
      var tpl = templateById(a.template);
      if (!tpl) return;
      var ev = instantiate(tpl, a.start_date);
      var days = aggregate(ev, ev.window.start, ev.window.end, 1, 5, "dust");
      var perDay = (tpl.daily_task || {}).per_day || {};
      Object.keys(days).sort().forEach(function (d) {
        if (d < m.inject_start || d > m.inject_end) return;
        var one = emptyTotals();
        mergeDays(one, days[d]);
        mergeDays(one, perDay);
        (tpl.checkin || []).forEach(function (c) {
          if (addDays(ev.window.start, parseInt(c.offset_day, 10)) === d) mergeDays(one, c.reward || {});
        });
        one.days = 1;
        var cur = byDate[d] || emptyTotals();
        mergeTotals(cur, one);
        byDate[d] = cur;
        mergeTotals(totals, one);
      });
    });
    dates = Object.keys(byDate).sort();
    totals.days = dates.length;
    return { byDate: byDate, dates: dates, meta: meta, totals: totals };
  }

  /* 累计：所有「到账日 <= upto」的活动产出（upto 为空 = 全部） */
  function sumThrough(sched, upto) {
    var tot = emptyTotals();
    if (!sched || !sched.dates) return tot;
    sched.dates.forEach(function (d) {
      if (upto && d > upto) return;
      mergeTotals(tot, sched.byDate[d]);
    });
    return tot;
  }

  /* 累计：指定日期区间 [from, to]（闭区间） */
  function totalsForWindow(sched, from, to) {
    var tot = emptyTotals();
    if (!sched || !sched.dates) return tot;
    sched.dates.forEach(function (d) {
      if (from && d < from) return;
      if (to && d > to) return;
      mergeTotals(tot, sched.byDate[d]);
    });
    return tot;
  }

  /* 时间轴推进：把「凌晨 04:00 到账时刻」落在 (fromMs, toMs] 的活动日产出入账 */
  function harvest(sched, fromMs, toMs) {
    var tot = emptyTotals();
    if (!sched || !sched.dates || !sched.dates.length) return tot;
    sched.dates.forEach(function (d) {
      var t = resetMs(d);
      if (t > fromMs && t <= toMs) mergeTotals(tot, sched.byDate[d]);
    });
    return tot;
  }

  /* 把活动产出并入快照（浅拷贝 + 箱量深拷贝；不改原对象、不改 DOM）
     upto 为空 = 把全部计入区间的产出都并进来 */
  function inject(snapshot, sched, upto) {
    if (!sched || !sched.dates || !sched.dates.length) return snapshot;
    var t = sumThrough(sched, upto);
    if (!t.days) return snapshot;
    var out = copy(snapshot);
    out.bare_resources = C.addRes(snapshot.bare_resources, t.res);
    out.fixed_boxes = JSON.parse(JSON.stringify(snapshot.fixed_boxes || {}));
    Object.keys(t.fixed).forEach(function (lab) {
      out.fixed_boxes[lab] = out.fixed_boxes[lab] || {};
      Object.keys(t.fixed[lab]).forEach(function (h) {
        out.fixed_boxes[lab][h] = (out.fixed_boxes[lab][h] || 0) + t.fixed[lab][h];
      });
    });
    out.selectable_boxes = (snapshot.selectable_boxes || []).map(function (b) {
      return { name: b.name, quantity: b.quantity, options: b.options };
    });
    out.selectable_missing = [];
    Object.keys(t.selectable).forEach(function (name) {
      var hit = null;
      out.selectable_boxes.forEach(function (b) { if (b.name === name) hit = b; });
      if (hit) hit.quantity += t.selectable[name];
      else out.selectable_missing.push(name);
    });
    out.event_applied = t;
    return out;
  }

  /* 便于 UI 展示：把 totals 展平成「信用 X / 战斗 Y / 红球 Z；箱：……」 */
  function totalsText(tot) {
    if (!tot) return "";
    var RESLAB = { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };
    var parts = RESOURCES.map(function (r) { return RESLAB[r] + " " + fmtShort(tot.res[r] || 0); });
    var boxes = [];
    Object.keys(tot.fixed || {}).forEach(function (lab) {
      Object.keys(tot.fixed[lab]).sort(function (a, b) { return b - a; }).forEach(function (h) {
        boxes.push(lab + "(" + h + "h)×" + tot.fixed[lab][h]);
      });
    });
    Object.keys(tot.selectable || {}).forEach(function (name) { boxes.push(name + "×" + tot.selectable[name]); });
    return parts.join(" / ") + (boxes.length ? "；" + boxes.join("、") : "");
  }
  function fmtShort(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return Math.round(v / 1e3) + "K";
    return String(Math.round(v * 100) / 100);
  }

  global.NikkeEvents = {
    /* 模板 */
    setTemplates: setTemplates,
    getTemplates: getTemplates,
    templateList: templateList,
    /* 引擎移植（node 侧测试可直接调用） */
    instantiate: instantiate,
    aggregate: aggregate,
    simStages: simStages,
    sweepTarget: sweepTarget,
    shopRedeem: shopRedeem,
    shopRedeemDaily: shopRedeemDaily,
    defaultRush: defaultRush,
    /* 计算器层 */
    planActivity: planActivity,
    schedule: schedule,
    sumThrough: sumThrough,
    totalsForWindow: totalsForWindow,
    harvest: harvest,
    inject: inject,
    emptyTotals: emptyTotals,
    mergeTotals: mergeTotals,
    boxCount: boxCount,
    totalsText: totalsText,
    localISO: localISO,
    addDays: addDays,
    resetMs: resetMs,
    EMPTY_SCHEDULE: EMPTY_SCHEDULE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeEvents;
})(typeof window !== "undefined" ? window : globalThis);
