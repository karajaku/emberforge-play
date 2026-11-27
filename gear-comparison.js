"use strict";

// Display helpers of the weapon rows (hand-over §7.5): the interval and the one-hit values. The score
// below and its inputs are the shipped ones.
const gearTiming = (typeof module !== "undefined" ? require("./attack-speed-combat.js") : AttackSpeedCombat).timing;
const gearHits = typeof module !== "undefined" ? require("./hunt-strikes.js") : HuntStrikes;

function createGearComparison({blades, outfit, endgame, craft, dice, stats, battleWeapon=blades.current}) {
  const affixes=typeof module!=="undefined"?require("./affix-craft.js"):AffixCraft;
  const starter = {base:0, grade:0, level:0, mods:[]};
  const starterArmor = {...starter, type:"armor"};
  const round = value => Math.round(value * 100) / 100;

  // Power is an item rating. Use the same weights for both sides, independent
  // of the current enemy or sword style. Rows already included in another
  // stat (e.g. the damage range around attack) have zero extra weight.
  function profile(s, item, type) {
    const rows = new Map();
    let points = 0;
    function stat(key, label, value, weight, unit = "", extra) {
      value = round(value);
      if (!value) return;
      rows.set(key, {key, label, value, unit, deltaUnit:unit === "%" ? "%p" : unit, ...extra});
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
        // The rows show one hit of this weapon beside its interval: the item's two-second numbers times the
        // kind's hit scale. A skill adds the same amount over an ordinary strike for every kind, so only the
        // strike inside it is scaled. `exact` keeps the value before the display rounding (U5).
        const scale = build.hitScale ?? 1, hits = gearHits.hitValues(build, scale);
        const hit = (key, label, value) => stat(key, label, Math.round(value), 0, "", {exact:value});
        stat("interval", "공격 간격", gearTiming(item.weaponKind ?? "sword", build.mods.haste || 0).interval, 0, "", {format:"interval"});
        stat("attack", "공격력", build.attack, 0);
        const [low, high] = gearHits.hitRange(build.minDamage, build.maxDamage, scale);
        stat("minDamage", "한 방 최소 피해", low, 0);
        stat("maxDamage", "한 방 최대 피해", high, 0);
        stat("critChance", "치명타 확률", build.critChance, 0, "%");
        // Kind traits appear on the kinds that have them: the mace passes blocked hits, axe and mace wound deeper.
        if (build.passesBlocks) stat("blockedDamagePercent", "막힌 타격 전달", build.blockedDamagePercent, 0, "%");
        stat("deepWounds", "깊은 상처 확률", build.deepWounds || 0, 0, "%");
        // An all-style mix of normalized hit values, adjusted for 1.5x
        // criticals and the two defensive faces on the enemy die.
        // Attack speed adds ordinary strikes only (hand-over §5).
        const mix = .55 * build.strike * (1 + (build.mods.haste || 0) / 100) + .2 * build.heavy / 2.1 +
          .15 * build.counter / 2.8 + .1 * build.rupture / .85;
        points += 4 * mix * (1 + build.critChance / 200) * (2 + build.blockedDamagePercent / 100) / 3;
        hit("heavy", "강공 피해", hits.heavy);
        hit("counter", "반격 피해", hits.counter);
        hit("strike", "일반 타격 피해", hits.strike);
        hit("rupture", "파열 피해", hits.rupture);
        stat("opening", "첫 타격 추가 피해", build.opening, 1, "%");
        stat("finish", blades.modDefs.finish.name, build.finish, 1, "%");
        for (const key of ["momentum", "cooldown", "wounds"]) {
          stat(key, blades.modDefs[key].name, build.mods[key] || 0, 1, "%");
        }
        // Attack speed is already in the score through the ordinary strike above; the row names the option.
        stat("haste", blades.modDefs.haste.name, build.mods.haste || 0, 0, "%");
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
    for (const mod of item.mods||[]) {
      const def=affixes.defs[mod.key];
      if (def) stat("affix-"+mod.key,def.name,affixes.effectiveValue(item,mod),type==="outfit"?2:1,"%");
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

  function totals(s,item,type,slot) {
    const rack=blades.state(s),outfitState=rack.outfit;
    const view=type==="outfit"?{...s,bladeForge:{...rack,outfit:{...outfitState,equipped:{...outfitState.equipped,[slot]:item?.id}}}}:s;
    const weapon=type==="blade"?item:battleWeapon(s);
    const chest=type==="chest"?item:blades.currentArmor(s);
    const stats=blades.skills(view,weapon,chest);
    const known=stats.affix?.applied||{};
    const exposure=outfit.build(view,undefined,[weapon,chest]).exposure;
    return {P10:stats.defense,P11:stats.skillWard,P12:stats.lastWard,S1:stats.mods.haste||0,
      S2:stats.critChance,S3:150,S4:stats.mods.momentum||0,S5:stats.mods.cooldown||0,S6:stats.mods.guard||0,
      S7:stats.mods.recovery||0,S8:stats.mods.fortify||0,S9:stats.mods.wounds||0,...known,
      S10:exposure.fire,S11:exposure.cold,S12:exposure.lightning};
  }
  return function compareGear(s, item, type, preferredSlot) {
    let slot = type, current;
    switch (type) {
      case "blade": slot = "weapon"; current = battleWeapon(s); break;
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
    const keysToCompare=[...new Set([...(item?.mods||[]),...(current?.mods||[])].map(m=>m.key).filter(k=>affixes.defs[k]))];
    if (keysToCompare.length && ["blade","chest","outfit"].includes(type)) {
      const now=totals(s,current,type,slot), next=equipped?now:totals(s,item,type,slot);
      for (const key of keysToCompare) {
        const value=round(next[key]||0),before=round(now[key]||0);
        rows.push({key:"total-"+key,label:affixes.defs[key].name+" · 착용 합계",value,before,delta:round(value-before),unit:"%",deltaUnit:"%p"});
      }
    }
    return {slot, current, equipped, score:candidate.score, currentScore:worn.score, delta:candidate.score - worn.score, rows};
  };
}

if (typeof module !== "undefined") module.exports = createGearComparison;
