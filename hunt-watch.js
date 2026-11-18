/* Session-only spectator controller. Durable operations use act() and the save lock. */
const HuntWatch=(()=>{
  let active=false,generation=0,timer=null,busy=false,reward=null,reason='';
  const names={strike:'공격',block:'방어',heavyStrike:'강공'};
  const icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  const allowed=()=>ready&&!storageError&&!restarting&&!document.hidden&&!modal&&current()==='forest'&&phonePage('forest')==='hunt';
  const pending=()=>!state.hunt&&state.chests.find(c=>c.id===state.lastHunt?.chestId&&c.source==='forest');
  const nextRank=()=>Math.min(60,state.huntBest+1);
  function stop(why='',paint=true) {active=false;generation++;clearTimeout(timer);timer=null;reason=why;if(paint&&state)render();}
  function die(face,action,side) {
    const points={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]}[face||1];
    return '<div class="watch-roll" data-die="'+side+'"><div class="watch-die" role="img" aria-label="'+(face?face+' · '+names[action]:'주사위 대기')+'">'+Array.from({length:9},(_,i)=>'<i class="'+(points.includes(i+1)?'pip':'')+'"></i>').join('')+'</div><span>'+icon(icons[action]||'sword')+(face?names[action]:'대기')+'</span></div>';
  }
  function view(s) {
    const h=s.hunt,rank=h?.rank||(reward?reward.rank:pending()?.rank)||nextRank();
    const enemy=Game.huntEnemy(h||rank),st=Game.stats(s),roll=h?h.lastDice:s.lastHunt?.lastDice;
    const useDice=h?h.diceVersion===1:true;
    const sprite='blade'+(Game.bladeStage(s.weapon)||'');
    const resultHealth=(!h&&(reward||pending()||reason.startsWith('패배')))?s.lastHunt?.health:null;
    const hp=h?.hp??resultHealth?.hp??st.hp,max=h?.maxHp??st.hp,enemyHp=h?.enemyHp??resultHealth?.enemyHp??(90+Math.round(36*(rank-1)**1.65));
    const total=h?.enemyMax??resultHealth?.enemyMax??enemyHp;
    const fighter=(side,label,asset,width,current,maxHp)=>'<div class="watch-fighter '+side+'" data-action="'+(roll?.[side==='player'?'player':'enemy']||'')+'">'+healthMeter(side,label,current,maxHp)+
      '<div class="watch-actor"'+(current<=0?' data-defeated="true"':'')+'><canvas width="'+width+'" height="144" data-sprite="'+asset+'" aria-hidden="true"></canvas><div class="watch-ward" aria-hidden="true">'+icon('shield')+'</div></div>'+
      (useDice?die(roll?.[side==='player'?'playerFace':'enemyFace'],roll?.[side==='player'?'player':'enemy'],side):'')+'</div>';
    const w=Game.huntingStatus(s),empty=!w.free&&!w.purchased&&!h&&!pending();
    const finished=s.huntBest>=60&&!h&&!pending();
    const label=active?'사냥 중단':finished?'모든 스테이지 완료':h?'사냥 계속':empty?'사냥권 충전 보기':'사냥';
    return '<section class="watch-view"><div class="watch-stage">STAGE <b>'+rank+'</b></div>'+
      '<div class="scene watch-arena combat-hud">'+fighter('player','나',sprite,128,hp,max)+fighter('enemy',enemy.name,'boar',144,enemyHp,total)+'</div>'+
      '<div class="watch-reward" role="status">'+(reward?'<b>'+reward.rank+'스테이지 클리어</b><strong>'+icon('coins')+' +'+fmt(reward.gold)+' G</strong><div class="watch-loot">'+
        [[reward.shards,'sparkles','별의 파편'],[reward.scrolls,'scroll-text','주문서'],...[0,1,2].map(i=>[reward.charms[i],['leaf','hammer','star'][i],Game.blessings[i]])].filter(([n])=>n).map(([n,ic,title])=>'<span aria-label="'+title+' '+n+'개" title="'+title+'">'+icon(ic)+' +'+n+'</span>').join('')+'</div>':reason?'<b>'+reason+'</b>':'')+'</div>'+
      '<button class="primary watch-start" '+(empty&&!active?'data-open="huntWallet"':'data-watch="toggle"')+(finished?' disabled':'')+'>'+icon(active?'shield':'sword')+label+'</button>'+
      (!active&&reason==='패배 · 장비를 강화해 주세요'?go('forge','장비 강화','action'):'')+'</section>';
  };
  function beforeRender(){if(active&&!allowed())stop('',false);}
  function refreshWallet() {
    if(active||!allowed()||state.hunt||pending()||state.huntBest>=60)return;
    const button=document.querySelector('.watch-start'),w=Game.huntingStatus(state);
    if(button && (button.dataset.open==='huntWallet') !== (!w.free&&!w.purchased))render();
  }
  function arm(delay=400) {
    if(!active||busy||timer)return;
    const token=generation;timer=setTimeout(()=>{timer=null;step(token).catch(()=>stop('저장 상태를 확인해 주세요'));},delay);
  }
  async function step(token) {
    if(token!==generation||!active)return;
    if(!allowed()){stop('일시 중단');return;}
    busy=true;
    try {
      const h=state.hunt;
      if(h) {
        const id=h.id,turn=h.turn;
        await act(null,'',undefined,()=>token===generation&&active&&allowed()&&state.hunt?.id===id&&state.hunt.turn===turn?
          (state.hunt.diceVersion===1?'strike':AutoCombat.choose(Game,state.hunt)):null);
        if(storageError){stop('저장 상태를 확인해 주세요');return;}
        await HuntEffects.finished();
        if(token!==generation)return;
        if(!state.hunt&&!state.lastHunt?.chestId){stop('패배 · 장비를 강화해 주세요');return;}
      } else {
        const chest=pending();
        if(chest) {
          await act(null,'',undefined,undefined,()=>token===generation&&active&&allowed()&&pending()?.id===chest.id?{action:'openChest',arg:chest.id}:null);
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token!==generation)return;
          if(state.lastChest?.id===chest.id) reward={...state.lastChest};
          render();
        } else {
          if(state.huntBest>=60){stop('모든 스테이지 완료');return;}
          const w=Game.huntingStatus(state);
          if(!w.free&&!w.purchased){stop('사냥권을 모두 사용했습니다');return;}
          const rank=nextRank(),serial=state.hunting.serial;
          reward=null;reason='';
          await act(null,'',undefined,undefined,()=>token===generation&&active&&allowed()&&!state.hunt&&!pending()&&state.hunting.serial===serial?
            {action:'huntStart',arg:{rank,request:serial+1,combat:"dice-v1"}}:null);
          // The legacy repeat runner is inactive; no second controller is armed.
          autoCombat.stop();
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token===generation&&!state.hunt){stop('사냥을 시작할 수 없습니다');return;}
        }
      }
    } finally {busy=false;if(token===generation&&active)arm(reward&&!state.hunt?1800:500);else if(active)arm();}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-watch]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();if(!allowed())return;
    if(active){stop('일시 중단');return;}
    // Capturing this click bypasses the general UI handler; unlock sound here too.
    if(prefs.sound)GameSound.unlock();GameMusic.unlock();
    repeatHunting.stop('관전 사냥');autoCombat.stop();active=true;reason='';generation++;render();arm(100);
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('일시 중단');});
  window.addEventListener('pagehide',()=>stop('',false));
  window.addEventListener('hashchange',()=>{if(current()!=='forest'||phonePage('forest')!=='hunt')stop('',false);});
  return {view, stop, beforeRender, refreshWallet, get active(){return active;}};
})();
