/* Pure D6 rules shared by the production combat resolver and tests. */
const DiceCombat=(()=>{
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
  function bladeTurn(h, playerFace, enemyFace, rng) {
    const st = h.bladeCombat,
      mods = st.mods;
    let player = actions[playerFace - 1];
    const enemy = actions[enemyFace - 1];
    const ascended = st.ascension === st.style;
    // A counter smith converts an ordinary swing into a parry on a telegraphed enemy skill.
    if (
      st.style === "counter" &&
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
        ruptured = true;
        wounds = ascended ? 1 : 0;
        if (player === "heavyStrike") raw *= st.heavy / (2.1 * st.attack);
      } else if (st.style === "heavy" && momentum >= 2 && !cooldowns.heavyStrike) {
        skill = "heavyStrike";
        raw = st.heavy;
        cooldowns.heavyStrike = (proc("cooldown") ? 2 : 3) + Number(ascended);
      } else {
        raw = player === "heavyStrike" ? (st.heavy * 1.7) / 2.1 : st.strike;
        if (st.style === "wound") wounds = Math.min(4, wounds + 1 + Number(proc("wounds")));
      }
      if (h.firstHit !== false) raw *= 1 + st.opening / 100;
      if (h.enemyHp <= h.enemyMax * 0.3) raw *= 1 + st.finish / 100;
      momentum =
        skill === "heavyStrike" ? 0 : Math.min(2, momentum + 1 + Number(player === "strike" && proc("momentum")));
    }
    // A rupture ignores a defensive face. Bleeding continues even during a block.
    const bleed = st.style === "wound" ? Math.round((h.wounds || 0) * st.rupture * 0.14) : 0;
    const pierces = skill==="rupture" || (ascended && skill==="heavyStrike");
    const damage = Math.min(h.enemyHp, Math.round(raw * (enemyBlocks && !pierces ? .25 : 1)) + bleed);
    const enemySkillState = { ...h.enemySkillState, cooldown: Math.max(0, h.enemySkillState.cooldown - 1) };
    const key = enemySkillState.key;
    const fires = key === "escape" ? h.waveTurn >= 2 : !enemyBlocks && !enemySkillState.cooldown;
    const enemySkill = damage < h.enemyHp && fires ? key : null;
    if (enemySkill) enemySkillState.cooldown = enemySkillState.interval;
    const guarded = block && !!enemySkill && enemySkill !== "escape";
    if (guarded) {
      counter = true;
      momentum = Math.min(2, momentum + 1);
    }
    if (!block && enemySkill === "dust") momentum = Math.max(0, momentum - 1);
    if (!block && enemySkill === "bind")
      cooldowns.heavyStrike = Math.min(4, Math.max(2, cooldowns.heavyStrike + 1));
    const amplified =
      (enemySkill === "fang" && h.hp <= h.maxHp / 2) || (enemySkill === "breath" && player === "heavyStrike");
    const guard = block ? (enemySkill === "crush" ? 0.5 : 0.25) * (1 - (st.guardBonus || 0) / 100) : 1;
    const incoming =
      enemyBlocks || key === "escape" || damage >= h.enemyHp
        ? 0
        : h.enemyAttack * (enemySkill ? enemySkillState.power : power) * guard * (amplified ? 1.5 : 1);
    const ironCounter=ascended && st.style==="counter";
    const fortified = !!h.fortified || (skill === "counter" && (!!mods.fortify || ironCounter));
    const shield = fortified ? (1-(mods.fortify||0)/100)*(ironCounter ? 0.65 : 1) : 1;
    const taken = Math.min(
      h.hp,
      Math.max(
        0,
        Math.round(incoming * (1 - st.defense / 100) * shield),
      ),
    );
    const healPercent = guarded ? mods.guard || 0 : damage >= h.enemyHp ? mods.recovery || 0 : 0;
    const healed = taken < h.hp ? Math.min(h.maxHp - h.hp + taken, Math.round((h.maxHp * healPercent) / 100)) : 0;
    return {
      playerFace,
      enemyFace,
      player,
      enemy,
      damage,
      taken,
      healed,
      wounds,
      ruptured,
      firstHit: !!(block && h.firstHit !== false),
      fortified: fortified && !taken,
      skill,
      enemySkill,
      enemySkillState,
      skillCooldowns: cooldowns,
      counter,
      momentum,
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
    const trait = h.journeyTrait;
    let bladePower = 1;
    if (trait === 0 && skill === "counter") bladePower = 1 / .97;
    if (trait === 1 && h.enemyHp < h.enemyMax * .3) bladePower = 1.1;
    if (trait === 3 && (skill === "heavyStrike" || player === "heavyStrike")) bladePower = 1.08;
    const work = h.journeyWork;
    if (work?.[0] === 1) bladePower *= .97;
    if (work?.[1] === 1 && (skill === "heavyStrike" || player === "heavyStrike")) bladePower *= 1.07;
    if (work?.[2] === 1 && player !== "block") bladePower *= 1.03;
    const damage=Math.min(h.enemyHp,Math.round(h.attack*(skill?skills[skill].power:power(player))*mitigation(enemy)*armor*bladePower));
    // Retain the game's player-first lethal priority; two defensive faces do no damage.
    const key = enemySkillState?.key || 'charge';
    const fires = key === 'escape' ? h.waveTurn >= 2 : charge;
    const enemySkill = fires && damage < h.enemyHp ? key : null;
    const amplified = (enemySkill === 'fang' && h.hp <= h.maxHp / 2) || (enemySkill === 'breath' && player === 'heavyStrike');
    const guard = enemySkill === 'crush' && player === 'block' ? .5 : mitigation(player);
    const tough = trait === 2 && h.hp < h.maxHp * .35 ? .87 : 1;
    const opening = h.journeyBattle && h.rank % 5 === 0 && h.waveTurn === 1 ? 1.25 : 1;
    const incoming = h.enemyAttack * opening * (h.armorDamageMultiplier ?? 1);
    const taken=damage>=h.enemyHp?0:Math.min(h.hp,Math.round(incoming*tough*(work?.[0] === 1 ? .95 : 1)*(enemySkill?enemySkillState.power:power(enemy))*guard*(amplified?1.5:1)*(player==='block'?1-(h.guardReduction||0)/100:1)*(skill==='heavyStrike'?1.5:1)));
    if(skill)cooldowns[skill]=skills[skill].cooldown;
    if(enemySkill)enemySkillState.cooldown=enemySkillState.interval;
    const guarded = player === 'block' && !!enemySkill && enemySkill !== 'escape';
    let momentum = skill === 'heavyStrike' ? 0 : Math.min(2, (h.momentum ?? 1) + Number(player !== 'block' || guarded));
    if (player !== 'block' && enemySkill === 'dust') momentum = Math.max(0, momentum - 1);
    // A cooldown of one expires at the next turn's start. Two defers a ready skill by one turn.
    if (player !== 'block' && enemySkill === 'bind') cooldowns.heavyStrike = Math.max(2, cooldowns.heavyStrike + 1);
    return {playerFace,enemyFace,player,enemy,damage,taken,...(enabled?{skill,enemySkill,enemySkillState,skillCooldowns:cooldowns,counter:skill==='counter'?false:!!h.counter||guarded,momentum}: {})};
  }
  return {actions,skills,enemySkills,skillStatus,face,turn};
})();
if(typeof module!=='undefined') module.exports=DiceCombat;
