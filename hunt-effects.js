/* Presentation only: saved combat results are never delayed, rolled again or mutated. */
const HuntEffects=(()=>{
  let timers=[],animations=[],nodes=[],resolve=null,completion=Promise.resolve();
  const points={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
  function cancel(){
    timers.forEach(clearTimeout);timers=[];
    animations.forEach(a=>a.cancel());animations=[];nodes.forEach(n=>n.remove());nodes=[];
    document.querySelector('.watch-arena')?.removeAttribute('data-phase');
    document.querySelectorAll('.watch-roll').forEach(n=>n.classList.remove('rolling','waiting','chosen'));
    document.querySelectorAll('.watch-actor').forEach(n=>delete n.dataset.attackAt);
    if(resolve){GameSound.stop();const done=resolve;resolve=null;done();}
  }
  const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
  function animate(node,frames,options){if(node)animations.push(node.animate(frames,options));}
  const names={strike:'공격',block:'방어',heavyStrike:'강공'},icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  function pips(die,face){die.querySelectorAll('i').forEach((pip,n)=>pip.classList.toggle('pip',points[face].includes(n+1)));}
  function burst(actor,kind,damage){
    if(!actor)return;
    const node=document.createElement('div');node.className='hunt-burst '+kind;node.setAttribute('aria-hidden','true');
    node.innerHTML='<i class="hunt-cut"></i>'+Array.from({length:8},(_,i)=>'<i class="hunt-chip" style="--dx:'+Math.round(Math.cos(i*Math.PI/4)*68)+'px;--dy:'+Math.round(Math.sin(i*Math.PI/4)*60)+'px"></i>').join('')+
      '<b>'+(damage?'−'+fmt(damage):icon('shield'))+'</b>';
    actor.append(node);nodes.push(node);later(()=>node.remove(),700);
  }
  function play(hit,before,roll){
    cancel();const arena=document.querySelector('.watch-arena');if(!arena||!motionEnabled())return false;
    completion=new Promise(done=>resolve=done);
    const actors={player:arena.querySelector('.player .watch-actor'),enemy:arena.querySelector('.enemy .watch-actor')};
    const meters={player:arena.querySelector('[data-side="player"]'),enemy:arena.querySelector('[data-side="enemy"]')};
    const end={player:Number(meters.player.getAttribute('aria-valuenow')),enemy:Number(meters.enemy.getAttribute('aria-valuenow'))};
    const start={player:before.hp,enemy:before.enemyHp};
    for(const side of ['player','enemy'])actors[side].removeAttribute('data-defeated');
    const actions=roll||{player:hit.kind==='block'||hit.kind==='parry'?'block':'strike',enemy:'strike'};
    for(const side of ['player','enemy'])updateHealthMeter(meters[side],start[side],start[side],false);
    const lead=roll?1600:0;
    function diceTurn(side,at){
      const host=arena.querySelector('[data-die="'+side+'"]'),die=host.querySelector('.watch-die');
      host.classList.add('waiting');host.querySelector('span').textContent='대기';die.setAttribute('aria-label','주사위 대기');
      later(()=>{
        arena.dataset.phase=side+'-roll';host.classList.remove('waiting');host.classList.add('rolling');host.querySelector('span').textContent=side==='player'?'내 주사위':'적 주사위';
        sound('dice');
        for(let i=0;i<8;i++)later(()=>pips(die,1+(i*5+(side==='player'?0:3))%6),i*75);
        later(()=>{
          const face=roll[side+'Face'],action=roll[side];host.classList.remove('rolling');host.classList.add('chosen');pips(die,face);
          host.querySelector('span').innerHTML=icon(icons[action])+names[action];die.setAttribute('aria-label',face+' · '+names[action]);
          animate(die,[{transform:'scale(1.25) rotate(-8deg)'},{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:230});
        },600);
      },at);
    }
    if(roll){diceTurn('player',0);diceTurn('enemy',800);}else arena.dataset.phase='reveal';
    later(()=>{arena.dataset.phase='reveal';},lead);
    function guard(side){
      const ward=actors[side].querySelector('.watch-ward');
      animate(ward,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.1)',offset:.2},{opacity:.8,transform:'scale(1)',offset:.85},{opacity:0}],{duration:1200,fill:'forwards'});
    }
    for(const side of ['player','enemy'])if(actions[side]==='block')later(()=>guard(side),lead+150);
    function strike(side,at){
      const target=side==='player'?'enemy':'player',heavy=actions[side]==='heavyStrike';
      if(actions[side]==='block')return;
      const dir=side==='player'?1:-1;
      const own=actors[side].getBoundingClientRect(),other=actors[target].getBoundingClientRect();
      const dx=(other.left+other.width/2-own.left-own.width/2)*.65,dy=(other.top+other.height/2-own.top-own.height/2)*.65;
      later(()=>{
        arena.dataset.phase=side+'-windup';
        actors[side].dataset.attackAt=String(performance.now());
        animate(actors[side],[{transform:'translate(0,0) rotate(0)'},{transform:`translate(${-dx*.16}px,${-dy*.16}px) rotate(${-dir*(heavy?26:14)}deg)`,offset:.32},{transform:`translate(${dx}px,${dy}px) rotate(${dir*20}deg) scale(${heavy?1.16:1.04})`,offset:.5},{transform:`translate(${dx*.75}px,${dy*.75}px) rotate(${dir*8}deg)`,offset:.65},{transform:'translate(0,0) rotate(0)'}],{duration:600,easing:'ease-in-out'});
      },at);
      later(()=>{
        arena.dataset.phase=side+'-hit';
        const damage=side==='player'?hit.damage:hit.taken;
        updateHealthMeter(meters[target],end[target],start[target],true);
        burst(actors[target],actions[target]==='block'?'guarded':heavy?'heavy':'slash',damage);
        animate(actors[target],[{transform:'translateX(0)',filter:'brightness(1)'},{transform:`translateX(${dir*(heavy?27:15)}px)`,filter:'brightness(2.4)',offset:.2},{transform:'translateX(0)',filter:'brightness(1)'}],{duration:320});
        if(heavy)animate(arena,[{transform:'translate(0,0)'},{transform:'translate(-4px,2px)'},{transform:'translate(4px,-2px)'},{transform:'translate(0,0)'}],{duration:160});
        sound(actions[target]==='block'?'block':heavy?'counter':'slash');
      },at+300);
    }
    strike('player',lead+260);
    // The existing model resolves lethal player hits before an enemy reply.
    if(end.enemy>0)strike('enemy',lead+920);
    later(()=>{
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'recover';
      const dead=end.enemy<=0?'enemy':end.player<=0?'player':null;
      if(dead)animate(actors[dead],[{opacity:1,transform:'translateY(0)'},{opacity:.65,transform:'translateY(12px) rotate(14deg)',offset:.45},{opacity:0,transform:'translateY(36px) rotate(30deg) scale(.8)'}],{duration:430,fill:'forwards'});
    },lead+(end.enemy<=0?850:1460));
    later(()=>{
      for(const side of ['player','enemy'])updateHealthMeter(meters[side],end[side],end[side],false);
      for(const side of ['player','enemy'])if(end[side]<=0)actors[side].dataset.defeated='true';
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'rest';
      if(resolve){const done=resolve;resolve=null;done();}
    },lead+(end.enemy<=0?1350:1900));
    return true;
  }
  return {play,cancel,finished:()=>completion};
})();
