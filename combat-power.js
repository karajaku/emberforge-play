/* Estimates one d20 opponent from the snapshot used by the fight. */
const CombatPower = (() => {
  const dice = typeof module !== "undefined" ? require("./dice-combat.js") : DiceCombat;
  const version = 1;
  const samples = 256;
  const unavailable = Object.freeze({ unavailable: true, blocked: true });
  let cachedKey, cachedResult;

  function sampleRng(index) {
    let seed = (0x6728ba7f + Math.imul(index, 0x9e3779b9)) >>> 0;
    return () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function winsWave(start, rng) {
    const h = { ...start };
    for (; h.waveTurn <= 40; h.waveTurn++) {
      const roll = dice.d20Turn(h, rng);
      if (![roll.damage, roll.taken, roll.healed].every(Number.isFinite)) return null;
      h.enemyHp -= roll.damage;
      if (h.enemyHp <= 0) return true;
      h.hp = Math.min(h.maxHp, h.hp - roll.taken + roll.healed);
      if (h.hp <= 0) return false;
      Object.assign(h, {
        wounds: roll.wounds, ruptured: roll.ruptured, firstHit: roll.firstHit, usedAffixSkill: roll.usedAffixSkill,
        fortified: roll.fortified, momentum: roll.momentum, counter: roll.counter,
        skillCooldowns: roll.skillCooldowns, enemySkillState: roll.enemySkillState,
      });
    }
    return false;
  }

  function estimate(h) {
    const { rank, territoryRank, enemyKind, waveTurn, hp, maxHp, enemyHp, enemyMax, enemyAttack,
      wounds, ruptured, firstHit, usedAffixSkill, fortified, momentum, counter, skillCooldowns, enemySkillState,
      bladeCombat, fieldKit } = h;
    if (![hp, maxHp, enemyHp, enemyMax, enemyAttack].every(n => Number.isFinite(n) && n > 0) ||
        !Number.isInteger(waveTurn) || waveTurn < 1 || waveTurn > 40 || !bladeCombat || !enemySkillState)
      return unavailable;
    const enemy = Math.max(1, Math.round(10 * Math.sqrt(enemyMax * enemyAttack)));
    if (!Number.isSafeInteger(enemy)) return unavailable;

    const input = { rank, territoryRank, enemyKind, waveTurn, hp, maxHp, enemyHp, enemyMax, enemyAttack,
      wounds, ruptured, firstHit, usedAffixSkill, fortified, momentum, counter, skillCooldowns, enemySkillState,
      bladeCombat, fieldKit };
    const key = JSON.stringify(input);
    if (key === cachedKey) return cachedResult;
    let wins = 0;
    for (let i = 0; i < samples; i++) {
      const win = winsWave(input, sampleRng(i));
      if (win === null) return unavailable;
      wins += Number(win);
    }

    const player = Math.floor(enemy * wins * 10 / (samples * 7));
    if (!Number.isSafeInteger(player)) return unavailable;
    cachedKey = key;
    return cachedResult = Object.freeze({ player, enemy, blocked: enemy > player, wins });
  }

  return { version, samples, estimate };
})();
if (typeof module !== "undefined") module.exports = CombatPower;
