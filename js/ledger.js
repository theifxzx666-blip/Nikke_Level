/* ledger.js — 收益账单（R47 从结果区 tab 拆成独立工具页 ledger.html）
   职责：把「一份快照」汇总成逐日到账账单（build）、导出 CSV（csv）、
        以及在每次计算后由 app.js 落的可序列化快照切片（snapSlice）。
   口径唯一来源就在本文件：页面（ledger.html）与 app.js 都只调这里，禁止另写一套聚合。
   ⚠ 纯展示层：不参与任何既有计算口径（等待期到账 / 开箱方案 / 配比求解一律不变）。
   ⚠ 活动逐日产出读 NikkeEvents.schedule().byDate（与引擎同源）。
   ⚠ 开箱收益不计入账单（箱子是存量转化，不是新增产出）；也不扣升级消耗（账单是进项账）。 */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var ASSUME_DAYS = 14;    // 未填「新主线开放日」时，默认预览未来 14 天
  var MAX_DAYS = 400;      // 防御：开放日填成十年后时不生成几万行

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
  function weekdayCN(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? "" : "周" + "日一二三四五六".charAt(d.getDay());
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

  /* ---------------- 账单主体 ----------------
     snap 需要的字段（其余一律不读）：
       recorded_at / main_story_open_at / income_per_hour /
       future_income_per_hour / stage_clear_resources / activities
     recorded_at 与 main_story_open_at 允许 Date、ISO 字符串或时间戳。 */
  function build(snap) {
    var s = snap || {};
    var recISO = toISO(s.recorded_at);
    var openISO = s.main_story_open_at ? toISO(s.main_story_open_at) : null;
    var assumed = !openISO;
    var out = {
      ok: false, reason: "", start: "", end: "", open: openISO || null,
      assumed: assumed, rows: [], totals: zeroRes(), avg: zeroRes(), days: 0,
      hasFutureRate: false
    };
    if (!recISO) { out.reason = "缺少「数据日期」，无法生成账单。"; return out; }

    var startISO = addDaysISO(recISO, 1);
    var endISO = openISO || addDaysISO(recISO, ASSUME_DAYS);
    out.start = startISO;
    out.end = endISO;
    if (!openISO && ASSUME_DAYS < 1) { out.reason = "账单区间为空。"; return out; }
    // 开放日不晚于数据日期 → 没有等待期，账单无意义
    if (openISO && openISO < startISO) {
      out.reason = "「新主线开放日」不晚于数据日期，没有可统计的等待期。";
      return out;
    }

    var curRate = pickRes(s.income_per_hour);
    var futRate = pickRes(s.future_income_per_hour);
    var useFuture = C.RESOURCES.some(function (r) { return (futRate[r] || 0) > 0; });
    out.hasFutureRate = useFuture;
    var stage = pickRes(s.stage_clear_resources);

    // 活动逐日产出：与引擎同源（禁止另写聚合）；recorded_at 传本地零点，避免时区偏一天
    var sched = (global.NikkeEvents && global.NikkeEvents.schedule)
      ? global.NikkeEvents.schedule({ recorded_at: recISO + "T00:00:00", activities: s.activities || [] })
      : null;

    var tot = zeroRes();
    var d = startISO, guard = 0;
    while (guard++ < MAX_DAYS) {
      var rate = (openISO && d >= openISO && useFuture) ? futRate : curRate;
      // ⚠ byDate[d] 的形状是 { res:{三资源}, fixed:{箱}, selectable:{箱}, days }，
      //   这里只取 .res（漏掉这层 → 活动日金额会静默变成 0，标签却照常出现）
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
      out.rows.push({ date: d, res: res, hasAct: !!dayAct, isOpen: isOpen });
      if (d === endISO) break;
      d = addDaysISO(d, 1);
    }
    out.days = out.rows.length;
    out.totals = tot;
    if (out.days > 0) {
      C.RESOURCES.forEach(function (r) { out.avg[r] = tot[r] / out.days; });
    }
    out.ok = out.days > 0;
    if (!out.ok) out.reason = "账单区间内没有可统计的日期。";
    return out;
  }

  /* ---------------- CSV（UTF-8 BOM，Excel 直接打开不乱码） ---------------- */
  function csv(led) {
    var head = ["日期", "星期"].concat(C.RESOURCES.map(function (r) { return C.RESOURCE_LABELS[r] || r; })).concat(["来源"]);
    var lines = [head.join(",")];
    (led.rows || []).forEach(function (row) {
      var src = row.isOpen
        ? (row.hasAct ? "开放日+活动" : "开放日")
        : (row.hasAct ? "基地+活动" : "基地");
      var cells = [row.date, weekdayCN(row.date)]
        .concat(C.RESOURCES.map(function (r) { return Math.round(row.res[r]); }))
        .concat([src]);
      lines.push(cells.join(","));
    });
    lines.push(["合计", ""]
      .concat(C.RESOURCES.map(function (r) { return Math.round(led.totals[r]); }))
      .concat([""]).join(","));
    return "\ufeff" + lines.join("\r\n");
  }

  /* ---------------- 计算后落的快照切片（app.js → localStorage → ledger.html） ----------------
     只存账单真正需要的字段：不落整份表单，也不落箱量/消耗，避免与计算口径脱钩。 */
  var SNAP_KEY = "nikke_ledger_snap_v1";

  function snapSlice(snap, form) {
    var s = snap || {}, f = form || {};
    return {
      v: 1,
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
    SNAP_KEY: SNAP_KEY,
    isoLocal: isoLocal,
    addDaysISO: addDaysISO,
    weekdayCN: weekdayCN,
    toISO: toISO,
    zeroRes: zeroRes,
    build: build,
    csv: csv,
    snapSlice: snapSlice,
    formChanged: formChanged
  };

  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeLedger;
})(typeof window !== "undefined" ? window : global);
