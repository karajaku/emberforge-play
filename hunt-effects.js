/* Presentation only: forest attack events, one at a time, each at the real time its controller gives it
   (docs/attack-speed-as1-1-handover.md §7.2 M1–M2). Saved combat results are never delayed, rolled again
   or mutated here, and one event's cleanup never ends another event's sound, number or health trail. */
const HuntEffects=(()=>{
  // Motion values are the ones the d20 scene shipped with, at the blade fights' half duration.
  const SCALE=.5,LEAD=300*SCALE,LUNGE=600*SCALE,MEET=150,HANDOVER=450,TOP=48;
  const sides=['player','enemy'],other=side=>side==='player'?'enemy':'player';
  const animations=new Set(),nodes=new Set();
  let queue=[],pumpTimer=null,serial=0,pumps=0,frame=0,waiting=[],flights=[],home=null,trace=null;
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
    flights=[];
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

  // ── Where a result stands: over the head of the side that was hit, below the top button band ──
  // The same calculation serves a running fight, a stopped screen and a restored one (M2).
  function measure(){
    const arena=arenaNode(),clearing=arena?.querySelector('.watch-report')?.getBoundingClientRect();
    if(!clearing||!clearing.width){home=null;return;}
    if(flights.some(flight=>flight.until>now()))return; // a lunging fighter is not at its place
    const next={};
    for(const side of sides){
      const actor=actorOf(arena,side);
      if(!actor){home=null;return;}
      const r=actor.getBoundingClientRect();
      next[side]={cx:r.left+r.width/2,cy:r.top+r.height/2,x:r.left+r.width/2-clearing.left,y:r.top-clearing.top,width:clearing.width,height:clearing.height};
    }
    home=next;
  }
  function place(side){
    const arena=arenaNode(),el=arena&&resultOf(arena,side),pos=home?.[side];
    if(!el||!pos||!el.textContent)return;
    const half=el.offsetWidth/2,tall=el.offsetHeight,floor=pos.height-tall-5;
    const x=Math.max(half+6,Math.min(pos.width-half-6,pos.x));
    const y=Math.max(Math.min(TOP,floor),Math.min(floor,pos.y-tall*.7));
    el.style.setProperty('--impact-x',x+'px');
    el.style.setProperty('--impact-y',y+'px');
  }
  function layout(){measure();for(const side of sides)place(side);}
  // A result: the heading before a number (치명 · 막힘 · 출혈 · 방어) or a word alone, and its accessible name.
  // It is a named image, not a live region: results are not read out as they arrive (M9).
  function show(side,result,options={}){
    const arena=arenaNode(),el=arena&&resultOf(arena,side);
    if(!el)return;
    el.textContent='';
    for(const name of ['data-word','data-critical','data-outcome','data-seq','role','aria-label','title'])el.removeAttribute(name);
    if(!result)return;
    if(result.tag){const tag=document.createElement('span');tag.className='watch-impact-tag';tag.textContent=result.tag;el.append(tag,' ');}
    el.append(result.word||HuntStrikes.damageLabel(result.amount,result.bleedOnly));
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
    const arrival=motionEnabled()?el.animate([{transform:'translateY(6px) scale(.92)'},{transform:'none'}],{duration:350*SCALE,easing:'ease-out'}):
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
  function shape(cue){
    const side=cue.event.actor,dir=side==='player'?1:-1,charge=!!cue.charge,heavy=!!cue.special;
    // M1-c: when the other side's contact is closer than 150 ms both stop at the short distance of a miss and meet in the middle.
    const reach=cue.meet||cue.event.check?.outcome==='miss'?.38:.65;
    const own=home[side],foe=home[other(side)];
    const dx=(foe.cx-own.cx)*reach,dy=(foe.cy-own.cy)*reach;
    return {dir,charge,heavy,dx,dy,contact:'translate('+dx+'px,'+dy+'px) rotate('+(charge?0:dir*20)+'deg) scale('+(charge?1.22:heavy?1.16:1.04)+')'};
  }
  function windup(cue,skip=0){
    const arena=arenaNode();
    if(!arena||!motionEnabled())return;
    measure();
    if(!home)return;
    const side=cue.event.actor,actor=actorOf(arena,side),s=shape(cue);
    cue.shape=s;
    arena.dataset[side+'Phase']='windup'; // M1-b: each side has its own progress, there is no roll phase
    actor.dataset.attackAt=String(now()-skip);
    actor.dataset.attacking='true';
    flights.push({side,until:now()+LUNGE-skip});
    animate(actor,[{transform:'translate(0,0) rotate(0)',easing:'ease-in'},
      {transform:'translate('+-s.dx*.16+'px,'+-s.dy*.16+'px) rotate('+-s.dir*(s.heavy?26:14)+'deg)',offset:.30,easing:'cubic-bezier(.15,.8,.2,1)'},
      {transform:s.contact,offset:.5},{transform:s.contact,offset:s.heavy?.66:.60,easing:'ease-out'},{transform:'translate(0,0) rotate(0)'}],{duration:LUNGE},skip);
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
    if(!motion||!home)return;
    const s=cue.shape||shape(cue),actors={player:actorOf(arena,'player'),enemy:actorOf(arena,'enemy')};
    if(!kind){if(damage)burst(actors[target],'slash',damage);return;}
    const ward=actors[target].querySelector('.watch-ward');
    if(guarded)animate(ward,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.1)',offset:.2},{opacity:.8,transform:'scale(1)',offset:.85},{opacity:0}],{duration:1200*SCALE,fill:'forwards'});
    const type=guarded?'guarded':s.charge?'charge':side==='player'&&cue.event.move==='counter'?'counter':s.heavy?'heavy':'slash';
    burst(actors[target],type+(outcome==='critical'?' d20-critical':''),damage);
    if(held){
      animate(ward,[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(.82,1.1)',filter:'brightness(1.5)',offset:.18},{opacity:.9,transform:'scale('+(s.charge?1.3:1.15)+')',offset:.4},{opacity:0,transform:'scale(1.05)',filter:'brightness(1)'}],{duration:(s.charge?550:400)*SCALE,fill:'forwards'});
      // Deflection replaces the rest of the lunge at contact.
      animate(actors[side],[{transform:s.contact},{transform:'translate('+(s.dx-s.dir*(s.charge?42:22))+'px,'+(s.dy+s.dir*16)+'px) rotate('+-s.dir*18+'deg) scale(.95)',offset:.36},{transform:'translate(0,0) rotate(0)'}],{duration:300*SCALE,easing:'ease-out'});
    }
    // The side that was hit recoils. M1-c: inside its own lunge it only brightens, so the lunge is not overwritten.
    const bright=[1,held?1.25:1.9,1.3,1],shove='translate('+s.dir*(held?6:s.charge?40:s.heavy?28:16)+'px,'+-s.dir*(held?3:s.charge?23:s.heavy?16:9)+'px)';
    const lunging=flights.some(flight=>flight.side===target&&flight.until>now());
    animate(actors[target],[0,.15,.38,1].map((offset,i)=>({offset,filter:'brightness('+bright[i]+')',...(lunging?{}:{transform:i===1||i===2?shove:'translate(0,0)'})})),{duration:(held?300:360)*SCALE});
    if(s.heavy&&!held)animate(arena,[{transform:'translate(0,0)'},{transform:'translate(-4px,2px)'},{transform:'translate(4px,-2px)'},{transform:'translate(0,0)'}],{duration:160*SCALE});
  }
  // One attack event. cue: { event, result, at (real time of the contact), hp:{player,enemy} after it,
  //   meet, special (a skill or heavy move), charge (an enemy skill), flare:{key,name,icon}|null, apply() }.
  function strike(cue){
    const start=cue.at-LEAD-now();
    if(start>=0)at(cue.at-LEAD,()=>windup(cue));
    else windup(cue,-start); // late: join the lunge where it would be, the contact keeps its time
    at(cue.at,()=>contact(cue));
    at(cue.at-LEAD+LUNGE,()=>rest(cue));
  }
  // A fighter falls after the hit that ended it; the element stays for the rest of the encounter.
  function fall(side,time){
    at(time+260*SCALE,()=>{
      const arena=arenaNode();if(!arena)return;
      arena.dataset[side+'Phase']='down';
      animate(actorOf(arena,side),[{opacity:1,transform:'translateY(0)'},{opacity:.65,transform:'translateY(12px) rotate(14deg)',offset:.45},{opacity:0,transform:'translateY(36px) rotate(30deg) scale(.8)'}],{duration:430*SCALE,fill:'forwards'});
    });
    at(time+720*SCALE,()=>{const arena=arenaNode(),actor=arena&&actorOf(arena,side);if(actor)actor.dataset.defeated='true';});
  }
  // The goblin leaves; no strike is involved.
  function escape(time,apply){
    at(time,()=>{
      const arena=arenaNode();if(!arena)return;
      arena.dataset.enemyPhase='escape';
      apply?.();
      trace?.push({actor:'escape',real:now(),task:pumps,frame});
      const actor=actorOf(arena,'enemy');
      animate(actor,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(75%)'}],{duration:430*SCALE,fill:'forwards'});
      later(()=>{if(actor.isConnected)actor.dataset.defeated='true';},430*SCALE);
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
    record(on){trace=on?[]:null;if(on){const count=()=>{if(!trace)return;frame++;requestAnimationFrame(count);};requestAnimationFrame(count);}return trace;},get trace(){return trace;}};
})();
