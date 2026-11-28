"use strict";
// E3 exploration rules: pure tables, eligibility, the food ledger and find names.
// Game.perform owns every state change; nothing here mutates its arguments.
const ExplorationRules = (() => {
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
  const version = "explore-v1";
  // The rules a new forest hunt starts on. "blade-as-v1": the rule clock of attack-speed-combat.js.
  // Putting "blade-d20-v1" back here starts new hunts on the turn rules again (hand-over §4.4, R-다).
  const combat = "blade-as-v1";
  // Both forest rule sets may explore: a start on the turn rules still works when `combat` is put back.
  const combats = Object.freeze(["blade-as-v1", "blade-d20-v1"]);
  const artisanChance = 0.10;
  const artisanCost = 2;
  const artisanName = "봉인된 장인의 보물함";
  const kinds = Object.freeze(["combat", "treasure", "food", "cart"]);
  const row = (combat, treasure, food, cart) => Object.freeze({ combat, treasure, food, cart });
  // Repeat stages keep the approved E2 table. First progress moves 15%p of food to treasure.
  const tables = Object.freeze({
    base: row(55, 20, 20, 5),
    noFood: row(55, 40, 0, 5),
    cooldown: row(55, 25, 20, 0),
    noFoodCooldown: row(55, 45, 0, 0),
    firstBase: row(55, 35, 5, 5),
    firstNoFood: row(55, 40, 0, 5),
    firstCooldown: row(55, 40, 5, 0),
    firstNoFoodCooldown: row(55, 45, 0, 0),
  });
  const cartTables = Object.freeze(["base", "noFood", "firstBase", "firstNoFood"]);
  const names = Object.freeze({
    moss: Object.freeze({ treasure: "이끼 덮인 보물함", food: "산딸기 군락" }),
    maple: Object.freeze({ treasure: "낙엽 속 행낭", food: "사냥꾼의 식량 꾸러미" }),
    gorge: Object.freeze({ treasure: "물 빠진 돌함", food: "바위틈 보급통" }),
    heart: Object.freeze({ treasure: "뿌리가 품은 상자", food: "나무꾼의 비축식량" }),
  });
  const cartName = "수레의 두 꾸러미";
  const cartCooldownStarts = 2;
  const sources = Object.freeze(["free", "purchased"]);
  const choices = Object.freeze(["gear", "gold"]);
  const recordLimit = 36; // 12 regions × stages 2, 3 and 4.

  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const validRank = rank => Number.isInteger(rank) && rank >= 1 && rank <= 60;

  function phase(rank, cleared) {
    return rank > cleared ? "first" : "repeat";
  }
  // First 1, every first 5n+1 and every 5n boss always stay battles.
  function protectedStage(rank, cleared) {
    return rank % 5 === 0 || (rank > cleared && rank % 5 === 1);
  }
  function eligible({ explore, combat: model, source, rank, cleared, monsters, challenge }) {
    return explore === version && combats.includes(model) && sources.includes(source) &&
      (monsters===1 ? Number.isSafeInteger(rank) && rank>=1 : validRank(rank)) &&
      Number.isSafeInteger(cleared) && rank <= cleared + 1 &&
      (monsters===1 ? challenge===undefined && !(rank===1 && cleared===0) : !protectedStage(rank, cleared));
  }
  function tableKey(stagePhase, foodOK, cooling) {
    const key = foodOK ? (cooling ? "cooldown" : "base") : (cooling ? "noFoodCooldown" : "noFood");
    return stagePhase === "first" ? "first" + key[0].toUpperCase() + key.slice(1) : key;
  }
  // Cumulative order combat → treasure → food → cart over roll = int(0, 99).
  function ranges(key) {
    const table = tables[key];
    if (!table) return null;
    let lo = 0;
    const out = {};
    for (const kind of kinds) {
      out[kind] = table[kind] ? { lo, hi: lo + table[kind] - 1 } : null;
      lo += table[kind];
    }
    return out;
  }
  function pick(key, roll) {
    const table = tables[key];
    if (!table || !Number.isInteger(roll) || roll < 0 || roll > 99) return null;
    let edge = 0;
    for (const kind of kinds) {
      edge += table[kind];
      if (roll < edge) return kind;
    }
    return null;
  }
  function cooldownAfter(previous, kind) {
    return kind === "cart" ? cartCooldownStarts : Math.max(0, previous - 1);
  }

  function freshLedger() {
    return { version: 1, consumed: 0, found: 0, reserved: 0, cartCooldown: 0 };
  }
  // Fail closed: malformed counts, a reserve, or recovery above 70% are all invalid.
  function validLedger(ledger) {
    return object(ledger) && ledger.version === 1 && count(ledger.consumed) && count(ledger.found) &&
      count(ledger.reserved) && ledger.reserved === 0 && [0, 1, 2].includes(ledger.cartCooldown) &&
      10n * (BigInt(ledger.found) + BigInt(ledger.reserved)) <= 7n * BigInt(ledger.consumed);
  }
  // Called after this start's charge has been added to C and removed from free.
  function foodPossible(ledger, freeAfterCharge, cap) {
    return validLedger(ledger) && 10n * (BigInt(ledger.found) + BigInt(ledger.reserved) + 1n) <= 7n * BigInt(ledger.consumed) &&
      Number.isSafeInteger(freeAfterCharge) && freeAfterCharge + 1 <= cap;
  }

  function region(rank) {
    return trail.region(rank).id;
  }
  function findName(kind, rank) {
    if (kind === "cart") return cartName;
    if (kind === "treasure" || kind === "food") return names[region(rank)][kind];
    return null;
  }

  // The only plans huntGearPlans can produce for an eligible (non-boss, non-first-5n+1) stage.
  const planShapes = Object.freeze([
    [["weapon"], null], [["armor"], null], [[], "outfit"],
    [["weapon"], "outfitSalvaged"], [["armor"], "outfitSalvaged"],
  ]);
  function validPlan(plan) {
    return object(plan) && Array.isArray(plan.gear) && Object.keys(plan).length === 2 &&
      planShapes.some(([gear, outfit]) => plan.outfit === outfit && plan.gear.length === gear.length &&
        gear.every((type, i) => plan.gear[i] === type));
  }

  function validRecord(record, cleared) {
    if (!object(record) || ![1,2].includes(record.version) || !Array.isArray(record.explored) ||
        record.explored.length > recordLimit || !Number.isInteger(cleared)) return false;
    return record.explored.every((rank, i) => Number.isSafeInteger(rank) && (record.version===2 || [2, 3, 4].includes(rank % 5)) &&
      rank >= 1 && rank <= cleared && (i === 0 || rank > record.explored[i - 1]));
  }

  return {
    version, combat, combats, artisanChance, artisanCost, artisanName, kinds, tables, cartTables, names, cartName, cartCooldownStarts, sources, choices, recordLimit,
    phase, protectedStage, eligible, tableKey, ranges, pick, cooldownAfter,
    freshLedger, validLedger, foodPossible, region, findName, validPlan, validRecord,
  };
})();
if (typeof module !== "undefined") module.exports = ExplorationRules;
