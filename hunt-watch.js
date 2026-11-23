/* Session-only spectator controller. Durable operations use act() and the save lock. */
const HuntWatch=(()=>{
  let active=false,generation=0,timer=null,busy=false,reward=null,reason='',lastRound=null;
  let mode = 'progress', fixedRank = 1, replayRank = 0, saveGeneration = null, nextStrikeAt = 0;
  let run = null, endgameRepeatSelected = false, revealEntry = '', revealUntil = 0;
  const names={strike:'공격',block:'방어',heavyStrike:'강타'};
  const icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  const allowed=()=>ready&&!storageError&&!restarting&&!document.hidden&&(!modal || HuntLootView.isReader(modal))&&current()==='forest'&&phonePage('forest')==='hunt';
  const live = token => token === generation && active && allowed() && state._save?.generation === saveGeneration;
  const pending=()=>!state.hunt&&state.chests.find(c=>c.id===state.lastHunt?.chestId&&c.source==='forest');
  const cleared = s => Game.blades.state(s).cleared;
  // E3 exploration: treasure and food settle inside the start; only the cart waits in s.hunt.
  function explorationReceipt(s) {
    const last = s.lastHunt;
    if (s.hunt || Game.huntOutcome(last) !== 'explored') return null;
    if (last.exploration.kind === 'food') return {food:1, entryId:last.id, rank:last.rank};
    return last.receiptId && s.lastChest?.id === last.receiptId ? {...s.lastChest} : null;
  }
  function explorationFind(s) {
    const h = s.hunt;
    const cache = s.artisanCache;
    if (cache?.status === 'pending') return {kind:'artisan',rank:cache.rank,entry:s.lastHunt?.id===cache.id?s.lastHunt:{id:cache.id,rank:cache.rank},event:cache,pending:true};
    if (!h&&cache?.status==='claimed'&&(!s.lastHunt||s.lastHunt.id===cache.id)) return {kind:'artisan',rank:cache.rank,entry:s.lastHunt||{id:cache.id,rank:cache.rank},event:cache,pending:false,restored:!s.lastHunt};
    if (h?.exploration) return {kind:h.exploration.kind, rank:h.rank, entry:h, event:h.exploration, pending:true};
    const last = s.lastHunt;
    if (h || !reward?.entryId || !last?.exploration || last.id !== reward.entryId) return null;
    return {kind:last.exploration.kind, rank:last.rank, entry:last, event:last.exploration, pending:false};
  }
  const findNames = {treasure:'보물함', food:'식량 꾸러미', cart:'짐수레',artisan:'봉인된 장인의 보물함'};
  function planLabel(plan) {
    const parts = (plan?.gear || []).map(type => type === 'armor' ? '방어구' : '무기');
    if (plan?.outfit === 'outfit') parts.push('착용 장비');
    if (plan?.outfit === 'outfitSalvaged') parts.push('착용 분해');
    return parts.join(' · ') || '장비';
  }
  function cartChoices(h, summaryOnly = false) {
    const e = h.exploration, o = e.offer;
    const shared = ['각인석 +1', o.fiber && '섬유 +' + fmt(o.fiber), o.shards && '별의 파편 +' + fmt(o.shards),
      o.scrolls && '주문서 +' + fmt(o.scrolls), ...(o.charms || []).map((n, i) => n && Game.blessings[i] + ' +' + fmt(n))].filter(Boolean);
    if (summaryOnly) return shared.join(' · ');
    const choice = (key, art, title, sub, gold) =>
      '<button type="button" class="explore-choice" data-explore-choice="' + key + '" data-hunt-id="' + escapeHtml(h.id) +
      '" aria-label="' + escapeHtml(title + ' · ' + sub + ' · ' + fmt(gold) + ' G') + '"><span class="explore-choice-title">' + (key === 'gear' ? controlArt('bag') : icon('coins')) +
      '<b>' + title + '</b></span><small>' + escapeHtml(sub) + '</small><strong>+' + fmt(gold) + ' G</strong></button>';
    return '<div class="explore-cart" id="exploreChoices"><small class="explore-shared">둘 다 · ' + shared.map(escapeHtml).join(' · ') + '</small>' +
      '<div class="explore-choices" role="group" aria-label="수레 보상 고르기">' +
      choice('gear', 'backpack', '장비 챙기기', planLabel(e.plan), o.gold) +
      choice('gold', 'coins', '금속 팔기', '장비 대신 골드', o.gold + e.saleGold) + '</div></div>';
  }
  // Detail-only odds from the rules helper: the same phase, food-cap and cart-rest table the next start would use.
  function exploreOdds(s, rank) {
    const territory = bossTerritory(s, rank);
    const enemy = Game.trail.enemy(territory, Game.trail.lineup(territory)[0]).name;
    const p = Game.explorationPreview(s, rank), o = p.odds;
    const odds = !p.eligible ? (rank % 5 === 0 ? '우두머리 단계 · 항상 전투' : rank > cleared(s) && rank % 5 === 1 ? '구간 첫 단계 · 항상 전투' : '지원 재도전 · 전투') :
      '전투 ' + o.combat + ' · 보물 ' + o.treasure + ' · 식량 ' + o.food + ' · 수레 ' + o.cart + '%';
    const notes = p.eligible ? [p.phase === 'first' ? '첫 진행' : '반복', !p.foodPossible && '식량 한도', /ooldown/.test(p.table) && '수레 쉬는 중'].filter(Boolean) : [];
    return '<div class="explore-odds" data-explore-odds>' + line(rank + '단계 탐험' + (notes.length ? ' · ' + notes.join(' · ') : ''), odds) +
      line('전투가 나올 때의 상대', escapeHtml(enemy)) + line('장인의 보물함','적격 보물 발견 중 '+fmt(Game.exploration.artisanChance*100)+'%') + desc('출발 시 보증과 미해결 상자가 없고, 성공률 100% 미만인 일반 +3~+18 무기·흉갑이 있어야 합니다. 공정·마지막 돌파는 제외합니다.') + '</div>';
  }
  function exploreRules(s) {
    const rank = s.hunt?.rank || nextRank() || Math.min(60, cleared(s) + 1);
    return desc('숲에서는 전투 대신 보물·식량·수레를 만날 수 있습니다. 보물과 식량은 바로 받고 단계를 마칩니다. 수레는 장비와 골드 중 하나를 고를 때까지 기다립니다.') +
      exploreOdds(s, rank);
  }
  function focusChoice() {
    document.querySelector('[data-artisan-choice]:not(:disabled),[data-explore-choice]:not(:disabled)')?.focus({preventScroll:true});
  }
  function discoveryView(s,find) {
    const cache=s.artisanCache, choosing=find.pending, artisan=find.kind==='artisan';
    const settled=HuntLootView.settled(s), receipt=settled&&find.entry.receiptId===settled.chest.id?settled:null;
    const w=Game.huntingStatus(s), ore=Game.blades.state(s).ore;
    const count=receipt?(receipt.result.gearDrops?.length||0)+(receipt.result.outfitDrop?1:0):0;
    const base=receipt?'기본 보상 수령 · +'+fmt(receipt.chest.gold)+' G'+(count?' · 장비 '+count:''):'기본 보상은 이미 수령했습니다';
    let title=findNames[find.kind], summary='', decisions='';
    if(artisan&&choosing){
      summary=base;
      const cost=Game.exploration.artisanCost;
      decisions='<div class="discovery-choice-group" id="exploreChoices" role="group" aria-label="장인의 보물함 선택">'+
        '<button class="explore-choice" data-artisan-choice="open" data-artisan-id="'+escapeHtml(cache.id)+'"'+(ore<cost?' disabled':'')+'>'+controlArt('hammer')+
        '<b>봉인 풀기</b><small>각인석 '+cost+' · 보유 '+fmt(ore)+(ore<cost?' · 부족':'')+'</small></button>'+
        '<button class="explore-choice" data-artisan-choice="pass" data-artisan-id="'+escapeHtml(cache.id)+'">'+controlArt('bag')+'<b>기본 보상만</b><small>추가 소모 없음</small></button></div>';
    }else if(artisan){
      title=find.restored?'장인의 보증 1회 보유':'장인의 보증 1회 획득'; summary='정상 강화비를 내고 적격 강화 성공 보장';
      decisions='<div class="discovery-choice-group"><button class="explore-choice" data-artisan-forge>'+controlArt('hammer')+'<b>대장간에서 사용</b></button>'+
        (receipt?openBtn('huntLoot',icon('backpack')+'최근 전리품','explore-choice'):'')+'</div>';
    }else if(find.kind==='cart'&&choosing){
      title=find.event.name||'짐수레 발견';
      summary='둘 다 · '+cartChoices(s.hunt,true);
      decisions=cartChoices(s.hunt);
    }else if(find.kind==='food'){
      title='식량 발견 · 탐험 완료'; summary='+1 식량 · 보유 '+fmt(w.free+w.purchased);
    }else{
      title=find.kind==='cart'?(find.event.choice==='gold'?'금속 판매 · 탐험 완료':'장비 수령 · 탐험 완료'):'보물 발견 · 탐험 완료';
      summary=receipt?'+'+fmt(receipt.chest.gold)+' G'+(count?' · 장비 '+count:''):'';
      if(receipt) decisions='<div class="discovery-choice-group">'+openBtn('huntLoot',icon('backpack')+'최근 전리품','explore-choice')+
        (receipt.chest.fiber?openBtn('bladeArmorLining',icon('shield')+'안감 제작','explore-choice'):'')+'</div>';
    }
    const art=artisan?(choosing?'chest-sealed':'chest-open'):find.kind==='treasure'?'chest-open':find.kind==='food'?'supply':'cart';
    const finished=!validRank(nextRank()), empty=!w.free&&!w.purchased;
    const toggle=!choosing&&!finished&&!empty;
    const label=choosing?'보상 선택':active?'탐험 중지':finished?'구역 선택':empty?'식량 부족':'탐험 계속';
    const control=choosing?'data-explore-focus aria-describedby="exploreChoices"':toggle?'data-watch="toggle"':finished?'data-open="huntPlan"':'data-open="huntWallet"';
    const note=choosing?'위에서 하나 선택':active?'연속 탐험 중':toggle?'1초 누르면 연속 탐험':'';
    const rank=find.rank, area=Game.trail.region(bossTerritory(s,rank));
    return '<section class="watch-view watch-ground" data-discovery><div class="watch-stage"><b>'+rank+'단계</b> '+area.name+' · 발견 <small class="watch-version">v'+UpdateNotice.version()+'</small></div>'+
      '<div class="scene watch-arena discovery-arena" data-region="'+area.id+'" data-find="'+find.kind+'">'+
      '<div class="discovery-head" role="status"><b>'+escapeHtml(title)+'</b><span>'+escapeHtml(summary)+'</span>'+
      (artisan&&choosing?'<small>정상 강화비 별도 · 일반 강화 1회 성공 보장</small>':'')+'</div>'+
      '<div class="discovery-object"><div class="watch-find" role="img" aria-label="'+findNames[find.kind]+'"><img class="explore-art" src="assets/hunt/exploration-'+art+'.png" width="56" height="56" alt="">'+
      (find.kind==='treasure'&&motionEnabled()&&revealEntry===find.entry.id&&performance.now()<revealUntil?'<img class="discovery-opening" src="assets/hunt/exploration-chest-closed.png" alt="" aria-hidden="true">':'')+'</div></div>'+
      '<div class="discovery-decisions">'+decisions+'</div></div><div class="watch-home-actions">'+
      go('forest/field',icon('hand-coins')+'<span>배치 수익</span>','action')+
      '<button class="primary watch-start'+(active?' watch-active':'')+'" '+control+'><span class="watch-start-label">'+controlArt(choosing?'bag':'compass')+label+'</span>'+
      (note?'<span class="watch-start-mode">'+note+'</span>':'')+(choosing?'':foodBar(w,toggle&&!active?'hunt':''))+'</button>'+
      go('world/map',controlArt('compass')+'<span>모험 지도</span>','action')+'</div></section>';
  }
  const powerFor = s => typeof Game.huntPower === 'function' ? Game.huntPower(s) : null;
  function powerReadout(s, power) {
    if (!power) return '';
    const held = !!s.hunt?.powerHeld;
    const paid = ['free','purchased'].includes(s.hunt?.ticketSource);
    const retreatCost = paid ? '퇴각 시 식량 환불 없음 · 보상/진척 없음' : '식량 소모 없음 · 퇴각 보상/진척 없음';
    return '<div class="watch-power-readout" role="status"><small>전투력 · 이 적 기준 · '+(held?'현재 장비':'출발 장비')+'</small>'+
      (power.unavailable ? '<b>전투력 확인 불가</b>' : '<div class="watch-power-values"><span>나 <b data-power-player>'+fmt(power.player)+
        '</b></span><span>적 <b data-power-enemy>'+fmt(power.enemy)+'</b></span></div>')+
      (held ? '<small class="watch-power-reason">'+(power.unavailable ? '계산을 확인하기 전 시작하지 않습니다' : power.blocked ?
        '적이 더 높아 첫 공격 전 멈췄습니다' : '준비 완료 · 직접 시작하세요')+'</small><small class="watch-power-cost">'+retreatCost+'</small>' : '')+'</div>';
  }

  const nextRank = () => {
    if (run?.advance) return cleared(state) + 1;
    return mode === 'repeat' ? fixedRank : cleared(state) >= 60 ? replayRank : cleared(state) + 1;
  };
  function validRank(rank) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 60 || rank !== nextRank()) return false;
    const currentClear = cleared(state);
    const progressing = run?.advance || (mode === 'progress' && currentClear < 60);
    return progressing ? rank === currentClear + 1 : rank <= currentClear;
  }
  function bossTerritory(s, rank) {
    return rank === 60 && cleared(s) === 60 ? 45 + Game.blades.state(s).master * 5 : rank;
  }
  function mastery(s) {
    if (cleared(s) !== 60) return "";
    const selected = Game.blades.state(s).master;
    return '<div class="blade-mastery"><h4>60단계 우두머리</h4>' + [45,50,55,60].map((rank, i) => {
      const area = Game.trail.region(rank);
      return btn("bladeMaster", Game.trail.enemy(rank,area.boss).name, i, selected === i ? "mini active" : "mini");
    }).join("") + '</div>';
  }
  function selectMaster() {
    mode = "progress"; replayRank = 60; endgameRepeatSelected = false;
    reward = null; lastRound = null; reason = "";
  }
  function farmingHint(s,rank) {
    const territory = bossTerritory(s,rank);
    const region = Game.trail.region(territory);
    const weak = Game.outfit.preferredElement(territory);
    return region.name+' · '+Game.outfit.elements[weak]+' 속성 장비 획득에 유리';
  }
  function recentCheck(s) {
    const roll = (s.hunt || s.lastHunt)?.lastDice;
    if (!roll?.attackCheck) return '';
    function row(label, face, check, side, damage) {
      const total = face + check.bonus;
      return line('<span class="hunt-check-side">' + label + '</span>', 'd20 ' + face + (check.bonus ? ' + ' + check.bonus + ' = ' + total : '') +
        ' · 방어 d6 ' + check.defense + ' · 목표 ' + check.target + ' · ' +
        HuntEffects.checkLabel(check.outcome, side) + ' · 피해 ' + fmt(damage));
    }
    return '<section class="hunt-recent-check"><h4>최근 판정</h4>' +
      row('내 공격', roll.playerFace, roll.attackCheck, 'player', roll.damage) +
      (roll.replyCheck ? row('적 공격', roll.enemyFace, roll.replyCheck, 'enemy', roll.taken) : '') + openBtn('huntRules','사냥 규칙') + '</section>';
  }
  function planView(s) {
    const repeat = mode === 'repeat';
    const chooseRank = repeat || cleared(s) >= 60;
    const rank = repeat ? fixedRank : replayRank;
    const choices = Array.from({length: Math.min(60, cleared(s))}, (_, i) => {
      const n = i + 1;
      return '<option value="' + n + '"' + (n === rank ? ' selected' : '') + '>' +
        n + '단계 · 섬유 ' + Game.forestYield(n) + '</option>';
    }).join('');
    return recentCheck(s) + '<div class="hunt-plan-fields"><label>사냥 방식<select class="watch-mode">' +
      '<option value="progress">' + (cleared(s) >= 60 ? '1회 재도전' : '다음 단계 진행') + '</option>' +
      '<option value="repeat"' + (repeat ? ' selected' : '') + '>' +
      (cleared(s) >= 60 ? '완료 구역 반복' : '완료 구역 재도전') + '</option></select></label>' +
      '<label' + (chooseRank ? '' : ' hidden') + '>완료 구역<select class="trail-replay">' +
      '<option value="0" disabled' + (rank ? '' : ' selected') + '>단계 선택</option>' + choices + '</select></label>' +
      '<button class="primary" data-hunt-plan-apply' + (!cleared(s) || chooseRank && !rank ? ' disabled' : '') + '>적용</button></div>' + mastery(s) +
      '<p class="desc" data-farm-hint>'+farmingHint(s,nextRank() || 60)+'</p>'+exploreOdds(s,nextRank() || Math.min(60,cleared(s)+1))+openBtn("bladeLoot-"+(nextRank() || Math.min(60,cleared(s)+1)), "단계별 장비 획득 확률");
  }
  function firstReceipt(s) {
    const last = s.lastHunt;
    if (s.hunt || !last?.firstGearChoice || s.chests.some(c=>c.id===last.chestId)) return null;
    return {rank:last.rank,gold:last.reward};
  }
  function compareLoot(s) {
    const receipt = HuntLootView.reading;
    if (!receipt?.result.firstGearChoice) return ['장비 비교', desc('첫 전리품은 보관함에서 확인할 수 있습니다.')];
    const b = Game.blades;
    const rows = (receipt.result.gearDrops || []).map(drop => {
      const armor = drop.type === 'armor';
      const item = (armor ? b.armors(s) : b.state(s).items).find(it => it.id === drop.id);
      if (!item) return '';
      const current = armor ? b.currentArmor(s) : b.current(s);
      const equipped = item.id === current.id;
      const value = (before, after) => equipped || before === after ? after : before+' → '+after;
      let numbers;
      if (armor) {
        numbers = '흉갑 방어력 '+value(fmt(b.armorRating(current)),fmt(b.armorRating(item)))+' · 체력 '+
          value(fmt(b.armorStats(s,current).hp),fmt(b.armorStats(s,item).hp));
      } else {
        const worn = b.weaponStats(current), stats = b.weaponStats(item);
        numbers = '물리 '+value(BladeView.damageRange(worn),BladeView.damageRange(stats))+' · 치명타 '+
          value(pct(worn.critChance),pct(stats.critChance));
      }
      const mods = item.mods.map(m => b.modDefs[m.key].name+' +'+m.value+(m.key === 'plating' ? '%p' : '%'));
      return row(GearGradeView.colored(item,BladeView.label(item)), numbers+(mods.length ? '<br>'+mods.join(' · ') : ''),
        btn(armor ? 'bladeArmorEquip' : 'bladeEquip',equipped ? '장착 중' : '장착',item.id,'mini',equipped),'',BladeView.artwork(item));
    }).join('');
    const drop = receipt.result.outfitDrop;
    let regional = '';
    if (drop) {
      const outfit = Game.outfit, data = outfit.state(s), item = data.items.find(it => it.id === drop.id);
      if (item) {
        const slots = outfit.slots.filter(slot => slot.kind === item.kind);
        const current = slots.find(slot => data.equipped[slot.key] === item.id);
        const slot = current || slots.find(slot => !data.equipped[slot.key]);
        const area = Game.trail.region(receipt.result.territoryRank || receipt.chest.rank);
        const effect = outfit.effect(item), element = outfit.elements[item.element];
        const diff = outfit.profile(receipt.result.territoryRank || receipt.chest.rank)[item.element] < 0 ? ' · '+area.name+' 약점' : '';
        const action = slot ? btn('outfitEquip',current ? slot.name+' 착용 중' : slot.name+' 착용',slot.key+':'+item.id,'mini',!!current) :
          openBtn('outfit:item:'+item.id,'교체할 부위 선택','mini');
        regional = row(GearGradeView.colored(item,outfit.name(item)),(b.armorRating(item) ? '방어력 '+fmt(b.armorRating(item))+' · ' : '')+element+' 피해 전환 '+effect.conversion+'%'+
          (effect.exposure ? ' · 저항 −'+effect.exposure+'%p' : '')+diff,action,'',OutfitView.art(item.kind));
      }
    } else if (receipt.result.outfitSalvaged) regional = OutfitView.receipt(s,receipt.result);
    const supplies = receipt.result.materialPrize ? line("함께 획득",escapeHtml(receipt.result.materialPrize)) : '';
    return ['장비 비교', rows+regional+supplies+'<button class="primary" data-watch="continue">계속 사냥</button>'];
  }
  function defeatSummary(last) {
    const hit = last?.strongestHit;
    if (!hit) return '';
    const enemy = Game.trail.enemy(last.territoryRank || last.rank, hit.kind);
    const attack = DiceCombat.enemySkills[hit.skill]?.name || '타격';
    return '<small>최대 피격 · '+escapeHtml(enemy.name)+' '+attack+' −'+fmt(hit.taken)+' HP</small>';
  }
  function huntStatus(s, held) {
    const motion = motionEnabled() ? '' : '<div class="watch-motion-hint"><button class="mini" data-motion-policy="full"><small>' +
      (reducedMotion.matches && !prefs.motionOverride ? '기기 설정으로 정지' : '연출 꺼짐') + '</small>연출 켜기</button></div>';
    if (active) return motion;
    const task = s.weapon.route?.trait === 'edge' && Game.routeTask(s);
    const rank = nextRank();
    const area = validRank(rank) && Game.blades.area(rank);
    const estimate = area && !s.hunt ? '<div class="watch-estimate" aria-label="' + rank + '단계 권장 장비와 승리 보상"><span>' +
      (reward || held || lastRound ? rank + '단계 · ' : '') + '권장 공격 ' + fmt(area.attack) + '</span><b>' + icon('coins') + '승리 ' + fmt(Game.bladePrizeGold(rank)) + ' G</b></div>' : '';
    const training = task?.open && !task.ready ? '<small>수련 ' + task.needed + '단계 이상</small>' : '';
    return '<div class="watch-status">' + estimate + training + motion + '</div>';
  }
  function foodMeter(w, departure) {
    const total = w.free + w.purchased, empty = total === 0;
    const seconds = Math.ceil((w.remaining || 0) / 1000);
    const countdown = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0');
    const detail = empty ? ' · 보급 ' + countdown : departure === 'retry' ? ' · 소모 없음' : departure ? ' · 1개 소모' : '';
    return {text:'식량 ' + fmt(total) + detail, empty, width:Math.min(100,total / Game.hunting.cap * 100)};
  }
  function foodBar(w, departure) {
    const meter = foodMeter(w, departure);
    return '<span class="watch-ticket-bar" data-departure="' + departure + '" data-empty="' + meter.empty + '"><span class="watch-ticket-fill" aria-hidden="true" style="width:' +
      meter.width + '%"></span><span class="watch-ticket-text">' + meter.text + '</span></span>';
  }
  function stop(why='',paint=true) {active=false;run=null;generation++;clearTimeout(timer);timer=null;nextStrikeAt=0;reason=why;if(paint&&state)render();}
  function restoreReceipt() {
    mode = 'progress'; fixedRank = 1; replayRank = 0; endgameRepeatSelected = false;
    reward = null;
    lastRound = null;
    if (current() !== 'forest' || phonePage('forest') !== 'hunt' || state.hunt) return;
    if (state.lastChest?.source === 'forest' && state.lastChest.id === state.lastHunt?.chestId)
      reward = {...state.lastChest};
    else reward = explorationReceipt(state);
  }
  function stageOutcome(before, action, result){
    if(state.hunt)lastRound=null;
    // Keep the final round's skill readouts while the saved result supplies HP and dice.
    else if(before&&!before.exploration&&state.lastHunt?.id===before.id)lastRound=before;
    // An exploration start or cart choice settles at once; its receipt replaces the scene's result.
    if(!result?.ok||state.hunt||Game.huntOutcome(state.lastHunt)!=='explored')return;
    const last=state.lastHunt;
    const started=action==='huntStart'&&!!result.exploration&&result.receipt?.id===last.id;
    const chosen=action==='huntChoose'&&before?.exploration&&before.id===last.id;
    const receipt=(started||chosen)&&explorationReceipt(state);
    if(receipt){reward=receipt;lastRound=null;reason='';if(started){revealEntry=last.id;revealUntil=performance.now()+450;}}
  }
  function d20(side, face, check) {
    const label = check ? HuntEffects.checkLabel(check.outcome, side) : '';
    const actor = side === 'player' ? '내 공격' : '적 공격';
    const description = check ? actor + ' d20 ' + face : actor + ' 주사위 대기';
    return '<div class="watch-roll" data-die="' + side + '" data-d20="true"' +
      (check ? ' data-outcome="' + check.outcome + '"' : '') +
      '><b class="watch-d20-owner" aria-hidden="true">' + actor +
      '</b><div class="watch-die" data-action="' + (check ? 'strike' : '') +
      '" role="img" aria-label="' + description + '">' + (check ? face : '') +
      '</div><span class="watch-verdict">' + label + '</span></div>';
  }
  function impactNumber(side, roll) {
    const check = side === 'enemy' ? roll?.attackCheck : roll?.replyCheck;
    const damage = check ? (side === 'enemy' ? roll.damage : roll.taken) : 0;
    const bleed = damage && check.outcome === 'miss';
    const critical = damage && check.outcome === 'critical';
    return '<b class="watch-impact-number" data-impact-target="' + side + '"' +
      (bleed ? ' data-bleed' : '') + (critical ? ' data-critical' : '') +
      (damage ? ' title="' + (bleed ? '출혈 피해 ' : '피해 ') + fmt(damage) + '"' : '') + '>' +
      (damage ? HuntEffects.damageLabel(damage, check.outcome) : '') + '</b>';
  }
  function die(face,action,side) {
    return '<div class="watch-roll" data-die="'+side+'"><div class="watch-die" data-action="'+(action||'')+'" role="img" aria-label="'+(face?names[action]+' 주사위':'주사위 대기')+'">'+icon(icons[action]||'sword')+'</div><span>'+(face?names[action]:'')+'</span></div>';
  }
  function skills(h){
    if(!h || ![1,2].includes(h.diceVersion))return '';
    if (h.bladeCombat) {
      const style = h.bladeCombat.style, key = {heavy:"heavyStrike",counter:"counter",wound:"rupture"}[style];
      const cd = Math.max(0,(h.skillCooldowns?.[key] || 0) - 1);
      const charge = style === "heavy" ? h.momentum ?? 1 : style === "wound" ? h.wounds || 0 : Number(!!h.counter);
      const need = style === "heavy" ? 2 : style === "wound" ? 3 : 1;
      const ready = !cd && charge >= need;
      const label = h.bladeCombat.ascension === style ? Game.endgame.transform[style].name : {heavy:"일격",counter:"반격",wound:"파열"}[style];
      const hint = h.lastDice?.skill === key && !motionEnabled() ? "발동" : cd ? cd + "턴 대기" : ready ? "준비 완료" : style === "heavy" ? "기세 "+charge+"/2" :
        style === "wound" ? "상처 "+charge+"/3" : "방어 대기";
      const meter = Array.from({length:need},(_,i)=>'<i'+(i < charge && !cd ? ' class="filled"' : '')+'></i>').join("");
      return '<div class="watch-skills"><span class="watch-skill" data-skill="'+key+'" data-ready="'+ready+'" aria-label="'+label+' · '+hint+'"><span class="watch-skill-heading">'+
        icon({heavy:"hammer",counter:"shield",wound:"sword"}[style])+'<b>'+label+'</b><em>'+hint+'</em></span><span class="watch-skill-clock" aria-hidden="true">'+meter+'</span></span></div>';
    }
    return '<div class="watch-skills" aria-label="자동 전투 스킬">'+Object.entries(DiceCombat.skills).map(([key,def])=>{
      const s=DiceCombat.skillStatus(h,key);
      // Cooldowns tick at the next turn's start; one remaining turn can already fire on its attack face.
      const next=DiceCombat.skillStatus({...h,skillCooldowns:{...h.skillCooldowns,[key]:Math.max(0,s.cooldown-1)}},key);
      const locked=key==='heavyStrike'&&h.rank<2,ready=!locked&&next.ready;
      const status=locked?'2단계 해금':ready?'준비 완료':s.cooldown>1?s.cooldown+'턴':
        key==='counter'?'방어 대기':'기세 '+(h.momentum??1)+' / 2';
      const filled=locked?0:s.cooldown>1?Math.max(0,def.cooldown-s.cooldown):def.cooldown;
      const label=def.name+' · '+status;
      return '<span class="watch-skill" data-skill="'+key+'" data-ready="'+ready+'" data-state="'+(locked?'locked':ready?'ready':s.cooldown>1?'cooldown':'condition')+'" aria-label="'+label+'"><span class="watch-skill-heading">'+icon(def.icon)+'<b>'+def.name+'</b><em>'+status+'</em></span><span class="watch-skill-clock" aria-hidden="true">'+Array.from({length:def.cooldown},(_,i)=>'<i'+(i<filled?' class="filled"':'')+'></i>').join('')+'</span></span>';
    }).join('')+'</div>';
  }
  function enemySkill(h){
    if(!h?.enemySkillState)return '';
    const s=h.enemySkillState,def=DiceCombat.enemySkills[s.key || 'charge'],ready=s.cooldown<=1;
    const status=h.diceVersion===2 && !motionEnabled() && h.lastDice?.enemySkill===s.key ? '발동' : s.key==='escape'?(h.waveTurn>=2?'이번 턴':'2턴째 도주'):ready?'다음 공격':s.cooldown+'턴';
    const hint = h.diceVersion===2 ? {
      breath:'일격을 시도한 턴에는 숨결 피해가 1.5배가 됩니다.',
      dust:'적중하면 기세를 1 잃습니다.',
      bind:'적중하면 일격의 대기시간이 늘어납니다.',
    }[s.key] || def.hint : def.hint;
    return '<span class="watch-enemy-skill" data-ready="'+ready+'" title="'+hint+'" aria-label="적 '+def.name+' · '+status+'"><span>'+icon(def.icon)+'<b>'+def.name+'</b><em>'+status+'</em></span><span class="watch-skill-clock" aria-hidden="true">'+Array.from({length:s.interval},(_,i)=>'<i'+(i<(ready?s.interval:s.interval-s.cooldown)?' class="filled"':'')+'></i>').join('')+'</span></span>';
  }
  function encounterHint(h, result, enemy, rank, pack) {
    if (Game.trail.awaitingNext(h)) {
      let event = enemy.name + ' 격파';
      if (enemy.kind === 'goblin') event = h.goblinCaught ? (h.journeyBattle ? '황금 고블린 격파' : '돈주머니 획득') : '황금 고블린이 달아났습니다';
      return event + ' · 다음은 ' + Game.trail.enemy(h.territoryRank || rank, pack[h.wave + 1]).name;
    }
    if (h?.enemyKind === 'goblin') return h.journeyBattle ? '황금 고블린이 두 번째 턴에 도주합니다' : '두 턴 안에 잡으면 상자에 기본 골드 +50%';
    if (!h && !result && rank % 5 === 0) return '조우 첫 타격 주의';
    return '';
  }
  function view(s) {
    const h=s.hunt;
    const power=powerFor(s), powerHeld=!!h?.powerHeld;
    // Discovery has its own noncombat composition; combat rendering below stays unchanged.
    const find = explorationFind(s);
    if (find) return discoveryView(s,find);
    const settled = HuntLootView.settled(s);
    const first = !active && firstReceipt(s);
    const receipt = reward || first;
    const defeated = !h && !active && Game.huntOutcome(s.lastHunt) !== 'explored' && (reason.startsWith('패배') || s.lastHunt?.strongestHit &&
      !s.lastHunt.chestId && nextRank()===s.lastHunt.rank);
    const result = !h && (receipt || pending() || defeated || lastRound) ? s.lastHunt : null;
    const resultChest = result?.chestId || result?.receiptId;
    const received = receipt && settled && !!resultChest && resultChest === settled.chest.id;
    const targetRank=h?.rank || result?.rank || nextRank();
    const rank=targetRank || 60;
    const encounter = h || result;
    const terrain = encounter ? encounter.territoryRank || rank : bossTerritory(s, rank);
    const pack = Game.trail.lineup(terrain,encounter?.bonusEncounter);
    const trail = !encounter || encounter.trailVersion === 1;
    const wave = encounter?.wave ?? 0;
    const enemy = encounter ? Game.huntEnemy(encounter) : Game.trail.enemy(terrain,pack[0]);
    const area=Game.trail.region(terrain);
    const bossKind = enemy.kind === 'crown' ? 'tusk' : enemy.kind;
    const territory = trail ? targetRank && rank % 5 === 0 && area.id : enemy.elite && 'moss';
    const st=encounter?.bladeCombat || (encounter && !encounter.blade ? Game.huntStats(s) : Game.blades.skills(s));
    const roll=encounter?.lastDice;
    const useD20=!encounter || encounter.diceVersion===2;
    const useDice=encounter?.diceVersion===1;
    const item=Game.blades.current(s);
    const blade=encounter ? Game.huntBlade(s,encounter) : {name:Game.blades.name(item),level:item.level,weaponKind:item.weaponKind,stage:Game.bladeStage({level:item.level,grade:0})};
    const fightingItem = encounter?.bladeId ? Game.blades.state(s).items.find(it => it.id === encounter.bladeId) :
      encounter ? null : item;
    const sprite=BladeView.sprite(blade,blade.stage || 0);
    const resultHealth=result?.health;
    const skillState = h || (result?.bladeCombat && result.lastDice ? {
      ...result, ...result.lastDice, lastDice:result.lastDice,
      enemySkillState:result.lastDice.enemySkillState,
    } : lastRound?.id===result?.id ? lastRound : null);
    const hp=h?.hp??resultHealth?.hp??st.hp,max=h?.maxHp??resultHealth?.maxHp??st.hp,enemyHp=h?.enemyHp??resultHealth?.enemyHp??Game.blades.area(rank).enemyHp;
    const total=h?.enemyMax??resultHealth?.enemyMax??enemyHp;
    function fighter(side,label,level,asset,width,current,maxHp) {
      const elite = side === 'enemy' && enemy.elite;
      const actor = elite ? '<img class="trail-creature boss-creature" src="assets/hunt/boss-'+bossKind+'.webp" alt="">' : ['wolf','moth','tree','goblin'].includes(asset)
        ? '<img class="trail-creature" src="assets/hunt/'+asset+'.webp" alt="">'
        : '<canvas width="'+width+'" height="144" data-sprite="'+asset+'" aria-hidden="true"></canvas>';
      const action = useDice ? die(roll?.[side+'Face'],roll?.[side],side) : '';
      return '<div class="watch-fighter '+side+'"'+(elite?' data-elite="true" data-boss="'+bossKind+'"':'')+' data-action="'+(roll?.[side]||'')+'">'+
        '<div class="watch-readout">'+healthMeter(side,label,current,maxHp,level,side==='player' ? fightingItem : null)+
        '<div class="watch-action">'+action+'</div>'+(side==='player'?skills(skillState):enemySkill(skillState))+'</div>'+
        '<div class="watch-actor'+(asset==='moth'?' airborne':'')+'"'+(current<=0?' data-defeated="true"':'')+'>'+
        actor+'<div class="watch-ward" aria-hidden="true">'+icon('shield')+'</div></div></div>';
    }
    const w = Game.huntingStatus(s), held = h || pending();
    const finished = !held && !validRank(nextRank());
    const empty = !held && !w.free && !w.purchased;
    const retry = !held && Game.hasBossRetry(s,nextRank());
    const departure = active || held || finished ? '' : retry ? 'retry' : 'hunt';
    const stageLabel = result && nextRank() !== result.rank ? nextRank() + '단계 사냥' : '사냥';
    const label = powerHeld ? power?.blocked !== false ? '대장간 준비' : '전투 시작' : active ? '사냥 중지' : finished ? '구역 선택' :
      held ? '진행 재개' :
      empty ? '식량 부족' : retry ? '지원 재도전' : cleared(s) >= 60 && mode !== 'repeat' ? '1회 재도전' : stageLabel;
    const detail = encounterHint(h,result,enemy,rank,pack);
    const kit = h ? h.fieldKit : !result && targetRank ? Game.outfit.build(s) : null;
    const home = !active && (!encounter || location.hash === '#world');
    const canToggle = !powerHeld && (active || (!finished && !empty));
    // A power hold never accepts the ordinary start/long-press gesture.
    const control = powerHeld ? (power?.blocked === false ? 'data-power-resume' : 'data-power-prepare')+' data-hunt-id="'+escapeHtml(h.id)+'" data-hunt-wave="'+h.wave+'"' : canToggle ? 'data-watch="toggle"' : finished ? 'data-open="huntPlan"' : 'data-open="huntWallet"';
    const modeNote = powerHeld ? '<span class="watch-start-mode">'+(power?.blocked === false ? '준비 완료 · 직접 시작' : '같은 상대 보존')+'</span>' :
      canToggle && (active || cleared(s) < 60 || endgameRepeatSelected) ? '<span class="watch-start-mode">' +
      (active ? (run.continuous ? '연속 사냥 중' : '이번 단계 자동사냥') : '1초 누르면 연속 사냥') + '</span>' : '';
    const start = '<button class="primary watch-start' + (active ? ' watch-active' : '') + '" ' + control + '><span class="watch-start-label">' +
      controlArt(powerHeld && power?.blocked !== false ? "hammer" : !active && finished ? "compass" : "hunt") + label + '</span>' +
      modeNote + foodBar(w, departure) + '</button>';
    const controls = '<div class="watch-home-actions">' +
      (powerHeld ? '<button type="button" class="action" data-power-flee data-hunt-id="'+escapeHtml(h.id)+'" data-hunt-wave="'+h.wave+'">'+icon('arrow-left')+'<span>퇴각</span></button>' : go('forest/field', icon('hand-coins') + '<span>배치 수익</span>', 'action')) + start +
      go('world/map', controlArt('compass') + '<span>모험 지도</span>', 'action') + '</div>';
    return '<section class="watch-view watch-ground' + (home ? ' watch-home' : '') + '"' + (territory ? ' data-boss-territory="'+territory+'"' : '') + '><div class="watch-stage">' +
      '<span class="watch-stage-name">'+(territory ? icon('crown')+'우두머리 영역' : icon('trees')+'사냥터')+'</span> · <b>'+rank+'단계'+'</b> <span class="trail-region">'+(trail?area.name:enemy.habitat)+'</span>'+(trail?'<span class="trail-wave">'+(enemy.elite?'우두머리 · ':'')+'조우 '+(wave+1)+' / '+pack.length+'</span>':'')+'<small class="watch-version">v'+UpdateNotice.version()+'</small>'+(h?.ripostes>0 && !h.journeyBattle && !h.bladeCombat?'<span class="watch-counter-status">승리 시 반격 +25%</span>':'')+
      (kit ? '<div class="outfit-enemy-line">' + OutfitView.encounterChip(terrain,enemy.kind,kit,!!h) + '</div>' : '') + '</div>' +
      '<div class="scene watch-arena combat-hud" data-region="'+area.id+'"'+(powerHeld?' data-power-held':'')+(power?' data-power-check':'')+'>'+fighter('player',blade.name,'+'+fmt(blade.level),sprite,128,hp,max)+fighter('enemy',enemy.name,'Lv.'+rank,enemy.sprite||'boar',144,enemyHp,total)+
      powerReadout(s,power)+
      (useD20 ? '<div class="watch-upper-dice">' + d20('player',roll?.playerFace,roll?.attackCheck) +
        d20('enemy',roll?.enemyFace,roll?.replyCheck) + '</div>' + impactNumber('player',roll) + impactNumber('enemy',roll) : '')+
      (!active && (s.hunt || s.lastHunt)?.lastDice?.attackCheck ? openBtn('huntPlan',icon('compass')+'사냥 구역','watch-recent-loot watch-plan-link') : '')+
      (settled && !received ? openBtn('huntLoot',icon('backpack')+'최근 전리품','watch-recent-loot') : '')+
      '<div class="watch-report">'+
      '<div class="watch-reward" role="status">'+(!powerHeld&&detail?'<div class="trail-detail">'+detail+'</div>':'')+(received ? HuntLootView.resultView(s,settled,active)
        :defeated?'<b class="watch-defeat">패배</b>'+defeatSummary(result)+go('forge','장비 강화','action')
        :!powerHeld&&reason&&!(h&&reason==='일시 중단')?'<b>'+reason+'</b>':'')+'</div>'+
      (powerHeld ? '' : huntStatus(s, held))+'</div></div>'+controls+'</section>';
  };
  function beforeRender() {
    cancelHuntPress();
    if (active && state.hunt?.powerHeld) stop('',false);
    if (active && state.artisanCache?.status === 'pending') stop('',false);
    if (active && !allowed()) stop('', false);
  }
  function refreshWallet() {
    if(!allowed())return;
    if(state.artisanCache?.status==='pending')return;
    const button=document.querySelector('.watch-start'),w=Game.huntingStatus(state);
    if(!button)return;
    if(!active&&!state.hunt&&!pending()&&validRank(nextRank())&&(button.dataset.open==='huntWallet') !== (!w.free&&!w.purchased)){render();return;}
    // Update only the meter: a whole-screen render would cancel the current attack.
    const bar=button.querySelector('.watch-ticket-bar');if(!bar)return;
    const t=foodMeter(w,bar.dataset.departure),label=bar.querySelector('.watch-ticket-text');
    if(label.textContent!==t.text)label.textContent=t.text;
    bar.dataset.empty=String(t.empty);bar.querySelector('.watch-ticket-fill').style.width=t.width+'%';
  }
  function beginHunt(continuous = false) {
    if (active || !allowed()) return;
    if (state.artisanCache?.status==='pending') {focusChoice();return;}
    if (state.hunt?.powerHeld) return;
    if (state.hunt?.exploration) {focusChoice();return;}
    if (!state.hunt && !pending()) {
      if (!validRank(nextRank())) return;
      const wallet = Game.huntingStatus(state);
      if (!wallet.free && !wallet.purchased) {showModal('huntWallet');return;}
    }
    if (prefs.sound) GameSound.unlock();
    GameMusic.unlock();
    saveGeneration = state._save?.generation;
    repeatHunting.stop('관전 사냥');
    autoCombat.stop();
    run = {continuous:continuous && (cleared(state) < 60 || endgameRepeatSelected), advance:false};
    active = true;
    reason = '';
    reward = null;
    lastRound = null;
    generation++;
    render();
    arm(100);
  }
  // A settled stage (opened chest or instant exploration): stop on a short press, otherwise continue.
  function finishStage() {
    if (cleared(state) >= 60 && !endgameRepeatSelected) {
      mode = 'progress';
      replayRank = 0;
      stop('모든 스테이지 완료');
      return true;
    }
    if (!run.continuous) {stop('스테이지 완료');return true;}
    run.advance = !endgameRepeatSelected;
    return false;
  }
  function arm(delay=400) {
    if(!active||busy||timer)return;
    const token = generation;
    timer = setTimeout(() => {
      timer = null;
      step(token).catch(() => {
        if (token === generation) stop('저장 상태를 확인해 주세요');
      });
    }, delay);
  }
  async function step(token) {
    if(token!==generation||!active)return;
    if(!live(token)){stop('일시 중단');return;}
    busy=true;
    try {
      const h=state.hunt;
      if(state.artisanCache?.status==='pending'){stop('');return;}
      if(h?.powerHeld){stop('');return;}
      // A saved cart never resumes automatically; it waits for one explicit choice.
      if(h?.exploration){stop('');return;}
      if(Game.trail.awaitingNext(h)) {
        const id=h.id,wave=h.wave;
        await act(null,'',undefined,undefined,()=>live(token)&&state.hunt?.id===id&&state.hunt.wave===wave?
          {action:'huntAdvance',arg:{id,wave}}:null);
        if(state.hunt?.powerHeld){stop('');return;}
        if(storageError)stop('저장 상태를 확인해 주세요');
        else if(live(token) && state.hunt?.id===id && state.hunt.wave===wave+1 && motionEnabled()) {
          document.querySelector('.watch-ground .boss-creature')?.animate([
            {opacity:0, transform:'translate(12%, -9%) scale(.9)'},
            {opacity:1, transform:'translate(-2%, 0) scale(1.035)',offset:.72},
            {opacity:1, transform:'none'}
          ],{duration:460,easing:'ease-out'});
        }
      } else if(h) {
        const id=h.id,turn=h.turn,wave=h.wave;
        if (h.journeyBattle === 1 || h.bladeCombat) nextStrikeAt = performance.now() + 2000;
        await act(null,'',undefined,()=>live(token)&&state.hunt?.id===id&&state.hunt.turn===turn&&state.hunt.wave===wave?
          ([1,2].includes(state.hunt.diceVersion)?'strike':AutoCombat.choose(Game,state.hunt)):null);
        if(storageError){stop('저장 상태를 확인해 주세요');return;}
        await HuntEffects.finished();
        if(token!==generation)return;
        if(!state.hunt&&!state.lastHunt?.chestId){stop('패배 · 장비를 강화해 주세요');return;}
      } else {
        const chest=pending();
        if(chest) {
          await act(null,'',undefined,undefined,()=>live(token)&&pending()?.id===chest.id?{action:'openChest',arg:chest.id}:null);
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token!==generation)return;
          if(pending()?.id===chest.id || state.lastChest?.id!==chest.id){stop('보물을 수령할 수 없습니다');return;}
          reward={...state.lastChest};
          if (finishStage()) return;
          render();
        } else {
          if(!validRank(nextRank())){stop('모든 스테이지 완료');return;}
          const w=Game.huntingStatus(state);
          if(!w.free&&!w.purchased){stop('식량 소진');return;}
          const rank=nextRank(),serial=state.hunting.serial,wallet=state.hunting.id, selectedMode=mode;
          reward=null;lastRound=null;reason='';
          await act(null,'',undefined,undefined,()=>live(token)&&!state.hunt&&!pending()&&
            mode===selectedMode&&validRank(rank)&&state.hunting.id===wallet&&state.hunting.serial===serial&&
            (state.hunting.free>0||state.hunting.purchased>0)?
            {action:'huntStart',arg:{rank,request:serial+1,combat:Game.exploration.combat,explore:Game.exploration.version,power:1,artisan:1}}:null);
          // The legacy repeat runner is inactive; no second controller is armed.
          autoCombat.stop();
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token!==generation)return;
          if(state.artisanCache?.status==='pending'){stop('');return;}
          if(state.hunt?.powerHeld){stop('');return;}
          // The cart stops even a continuous run; nothing departs again until a new press.
          if(state.hunt?.exploration){stop('');return;}
          const startId=state.hunting.serial===serial+1&&state.hunting.lastStart?.id;
          if(!state.hunt&&startId&&state.lastHunt?.id===startId&&Game.huntOutcome(state.lastHunt)==='explored'){
            reward=reward||explorationReceipt(state);
            if(finishStage())return;
            render();
          } else if(!state.hunt){stop('사냥을 시작할 수 없습니다');return;}
        }
      }
    } finally {
      busy=false;
      if (token===generation && active) {
        const nextStrike = (state.hunt?.journeyBattle === 1 || state.hunt?.bladeCombat) && !Game.trail.awaitingNext(state.hunt);
        const delay = nextStrike && nextStrikeAt ? Math.max(0, nextStrikeAt - performance.now()) : reward&&!state.hunt?1800:500;
        arm(delay);
      } else if(active)arm();
    }
  }
  // One explicit cart choice; the rules make a repeated identical request idempotent.
  let choosingCart = false;
  let choosingArtisan = false;
  async function chooseArtisan(choice,id) {
    if(choosingArtisan||active||busy||!allowed()||!['open','pass'].includes(choice)||state.artisanCache?.id!==id||state.artisanCache.status!=='pending')return;
    choosingArtisan=true;
    try{await act('artisanChoose',{id,choice});}
    finally{choosingArtisan=false;}
  }
  function visitArtisanForge() {
    if(state.artisanCache?.status!=='claimed'||!allowed())return;
    const quotes=Game.forgeItems.list(state).map(item=>Game.forgeItems.quote(state,item.id));
    const target=quotes.find(q=>q?.permitApplies)||quotes.find(q=>q?.type==='blade'||q?.type==='chest');
    if(!target)return;
    ForgeItemView.selectItem(state,target.id);
    addEventListener('hashchange',()=>{if(current()==='forge'&&!modal&&state.artisanCache?.status==='claimed')ForgeItemView.preview('permit');},{once:true});
    nav('forge');
  }
  let choosingPower = false;
  function boundPower(button) {
    return allowed() && state.hunt?.powerHeld && state.hunt.id === button.dataset.huntId && state.hunt.wave === Number(button.dataset.huntWave);
  }
  async function powerAction(button, action) {
    if (choosingPower || busy || !boundPower(button)) return;
    const id=button.dataset.huntId, wave=Number(button.dataset.huntWave);
    choosingPower=true;
    stop('',false); autoCombat.stop(); repeatHunting.stop('전투 전 준비');
    try {
      await act(null,'',undefined,undefined,()=>boundPower(button) ? {action,arg:{id,wave}} : null);
      if (action === 'huntResume' && !storageError && state.hunt?.id === id && state.hunt.wave === wave && !state.hunt.powerHeld)
        beginHunt(false);
    } finally { choosingPower=false; }
  }
  async function chooseCart(choice, id) {
    if (choosingCart || active || busy || !allowed() || !['gear','gold'].includes(choice)) return;
    const h = state.hunt;
    if (!h?.exploration || h.id !== id) return;
    choosingCart = true;
    try {
      await act('huntChoose', {id, choice});
    } finally {
      choosingCart = false;
    }
    if (!state.hunt && state.lastHunt?.id === id) document.querySelector('.watch-start')?.focus({preventScroll:true});
    else focusChoice();
  }
  function updatePlanFields(fields) {
    const repeat = fields.querySelector('.watch-mode').value === 'repeat';
    const rank = fields.querySelector('.trail-replay');
    rank.closest('label').hidden = !repeat && cleared(state) < 60;
    const preview=fields.parentNode.querySelector('[data-open^="bladeLoot-"]');
    const selected = !rank.closest('label').hidden && Number(rank.value) || Math.min(60,cleared(state)+1);
    if(preview) preview.dataset.open="bladeLoot-"+selected;
    fields.parentNode.querySelector('[data-farm-hint]').textContent=farmingHint(state,selected);
    fields.parentNode.querySelector('[data-explore-odds]')?.replaceWith(document.createRange().createContextualFragment(exploreOdds(state,selected)));
    fields.querySelector('[data-hunt-plan-apply]').disabled = !rank.closest('label').hidden && !Number(rank.value);
  }
  document.addEventListener('change', event => {
    const fields = event.target.closest('.hunt-plan-fields');
    if (!fields) return;
    if (event.target.matches('.watch-mode')) {
      fields.querySelector('.trail-replay').value = event.target.value === 'repeat' ? fixedRank : replayRank;
    }
    updatePlanFields(fields);
  });
  document.addEventListener('click',event=>{
    if (event.target.closest('[data-hunt-plan-apply]')) {
      if (modal !== 'huntPlan' || active || !ready || storageError || restarting || !cleared(state)) return;
      const fields = event.target.closest('.hunt-plan-fields');
      const repeat = fields.querySelector('.watch-mode').value === 'repeat';
      const rank = Number(fields.querySelector('.trail-replay').value);
      if ((repeat || cleared(state) >= 60) && (!Number.isInteger(rank) || rank < 1 || rank > Math.min(60,cleared(state)))) return;
      mode = repeat ? 'repeat' : 'progress';
      endgameRepeatSelected = repeat && cleared(state) >= 60;
      if (repeat) fixedRank = rank;
      else if (cleared(state) >= 60) replayRank = rank;
      generation++; reward = null; lastRound = null; reason = '';
      closeModal(false);
      render();
      document.querySelector('.watch-start')?.focus({preventScroll:true});
      return;
    }
    if (event.detail > 0 && suppressHuntClick) {
      suppressHuntClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const powerButton=event.target.closest('[data-power-prepare],[data-power-flee],[data-power-resume]');
    if(powerButton){
      event.preventDefault(); event.stopImmediatePropagation();
      if(!boundPower(powerButton)) return;
      if(powerButton.hasAttribute('data-power-prepare')) {stop('',false);nav('forge');}
      else powerAction(powerButton,powerButton.hasAttribute('data-power-flee')?'flee':'huntResume');
      return;
    }
    const choice=event.target.closest('[data-explore-choice]');
    if(choice){event.preventDefault();event.stopImmediatePropagation();chooseCart(choice.dataset.exploreChoice,choice.dataset.huntId);return;}
    const artisanChoice=event.target.closest('[data-artisan-choice]');
    if(artisanChoice){event.preventDefault();event.stopImmediatePropagation();if(!artisanChoice.disabled)chooseArtisan(artisanChoice.dataset.artisanChoice,artisanChoice.dataset.artisanId);return;}
    if(event.target.closest('[data-artisan-forge]')){event.preventDefault();event.stopImmediatePropagation();visitArtisanForge();return;}
    if(event.target.closest('[data-explore-focus]')){event.preventDefault();event.stopImmediatePropagation();focusChoice();return;}
    const button=event.target.closest('[data-watch]');if(!button)return;
    if(button.dataset.watch==='continue' && modal==='firstGearCompare') {
      closeModal(false);
      if(active){event.preventDefault();event.stopImmediatePropagation();return;}
    }
    event.preventDefault();event.stopImmediatePropagation();if(!allowed())return;
    if(active){stop('일시 중단');return;}
    beginHunt();
  },true);
  const huntHoldMs = 1000;
  const huntToggle = '.watch-start[data-watch="toggle"]';
  let huntPress = null, suppressHuntClick = false;
  function cancelHuntPress() {
    if (!huntPress) return;
    clearTimeout(huntPress.timer);
    huntPress.button.removeAttribute('data-hunt-press');
    huntPress = null;
  }
  function holdHunt(button, pointerId = null) {
    const press = {button, pointerId, bounds:button.getBoundingClientRect()};
    huntPress = press;
    button.dataset.huntPress = '';
    press.timer = setTimeout(() => {
      cancelHuntPress();
      if (button.isConnected && allowed() && !active) beginHunt(true);
    }, huntHoldMs);
  }
  function insideHuntPress(event) {
    const {left, right, top, bottom} = huntPress.bounds;
    return event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;
  }
  // Track the physical release so re-rendering the stop button cannot turn it into a second click.
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressHuntClick = false;
    cancelHuntPress();
    const button = event.target.closest(huntToggle);
    if (!button || !allowed()) return;
    suppressHuntClick = true;
    if (active) stop('일시 중단');
    else holdHunt(button, event.pointerId);
  }, true);
  document.addEventListener('pointermove', event => {
    if (huntPress?.pointerId === event.pointerId && !insideHuntPress(event)) cancelHuntPress();
  }, true);
  document.addEventListener('pointerup', event => {
    if (huntPress?.pointerId !== event.pointerId) return;
    const start = insideHuntPress(event);
    cancelHuntPress();
    if (start && allowed() && !active) beginHunt();
  }, true);
  document.addEventListener('pointercancel', event => {
    if (huntPress?.pointerId === event.pointerId) cancelHuntPress();
  }, true);
  document.addEventListener('contextmenu', event => {
    if (event.target.closest(huntToggle) || huntPress?.pointerId != null) event.preventDefault();
  }, true);
  document.addEventListener('keydown', event => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.altKey || event.ctrlKey || event.metaKey ||
        !event.target.matches(huntToggle) || !allowed()) return;
    event.preventDefault();
    if (event.repeat) return;
    cancelHuntPress();
    if (active) stop('일시 중단');
    else if (event.key === 'Enter') beginHunt();
    else holdHunt(event.target);
  }, true);
  document.addEventListener('keyup', event => {
    if (event.key !== ' ' || !huntPress || huntPress.pointerId !== null) return;
    event.preventDefault();
    const start = huntPress.button === document.activeElement;
    cancelHuntPress();
    if (start && allowed() && !active) beginHunt();
  }, true);
  document.addEventListener('focusout', event => {
    if (huntPress?.pointerId === null && huntPress.button === event.target) cancelHuntPress();
  });
  window.addEventListener('blur', cancelHuntPress);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelHuntPress();stop('일시 중단');}
  });
  window.addEventListener('pagehide',()=>{cancelHuntPress();stop('',false);});
  window.addEventListener('hashchange',()=>{
    cancelHuntPress();
    if(current()!=='forest'||phonePage('forest')!=='hunt'){stop('',false);reward=null;lastRound=null;}
    else if(location.hash==='#world' && active)stop('',false);
  });
  return {view, planView, compareLoot, selectMaster, stop, beforeRender, refreshWallet, restoreReceipt, stageOutcome, exploreRules, get active(){return active;}};
})();
