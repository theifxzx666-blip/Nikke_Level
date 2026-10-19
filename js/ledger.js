/* ledger.js — 收益账单（R47 从结果区 tab 拆成独立工具页 ledger.html；R49 加入箱子收入 + 按周几筛选）
   职责：把「一份快照」汇总成逐日到账账单（build）、按周几聚合（agg / groupByWeekday）、
        导出 CSV（csv）、以及在每次计算后由 app.js 落的可序列化快照切片（snapSlice）。
   口径唯一来源就在本文件：页面（ledger.html）与 app.js 都只调这里，禁止另写一套聚合。
   ⚠ 纯展示层：不参与任何既有计算口径（等待期到账 / 开箱方案 / 配比求解一律不变）。
   ⚠ 活动逐日产出读 NikkeEvents.schedule().byDate（与引擎同源）。
   ⚠ 账单是「进项账」：只统计当天新到账，不扣升级消耗；开箱本身的「消耗」不进账单。

   ---------- R49：箱子收入 ----------
   逐日三资源 = res（基地 × 24 + 活动直接资源 + 开放日一次性推图）+ box（当天活动箱子折合）。
   逐日行的 res / box / all 三个字段都保留，页面用 all 显示、箱量单独一列，便于拆开看。

   固定小时箱（自描述：箱名决定资源、键 = 小时数）
     信用点盒 / 战斗数据辑盒 → rate × h × n
     芯尘盒                → floor(rate × h) × n   ← TRUNC，与 boxes.js fixedBoxResources 逐值同口径
     成长套组              → 三资源各按上面两条（芯尘同样 TRUNC）

   自选箱（需要定义：快照 box_defs，来源 = 计算器 BOX_DEFS，禁在本文件写死数值）
     mode "units" → units × n    （挑战者成长宝箱；资源按快照 challenger_pref 选，auto ⇒ 芯尘，
                                   与 R31「同分时取芯尘」方向一致）
     mode "hours" → rate × h × n  （方舟官方补给物资Ⅰ / 30天成长补给箱；资源按页面「折算目标」选）
     不取整：与 boxes.js optionValue 对 hours 模式的处理逐值一致（只有固定箱芯尘走 TRUNC）
     取不到定义 → 只记个数、不折算金额（boxUndef > 0，页面提示重算一次） */
(function (global) {
  "use strict";

  var C = global.NikkeCore;
  var ASSUME_DAYS = 14;    // 未填「新主线开放日」时，默认预览未来 14 天
  var MAX_DAYS = 400;      // 防御：开放日填成十年后时不生成几万行
  var SNAP_KEY = "nikke_ledger_snap_v1";
  /* getDay() 的索引 → 中文。筛选与分组都按「周一…周日」排（不做 locale 判断） */
  var WD_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
  /* 可选的「自选箱折算目标」（页面下拉用） */
  var SEL_PICKS = ["core_dust", "battle_data", "credit"];
  /* 表单里的「挑战者箱资源选择」偏好 → 资源键（auto 不在表里 → 落到 core_dust） */
  var PREF_RES = { dust: "core_dust", battle: "battle_data" };
  /* 固定小时箱：箱名 → 资源键（成长套组特殊，单独处理） */
  var FIXED_RES = { "信用点盒": "credit", "战斗数据辑盒": "battle_data", "芯尘盒": "core_dust" };

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

  /* ---------------- 箱子折合 ----------------
     单个箱子的资源值：与 boxes.js 的 boxValue 完全一致（芯尘 TRUNC，其余不取整） */
  function boxVal(rate, r, h) {
    var x = (rate[r] || 0) * h;
    return r === "core_dust" ? Math.floor(x) : x;
  }

  /* 从箱子定义里挑一个选项：units 箱跟表单偏好，hours 箱跟页面「折算目标」；
     目标资源不在该箱选项里（例：挑战者箱没有信用点）→ 退到第一个有奖励的项 */
  function pickOption(def, pick, pref) {
    var opts = (def && def.options) || [];
    if (!opts.length) return null;
    var units = opts.every(function (o) { return o.mode === "units"; });
    var want = units ? (PREF_RES[pref] || "core_dust") : pick;
    var i;
    for (i = 0; i < opts.length; i++) if (((opts[i] || {}).rewards || {})[want] > 0) return opts[i];
    for (i = 0; i < opts.length; i++) if (Object.keys((opts[i] || {}).rewards || {}).length) return opts[i];
    return opts[0];
  }

  function emptyBox() {
    return { res: zeroRes(), count: 0, nFixed: 0, nSel: 0, undef: 0, items: [] };
  }

  /* 一天的活动箱子 → 折合资源 + 箱数 + 明细 */
  function dayBox(fixed, sel, rate, pick, defs, pref) {
    var out = emptyBox();
    Object.keys(fixed || {}).sort().forEach(function (lab) {
      var hm = fixed[lab] || {};
      Object.keys(hm).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (h) {
        var n = Number(hm[h]) || 0;
        if (n <= 0) return;
        var H = parseInt(h, 10) || 0;
        if (lab === "成长套组") {
          C.RESOURCES.forEach(function (r) { out.res[r] += boxVal(rate, r, H) * n; });
        } else if (FIXED_RES[lab]) {
          var r0 = FIXED_RES[lab];
          out.res[r0] += boxVal(rate, r0, H) * n;
        } else {
          out.undef += n;      // 模板新增了账单还不认识的箱子 → 只记个数
        }
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
      var opt = pickOption(defs[name], pick, pref);
      if (!opt) { out.undef += n; out.items.push({ name: name, count: n, kind: "sel" }); return; }
      var isUnits = opt.mode === "units";
      Object.keys(opt.rewards || {}).forEach(function (r) {
        var v = Number(opt.rewards[r]) || 0;
        if (v <= 0) return;
        out.res[r] += isUnits ? v * n : (rate[r] || 0) * v * n;
      });
      out.items.push({ name: name, count: n, kind: "sel", pick: opt.label || "" });
    });
    return out;
  }

  /* ---------------- 账单主体 ----------------
     snap 需要的字段（其余一律不读）：
       recorded_at / main_story_open_at / income_per_hour / future_income_per_hour /
       stage_clear_resources / activities / box_defs（或 selectable_boxes）/ challenger_pref
     recorded_at 与 main_story_open_at 允许 Date、ISO 字符串或时间戳。
     opts.boxPick = "core_dust" | "battle_data" | "credit"（自选箱折算目标，默认芯尘） */
  function build(snap, opts) {
    var s = snap || {}, o = opts || {};
    var pick = SEL_PICKS.indexOf(o.boxPick) >= 0 ? o.boxPick : "core_dust";
    var defs = {};
    var defSrc = (s.box_defs && s.box_defs.length) ? s.box_defs : (s.selectable_boxes || []);
    defSrc.forEach(function (d) { if (d && d.name) defs[d.name] = d; });
    var pref = s.challenger_pref || "auto";

    var recISO = toISO(s.recorded_at);
    var openISO = s.main_story_open_at ? toISO(s.main_story_open_at) : null;
    var assumed = !openISO;
    var out = {
      ok: false, reason: "", start: "", end: "", open: openISO || null,
      assumed: assumed, rows: [], days: 0,
      totals: zeroRes(), boxTotals: zeroRes(), allTotals: zeroRes(),
      avg: zeroRes(), avgAll: zeroRes(),
      hasFutureRate: false, boxDays: 0, boxCount: 0, boxUndef: 0, pick: pick
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

    var tot = zeroRes(), boxTot = zeroRes(), allTot = zeroRes();
    var d = startISO, guard = 0;
    while (guard++ < MAX_DAYS) {
      var rate = (openISO && d >= openISO && useFuture) ? futRate : curRate;
      // ⚠ byDate[d] 的形状是 { res:{三资源}, fixed:{箱}, selectable:{箱}, days }，
      //   这里 res 只取 .res（漏掉这层 → 活动日金额会静默变成 0，标签却照常出现）；
      //   箱子在 .fixed / .selectable 两个键上，别漏
      var raw = (sched && sched.byDate && sched.byDate[d]) ? sched.byDate[d] : null;
      var dayAct = raw ? (raw.res || null) : null;
      var isOpen = !!(openISO && d === openISO);
      var res = zeroRes(), all = zeroRes();
      C.RESOURCES.forEach(function (r) {
        res[r] = (rate[r] || 0) * 24
               + (dayAct ? (Number(dayAct[r]) || 0) : 0)
               + (isOpen ? (stage[r] || 0) : 0);
      });
      var bd = dayBox(raw ? raw.fixed : null, raw ? raw.selectable : null, rate, pick, defs, pref);
      C.RESOURCES.forEach(function (r) {
        all[r] = res[r] + bd.res[r];
        tot[r] += res[r];
        boxTot[r] += bd.res[r];
        allTot[r] += all[r];
      });
      var w = wdOf(d);
      out.rows.push({
        date: d, wd: w, wdn: WD_NAMES[w] || "",
        res: res, box: bd.res, all: all,
        boxCount: bd.count, boxItems: bd.items, boxUndef: bd.undef,
        hasAct: !!dayAct, isOpen: isOpen, hasBox: bd.count > 0
      });
      if (bd.count) out.boxDays++;
      out.boxCount += bd.count;
      out.boxUndef += bd.undef;
      if (d === endISO) break;
      d = addDaysISO(d, 1);
    }
    out.days = out.rows.length;
    out.totals = tot;
    out.boxTotals = boxTot;
    out.allTotals = allTot;
    if (out.days > 0) {
      C.RESOURCES.forEach(function (r) {
        out.avg[r] = tot[r] / out.days;
        out.avgAll[r] = allTot[r] / out.days;
      });
    }
    out.ok = out.days > 0;
    if (!out.ok) out.reason = "账单区间内没有可统计的日期。";
    return out;
  }

  /* ---------------- 聚合 / 按周几分组（筛选后重算合计与日均都走这里） ---------------- */
  function agg(rows) {
    var list = rows || [];
    var out = {
      days: list.length, boxDays: 0, boxCount: 0,
      totals: zeroRes(), boxTotals: zeroRes(), allTotals: zeroRes(),
      avg: zeroRes(), avgAll: zeroRes()
    };
    list.forEach(function (row) {
      C.RESOURCES.forEach(function (r) {
        out.totals[r] += row.res[r] || 0;
        out.boxTotals[r] += (row.box && row.box[r]) || 0;
        out.allTotals[r] += (row.all && row.all[r]) || row.res[r] || 0;
      });
      if (row.boxCount) out.boxDays++;
      out.boxCount += row.boxCount || 0;
    });
    if (out.days > 0) {
      C.RESOURCES.forEach(function (r) {
        out.avg[r] = out.totals[r] / out.days;
        out.avgAll[r] = out.allTotals[r] / out.days;
      });
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
        avgAll: a.avgAll, allTotals: a.allTotals,
        boxTotals: a.boxTotals, boxDays: a.boxDays, boxCount: a.boxCount,
        rows: rs
      };
    });
  }

  /* ---------------- CSV（UTF-8 BOM，Excel 直接打开不乱码）
     opts.rows 传筛选后的行 → 导出「当前视图」；不传 = 全部。
     ⚠ 三资源列用 all（含箱子折合），与页面显示一致；箱子另给三列便于拆开核对。 */
  function csv(led, opts) {
    var o = opts || {};
    var rows = o.rows || (led && led.rows) || [];
    var labels = C.RESOURCES.map(function (r) { return C.RESOURCE_LABELS[r] || r; });
    var head = ["日期", "星期"].concat(labels)
      .concat(labels.map(function (l) { return "其中箱子 " + l; }))
      .concat(["箱数", "来源"]);
    var lines = [head.join(",")];
    rows.forEach(function (row) {
      var src = row.isOpen
        ? (row.hasAct ? "开放日+活动" : "开放日")
        : (row.hasAct ? "基地+活动" : "基地");
      if (row.hasBox) src += "+箱子";
      var cells = [row.date, weekdayCN(row.date)]
        .concat(C.RESOURCES.map(function (r) { return Math.round(row.all[r]); }))
        .concat(C.RESOURCES.map(function (r) { return Math.round(row.box[r] || 0); }))
        .concat([row.boxCount || 0, src]);
      lines.push(cells.join(","));
    });
    var a = agg(rows);
    // ⚠ 合计行也要补足最后一列（来源）的空位，否则 Excel 里整行右移一格
    lines.push(["合计", ""]
      .concat(C.RESOURCES.map(function (r) { return Math.round(a.allTotals[r]); }))
      .concat(C.RESOURCES.map(function (r) { return Math.round(a.boxTotals[r]); }))
      .concat([a.boxCount, ""]).join(","));
    return "\ufeff" + lines.join("\r\n");
  }

  /* ---------------- 计算后落的快照切片（app.js → localStorage → ledger.html） ----------------
     只存账单真正需要的字段：不落整份表单，也不落箱量/消耗，避免与计算口径脱钩。
     R49 增补 box_defs + challenger_pref：自选箱定价需要箱子定义（units 数值 / hours 小时数），
     定义来自计算器的 BOX_DEFS，禁在 ledger.js 里写死一份副本。 */
  function snapSlice(snap, form) {
    var s = snap || {}, f = form || {};
    return {
      v: 2,
      computed_at: Date.now(),
      recorded_at: toISO(s.recorded_at),
      main_story_open_at: s.main_story_open_at ? toISO(s.main_story_open_at) : null,
      income_per_hour: pickRes(s.income_per_hour),
      future_income_per_hour: pickRes(s.future_income_per_hour),
      stage_clear_resources: pickRes(s.stage_clear_resources),
      activities: (s.activities || []).map(function (a) {
        return { template: a && a.template, start_date: a && a.start_date };
      }),
      challenger_pref: s.challenger_pref || "auto",
      box_defs: (s.selectable_boxes || []).map(function (b) {
        return { name: b && b.name, options: (b && b.options) || [] };
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
    WD_NAMES: WD_NAMES,
    WD_ORDER: WD_ORDER,
    SEL_PICKS: SEL_PICKS,
    isoLocal: isoLocal,
    addDaysISO: addDaysISO,
    wdOf: wdOf,
    weekdayCN: weekdayCN,
    toISO: toISO,
    zeroRes: zeroRes,
    boxVal: boxVal,
    pickOption: pickOption,
    dayBox: dayBox,
    build: build,
    agg: agg,
    groupByWeekday: groupByWeekday,
    csv: csv,
    snapSlice: snapSlice,
    formChanged: formChanged
  };

  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeLedger;
})(typeof window !== "undefined" ? window : global);
