(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NikkeOverloadCombat = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function number(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function emptyOption() {
    return {
      type: "",
      level: 0,
      displayName: "空（无词条）",
      functionValue: 0,
      functionBattlepower: 0,
      stateEffectId: 0,
      functionId: 0,
    };
  }

  function groupByType(data, type) {
    return (data.optionGroups || []).find(function (group) {
      return group.descriptionLocalkey === type;
    }) || null;
  }

  function resolveOption(data, type, level) {
    var parsedLevel = Math.trunc(number(level));
    if (!type || parsedLevel <= 0) return emptyOption();
    var group = groupByType(data, type);
    var row = group && group.levels && group.levels[String(parsedLevel)];
    if (!row) throw new Error("词条类型或阶数不在当前静态数据中");
    return {
      type: type,
      level: parsedLevel,
      displayName: row.displayName,
      functionValue: number(row.functionValue),
      functionBattlepower: number(row.functionBattlepower),
      stateEffectId: number(row.stateEffectId),
      functionId: number(row.functionId),
    };
  }

  function optionSummary(data, slots) {
    var rows = (slots || []).map(function (slot) {
      return resolveOption(data, slot.type, slot.level);
    });
    return {
      rows: rows,
      internalBattlepower: rows.reduce(function (sum, row) { return sum + row.functionBattlepower; }, 0),
    };
  }

  function roundGame(value) {
    // The client applies Unity math.round before Convert.ToInt32. Normal game values
    // do not land on a half-integer; Math.round matches the observed integer result.
    return Math.round(value);
  }

  function calculateBattlePower(profile, internalBattlepower) {
    var config = profile.config || {};
    var attackTo = number(config.AttackToBattlePower);
    var defenseTo = number(config.DefenseToBattlePower);
    var hpTo = number(config.HpToBattlePower);
    var skillBase = number(config.SkillBaseToBattlePower);
    var skill1To = number(config.Skill1ToBattlePower);
    var skill2To = number(config.Skill2ToBattlePower);
    var burstTo = number(config.BurstSkillToBattlePower);
    var attack = number(profile.attack);
    var defense = number(profile.defense);
    var hp = number(profile.hp);
    var criticalRatio = number(profile.criticalRatePercent) * 100;
    var criticalDamage = number(profile.criticalDamagePercent) * 100;
    var criticalFactor = 1 + criticalRatio * 0.0001 * (criticalDamage * 0.0001 - 1);
    var statAttackPower = attack * criticalFactor * attackTo;
    var statDefensePower = (hp + defense * defenseTo) * hpTo;
    var skillFactor = skillBase
      + number(profile.skill1Level) * skill1To
      + number(profile.skill2Level) * skill2To
      + number(profile.burstLevel) * burstTo
      + (number(profile.extraStateEffectBattlepower) + number(internalBattlepower)) * 0.0001;
    var raw = (statAttackPower + statDefensePower) * skillFactor * 0.01;
    return {
      value: roundGame(raw),
      raw: raw,
      statAttackPower: statAttackPower,
      statDefensePower: statDefensePower,
      skillFactor: skillFactor,
      criticalFactor: criticalFactor,
    };
  }

  function assessProfile(profile) {
    var visibleFields = ["attack", "defense", "hp"];
    var skillFields = ["skill1Level", "skill2Level", "burstLevel"];
    var hiddenFields = ["criticalRatePercent", "criticalDamagePercent"];
    function missing(fields) {
      return fields.filter(function (field) { return profile[field] === "" || profile[field] === null || profile[field] === undefined; });
    }
    var missingVisible = missing(visibleFields);
    var missingSkills = missing(skillFields);
    var missingHidden = missing(hiddenFields);
    return {
      mode: missingVisible.length ? "unavailable" : (missingSkills.length || missingHidden.length ? "partial" : "exact"),
      missingVisible: missingVisible,
      missingSkills: missingSkills,
      missingHidden: missingHidden,
    };
  }

  function gearContribution(data, profile, before, after) {
    var runningPower = before.internalBattlepower;
    var rows = [];
    var runningBattlePower = calculateBattlePower(profile, runningPower).value;
    ["head", "body", "arms", "legs"].forEach(function (slot) {
      var beforeRow = before.gears[slot];
      var afterRow = after.gears[slot];
      var delta = afterRow.internalBattlepower - beforeRow.internalBattlepower;
      var next = calculateBattlePower(profile, runningPower + delta).value;
      rows.push({
        slot: slot,
        beforeInternalBattlepower: beforeRow.internalBattlepower,
        afterInternalBattlepower: afterRow.internalBattlepower,
        internalBattlepowerDelta: delta,
        battlepowerDelta: next - runningBattlePower,
      });
      runningPower += delta;
      runningBattlePower = next;
    });
    return rows;
  }

  function calculate(data, profile, beforeSlots, afterSlots) {
    var beforeGears = {};
    var afterGears = {};
    ["head", "body", "arms", "legs"].forEach(function (slot) {
      beforeGears[slot] = optionSummary(data, beforeSlots[slot] || []);
      afterGears[slot] = optionSummary(data, afterSlots[slot] || []);
    });
    var before = {
      gears: beforeGears,
      internalBattlepower: Object.keys(beforeGears).reduce(function (sum, slot) { return sum + beforeGears[slot].internalBattlepower; }, 0),
    };
    var after = {
      gears: afterGears,
      internalBattlepower: Object.keys(afterGears).reduce(function (sum, slot) { return sum + afterGears[slot].internalBattlepower; }, 0),
    };
    var beforePower = calculateBattlePower(profile, before.internalBattlepower);
    var afterPower = calculateBattlePower(profile, after.internalBattlepower);
    var gearRows = gearContribution(data, profile, before, after);
    return {
      before: before,
      after: after,
      beforePower: beforePower,
      afterPower: afterPower,
      internalBattlepowerDelta: after.internalBattlepower - before.internalBattlepower,
      battlepowerDelta: afterPower.value - beforePower.value,
      gears: gearRows,
    };
  }

  return {
    emptyOption: emptyOption,
    groupByType: groupByType,
    resolveOption: resolveOption,
    optionSummary: optionSummary,
    calculateBattlePower: calculateBattlePower,
    assessProfile: assessProfile,
    calculate: calculate,
  };
});
