"use strict";

// localStorage values are individually atomic. The current key is the commit point;
// nothing deletes the old current value before its replacement succeeds.
const SaveStore = (() => {
  const game = typeof module !== "undefined" ? require("./game.js") : Game;
  const apprentice = typeof module !== "undefined" ? require("./apprentice.js") : Apprentice;
  const story = typeof module !== "undefined" ? require("./charcoal-story.js") : CharcoalStory;
  const shop = typeof module !== "undefined" ? require("./relic-shop.js") : RelicShop;
  const key = "emberforge.save.v1";
  const keys = { current: key, previous: key + ".previous", original: key + ".original" };
  const fault = (code) => Object.assign(new Error(code), { code });
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function decode(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { throw fault("corrupt"); }
    if (data?.version > 2 || data?._save?.format > 1 || data?.hunting?.version > 1) throw fault("future");
    for (const h of [data?.hunt, data?.lastHunt]) {
      if (h?.trailVersion > 1) throw fault("future");
      const skillVersion = h?.trailVersion === 1 ? 2 : 1;
      if (h?.skillVersion > skillVersion) throw fault("future");
      if (h?.trailVersion !== undefined) {
        if (h.trailVersion !== 1 || h.diceVersion !== 1 || !Number.isInteger(h.rank) || h.rank < 1 || h.rank > 60 ||
            typeof h.bonusEncounter !== "boolean" || !Number.isInteger(h.wave)) throw fault("corrupt");
        const pack = game.trail.lineup(h.rank, h.bonusEncounter);
        if (h.wave < 0 || h.wave >= pack.length || pack[h.wave] !== h.enemyKind) throw fault("corrupt");
        if (h === data.hunt) {
          if (h.skillVersion !== 2 || !Number.isInteger(h.waveTurn) || h.waveTurn < 1 || h.waveTurn > 40 ||
              typeof h.goblinCaught !== "boolean" || h.enemySkillState?.key !== game.huntEnemy(h).skill) throw fault("corrupt");
          if ((h.lastDice?.enemySkill === "escape" && h.enemyKind !== "goblin") ||
              (game.trail.awaitingNext(h) && h.wave === pack.length - 1)) throw fault("corrupt");
        }
      }
      if (h?.diceVersion > 1) throw fault("future");
      if (h?.skillVersion !== undefined && h.skillVersion !== skillVersion) throw fault("corrupt");
      const heavyMax = h?.trailVersion === 1 ? 4 : 3;
      if(h?.skillCooldowns!==undefined&&(!object(h.skillCooldowns)||Object.entries(h.skillCooldowns).some(([key,n])=>!['heavyStrike','counter'].includes(key)||!Number.isInteger(n)||n<0||n>(key==='counter'?2:heavyMax))))throw fault("corrupt");
      if(h?.enemySkillState!==undefined&&(!object(h.enemySkillState)||!Number.isInteger(h.enemySkillState.cooldown)||h.enemySkillState.cooldown<0||h.enemySkillState.cooldown>4||![2,3,4].includes(h.enemySkillState.interval)||![2,3,4].includes(h.enemySkillState.power)))throw fault("corrupt");
      if (h?.diceVersion !== undefined && h.diceVersion !== 1) throw fault("corrupt");
      if (h?.lastDice && (!object(h.lastDice) ||
          ![h.lastDice.playerFace, h.lastDice.enemyFace].every(n => Number.isInteger(n) && n >= 1 && n <= 6))) throw fault("corrupt");
    }
    if (!object(data) || ![1, 2].includes(data.version) || !object(data.weapon) || !Array.isArray(data.field))
      throw fault("corrupt");
    if (data.created !== undefined && (!Number.isFinite(data.created) || Math.abs(data.created) > 8.64e15))
      throw fault("corrupt");
    const defaults = game.fresh(data.created);
    if (data.version === 2 && (!Number.isSafeInteger(data.forestFiber) || data.forestFiber < 0 ||
        !Number.isInteger(data.huntLining) || data.huntLining < 0 || data.huntLining > game.liningCosts.length))
      throw fault("corrupt");
    // Missing fields from old builds are migrated; present but malformed fields
    // must not silently become a fresh balance or equipment item.
    for (const [name, value] of Object.entries(defaults)) {
      if (!(name in data) || value === null) continue;
      const actual = data[name];
      if (typeof value === "number" ? !Number.isFinite(actual) :
          Array.isArray(value) ? !Array.isArray(actual) :
          object(value) ? !object(actual) : typeof actual !== typeof value) throw fault("corrupt");
    }
    function shape(actual, template) {
      if (Array.isArray(template)) return Array.isArray(actual) &&
        (!template.length || (actual.length === template.length && actual.every((v, i) => shape(v, template[i]))));
      if (object(template)) return object(actual) && Object.entries(template).every(([k, v]) => shape(actual[k], v));
      return typeof template === "number" ? Number.isFinite(actual) : typeof actual === typeof template;
    }
    if (object(data.imprints)) {
      for (const key of ["fate", "haste"]) {
        if (!(key in data.imprints)) data.imprints[key] = 0;
        const level = data.imprints[key];
        if (!Number.isInteger(level) || level < 0 || level > game.imprints[key][3]) throw fault("corrupt");
      }
    }
    for (const name of ["trial", "imprints", "ore", "charms", "enabled"])
      if (name in data && !shape(data[name], defaults[name])) throw fault("corrupt");
    for (const name of ["hunt", "dive", "autoMine", "lastAutoMine", "towerRun", "lastTowerRun", "guild", "lastChest", "lastHunt", "inheritedRecipe"])
      if (data[name] != null && !object(data[name])) throw fault("corrupt");
    for (const gear of [data.weapon, data.armor ?? defaults.armor, ...(data.bag || []), ...data.field]) {
      if (!object(gear) || ![gear.level, gear.grade, gear.star].every(n => Number.isFinite(n) && n >= 0))
        throw fault("corrupt");
      for (const name of ["work", "route", "seal", "finalTrial", "pattern"])
        if (gear[name] != null && !object(gear[name])) throw fault("corrupt");
      for (const name of ["marks", "grind"])
        if (gear[name] != null && !Array.isArray(gear[name])) throw fault("corrupt");
    }
    if (data._save && (!object(data._save) || data._save.format !== 1 ||
        !Number.isSafeInteger(data._save.revision) || data._save.revision < 1 ||
        typeof data._save.generation !== "string" || !Number.isFinite(data._save.savedAt))) throw fault("corrupt");
    if ("hunting" in data) {
      const w = data.hunting;
      const count = n => Number.isSafeInteger(n) && n >= 0;
      const time = n => Number.isFinite(n) && Math.abs(n) <= 8.64e15;
      if (!object(w) || w.version !== 1 || typeof w.id !== "string" || !w.id ||
          !count(w.free) || !count(w.purchased) || !count(w.serial) || !time(w.observedAt) ||
          !(w.rechargeAt === null || time(w.rechargeAt)) ||
          typeof w.daily !== "string" || !/^(|\d{4}-\d{2}-\d{2})$/.test(w.daily) ||
          (w.free >= game.hunting.cap) !== (w.rechargeAt === null) ||
          (w.rechargeAt !== null && w.rechargeAt > w.observedAt)) throw fault("corrupt");
      if (w.serial === 0 ? w.lastStart !== null :
          !object(w.lastStart) || w.lastStart.request !== w.serial ||
          w.lastStart.id !== w.id + "-" + w.serial ||
          !Number.isInteger(w.lastStart.rank) || w.lastStart.rank < 1 || w.lastStart.rank > 60 ||
          !["free", "purchased"].includes(w.lastStart.source)) throw fault("corrupt");
    }
    function validEntry(id) {
      const wallet = data.hunting;
      if (typeof id !== "string" || !wallet || !id.startsWith(wallet.id + "-")) return false;
      const serial = Number(id.slice(wallet.id.length + 1));
      return Number.isSafeInteger(serial) && serial >= 1 && serial <= wallet.serial && id === wallet.id + "-" + serial;
    }
    const h = data.hunt;
    if (h?.materialRule > 1) throw fault("future");
    if (h?.materialRule !== undefined && (data.version !== 2 || h.materialRule !== 1 || h.trailVersion !== 1 ||
        !validEntry(h.id) || h.id !== data.hunting.lastStart.id || h.rank !== data.hunting.lastStart.rank ||
        h.ticketSource !== data.hunting.lastStart.source || h.request !== data.hunting.serial)) throw fault("corrupt");
    const entries = new Set(h?.materialRule ? [h.id] : []), ids = new Set();
    for (const c of [...(data.chests || []), ...(data.lastChest ? [data.lastChest] : [])]) {
      if (!object(c)) throw fault("corrupt");
      if (c.materialRule > 1) throw fault("future");
      if (c.id !== undefined) {
        if (ids.has(c.id)) throw fault("corrupt");
        ids.add(c.id);
      }
      if (c.materialRule === undefined && c.fiber === undefined && c.entryId === undefined) continue;
      if (data.version !== 2 || c.materialRule !== 1 || c.source !== "forest" || !Number.isInteger(c.rank) ||
          c.rank < 1 || c.rank > 60 || c.fiber !== game.forestYield(c.rank) || !validEntry(c.entryId) ||
          typeof c.id !== "string" || !c.id || entries.has(c.entryId) ||
          (data.lastHunt?.chestId === c.id && (data.lastHunt.id !== c.entryId || data.lastHunt.rank !== c.rank))) throw fault("corrupt");
      entries.add(c.entryId);
    }
    const restored = { ...defaults, ...data, version: 2,
      forestFiber: data.version === 1 ? 0 : data.forestFiber, huntLining: data.version === 1 ? 0 : data.huntLining,
      fieldIncomeVersion: data.fieldIncomeVersion ?? 1,
      apprentice: apprentice.restore(data, defaults.apprentice) };
    if (!("foundRare" in data))
      restored.foundRare = [restored.weapon, restored.armor, ...restored.bag, ...restored.field].some(g => g.grade > 0);
    for (const [key, count] of Object.entries(restored.relicScrolls)) {
      if (!shop.scrolls.includes(shop.find(key)) || !Number.isSafeInteger(count) || count < 0) throw fault("corrupt");
    }
    for (const relic of restored.relics) {
      if (!object(relic) || !Number.isFinite(relic.power) || relic.power <= 0 ||
          !Number.isInteger(relic.tries) || relic.tries < 0 || relic.tries > 10) throw fault("corrupt");
      if (relic.failures === undefined) relic.failures = shop.oldFailures(relic);
      if (!Number.isInteger(relic.failures) || relic.failures < 0 || relic.failures > relic.tries ||
          (relic.extraAttack !== undefined && (!Number.isFinite(relic.extraAttack) || relic.extraAttack <= 0))) throw fault("corrupt");
    }
    if (!("hunting" in data)) {
      delete restored.hunting;
      game.settleHunting(restored);
    } else if (restored.hunt && !restored.hunt.id) {
      restored.hunt.id = "legacy-" + restored.hunting.id;
      restored.hunt.ticketSource = null;
    }
    restored.story = story.restore({ ...restored, story: data.story });
    try { game.migrateTraining(restored); } catch { throw fault("corrupt"); }
    return restored;
  }
  function storageFault(error, writing = false) {
    if (error.code && typeof error.code === "string") return error;
    return fault(error.name === "QuotaExceededError" ? "quota" :
      error.name === "SecurityError" || !writing ? "access" : "write");
  }
  function create(getStorage, id = () => globalThis.crypto.randomUUID()) {
    let expected, lastSavedAt = null, pending = null, needsMigration = false;
    const read = name => { try { return getStorage().getItem(name); } catch (e) { throw storageFault(e); } };
    const write = (name, value) => {
      try { getStorage().setItem(name, value); } catch (e) { throw storageFault(e, true); }
    };
    function load() {
      expected = read(key);
      pending = null;
      if (expected === null) {
        if (read(keys.previous) !== null || read(keys.original) !== null) throw fault("missing");
        return null;
      }
      const state = decode(expected);
      const before = JSON.parse(expected);
      needsMigration = before.version === 1 || !before._save || !before.hunting || !!(before.hunt && !before.hunt.id);
      lastSavedAt = state._save?.savedAt ?? state.last ?? null;
      return state;
    }
    function check() {
      if (expected === undefined || read(key) !== expected) throw fault("conflict");
    }
    function backup() {
      const raw = read(keys.previous);
      if (raw === null) return null;
      try { return decode(raw); } catch { return null; }
    }
    function commit(state, mode = "normal") {
      // Keep the same serialized candidate across retries (including a reset's
      // generation). No new game/action/random roll is executed on retry.
      if (!pending) {
        const generation = mode === "reset" || !state._save ? id() : state._save.generation;
        const value = { ...state, version: 2, _save: { format: 1, revision: (state._save?.revision || 0) + 1,
          generation, savedAt: Date.now() } };
        const raw = JSON.stringify(value);
        decode(raw);
        pending = { raw, mode, archive: key + ".preserved." + id() };
      }
      check();
      const { mode: operation, archive } = pending;
      if (operation === "recover") {
        const prior = read(keys.previous);
        if (prior !== null && read(archive + ".previous") === null && JSON.parse(prior).version === 1)
          write(archive + ".previous", prior);
      }
      if (expected !== null) {
        let valid = false;
        try { decode(expected); valid = true; } catch (e) {
          if (e.code === "future" || operation === "normal") throw e;
        }
        const migrating = valid && JSON.parse(expected).version === 1;
        if (operation !== "normal" || migrating) write(archive, expected);
        if (migrating) {
          const previous = read(keys.previous);
          if (previous !== null && read(archive + ".previous") === null) write(archive + ".previous", previous);
        }
        if (valid) {
          if (read(keys.original) === null) write(keys.original, expected);
          write(keys.previous, expected);
        }
      }
      const raw = pending.raw;
      write(key, raw); // Commit point; no fallible writes after this line.
      expected = raw;
      const result = decode(raw);
      lastSavedAt = result._save.savedAt;
      pending = null;
      needsMigration = false;
      return result;
    }
    function recover() {
      check();
      // Never recover over a future version, including one written since load.
      if (expected !== null) { try { decode(expected); } catch (e) { if (e.code === "future") throw e; } }
      const state = backup();
      if (!state) throw fault("no-backup");
      return commit(state, "recover");
    }
    return { load, check, commit, recover, backup,
      get needsMigration() { return needsMigration; },
      get pending() { return !!pending; }, get lastSavedAt() { return lastSavedAt; } };
  }
  function createLock(environment) {
    let database;
    return async function exclusive(fn) {
      let locks, indexedDB;
      try { locks = environment.locks; if (!locks) indexedDB = environment.indexedDB; }
      catch { throw fault("locking"); }
      if (locks) return locks.request(key, fn);
      // IndexedDB readwrite transactions serialize across tabs too. The callback
      // must stay synchronous: all game/localStorage work runs in this transaction.
      if (!indexedDB) throw fault("locking");
      database ||= new Promise((resolve, reject) => {
        const request = indexedDB.open("emberforge-save-lock", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("mutex");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(fault("locking"));
        request.onblocked = () => reject(fault("locking"));
      });
      let db;
      try { db = await database; } catch { database = null; throw fault("locking"); }
      return new Promise((resolve, reject) => {
        let value, error;
        const transaction = db.transaction("mutex", "readwrite");
        transaction.objectStore("mutex").get("turn").onsuccess = () => {
          try { value = fn(); } catch (e) { error = e; }
        };
        transaction.oncomplete = () => error ? reject(error) : resolve(value);
        transaction.onerror = transaction.onabort = () => reject(error || fault("locking"));
      });
    };
  }
  return { keys, decode, create, createLock };
})();
if (typeof module !== "undefined") module.exports = SaveStore;
