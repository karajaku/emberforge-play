"use strict";
const RegionalGear = (() => {
  const blades = typeof module !== "undefined" ? require("./blade-rules.js") : BladeRules;
  const affixes = typeof module !== "undefined" ? require("./affix-craft.js") : AffixCraft;
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
  const elements = {fire:"화염", cold:"냉기", lightning:"번개"};
  const elementKeys = Object.keys(elements);
  const slots = [
    ["helm","투구"], ["shoulder","어깨보호구"], ["chest","흉갑","armor"],
    ["legs","다리보호구"], ["gloves","장갑"], ["neck","목걸이"],
    ["ring1","반지 1","ring"], ["ring2","반지 2","ring"], ["cloak","망토"],
  ].map(([key,name,kind=key]) => ({key,name,kind}));
  const kinds = {helm:"투구", shoulder:"어깨보호구", legs:"다리보호구", gloves:"장갑", neck:"목걸이", ring:"반지", cloak:"망토"};
  const profiles = {
    moss:  {fire:-30, cold:35, lightning:0},
    maple: {fire:45, cold:-30, lightning:0},
    gorge: {fire:10, cold:-25, lightning:45},
    heart: {fire:30, cold:15, lightning:-35},
  };
  const affinities = {boar:"cold", wolf:"fire", moth:"lightning", golem:"cold", tree:"fire"};
  const blank = () => ({fire:0,cold:0,lightning:0});
  function profile(rank, kind) {
    const region = trail.region(rank), result = {...profiles[region.id]};
    if (kind === region.boss) {
      for (const key of elementKeys) if (result[key] > 0) result[key] += 10;
    } else if (Object.hasOwn(affinities,kind)) result[affinities[kind]] += 5;
    return result;
  }
  function state(s) {
    const forge = blades.state(s);
    return forge.outfit ??= {version:1,serial:0,items:[],equipped:{}};
  }
  function preferredElement(rank) {
    const regional = profile(rank);
    return elementKeys.find(key => regional[key] < 0);
  }
  function name(i) {
    if (i.unique) return affixes.uniqueNames[affixes.kinds.indexOf(i.kind)];
    return elements[i.element] + (i.mode === "expose" ? " 침식의 " : " 깃든 ") + kinds[i.kind];
  }
  function effect(i) {
    const depth = Math.floor((i.base - 1) / 4);
    if (i.mode === "expose") return {conversion:10+i.grade+depth,exposure:14+2*i.grade+i.level+depth};
    return {conversion:22+3*i.grade+i.level+depth,exposure:0};
  }
  function quote(i) {
    return {cost:blades.cost(i),success:blades.rate(i),destroy:blades.destroyRate(i)};
  }
  const salvageOre = item => 1 + item.grade;
  function build(s, override, mainEquipment) {
    const kit = s.bladeForge?.outfit;
    const conversion = blank(), exposure = blank();
    const equipped = {...kit?.equipped};
    if (override) equipped[override.slot] = override.id;
    for (const id of new Set(Object.values(equipped))) {
      const i = kit?.items.find(item => item.id === id);
      if (!i) continue;
      const bonus = effect(i);
      conversion[i.element] += bonus.conversion;
      exposure[i.element] = Math.min(45, exposure[i.element] + bonus.exposure);
    }
    const weapons=s.bladeForge?.items||[];
    const blade=s.affixWallet?.journeyId==="j:"+s.weapon?.recordId ? {...s.weapon,promotionGrade:s.weapon.grade} : weapons.find(i=>i.id===s.bladeForge?.equipped);
    const armor=s.bladeForge?.armors?.find(i=>i.id===s.bladeForge.armorEquipped);
    const parts=[...(mainEquipment||[blade,armor]),...(kit?.items||[]).filter(i=>Object.values(equipped).includes(i.id))];
    for (const item of parts.filter(Boolean)) for (const mod of item.mods||[]) {
      const k={S10:"fire",SN13:"fire",S11:"cold",SN14:"cold",S12:"lightning",SN15:"lightning"}[mod.key];
      const value = affixes.effectiveValue(item,mod);
      if (k) exposure[k]=Math.min(45,exposure[k]+value);
      if (mod.key==="SN108") for (const element of elementKeys) exposure[element]=Math.min(45,exposure[element]+value);
    }
    const total = Object.values(conversion).reduce((a,b) => a+b,0);
    if (total > 80) {
      // Preserve the exact total displayed on the loadout, including for mixed elements.
      const byRemainder = [...elementKeys].sort((a,b) => (80*conversion[b])%total - (80*conversion[a])%total);
      let remaining = 80;
      for (const key of elementKeys) {
        conversion[key] = Math.floor(80*conversion[key]/total);
        remaining -= conversion[key];
      }
      for (const key of byRemainder.slice(0,remaining)) conversion[key]++;
    }
    return {conversion,exposure};
  }
  function preview(s, item, slot) {
    const kit = s.bladeForge.outfit;
    const worn = kit.items.find(other => other.id === kit.equipped[slot]);
    const offered = effect(item), removed = worn && effect(worn);
    const before = build(s), after = build(s, {slot, id:item.id});
    const rows = [];
    for (const stat of ["conversion", "exposure"]) {
      for (const element of elementKeys) {
        const previous = before[stat][element], value = after[stat][element];
        // Keep a directly affected stat at its cap visible even when the swap
        // changes nothing. Other elements appear only if the cap redistributes them.
        if (value === previous && !(item.element === element && offered[stat]) &&
          !(worn?.element === element && removed[stat])) continue;
        const conversion = stat === "conversion";
        rows.push({key:stat + "-" + element, label:elements[element] + (conversion ? " 피해 전환" : " 저항 감소"),
          value, before:previous, delta:value - previous, unit:conversion ? "%" : "%p", deltaUnit:"%p"});
      }
    }
    return rows;
  }
  function effective(resistances, kit) {
    return Object.fromEntries(elementKeys.map(k => [k,Math.max(-60,resistances[k]-kit.exposure[k])]));
  }
  function multiplier(resistances, kit) {
    const resistance = effective(resistances, kit);
    return 1 - elementKeys.reduce((sum,k) => sum + kit.conversion[k]*resistance[k],0)/10000;
  }
  function damageProfile(h) {
    const a = h.bladeCombat.affix, n = a?.live;
    if (!n) return h.fieldKit ? multiplier(profile(h.territoryRank || h.rank,h.enemyKind),h.fieldKit) : 1;
    const kit = h.fieldKit || {conversion:blank(),exposure:Object.fromEntries(elementKeys.map((key,i)=>[key,a.exposure[i]]))};
    const resist = effective(profile(h.territoryRank || h.rank || 1,h.enemyKind),kit);
    const converted = elementKeys.reduce((sum,key)=>sum + kit.conversion[key],0);
    const parts = {
      physical:(1-converted/100)*(1+(n.PN15||0)/100), element:0, flatPhysical:n.PN07||0, flatElement:0
    };
    for (const [i,key] of elementKeys.entries()) {
      const resistance = 1-resist[key]/100;
      parts.element += kit.conversion[key]/100 * resistance * (1+Math.min(80,(n.PN16||0)+(n.PN107||0))/100);
      parts.flatElement += (n[["PN08","PN09","PN10"][i]]||0) * resistance * (1+Math.min(80,n.PN107||0)/100);
    }
    return parts;
  }
  const capacity = 64;
  function dropChance(s, rank) {
    return !s.bladeForge?.outfit?.serial || rank % 5 === 0 ? 100 : 35;
  }
  function reward(s,h,rng,awarded = false) {
    const kit = state(s);
    const first = kit.serial === 0;
    const chance = awarded ? 100 : dropChance(s,h.rank);
    if (chance < 100 && rng() * 100 >= chance) return {};
    if (kit.items.length >= capacity) {
      s.bladeForge.ore++;
      return {outfitSalvaged:true};
    }
    const rank = h.territoryRank || h.rank;
    const weak = preferredElement(rank);
    const pick = keys => keys[blades.integer(0,keys.length-1,rng)];
    const element = first || rng()<.35 ? weak : pick(elementKeys);
    const item = {id:"g"+(++kit.serial),kind:first ? "ring" : pick(Object.keys(kinds)),element,
      mode:first || rng()<.6 ? "infuse" : "expose",rank:h.rank,base:1+Math.floor((rank-1)/5),
      grade:blades.rollGrade(h.rank,rng),level:0};
    if (h.affixRules===1) affixes.generateDrop(item,rng);
    kit.items.push(item);
    return {outfitDrop:{...item}};
  }
  function act(s, action, arg, rng, pay) {
    const kit = state(s);
    const fail = message => ({ok:false,message});
    const ok = (message,kind="info") => ({ok:true,message,kind});
    if (typeof arg !== "string") return fail("장비를 선택하세요.");
    if (action === "outfitEquip" || action === "outfitUnequip") {
      const [pos,id,...extra] = arg.split(":");
      const slot = slots.find(v=>v.key===pos && v.kind!=="armor");
      const item = kit.items.find(i=>i.id===id);
      if (extra.length || !slot || !item || item.kind!==slot.kind) return fail("부위에 맞는 장비를 선택하세요.");
      if (action === "outfitUnequip") {
        if (kit.equipped[pos]!==id) return fail("착용 장비가 바뀌었습니다.");
        delete kit.equipped[pos];
        return ok(name(item)+" 해제");
      }
      if (Object.values(kit.equipped).includes(id)) return fail("이미 착용한 장비입니다.");
      if (item.unique==="ring" && Object.entries(kit.equipped).some(([where,other])=>where!==pos && kit.items.find(i=>i.id===other)?.unique==="ring")) return fail("같은 유니크 반지는 하나만 착용할 수 있습니다.");
      kit.equipped[pos]=id;
      return ok(name(item)+" 착용");
    }
    const index = kit.items.findIndex(i => i.id === arg);
    if (index < 0) return fail("장비를 확인하세요.");
    const item=kit.items[index], worn=Object.values(kit.equipped).includes(arg);
    if (action === "outfitSalvage" && !worn) {
      kit.items.splice(index,1);
      s.bladeForge.ore += salvageOre(item);
      return ok(name(item)+" 분해 · 각인석 +"+salvageOre(item));
    }
    if (action!=="outfitForge" || !worn) return fail("장비의 착용 상태를 확인하세요.");
    return blades.enhance(s,item,quote(item),name(item),rng,pay);
  }
  const between=(v,low,high)=>Number.isSafeInteger(v)&&v>=low&&v<=high;
  const record=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  function validItem(i,serial) {
    return record(i) && (i.mods===undefined || i.affixVersion===1) && affixes.validState(i) && typeof i.id==="string" && /^g[1-9]\d*$/.test(i.id) &&
      between(Number(i.id.slice(1)),1,serial) && typeof i.kind==="string" && Object.hasOwn(kinds,i.kind) &&
      typeof i.element==="string" && Object.hasOwn(elements,i.element) &&
      ["infuse","expose"].includes(i.mode) && between(i.level,0,20) && between(i.rank,1,60) &&
      between(i.base,1,12) && between(i.grade,0,3);
  }
  function valid(kit) {
    if (!record(kit) || kit.version!==1 || !between(kit.serial,0,Number.MAX_SAFE_INTEGER) ||
        !Array.isArray(kit.items) || kit.items.length>capacity || !record(kit.equipped)) return false;
    if (!kit.items.every(i=>validItem(i,kit.serial)) || new Set(kit.items.map(i=>i.id)).size!==kit.items.length) return false;
    const ids=Object.values(kit.equipped);
    return new Set(ids).size===ids.length && ids.filter(id=>kit.items.find(i=>i.id===id)?.unique==="ring").length<=1 && Object.entries(kit.equipped).every(([key,id])=>{
      const slot=slots.find(v=>v.key===key && v.kind!=="armor");
      return slot && kit.items.some(i=>i.id===id && i.kind===slot.kind);
    });
  }
  function validBuild(v) {
    const vector=(o,max)=>record(o)&&Object.keys(o).length===3&&elementKeys.every(k=>between(o[k],0,max));
    return record(v)&&vector(v.conversion,80)&&record(v.exposure)&&Object.keys(v.exposure).length===3&&elementKeys.every(k=>Number.isFinite(v.exposure[k]) && v.exposure[k]>=0 && v.exposure[k]<=45)&&Object.values(v.conversion).reduce((a,b)=>a+b,0)<=80;
  }
  return {slots,elements,capacity,state,name,effect,quote,salvageOre,profile,preferredElement,build,preview,effective,multiplier,damageProfile,dropChance,reward,act,valid,validItem,validBuild};
})();
if (typeof module !== "undefined") module.exports = RegionalGear;
