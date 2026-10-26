(function () {
  "use strict";
  var KEY = "nikke_overload_combat_v1";
  var SLOTS = [["head", "头"], ["body", "甲"], ["arms", "手"], ["legs", "鞋"]];
  var SLOT_COUNT = 3;
  var state = { data: null, config: null, result: null, pending: null, searchIndex: -1 };
  var ACCOUNT_FIELDS = ["syncLevel", "hostBaseRecycleLv", "elysionCorp", "missilisCorp", "tetraCorp", "pilgrimCorp", "abnormalCorp", "fireType", "defenseType", "supportType", "publicSummary", "pinkuroFetchedAt"];
  var ACCOUNT_PATHS = {
    syncLevel: ["synchronizerLevel"], hostBaseRecycleLv: ["host", "baseRecycleLv"],
    elysionCorp: ["host", "corporation", "elysionCorp"], missilisCorp: ["host", "corporation", "missilisCorp"],
    tetraCorp: ["host", "corporation", "tetraCorp"], pilgrimCorp: ["host", "corporation", "pilgrimCorp"], abnormalCorp: ["host", "corporation", "abnormalCorp"],
    fireType: ["host", "type", "fireType"], defenseType: ["host", "type", "defenseType"], supportType: ["host", "type", "supportType"],
    publicSummary: ["publicSummary"], pinkuroFetchedAt: ["pinkuroFetchedAt"]
  };
  var NIKKE_FIELDS = ["character", "starLevel", "affectionLevel", "skill1Level", "skill2Level", "burstLevel", "favoriteItem", "favoriteLevel", "cubeType", "cubeLevel"];
  var FORMULA_FIELDS = ["attack", "hp", "defense", "criticalRatePercent", "criticalDamagePercent", "extraStateEffectBattlepower"];

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]; }); }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value) { return Number(value || 0).toLocaleString("zh-CN"); }
  function valueText(row) { return row.level ? (number(row.functionValue) / 100).toFixed(2) + "%" : "—"; }
  function deltaText(value) { return (value > 0 ? "+" : "") + fmt(value); }
  function blankOptions() { return [{ type: "", level: 0 }, { type: "", level: 0 }, { type: "", level: 0 }]; }
  function blankGears() { var gears = {}; SLOTS.forEach(function (entry) { gears[entry[0]] = blankOptions(); }); return gears; }
  function blankLevels() { var levels = {}; SLOTS.forEach(function (entry) { levels[entry[0]] = ""; }); return levels; }

  function defaults() {
    return {
      schemaVersion: 2,
      account: { synchronizerLevel: "", host: { baseRecycleLv: "", corporation: { elysionCorp: "", missilisCorp: "", tetraCorp: "", pilgrimCorp: "", abnormalCorp: "" }, type: { fireType: "", defenseType: "", supportType: "" } }, publicSummary: "", pinkuroFetchedAt: "" },
      nikke: { character: "", starLevel: "", affectionLevel: "", skill1Level: "", skill2Level: "", burstLevel: "", favoriteItem: "", favoriteLevel: "", cubeType: "", cubeLevel: "" },
      formulas: { attack: "", hp: "", defense: "", criticalRatePercent: "", criticalDamagePercent: "", extraStateEffectBattlepower: "" },
      equipmentLevels: { before: blankLevels(), after: blankLevels() },
      before: blankGears(), after: blankGears(),
      provenance: { account: "local", nikke: "local", pinkuroFetchedAt: "" },
    };
  }

  function normaliseConfig(raw) {
    var base = defaults();
    var source = raw && raw.config ? raw.config : (raw || {});
    var account = source.account || {}, nikke = source.nikke || {}, formulas = source.formulas || {};
    var oldHost = account.hostLevel !== undefined ? account.hostLevel : source.hostLevel;
    var oldSync = account.syncLevel !== undefined ? account.syncLevel : source.syncLevel;
    if (oldSync !== undefined && oldSync !== null) base.account.synchronizerLevel = String(oldSync);
    if (oldHost !== undefined && oldHost !== null) base.account.host.baseRecycleLv = String(oldHost);
    ACCOUNT_FIELDS.forEach(function (id) { var path = ACCOUNT_PATHS[id], value = path.reduce(function (obj, key) { return obj == null ? undefined : obj[key]; }, account); if (id === "syncLevel") value = account.synchronizerLevel !== undefined ? account.synchronizerLevel : value; if (value === undefined || value === null) value = source[id]; if (value !== undefined && value !== null) { var target = base.account, keys = ACCOUNT_PATHS[id]; if (id === "syncLevel") base.account.synchronizerLevel = String(value); else { for (var i = 0; i < keys.length - 1; i++) target = target[keys[i]]; target[keys[keys.length - 1]] = String(value); } } });
    NIKKE_FIELDS.forEach(function (id) { var v = nikke[id] !== undefined ? nikke[id] : source[id]; if (v !== undefined && v !== null) base.nikke[id] = String(v); });
    FORMULA_FIELDS.forEach(function (id) { var v = formulas[id] !== undefined ? formulas[id] : source[id]; if (v !== undefined && v !== null) base.formulas[id] = String(v); });
    if (source.provenance) base.provenance = { account: String(source.provenance.account || "local"), nikke: String(source.provenance.nikke || "local"), pinkuroFetchedAt: String(source.provenance.pinkuroFetchedAt || "") };
    ["before", "after"].forEach(function (side) {
      SLOTS.forEach(function (entry) {
        var rows = source[side] && source[side][entry[0]];
        if (Array.isArray(rows)) base[side][entry[0]] = rows.slice(0, SLOT_COUNT).map(function (row) {
          var level = Math.max(0, Math.min(15, Math.trunc(number(row && row.level))));
          var type = row && typeof row.type === "string" ? row.type : "";
          return level > 0 && type ? { type: type, level: level } : { type: "", level: 0 };
        });
        while (base[side][entry[0]].length < SLOT_COUNT) base[side][entry[0]].push({ type: "", level: 0 });
        var levelValue = source.equipmentLevels && source.equipmentLevels[side] && source.equipmentLevels[side][entry[0]];
        if (levelValue !== undefined && levelValue !== null) base.equipmentLevels[side][entry[0]] = String(levelValue);
      });
    });
    return base;
  }

  function readConfig() { try { return normaliseConfig(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (_) { return defaults(); } }
  function collectFields() {
    ACCOUNT_FIELDS.forEach(function (id) { if ($(id)) setAccountField(id, $(id).value); });
    NIKKE_FIELDS.forEach(function (id) { if ($(id)) state.config.nikke[id] = $(id).value; });
    FORMULA_FIELDS.forEach(function (id) { if ($(id)) state.config.formulas[id] = $(id).value; });
  }
  function collectGearFields() {
    SLOTS.forEach(function (entry) {
      var card = $("equipmentGrid").querySelector('[data-slot="' + entry[0] + '"]');
      ["before", "after"].forEach(function (side) {
        var levelInput = card.querySelector('input[data-gear-level="' + side + '"]');
        state.config.equipmentLevels[side][entry[0]] = levelInput ? levelInput.value : "";
        state.config[side][entry[0]] = [0, 1, 2].map(function (index) {
          var select = card.querySelector('select[data-side="' + side + '"][data-index="' + index + '"]');
          var input = card.querySelector('input[data-side="' + side + '"][data-index="' + index + '"]');
          var level = Math.max(0, Math.min(15, Math.trunc(number(input && input.value))));
          return !select || !select.value || level === 0 ? { type: "", level: 0 } : { type: select.value, level: level };
        });
      });
    });
  }
  function saveConfig(show) { collectFields(); collectGearFields(); localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 2, savedAt: new Date().toISOString(), config: state.config })); if (show) setStatus("已保存到本机", false); }
  function loadConfig(show) { try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved && saved.config) state.config = normaliseConfig(saved.config); renderAll(); if (show) setStatus("已读取本机配置", false); } catch (_) { setStatus("读取失败", true); } }
  function setStatus(text, invalid) { $("calcStatus").textContent = text; $("calcStatus").classList.toggle("invalid", !!invalid); }
  function setNotice(text, kind) { $("sourceNotice").textContent = text; $("sourceNotice").className = "notice" + (kind ? " " + kind : ""); }
  var toastTimer;
  function showToast(text, kind) { var box = $("toast"); if (!box) return; box.textContent = text; box.className = "toast" + (kind ? " " + kind : ""); box.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { box.hidden = true; }, 4200); }
  function accountValue(id) { var path = ACCOUNT_PATHS[id] || [id], value = state.config.account; if (id === "syncLevel") return value.synchronizerLevel; return path.reduce(function (obj, key) { return obj == null ? undefined : obj[key]; }, value); }
  function setAccountField(id, value) { var path = ACCOUNT_PATHS[id] || [id], target = state.config.account; if (id === "syncLevel") { target.synchronizerLevel = value == null ? "" : String(value); return; } for (var i = 0; i < path.length - 1; i++) target = target[path[i]]; target[path[path.length - 1]] = value == null ? "" : String(value); }

  function profile() {
    collectFields();
    return { config: state.data.config, attack: state.config.formulas.attack, defense: state.config.formulas.defense, hp: state.config.formulas.hp, criticalRatePercent: state.config.formulas.criticalRatePercent, criticalDamagePercent: state.config.formulas.criticalDamagePercent, skill1Level: state.config.nikke.skill1Level, skill2Level: state.config.nikke.skill2Level, burstLevel: state.config.nikke.burstLevel, extraStateEffectBattlepower: state.config.formulas.extraStateEffectBattlepower };
  }
  function assessment(profileValue) { return NikkeOverloadCombat.assessProfile(profileValue); }
  function typeOptions(selected) {
    var html = '<option value="">空（无词条）</option>';
    state.data.optionGroups.forEach(function (group) { html += '<option value="' + esc(group.descriptionLocalkey) + '"' + (selected === group.descriptionLocalkey ? " selected" : "") + '>' + esc(group.displayName) + '</option>'; });
    return html;
  }
  function renderGearCard(slot, label) {
    var before = state.config.before[slot], after = state.config.after[slot];
    var html = '<article class="gear-card" data-slot="' + slot + '"><h3>' + label + '</h3><div class="gear-meta">装备等级</div>';
    html += '<div class="option-actions"><label>洗前<input data-gear-level="before" type="number" min="0" max="5" step="1" value="' + esc(state.config.equipmentLevels.before[slot]) + '"></label><label>洗后<input data-gear-level="after" type="number" min="0" max="5" step="1" value="' + esc(state.config.equipmentLevels.after[slot]) + '"></label></div>';
    html += '<div class="compare-head"><span>词条位置</span><b>洗前 / 洗后</b></div>';
    for (var i = 0; i < SLOT_COUNT; i++) {
      var b = before[i] || { type: "", level: 0 }, a = after[i] || { type: "", level: 0 };
      html += '<div class="option-row" data-index="' + i + '"><div class="compare-head"><span>词条 ' + (i + 1) + '</span></div>';
      html += '<div class="option-actions"><select data-side="before" data-index="' + i + '">' + typeOptions(b.type) + '</select><input data-side="before" data-index="' + i + '" type="number" min="0" max="15" step="1" value="' + (b.level || 0) + '" aria-label="洗前阶数"></div>';
      html += '<div class="option-actions"><select data-side="after" data-index="' + i + '">' + typeOptions(a.type) + '</select><input data-side="after" data-index="' + i + '" type="number" min="0" max="15" step="1" value="' + (a.level || 0) + '" aria-label="洗后阶数"></div>';
      html += '<div class="option-value" data-value="' + i + '"><span>—</span><span>—</span><span class="delta">—</span></div></div>';
    }
    return html + '<div class="gear-total"><span>装备战力变化</span><strong data-gear-delta>0</strong></div></article>';
  }
  function renderGears() { $("equipmentGrid").innerHTML = SLOTS.map(function (entry) { return renderGearCard(entry[0], entry[1]); }).join(""); }
  function characterLabel(id) { var item = (state.data.characters || []).find(function (row) { return row.name === id; }); return item ? item.cnName + "（" + item.name + "）" : id; }
  function renderCharacterInput() { $("character").value = state.config.nikke.character; $("characterSearch").value = state.config.nikke.character ? characterLabel(state.config.nikke.character) : ""; }
  function renderAll() {
    var c = state.config;
    ACCOUNT_FIELDS.forEach(function (id) { if ($(id)) $(id).value = accountValue(id) || ""; });
    NIKKE_FIELDS.forEach(function (id) { if ($(id) && id !== "character") $(id).value = c.nikke[id] || ""; });
    FORMULA_FIELDS.forEach(function (id) { if ($(id)) $(id).value = c.formulas[id] || ""; });
    renderCharacterInput(); renderGears(); bindGearEvents(); updateSources(); calculate();
  }
  function bindGearEvents() { $("equipmentGrid").querySelectorAll("select,input").forEach(function (el) { el.addEventListener("change", updateFromUI); el.addEventListener("input", updateFromUI); }); }
  function updateFromUI() { collectFields(); collectGearFields(); calculate(); saveConfig(false); }
  function renderRowValues() {
    var result = state.result;
    SLOTS.forEach(function (entry) {
      var card = $("equipmentGrid").querySelector('[data-slot="' + entry[0] + '"]');
      result.before.gears[entry[0]].rows.forEach(function (b, i) {
        var a = result.after.gears[entry[0]].rows[i], line = card.querySelector('.option-row[data-index="' + i + '"]'), value = line.querySelector('[data-value]');
        value.children[0].textContent = "洗前 " + b.displayName + " " + valueText(b) + "（参数 " + fmt(b.functionBattlepower) + "）";
        value.children[1].textContent = "洗后 " + a.displayName + " " + valueText(a) + "（参数 " + fmt(a.functionBattlepower) + "）";
        var delta = a.functionBattlepower - b.functionBattlepower;
        value.children[2].textContent = "参数变化 " + deltaText(delta); value.children[2].classList.toggle("negative", delta < 0);
        line.hidden = $("onlyChanged").checked && delta === 0;
      });
      var gear = result.gears.find(function (row) { return row.slot === entry[0]; });
      card.querySelector("[data-gear-delta]").textContent = deltaText(gear.battlepowerDelta) + "（参数 " + deltaText(gear.internalBattlepowerDelta) + "）";
    });
  }
  function calculate() {
    collectFields(); collectGearFields();
    try {
      var p = profile(), status = assessment(p);
      state.result = NikkeOverloadCombat.calculate(state.data, p, state.config.before, state.config.after);
      var exact = status.mode === "exact";
      $("beforePower").textContent = exact ? fmt(state.result.beforePower.value) : "—";
      $("afterPower").textContent = exact ? fmt(state.result.afterPower.value) : "—";
      $("powerDelta").textContent = exact ? deltaText(state.result.battlepowerDelta) : (status.mode === "partial" ? "部分精确" : "无法精确计算");
      $("powerDelta").classList.toggle("negative", exact && state.result.battlepowerDelta < 0);
      $("internalDelta").textContent = deltaText(state.result.internalBattlepowerDelta); renderRowValues();
      var missing = status.missingVisible.concat(status.missingSkills, status.missingHidden);
      setStatus(exact ? "精确战力：客户端公式所需属性已齐全" : (status.mode === "partial" ? "部分精确：缺少 " + missing.join("、") + "，仅展示可确认差值" : "无法精确计算：缺少 " + missing.join("、")), !exact);
      renderDetails(state.result, status);
    } catch (error) { setStatus(error.message, true); }
  }
  function renderDetails(result, status) {
    var detail = $("detailContent"), formulaSource = state.data.sources && state.data.sources.formulaSource;
    detail.innerHTML = '<p>数据版本：<code>' + esc(state.data.generatedAt) + '</code>；词条/公式来源等级：<code>A</code>；角色目录来源等级：<code>' + esc(state.data.sourceLevels.characterCatalog) + '</code>。</p>' + (formulaSource ? '<p>公式证据 SHA-256：<code>' + esc(formulaSource.sha256) + '</code>。</p>' : '') + '<p>当前计算状态：<code>' + esc(status.mode) + '</code>；Pinkuro 只导入已确认的账号、妮姬和装备基础字段，不覆盖未返回的逐条词条明细。</p><p>客户端公式：<code>round((num3 + num4) × num5 × 0.01)</code>；<code>num5</code> 包含装备词条 FunctionBattlepower × 0.0001。</p><p>词条参数：洗前 <code>' + fmt(result.before.internalBattlepower) + '</code> → 洗后 <code>' + fmt(result.after.internalBattlepower) + '</code>。</p><table><thead><tr><th>装备</th><th>内部参数变化</th><th>战力归因</th></tr></thead><tbody>' + result.gears.map(function (row) { return '<tr><td>' + esc(({ head: "头", body: "甲", arms: "手", legs: "鞋" })[row.slot]) + '</td><td>' + deltaText(row.internalBattlepowerDelta) + '</td><td>' + (status.mode === "exact" ? deltaText(row.battlepowerDelta) : "—") + '</td></tr>'; }).join("") + '</tbody></table>';
  }
  function updateSources() { $("accountSource").textContent = state.config.provenance.account === "pinkuro" ? "Pinkuro 已同步" : "本地输入"; $("nikkeSource").textContent = state.config.provenance.nikke === "pinkuro" ? "Pinkuro 已同步" : "本地输入"; }

  function searchable(item, query) { var haystack = [item.cnName, item.name, item.aliases, item.url].join(" ").toLowerCase(); return haystack.indexOf(query.toLowerCase()) >= 0; }
  function renderSuggestions(query) {
    var root = $("characterSuggestions"), list = query ? (state.data.characters || []).filter(function (item) { return searchable(item, query); }).slice(0, 20) : [];
    root.innerHTML = list.map(function (item, index) { return '<button type="button" class="suggestion' + (index === state.searchIndex ? ' active' : '') + '" data-character="' + esc(item.name) + '">' + esc(item.cnName) + '（' + esc(item.name) + '）<small>' + esc(item.manufacturer || "") + ' · 爆裂 ' + esc(item.burst || "") + '</small></button>'; }).join("");
    root.hidden = !list.length; root.querySelectorAll("button").forEach(function (button) { button.addEventListener("click", function () { selectCharacter(button.dataset.character); }); });
  }
  function selectCharacter(id) { collectFields(); state.config.nikke.character = id; state.searchIndex = -1; $("characterSuggestions").hidden = true; renderCharacterInput(); saveConfig(false); updateSources(); }
  function searchInput(event) { var query = event.target.value.trim(); state.searchIndex = -1; renderSuggestions(query); }
  function searchKeydown(event) { var buttons = $("characterSuggestions").querySelectorAll("button"); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!buttons.length) return; state.searchIndex = (state.searchIndex + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length; buttons.forEach(function (button, index) { button.classList.toggle("active", index === state.searchIndex); }); } else if (event.key === "Enter" && state.searchIndex >= 0 && buttons[state.searchIndex]) { event.preventDefault(); selectCharacter(buttons[state.searchIndex].dataset.character); } else if (event.key === "Escape") { $("characterSuggestions").hidden = true; } }

  function parsePinkuroKey(raw) { var value = String(raw || "").trim(); try { if (/^https?:\/\//i.test(value)) return new URL(value).searchParams.get("k") || ""; } catch (_) {} return value; }
  function defined(value) { return value !== undefined && value !== null && value !== ""; }
  function remoteCharacter(item) {
    var result = { character: item.characterName }, source = item.userCharacter || item;
    [["starLevel", "breakthroughLevel"], ["favoriteItem", "collectionRarity"], ["favoriteLevel", "collectionLv"], ["skill1Level", "skill1Lv"], ["skill2Level", "skill2Lv"], ["burstLevel", "ultiSkillLv"], ["affectionLevel", "attractiveLv"], ["cubeLevel", "cubeLv"]].forEach(function (pair) { if (defined(source[pair[1]])) result[pair[0]] = source[pair[1]]; });
    result.statTotalValue = defined(item.statTotalValue) ? item.statTotalValue : null; result.equipmentLevels = { before: {}, after: {} };
    [["head", "headEquipmentLv"], ["body", "torsoEquipmentLv"], ["arms", "armEquipmentLv"], ["legs", "legEquipmentLv"]].forEach(function (pair) { if (defined(item[pair[1]])) { result.equipmentLevels.before[pair[0]] = item[pair[1]]; result.equipmentLevels.after[pair[0]] = item[pair[1]]; } });
    return result;
  }
  function normalisePinkuro(payload) {
    var root = payload && payload.data && payload.data.cnData ? payload.data.cnData : (payload && payload.data ? payload.data : {}), info = root.userInfo || {}, items = Array.isArray(root.characters) ? root.characters : [];
    var publicId = defined(info.userQQId) ? String(info.userQQId) : (defined(info.id) ? String(info.id) : null);
    var account = {
      synchronizerLevel: defined(info.synchronizerLevel) ? info.synchronizerLevel : null,
      host: { baseRecycleLv: defined(info.baseRecycleLv) ? info.baseRecycleLv : null, corporation: {}, type: {} },
      publicSummary: publicId ? "账号 " + publicId.slice(0, 3) + "****" + publicId.slice(-2) : null
    };
    ["elysionCorp", "missilisCorp", "tetraCorp", "pilgrimCorp", "abnormalCorp"].forEach(function (key) { if (defined(info[key])) account.host.corporation[key] = info[key]; });
    ["fireType", "defenseType", "supportType"].forEach(function (key) { if (defined(info[key])) account.host.type[key] = info[key]; });
    return {
      fetchedAt: new Date().toISOString(),
      account: account,
      characters: items.map(remoteCharacter).filter(function (item) { return defined(item.character); })
    };
  }
  function remoteValue(path, remote) { var parts = path.split("."), value = remote; parts.forEach(function (part) { value = value && value[part]; }); return value; }
  function localValue(path) { var parts = path.split("."), value = state.config; parts.forEach(function (part) { value = value && value[part]; }); return value; }
  function displayValue(value) { return defined(value) ? String(value) : "未填写"; }
  function compare(local, remote) { if (!defined(remote)) return "未返回"; if (!defined(local)) return "仅 Pinkuro"; if (String(local) === String(remote)) return "相同"; if (Number.isFinite(Number(local)) && Number.isFinite(Number(remote))) return Number(local) > Number(remote) ? "本地较高" : "Pinkuro 较高"; return "不一致"; }
  function selectedRemoteCharacter() { if (!state.pending) return null; var index = Number($("pinkuroCharacter").value); return state.pending.characters[index] || null; }
  function remoteFields(remote) {
    var rows = [
      ["account.synchronizerLevel", "账号基本属性", "同步器等级", state.pending.account.synchronizerLevel],
      ["account.host.baseRecycleLv", "账号基本属性", "主机基础等级", state.pending.account.host.baseRecycleLv],
      ["account.host.corporation.elysionCorp", "账号基本属性", "伊莱格企业等级", state.pending.account.host.corporation.elysionCorp],
      ["account.host.corporation.missilisCorp", "账号基本属性", "米西利斯企业等级", state.pending.account.host.corporation.missilisCorp],
      ["account.host.corporation.tetraCorp", "账号基本属性", "泰特拉企业等级", state.pending.account.host.corporation.tetraCorp],
      ["account.host.corporation.pilgrimCorp", "账号基本属性", "朝圣者企业等级", state.pending.account.host.corporation.pilgrimCorp],
      ["account.host.corporation.abnormalCorp", "账号基本属性", "异常企业等级", state.pending.account.host.corporation.abnormalCorp],
      ["account.host.type.fireType", "账号基本属性", "火力型等级", state.pending.account.host.type.fireType],
      ["account.host.type.defenseType", "账号基本属性", "防御型等级", state.pending.account.host.type.defenseType],
      ["account.host.type.supportType", "账号基本属性", "辅助型等级", state.pending.account.host.type.supportType],
      ["account.publicSummary", "账号基本属性", "账号公开标识摘要", state.pending.account.publicSummary],
      ["nikke.character", "妮姬基本属性", "当前妮姬", remote && remote.character], ["nikke.starLevel", "妮姬基本属性", "星级", remote && remote.starLevel], ["nikke.affectionLevel", "妮姬基本属性", "好感度", remote && remote.affectionLevel], ["nikke.skill1Level", "妮姬基本属性", "技能 1", remote && remote.skill1Level], ["nikke.skill2Level", "妮姬基本属性", "技能 2", remote && remote.skill2Level], ["nikke.burstLevel", "妮姬基本属性", "爆裂技能", remote && remote.burstLevel], ["nikke.favoriteItem", "妮姬基本属性", "收藏品类型", remote && remote.favoriteItem], ["nikke.favoriteLevel", "妮姬基本属性", "收藏品等级", remote && remote.favoriteLevel], ["nikke.cubeLevel", "妮姬基本属性", "魔方等级", remote && remote.cubeLevel]
    ];
    SLOTS.forEach(function (entry) { rows.push(["equipment." + entry[0] + ".level", "装备情况", entry[1] + "装备等级", remote && remote.equipmentLevels && remote.equipmentLevels.before[entry[0]]]); });
    return rows.filter(function (row) { return defined(row[3]); }).map(function (row) { var path = row[0], localPath = path.indexOf("account.synchronizerLevel") === 0 ? "account.synchronizerLevel" : path; if (path.indexOf("equipment.") === 0) localPath = "equipmentLevels.before." + path.split(".")[1]; return { path: path, localPath: localPath, block: row[1], label: row[2], remote: row[3], local: localValue(localPath), status: compare(localValue(localPath), row[3]) }; });
  }
  function renderRemoteSelector() { $("pinkuroCharacter").innerHTML = state.pending.characters.map(function (item, index) { return '<option value="' + index + '">' + esc(characterLabel(item.character)) + '</option>'; }).join(""); if (state.config.nikke.character) { var index = state.pending.characters.findIndex(function (item) { return item.character === state.config.nikke.character; }); if (index >= 0) $("pinkuroCharacter").value = String(index); } renderSyncRows(); }
  function renderSyncRows() {
    var remote = selectedRemoteCharacter(), rows = remoteFields(remote), conflicts = rows.filter(function (row) { return row.status === "本地较高" || row.status === "不一致"; });
    var groups = {}; rows.forEach(function (row) { (groups[row.block] || (groups[row.block] = [])).push(row); });
    $("pinkuroRows").innerHTML = Object.keys(groups).map(function (block) { return '<section class="sync-group"><h4>' + esc(block) + '</h4>' + groups[block].map(function (row) { var conflict = row.status === "本地较高" || row.status === "不一致"; return '<div class="sync-row ' + (row.status === "相同" ? "same" : conflict ? "conflict" : "") + '" data-status="' + esc(row.status) + '"><input class="sync-choice" type="checkbox" data-path="' + esc(row.path) + '"' + (row.status !== "相同" ? ' checked' : '') + '><span class="sync-label">' + esc(row.label) + '</span><span class="sync-local">本地：' + esc(displayValue(row.local)) + '</span><span class="sync-remote">Pinkuro：' + esc(displayValue(row.remote)) + '</span><span class="sync-state">' + esc(row.status) + '</span></div>'; }).join("") + '</section>'; }).join("");
    $("pinkuroWarning").hidden = !conflicts.length; $("pinkuroWarning").textContent = conflicts.length ? "本地存在较高或不一致的值，请逐项选择是否使用 Pinkuro；较低远程值不会自动覆盖本地。" : "";
    var total = rows.filter(function (row) { return row.status !== "相同"; }).length; $("pinkuroStatus").textContent = total ? "发现 " + total + " 项可同步数据" : "没有需要同步的差异";
    var stat = remote && remote.statTotalValue !== null ? "；接口词条总阶数 " + remote.statTotalValue + "（未返回逐条词条明细，不覆盖本地明细）" : ""; $("pinkuroMeta").textContent = "读取时间：" + state.pending.fetchedAt + "；角色数：" + state.pending.characters.length + stat;
    if ($("onlyConflicts").checked) $("pinkuroRows").querySelectorAll('.sync-row[data-status="相同"]').forEach(function (row) { row.hidden = true; });
  }
  async function importPinkuro() {
    var key = parsePinkuroKey($("pinkuroKey").value); if (!key) { setNotice("请填写 Pinkuro Key 或包含 k 参数的公开链接。", "error"); return; }
    try {
      setNotice("正在读取 Pinkuro；Key 只用于当前请求，不会保存或写入导出文件。", "");
      var response = await fetch("/api/pinkuro/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key }) });
      var payload = await response.json(); if (!response.ok || !payload.success) throw new Error(payload.message || "Pinkuro 导入失败");
      state.pending = normalisePinkuro(payload); if (!state.pending.characters.length) throw new Error("Pinkuro 没有返回可用的妮姬数据");
      renderRemoteSelector(); $("pinkuroPanel").hidden = false; var rows = remoteFields(selectedRemoteCharacter()), differences = rows.filter(function (row) { return row.status !== "相同"; });
      setNotice("Pinkuro 数据已读取，请在设置内确认同步项。", ""); if (differences.length) showToast("检测到 " + differences.length + " 项数据与 Pinkuro 不一致，请在设置中选择同步。", "");
    } catch (error) { var message = error.message.indexOf("Failed to fetch") >= 0 ? "Pinkuro 读取失败：请使用项目提供的 pinkuro_server.py 启动本地代理。" : error.message; setNotice(message, "error"); showToast(message, "error"); }
  }
  function setPath(path, value) {
    if (path.indexOf("equipment.") === 0 || path.indexOf("equipmentLevels.before.") === 0) { var slot = path.indexOf("equipment.") === 0 ? path.split(".")[1] : path.split(".")[2], level = String(value); state.config.equipmentLevels.before[slot] = level; state.config.equipmentLevels.after[slot] = level; return; }
    var parts = path.split("."), target = state.config; for (var i = 0; i < parts.length - 1; i++) { if (!target[parts[i]]) target[parts[i]] = {}; target = target[parts[i]]; } target[parts[parts.length - 1]] = String(value);
  }
  function applyPinkuro() { var count = 0; $("pinkuroRows").querySelectorAll(".sync-choice:checked").forEach(function (box) { var row = remoteFields(selectedRemoteCharacter()).find(function (item) { return item.path === box.dataset.path; }); if (row) { setPath(row.localPath, row.remote); count += 1; } }); state.config.provenance.account = "pinkuro"; state.config.provenance.nikke = "pinkuro"; state.config.provenance.pinkuroFetchedAt = state.pending.fetchedAt; state.config.account.pinkuroFetchedAt = state.pending.fetchedAt; renderAll(); saveConfig(false); $("pinkuroPanel").hidden = true; $("settingsDrawer").hidden = true; setNotice("已同步 " + count + " 项 Pinkuro 数据；未返回的装备词条明细保持本地值。", ""); }
  function exportPayload() { collectFields(); collectGearFields(); return { schemaVersion: 2, dataVersion: state.data.generatedAt, sourceLevels: state.data.sourceLevels, sources: state.data.sources, validation: { staticMapping: "passed", controlledRuntimeDiff: "not_run" }, config: state.config }; }
  function exportConfig() { var blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" }); var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "NIKKE洗练战力配置.json"; a.click(); URL.revokeObjectURL(a.href); }
  function copyConfig() { navigator.clipboard.writeText(JSON.stringify(exportPayload(), null, 2)).then(function () { setStatus("配置已复制", false); }).catch(function () { setStatus("复制失败，请使用导出", true); }); }
  function importConfig(file) { var reader = new FileReader(); reader.onload = function () { try { state.config = normaliseConfig(JSON.parse(String(reader.result || "{}"))); saveConfig(false); renderAll(); setStatus("已导入配置（Key 等未支持字段已过滤）", false); } catch (error) { setStatus("导入失败：" + error.message, true); } }; reader.onerror = function () { setStatus("导入失败：无法读取文件", true); }; reader.readAsText(file, "utf-8"); }

  function init() {
    state.config = readConfig();
    fetch("data/overload_combat_data.json", { cache: "no-store" }).then(function (res) { return res.json(); }).then(function (data) {
      state.data = data; setNotice("数据版本 " + data.generatedAt + "；账号/妮姬/装备三块已分层。词条与公式来源等级 A，角色目录来源等级 D；Pinkuro 导入需本地代理。", ""); renderAll();
    }).catch(function (error) { setNotice("静态数据加载失败：" + error.message, "error"); setStatus("数据不可用", true); });
    $("btnPinkuro").addEventListener("click", importPinkuro); $("btnLoad").addEventListener("click", function () { loadConfig(true); }); $("btnSave").addEventListener("click", function () { saveConfig(true); }); $("btnCopy").addEventListener("click", copyConfig); $("btnExport").addEventListener("click", exportConfig); $("btnImport").addEventListener("click", function () { $("fileImport").click(); }); $("fileImport").addEventListener("change", function () { if (this.files && this.files[0]) importConfig(this.files[0]); this.value = ""; });
    $("onlyChanged").addEventListener("change", function () { if (state.result) renderRowValues(); }); $("toggleDetails").addEventListener("click", function () { var box = $("detailContent"); box.hidden = !box.hidden; this.textContent = box.hidden ? "展开" : "收起"; });
    $("characterSearch").addEventListener("input", searchInput); $("characterSearch").addEventListener("keydown", searchKeydown); document.addEventListener("click", function (event) { if (!event.target.closest(".character-picker")) $("characterSuggestions").hidden = true; });
    $("btnSettings").addEventListener("click", function () { $("settingsDrawer").hidden = false; }); $("btnCloseSettings").addEventListener("click", function () { $("settingsDrawer").hidden = true; }); $("settingsDrawer").addEventListener("click", function (event) { if (event.target === $("settingsDrawer")) $("settingsDrawer").hidden = true; });
    $("pinkuroCharacter").addEventListener("change", renderSyncRows); $("onlyConflicts").addEventListener("change", renderSyncRows); $("btnSelectRemote").addEventListener("click", function () { $("pinkuroRows").querySelectorAll(".sync-choice").forEach(function (box) { box.checked = true; }); }); $("btnKeepLocal").addEventListener("click", function () { $("pinkuroRows").querySelectorAll(".sync-choice").forEach(function (box) { box.checked = false; }); }); $("btnApplyPinkuro").addEventListener("click", applyPinkuro); $("btnCancelPinkuro").addEventListener("click", function () { $("pinkuroPanel").hidden = true; });
    ACCOUNT_FIELDS.concat(NIKKE_FIELDS, FORMULA_FIELDS).forEach(function (id) { if ($(id)) { $(id).addEventListener("input", updateFromUI); $(id).addEventListener("change", updateFromUI); } });
  }
  init();
})();
