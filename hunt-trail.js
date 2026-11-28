"use strict";
const HuntTrail = (() => {
  const journey = typeof module !== "undefined" ? require("./journey-rules.js") : JourneyRules;
  const monsters = typeof module !== "undefined" ? require("./hunt-monsters.js") : HuntMonsters;
  const enemies = {
    boar:     { name: "이끼등 멧돼지", sprite: "boar", skill: "charge", first: 2, interval: 3, power: 3 },
    wolf:     { name: "불갈기 늑대", sprite: "wolf", skill: "fang", first: 2, interval: 2, power: 2 },
    moth:     { name: "달가루 나방", sprite: "moth", skill: "dust", first: 1, interval: 3, power: 2 },
    golem:    { name: "결정 골렘", sprite: "golem", skill: "crush", first: 3, interval: 4, power: 3 },
    tree:     { name: "뿌리 파수꾼", sprite: "tree", skill: "bind", first: 2, interval: 3, power: 2 },
    tusk:     { name: "황금엄니 우두머리", sprite: "boar", skill: "charge", first: 2, interval: 4, power: 4 },
    alpha:    { name: "잿불 무리어미", sprite: "wolf", skill: "fang", first: 1, interval: 2, power: 3 },
    wyrm:     { name: "안개 비늘용", sprite: "dragon", skill: "breath", first: 2, interval: 3, power: 3 },
    elder:    { name: "천년 고목왕", sprite: "tree", skill: "bind", first: 1, interval: 3, power: 3 },
    goblin:   { name: "황금 고블린", sprite: "goblin", skill: "escape", first: 2, interval: 2, power: 2 },
  };
  const regions = [
    { id: "moss", name: "이끼숲 초입", pack: ["boar", "moth", "wolf"], boss: "tusk" },
    { id: "maple", name: "붉은 낙엽길", pack: ["wolf", "boar", "tree"], boss: "alpha" },
    { id: "gorge", name: "안개 바위골", pack: ["golem", "moth", "wolf"], boss: "wyrm" },
    { id: "heart", name: "고목의 심장", pack: ["tree", "golem", "moth"], boss: "elder" },
  ];
  const region = rank => regions[Math.floor((rank - 1) / 5) % regions.length];
  function lineup(rank, bonus = false) {
    const area = region(rank), index = ((rank - 1) % 5 + Math.floor((rank - 1) / 20)) % area.pack.length;
    const pack = [area.pack[index], area.pack[(index + 1) % area.pack.length]];
    if (bonus) pack.splice(1, 0, "goblin");
    if (rank % 5 === 0) pack.push(area.boss);
    return pack;
  }
  function enemy(rank, kind) {
    const area = region(rank);
    return { ...enemies[kind], kind, habitat: area.name, elite: kind === area.boss };
  }
  const pack = h => h.encounterVersion===1 ? h.encounters.map(e=>e.kind) : lineup(h.territoryRank || h.rank,h.bonusEncounter);
  const validEncounters = h => monsters.validEncounters(h,region(h.rank).pack);
  function opponent(rank, kind, journeyBattle = false) {
    if (journeyBattle) {
      const { enemyHp, enemyAttack } = journey.stageBalance(rank);
      if (kind === "goblin") return { hp: Math.round(enemyHp * .28), attack: 0 };
      if (kind === region(rank).boss) return { hp: Math.round(enemyHp * 1.4), attack: Math.round(enemyAttack * 1.15) };
      return { hp: enemyHp, attack: enemyAttack };
    }
    const base = 90 + Math.round(36 * (rank - 1) ** 1.65);
    const bossStage = rank % 5 === 0;
    const share = kind === "goblin" ? .14 : bossStage && kind !== region(rank).boss ? .25 : .5;
    return { hp: Math.max(1, Math.round(base * share)), attack: kind === "goblin" ? 0 : 20 + 9 * rank };
  }
  function enter(h, wave) {
    h.wave = wave;
    h.waveTurn = 1;
    const territory=h.territoryRank || h.rank;
    h.enemyKind = pack(h)[wave];
    if (h.encounterVersion===1) h.enemyGrade=h.encounters[wave].grade;
    const def = enemies[h.enemyKind];
    let stats;
    if (h.bladeCombat) {
      const blades=typeof module!=="undefined"?require("./blade-rules.js"):BladeRules;
      const a=blades.area(h.rank), boss=h.encounterVersion===1 ? h.enemyGrade==="boss" : h.enemyKind===region(territory).boss;
      const goblin=h.enemyKind==="goblin";
      const bossHealth=h.enemyKind==="wyrm"?2.7:h.enemyKind==="elder"?2.2:1.65;
      stats={hp:Math.round(a.enemyHp*(goblin?.36:boss?bossHealth:1)),attack:goblin?0:Math.round(a.enemyAttack*(boss?1.2:1))};
      if (h.encounterVersion===1 && !boss && !goblin) {
        stats.hp=Math.round(a.enemyHp*monsters.grades[h.enemyGrade].hp);
        stats.attack=Math.round(a.enemyAttack*monsters.grades[h.enemyGrade].attack);
      }
      if (h.encounterVersion!==1 && h.rank === 5 && boss) {
        stats.hp = Math.round(a.enemyHp * 1.85);
        stats.attack = Math.round(a.enemyAttack * 1.6);
      }
      h.wounds=0; h.ruptured=false; h.firstHit=true; delete h.usedAffixSkill;
    } else stats=opponent(h.rank, h.enemyKind, h.journeyBattle === 1);
    h.enemyMax = h.enemyHp = stats.hp;
    h.enemyAttack = stats.attack;
    h.enemySkillState = { key: def.skill, cooldown: def.first, interval: def.interval, power: def.power };
    h.last = def.name + " 출현";
    delete h.lastDice;
  }
  function awaitingNext(h) {
    return h?.trailVersion === 1 && (h.enemyHp === 0 || h.lastDice?.enemySkill === "escape" || h.ended === "escape");
  }
  return { region, lineup, pack, validEncounters, enemy, opponent, enter, awaitingNext };
})();
if (typeof module !== "undefined") module.exports = HuntTrail;
