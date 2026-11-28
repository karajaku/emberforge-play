"use strict";

const AffixCombat = (() => {
  const rules = typeof module !== "undefined" ? require("./affix-craft.js") : AffixCraft;
  const cap = (old, bonus, max) => old + Math.min(bonus, Math.max(0, max - old));
  // Families with the same combat calculation share one cap across both generations.
  const common = rules.statFamilyCounts;
  function apply(stats, gear, hpBase) {
    const sums = {},
      unique = [];
    function add(k, v) {
      sums[k] = (sums[k] || 0) + v;
    }
    const ids = new Set();
    for (const item of gear) {
      if (item.id && ids.has(item.id)) continue;
      if (item.id) ids.add(item.id);
      for (const m of item.mods || []) if (rules.defs[m.key]) add(m.key, rules.effectiveValue(item, m));
      if (item.unique) {
        unique.push(item.unique);
        ["P1", "P8", "P9"].forEach((key, i) => add(key, item.uniqueStats[i]));
      }
      for (const socket of item.sockets || []) {
        const [key, value] = { fire: ["P1", 3], life: ["P8", 3], iron: ["P9", 6] }[socket];
        add(key, value);
      }
    }
    if (!Object.keys(sums).length) return stats;
    const has = (kind) => unique.includes(kind);
    const v = (k) => sums[k] || 0;
    const live = Object.fromEntries(Object.entries(sums).filter(([key]) => rules.defs[key]?.live));
    const active = Object.keys(live).length > 0;
    const opening = cap(stats.opening + Math.min(v("P7"), 100), v("PN101"), 100);
    const finish = cap(stats.finish + Math.min(v("P6"), 80), v("PN108"), 80);
    for (const [key, old] of Object.entries(common)) if (key !== "PN02" && live[key]) add(old, live[key]);
    for (const old of ["S10", "S11", "S12"]) if (live.SN108) add(old, live.SN108);
    for (const old of ["P3", "P4"]) if (live.PN104) add(old, live.PN104);
    const attackPercent = Math.min(200, Math.min(v("P1"), 80) + v("PN02"));
    const attackMultiplier = 1 + attackPercent / 100;
    const factor = (k, max) => 1 + Math.min(v(k), max) / 100;
    const scale = (k, n) => Math.round(stats[k] * n);
    const atk = attackMultiplier * (v("PN01") ? 1 + v("PN01") / stats.attack : 1),
      mods = { ...stats.mods };
    const effects = {
      unique,
      critBonus: v("S2"),
      critScale: Math.min(2.5, 1.5 + v("S3") / 100),
      baseMomentum: mods.momentum || 0,
      guardHeal: v("S6"),
      killHeal: v("S7") + (has("cloak") ? 8 : 0),
      bleedPower: scale("rupture", atk),
      exposure: [v("S10"), v("S11"), v("S12")],
      ...(active ? { live } : {}),
      baseDefense: stats.defense,
      baseRating: stats.armorRating,
      baseSkillWard: stats.skillWard,
      baseLastWard: stats.lastWard,
      baseFortify: mods.fortify || 0,
    };
    for (const [key, id, max] of [
      ["haste", "S1", 25],
      ["momentum", "S4", 60],
      ["cooldown", "S5", 50],
      ["fortify", "S8", 40],
      ["wounds", "S9", 60],
    ]) {
      const bonus = v(id) + (key === "haste" && has("gloves") ? 15 : 0);
      if (bonus) mods[key] = cap(mods[key] || 0, bonus, max);
    }
    const priorHp = gear[1]?.mods?.find((m) => m.key === "vitality")?.value || 0;
    const hpIncrement = Math.min(v("P8"), Math.max(0, 100 - (hpBase?.bonus ?? priorHp)));
    const hp = hpBase
      ? (hpBase.base + v("PN05")) * (1 + (hpBase.bonus + hpIncrement) / 100) * hpBase.lining
      : ((stats.hp + v("PN05") * (1 + priorHp / 100)) * (1 + (priorHp + hpIncrement) / 100)) / (1 + priorHp / 100);
    effects.applied = {
      P1: attackPercent,
      P2: Math.min(120, v("P2")),
      P3: Math.min(120, v("P3")),
      P4: Math.min(120, v("P4")),
      P5: Math.min(120, v("P5")),
      P6: Math.min(80, v("P6")),
      P7: Math.min(100, v("P7")),
      P8: (hpBase?.bonus ?? priorHp) + hpIncrement,
      P9: Math.min(160, v("P9")),
      P10: cap(stats.defense, v("P10"), 45),
      P11: cap(stats.skillWard, v("P11"), 30),
      P12: cap(stats.lastWard, v("P12"), 30),
      S1: mods.haste || 0,
      S2: Math.min(50, stats.critChance + v("S2")),
      S3: effects.critScale * 100,
      S4: mods.momentum || 0,
      S5: mods.cooldown || 0,
      S6: cap(mods.guard || 0, v("S6"), 8),
      S7: cap(mods.recovery || 0, effects.killHeal, 12),
      S8: mods.fortify || 0,
      S9: mods.wounds || 0,
    };
    const applied = effects.applied;
    if (active) {
      Object.assign(applied, live, { PN02: attackPercent });
      for (const [key, old] of Object.entries(common)) if (old in applied) applied[key] = applied[old];
      for (const [i, key] of ["SN04", "SN05", "SN06"].entries()) {
        applied[key] = Math.min(75, v(key) + v("SN07"));
        applied["SN" + (13 + i)] = Math.min(45, effects.exposure[i]);
      }
      applied.SN11 = Math.min(10, v("SN11"));
      applied.SN107 = Math.min(10 - applied.SN11, v("SN107"));
      applied.PN105 = Math.min(50, v("PN105"));
      applied.SN105 = Math.min(v("SN105"), Math.max(0, 25 - applied.S1));
      applied.PN101 = opening;
      applied.PN108 = finish;
    }
    const skillFactor = (key) => 1 + Math.min(120, v(key) + v("PN12")) / 100;
    return {
      ...stats,
      mods,
      affix: effects,
      attack: Math.round((stats.attack + v("PN01")) * attackMultiplier),
      minDamage: Math.round((stats.minDamage + v("PN01")) * attackMultiplier),
      maxDamage: Math.round((stats.maxDamage + v("PN01")) * attackMultiplier),
      heavy: scale("heavy", atk * skillFactor("P3") * (has("shoulder") ? 0.85 : 1) * (has("neck") ? 0.8 : 1)),
      counter: scale("counter", atk * skillFactor("P4") * (has("shoulder") ? 1.4 : 1)),
      rupture: scale("rupture", atk * skillFactor("P5")),
      strike: scale("strike", atk * factor("P2", 120) * (has("gloves") ? 0.92 : 1)),
      opening,
      finish,
      hp: Math.round(hp * (has("cloak") ? 0.9 : 1)),
      armorRating: Math.round((stats.armorRating + v("PN03")) * factor("P9", 160)),
      defense: cap(stats.defense, v("P10"), 45),
      skillWard: cap(stats.skillWard, v("P11"), 30),
      lastWard: cap(stats.lastWard, v("P12"), 30),
      ...(has("ring") ? { ruptureAt: Math.max(2, (stats.ruptureAt || 3) - 1) } : {}),
    };
  }
  function attackFactor(h, skill) {
    const u = h.bladeCombat.affix?.unique;
    const st = h.bladeCombat;
    let result = st.promotedTrait === 1 && h.enemyHp < h.enemyMax * 0.3 ? 1.1 : 1;
    const n = st.affix?.live;
    if (n) {
      if (skill && !h.usedAffixSkill && n.PN103) {
        const action = skill === "heavyStrike" ? "P3" : skill === "counter" ? "P4" : "P5";
        const spent = Math.min(120, (n.PN12 || 0) + st.affix.applied[action]);
        result *= (100 + Math.min(120, spent + n.PN103)) / (100 + spent);
      }
      if (!skill && h.wounds > 0 && n.PN106) {
        const spent = st.affix.applied.P2;
        result *= (100 + Math.min(120, spent + n.PN106)) / (100 + spent);
      }
    }
    if (st.journeyWork?.[0] === 1) result *= 0.97;
    if (st.journeyWork?.[2] === 1) result *= 1.03;
    if (!u) return result;
    if (u.includes("weapon")) result *= h.firstHit !== false ? 1.6 : skill ? 1 : 0.9;
    if (u.includes("helm") && skill) result *= h.usedAffixSkill ? 0.9 : 1.5;
    if (u.includes("ring") && skill === "rupture") result *= 0.85;
    return result;
  }
  function critChance(h, skill) {
    const st = h.bladeCombat,
      a = st.affix;
    const opening = h.firstHit !== false ? a?.live?.SN101 || 0 : 0;
    if (skill && !opening) return st.critChance;
    return Math.min(50, st.critChance + (skill ? 0 : a?.critBonus || 0) + opening);
  }
  function critMultiplier(h) {
    const a = h.bladeCombat.affix;
    const bonus = h.enemyHp >= h.enemyMax / 2 ? a?.live?.SN103 || 0 : 0;
    return Math.min(2.5, (a?.critScale ?? 1.5) + bonus / 100);
  }
  // Direct components keep their own resistance, while flat additions bypass weapon, crit and skill multipliers.
  function directHit(raw, passed, landed, profile, enemyHp) {
    if (typeof profile === "number")
      return { damage: Math.min(enemyHp, Math.round(raw * profile * passed)), elemental: 0 };
    const physical = raw * profile.physical * passed + (landed ? profile.flatPhysical : 0);
    const element = raw * profile.element * passed + (landed ? profile.flatElement : 0);
    const total = physical + element;
    const damage = Math.min(enemyHp, Math.round(total));
    return { damage, elemental: total > 0 ? (damage * element) / total : 0 };
  }
  function heal(h, hp, amount) {
    if (hp <= 0 || !amount) return 0;
    const bonus = hp <= h.maxHp / 2 ? h.bladeCombat.affix?.applied.PN105 || 0 : 0;
    return Math.min(h.maxHp - hp, Math.round(amount * (1 + bonus / 100)));
  }
  function hitRecovery(h, hit, landed) {
    const a = h.bladeCombat.affix;
    if (!a?.live || !landed || hit.damage <= 0) return 0;
    return (a.live.SN10 || 0) + (hit.damage * a.applied.SN11) / 100 + (hit.elemental * a.applied.SN107) / 100;
  }
  function killRecovery(h) {
    const a = h.bladeCombat.affix;
    return (a?.killHeal || 0) + (h.hp <= h.maxHp / 2 ? a?.live?.SN109 || 0 : 0);
  }
  const skillResistance = { fang: "SN04", breath: "SN05", crush: "SN05", dust: "SN06", bind: "SN06" };
  function incoming(h, skill, incoming, guard, wardFactor, legacyShield, current) {
    const a = h.bladeCombat.affix;
    const st = h.bladeCombat;
    const progressGuard =
      (st.promotedTrait === 2 && h.hp < h.maxHp * 0.35 ? 0.87 : 1) * (st.journeyWork?.[0] === 1 ? 0.95 : 1);
    if (!a) return current * progressGuard;
    let result = current;
    if (a.live) {
      if (!skill) result *= 1 - Math.min(30, a.live.PN17 || 0) / 100;
      if (skill && h.hp <= h.maxHp / 2 && a.live.PN109 && st.skillWard < 30) {
        result *= (100 - Math.min(30, st.skillWard + a.live.PN109)) / (100 - st.skillWard);
      }
      const resistance = a.applied[skillResistance[skill]] || 0;
      result *= 1 - resistance / 200;
    }
    if (a.unique.includes("armor")) result *= skill ? 0.8 : 1.1;
    if (a.unique.includes("legs")) result *= h.hp <= h.maxHp / 2 ? 0.85 : 1.05;
    const reduction = a.baseRating > 0 ? Math.min(0.5, a.baseRating / (a.baseRating + 8 * incoming)) : 0;
    const base =
      incoming *
      (1 - reduction) *
      guard *
      (1 - a.baseDefense / 100) *
      legacyShield *
      (skill ? 1 - a.baseSkillWard / 100 : 1) *
      (h.hp <= h.maxHp / 2 ? 1 - a.baseLastWard / 100 : 1) *
      wardFactor;
    return progressGuard * Math.max(base * 0.15, result);
  }
  return {
    apply,
    cap,
    attackFactor,
    incoming,
    critChance,
    critMultiplier,
    directHit,
    hitRecovery,
    killRecovery,
    heal,
  };
})();
if (typeof module !== "undefined") module.exports = AffixCombat;
