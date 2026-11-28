"use strict";
const HuntLoot = (() => {
  const baseGradeNames = ["베이스 I", "베이스 II", "베이스 III", "베이스 IV"];
  const itemRarities = [
    {key:"rare", name:"레어", minLines:4},
    {key:"magic", name:"매직", minLines:1},
    {key:"normal", name:"일반", minLines:0},
  ];
  function itemRarity(item) {
    // Owned gear has mods. A hunt receipt keeps only the count at drop time.
    if (item.unique) return {key:"unique",name:"유니크"};
    const lines = item.mods?.length ?? item.lines ?? 0;
    return itemRarities.find(rarity => lines >= rarity.minLines);
  }
  const baseGradeRules = [
    { caps: [1, 1], min: 0, max: 2 },
    { caps: [2, 1], min: 2, max: 3 },
    { caps: [2, 2], min: 3, max: 4 },
    { caps: [3, 3], min: 4, max: 6 },
  ];
  // Grade rolls use basis points. Equipment types roll independently.
  function weights(rank, bossBonus=true) {
    const boss = bossBonus && rank % 5 === 0;
    const rare = (400 + 20 * (rank - 1)) * (boss ? 1.5 : 1);
    const epic = rank < 11 ? 0 : (50 + 10 * (rank - 11)) * (boss ? 2 : 1);
    const legend = rank < 31 ? 0 : (2 + 2 * (rank - 31)) * (boss ? 2.5 : 1);
    return [10000 - rare - epic - legend, rare, epic, legend];
  }
  function dropOdds(rank, first = false) {
    const itemPercent = rank % 5 === 0 || (first && rank % 5 === 1) ? 100 : 20;
    const distribution = weights(rank);
    return {
      itemPercent,
      grades: distribution.map((w) => w / 100),
      perWin: distribution.map((w) => (w * itemPercent) / 10000),
    };
  }
  function rollGrade(rank, rng, bossBonus=true) {
    let roll = Math.min(9999, Math.floor(rng() * 10000));
    const chances = weights(rank,bossBonus);
    for (let grade = 0; grade < 3; grade++) {
      if (roll < chances[grade]) return grade;
      roll -= chances[grade];
    }
    return 3;
  }
  const armorDefs = {};
  function mod(side, key, name, ranges) {
    armorDefs[key] = { side, name, ranges };
  }
  const small = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ];
  const defense = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ];
  mod("prefix", "vitality", "최대 체력", small);
  mod("prefix", "plating", "상시 피해 감소", defense);
  mod("prefix", "bracing", "방어 중 피격 감소", [
    [3, 5],
    [6, 8],
    [9, 11],
    [12, 14],
  ]);
  mod("prefix", "skillWard", "적 스킬 피격 감소", small);
  mod("suffix", "mending", "처치 후 최대 체력 회복", defense);
  mod("suffix", "parryHeal", "스킬 방어 시 최대 체력 회복", defense);
  mod("suffix", "lastWard", "체력 절반 이하 피격 감소", small);
  mod("suffix", "retaliation", "반격 후 다음 피격 감소", small);
  const armorStageNames = ["흉갑 연마", "수문장의 내구 시험", "이중 담금질"];
  return { baseGradeNames, itemRarity, baseGradeRules, dropOdds, rollGrade, armorDefs, armorStageNames };
})();
if (typeof module !== "undefined") module.exports = HuntLoot;
