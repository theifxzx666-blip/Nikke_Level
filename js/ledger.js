/* ledger.js — 收益账单（R47 从结果区 tab 拆成独立工具页 ledger.html；R49 加箱子；R50 起箱子只数个数、不折算；R52 周期 = 统计窗口 + 箱子比重）
   职责：把「一份快照」汇总成逐日到账账单（build）、按周几聚合（agg / groupByWeekday）、
        导出 CSV（csv）、以及在每次计算后由 app.js 落的可序列化快照切片（snapSlice）。
   口径唯一来源就在本文件：页面（ledger.html）与 app.js 都只调这里，禁止另写一套聚合。
   ⚠ 纯展示层：不参与任何既有计算口径（等待期到账 / 开箱方案 / 配比求解一律不变）。
   ⚠ 活动逐日产出读 NikkeEvents.schedule().byDate（与引擎同源）。
   ⚠ 账单是「进项账」：只统计当天新到账，不扣升级消耗；开箱本身的「消耗」不进账单。

   ---------- R50：账单只统计两件事 ----------
   1) 每天的基础自然收益（信用点 / 战斗数据辑 / 红球）
      = 基地每小时产出 × 24 + 当日活动「直接给」的资源 + 开放日一次性推图收益
      （活动箱子不在这里面 —— 箱子的资源要开箱才到账，而且开哪个还看玩家选择）
   2) 每天收入的箱子数量（只数个数，不折算成资源）
      = byDate[d].fixed 的各小时档个数 + byDate[d].selectable 的各箱个数
   箱子明细（箱名 × 个数）只用于悬浮提示与 CSV 备注，不参与任何金额。

   ---------- R51：周期口径 + 每天箱子明细 ----------
   A) 区间不再只有「到开放日」一种：build(snap, {span:N}) 可把区间固定成 N 天
      （数据日期+1 起共 N 天），span=0 才是原来的「到开放日」。
      费率仍按「进入开放日之后改用新基地收益」逐日切换，推图收益只在开放日当天计一次
      —— 所以周期口径与开放日口径的差异只有「天数」，不是另算一套。
   B) spanStats(snap) 把 30/60/90/180/365 天各自的合计一次算出来（共用一份 schedule）：
      用户要看的是「这个区间一共收了多少」，合计比日均直观。
   C) boxSummary(rows) 把箱子按「箱名 + 小时档」聚合（个数 / 占比 / 首末日期）：
      只数个数之后，光有总数看不出是哪些箱子构成的。

   ---------- R52：周期是「统计窗口」，不是预估 ----------
   用户口径：选 30/60/90/180/365 天 = 把这段时间里逐日到账的收益加起来，
   回答「这个区间一共收了多少」；页面文案一律不出现「估算 / 预估 / 能攒多少」。
   （与 R51 一样仍不另算一套：费率按开放日切换、推图只计一次，差异只有天数。）
   boxMix(rows) 给出「收到的箱子大致是哪类占大头」：按箱名合并（同名不同小时档算一类），
   只数个数 → 供页面画堆叠条 + 图标个数。⚠ 仍然不折算资源，只是个数之比。 */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var ASSUME_DAYS = 14;    // 未填「新主线开放日」时，默认预览未来 14 天
  var MAX_DAYS = 400;      // 防御：开放日填成十年后时不生成几万行
  var SPANS = [30, 60, 90, 180, 365];   // 周期口径（R51）：一年按 365 天，不做闰年特判
  var SNAP_KEY = "nikke_ledger_snap_v1";
  /* getDay() 的索引 → 中文。筛选与分组都按「周一…周日」排（不做 locale 判断） */
  var WD_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

  /* ---------------- 日期工具（本地日期，禁止 toISOString：GMT+8 下会偏一天） ---------------- */
  function isoLocal(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }
  function addDaysISO(iso, n) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + n);
    return isoLocal(d);
  }
  /* "YYYY-MM-DD" → 0(周日)…6(周六)；解析不出返回 -1 */
  function wdOf(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return -1;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? -1 : d.getDay();
  }
  function weekdayCN(iso) {
    var w = wdOf(iso);
    return w < 0 ? "" : WD_NAMES[w];
  }
  /* Date / "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm:ss" / 时间戳 → "YYYY-MM-DD" */
  function toISO(v) {
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date) return isoLocal(v);
    var s = String(v);
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) {
      var mm = Number(m[2]), dd = Number(m[3]);
      return m[1] + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? "" : isoLocal(d);
  }

  function zeroRes() { return { credit: 0, battle_data: 0, core_dust: 0 }; }
  function pickRes(o) {
    var out = zeroRes();
    if (!o) return out;
    C.RESOURCES.forEach(function (r) { out[r] = Number(o[r]) || 0; });
    return out;
  }

  /* ---------------- 箱子计数（R50：只数个数，不算资源） ----------------
     fixed 形状：{ "芯尘盒": { "8": 3, "2": 1 }, "成长套组": { "1": 5 } }   ← 键 = 小时数
     sel   形状：{ "挑战者成长宝箱": 63, "方舟官方补给物资Ⅰ": 12 }
     items 只给悬浮提示 / CSV 备注用，不参与金额。 */
  function dayBox(fixed, sel) {
    var out = { count: 0, nFixed: 0, nSel: 0, items: [] };
    Object.keys(fixed || {}).sort().forEach(function (lab) {
      var hm = fixed[lab] || {};
      Object.keys(hm).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (h) {
        var n = Number(hm[h]) || 0;
        if (n <= 0) return;
        var H = parseInt(h, 10) || 0;
        out.nFixed += n;
        out.count += n;
        out.items.push({ name: lab, hours: H, count: n, kind: "fixed" });
      });
    });
    Object.keys(sel || {}).sort().forEach(function (name) {
      var n = Number(sel[name]) || 0;
      if (n <= 0) return;
      out.nSel += n;
      out.count += n;
      out.items.push({ name: name, count: n, kind: "sel" });
    });
    return out;
  }

  /* ---------------- 账单主体 ----------------
     snap 需要的字段（其余一律不读）：
       recorded_at / main_story_open_at / income_per_hour / future_income_per_hour /
       stage_clear_resources / activities
     recorded_at 与 main_story_open_at 允许 Date、ISO 字符串或时间戳。
     opts.span  > 0 → 固定 N 天周期（数据日期+1 起）；= 0 / 不传 → 到开放日（原口径）
     opts.sched → 已算好的 events.schedule()，spanStats 批量算周期时复用它，避免重复求解 */
  function build(snap, opts) {
    var s = snap || {};
    var o = opts || {};
    var span = Math.floor(Number(o.span) || 0);
    if (!(span > 0)) span = 0;
    if (span > MAX_DAYS) span = MAX_DAYS;

    var recISO = toISO(s.recorded_at);
    var openISO = s.main_story_open_at ? toISO(s.main_story_open_at) : null;
    var assumed = !openISO;
    var out = {
      ok: false, reason: "", start: "", end: "", open: openISO || null,
      assumed: assumed, span: span, rows: [], days: 0,
      totals: zeroRes(), avg: zeroRes(),
      hasFutureRate: false, boxDays: 0, boxTotal: 0, boxAvg: 0
    };
    if (!recISO) { out.reason = "缺少「数据日期」，无法生成账单。"; return out; }

    var startISO = addDaysISO(recISO, 1);
    // 周期口径：区间长度由用户选的 N 决定，与开放日无关（开放日只影响费率切换与推图那天）
    var endISO = span > 0 ? addDaysISO(recISO, span) : (openISO || addDaysISO(recISO, ASSUME_DAYS));
    out.start = startISO;
    out.end = endISO;
    // 这两条只在「到开放日」口径下才成立；周期口径下开放日可以落在区间外（甚至已经很早）
    if (span === 0) {
      if (!openISO && ASSUME_DAYS < 1) { out.reason = "账单区间为空。"; return out; }
      if (openISO && openISO < startISO) {
        out.reason = "「新主线开放日」不晚于数据日期，没有可统计的等待期。";
        return out;
      }
    }

    var curRate = pickRes(s.income_per_hour);
    var futRate = pickRes(s.future_income_per_hour);
    var useFuture = C.RESOURCES.some(function (r) { return (futRate[r] || 0) > 0; });
    out.hasFutureRate = useFuture;
    var stage = pickRes(s.stage_clear_resources);

    // 活动逐日产出：与引擎同源（禁止另写聚合）；recorded_at 传本地零点，避免时区偏一天
    var sched = (o.sched !== undefined && o.sched !== null) ? o.sched
      : ((global.NikkeEvents && global.NikkeEvents.schedule)
        ? global.NikkeEvents.schedule({ recorded_at: recISO + "T00:00:00", activities: s.activities || [] })
        : null);

    var tot = zeroRes();
    var d = startISO, guard = 0;
    while (guard++ < MAX_DAYS) {
      var rate = (openISO && d >= openISO && useFuture) ? futRate : curRate;
      // ⚠ byDate[d] 的形状是 { res:{三资源}, fixed:{箱}, selectable:{箱}, days }，
      //   这里 res 只取 .res（漏掉这层 → 活动日金额会静默变成 0，标签却照常出现）；
      //   箱子在 .fixed / .selectable 两个键上，别漏
      var raw = (sched && sched.byDate && sched.byDate[d]) ? sched.byDate[d] : null;
      var dayAct = raw ? (raw.res || null) : null;
      var isOpen = !!(openISO && d === openISO);
      var res = zeroRes();
      C.RESOURCES.forEach(function (r) {
        res[r] = (rate[r] || 0) * 24
               + (dayAct ? (Number(dayAct[r]) || 0) : 0)
               + (isOpen ? (stage[r] || 0) : 0);
        tot[r] += res[r];
      });
      var bd = dayBox(raw ? raw.fixed : null, raw ? raw.selectable : null);
      var w = wdOf(d);
      out.rows.push({
        date: d, wd: w, wdn: WD_NAMES[w] || "",
        res: res,
        boxCount: bd.count, boxItems: bd.items,
        hasAct: !!dayAct, isOpen: isOpen
      });
      if (bd.count) out.boxDays++;
      out.boxTotal += bd.count;
      if (d === endISO) break;
      d = addDaysISO(d, 1);
    }
    out.days = out.rows.length;
    out.totals = tot;
    if (out.days > 0) {
      C.RESOURCES.forEach(function (r) { out.avg[r] = tot[r] / out.days; });
      out.boxAvg = out.boxTotal / out.days;
    }
    out.ok = out.days > 0;
    if (!out.ok) out.reason = "账单区间内没有可统计的日期。";
    return out;
  }

  /* ---------------- 聚合 / 按周几分组（筛选后重算合计与日均都走这里） ---------------- */
  function agg(rows) {
    var list = rows || [];
    var out = {
      days: list.length, boxDays: 0, boxTotal: 0, boxAvg: 0,
      totals: zeroRes(), avg: zeroRes()
    };
    list.forEach(function (row) {
      C.RESOURCES.forEach(function (r) { out.totals[r] += (row.res && row.res[r]) || 0; });
      if (row.boxCount) out.boxDays++;
      out.boxTotal += row.boxCount || 0;
    });
    if (out.days > 0) {
      C.RESOURCES.forEach(function (r) { out.avg[r] = out.totals[r] / out.days; });
      out.boxAvg = out.boxTotal / out.days;
    }
    return out;
  }

  /* 7 个桶，按「周一…周日」排；没有数据的周几 days=0（页面照常显示 0 天） */
  function groupByWeekday(led) {
    var rows = (led && led.rows) || [];
    var buckets = {};
    rows.forEach(function (row) {
      if (row.wd < 0) return;
      (buckets[row.wd] = buckets[row.wd] || []).push(row);
    });
    return WD_ORDER.map(function (w) {
      var rs = buckets[w] || [];
      var a = agg(rs);
      return {
        wd: w, name: WD_NAMES[w], days: a.days,
        avg: a.avg, totals: a.totals,
        boxDays: a.boxDays, boxTotal: a.boxTotal, boxAvg: a.boxAvg,
        rows: rs
      };
    });
  }

  /* 箱子明细文本（悬浮提示 / CSV 备注）：8h 芯尘盒 ×3 · 挑战者成长宝箱 ×12 */
  function boxText(items) {
    return (items || []).map(function (it) {
      return (it.kind === "fixed" ? (it.hours + "h ") : "") + it.name + " ×" + it.count;
    }).join(" · ");
  }

  /* ---------------- 各周期对比（R51）----------------
     一次算完 30/60/90/180/365 天各自的「整体情况」：合计比日均更能说明"一个周期能攒多少"。
     schedule 只求解一次（箱数/活动逐日产出与区间长度无关，可共用）。
     返回值与组数无关地稳定：spans 里给的每个值都有一行，不可用（缺数据日期）时 ok=false。 */
  function spanStats(snap, spans) {
    var s = snap || {};
    var list = (spans && spans.length) ? spans : SPANS;
    var recISO = toISO(s.recorded_at);
    if (!recISO) return [];
    var sched = (global.NikkeEvents && global.NikkeEvents.schedule)
      ? global.NikkeEvents.schedule({ recorded_at: recISO + "T00:00:00", activities: s.activities || [] })
      : null;
    return list.map(function (sp) {
      var led = build(s, { span: sp, sched: sched });
      return {
        span: sp, ok: !!led.ok, days: led.days, start: led.start, end: led.end,
        totals: led.totals, avg: led.avg,
        boxTotal: led.boxTotal, boxAvg: led.boxAvg, boxDays: led.boxDays
      };
    });
  }

  /* ---------------- 箱子比重（R52）----------------
     「收到的箱子大概哪类占大头」：按箱名合并（同名不同小时档算一类，8h 芯尘盒 + 2h 芯尘盒 = 芯尘盒）。
     只数个数 → 页面画堆叠条 + 图标个数；⚠ 不折算资源，pct 是个数占比，不是资源占比。
     只统计传进来的 rows（= 当前筛选后的行），页面不做二次计算。 */
  function boxMix(rows) {
    var map = {}, total = 0;
    (rows || []).forEach(function (row) {
      (row.boxItems || []).forEach(function (it) {
        var name = String((it && it.name) || "");
        if (!name) return;
        var n = Number(it.count) || 0;
        if (n <= 0) return;
        var e = map[name];
        if (!e) e = map[name] = { name: name, kind: it.kind, count: 0 };
        e.count += n;
        total += n;
      });
    });
    var list = Object.keys(map).map(function (k) {
      var e = map[k];
      e.pct = total > 0 ? (e.count / total * 100) : 0;
      return e;
    });
    // 个数降序；同个数时固定箱在前，再按名字，避免顺序随浏览器抖动
    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.kind !== b.kind) return a.kind === "fixed" ? -1 : 1;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return list;
  }

  /* ---------------- 箱子明细汇总（R51）----------------
     只数个数之后光看总数分不清构成 → 按「箱名 + 小时档」聚合（固定箱同名不同档分开算）。
     只统计传进来的 rows（= 当前筛选后的行），页面不做二次计算。 */
  function boxSummary(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      (row.boxItems || []).forEach(function (it) {
        var H = it.hours || 0;
        var key = it.kind + "|" + it.name + "|" + H;
        var e = map[key];
        if (!e) {
          e = map[key] = { name: it.name, hours: H, kind: it.kind,
                           count: 0, first: row.date, last: row.date, days: 0 };
        }
        e.count += it.count;
        e.days += 1;
        if (row.date < e.first) e.first = row.date;
        if (row.date > e.last) e.last = row.date;
      });
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    // 个数降序；同个数时固定箱在前（同一时间档从长到短），再按名字，避免顺序随浏览器抖动
    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.kind !== b.kind) return a.kind === "fixed" ? -1 : 1;
      if (b.hours !== a.hours) return b.hours - a.hours;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return list;
  }

  /* ---------------- CSV（UTF-8 BOM，Excel 直接打开不乱码）
     opts.rows 传筛选后的行 → 导出「当前视图」；不传 = 全部。
     列：日期 / 星期 / 三资源（基础自然收益）/ 箱数 / 箱子明细 / 来源 */
  function csv(led, opts) {
    var o = opts || {};
    var rows = o.rows || (led && led.rows) || [];
    var labels = C.RESOURCES.map(function (r) { return C.RESOURCE_LABELS[r] || r; });
    var head = ["日期", "星期"].concat(labels).concat(["箱数", "箱子明细", "来源"]);
    var lines = [head.join(",")];
    rows.forEach(function (row) {
      var src = row.isOpen
        ? (row.hasAct ? "开放日+活动" : "开放日")
        : (row.hasAct ? "基地+活动" : "基地");
      var cells = [row.date, weekdayCN(row.date)]
        .concat(C.RESOURCES.map(function (r) { return Math.round(row.res[r]); }))
        .concat([row.boxCount || 0, boxText(row.boxItems), src]);
      lines.push(cells.join(","));
    });
    var a = agg(rows);
    // ⚠ 合计行也要补足后面两列（明细 / 来源）的空位，否则 Excel 里整行右移一格
    lines.push(["合计", ""]
      .concat(C.RESOURCES.map(function (r) { return Math.round(a.totals[r]); }))
      .concat([a.boxTotal, "", ""]).join(","));
    return "\ufeff" + lines.join("\r\n");
  }

  /* ---------------- 计算后落的快照切片（app.js → localStorage → ledger.html） ----------------
     只存账单真正需要的字段：不落整份表单，也不落箱量/消耗，避免与计算口径脱钩。
     R50 起不再需要 box_defs / challenger_pref（箱子只数个数，不做折算定价）。 */
  function snapSlice(snap, form) {
    var s = snap || {}, f = form || {};
    return {
      v: 3,
      computed_at: Date.now(),
      recorded_at: toISO(s.recorded_at),
      main_story_open_at: s.main_story_open_at ? toISO(s.main_story_open_at) : null,
      income_per_hour: pickRes(s.income_per_hour),
      future_income_per_hour: pickRes(s.future_income_per_hour),
      stage_clear_resources: pickRes(s.stage_clear_resources),
      activities: (s.activities || []).map(function (a) {
        return { template: a && a.template, start_date: a && a.start_date };
      }),
      form_saved_at: f.saved_at || "",
      form_capture_time: f.capture_time || ""
    };
  }

  /* 表单是否在上次计算之后改过（改过 → 页面上给「记得重算」提示，不自动改口径） */
  function formChanged(slice, form) {
    if (!slice) return false;
    var f = form || {};
    return (slice.form_saved_at || "") !== (f.saved_at || "")
        || (slice.form_capture_time || "") !== (f.capture_time || "");
  }

  global.NikkeLedger = {
    ASSUME_DAYS: ASSUME_DAYS,
    MAX_DAYS: MAX_DAYS,
    SPANS: SPANS,
    SNAP_KEY: SNAP_KEY,
    WD_NAMES: WD_NAMES,
    WD_ORDER: WD_ORDER,
    isoLocal: isoLocal,
    addDaysISO: addDaysISO,
    wdOf: wdOf,
    weekdayCN: weekdayCN,
    toISO: toISO,
    zeroRes: zeroRes,
    dayBox: dayBox,
    boxText: boxText,
    boxMix: boxMix,
    boxSummary: boxSummary,
    build: build,
    spanStats: spanStats,
    agg: agg,
    groupByWeekday: groupByWeekday,
    csv: csv,
    snapSlice: snapSlice,
    formChanged: formChanged
  };

  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeLedger;
})(typeof window !== "undefined" ? window : global);
