/* servers.js — 服务器档案（国际服 / 国服）与存档版本迁移
 *
 * R63（2026-10-26）口径更正：**关卡选择器统一按国际服官方表，不再按服截断。**
 *
 * 为什么收回分服截断：
 *   上一版据国服客户端 sd.bin 缓存判断「国服只有 33 章 / 基地上限 433」，
 *   但用户核实国服实际已开放到 40 章 —— 那份 sd.bin 是手机上的过期缓存快照，不能作依据。
 *   国际服进度最超前（48 章 / 各 1,787 关），统一按国际服表列全部关卡对所有服都安全；
 *   国服玩家只是还没打到那么远，选到自己实际进度即可。
 *
 * 于是两服的 chapters / max_chapter / normal_stages / base_cap 全部相同：
 *   49 章 / 普通 1,787 + 困难 1,787，普通从 2-12 起算 → 基地上限 **Lv712**
 *   （total = (1787-19) + 1787 + 1 = 3556 → floor(3556/5)+1 = 712；R61 曾误作 715）
 *
 * 「服务器」选择器保留，但只剩标注与登记作用（存档归属、每周重置日、装备经验保存比例），
 * 不影响可选关卡范围，也不再改变基地上限。公式本身在 outpost.js。
 */
(function (global) {
  "use strict";

  /* 当前页面能读懂的存档版本。云端若比这个大 → 拒绝下载（老页面读新数据必丢字段）。 */
  var SCHEMA = 2;

  /* 网络/文件读取失败时的兜底：宁可少一个档案，也不能让页面起不来 */
  var FALLBACK = {
    default: "intl",
    schema: SCHEMA,
    servers: [
      {
        key: "intl", name: "国际服", short: "国际服", chapters: 49, max_chapter: 48,
        normal_stages: 1787, hard_stages: 1787, base_cap: 712, income_scale: 1.0, weekly_reset_day: 1,
      },
      {
        /* R63：兜底档案也必须是 49 章 —— 否则 servers.json 读取失败时国服会被截到 33 章 */
        key: "cn", name: "国服", short: "国服", chapters: 49, max_chapter: 48,
        normal_stages: 1787, hard_stages: 1787, base_cap: 712, income_scale: 1.0, weekly_reset_day: 0,
      },
    ],
  };

  var DATA = null;
  var CUR = null;

  function load() {
    if (DATA) return Promise.resolve(DATA);
    return fetch("data/servers.json?v=20261026d").then(function (r) { return r.json(); }).then(function (d) {
      DATA = (d && d.servers && d.servers.length) ? d : FALLBACK;
      return DATA;
    }).catch(function () { DATA = FALLBACK; return DATA; });
  }
  function install(json) { DATA = (json && json.servers && json.servers.length) ? json : FALLBACK; return DATA; }
  function raw() { return DATA || FALLBACK; }

  /* 存档里可能写成 "国际服"/"国服"/"CN"/"cn"/空 → 统一成内部 key，未知值一律按国际服 */
  function normalizeKey(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    if (s === "cn" || s === "国服" || s === "china" || s === "tencent" || s === "tx") return "cn";
    if (s === "intl" || s === "国际服" || s === "global" || s === "en") return "intl";
    return "intl";
  }

  function list() { return raw().servers.slice(); }
  function keys() { return list().map(function (s) { return s.key; }); }

  function get(key) {
    var k = normalizeKey(key);
    var arr = list();
    for (var i = 0; i < arr.length; i++) if (arr[i].key === k) return arr[i];
    return arr[0];
  }

  function current() { return get(CUR || raw().default); }
  function setCurrent(key) { CUR = get(key).key; return current(); }

  /* 基地等级上限：优先按「两难度关数 / 5 + 1」现算（保证与 stage_map 实际数据一致），
     档案里的 base_cap 只作为读数异常时的兜底与人工核对值。 */
  function capOf(key) {
    var p = get(key);
    /* base_cap 是唯一真源（servers.json）。此处曾用 (normal_stages+hard_stages)/5+1 推导，
       那是 R61 的错误口径（把 2-12 解锁前的 18 关算了进去），会得 715；正解是 712 ——
       普通从 2-12 起算，推导过程见 outpost.js computeBaseLevel 注释，
       一致性由 test_server_split.js 交叉校验，不在这里重复实现公式。 */
    return Number(p.base_cap) || 712;
  }
  function cap() { return capOf(current().key); }

  /* 分服收益补正系数（R63b）。缺省/非法值一律按 1（= 直接用官方表原值）。
     只支持正数；0 或负数视为无效，防止把收益整体乘成 0。 */
  function incomeScaleOf(key) {
    var p = get(key);
    var v = Number(p && p.income_scale);
    return (isFinite(v) && v > 0) ? v : 1;
  }
  function incomeScale() { return incomeScaleOf(current().key); }
  function maxChapter(key) { var p = get(key); return Number(p.max_chapter); }

  /* ---------- 存档迁移 ----------
     v1（2026-10 之前）：纯表单对象，没有 _schema / server，字段全是国际服口径。
     v2：补 server + _schema。
     迁移原则：**只加字段、绝不删字段** —— 老存档里任何未来才会用到的键都原样保留，
     这样即使玩家先在新版存过、又用旧版打开，再回到新版也不会丢设置。 */
  function migrateForm(f) {
    if (!f || typeof f !== "object") return f;
    var from = Number(f._schema) || 1;
    if (!f.server) f.server = raw().default || "intl";   // v1 存档一律按国际服口径
    f.server = normalizeKey(f.server);
    if (from < SCHEMA) f._migratedFrom = from;            // 留痕，便于排查
    f._schema = SCHEMA;
    return f;
  }

  /* 去掉内部标记（导出分享码/上传云端前用不到，但保留也无害；这里只用于展示） */
  function describe(f) {
    if (!f || typeof f !== "object") return null;
    var p = get(f.server);
    return {
      schema: Number(f._schema) || 1,
      server: p.key,
      serverName: p.name,
      savedAt: f.saved_at || "",
      level: f.current || "",
      base: f.base || "",
    };
  }

  global.NikkeServers = {
    SCHEMA: SCHEMA,
    load: load,
    install: install,
    list: list,
    keys: keys,
    get: get,
    current: current,
    setCurrent: setCurrent,
    cap: cap,
    capOf: capOf,
    incomeScale: incomeScale,
    incomeScaleOf: incomeScaleOf,
    maxChapter: maxChapter,
    normalizeKey: normalizeKey,
    migrateForm: migrateForm,
    describe: describe,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.NikkeServers;
})(typeof window !== "undefined" ? window : globalThis);
