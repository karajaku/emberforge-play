"use strict";
const BladeRules = (() => {
  const loot = typeof module !== "undefined" ? require("./hunt-loot.js") : HuntLoot;
  const styles = { heavy: "강공", counter: "반격", wound: "상처" };
  const names = [
    "이끼철",
    "불갈기",
    "안개결정",
    "고목심",
    "청이끼 강철",
    "홍염 송곳니",
    "서리맥 결정",
    "고목 수심",
    "심층 이끼강",
    "잿불왕 송곳니",
    "용비늘 결정",
    "천년 심재",
  ];
  const traits = ["조우 첫 타격 피해 +20%", "체력 30% 이하 적에게 피해 +15%", "강공 피해 +12%", "반격 피해 +30%"];
  const powers = [35, 36, 37, 38, 41, 42, 43, 44, 48, 49, 50, 51];
  const bases = [
    { name: "순철 검신", power: 30, trait: "기본 검신", family: -1 },
    ...names.map((n, i) => ({ name: n + " 검신", power: powers[i], family: i % 4, trait: traits[i % 4] })),
  ];
  // All affixes are percentages. Tier 4 is the highest; each integer within a tier is equiprobable.
  const modDefs = {};
  function define(side, key, name, ranges) {
    modDefs[key] = { side, name, ranges };
  }
  const damage = [
    [4, 6],
    [7, 10],
    [11, 15],
    [16, 20],
  ];
  const utility = [
    [3, 5],
    [6, 9],
    [10, 13],
    [14, 18],
  ];
  define("prefix", "power", "무기 공격력", [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);
  define("prefix", "strike", "일반 타격 피해", damage);
  define("prefix", "heavy", "강공 피해", damage);
  define("prefix", "counter", "반격 피해", damage);
  define("prefix", "rupture", "파열 피해", damage);
  define("prefix", "finish", "체력 30% 이하 적 피해", damage);
  define("suffix", "momentum", "일반 타격 추가 기세 확률", utility);
  define("suffix", "cooldown", "강공 대기 2초 단축 확률", utility);
  define("suffix", "guard", "스킬 방어 시 최대 체력 회복", [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 5],
  ]);
  define("suffix", "fortify", "반격 후 다음 피격 감소", damage);
  define("suffix", "wounds", "상처 추가 중첩 확률", utility);
  define("suffix", "recovery", "처치 후 최대 체력 회복", [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);
  // AS1-1: shortens the own attack interval in forest hunts on the rule clock (hand-over §2.2).
  define("suffix", "haste", "공격속도", [
    [2, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);
  const weaponKeys = Object.keys(modDefs);
  Object.assign(modDefs,loot.armorDefs);
  const armorNames = ["순철 흉갑", ...names.map(n=>n+" 흉갑")];
  const value = (item, key) => item.mods.find((m) => m.key === key)?.value || 0;
  const craft = typeof module !== "undefined" ? require("./swordcraft.js") : Swordcraft;
  const marks = (item, key) => (item.marks || []).filter((mark) => mark === key).length;
  // Kind numbers of AS1-1 (hand-over §2.1): new forest hunts and every gear display. `interval` is the own
  // attack interval in ms; a hit is scaled by interval / 2000 inside the event resolver only.
  const weaponProfiles = {
    // `trait` and `trait2` are the two lines of the weapon detail (hand-over §7.4). Deep wounds: the chance,
    // on a hit, of one more wound; the wording names the chance so that it cannot read as "always".
    sword: {name:"한손검", trait:"일정한 타격 피해", power:1, spread:0, critChance:5, interval:2000},
    axe: {name:"도끼", trait:"강공 피해 +8%", trait2:"깊은 상처 · 맞힐 때 35% 확률로 상처 하나 더", power:1.01, spread:.30, critChance:5, heavyMultiplier:1.08, interval:2400, deepWounds:35},
    mace: {name:"철퇴", trait:"막힌 타격의 35% 전달", trait2:"깊은 상처 · 맞힐 때 45% 확률로 상처 하나 더", power:.96, spread:.16, critChance:3, blockedDamagePercent:35, passesBlocks:true,
      interval:2600, deepWounds:45},
    dagger: {name:"단검", trait:"치명타 확률 24% · 치명타 피해 150%", trait2:"상처 4개에서 파열", power:.92, spread:.1, critChance:24, interval:1500, woundGain:.75, ruptureAt:4},
  };
  // The numbers shipped before AS1-1. The tower, the guild target and hunts on the turn rules keep them
  // until AS1-2 (hand-over §2.1, R8, R9); dice-combat.js tells the mace by its 40.
  const legacyProfiles = {
    sword: {...weaponProfiles.sword},
    axe: {...weaponProfiles.axe, power:.97, heavyMultiplier:1.12},
    mace: {...weaponProfiles.mace, power:.98, blockedDamagePercent:40},
    dagger: {...weaponProfiles.dagger},
  };
  const weaponKinds = Object.keys(weaponProfiles);
  const weaponProfile = (item, legacy=false) => (legacy ? legacyProfiles : weaponProfiles)[item.weaponKind ?? "sword"];
  const name = item => item.type === "armor" ? armorNames[item.base] :
    (item.base ? names[item.base - 1] : "순철") + " " + weaponProfile(item).name;
  const attack = (item, level = item.level, legacy = false) =>
    Math.round(
      bases[item.base].power * weaponProfile(item, legacy).power *
        (1 + 0.08 * level) *
        (1 + value(item, "power") / 100) *
        (1 + 0.02 * marks(item, "edge")) *
        (1 + craft.grindBonus(item.grind, 2) / 100),
    );
  function weaponStats(item, level=item.level, legacy=false) {
    const power = attack(item,level,legacy);
    const profile = weaponProfile(item,legacy);
    const spread = Math.round(power * profile.spread);
    return {attack:power, minDamage:power-spread, maxDamage:power+spread, critChance:profile.critChance};
  }
  const armorWeights = {armor:8, helm:4, shoulder:3, legs:5, gloves:2, cloak:2};
  function armorRating(item, level=item.level ?? 0) {
    const weight = armorWeights[item.type || item.kind];
    if (!weight) return 0;
    return Math.round(weight * (1 + .18*item.base + .12*item.grade) * (1 + .08*level)) + level;
  }
  function outfitArmorRating(s) {
    const kit = s.bladeForge?.outfit;
    if (!kit) return 0;
    const worn = new Set(Object.values(kit.equipped));
    return kit.items.reduce((sum,item) => sum + (worn.has(item.id) ? armorRating(item) : 0), 0);
  }
  const caps = (r) => (r <= 10 ? [1, 1] : r <= 20 ? [2, 1] : r <= 40 ? [2, 2] : r <= 50 ? [3, 2] : [3, 3]);
  const itemCaps = item => item.lootVersion === 1 ? loot.baseGradeRules[item.grade].caps : caps(item.rank);
  const maxTier = (r) => (r <= 10 ? 1 : r <= 20 ? 2 : r <= 40 ? 3 : 4);
  function cost(item) {
    const baseFactor = 1 + Math.floor(Math.max(0, item.base - 1) / 4) * 0.25;
    const formerWeaponFee = Math.round((80 + 40 * item.level ** 1.8) * baseFactor);
    // The former ten slot prices added up to roughly twice the weapon fee.
    return Math.ceil(formerWeaponFee / 5);
  }
  const rates = [100, 100, 100, 95, 90, 85, 80, 80, 78, 75, 72, 70, 68, 65, 60, 55, 50, 45, 40, 35];
  const rate = (item) => rates[item.level] || 0;
  // Chance per attempt that a failed hit resets the item to +0. It is taken out of the hold share,
  // so the success chance and the single random draw stay as they were.
  const destroyRates = { 15: 1, 16: 2, 17: 3, 18: 4, 19: 5 };
  const destroyRate = (item) => Math.min(100 - rate(item), destroyRates[item.level] || 0);
  const riskNoticed = (s) => s.forgeRisk !== undefined;
  const income = (item) =>
    item && item.level >= 13
      ? Math.round(
          bases[item.base].power *
            (item.level - 12) *
            0.6 *
            (1 + 0.2 * marks(item, "yield")) *
            (1 + craft.grindBonus(item.grind, 1) / 100),
        )
      : 0;
  const salvageOre = item => 1 + item.mods.length;
  const armorRate = (s) => rate(currentArmor(s));
  const blade = (id, base, rank, level = 0) => ({ id, base, rank, level, grade: 0, mods: [] });
  function state(s) {
    if (!s.bladeForge) {
      const rank = Math.max(1, Math.min(60, s.huntBest || 0));
      const base = s.huntBest ? 1 + Math.floor((rank - 1) / 5) : 0;
      // Keep prior weapons and their progress intact. Give returning smiths a playable equivalent.
      const item = blade("b1", base, rank, Math.min(20, s.weapon?.level || 0));
      s.bladeForge = {
        version: 1,
        items: [item],
        serial: 1,
        equipped: item.id,
        style: "heavy",
        ore: 0,
        seals: 0,
        deployed: null,
        previousBest: s.best || 0,
        cleared: s.huntBest || 0,
        master: 3,
      };
    }
    return s.bladeForge;
  }
  const current = (s) => {
    const b = state(s);
    return b.items.find((i) => i.id === b.equipped);
  };
  function armors(s) {
    const b = state(s);
    if (!b.armors) {
      const starter = blade("a1",0,Math.max(1,b.cleared),Math.min(20,s.armor.level));
      Object.assign(starter,{type:"armor",grade:s.armor.grade});
      b.armors=[starter];
      b.armorEquipped=starter.id;
      b.armorSerial=1;
      if (s.hunt?.bladeCombat && !s.hunt.armorId) s.hunt.armorId=starter.id;
    }
    return b.armors;
  }
  function currentArmor(s) {
    return armors(s).find(i=>i.id===s.bladeForge.armorEquipped);
  }
  function armorStats(s, armor=currentArmor(s), level=armor.level, weapon=current(s), outfitRating=outfitArmorRating(s)) {
    const baseHealth=170 + 6*level + armor.base*2;
    const healthBonus= value(armor,"vitality")+2*marks(armor,"edge")+craft.grindBonus(armor.grind,2);
    const hp=Math.round(baseHealth*(1+healthBonus/100)*(1+.04*(s.huntLining||0)));
    const enhancedDefense=Math.round(level*1.3)+armor.grade*2+3*marks(weapon,"ward");
    const baseDefense=armor.lootVersion===1 ? enhancedDefense : Math.min(32,enhancedDefense);
    const defense=Math.min(45,baseDefense+Math.ceil(armor.base/3)+value(armor,"plating")+3*marks(armor,"ward"));
    return {hp,defense,armorRating:armorRating(armor,level)+outfitRating, outfitArmorRating:outfitRating};
  }
  // `legacy`: the kind numbers shipped before AS1-1 and none of the bound kind traits.
  function skills(s, item=current(s), armor=currentArmor(s), style=state(s).style, outfitRating, legacy=false) {
    const family = bases[item.base].family,
      weapon = weaponStats(item, item.level, legacy), a = weapon.attack;
    const profile = weaponProfile(item, legacy);
    const mods=Object.fromEntries(item.mods.map(m=>[m.key,m.value]));
    const combined={
      guard:value(armor,"parryHeal"), recovery:value(armor,"mending")+marks(armor,"yield")+(armor.grind||[]).filter(z=>z===1).length,
      fortify:value(armor,"retaliation"),
    };
    for (const [key,bonus] of Object.entries(combined)) if (bonus) mods[key]=(mods[key]||0)+bonus;
    const blockBonus=(1-craft.grindBonus(item.grind,0)/100)*(1-craft.grindBonus(armor.grind,0)/100)*(1-value(armor,"bracing")/100);
    const pct = (key) => 1 + value(item, key) / 100;
    return {
      ...weapon,
      blockedDamagePercent: profile.blockedDamagePercent ?? 25,
      ...armorStats(s,armor,armor.level,item,outfitRating),
      skillWard:value(armor,"skillWard"), lastWard:value(armor,"lastWard"),
      heavy: Math.round(a * 2.1 * pct("heavy") * (family === 2 ? 1.12 : 1) * (profile.heavyMultiplier ?? 1)),
      counter: Math.round(a * 2.8 * pct("counter") * (family === 3 ? 1.3 : 1) * (item.ascended?.style === "counter" ? 0.8 : 1)),
      rupture: Math.round(a * 0.85 * pct("rupture")),
      strike: Math.round(a * pct("strike")),
      opening: family === 0 ? 20 : 0,
      finish: value(item, "finish") + (family === 1 ? 15 : 0),
      style,
      ascension: item.ascended?.style,
      armorAscension: armor.ascended?.style,
      guardBonus: (1-blockBonus)*100,
      mods,
      // Kind traits bound to a hunt on the rule clock (hand-over §4.3).
      ...(legacy ? {} : { hitScale: profile.interval / 2000, woundGain: profile.woundGain ?? 1, ruptureAt: profile.ruptureAt ?? 3,
        deepWounds: profile.deepWounds ?? 0, passesBlocks: !!profile.passesBlocks }),
    };
  }
  const anchors = [
    [1, 30, 32, 8, 420],
    [5, 42, 73, 12, 900],
    [10, 60, 106, 16, 1800],
    [15, 77, 139, 19, 3000],
    [20, 88, 169, 23, 4400],
    [25, 92, 184, 24, 5000],
    [30, 97, 199, 25, 5800],
    [35, 101, 210, 26, 6500],
    [40, 106, 228, 27, 7200],
    [45, 109, 242, 28, 8000],
    [50, 114, 254, 29, 8800],
    [55, 121, 274, 30, 9600],
    [60, 125, 290, 31, 11000],
  ];
  function area(rank) {
    const i = anchors.findIndex((row) => rank <= row[0]),
      hi = anchors[i],
      lo = anchors[Math.max(0, i - 1)];
    const t = (rank - lo[0]) / (hi[0] - lo[0] || 1);
    const field = (n) => Math.round(lo[n] + t * (hi[n] - lo[n]));
    return { rank, attack: field(1), enemyHp: field(2), enemyAttack: field(3), g: field(4) };
  }
  function available(item) {
    const [p, s] = itemCaps(item);
    const prefixes = item.mods.filter((m) => modDefs[m.key].side === "prefix").length;
    const pool=item.type==="armor" ? Object.keys(loot.armorDefs) : weaponKeys;
    return pool.filter(
      (k) =>
        !item.mods.some((m) => m.key === k) &&
        (modDefs[k].side === "prefix" ? prefixes < p : item.mods.length - prefixes < s),
    );
  }
  const integer = (lo, hi, rng) => lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
  function addMod(item, key, rng) {
    const choices = available(item);
    if (!choices.length || (key && !choices.includes(key))) return false;
    key ||= choices[integer(0, choices.length - 1, rng)];
    item.mods.push(rollMod(key,item.rank,rng));
    return true;
  }
  function rollMod(key,rank,rng) {
    const roll=rng();
    return rollValue(key,Math.min(maxTier(rank),roll<.4?1:roll<.72?2:roll<.94?3:4),rng);
  }
  function rollValue(key,tier,rng) {
    const [lo,hi]=modDefs[key].ranges[tier-1];
    return {key,tier,value:integer(lo,hi,rng)};
  }
  function validMod(m,rank) {
    if (!m || !Object.hasOwn(modDefs,m.key) || !Number.isInteger(m.tier) || m.tier<1 || m.tier>maxTier(rank) || m.ascended!==undefined) return false;
    const [lo,hi]=modDefs[m.key].ranges[m.tier-1];
    return Number.isInteger(m.value) && m.value>=lo && m.value<=hi;
  }
  function rollReward(s, h, rng, awardedTypes) {
    const b = state(s),
      boss = h.rank % 5 === 0,
      first = h.rank > b.cleared && h.rank % 5 === 1;
    const firstWeaponChoice = h.rank === 1 && b.cleared === 0;
    b.equipmentVersion = 1;
    b.cleared = Math.max(b.cleared, h.rank);
    const ore = boss ? 3 : 1;
    b.ore += ore;
    if (boss) b.seals++;
    const materialPrize = "각인석 +" + ore + (boss ? " · 우두머리 인장 +1" : "");
    const itemPercent = awardedTypes ? 100 : loot.dropOdds(h.rank,first).itemPercent;
    const gearDrops = rollGear(s, h.rank, h.territoryRank, rng, awardedTypes ?? ["weapon","armor"], firstWeaponChoice, itemPercent);
    return {gearDrops,materialPrize};
  }
  // Gear-only roll shared by combat rewards and exploration finds. It never touches progress,
  // ore, seals, chests or gold; only item serials, the racks and the last weapon's kind change.
  function rollGear(s, rank, territoryRank, rng, types, firstWeaponChoice, itemPercent = 100) {
    const b = state(s);
    const base = 1 + Math.floor(((territoryRank || rank) - 1) / 5);
    const gearDrops=[];
    const armorRack=armors(s);
    for (const type of types) {
      if (itemPercent < 100 && rng()*100 >= itemPercent) continue;
      const isArmor=type==="armor";
      const id=isArmor ? "a"+ ++b.armorSerial : "b"+ ++b.serial;
      const item=blade(id,base,rank);
      if (isArmor) item.type="armor";
      item.lootVersion=1;
      item.grade=loot.rollGrade(rank,rng);
      const rule=loot.baseGradeRules[item.grade];
      const count=integer(rule.min,rule.max,rng);
      for (let i=0;i<count;i++) addMod(item,null,rng);
      (isArmor ? armorRack : b.items).push(item);
      gearDrops.push({id,type,base,grade:item.grade,lines:item.mods.length});
    }
    const weaponDrop = gearDrops.find(drop => drop.type === "weapon");
    if (weaponDrop) {
      // The first reward introduces another weapon type.
      const kind = weaponKinds[integer(firstWeaponChoice ? 1 : 0, weaponKinds.length-1, rng)];
      b.items.at(-1).weaponKind = kind;
      weaponDrop.weaponKind = kind;
    }
    return gearDrops;
  }
  function rewardText({gearDrops,materialPrize}) {
    const gear = gearDrops.map(item =>
      name(item) + " · " + loot.baseGradeNames[item.grade] + " · 옵션 " + item.lines + "줄");
    return [...gear, materialPrize].join(" · ");
  }
  function reward(s,h,rng) {
    return rewardText(rollReward(s,h,rng));
  }
  function enhance(s, item, quote, itemName, rng, pay) {
    if (item.finalTrial) return {ok:false, message:"진행 중인 마지막 돌파를 먼저 마치세요."};
    if (item.level >= 20) return {ok:false, message:"+20 완성 장비입니다."};
    if (s.gold < quote.cost) return {ok:false, message:"강화 골드가 부족합니다."};
    const destroy = Math.max(0, Math.min(100 - quote.success, quote.destroy || 0));
    // The player must have seen the one-time notice before any hit that can reset the item.
    if (destroy > 0 && !riskNoticed(s))
      return {ok:false, code:"riskNotice", message:"강화 파괴 안내를 먼저 확인하세요."};
    pay(s, quote.cost);
    const roll = rng() * 100;
    const success = roll < quote.success;
    if (destroy > 0) s.forgeRisk.attempts++;
    if (!success && roll >= 100 - destroy) {
      const from = item.level;
      item.level = 0;
      delete item.work;
      s.forgeRisk.breaks++;
      return {ok:true, kind:"loss", outcome:"destroy", from,
        message:itemName + " +" + from + " → +0 · 강화 파괴"};
    }
    if (success) item.level++;
    return {ok:true, kind:success ? "win" : "info", outcome:success ? "success" : "hold",
      message:itemName + " +" + item.level + (success ? " 강화 성공" : " 강화 유지")};
  }
  function act(s, action, arg, rng, pay) {
    const b = state(s);
    const armorAction=action.startsWith("bladeArmor");
    const item=armorAction ? currentArmor(s) : current(s);
    const ok = (message, kind = "win") => ({ ok: true, message, kind });
    const fail = (message) => ({ ok: false, message });
    const deployed = (id) => !!id && (id===b.deployed || id===b.extraDeployed);
    if (item.soulChoice && ["bladeEtch","bladePolish","bladeArmorEtch","bladeArmorPolish"].includes(action)) return fail("영혼각인 후보를 먼저 확정하세요.");
    switch (action) {
      case "bladeStyle":
        if (!Object.hasOwn(styles, arg)) return fail("검술을 확인하세요.");
        b.style = arg;
        return ok(styles[arg] + " 검술 선택");
      case "bladeMaster": {
        const i = Number(arg);
        if (b.cleared < 60 || !Number.isInteger(i) || i < 0 || i > 3) return fail("60단계 첫 승리가 필요합니다.");
        b.master = i;
        return ok(names[8 + i] + " 우두머리 추적");
      }
      case "bladeArmorEquip": {
        if (!armors(s).some(i=>i.id===arg)) return fail("방어구를 확인하세요.");
        b.armorEquipped=arg;
        return ok(name(currentArmor(s))+" 장착");
      }
      case "bladeArmorSalvage": {
        const rack=armors(s), index=rack.findIndex(i=>i.id===arg);
        if (index<0 || arg===item.id || arg===s.hunt?.armorId || rack[index].soulChoice) return fail("전투·장착 중인 방어구는 분해할 수 없습니다.");
        const ore=salvageOre(rack[index]);
        rack.splice(index,1);
        b.ore+=ore;
        return ok("방어구 분해 · 각인석 +"+ore);
      }
      case "bladeEquip": {
        const target = b.items.find((x) => x.id === arg);
        if (!target || deployed(target.id)) return fail("무기를 회수한 뒤 장착하세요.");
        b.equipped = target.id;
        return ok(name(target) + " 장착");
      }
      case "bladeDeploy": {
        const target = b.items.find((x) => x.id === arg);
        if (
          !target ||
          target.level < 13 ||
          target.soulChoice ||
          target.id === b.equipped ||
          target.id === s.hunt?.bladeId ||
          deployed(target.id) || (b.deployed && (b.extraDeployed || !(b.soul?.learned.land || s.imprints?.land)))
        )
          return fail("여분의 +13 이상 무기와 빈 배치 자리가 필요합니다.");
        if (b.deployed) b.extraDeployed=target.id;
        else b.deployed=target.id;
        return ok(name(target) + " 배치 · 분당 " + income(target) + " G");
      }
      case "bladeRecall": {
        const id=arg || b.deployed;
        if (!deployed(id)) return fail("배치한 무기를 확인하세요.");
        if (id===b.extraDeployed) b.extraDeployed=null;
        else { b.deployed=b.extraDeployed || null; b.extraDeployed=null; }
        return ok("무기를 보관함으로 회수했습니다.");
      }
      case "bladeSalvage": {
        const i = b.items.findIndex((x) => x.id === arg);
        if (i < 0 || arg === b.equipped || arg === s.hunt?.bladeId || deployed(arg) || b.items[i].soulChoice)
          return fail("전투·장착 중인 무기는 분해할 수 없습니다.");
        const n = salvageOre(b.items[i]);
        b.items.splice(i, 1);
        b.ore += n;
        return ok("무기 분해 · 각인석 +" + n);
      }
      case "bladeArmor":
      case "bladeForge": {
        if (arg && arg !== item.id) return fail("장착 장비가 바뀌었습니다.");
        return enhance(s, item, {cost:cost(item), success:rate(item), destroy:destroyRate(item)}, name(item), rng, pay);
      }
      case "bladeArmorEtch":
      case "bladeEtch": {
        const charge = arg ? 8 : 2;
        if (b.ore < charge || (arg && !b.seals))
          return fail("각인석 " + charge + "개" + (arg ? "와 우두머리 인장 1개" : "") + "가 필요합니다.");
        if (!addMod(item, arg, rng)) return fail("빈 접두·접미 자리와 중복 옵션을 확인하세요.");
        b.ore -= charge;
        if (arg) b.seals--;
        const m = item.mods.at(-1);
        return ok(modDefs[m.key].name + " +" + m.value + (m.key==="plating" ? "%p" : "%") + " 각인");
      }
      case "bladeArmorPolish":
      case "bladePolish": {
        const m = item.mods.find((x) => x.key === arg);
        if (!m || m.ascended || b.ore < 3) return fail("연마할 옵션과 각인석 3개가 필요합니다.");
        const [lo, hi] = modDefs[m.key].ranges[m.tier - 1];
        if (m.value >= hi) return fail("이미 이 등급의 최고 수치입니다.");
        b.ore -= 3;
        m.value = integer(lo, hi, rng);
        return ok(modDefs[m.key].name + " 연마 · " + m.value + (m.key==="plating" ? "%p" : "%"));
      }
    }
    return fail("알 수 없는 무기 행동입니다.");
  }
  function valid(b) {
    const nat = (n) => Number.isSafeInteger(n) && n >= 0,
      ids = new Set();
    if (
      !b ||
      b.version !== 1 ||
      (b.equipmentVersion !== undefined && b.equipmentVersion !== 1) ||
      !nat(b.serial) ||
      !nat(b.ore) ||
      !nat(b.cleared) ||
      b.cleared > 60 ||
      !nat(b.master) ||
      b.master > 3 ||
      !Object.hasOwn(styles, b.style) ||
      !Array.isArray(b.items) ||
      !b.items.length ||
      b.items.length > 120
    )
      return false;
    if (b.armors === undefined) {
      if (b.armorSerial !== undefined || b.armorEquipped !== undefined || b.items.some(i=>i?.lootVersion !== undefined)) return false;
    } else if (!Array.isArray(b.armors) || !b.armors.length || b.armors.length>120 || !nat(b.armorSerial) ||
      !b.armors.some(i=>i?.id===b.armorEquipped) || b.armors.some(i=>i?.type!=="armor")) return false;
    if (b.items.some(i=>i?.type!==undefined)) return false;
    for (const i of [...b.items,...(b.armors||[])]) {
      const armor=i?.type==="armor";
      if (
        !i ||
        (i.weaponKind !== undefined && (armor || !weaponKinds.includes(i.weaponKind))) ||
        typeof i.id !== "string" ||
        !(armor ? /^a[1-9]\d*$/ : /^b[1-9]\d*$/).test(i.id) ||
        Number(i.id.slice(1)) > (armor ? b.armorSerial : b.serial) ||
        ids.has(i.id) ||
        !nat(i.base) ||
        !bases[i.base] ||
        !nat(i.rank) ||
        i.rank < 1 ||
        i.rank > 60 ||
        !nat(i.level) ||
        i.level > 20 ||
        !Array.isArray(i.mods)
      )
        return false;
      if (
        !Number.isInteger(i.grade) || i.grade<0 || i.grade>3 ||
        (i.lootVersion!==undefined && i.lootVersion!==1) ||
        (!armor && i.lootVersion===undefined && i.grade!==0) ||
        (i.lootVersion===1 && i.mods.length<loot.baseGradeRules[i.grade].min) ||
        (i.marks !== undefined &&
          (!Array.isArray(i.marks) ||
            i.marks.length > 3 ||
            i.marks.some((m) => !["edge", "ward", "yield"].includes(m)))) ||
        (i.grind !== undefined &&
          (!Array.isArray(i.grind) || i.grind.length !== 3 || !i.grind.every((z) => [0, 1, 2].includes(z))))
      )
        return false;
      if (
        i.work !== undefined &&
        (!i.work ||
          !Number.isInteger(i.work.index) ||
          i.work.index < 0 ||
          i.work.index > 2 ||
          (i.work.index === 0 && !Array.isArray(i.work.passes)) ||
          (i.work.index === 1 && !["turn", "health", "enemy", "stamina", "offset"].every((k) => nat(i.work[k]))) ||
          (i.work.index === 2 && (!nat(i.work.dips) || i.work.dips > 2 || !Number.isFinite(i.work.started))))
      )
        return false;
      if (
        i.finalTrial !== undefined &&
        (!i.finalTrial ||
          i.level !== 19 ||
          !["edge", "ward", "yield"].includes(i.finalTrial.key) ||
          !nat(i.finalTrial.revision) ||
          !nat(i.finalTrial.id) ||
          !Array.isArray(i.finalTrial.loads))
      )
        return false;
      ids.add(i.id);
      const seen = { ...i, mods: [] };
      for (const m of i.mods) {
        if (!m || !available(seen).includes(m.key) || !nat(m.tier) || !m.tier || m.tier > maxTier(i.rank))
          return false;
        const [lo, hi] = modDefs[m.key].ranges[m.tier - 1];
        if (m.ascended===undefined ? !nat(m.value) || m.value<lo || m.value>hi : m.value!==0) return false;
        seen.mods.push(m);
      }
    }
    return (
      b.items.some(i=>i.id===b.equipped) &&
      nat(b.seals) &&
      (b.extraDeployed==null || (b.deployed && b.extraDeployed!==b.deployed && b.extraDeployed!==b.equipped && b.items.some(i=>i.id===b.extraDeployed && i.level>=13))) &&
      (b.deployed === null ||
        (b.deployed !== b.equipped && b.items.some((i) => i.id === b.deployed && i.level >= 13)))
    );
  }
  return {
    ...loot, armors, currentArmor, armorStats, armorRating, weaponKinds, weaponProfile, weaponStats, itemCaps,
    styles,
    bases,
    modDefs,
    state,
    current,
    name,
    attack,
    area,
    caps,
    cost,
    rate,
    destroyRate, destroyRates, riskNoticed,
    income,
    salvageOre, enhance,
    armorRate,
    skills,
    available, maxTier, integer, rollMod, rollValue, validMod,
    reward, rollReward, rollGear, rewardText,
    act,
    valid,
  };
})();
if (typeof module !== "undefined") module.exports = BladeRules;
