/* Presentation only: saved combat results are never delayed, rolled again or mutated. */
const HuntEffects=(()=>{
  let timers=[],animations=[],nodes=[],resolve=null,completion=Promise.resolve(),timeScale=1;
  function cancel(){
    timers.forEach(clearTimeout);timers=[];timeScale=1;
    animations.forEach(a=>a.cancel());animations=[];nodes.forEach(n=>n.remove());nodes=[];
    const arena=document.querySelector('.watch-arena');
    arena?.removeAttribute('data-phase');
    arena?.removeAttribute('data-duel-animating');
    document.querySelectorAll('.watch-roll').forEach(n=>n.classList.remove('rolling','waiting','chosen'));
    document.querySelectorAll('.watch-actor').forEach(n=>{delete n.dataset.attackAt;delete n.dataset.attacking;});
    document.querySelector('.watch-counter-status')?.style.removeProperty('visibility');
    if(resolve){GameSound.stop();const done=resolve;resolve=null;done();}
  }
  const later=(fn,ms)=>timers.push(setTimeout(fn,ms*timeScale));
  function animate(node,frames,options){if(node&&motionEnabled())animations.push(node.animate(frames,{...options,duration:options.duration*timeScale}));}
  // Times are authored at full duration and share the journey's half-duration scale.
  const d20Timing={player:0,enemy:1300,roll:660,prepare:220,contact:300,bossDelay:300,bossHold:1000,bossFade:156};
  const d20PreviewFrames=[0,104,218,362,506];
  const names={strike:'공격',block:'방어',heavyStrike:'강타'},icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  function checkLabel(outcome,side){
    return {miss:'빗나감',blocked:side==='player'?'막힘':'방어',hit:'명중',critical:'치명타'}[outcome];
  }
  function damageLabel(damage,outcome){
    const bleed=outcome==='miss';
    const limit=bleed?10000:100000;
    if(damage>=1000000&&damage<100000000) return '−'+fmt(damage/10000)+'만';
    if(damage>=limit&&damage<1000000) return '−'+(Math.floor(damage/1000)/10).toLocaleString('ko-KR')+'만';
    return '−'+healthAmount(damage);
  }
  function showBossGuard(arena,roll){
    const node=document.createElement('div');
    node.className='watch-spotlight';
    node.dataset.spotlight='enemy';
    node.setAttribute('aria-hidden','true');
    node.innerHTML='<div class="watch-spotlight-content"><div class="watch-spotlight-dice">'+
      '<div class="watch-spotlight-defense"><b>내 방어</b><div class="watch-spotlight-d6">'+roll.replyCheck.defense+'</div></div>'+
      '<div class="watch-spotlight-attack"><b>적 공격</b><div class="watch-spotlight-d20"><span>'+roll.enemyFace+'</span></div></div>'+
      '</div><strong class="watch-spotlight-verdict">'+DiceCombat.enemySkills[roll.enemySkill].name+' 막아냄</strong></div>';
    arena.append(node);nodes.push(node);
    later(()=>node.classList.add('leaving'),d20Timing.bossHold);
    later(()=>node.remove(),d20Timing.bossHold+d20Timing.bossFade);
  }
  function paintD20(arena,side,record){
    const host=arena.querySelector('[data-die="'+side+'"]'),die=host.querySelector('.watch-die');
    const check=side==='player'?record?.attackCheck:record?.replyCheck;
    const actor=side==='player'?'내 공격':'적 공격';
    if(check) host.dataset.outcome=check.outcome;
    else host.removeAttribute('data-outcome');
    die.dataset.action=check?'strike':'';
    die.textContent=check?record[side+'Face']:'';
    die.setAttribute('aria-label',check?actor+' d20 '+record[side+'Face']:actor+' 주사위 대기');
    host.querySelector('.watch-verdict').textContent=check?checkLabel(check.outcome,side):'';
    return host;
  }
  function paintImpact(arena,side,record,position){
    const popup=arena.querySelector('[data-impact-target="'+side+'"]');
    const check=side==='enemy'?record?.attackCheck:record?.replyCheck;
    const amount=check?(side==='enemy'?record.damage:record.taken):0;
    const bleed=!!amount&&check.outcome==='miss';
    popup.textContent=amount?damageLabel(amount,check.outcome):'';
    popup.toggleAttribute('data-bleed',bleed);
    popup.toggleAttribute('data-critical',!!amount&&check.outcome==='critical');
    if(amount) popup.title=(bleed?'출혈 피해 ':'피해 ')+fmt(amount);
    else popup.removeAttribute('title');
    if(position&&amount){
      const half=popup.offsetWidth/2;
      const x=Math.max(half+6,Math.min(position.width-half-6,position.x));
      const y=Math.max(6,Math.min(position.height-popup.offsetHeight-5,position.y-popup.offsetHeight*.7));
      popup.style.setProperty('--impact-x',x+'px');
      popup.style.setProperty('--impact-y',y+'px');
    }
    return popup;
  }
  function previewD20(arena,side,face,at){
    const host=arena.querySelector('[data-die="'+side+'"]'),die=host.querySelector('.watch-die');
    const actor=side==='player'?'내 공격':'적 공격';
    const random=crypto.getRandomValues(new Uint8Array(d20PreviewFrames.length));
    let previous=0;
    const eyes=Array.from(random,value=>{
      const excluded=previous?[previous,face].sort((a,b)=>a-b):[face];
      let eye=1+value%(20-excluded.length);
      for(const skipped of excluded)if(eye>=skipped)eye++;
      previous=eye;
      return eye;
    });
    later(()=>{
      arena.dataset.phase=side+'-roll';
      host.classList.remove('chosen');
      host.classList.add('rolling');
      host.removeAttribute('data-outcome');
      die.dataset.action='strike';
      die.textContent=eyes[0];
      die.setAttribute('aria-label',actor+' 주사위 굴리는 중');
      host.querySelector('.watch-verdict').textContent='';
    },at);
    for(const [index,time] of d20PreviewFrames.entries()){
      if(index)later(()=>{die.textContent=eyes[index];},at+time);
    }
    later(()=>{
      arena.dataset.phase=side+'-reveal';
      host.classList.remove('rolling');
      die.textContent=face;
      die.setAttribute('aria-label',actor+' d20 '+face);
    },at+d20Timing.roll);
  }
  function faceIcon(die,face){const action=DiceCombat.actions[face-1];die.innerHTML=icon(icons[action]);die.dataset.action=action;}
  function burst(actor,kind,damage,critical = false,showAmount = true){
    if(!actor||!motionEnabled())return;
    const node=document.createElement('div');node.className='hunt-burst '+kind;node.setAttribute('aria-hidden','true');
    node.innerHTML='<i class="hunt-cut"></i>'+Array.from({length:8},(_,i)=>'<i class="hunt-chip" style="--dx:'+Math.round(Math.cos(i*Math.PI/4)*68)+'px;--dy:'+Math.round(Math.sin(i*Math.PI/4)*60)+'px"></i>').join('')+
      (damage&&!showAmount?'':'<b>'+(damage?(critical?'치명타 ':'')+'−'+fmt(damage):icon('shield'))+'</b>');
    actor.append(node);nodes.push(node);later(()=>node.remove(),700);
  }
  function reaction(actor,kind,skillName){
    if(!actor||!motionEnabled())return;
    const labels={guard:'방어!',stopped:(skillName||'돌진')+' 저지!',direct:'직격!',broken:'방어 관통!'};
    const node=document.createElement('div');node.className='watch-reaction '+kind;node.dataset.reaction=kind;node.setAttribute('role','status');
    node.innerHTML='<b>'+icon(kind==='guard'||kind==='stopped'?'shield':'chevrons-up')+labels[kind]+'</b>'+(kind==='stopped'?'<small>반격 준비</small>':'');
    actor.append(node);nodes.push(node);later(()=>node.remove(),800);
  }
  function counterBonus(arena){
    const node=document.createElement('div');node.className='watch-counter-award';node.setAttribute('role','status');
    node.innerHTML=icon('coins')+'<b>반격 보너스 +25%</b><small>승리 시 지급</small>';
    arena.append(node);nodes.push(node);later(()=>node.remove(),1100);
  }
  function play(hit,before,roll){
    cancel();const arena=document.querySelector('.watch-arena');if(!arena)return false;
    const d20=!!roll?.attackCheck;
    // Journey combat animations run at half the authored duration.
    timeScale=before.journeyBattle===1 || before.bladeCombat ? .5 : 1;
    const firstCounter=!before.journeyBattle&&!before.bladeCombat&&(roll?roll.skill==='counter':hit.kind==='counter')&&!(before.ripostes>0);
    if(!motionEnabled()){if(firstCounter)counterBonus(arena);return false;}
    const bonusStatus=document.querySelector('.watch-counter-status');
    if(firstCounter&&bonusStatus)bonusStatus.style.visibility='hidden';
    completion=new Promise(done=>resolve=done);
    const actors={player:arena.querySelector('.player .watch-actor'),enemy:arena.querySelector('.enemy .watch-actor')};
    const meters={player:arena.querySelector('[data-side="player"]'),enemy:arena.querySelector('[data-side="enemy"]')};
    const end={player:Number(meters.player.getAttribute('aria-valuenow')),enemy:Number(meters.enemy.getAttribute('aria-valuenow'))};
    const start={player:before.hp,enemy:before.enemyHp};
    for(const side of ['player','enemy'])actors[side].removeAttribute('data-defeated');
    const actions=roll||{player:hit.kind==='block'||hit.kind==='parry'?'block':'strike',enemy:'strike'};
    for(const side of ['player','enemy'])updateHealthMeter(meters[side],start[side],start[side],false);
    const lead=roll&&!d20?1600:0;
    const escapes=roll?.enemySkill==='escape';
    const bossGuard=d20 && !!roll.enemySkill && !escapes && roll.replyCheck?.outcome==='blocked' &&
      roll.taken===0 && Game.huntEnemy(before).elite;
    const rollTime=d20Timing.roll+d20Timing.prepare;
    const lastContact=(roll?.replyCheck?d20Timing.enemy:d20Timing.player)+rollTime+d20Timing.contact;
    const escapeAt=lastContact+400;
    const impactPositions={};
    if(d20){
      arena.setAttribute('data-duel-animating','');
      const clearing=arena.querySelector('.watch-report').getBoundingClientRect();
      for(const side of ['player','enemy']){
        const actor=actors[side].getBoundingClientRect();
        impactPositions[side]={x:actor.left+actor.width/2-clearing.left,y:actor.top-clearing.top,width:clearing.width,height:clearing.height};
        paintD20(arena,side,before.lastDice);
        paintImpact(arena,side,before.lastDice,impactPositions[side]);
      }
      previewD20(arena,'player',roll.playerFace,d20Timing.player);
      if(roll.replyCheck)previewD20(arena,'enemy',roll.enemyFace,d20Timing.enemy);
    }
    function diceTurn(side,at){
      const host=arena.querySelector('[data-die="'+side+'"]'),die=host.querySelector('.watch-die');
      host.classList.add('waiting');host.querySelector('span').textContent='대기';die.setAttribute('aria-label','주사위 대기');
      later(()=>{
        arena.dataset.phase=side+'-roll';host.classList.remove('waiting');host.classList.add('rolling');host.querySelector('span').textContent=side==='player'?'내 주사위':'적 주사위';
        sound('dice');
        for(let i=0;i<8;i++)later(()=>faceIcon(die,1+(i*5+(side==='player'?0:3))%6),i*75);
        later(()=>{
          const face=roll[side+'Face'],action=roll[side];host.classList.remove('rolling');host.classList.add('chosen');die.innerHTML=icon(icons[action]);die.dataset.action=action;
          host.querySelector('span').textContent=names[action];die.setAttribute('aria-label',names[action]+' 주사위');
          animate(die,[{transform:'scale(1.25) rotate(-8deg)'},{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:230});
        },600);
      },at);
    }
    if(!d20){
      if(roll){diceTurn('player',0);diceTurn('enemy',800);}
      else arena.dataset.phase='reveal';
      later(()=>{arena.dataset.phase='reveal';},lead);
    }
    function skillFlare(side,key,at){if(!key)return;later(()=>{
      const def=side==='player' && before.bladeCombat && key==='rupture' ? {name:'파열',icon:'sword'} :
        side==='player' && before.bladeCombat && key==='heavyStrike' ? {name:'일격',icon:'hammer'} : (side==='player'?DiceCombat.skills:DiceCombat.enemySkills)[key];
      const chosen = before.bladeCombat?.style;
      const special = side === "player" && chosen && before.bladeCombat.ascension === chosen ? Game.endgame.transform[chosen].name : "";
      const banner=document.createElement('div');
      banner.className='watch-skill-flare '+key+' '+side;banner.dataset.skillSide=side;banner.innerHTML=icon(def.icon)+'<b>'+(special || def.name)+(d20?' 발동':'')+'</b>';
      // Timer callbacks may arrive late on busy devices; never overlap action callouts.
      arena.querySelectorAll('.watch-skill-flare').forEach(node=>node.remove());
      const fighter=arena.querySelector('.watch-fighter.'+side);
      const slot=fighter.querySelector(d20?(side==='player'?'.watch-skills':'.watch-enemy-skill'):'.watch-action');
      if(slot){slot.append(banner);nodes.push(banner);later(()=>banner.remove(),650);}
      animate(actors[side],[{filter:'brightness(1)'},{filter:'brightness(1.8) drop-shadow(0 0 14px '+(key==='counter'?'#73eac7':side==='enemy'?'#ff986d':'#ffd67a')+')',offset:.4},{filter:'brightness(1)'}],{duration:700});
    },at);}
    skillFlare('player',roll?.skill,d20?d20Timing.player+rollTime:lead+100);
    if(end.enemy>0)skillFlare('enemy',roll?.enemySkill,d20?(escapes?escapeAt:d20Timing.enemy+rollTime):lead+760);
    function guard(side){
      const ward=actors[side].querySelector('.watch-ward');
      animate(ward,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.1)',offset:.2},{opacity:.8,transform:'scale(1)',offset:.85},{opacity:0}],{duration:1200,fill:'forwards'});
    }
    for(const side of ['player','enemy'])if(actions[side]==='block')later(()=>guard(side),lead+150);
    function strike(side,at){
      const target=side==='player'?'enemy':'player',charge=side==='enemy'&&!!roll?.enemySkill,heavy=actions[side]==='heavyStrike'||(side==='player'&&!!roll?.skill)||charge;
      const check=d20?(side==='player'?roll.attackCheck:roll.replyCheck):null;
      if(actions[side]==='block'||d20&&!check)return;
      const dir=side==='player'?1:-1;
      const own=actors[side].getBoundingClientRect(),other=actors[target].getBoundingClientRect();
      const reach=check?.outcome==='miss' ? .38 : .65;
      const dx=(other.left+other.width/2-own.left-own.width/2)*reach,dy=(other.top+other.height/2-own.top-own.height/2)*reach;
      later(()=>{
        arena.dataset.phase=side+'-windup';
        actors[side].dataset.attackAt=String(performance.now());
        actors[side].dataset.attacking='true';
        const contact=`translate(${dx}px,${dy}px) rotate(${charge?0:dir*20}deg) scale(${charge?1.22:heavy?1.16:1.04})`;
        animate(actors[side],[{transform:'translate(0,0) rotate(0)',easing:'ease-in'},{transform:`translate(${-dx*.16}px,${-dy*.16}px) rotate(${-dir*(heavy?26:14)}deg)`,offset:.30,easing:'cubic-bezier(.15,.8,.2,1)'},{transform:contact,offset:.5},{transform:contact,offset:heavy?.66:.60,easing:'ease-out'},{transform:'translate(0,0) rotate(0)'}],{duration:600});
        later(()=>delete actors[side].dataset.attacking,600);
      },at);
      later(()=>{
        arena.dataset.phase=side+'-hit';
        const damage=side==='player'?hit.damage:hit.taken;
        const guarded=d20?check.outcome==='blocked':actions[target]==='block',held=guarded&&end[target]>0;
        if(d20){
          paintD20(arena,side,roll).classList.add('chosen');
          const popup=paintImpact(arena,target,roll,impactPositions[target]);
          if(damage)animate(popup,[{transform:'translateY(6px) scale(.92)'},{transform:'none'}],{duration:350,easing:'ease-out'});
          if(side==='player'&&!roll.replyCheck){
            paintD20(arena,'enemy',null);
            paintImpact(arena,'player',null);
          }
          if(side==='enemy'&&bossGuard)later(()=>showBossGuard(arena,roll),d20Timing.bossDelay);
        }
        if(check?.outcome==='miss'){
          if(damage){
            updateHealthMeter(meters[target],end[target],start[target],motionEnabled());
            burst(actors[target],'slash',damage,false,false);
          }
          return;
        }
        if(d20&&guarded)guard(target);
        updateHealthMeter(meters[target],end[target],start[target],motionEnabled());
        if(side==='player'&&firstCounter){counterBonus(arena);bonusStatus?.style.removeProperty('visibility');}
        const kind=guarded?'guarded':charge?'charge':side==='player'&&roll?.skill==='counter'?'counter':heavy?'heavy':'slash';
        const accent=check?.outcome==='critical'?' d20-critical':'';
        burst(actors[target],kind+accent,damage,!d20&&side==='player'&&roll?.critical,!d20);
        const result=guarded?(held?(charge?'stopped':'guard'):'broken'):charge?'direct':null;
        if(result&&!d20)reaction(actors[target],result,charge?DiceCombat.enemySkills[roll.enemySkill].name:null);
        if(held){
          const ward=actors[target].querySelector('.watch-ward');
          animate(ward,[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(.82,1.1)',filter:'brightness(1.5)',offset:.18},{opacity:.9,transform:'scale('+ (charge?1.3:1.15)+')',offset:.4},{opacity:0,transform:'scale(1.05)',filter:'brightness(1)'}],{duration:charge?550:400,fill:'forwards'});
          // Deflection replaces the remaining lunge at contact, keeping the original turn timing.
          animate(actors[side],[{transform:`translate(${dx}px,${dy}px) rotate(${charge?0:dir*20}deg) scale(${charge?1.22:heavy?1.16:1.04})`},{transform:`translate(${dx-dir*(charge?42:22)}px,${dy+dir*16}px) rotate(${-dir*18}deg) scale(.95)`,offset:.36},{transform:'translate(0,0) rotate(0)'}],{duration:300,easing:'ease-out'});
          if(charge)animate(document.querySelector('[data-skill="counter"]'),[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.18)',filter:'brightness(1.7)',offset:.3},{transform:'scale(1)',filter:'brightness(1)'}],{duration:500});
        }
        const recoil=`translate(${dir*(held?6:charge?40:heavy?28:16)}px,${-dir*(held?3:charge?23:heavy?16:9)}px)`;
        animate(actors[target],[{transform:'translate(0,0)',filter:'brightness(1)'},{transform:recoil,filter:'brightness('+(held?1.25:1.9)+')',offset:.15},{transform:recoil,filter:'brightness(1.3)',offset:.38},{transform:'translate(0,0)',filter:'brightness(1)'}],{duration:held?300:360});
        if(heavy&&!held)animate(arena,[{transform:'translate(0,0)'},{transform:'translate(-4px,2px)'},{transform:'translate(4px,-2px)'},{transform:'translate(0,0)'}],{duration:160});
        sound(held&&charge?'parry':guarded?'block':heavy?'counter':'slash');
      },at+(d20?d20Timing.contact:300));
    }
    strike('player',d20?d20Timing.player+rollTime:lead+260);
    if (before.bladeCombat && actions.player === "block" && hit.damage > 0) {
      later(() => {
        updateHealthMeter(meters.enemy,end.enemy,start.enemy,motionEnabled());
        burst(actors.enemy,"slash",hit.damage);
      },lead+560);
    }
    // The existing model resolves lethal player hits before an enemy reply.
    if(end.enemy>0 && before.enemyKind!=='goblin')strike('enemy',d20?d20Timing.enemy+rollTime:lead+920);
    if(escapes)later(()=>{
      if(d20)arena.dataset.phase='enemy-escape';
      animate(actors.enemy,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(75%)'}],{duration:430,fill:'forwards'});
    },d20?escapeAt:lead+940);
    const d20Recovery=escapes?escapeAt+430:lastContact+260;
    const guardDuration=d20Timing.bossDelay+d20Timing.bossHold+d20Timing.bossFade;
    const d20Finish=escapes?escapeAt+460:lastContact+(bossGuard?guardDuration+30:end.enemy<=0||end.player<=0?720:370);
    later(()=>{
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'recover';
      const dead=end.enemy<=0?'enemy':end.player<=0?'player':null;
      if(dead)animate(actors[dead],[{opacity:1,transform:'translateY(0)'},{opacity:.65,transform:'translateY(12px) rotate(14deg)',offset:.45},{opacity:0,transform:'translateY(36px) rotate(30deg) scale(.8)'}],{duration:430,fill:'forwards'});
    },d20?d20Recovery:lead+(end.enemy<=0?850:1460));
    later(()=>{
      for(const side of ['player','enemy'])updateHealthMeter(meters[side],end[side],end[side],false);
      for(const side of ['player','enemy'])if(end[side]<=0)actors[side].dataset.defeated='true';
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'rest';
      arena.removeAttribute('data-duel-animating');
      if(resolve){const done=resolve;resolve=null;done();}
    },d20?d20Finish:lead+(end.enemy<=0?1350:1900));
    return true;
  }
  return {play,cancel,checkLabel,damageLabel,finished:()=>completion};
})();
