/* test_pinkuro_map.js — 阿卡官方接口（getUserInfo）→ 本页 state 的映射回归
 *
 *  跑法：node test_pinkuro_map.js
 *  夹具严格照官方文档 schema 与 2026-11-09 真实响应裁剪（不含任何 Key）。
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

/* 1. 载入 data.bundle.js（浏览器里挂 window） */
const bundlePath = path.join(__dirname, "combat_power_beta", "data", "data.bundle.js");
const sandbox = {};
new Function("window", fs.readFileSync(bundlePath, "utf8"))(sandbox);
const D = sandbox.NIKKE_POWER_DATA;
assert.ok(D && Array.isArray(D.roster) && D.roster.length > 100, "data.bundle.js 应含 roster");

/* 2. 载入映射模块（挂在 globalThis） */
require("./combat_power_beta/js/pinkuro.js");
const PK = globalThis.NikkePinkuro;
assert.ok(PK && typeof PK.mapBundle === "function", "pinkuro.js 应导出 mapBundle");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "  →  " + e.message); }
}

/* ---------- 夹具：官方 getUserInfo 响应 ---------- */
function stat(index, statNo, value, level) {
  return { index, statNo, statName: "", statShortName: "", statValue: value, statValueLevel: level };
}
function equip(slotNo, lv, stats) {
  return { slotNo, slotName: "", lv, statInfos: stats };
}
const FIXTURE = {
  success: true,
  message: "操作成功",
  data: {
    synchronizerLevel: 492,
    elysionCorp: 250, missilisCorp: 240, tetraCorp: 230, pilgrimCorp: 300, abnormalCorp: 120,
    fireType: 260, defenseType: 220, supportType: 240,
    characterList: [
      {
        characterName: "拉毗：小红帽",
        breakthroughLevel: 1,
        collectionRarity: "SR",
        collectionStars: 3,
        collectionLv: 15,
        skill1Lv: 10, skill2Lv: 10, ultiSkillLv: 10,
        equipmentInfos: [
          /* index 故意乱序：2/1/3 → 必须按 index 落回 1..3 号位 */
          equip(0, 5, [stat(2, 0, 2215, 10), stat(1, 3, 1463, 15), stat(3, 2, 6071, 9)]),
          equip(1, 5, [stat(1, 3, 1322, 13)]),
          equip(2, 4, [stat(1, 0, 1000, 3)]),
          equip(3, 0, [])            /* 鞋：lv 缺失场景另测 */
        ]
      },
      {
        characterName: "安克：天真的女仆",
        breakthroughLevel: 0,
        skill1Lv: 4, skill2Lv: 4, ultiSkillLv: 4,
        equipmentInfos: [equip(0, 0, []), equip(1, 0, []), equip(2, 0, []), equip(3, 0, [])]
      },
      {
        characterName: "不存在的角色XYZ",
        breakthroughLevel: 3, skill1Lv: 10, skill2Lv: 10, ultiSkillLv: 10,
        equipmentInfos: [equip(0, 5, [stat(1, 8, 1, 2)])]
      }
    ]
  }
};

const res = PK.mapBundle(FIXTURE, D);

t("① 整体识别与计数", () => {
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.report.total, 3);
  assert.strictEqual(res.report.matched, 2);
  assert.deepStrictEqual(res.report.missing, ["不存在的角色XYZ"]);
  assert.strictEqual(res.report.slotOk, 2, "前两条上报了 4 个部位（第三条只有 1 条装备）");
});

t("② 账号级字段（同步器 / 企业 / 职业）", () => {
  assert.strictEqual(res.account.level, 492);
  assert.strictEqual(res.account.corp[1], 250);
  assert.strictEqual(res.account.corp[4], 300);
  assert.strictEqual(res.account.corp[7], 120, "反常 5/6/7 同值");
  assert.strictEqual(res.account.cls[1], 260);
  assert.strictEqual(res.account.cls[3], 240);
});

t("③ 词条按 statNo 映射、按 index 落位", () => {
  const g = res.characters[0].gear;
  assert.strictEqual(g.head.lv, 5);
  assert.strictEqual(g.head.before[0].key, PK.STAT_NO_KEYS[3], "1 号位=攻击");
  assert.strictEqual(g.head.before[0].level, 15);
  assert.strictEqual(g.head.before[1].key, PK.STAT_NO_KEYS[0], "2 号位=优越");
  assert.strictEqual(g.head.before[1].level, 10);
  assert.strictEqual(g.head.before[2].key, PK.STAT_NO_KEYS[2], "3 号位=装弹");
  assert.strictEqual(g.head.before[2].level, 9);
  assert.strictEqual(g.body.before[0].key, PK.STAT_NO_KEYS[3]);
  assert.strictEqual(g.body.before[1].key, "", "没有词条的位置留空");
  assert.strictEqual(g.legs.lv, 0, "lv 缺失按 0 处理");
});

t("④ 突破 / 收藏 / 技能回填；无收藏品角色置空", () => {
  const a = res.characters[0].patch;
  assert.strictEqual(a.bt, 1);
  assert.strictEqual(a.coll, "SR");
  assert.strictEqual(a.collLv, 15);
  assert.deepStrictEqual([a.skill1, a.skill2, a.burst], [10, 10, 10]);
  const b = res.characters[1].patch;
  assert.strictEqual(b.coll, null, "接口不返回 collectionRarity = 没收藏品");
  assert.strictEqual(b.collLv, 0);
});

t("⑤ 好感度 / 魔方：接口不给就不覆盖（undefined）", () => {
  assert.strictEqual(res.characters[0].patch.attr, undefined);
  assert.strictEqual(res.characters[0].patch.cubeLv, undefined);
  assert.deepStrictEqual(res.report.provided, { attr: 0, cube: 0 });
});

t("⑥ 词条总阶数 = Σ档位 + 0.2×优越（含小数）", () => {
  /* 拉毗：攻击15 + 优越10 + 装弹9 + 攻击13 + 优越3 = 50 档，其中优越 13 档 */
  assert.strictEqual(res.characters[0].statTotalValue, Math.round((50 + 0.2 * 13) * 100) / 100);
});

t("⑦ 名字归一：全角/括号差异也能命中；命中给 rid", () => {
  assert.ok(res.characters[0].rid !== null, "拉毗：小红帽 应在角色表里");
  assert.strictEqual(res.characters[2].rid, null, "表里没有的角色 rid = null");
  const hit = PK.findRosterByName(D, "QUEEN(真)");
  assert.ok(hit, "半角括号也应对上「QUEEN（真）」");
});

t("⑧ 旧 cnData 结构已弃用 → 明确报错而不是静默空表", () => {
  const legacy = { success: true, data: { cnData: { userInfo: {}, characters: [] } } };
  const r2 = PK.mapBundle(legacy, D);
  assert.strictEqual(r2.ok, false);
  assert.ok(/无法识别/.test(r2.message));
});

t("⑨ success:false 透传服务端 message；空账号 ok 但 0 条", () => {
  const bad = PK.mapBundle({ success: false, message: "Key 无效" }, D);
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.message, "Key 无效");
  const empty = PK.mapBundle({ success: true, data: { characterList: [] } }, D);
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.report.total, 0);
});

t("⑩ 同件装备重复词条只保留一条；越界 statNo 丢弃", () => {
  const one = {
    success: true, data: {
      characterList: [{
        characterName: "拉毗：小红帽", breakthroughLevel: 0, skill1Lv: 1, skill2Lv: 1, ultiSkillLv: 1,
        equipmentInfos: [equip(0, 3, [stat(1, 3, 1, 12), stat(2, 3, 1, 9), stat(3, 99, 1, 5)])]
      }]
    }
  };
  const g = PK.mapBundle(one, D).characters[0].gear.head;
  assert.strictEqual(g.before[0].key, PK.STAT_NO_KEYS[3]);
  assert.strictEqual(g.before[1].key, "", "重复的攻击词条应丢弃");
  assert.strictEqual(g.before[2].key, "", "越界 statNo 应丢弃");
});

/* ---------- 源码级守护 ---------- */
/* 只查代码，不查注释：旧接口名会作为「已弃用」说明留在注释里 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
t("⑪ 前端已改官方接口，不再残留旧通道", () => {
  const app = stripComments(fs.readFileSync(path.join(__dirname, "combat_power_beta", "js", "app.js"), "utf8"));
  const html = fs.readFileSync(path.join(__dirname, "combat_power_beta", "index.html"), "utf8");
  const map = fs.readFileSync(path.join(__dirname, "combat_power_beta", "js", "pinkuro.js"), "utf8");
  assert.ok(/third\/bot\/nikke\/v1\/getUserInfo/.test(map), "映射层要指向官方 getUserInfo");
  assert.ok(app.indexOf("/api/nikke/public/combat/import") === -1, "app.js 不应再引用旧 import 接口");
  assert.ok(app.indexOf("/api/pinkuro/import") === -1, "app.js 不应再引用本机 /api/pinkuro/import");
  assert.ok(app.indexOf("127.0.0.1:8785") === -1, "app.js 不应再引用本机代理");
  assert.ok(/PK\.API_URL/.test(app), "导入应走映射层暴露的 API_URL");
  assert.ok(html.indexOf("pk-relay") === -1, "中转地址输入行应已从页面移除");
  assert.ok(/function pkPull/.test(app), "导入入口仍在");
});

/* ---------- 补录角色（国服安卓客户端取数） ---------- */
t("⑫ roster 已补录国服新角色：婴宁 8004 / 画皮 8005", () => {
  const a = D.roster.find((r) => r.rid === 8004);
  const b = D.roster.find((r) => r.rid === 8005);
  assert.ok(a && b, "两条补录都要在 roster 里");
  assert.strictEqual(a.name, "婴宁");
  assert.strictEqual(a.enh, 5305, "婴宁 Stat_enhance_id 取自国服 CharacterTable");
  assert.strictEqual(a.cls, 3, "辅助型");
  assert.strictEqual(a.weapon, 2, "RL");
  assert.strictEqual(b.name, "画皮");
  assert.strictEqual(b.enh, 5101, "画皮 Stat_enhance_id 取自国服 CharacterTable");
  assert.strictEqual(b.cls, 1, "火力型");
  assert.strictEqual(b.weapon, 1, "AR");
  /* 名字 / 拼音两条路径都要能命中，否则导入仍会被算成「角色表缺」 */
  assert.strictEqual(PK.findRosterByName(D, "婴宁").rid, 8004);
  assert.strictEqual(PK.findRosterByName(D, "画皮").rid, 8005);
  assert.strictEqual(PK.findRosterByName(D, "yingning").rid, 8004);
  assert.strictEqual(PK.findRosterByName(D, "huapi").rid, 8005);
  /* 曲线与强化系数必须真的存在，否则面板推不出来 */
  assert.ok(D.curves["5305"] && D.enhance["5305"], "婴宁的强化组要有曲线");
  assert.ok(D.curves["5101"] && D.enhance["5101"], "画皮的强化组要有曲线");
});

t("⑬ 含新角色的响应能被完整映射（不再计入缺失）", () => {
  const raw = {
    success: true,
    data: {
      synchronizerLevel: 400,
      characterList: [
        { characterName: "婴宁", breakthroughLevel: 6, collectionRarity: "SR", collectionLv: 15, skill1Lv: 10, skill2Lv: 10, ultiSkillLv: 10,
          equipmentInfos: [equip(0, 5, [stat(1, 3, 1, 15)])] },
        { characterName: "画皮", breakthroughLevel: 0, skill1Lv: 1, skill2Lv: 1, ultiSkillLv: 1,
          equipmentInfos: [equip(0, 0, [])] }
      ]
    }
  };
  const r = PK.mapBundle(raw, D);
  assert.strictEqual(r.report.matched, 2);
  assert.deepStrictEqual(r.report.missing, []);
  assert.strictEqual(r.characters[0].rid, 8004);
  assert.strictEqual(r.characters[1].rid, 8005);
});

console.log("\n===== test_pinkuro_map: PASS=" + pass + "  FAIL=" + fail + " =====");process.exit(fail ? 1 : 0);
