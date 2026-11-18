"use strict";

// localStorage values are individually atomic. The current key is the commit point;
// nothing deletes the old current value before its replacement succeeds.
const SaveStore = (() => {
  const game = typeof module !== "undefined" ? require("./game.js") : Game;
  const apprentice = typeof module !== "undefined" ? require("./apprentice.js") : Apprentice;
  const story = typeof module !== "undefined" ? require("./charcoal-story.js") : CharcoalStory;
  const key = "emberforge.save.v1";
  const keys = { current: key, previous: key + ".previous", original: key + ".original" };
  const fault = (code) => Object.assign(new Error(code), { code });
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function decode(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { throw fault("corrupt"); }
    if (data?.version > 1 || data?._save?.format > 1) throw fault("future");
    if (!object(data) || data.version !== 1 || !object(data.weapon) || !Array.isArray(data.field))
      throw fault("corrupt");
    if (data.created !== undefined && (!Number.isFinite(data.created) || Math.abs(data.created) > 8.64e15))
      throw fault("corrupt");
    const defaults = game.fresh(data.created);
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
    const restored = { ...defaults, ...data, fieldIncomeVersion: data.fieldIncomeVersion ?? 1,
      apprentice: apprentice.restore(data, defaults.apprentice) };
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
    let expected, lastSavedAt = null, pending = null;
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
        const value = { ...state, _save: { format: 1, revision: (state._save?.revision || 0) + 1,
          generation, savedAt: Date.now() } };
        const raw = JSON.stringify(value);
        decode(raw);
        pending = { raw, mode, archive: key + ".preserved." + id() };
      }
      check();
      const { mode: operation, archive } = pending;
      if (expected !== null) {
        let valid = false;
        try { decode(expected); valid = true; } catch (e) {
          if (e.code === "future" || operation === "normal") throw e;
        }
        if (operation !== "normal") write(archive, expected);
        if (valid) {
          if (read(keys.original) === null) write(keys.original, expected);
          write(keys.previous, expected);
        }
      }
      const candidate = JSON.parse(pending.raw);
      candidate._save.savedAt = Date.now();
      const raw = JSON.stringify(candidate);
      write(key, raw); // Commit point; no fallible writes after this line.
      expected = raw;
      const result = decode(raw);
      lastSavedAt = result._save.savedAt;
      pending = null;
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
