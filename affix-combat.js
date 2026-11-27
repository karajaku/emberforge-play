"use strict";

const AffixCombat = (() => {
  const rules = typeof module !== "undefined" ? require("./affix-craft.js") : AffixCraft;
  const cap = (old, bonus, max) => old + Math.min(bonus, Math.max(0, max - old));
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
    const factor = (k, max) => 1 + Math.min(v(k), max) / 100;
    const scale = (k, n) => Math.round(stats[k] * n);
    const atk = factor("P1", 80),
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
      ? hpBase.base * (1 + (hpBase.bonus + hpIncrement) / 100) * hpBase.lining
      : (stats.hp * (1 + (priorHp + hpIncrement) / 100)) / (1 + priorHp / 100);
    effects.applied = {
      P1: Math.min(80, v("P1")),
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
    return {
      ...stats,
      mods,
      affix: effects,
      attack: scale("attack", atk),
      minDamage: scale("minDamage", atk),
      maxDamage: scale("maxDamage", atk),
      heavy: scale("heavy", atk * factor("P3", 120) * (has("shoulder") ? 0.85 : 1) * (has("neck") ? 0.8 : 1)),
      counter: scale("counter", atk * factor("P4", 120) * (has("shoulder") ? 1.4 : 1)),
      rupture: scale("rupture", atk * factor("P5", 120)),
      strike: scale("strike", atk * factor("P2", 120) * (has("gloves") ? 0.92 : 1)),
      opening: stats.opening + Math.min(v("P7"), 100),
      finish: stats.finish + Math.min(v("P6"), 80),
      hp: Math.round(hp * (has("cloak") ? 0.9 : 1)),
      armorRating: scale("armorRating", factor("P9", 160)),
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
    if (st.journeyWork?.[0] === 1) result *= 0.97;
    if (st.journeyWork?.[2] === 1) result *= 1.03;
    if (!u) return result;
    if (u.includes("weapon")) result *= h.firstHit !== false ? 1.6 : skill ? 1 : 0.9;
    if (u.includes("helm") && skill) result *= h.usedAffixSkill ? 0.9 : 1.5;
    if (u.includes("ring") && skill === "rupture") result *= 0.85;
    return result;
  }
  function incoming(h, skill, incoming, guard, wardFactor, legacyShield, current) {
    const a = h.bladeCombat.affix;
    const st = h.bladeCombat;
    const progressGuard =
      (st.promotedTrait === 2 && h.hp < h.maxHp * 0.35 ? 0.87 : 1) * (st.journeyWork?.[0] === 1 ? 0.95 : 1);
    if (!a) return current * progressGuard;
    let result = current;
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
  return { apply, cap, attackFactor, incoming };
})();
if (typeof module !== "undefined") module.exports = AffixCombat;
