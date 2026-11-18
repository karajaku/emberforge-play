/* Session-only spectator controller. Durable operations use act() and the save lock. */
const HuntWatch=(()=>{
  let active=false,generation=0,timer=null,busy=false,reward=null,reason='',outcome=null;
  const names={strike:'공격',block:'방어',heavyStrike:'강공'};
  const icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  const allowed=()=>ready&&!storageError&&!restarting&&!document.hidden&&!modal&&current()==='forest'&&phonePage('forest')==='hunt';
  const pending=()=>!state.hunt&&state.chests.find(c=>c.id===state.lastHunt?.chestId&&c.source==='forest');
  const nextRank=()=>Math.min(60,state.huntBest+1);
  function ticketInfo(w){
    const empty=w.free+w.purchased===0,seconds=Math.ceil((w.remaining||0)/1000);
    const countdown=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const text=(w.purchased?'무료 ':'사냥권 ')+fmt(w.free)+' / '+Game.hunting.cap+
      (w.purchased?' · 구매 '+fmt(w.purchased):empty?' · 충전 '+countdown:'');
    return {text,empty,width:Math.min(100,Math.max(0,w.free/Game.hunting.cap*100))};
  }
  function ticketBar(w){const t=ticketInfo(w);return '<span class="watch-ticket-bar" data-empty="'+t.empty+'"><span class="watch-ticket-fill" aria-hidden="true" style="width:'+t.width+'%"></span><span class="watch-ticket-text">'+t.text+'</span></span>';}
  function stop(why='',paint=true) {active=false;generation++;clearTimeout(timer);timer=null;reason=why;if(paint&&state)render();}
  function stageOutcome(before){
    if(state.hunt)outcome=null;
    else if(before&&state.lastHunt?.id===before.id)outcome=state.lastHunt.health;
  }
  function die(face,action,side) {
    return '<div class="watch-roll" data-die="'+side+'"><div class="watch-die" data-action="'+(action||'')+'" role="img" aria-label="'+(face?names[action]+' 주사위':'주사위 대기')+'">'+icon(icons[action]||'sword')+'</div><span>'+(face?names[action]:'대기')+'</span></div>';
  }
  function skills(h){
    if(!h||h.diceVersion!==1)return '';
    return '<div class="watch-skills" aria-label="자동 전투 스킬">'+Object.entries(DiceCombat.skills).map(([key,def])=>{
      const s=DiceCombat.skillStatus(h,key),condition=key==='counter'?'돌진 방어 후 준비':'2스테이지 · 기세 2칸';
      const label=def.name+' · '+(s.cooldown?s.cooldown+'턴 후 재사용':s.ready?'발동 준비':condition);
      return '<span class="watch-skill" data-skill="'+key+'" data-ready="'+s.ready+'" title="'+label+'" aria-label="'+label+'">'+icon(def.icon)+'<b>'+(s.cooldown?s.cooldown:s.ready?'✓':'·')+'</b></span>';
    }).join('')+'</div>';
  }
  function view(s) {
    const h=s.hunt,rank=h?.rank||(reward?reward.rank:pending()?.rank)||nextRank();
    const enemy=Game.huntEnemy(h||rank),st=Game.stats(s),roll=h?h.lastDice:s.lastHunt?.lastDice;
    const useDice=h?h.diceVersion===1:true;
    const sprite='blade'+(Game.bladeStage(s.weapon)||'');
    const resultHealth=!h?(outcome||((reward||pending()||reason.startsWith('패배'))?s.lastHunt?.health:null)):null;
    const hp=h?.hp??resultHealth?.hp??st.hp,max=h?.maxHp??resultHealth?.maxHp??st.hp,enemyHp=h?.enemyHp??resultHealth?.enemyHp??(90+Math.round(36*(rank-1)**1.65));
    const total=h?.enemyMax??resultHealth?.enemyMax??enemyHp;
    const fighter=(side,label,asset,width,current,maxHp)=>'<div class="watch-fighter '+side+'" data-action="'+(roll?.[side==='player'?'player':'enemy']||'')+'">'+healthMeter(side,label,current,maxHp)+
      '<div class="watch-actor"'+(current<=0?' data-defeated="true"':'')+'><canvas width="'+width+'" height="144" data-sprite="'+asset+'" aria-hidden="true"></canvas><div class="watch-ward" aria-hidden="true">'+icon('shield')+'</div></div>'+
      (useDice?die(roll?.[side==='player'?'playerFace':'enemyFace'],roll?.[side==='player'?'player':'enemy'],side):'')+
      (side==='enemy'&&h?.enemySkillState?'<span class="watch-enemy-skill" data-ready="'+(h.enemySkillState.cooldown<=1)+'" title="돌진 · '+h.enemySkillState.power+'배 · '+(h.enemySkillState.cooldown<=1?'다음 공격에 발동':h.enemySkillState.cooldown+'턴 후 재사용')+'" aria-label="돌진 '+h.enemySkillState.cooldown+'턴">'+icon('chevrons-up')+'<b>'+(h.enemySkillState.cooldown<=1?'!':h.enemySkillState.cooldown)+'</b></span>':'')+'</div>';
    const w=Game.huntingStatus(s),empty=!w.free&&!w.purchased&&!h&&!pending();
    const finished=s.huntBest>=60&&!h&&!pending();
    const label=active?'사냥 중단':finished?'모든 스테이지 완료':h?'사냥 계속':empty?'사냥권 충전 보기':'사냥';
    return '<section class="watch-view"><div class="watch-stage">STAGE <b>'+rank+'</b></div>'+
      '<div class="scene watch-arena combat-hud">'+fighter('player','나',sprite,128,hp,max)+fighter('enemy',enemy.name,'boar',144,enemyHp,total)+'</div>'+
      '<div class="watch-reward" role="status">'+skills(h)+(reward?'<b>'+reward.rank+'스테이지 클리어</b><strong>'+icon('coins')+' +'+fmt(reward.gold)+' G</strong><div class="watch-loot">'+
        [[reward.shards,'sparkles','별의 파편'],[reward.scrolls,'scroll-text','주문서'],...[0,1,2].map(i=>[reward.charms[i],['leaf','hammer','star'][i],Game.blessings[i]])].filter(([n])=>n).map(([n,ic,title])=>'<span aria-label="'+title+' '+n+'개" title="'+title+'">'+icon(ic)+' +'+n+'</span>').join('')+'</div>':reason?'<b>'+reason+'</b>':'')+'</div>'+
      (!motionEnabled()?'<div class="watch-motion-hint"><span>'+(reducedMotion.matches&&!prefs.motionOverride?'기기 설정으로 연출 정지':'연출 꺼짐')+'</span><button class="mini" data-motion-policy="full">연출 켜기</button></div>':'')+
      '<button class="primary watch-start" '+(empty&&!active?'data-open="huntWallet"':'data-watch="toggle"')+(finished?' disabled':'')+'><span class="watch-start-label">'+icon(active?'shield':'sword')+label+'</span>'+ticketBar(w)+'</button>'+
      (!active&&reason==='패배 · 장비를 강화해 주세요'?go('forge','장비 강화','action'):'')+'</section>';
  };
  function beforeRender(){if(active&&!allowed())stop('',false);}
  function refreshWallet() {
    if(!allowed())return;
    const button=document.querySelector('.watch-start'),w=Game.huntingStatus(state);
    if(!button)return;
    if(!active&&!state.hunt&&!pending()&&state.huntBest<60&&(button.dataset.open==='huntWallet') !== (!w.free&&!w.purchased)){render();return;}
    // Update only the meter: a whole-screen render would cancel the current attack.
    const bar=button.querySelector('.watch-ticket-bar');if(!bar)return;
    const t=ticketInfo(w),label=bar.querySelector('.watch-ticket-text');
    if(label.textContent!==t.text)label.textContent=t.text;
    bar.dataset.empty=String(t.empty);bar.querySelector('.watch-ticket-fill').style.width=t.width+'%';
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
    repeatHunting.stop('관전 사냥');autoCombat.stop();active=true;reason='';outcome=null;generation++;render();arm(100);
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('일시 중단');});
  window.addEventListener('pagehide',()=>stop('',false));
  window.addEventListener('hashchange',()=>{if(current()!=='forest'||phonePage('forest')!=='hunt')stop('',false);});
  return {view, stop, beforeRender, refreshWallet, stageOutcome, get active(){return active;}};
})();
