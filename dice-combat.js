/* Pure D6 rules shared by the production combat resolver and tests. */
const DiceCombat=(()=>{
  const actions=['strike','strike','strike','block','block','heavyStrike'];
  const skills={heavyStrike:{name:'강공',icon:'hammer',cooldown:3,power:2},counter:{name:'반격',icon:'sword',cooldown:2,power:2.5}};
  const enemySkills={charge:{name:'돌진',icon:'chevrons-up'}};
  function skillStatus(h,key){
    const cooldown=Math.max(0,h.skillCooldowns?.[key]||0);
    const condition=key==='counter'?!!h.counter:(h.rank>=2&&(h.momentum??1)>=2);
    return {cooldown,condition,ready:cooldown===0&&condition};
  }
  const face=rng=>Math.max(1,Math.min(6,1+Math.floor(rng()*6)));
  function turn(h,playerFace,enemyFace) {
    if(![playerFace,enemyFace].every(n=>Number.isInteger(n)&&n>=1&&n<=6)) throw Error('Invalid D6');
    const player=actions[playerFace-1],enemy=actions[enemyFace-1];
    const enabled=h.skillVersion===1,cooldowns={heavyStrike:0,counter:0};
    if(enabled)for(const key of Object.keys(skills))cooldowns[key]=Math.max(0,(h.skillCooldowns?.[key]||0)-1);
    const start={...h,skillCooldowns:cooldowns};
    const skill=enabled&&player!=='block'?['counter','heavyStrike'].find(key=>skillStatus(start,key).ready)||null:null;
    const enemySkillState=enabled&&h.enemySkillState?{...h.enemySkillState,cooldown:Math.max(0,h.enemySkillState.cooldown-1)}:null;
    const charge=enemySkillState&&enemySkillState.cooldown===0&&enemy!=='block';
    const power=action=>action==='block'?0:action==='heavyStrike'?1.7:1;
    const mitigation=action=>action==='block'?.25:1;
    const armor=h.enemyKind==='stone'&&player==='strike'&&skill!=='heavyStrike'?.8:1;
    const damage=Math.min(h.enemyHp,Math.round(h.attack*(skill?skills[skill].power:power(player))*mitigation(enemy)*armor));
    // Retain the game's player-first lethal priority; two defensive faces do no damage.
    const enemySkill=charge&&damage<h.enemyHp?'charge':null;
    const taken=damage>=h.enemyHp?0:Math.min(h.hp,Math.round(h.enemyAttack*(enemySkill?enemySkillState.power:power(enemy))*mitigation(player)*(player==='block'?1-(h.guardReduction||0)/100:1)*(skill==='heavyStrike'?1.5:1)));
    if(skill)cooldowns[skill]=skills[skill].cooldown;
    if(enemySkill)enemySkillState.cooldown=enemySkillState.interval;
    const guarded=player==='block'&&enemySkill==='charge';
    return {playerFace,enemyFace,player,enemy,damage,taken,...(enabled?{skill,enemySkill,enemySkillState,skillCooldowns:cooldowns,counter:skill==='counter'?false:!!h.counter||guarded,momentum:skill==='heavyStrike'?0:Math.min(2,(h.momentum??1)+(player!=='block'||guarded?1:0))}: {})};
  }
  return {actions,skills,enemySkills,skillStatus,face,turn};
})();
if(typeof module!=='undefined') module.exports=DiceCombat;
