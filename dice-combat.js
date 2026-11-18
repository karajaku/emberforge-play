/* Pure D6 rules shared by the production combat resolver and tests. */
const DiceCombat=(()=>{
  const actions=['strike','strike','strike','block','block','heavyStrike'];
  const face=rng=>Math.max(1,Math.min(6,1+Math.floor(rng()*6)));
  function turn(h,playerFace,enemyFace) {
    if(![playerFace,enemyFace].every(n=>Number.isInteger(n)&&n>=1&&n<=6)) throw Error('Invalid D6');
    const player=actions[playerFace-1],enemy=actions[enemyFace-1];
    const power=action=>action==='block'?0:action==='heavyStrike'?1.7:1;
    const mitigation=action=>action==='block'?.25:1;
    const armor=h.enemyKind==='stone'&&player==='strike'?.8:1;
    const damage=Math.min(h.enemyHp,Math.round(h.attack*power(player)*mitigation(enemy)*armor));
    // Retain the game's player-first lethal priority; two defensive faces do no damage.
    const taken=damage>=h.enemyHp?0:Math.min(h.hp,Math.round(h.enemyAttack*power(enemy)*mitigation(player)*(player==='block'?1-(h.guardReduction||0)/100:1)));
    return {playerFace,enemyFace,player,enemy,damage,taken};
  }
  return {actions,face,turn};
})();
if(typeof module!=='undefined') module.exports=DiceCombat;
