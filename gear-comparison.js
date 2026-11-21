"use strict";

function createGearComparison({blades, outfit, endgame, craft, dice, stats}) {
  const starter = {base:0, grade:0, level:0, mods:[]};
  const starterArmor = {...starter, type:"armor"};
  const round = value => Math.round(value * 100) / 100;

  // Power is an item rating. Use the same weights for both sides, independent
  // of the current enemy or sword style. Rows already included in another
  // stat (e.g. the damage range around attack) have zero extra weight.
  function profile(s, item, type) {
    const rows = new Map();
    let points = 0;
    function stat(key, label, value, weight, unit = "") {
      value = round(value);
      if (!value) return;
      rows.set(key, {key, label, value, unit, deltaUnit:unit === "%" ? "%p" : unit});
      points += value * weight;
    }
    if (!item) return {rows, score:0};
    if (type === "outfit") {
      const effect = outfit.effect(item), element = outfit.elements[item.element];
      stat("armorRating", "장비 방어력", blades.armorRating(item), 4);
      stat("conversion-" + item.element, element + " 피해 전환", effect.conversion, 2, "%");
      stat("exposure-" + item.element, element + " 저항 감소", effect.exposure, 2, "%p");
    } else if (type === "legacyWeapon" || type === "legacyArmor") {
      if (type === "legacyWeapon") {
        stat("attack", "공격력", stats({...s, weapon:item}).attack, 4);
        stat("guardBonus", "방어 중 피격 감소", craft.grindBonus(item.grind, 0), 1, "%");
        const f = dice.journeyFactors(item);
        stat("damage", "공격 피해 보정", (f.edge * f.finishWork - 1) * 100, 4, "%");
        stat("defense", "상시 피해 감소", (1 - f.guard) * 100, 4, "%");
        stat("heavy", "강공 추가 피해", (f.heavyTrait * f.heavyWork - 1) * 100, 1, "%");
        stat("counter", "반격 추가 피해", (f.counter - 1) * 100, 1, "%");
        stat("finish", "체력 30% 미만 적 추가 피해", (f.finish - 1) * 100, 1, "%");
        stat("lastGuard", "체력 35% 미만 피격 감소", (1 - f.lastGuard) * 100, 2, "%");
      } else {
        stat("hp", "체력", stats({...s, armor:item}).hp, 1);
      }
    } else {
      const weapon = type === "blade";
      // Isolate the selected part from affixes on the other equipped part.
      const build = blades.skills(s, weapon ? item : starter, weapon ? starterArmor : item, "heavy", 0);
      if (weapon) {
        stat("attack", "공격력", build.attack, 0);
        stat("minDamage", "최소 물리 피해", build.minDamage, 0);
        stat("maxDamage", "최대 물리 피해", build.maxDamage, 0);
        stat("critChance", "치명타 확률", build.critChance, 0, "%");
        stat("blockedDamagePercent", "적 방어 시 전달 피해", build.blockedDamagePercent, 0, "%");
        // An all-style mix of normalized hit values, adjusted for 1.5x
        // criticals and the two defensive faces on the enemy die.
        const hit = .55 * build.strike + .2 * build.heavy / 2.1 +
          .15 * build.counter / 2.8 + .1 * build.rupture / .85;
        points += 4 * hit * (1 + build.critChance / 200) * (2 + build.blockedDamagePercent / 100) / 3;
        stat("heavy", "강공 피해", build.heavy, 0);
        stat("counter", "반격 피해", build.counter, 0);
        stat("strike", "일반 타격 피해", build.strike, 0);
        stat("rupture", "상처 1겹당 파열 피해", build.rupture, 0);
        stat("opening", "첫 타격 추가 피해", build.opening, 1, "%");
        stat("finish", blades.modDefs.finish.name, build.finish, 1, "%");
        for (const key of ["momentum", "cooldown", "wounds"]) {
          stat(key, blades.modDefs[key].name, build.mods[key] || 0, 1, "%");
        }
      } else {
        stat("armorRating", "흉갑 방어력", build.armorRating, 4);
        stat("hp", "장착 시 체력", build.hp, 1);
        stat("skillWard", blades.modDefs.skillWard.name, build.skillWard, 2, "%");
        stat("lastWard", blades.modDefs.lastWard.name, build.lastWard, 2, "%");
      }
      // Weapon wards and the cuirass share the combat reduction cap. Only
      // award the weapon the reduction that the worn cuirass can still use.
      if (weapon && build.defense) {
        const chest = blades.currentArmor(s);
        const withWard = blades.armorStats(s, chest, chest.level, item, 0).defense;
        const withoutWard = blades.armorStats(s, chest, chest.level, starter, 0).defense;
        stat("defense", "무기 피해 감소 기여", withWard - withoutWard, 4, "%");
      } else if (!weapon) {
        stat("defense", "상시 피해 감소", blades.armorStats(s, item, item.level, blades.current(s), 0).defense, 4, "%");
      }
      stat("guardBonus", "방어 중 피격 감소", build.guardBonus, 1, "%");
      for (const key of ["guard", "recovery", "fortify"]) {
        stat(key, blades.modDefs[key].name, build.mods[key] || 0, 2, "%");
      }
      // Expose individual affixes even when their effects are already counted
      // in derived damage or survivability. A swap can lose an affix while
      // increasing the resulting attack or health.
      const derivedKeys = weapon ? ["power", "strike", "heavy", "counter", "rupture"] : ["vitality", "plating", "bracing"];
      for (const mod of item.mods) {
        if (derivedKeys.includes(mod.key)) {
          stat("affix-" + mod.key, blades.modDefs[mod.key].name + " 각인", mod.value, 0, mod.key === "plating" ? "%p" : "%");
        }
      }
      if (item.ascended) {
        const style = item.ascended.style;
        const effect = (weapon ? endgame.transform : endgame.armorTransform)[style];
        stat("ascended-" + style, effect.name, 1, 12);
      }
    }
    return {rows, score:Math.round(points)};
  }

  function outfitTarget(s, item, preferredSlot) {
    const kit = outfit.state(s);
    const targets = outfit.slots.filter(slot => slot.kind === item.kind).map(slot => ({
      slot:slot.key, current:kit.items.find(gear => gear.id === kit.equipped[slot.key]) || null,
    }));
    const chosen = targets.find(target => target.slot === preferredSlot) ||
      targets.find(target => target.current?.id === item.id) || targets.find(target => !target.current);
    if (chosen) return chosen;
    // The two occupied ring slots are interchangeable from the bag. A tie
    // keeps the first slot; a slot-specific action always honors that slot.
    return targets.reduce((best, target) =>
      profile(s, target.current, "outfit").score < profile(s, best.current, "outfit").score ? target : best);
  }

  return function compareGear(s, item, type, preferredSlot) {
    let slot = type, current;
    switch (type) {
      case "blade": slot = "weapon"; current = blades.current(s); break;
      case "chest": current = blades.currentArmor(s); break;
      case "outfit": ({slot, current} = outfitTarget(s, item, preferredSlot)); break;
      case "legacyWeapon": current = s.weapon; break;
      case "legacyArmor": current = s.armor; break;
      default: throw new Error("Unknown equipment type: " + type);
    }
    const equipped = item === current || (!!item.id && item.id === current?.id);
    const candidate = profile(s, item, type);
    const worn = equipped ? candidate : profile(s, current, type);
    const keys = new Set([...candidate.rows.keys(), ...worn.rows.keys()]);
    const rows = Array.from(keys, key => {
      const next = candidate.rows.get(key), previous = worn.rows.get(key);
      const value = next?.value || 0, before = previous?.value || 0;
      return {...(next || previous), value, before, delta:round(value - before)};
    });
    return {slot, current, equipped, score:candidate.score, currentScore:worn.score, delta:candidate.score - worn.score, rows};
  };
}

if (typeof module !== "undefined") module.exports = createGearComparison;
