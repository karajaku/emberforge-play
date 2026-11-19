"use strict";
// The main save owns currency, the ticket wallet and equipped items. Only new smithing
// and combat fields are stored here. The comparison page uses the same rules with its own store.
const MainProgression = (() => {
  const F = typeof module !== "undefined" ? require("./heirloom-forge.js") : HeirloomForge;
  const G = typeof module !== "undefined" ? require("./game.js") : Game;
  const shared = ["gold", "souls", "stones"];
  function equipment(old, base) {
    if (old.heirloom) {
      const { arts, equipped, ...detail } = old.heirloom;
      Object.assign(base, structuredClone(detail));
    }
    if (old.marks) {
      for (const mark of old.marks.slice(base.work.length, 3)) {
        if (!mark) break;
        base.work.push(mark === "ward" ? 1 : 0);
      }
    }
    base.n = old.level;
    base.grade = old.grade;
    base.peak = Math.max(base.peak, base.n);
    return base;
  }
  function read(s, now = Date.now()) {
    const v = F.fresh("journey", now);
    if (s.heirloom) Object.assign(v, structuredClone(s.heirloom));
    for (const key of shared) v[key] = s[key];
    v.weapon = equipment(s.weapon, v.weapon);
    v.armor = equipment(s.armor, v.armor);
    v.arts = [...(s.weapon.heirloom?.arts || [])];
    v.equipped = [...(s.weapon.heirloom?.equipped || [])];
    const w = G.huntingStatus(s, now);
    v.best = s.huntBest;
    v.free = w.free + w.purchased;
    v.externalWallet = true;
    v.attendance = w.daily;
    return v;
  }
  function persist(s, v) {
    for (const key of shared) s[key] = v[key];
    s.huntBest = v.best;
    s.best = Math.max(s.best, v.weapon.n, v.armor.n);
    if (v.weapon.grade || v.armor.grade) s.foundRare = true;
    for (const key of ["weapon", "armor"]) {
      const { n, grade, ...detail } = v[key];
      s[key].level = n;
      s[key].grade = grade;
      s[key].heirloom = detail;
    }
    s.weapon.heirloom.arts = v.arts;
    s.weapon.heirloom.equipped = v.equipped;
    const extras = { ...v };
    delete extras.arts;
    delete extras.equipped;
    for (const key of [
      ...shared,
      "weapon",
      "armor",
      "best",
      "free",
      "charge",
      "attendance",
      "externalWallet",
    ])
      delete extras[key];
    s.heirloom = extras;
  }
  function enable(s, newGame = false) {
    if (s.heirloom) return false;
    if (newGame) s.gold = 1000;
    const v = read(s);
    v.previousBest = s.best;
    persist(s, v);
    return true;
  }
  function apply(s, revision, operation, now = Date.now()) {
    const v = read(s, now);
    F.check(v.revision === revision, "진행이 바뀌었습니다. 최신 장비를 확인하세요.");
    F.check(!s.hunt, "진행 중인 기존 숲 전투를 먼저 마치세요.");
    const before = v.hunt,
      recipeCount = v.recipes.length,
      records = v.records[0],
      oldGold = v.gold;
    const text = operation(v);
    if (!before && v.hunt) {
      const w = G.settleHunting(s, now);
      G.spendHuntTicket(w, v.hunt.rank);
      const plain = (key) => ({ level: s[key].level, grade: s[key].grade, star: 0 });
      const baseline = G.stats({ ...s, weapon: plain("weapon"), armor: plain("armor") });
      const actual = G.huntStats(s);
      if (!v.weapon.broken) v.hunt.gearBonus = actual.attack / baseline.attack;
      if (!v.armor.broken) v.hunt.hp = v.hunt.maxHp = Math.round((100 * actual.hp) / baseline.hp);
      s.huntNumber = (s.huntNumber || 0) + 1;
    }
    if (before && !v.hunt && v.records[0] !== records) {
      if (v.records[0].won) s.forestFiber += G.forestYield(before.rank);
      s.lastHunt = {
        ...s.hunting.lastStart,
        number: s.huntNumber,
        rank: before.rank,
        turns: before.turns,
        reward: v.gold - oldGold,
        enemyKind: before.pack[before.wave],
        ticketSource: s.hunting.lastStart.source,
        health: {
          number: s.huntNumber,
          hp: before.hp,
          maxHp: before.maxHp,
          enemyHp: before.enemyHp,
          enemyMax: before.enemyMax,
        },
      };
    }
    if (v.recipes.length > recipeCount) {
      s.rebirths++;
      s.lifeSouls += 20;
      if (!s.story.firstGift) s.story.firstGift = { points: 20, trait: null };
    }
    v.revision++;
    persist(s, v);
    return text;
  }
  function legacyForest(s) {
    return (
      !!s.hunt ||
      (!!s.lastHunt?.chestId && s.chests.some((c) => c.source === "forest" && c.id === s.lastHunt.chestId))
    );
  }
  return { read, enable, apply, legacyForest };
})();
if (typeof module !== "undefined") module.exports = MainProgression;
