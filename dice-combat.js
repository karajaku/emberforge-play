/* Pure hunt rules shared by the production combat resolver and tests. */
const DiceCombat=(()=>{
  const outfit = typeof module !== "undefined" ? require("./regional-gear.js") : RegionalGear;
  const actions=['strike','strike','strike','block','block','heavyStrike'];
  const skills={heavyStrike:{name:'강공',icon:'hammer',cooldown:3,power:2},counter:{name:'반격',icon:'sword',cooldown:2,power:2.5}};
  const enemySkills = {
    charge: {name:'돌진',icon:'chevrons-up',hint:'힘을 모아 강하게 들이받습니다.'},
    fang: {name:'추격 송곳니',icon:'sword',hint:'내 체력이 절반 이하면 피해가 1.5배가 됩니다.'},
    dust: {name:'꿈가루',icon:'sparkles',hint:'방어하지 않으면 기세 1칸을 잃습니다.'},
    crush: {name:'수정 분쇄',icon:'hammer',hint:'방어해도 피해의 절반이 통과합니다.'},
    bind: {name:'뿌리 감옥',icon:'leaf',hint:'방어하지 않으면 강공 재사용이 1턴 지연됩니다.'},
    breath: {name:'안개 숨결',icon:'sparkles',hint:'내 주사위가 강공이면 숨결 피해가 1.5배가 됩니다.'},
    escape: {name:'줄행랑',icon:'coins',hint:'두 번째 턴이 끝날 때 달아납니다.'},
  };
  function skillStatus(h,key){
    const cooldown=Math.max(0,h.skillCooldowns?.[key]||0);
    if (h.bladeCombat) {
      const style=h.bladeCombat.style;
      const condition=key==="rupture"?style==="wound" && h.wounds>=3:
        key==="counter"?style==="counter" && !!h.counter:style==="heavy" && h.momentum>=2;
      return {cooldown,condition,ready:cooldown===0 && condition};
    }
    const condition=key==='counter'?!!h.counter:(h.rank>=2&&(h.momentum??1)>=2);
    return {cooldown,condition,ready:cooldown===0&&condition};
  }
  const face=rng=>Math.max(1,Math.min(6,1+Math.floor(rng()*6)));
  const face20 = rng => Math.max(1, Math.min(20, 1 + Math.floor(rng() * 20)));
  function attackCheck(roll, defense, base, bonus = 0) {
    const target = base + defense;
    const outcome = roll === 1 ? "miss" : roll === 20 ? "critical" :
      roll + bonus >= target ? "hit" : "blocked";
    return { defense, target, bonus, outcome };
  }
  const hits = check => check.outcome === "hit" || check.outcome === "critical";
  function replyDefenseBase(style, enemySkill) {
    if (!enemySkill) return 4;
    return style === "counter" ? 13 : 6;
  }

  function d20Turn(h, rng = Math.random) {
    return bladeTurn(h, face20(rng), null, rng, true);
  }
  function bladeTurn(h, playerFace, enemyFace, rng, d20 = false) {
    const st = h.bladeCombat,
      mods = st.mods;
    let player = d20 ? "strike" : actions[playerFace - 1];
    let enemy = d20 ? null : actions[enemyFace - 1];
    const ascended = st.ascension === st.style;
    // A counter smith converts an ordinary swing into a parry on a telegraphed enemy skill.
    if (
      !d20 && st.style === "counter" &&
      player === "strike" &&
      !h.counter &&
      enemy !== "block" &&
      h.enemySkillState.key !== "escape" &&
      h.enemySkillState.cooldown <= 1
    )
      player = "block";
    const block = player === "block",
      enemyBlocks = enemy === "block",
      power = enemy === "heavyStrike" ? 1.7 : 1;
    const proc = (key) => mods[key] > 0 && rng() * 100 < mods[key];
    const cooldowns = {
      heavyStrike: Math.max(0, (h.skillCooldowns?.heavyStrike || 0) - 1),
      counter: Math.max(0, (h.skillCooldowns?.counter || 0) - 1),
    };
    let wounds = h.wounds || 0,
      momentum = h.momentum ?? 1,
      counter = !!h.counter,
      skill = null,
      ruptured = !!h.ruptured,
      raw = 0;
    if (!block) {
      if (st.style === "counter" && counter && cooldowns.counter === 0) {
        skill = "counter";
        raw = st.counter;
        cooldowns.counter = 2;
        counter = false;
      } else if (st.style === "wound" && wounds >= 3) {
        skill = "rupture";
        raw = st.attack + st.rupture * wounds;
        if (ascended && !ruptured) raw *= .75;
        if (!d20) {
          ruptured = true;
          wounds = ascended ? 1 : 0;
        }
        if (player === "heavyStrike") raw *= st.heavy / (2.1 * st.attack);
      } else if (st.style === "heavy" && momentum >= 2 && !cooldowns.heavyStrike) {
        skill = "heavyStrike";
        if (d20) player = "heavyStrike";
        raw = st.heavy;
        cooldowns.heavyStrike = (proc("cooldown") ? 2 : 3) + Number(ascended);
      } else {
        raw = player === "heavyStrike" ? (st.heavy * 1.7) / 2.1 : st.strike;
        if (!d20 && st.style === "wound") wounds = Math.min(4, wounds + 1 + Number(proc("wounds")));
      }
      if (h.firstHit !== false) raw *= 1 + st.opening / 100;
      if (h.enemyHp <= h.enemyMax * 0.3) raw *= 1 + st.finish / 100;
      if (!d20 || skill === "heavyStrike") {
        momentum = skill === "heavyStrike" ? 0 :
          Math.min(2, momentum + 1 + Number(player === "strike" && proc("momentum")));
      }
    }
    // A rupture ignores a defensive face. Bleeding continues even during a block.
    const bleed = st.style === "wound" ? Math.round((h.wounds || 0) * st.rupture * 0.14) : 0;
    const pierces = skill==="rupture" || (ascended && skill==="heavyStrike");
    const elemental = h.fieldKit ? outfit.multiplier(outfit.profile(h.territoryRank || h.rank,h.enemyKind),h.fieldKit) : 1;
    const attack = d20 ? attackCheck(playerFace, face(rng), 2, pierces ? 2 : 0) : null;
    const landed = d20 && hits(attack);
    const partial = d20 && attack.outcome === "blocked" && st.blockedDamagePercent === 40;
    if (d20) {
      if (!landed && !partial) raw = 0;
      if (landed) {
        if (skill === "rupture") {
          ruptured = true;
          wounds = ascended ? 1 : 0;
        } else if (st.style === "wound") {
          wounds = Math.min(4, wounds + 1 + Number(proc("wounds")));
        }
        if (skill !== "heavyStrike") momentum = Math.min(2, momentum + 1 + Number(proc("momentum")));
      }
    }
    let critical = d20 && attack.outcome === "critical";
    if (raw > 0 && st.minDamage !== undefined) {
      if (st.maxDamage > st.minDamage) {
        const rolled = st.minDamage + Math.min(st.maxDamage-st.minDamage, Math.floor(rng()*(st.maxDamage-st.minDamage+1)));
        raw *= rolled/st.attack;
      }
      if (!d20 || attack.outcome === "hit") critical = rng()*100 < st.critChance;
    }
    if (critical) {
      raw *= 1.5;
      if (d20) attack.outcome = "critical";
    }
    const blocked = partial || (enemyBlocks && !pierces) ? (st.blockedDamagePercent ?? 25)/100 : 1;
    const damage = Math.min(h.enemyHp, Math.round(raw * elemental * blocked) + bleed);
    const enemySkillState = { ...h.enemySkillState, cooldown: Math.max(0, h.enemySkillState.cooldown - 1) };
    const key = enemySkillState.key;
    const fires = key === "escape" ? h.waveTurn >= 2 : !enemyBlocks && !enemySkillState.cooldown;
    const enemySkill = damage < h.enemyHp && fires ? key : null;
    if (enemySkill) enemySkillState.cooldown = enemySkillState.interval;
    let replyCheck = null;
    if (d20 && damage < h.enemyHp && key !== "escape") {
      enemyFace = face20(rng);
      enemy = "strike";
      replyCheck = attackCheck(enemyFace, face(rng), replyDefenseBase(st.style, enemySkill));
    }
    const guarded = d20 ? replyCheck?.outcome === "blocked" : block && !!enemySkill && enemySkill !== "escape";
    if (guarded) {
      counter = true;
      momentum = Math.min(2, momentum + 1);
    }
    const enemyLanded = d20 ? replyCheck !== null && hits(replyCheck) : !block;
    if (enemyLanded && enemySkill === "dust") momentum = Math.max(0, momentum - 1);
    if (enemyLanded && enemySkill === "bind")
      cooldowns.heavyStrike = Math.min(4, Math.max(2, cooldowns.heavyStrike + 1));
    const amplified =
      (enemySkill === "fang" && h.hp <= h.maxHp / 2) || (enemySkill === "breath" && player === "heavyStrike");
    const guard = d20
      ? enemyLanded ? 1 : guarded && enemySkill === "crush" ? 0.5 * (1 - (st.guardBonus || 0) / 100) : 0
      : block ? (enemySkill === "crush" ? 0.5 : 0.25) * (1 - (st.guardBonus || 0) / 100) : 1;
    const incoming =
      enemyBlocks || key === "escape" || damage >= h.enemyHp
        ? 0
        : h.enemyAttack * (enemySkill ? enemySkillState.power : power) * (amplified ? 1.5 : 1) *
          (replyCheck?.outcome === "critical" ? 1.5 : 1);
    const ironCounter=ascended && st.style==="counter";
    const fortified = !!h.fortified || (skill === "counter" && (!!mods.fortify || ironCounter));
    const shield = fortified ? (1-(mods.fortify||0)/100)*(ironCounter ? 0.65 : 1) : 1;
    const skillWard = enemySkill ? (st.skillWard || 0) : 0;
    const lastWard = h.hp <= h.maxHp / 2 ? (st.lastWard || 0) : 0;
    const armorEffect=st.armorAscension;
    const wardFactor=armorEffect==="skillWard" ? (enemySkill ? 0.7 : 1.08) : 1;
    // Rate the full incoming blow before guard, wards and the existing flat percentage reduction.
    const rating = st.armorRating || 0;
    const reduction = rating > 0 ? Math.min(.5, rating/(rating+8*incoming)) : 0;
    const hit=incoming * (1-reduction) * guard * (1-st.defense/100) * shield * (1-skillWard/100) * (1-lastWard/100) * wardFactor;
    const absorbed=armorEffect==="plating" ? Math.max(0,hit-h.maxHp*0.15)*0.5 : 0;
    const taken=Math.min(h.hp,Math.max(0,Math.round(hit-absorbed)));
    const defeated=damage>=h.enemyHp;
    let healPercent=guarded ? mods.guard || 0 : defeated ? mods.recovery || 0 : 0;
    if (armorEffect==="vitality" && defeated) healPercent+=h.hp<=h.maxHp/2 ? 10 : 4;
    if (armorEffect==="bracing" && guarded) healPercent+=6;
    const healed = taken < h.hp ? Math.min(h.maxHp - h.hp + taken, Math.round((h.maxHp * healPercent) / 100)) : 0;
    return {
      playerFace,
      enemyFace,
      player,
      enemy,
      damage,
      critical,
      taken,
      healed,
      wounds,
      ruptured,
      firstHit: h.firstHit !== false && (d20 ? !landed && !partial : block),
      fortified: fortified && !taken,
      skill,
      enemySkill,
      enemySkillState,
      skillCooldowns: cooldowns,
      counter,
      momentum,
      ...(d20 ? { attackCheck: attack, replyCheck } : {}),
    };
  }
  function journeyFactors(gear) {
    const work = gear.journeyWork, trait = gear.journeyTrait;
    return {
      counter:trait === 0 ? 1 / .97 : 1, finish:trait === 1 ? 1.1 : 1,
      lastGuard:trait === 2 ? .87 : 1, heavyTrait:trait === 3 ? 1.08 : 1,
      edge:work?.[0] === 1 ? .97 : 1, guard:work?.[0] === 1 ? .95 : 1,
      heavyWork:work?.[1] === 1 ? 1.07 : 1, finishWork:work?.[2] === 1 ? 1.03 : 1,
    };
  }
  function turn(h,playerFace,enemyFace,rng=Math.random) {
    if(![playerFace,enemyFace].every(n=>Number.isInteger(n)&&n>=1&&n<=6)) throw Error('Invalid D6');
    if (h.bladeCombat) return bladeTurn(h,playerFace,enemyFace,rng);
    const player=actions[playerFace-1],enemy=actions[enemyFace-1];
    const enabled=h.skillVersion===1 || h.skillVersion===2,cooldowns={heavyStrike:0,counter:0};
    if(enabled)for(const key of Object.keys(skills))cooldowns[key]=Math.max(0,(h.skillCooldowns?.[key]||0)-1);
    const start={...h,skillCooldowns:cooldowns};
    const skill=enabled&&player!=='block'?['counter','heavyStrike'].find(key=>skillStatus(start,key).ready)||null:null;
    const enemySkillState=enabled&&h.enemySkillState?{...h.enemySkillState,cooldown:Math.max(0,h.enemySkillState.cooldown-1)}:null;
    const charge=enemySkillState&&enemySkillState.cooldown===0&&enemy!=='block';
    const power=action=>action==='block'?0:action==='heavyStrike'?1.7:1;
    const mitigation=action=>action==='block'?.25:1;
    const armor=h.enemyKind==='stone'&&player==='strike'&&skill!=='heavyStrike'?.8:1;
    const factors = journeyFactors(h);
    const heavy = skill === "heavyStrike" || player === "heavyStrike";
    let bladePower = skill === "counter" ? factors.counter : 1;
    if (h.enemyHp < h.enemyMax * .3) bladePower *= factors.finish;
    if (heavy) bladePower *= factors.heavyTrait;
    bladePower *= factors.edge;
    if (heavy) bladePower *= factors.heavyWork;
    if (player !== "block") bladePower *= factors.finishWork;
    const damage=Math.min(h.enemyHp,Math.round(h.attack*(skill?skills[skill].power:power(player))*mitigation(enemy)*armor*bladePower));
    // Retain the game's player-first lethal priority; two defensive faces do no damage.
    const key = enemySkillState?.key || 'charge';
    const fires = key === 'escape' ? h.waveTurn >= 2 : charge;
    const enemySkill = fires && damage < h.enemyHp ? key : null;
    const amplified = (enemySkill === 'fang' && h.hp <= h.maxHp / 2) || (enemySkill === 'breath' && player === 'heavyStrike');
    const guard = enemySkill === 'crush' && player === 'block' ? .5 : mitigation(player);
    const tough = h.hp < h.maxHp * .35 ? factors.lastGuard : 1;
    const opening = h.journeyBattle && h.rank % 5 === 0 && h.waveTurn === 1 ? 1.25 : 1;
    const incoming = h.enemyAttack * opening * (h.armorDamageMultiplier ?? 1);
    const taken=damage>=h.enemyHp?0:Math.min(h.hp,Math.round(incoming*tough*factors.guard*(enemySkill?enemySkillState.power:power(enemy))*guard*(amplified?1.5:1)*(player==='block'?1-(h.guardReduction||0)/100:1)*(skill==='heavyStrike'?1.5:1)));
    if(skill)cooldowns[skill]=skills[skill].cooldown;
    if(enemySkill)enemySkillState.cooldown=enemySkillState.interval;
    const guarded = player === 'block' && !!enemySkill && enemySkill !== 'escape';
    let momentum = skill === 'heavyStrike' ? 0 : Math.min(2, (h.momentum ?? 1) + Number(player !== 'block' || guarded));
    if (player !== 'block' && enemySkill === 'dust') momentum = Math.max(0, momentum - 1);
    // A cooldown of one expires at the next turn's start. Two defers a ready skill by one turn.
    if (player !== 'block' && enemySkill === 'bind') cooldowns.heavyStrike = Math.max(2, cooldowns.heavyStrike + 1);
    return {playerFace,enemyFace,player,enemy,damage,taken,...(enabled?{skill,enemySkill,enemySkillState,skillCooldowns:cooldowns,counter:skill==='counter'?false:!!h.counter||guarded,momentum}: {})};
  }
  return {actions,skills,enemySkills,skillStatus,face,turn,d20Turn,replyDefenseBase,journeyFactors};
})();
if(typeof module!=='undefined') module.exports=DiceCombat;
