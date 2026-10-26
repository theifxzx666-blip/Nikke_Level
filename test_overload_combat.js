const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Combat = require("./js/overload_combat_core.js");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "overload_combat_data.json"), "utf8"));
assert.strictEqual(data.optionGroups.length, 9, "词条类型数量");
data.optionGroups.forEach((group) => {
  assert.strictEqual(Object.keys(group.levels).length, 15, `${group.displayName} 阶数数量`);
});

const attack = data.optionGroups.find((group) => group.descriptionLocalkey === "Locale_Skill:statatk_description");
const superior = data.optionGroups.find((group) => group.descriptionLocalkey === "Locale_Skill:incelementdmg_description");
assert.strictEqual(Combat.resolveOption(data, attack.descriptionLocalkey, 15).functionBattlepower, 1035);
assert.strictEqual(Combat.resolveOption(data, superior.descriptionLocalkey, 15).functionBattlepower, 1242);
assert.strictEqual(Combat.resolveOption(data, superior.descriptionLocalkey, 12).functionBattlepower, 994);
assert.strictEqual(Combat.resolveOption(data, "", 0).functionBattlepower, 0);
assert.strictEqual(Combat.resolveOption(data, attack.descriptionLocalkey, 0).functionBattlepower, 0);

const profile = {
  config: data.config,
  attack: 1000,
  defense: 100,
  hp: 2000,
  criticalRatePercent: 0,
  criticalDamagePercent: 0,
  skill1Level: 1,
  skill2Level: 1,
  burstLevel: 1,
  extraStateEffectBattlepower: 0,
};
assert.strictEqual(Combat.assessProfile(profile).mode, "exact");
assert.strictEqual(Combat.assessProfile(Object.assign({}, profile, { criticalRatePercent: "", criticalDamagePercent: "" })).mode, "partial");
assert.strictEqual(Combat.assessProfile(Object.assign({}, profile, { attack: "" })).mode, "unavailable");
assert.strictEqual(Combat.calculateBattlePower(profile, 0).value, 354);
assert.strictEqual(Combat.calculateBattlePower(profile, 1035).value, 381);

const blank = () => [{ type: "", level: 0 }, { type: "", level: 0 }, { type: "", level: 0 }];
const before = { head: blank(), body: blank(), arms: blank(), legs: blank() };
const after = { head: blank(), body: blank(), arms: blank(), legs: blank() };
after.head[0] = { type: attack.descriptionLocalkey, level: 15 };
after.body[0] = { type: superior.descriptionLocalkey, level: 15 };
const result = Combat.calculate(data, profile, before, after);
assert.strictEqual(result.before.internalBattlepower, 0);
assert.strictEqual(result.after.internalBattlepower, 2277);
assert.strictEqual(result.internalBattlepowerDelta, 2277);
assert.strictEqual(result.afterPower.value, Combat.calculateBattlePower(profile, 2277).value);
assert.strictEqual(result.battlepowerDelta, result.afterPower.value - result.beforePower.value);
assert.strictEqual(result.gears.length, 4);
assert.ok(result.gears.find((row) => row.slot === "head").internalBattlepowerDelta === 1035);
assert.ok(result.gears.find((row) => row.slot === "body").internalBattlepowerDelta === 1242);

console.log("OVERLOAD COMBAT TESTS PASSED");
