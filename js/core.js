/* core.js — 常量、数字/速率解析、升级消耗、每日收益（自 Python calculator 移植） */
(function (global) {
  "use strict";

  var RESOURCES = ["credit", "battle_data", "core_dust"];
  var RESOURCE_LABELS = { credit: "信用点", battle_data: "战斗数据辑", core_dust: "红球" };

  function zeroRes() { return { credit: 0.0, battle_data: 0.0, core_dust: 0.0 }; }

  function addRes(a, b) {
    return {
      credit: (a && a.credit || 0.0) + (b && b.credit || 0.0),
      battle_data: (a && a.battle_data || 0.0) + (b && b.battle_data || 0.0),
      core_dust: (a && a.core_dust || 0.0) + (b && b.core_dust || 0.0),
    };
  }

  function subRes(a, b) {
    return {
      credit: (a && a.credit || 0.0) - (b && b.credit || 0.0),
      battle_data: (a && a.battle_data || 0.0) - (b && b.battle_data || 0.0),
      core_dust: (a && a.core_dust || 0.0) - (b && b.core_dust || 0.0),
    };
  }

  /* ---------- 数字解析（K/M/B/万/亿 + 中文单位） ---------- */
  var UNITS = { k: 1e3, m: 1e6, b: 1e9, "万": 1e4, "亿": 1e8 };

  function parseNumber(value, def) {
    if (value === null || value === undefined || String(value).trim() === "") {
      if (def === undefined) throw new Error("数值不能为空");
      return { raw: "", value: Number(def), source: "default" };
    }
    var raw = String(value).trim().replace(/[,，\s\u3000]/g, "");
    var m = /^([+-]?[0-9]+(?:\.[0-9]+)?)([kKmMbB万亿]?)$/.exec(raw);
    if (!m) throw new Error("无法解析数字：" + value);
    var num = parseFloat(m[1]);
    var suffix = m[2].toLowerCase();
    var mult = UNITS[suffix] || 1.0;
    return { raw: raw, value: num * mult, precision: suffix ? "rounded" : "exact", unit: suffix, source: "parsed" };
  }

  function num(value, def) {
    try { return parseNumber(value, def === undefined ? 0 : def).value; }
    catch (e) { return def === undefined ? 0.0 : Number(def); }
  }

  /* 速率解析：支持 /h /min 每分钟 每小时，统一为每小时 */
  function parseRate(value, unit) {
    var raw = String(value || "").trim().toLowerCase();
    if (!raw) return 0.0;
    var inferred = String(unit || "").toLowerCase().replace("每分钟", "/min").replace("每小时", "/h");
    var parsedText = raw.replace(/\/(?:min|h)|每分钟|每小时/g, "");
    var n = num(parsedText, 0.0);
    if (raw.indexOf("/min") >= 0 || raw.indexOf("每分钟") >= 0 || inferred === "/min") return n * 60.0;
    return n;
  }

  /* ---------- 升级消耗模型（range → tiers → per_level，同 Python UpgradeCostModel） ---------- */
  function costForLevel(model, level) {
    if (model.range_start !== null && model.range_start !== undefined &&
        model.range_end && model.range_end > model.range_start) {
      if (model.range_start <= level && level < model.range_end) {
        var rt = model.range_total || zeroRes();
        if (rt.credit || rt.battle_data || rt.core_dust) {
          var steps = model.range_end - model.range_start;
          return { credit: rt.credit / steps, battle_data: rt.battle_data / steps, core_dust: rt.core_dust / steps };
        }
      }
    }
    if (model.per_level && model.per_level.overrideEnd !== undefined) {
      // 手填升级消耗仅覆盖当前等级所在档位：段内用 per_level，段外回落档位表，保证跨档仍逐级按阶梯
      var pl0 = model.per_level;
      if (level >= pl0.overrideStart && level < pl0.overrideEnd) {
        return { credit: pl0.credit || 0.0, battle_data: pl0.battle_data || 0.0, core_dust: pl0.core_dust || 0.0 };
      }
    }
    if (model.tiers && model.tiers.length) {
      var chosen = model.tiers[0];
      for (var i = 0; i < model.tiers.length; i++) {
        if (model.tiers[i].level <= level) chosen = model.tiers[i];
        else break;
      }
      return {
        credit: chosen.credit * 1000.0,
        battle_data: chosen.battle_data * 1000.0,
        core_dust: Number(chosen.core_dust),
      };
    }
    var pl = model.per_level || zeroRes();
    return { credit: pl.credit || 0.0, battle_data: pl.battle_data || 0.0, core_dust: pl.core_dust || 0.0 };
  }

  function costForLevels(snapshot, startLevel, steps) {
    var total = zeroRes();
    for (var i = 0; i < Math.max(0, steps); i++) {
      var c = costForLevel(snapshot.upgrade_cost, startLevel + i);
      total = addRes(total, c);
    }
    return total;
  }

  function affordableLevels(resources, snapshot, startLevel, limit) {
    limit = limit || 1000;
    var balance = { credit: resources.credit || 0, battle_data: resources.battle_data || 0, core_dust: resources.core_dust || 0 };
    var levels = 0;
    while (levels < limit) {
      var cost = costForLevel(snapshot.upgrade_cost, startLevel + levels);
      if (balance.credit + 1e-9 < cost.credit || balance.battle_data + 1e-9 < cost.battle_data || balance.core_dust + 1e-9 < cost.core_dust) break;
      balance = subRes(balance, cost);
      levels += 1;
    }
    return levels;
  }

  function affordableLevelsSingle(resources, snapshot, startLevel, resource, limit) {
    limit = limit || 1000;
    var balance = resources[resource] || 0.0;
    var levels = 0;
    while (levels < limit) {
      var cost = costForLevel(snapshot.upgrade_cost, startLevel + levels)[resource] || 0.0;
      if (balance + 1e-9 < cost) break;
      balance -= cost;
      levels += 1;
    }
    return levels;
  }

  /* ---------- 每日收益（v6：daily_full / extra_daily） ---------- */
  function dailyIncome(snapshot, wipeoutCount, hoursEach) {
    var planned = snapshot.daily_full === false ? 0 : (wipeoutCount || 0);
    var hours = 24.0 + Math.max(0, planned) * hoursEach;
    var result = { credit: snapshot.income_per_hour.credit * hours, battle_data: snapshot.income_per_hour.battle_data * hours, core_dust: snapshot.income_per_hour.core_dust * hours };
    var extra = snapshot.extra_daily || zeroRes();
    return addRes(result, extra);
  }

  /* 分段收益：start/end 为 Date；switch 为新主线开放时间 */
  function incomeBetween(snapshot, start, end) {
    if (end <= start) return zeroRes();
    var result = zeroRes();
    var cursor = new Date(start.getTime());
    var sw = snapshot.main_story_open_at ? new Date(snapshot.main_story_open_at.getTime()) : null;
    while (cursor < end) {
      var segmentEnd = end;
      var income = snapshot.income_per_hour;
      if (sw && cursor < sw && sw < end) segmentEnd = sw;
      else if (sw && cursor >= sw) income = snapshot.future_income_per_hour || snapshot.income_per_hour;
      var hours = (segmentEnd.getTime() - cursor.getTime()) / 3600000.0;
      result.credit += (income.credit || 0.0) * hours;
      result.battle_data += (income.battle_data || 0.0) * hours;
      result.core_dust += (income.core_dust || 0.0) * hours;
      if (segmentEnd.getTime() === end.getTime()) break;
      cursor = new Date(segmentEnd.getTime());
    }
    return result;
  }

  /* ---------- 日期辅助 ---------- */
  function isoMinutes(d) { return d.toISOString().slice(0, 16); }

  global.NikkeCore = {
    RESOURCES: RESOURCES,
    RESOURCE_LABELS: RESOURCE_LABELS,
    zeroRes: zeroRes,
    addRes: addRes,
    subRes: subRes,
    parseNumber: parseNumber,
    num: num,
    parseRate: parseRate,
    costForLevel: costForLevel,
    costForLevels: costForLevels,
    affordableLevels: affordableLevels,
    affordableLevelsSingle: affordableLevelsSingle,
    dailyIncome: dailyIncome,
    incomeBetween: incomeBetween,
    isoMinutes: isoMinutes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeCore;
})(typeof window !== "undefined" ? window : globalThis);
