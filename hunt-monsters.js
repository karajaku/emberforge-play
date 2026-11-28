"use strict";
// HM1-R2: probabilities are per defeated monster, not per stage or chest.
const HuntMonsters = (() => {
  const bossKinds = Object.freeze(["tusk", "alpha", "wyrm", "elder"]);
  const grades = Object.freeze({
    normal: {name:"일반",chance:70,hp:1,attack:1,gear:45,ember:8,ore:50,oreCount:1,fiber:40,shards:25,charm:.8,gold:.5,rarities:[80,19,.99,.01],emberMultipliers:[1,1,1]},
    magic: {name:"매직",chance:20,hp:1.25,attack:1.1,gear:60,ember:15,ore:75,oreCount:1,fiber:50,shards:40,charm:2,gold:.65,rarities:[45,50,4.9,.1],emberMultipliers:[1,1.25,2]},
    rare: {name:"레어",chance:8,hp:1.6,attack:1.2,gear:80,ember:30,ore:100,oreCount:1,fiber:70,shards:65,charm:5,gold:.85,rarities:[15,55,29.5,.5],emberMultipliers:[1,1.5,4]},
    boss: {name:"우두머리",chance:2,hp:1.65,attack:1.2,gear:100,ember:60,ore:100,oreCount:2,fiber:100,shards:100,charm:15,gold:1.25,rarities:[5,45,49,1],emberMultipliers:[1,2,8]},
  });
  const gradeKeys = Object.keys(grades), rarities = ["normal","magic","rare","unique"];
  const baseEmberWeights = [2200,1700,800,600,2500,600,100,800,100,600];
  const emberClasses = [0,0,1,1,0,1,2,1,2,1];
  const materialRarities = {ore:"보통",fiber:"보통",shards:"희귀",spirit:"희귀",smith:"매우 희귀",god:"최희귀",seal:"매우 희귀",ascensionSeal:"최희귀"};
  const validStage = n => Number.isSafeInteger(n) && n >= 1;
  const itemLevel = n => Math.min(60, n);
  function weighted(weights, rng) {
    const draw = rng();
    if (!(draw >= 0 && draw < 1)) throw RangeError("Invalid random draw");
    let value = draw * weights.reduce((a,b)=>a+b,0);
    for (let i=0;i<weights.length;i++) if ((value -= weights[i]) < 0) return i;
    return weights.length-1;
  }
  const pick = (values,rng) => values[weighted(values.map(()=>1),rng)];
  function create(rank, pack, rng, challenge) {
    if (challenge !== undefined) return [
      {kind:pick(pack,rng),grade:"normal"}, {kind:pick(pack,rng),grade:"normal"},
      {kind:bossKinds[challenge],grade:"boss"},
    ];
    const result = Array.from({length:2},()=>{
      const grade=gradeKeys[weighted(gradeKeys.map(k=>grades[k].chance),rng)];
      return {kind:pick(grade==="boss" ? bossKinds : pack,rng),grade};
    });
    if (rng()<.15) result.splice(1,0,{kind:"goblin",grade:"rare"});
    return result;
  }
  function validEncounters(h, pack) {
    if (h?.encounterVersion!==1 || !Array.isArray(h.encounters) || ![2,3].includes(h.encounters.length) ||
        !Array.isArray(h.escapedWaves) || h.escapedWaves.length>1 || new Set(h.escapedWaves).size!==h.escapedWaves.length) return false;
    const challenge=h.challenge;
    if (challenge!==undefined && (!Number.isInteger(challenge) || challenge<0 || challenge>3 || h.rank!==60 || h.bonusEncounter)) return false;
    if (h.encounters.length !== (h.bonusEncounter || challenge!==undefined ? 3 : 2)) return false;
    if (h.bonusEncounter===true && h.encounters[1]?.kind!=="goblin") return false;
    if (!h.encounters.every((e,i)=>e && Object.keys(e).length===2 && Object.hasOwn(grades,e.grade) &&
      (e.kind==="goblin" ? i===1 && h.bonusEncounter===true && e.grade==="rare" :
        e.grade==="boss" ? bossKinds.includes(e.kind) : pack.includes(e.kind)))) return false;
    if (challenge!==undefined && (h.encounters[0].grade!=="normal" || h.encounters[1].grade!=="normal" ||
        h.encounters[2].grade!=="boss" || h.encounters[2].kind!==bossKinds[challenge])) return false;
    return h.escapedWaves.every(i=>Number.isInteger(i) && i<=h.wave && h.encounters[i]?.kind==="goblin");
  }
  function emberRarity(n) { return {key:["common","rare","exotic"][emberClasses[n-1]],name:["보통","희귀","최희귀"][emberClasses[n-1]]}; }
  function emberWeights(grade) { return baseEmberWeights.map((w,i)=>w*grades[grade].emberMultipliers[emberClasses[i]]); }
  function rollDrops(grade, rng) {
    const g=grades[grade], hit=p=>rng()*100<p;
    const gear=hit(g.gear) ? {type:["weapon","armor","outfit"][weighted([35,30,35],rng)],rarity:rarities[weighted(g.rarities,rng)]} : null;
    const ember=hit(g.ember) ? weighted(emberWeights(grade),rng)+1 : null;
    const ore=hit(g.ore) ? g.oreCount : 0, fiber=hit(g.fiber), shards=Number(hit(g.shards));
    const charms=[0,0,0];
    if (hit(g.charm)) charms[weighted([60,30,10],rng)]++;
    return {gear,ember,ore,fiber,shards,charms};
  }
  return {grades,gradeKeys,rarities,bossKinds,materialRarities,validStage,itemLevel,weighted,create,validEncounters,emberRarity,emberWeights,rollDrops};
})();
if (typeof module !== "undefined") module.exports=HuntMonsters;
