/* Presentation only: forest attack events, one at a time, each at the real time its controller gives it
   (docs/attack-speed-as1-1-handover.md §7.2 M1–M2). Saved combat results are never delayed, rolled again
   or mutated here, and one event's cleanup never ends another event's sound, number or health trail. */
const HuntEffects=(()=>{
  // Motion values are the ones the d20 scene shipped with, at the blade fights' half duration.
  const SCALE=.5,LEAD=300*SCALE,LUNGE=600*SCALE,MEET=150,HANDOVER=450,TOP=48;
  // FP1 §9.2: guard pose length, skipped when the own next wind-up is this close (D32); shake and hit-marker gaps.
  const GUARD_POSE=420,GUARD_SKIP=200,SHAKE_GAP=1000,HURT_GAP=300;
  const sides=['player','enemy'],other=side=>side==='player'?'enemy':'player';
  const animations=new Set(),nodes=new Set();
  let queue=[],pumpTimer=null,serial=0,pumps=0,frame=0,waiting=[],flights=[],home=null,trace=null;
  let hand=null,foeFlight=null,lastShake=-1e9,lastHurt=-1e9,fpTrace=null;
  const now=()=>performance.now();
  const arenaNode=()=>document.querySelector('#screen .watch-arena[data-strikes]');
  const actorOf=(arena,side)=>arena.querySelector('.watch-fighter.'+side+' .watch-actor');
  const meterOf=(arena,side)=>arena.querySelector('.hp-meter[data-side="'+side+'"]');
  const resultOf=(arena,side)=>arena.querySelector('.watch-impact-number[data-impact-target="'+side+'"]');

  // One timer runs every cue that is due, in the order given: two contacts for the same instant land in the same task.
  function settle(){if(queue.length)return;const list=waiting;waiting=[];for(const done of list)done();}
  function arm(){
    clearTimeout(pumpTimer);pumpTimer=null;
    if(queue.length)pumpTimer=setTimeout(pump,Math.max(0,queue[0].t-now()));
  }
  function pump(){
    pumpTimer=null;pumps++;
    const due=now()+2;
    while(queue.length&&queue[0].t<=due){const cue=queue.shift();try{cue.fn();}catch(error){console.error(error);}}
    arm();settle();
  }
  function at(time,fn){
    queue.push({t:time,fn,order:serial++});
    queue.sort((a,b)=>a.t-b.t||a.order-b.order);
    arm();
  }
  const later=(fn,ms)=>at(now()+Math.max(0,ms),fn);
  const finished=()=>queue.length?new Promise(done=>waiting.push(done)):Promise.resolve();
  function cancel(){
    const busy=queue.length>0;
    clearTimeout(pumpTimer);pumpTimer=null;queue=[];
    for(const animation of animations)animation.cancel();animations.clear();
    for(const node of nodes)node.remove();nodes.clear();
    flights=[];hand=null;foeFlight=null;
    document.querySelectorAll('.fp-hurt[data-play]').forEach(n=>delete n.dataset.play);
    const arena=document.querySelector('.watch-arena');
    if(arena)for(const side of sides)delete arena.dataset[side+'Phase'];
    document.querySelectorAll('.watch-actor').forEach(n=>{delete n.dataset.attackAt;delete n.dataset.attacking;});
    if(busy)GameSound.stop();
    settle();
  }
  function animate(node,frames,options,skip=0){
    if(!node||!motionEnabled())return null;
    const animation=node.animate(frames,options);
    if(skip>0)animation.currentTime=Math.min(skip,options.duration);
    animations.add(animation);
    const drop=()=>animations.delete(animation);
    animation.finished.then(drop,drop);
    return animation;
  }
  function temp(node,host,life){host.append(node);nodes.add(node);later(()=>{node.remove();nodes.delete(node);},life);}

  // ── Where a result stands (FP1 §9.2, D24): the enemy's at its body height, the own just above the own readout
  // (CSS). Both stay below the top button band. The same calculation serves a running fight, a stopped screen and a
  // restored one (M2): the enemy's place is its rest place, not where a lunge has carried it.
  function measure(){
    const arena=arenaNode(),clearing=arena?.querySelector('.watch-report');
    if(!clearing||!clearing.offsetWidth){home=null;return;}
    if(!arena.fpRest)HuntFP.layout(arena);
    const spot=HuntFP.enemySpot(arena);
    home=spot?{enemy:{x:spot.x,y:spot.y,width:clearing.offsetWidth,height:clearing.offsetHeight}}:null;
  }
  function place(side){
    const arena=arenaNode(),el=arena&&resultOf(arena,side),pos=home?.[side];
    if(!el||!pos||!el.textContent)return;
    const half=el.offsetWidth/2,tall=el.offsetHeight,floor=pos.height-tall-5;
    const x=Math.max(half+6,Math.min(pos.width-half-6,pos.x));
    const y=Math.max(Math.min(TOP,floor),Math.min(floor,pos.y));
    el.style.setProperty('--impact-x',x+'px');
    el.style.setProperty('--impact-y',y+'px');
  }
  function layout(){HuntFP.layout(arenaNode());measure();for(const side of sides)place(side);}
  // A result: the heading before a number (치명 · 막힘 · 출혈 · 방어) or a word alone, and its accessible name.
  // It is a named image, not a live region: results are not read out as they arrive (M9).
  function show(side,result,options={}){
    const arena=arenaNode(),el=arena&&resultOf(arena,side);
    if(!el)return;
    el.textContent='';
    for(const name of ['data-word','data-critical','data-outcome','data-seq','role','aria-label','title'])el.removeAttribute(name);
    if(!result)return;
    if(result.tag){const tag=document.createElement('span');tag.className='watch-impact-tag';tag.textContent=result.tag;el.append(tag,' ');}
    // Words are kept whole: a long result folds at its spaces only, a number never inside itself (D34).
    String(result.word||HuntStrikes.damageLabel(result.amount,result.bleedOnly)).split(' ').forEach((part,i)=>{
      if(i)el.append(' ');const word=document.createElement('span');word.className='fp-nowrap';word.textContent=part;el.append(word);});
    if(result.word)el.setAttribute('data-word','');
    if(result.critical)el.setAttribute('data-critical','');
    if(result.tone)el.dataset.outcome=result.tone;
    if(options.seq!==undefined)el.dataset.seq=options.seq;
    el.setAttribute('role','img');
    el.setAttribute('aria-label',result.say);
    el.title=result.say;
    if(!home)measure();
    place(side);
    if(!options.arrive)return;
    for(const animation of el.getAnimations())animation.cancel();
    // Motion on: the number is whole from the contact frame and settles like the damage number it replaces.
    // Motion off (M7): a 150 ms opacity change only, so the same result twice in a row still reads as new.
    // FP1: the own result sits 8px above the own readout, so it grows in place instead of rising from 6px below (§9.2;
    // rising, it lay on the skill row for its first ~150 ms).
    const inPlace=side==='player'&&arena.hasAttribute('data-fp');
    const arrival=motionEnabled()?el.animate(inPlace?[{transform:'scale(.92)',transformOrigin:'left bottom'},{transform:'none',transformOrigin:'left bottom'}]:
      [{transform:'translateY(6px) scale(.92)'},{transform:'none'}],{duration:350*SCALE,easing:'ease-out'}):
      el.animate([{opacity:.25},{opacity:1}],{duration:150,easing:'ease-out'});
    animations.add(arrival);
    const drop=()=>animations.delete(arrival);arrival.finished.then(drop,drop);
  }
  function clear(){for(const side of sides)show(side,null);arenaNode()?.removeAttribute('data-struck');}

  function burst(actor,kind,damage){
    const node=document.createElement('div');node.className='hunt-burst '+kind;node.setAttribute('aria-hidden','true');
    node.innerHTML='<i class="hunt-cut"></i>'+Array.from({length:8},(_,i)=>'<i class="hunt-chip" style="--dx:'+Math.round(Math.cos(i*Math.PI/4)*68)+'px;--dy:'+Math.round(Math.sin(i*Math.PI/4)*60)+'px"></i>').join('')+
      (damage?'':'<b>'+icon('shield')+'</b>');
    temp(node,actor,700*SCALE);
  }
  function flare(arena,side,cue,skip){
    const banner=document.createElement('div');
    banner.className='watch-skill-flare '+cue.flare.key+' '+side;banner.dataset.skillSide=side;
    banner.innerHTML=icon(cue.flare.icon)+'<b>'+escapeHtml(cue.flare.name)+' 발동</b>';
    const slot=arena.querySelector('.watch-fighter.'+side+' '+(side==='player'?'.watch-skills':'.watch-enemy-skill'));
    if(slot){
      // A late callback never stacks two callouts of the same side; the other side's stays.
      slot.querySelectorAll('.watch-skill-flare').forEach(node=>{node.remove();nodes.delete(node);});
      temp(banner,slot,650*SCALE);
    }
    animate(actorOf(arena,side),[{filter:'brightness(1)'},{filter:'brightness(1.8) drop-shadow(0 0 14px '+(cue.flare.key==='counter'?'#73eac7':side==='enemy'?'#ff986d':'#ffd67a')+')',offset:.4},{filter:'brightness(1)'}],{duration:700*SCALE},skip);
  }
  // ── FP1 §9.2: the weapon in the foreground swings at the enemy; the enemy comes at the player ──
  // The weapon does one thing at a time: own swing > guard pose > the short shake of a hit > the breath (§9.2 "사건이 겹칠 때").
  const hurtNode=arena=>arena.querySelector('.fp-hurt'),guardNode=arena=>arena.querySelector('.fp-guard');
  const fpNote=(kind,extra)=>{if(fpTrace)fpTrace.push({kind,real:now(),...extra});};
  const handBusy=kind=>hand&&hand.until>now()&&(!kind||hand.kind===kind);
  function handDo(arena,kind,frames,duration,skip=0,cue=null){
    const anim=animate(actorOf(arena,'player'),frames,{duration},skip);
    hand={kind,until:now()+duration-skip,anim,cue};
    return anim;
  }
  // The enemy picture's box at a real time: during its own approach, where the approach has it then (H3-2 ①).
  function bodyAt(arena,time){
    const rest=HuntFP.foeBox(arena),f=foeFlight;
    if(!rest)return null;
    if(!f?.anim||time<f.start||time>=f.end||f.anim.playState==='idle')return rest;
    const keep=f.anim.currentTime;
    try{f.anim.currentTime=time-f.start;const r=(f.actor.querySelector('canvas,img')||f.actor).getBoundingClientRect();
      return {left:r.left,top:r.top,width:r.width,height:r.height,head:rest.head};}
    finally{f.anim.currentTime=keep;}
  }
  function swingStart(arena,cue,skip){
    if(handBusy('guard')){hand.anim?.cancel();fpNote('guardCut',{seq:cue.event.seq});} // the guard ends, the swing takes over
    else if(handBusy('shake'))hand.anim?.cancel();
    const frames=HuntFP.swing(arena,cue.event,bodyAt(arena,cue.at));
    if(frames)handDo(arena,'swing',frames,LUNGE,skip,cue);
  }
  function approachStart(arena,cue,skip){
    const actor=actorOf(arena,'enemy'),ap=HuntFP.approach(arena,cue.event.check?.outcome==='miss');
    actor.style.transformOrigin=ap.origin;
    const anim=animate(actor,ap.frames,{duration:LUNGE},skip);
    foeFlight={actor,anim,start:now()-skip,end:now()-skip+LUNGE};
    setTimeout(()=>{if(foeFlight?.anim===anim)actor.style.transformOrigin='';},LUNGE-skip+20);
    // An own swing already on its way lands on the enemy where the approach brings it at that contact.
    if(handBusy('swing')&&hand.cue&&hand.cue.at>now()&&hand.anim){
      const frames=HuntFP.swing(arena,hand.cue.event,bodyAt(arena,hand.cue.at));
      if(frames)hand.anim.effect.setKeyframes(frames);
    }
    if(cue.event.check?.outcome!=='blocked')return;
    // A guarded hit: the guard pose, unless the own swing is under way or the own next wind-up comes within 200ms of
    // the pose's start (D32). The shield ring and the word are drawn at the contact either way.
    const next=cue.event.next?.playerAt;
    if(handBusy('swing'))fpNote('guardSkip',{seq:cue.event.seq,why:'swing'});
    else if(next!=null&&next-cue.event.at<GUARD_SKIP)fpNote('guardSkip',{seq:cue.event.seq,why:'soon'});
    else{
      const pose=HuntFP.guard(arena);
      if(pose){handDo(arena,'guard',[{transform:'none',easing:'ease-out'},{transform:pose,offset:.26},{transform:pose,offset:.74,easing:'ease-in'},{transform:'none'}],GUARD_POSE,skip);fpNote('guard',{seq:cue.event.seq});}
    }
  }
  function windup(cue,skip=0){
    const arena=arenaNode();
    if(!arena||!motionEnabled())return;
    if(!arena.fpRest)HuntFP.layout(arena);
    if(!arena.fpRest)return;
    const side=cue.event.actor,actor=actorOf(arena,side);
    arena.dataset[side+'Phase']='windup'; // M1-b: each side has its own progress, there is no roll phase
    actor.dataset.attackAt=String(now()-skip);
    actor.dataset.attacking='true';
    flights.push({side,until:now()+LUNGE-skip});
    if(side==='player')swingStart(arena,cue,skip);else approachStart(arena,cue,skip);
    if(cue.flare)flare(arena,side,cue,skip);
  }
  function rest(cue){
    const arena=arenaNode();
    if(!arena)return;
    const side=cue.event.actor,actor=actorOf(arena,side);
    if(actor)delete actor.dataset.attacking;
    flights=flights.filter(flight=>flight.until>now());
    if(arena.dataset[side+'Phase']!=='down')arena.dataset[side+'Phase']='rest';
  }
  // The scene shakes as before (80ms, only for an own heavy or skill strike and an enemy skill that was not held),
  // and now at most once in a second (§9.2 "장면 흔들림").
  function shake(arena){
    if(now()-lastShake<SHAKE_GAP){fpNote('shakeSkip');return;}
    lastShake=now();fpNote('shake');
    animate(arena,[{transform:'translate(0,0)'},{transform:'translate(-4px,2px)'},{transform:'translate(4px,-2px)'},{transform:'translate(0,0)'}],{duration:160*SCALE});
  }
  // The own hit marker (A3) right of the own readout: a new hit restarts it, but not within 300ms of the last start.
  function hurt(arena){
    const node=hurtNode(arena),ring=guardNode(arena);
    ring?.getAnimations().forEach(a=>a.cancel());
    if(!node)return;
    if(node.dataset.play!==undefined&&now()-lastHurt<HURT_GAP){fpNote('hurtSkip');return;}
    fpNote(node.dataset.play!==undefined?'hurtRestart':'hurt');
    const started=lastHurt=now();
    delete node.dataset.play;void node.offsetWidth;node.dataset.play='';
    setTimeout(()=>{if(lastHurt===started)delete node.dataset.play;},HURT_GAP);
  }
  function ring(node,ms){
    if(!node)return;
    node.getAnimations().forEach(a=>a.cancel());
    animate(node,[{opacity:1,transform:'scale(.82)'},{opacity:1,transform:'scale(1.12)',offset:.3},{opacity:0,transform:'scale(1.02)'}],{duration:ms});
  }
  // The contact frame: the result beside the side that was hit and its health change together, whatever overlaps.
  function contact(cue){
    const arena=arenaNode();
    if(!arena)return;
    const side=cue.event.actor,target=other(side),motion=motionEnabled();
    const outcome=cue.event.check?.outcome,damage=side==='player'?cue.event.damage:cue.event.taken;
    arena.dataset[side+'Phase']='hit';
    arena.setAttribute('data-struck','');
    show(target,cue.result,{seq:cue.event.seq,arrive:true});
    const meters={player:meterOf(arena,'player'),enemy:meterOf(arena,'enemy')};
    const before=Number(meters[target].getAttribute('aria-valuenow')),end=cue.hp[target];
    updateHealthMeter(meters[target],end,before,motion);
    if(Number(meters[side].getAttribute('aria-valuenow'))!==cue.hp[side])updateHealthMeter(meters[side],cue.hp[side],cue.hp[side],false);
    cue.apply?.();
    const guarded=outcome==='blocked',held=guarded&&end>0;
    const kind=outcome==='miss'||outcome==='guard'?null:held&&cue.special&&side==='enemy'?'parry':guarded?'block':cue.special?'counter':'slash';
    // M1-d: every strike sounds, layered over whatever the previous one still plays.
    if(kind)sound(kind,0,true);
    trace?.push({seq:cue.event.seq,actor:side,at:cue.event.at,real:now(),task:pumps,frame,sound:kind,meet:!!cue.meet,text:cue.result.text});
    if(!motion||!arena.fpRest)return;
    const foe=actorOf(arena,'enemy'),approaching=foeFlight&&foeFlight.end>now()&&foeFlight.anim?.playState==='running';
    if(target==='player'){
      // The enemy hit the player: the shield ring when guarded, otherwise the hit marker and a short shake of the weapon.
      if(guarded)ring(guardNode(arena),300);
      else if(damage>0){hurt(arena);if(!handBusy())handDo(arena,'shake',[{transform:'none'},{transform:'translate(3%,5%) rotate(5deg)',offset:.3},{transform:'none'}],160);}
      if(kind&&cue.special&&!held)shake(arena);
      return;
    }
    // The own strike landed on the enemy (or did not): its burst, its shield, and its recoil.
    if(!kind){
      if(damage)burst(foe,'slash',damage);
      else if(outcome==='miss'&&!approaching&&!cue.event.defeated)animate(foe,[{transform:'none'},{transform:'translateX(10%)',offset:.3},{transform:'none'}],{duration:170});
      return;
    }
    const ward=foe.querySelector('.watch-ward');
    if(guarded)ring(ward,300);
    const type=guarded?'guarded':side==='player'&&cue.event.move==='counter'?'counter':cue.special?'heavy':'slash';
    burst(foe,type+(outcome==='critical'?' d20-critical':''),damage);
    // M1-c: inside its own approach the enemy only brightens, so the approach is not overwritten.
    const bright=[1,held?1.25:1.9,1.3,1].map((v,i)=>({offset:[0,.15,.38,1][i],filter:'brightness('+v+')'}));
    if(approaching||cue.event.defeated)animate(foe,bright,{duration:180});
    else animate(foe,bright.map((k,i)=>({...k,transform:i===1||i===2?(held?'translateY(-2%) scale(.97)':cue.special?'translateY(-8%) scale(.88)':'translateY(-5%) scale(.92)'):'none'})),{duration:180});
    if(cue.special&&!held)shake(arena);
  }
  // One attack event. cue: { event, result, at (real time of the contact), hp:{player,enemy} after it,
  //   meet, special (a skill or heavy move), charge (an enemy skill), flare:{key,name,icon}|null, apply() }.
  function strike(cue){
    const start=cue.at-LEAD-now();
    if(start>=0)at(cue.at-LEAD,()=>windup(cue));
    else windup(cue,-start); // late: join the swing where it would be, the contact keeps its time
    at(cue.at,()=>contact(cue));
    at(cue.at-LEAD+LUNGE,()=>rest(cue));
  }
  // A fighter falls after the hit that ended it; the element stays for the rest of the encounter. A fallen enemy
  // stops its approach and the weapon is lowered out of sight; on a defeat the weapon drops out of the scene.
  function fall(side,time){
    at(time+260*SCALE,()=>{
      const arena=arenaNode();if(!arena)return;
      arena.dataset[side+'Phase']='down';
      if(side==='enemy'){
        if(foeFlight?.anim)foeFlight.anim.cancel();
        animate(actorOf(arena,'enemy'),[{opacity:1,transform:'none'},{opacity:.65,transform:'translateY(8%) rotate(10deg)',offset:.45},{opacity:0,transform:'translateY(22%) rotate(22deg) scale(.8)'}],{duration:430*SCALE,fill:'forwards'});
        // Straight down and turned a little to the left: the head never reaches further right than at rest (H3).
        animate(actorOf(arena,'player'),[{transform:'none'},{transform:'translate(0,72%) rotate(-4deg)'}],{duration:260,easing:'ease-out',fill:'forwards'});
      }else animate(actorOf(arena,'player'),[{opacity:1,transform:'none'},{opacity:0,transform:'translate(0,80%) rotate(-8deg)'}],{duration:430*SCALE,easing:'ease-in',fill:'forwards'});
    });
    at(time+720*SCALE,()=>{const arena=arenaNode(),actor=arena&&actorOf(arena,side);if(actor)actor.dataset.defeated='true';if(arena&&side==='enemy')arena.setAttribute('data-fp-down','');});
  }
  // The goblin leaves; no strike is involved. It runs off into the forest, growing smaller (§9.2 "고블린 도주").
  function escape(time,apply){
    at(time,()=>{
      const arena=arenaNode();if(!arena)return;
      arena.dataset.enemyPhase='escape';
      apply?.();
      trace?.push({actor:'escape',real:now(),task:pumps,frame});
      const actor=actorOf(arena,'enemy');
      actor.style.transformOrigin='50% 100%';
      animate(actor,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-12%) scale(.5)'}],{duration:430*SCALE,fill:'forwards'});
      later(()=>{if(actor.isConnected){actor.dataset.defeated='true';arena.setAttribute('data-fp-down','');}},430*SCALE);
    });
  }
  // A new elite steps in when the next encounter is drawn.
  function entrance(){
    animate(document.querySelector('.watch-ground .boss-creature'),[{opacity:0,transform:'translate(12%, -9%) scale(.9)'},
      {opacity:1,transform:'translate(-2%, 0) scale(1.035)',offset:.72},{opacity:1,transform:'none'}],{duration:460,easing:'ease-out'});
  }
  // First-counter bonus of the oldest forest fights (no blade combat): unchanged callout.
  function counterBonus(){
    const arena=arenaNode();if(!arena)return;
    const node=document.createElement('div');node.className='watch-counter-award';node.setAttribute('role','status');
    node.innerHTML=icon('coins')+'<b>반격 보너스 +25%</b><small>승리 시 지급</small>';
    temp(node,arena,1100);
  }
  addEventListener('resize',()=>{if(arenaNode())layout();});
  return {lead:LEAD,lunge:LUNGE,meet:MEET,handover:HANDOVER,strike,fall,escape,entrance,counterBonus,show,clear,layout,at,later,cancel,finished,
    // Browser checks read the contacts as they were shown (rule time, real time, task and frame, sound).
    record(on){trace=on?[]:null;fpTrace=on?[]:null;if(on){const count=()=>{if(!trace)return;frame++;requestAnimationFrame(count);};requestAnimationFrame(count);}return trace;},get trace(){return trace;},get fp(){return fpTrace;}};
})();
