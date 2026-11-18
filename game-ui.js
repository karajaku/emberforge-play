/* Approved visual layout; ui.js owns rendering and durable actions. */
const GameUI = (() => {
  function forge(s, html) {
    if (phonePage('forge') !== 'work') return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    const layout = template.content.querySelector('.forge-layout');
    const panel = layout?.querySelector('.panel');
    if (!panel) return html;
    layout.classList.add('forge-control-layout');
    panel.className = 'forge-console';
    const stats = panel.querySelector('.stats');
    stats.className = 'forge-readout';
    const risk = panel.querySelector('[data-open="risk"]');
    risk.className = 'forge-help';
    stats.querySelector('.line').append(risk);
    const primary = panel.querySelector(':scope > .primary');
    if (panel.querySelector(':scope > .action')) layout.classList.add('forge-extra-action');
    const support = panel.querySelector('.forge-support');
    support.className = 'forge-actions';
    if (primary) {
      primary.className = 'forge-strike';
      const symbol = primary.querySelector('svg');
      const cost = primary.querySelector('small');
      symbol?.remove(); cost?.remove();
      const label = document.createElement('b');
      label.textContent = primary.textContent.replace('강화하기', '강화');
      primary.replaceChildren();
      if (symbol) primary.append(symbol);
      primary.append(label);
      if (cost) primary.append(cost);
      support.insertBefore(primary, support.children[1]);
    } else support.classList.add('forge-actions--secondary');
    return template.innerHTML;
  };
  let selectedIndex=0;
  function bag(s, html) {
    if(phonePage('bag')!=='stored'||!s.bag.length) return html;
    selectedIndex=Math.max(0,Math.min(selectedIndex,s.bag.length-1));
    const template=document.createElement('template');template.innerHTML=html;
    const grid=template.content.querySelector('.inventory-grid');
    const tiles=[...grid.children],selected=s.bag[selectedIndex];
    const detail=document.createElement('section');detail.className='ui-selected-gear';
    detail.setAttribute('aria-label','선택한 보관 무기');
    const projected=Game.stats({...s,weapon:selected});
    detail.innerHTML=gearPortrait(selected,'weapon')+'<div class="ui-gear-summary"><b>'+Game.name(selected)+' +'+selected.level+'</b><span>장착 시 공격력 <strong>'+fmt(projected.attack)+'</strong></span><small>'+[tier(selected,'weapon'),craftSummary(selected)].filter(Boolean).join(' · ')+'</small></div>'+
      '<p>'+(selected.level>=13?'배치 수익 '+fmt(Game.perMinute(selected)/6)+' G / 10초':'사냥터 배치는 +13부터')+'</p>';
    const actions=tiles[selectedIndex].querySelector('.actions');actions.className='actions ui-gear-actions';detail.append(actions);
    grid.className='ui-gear-grid';grid.setAttribute('aria-label','보관 무기 선택');
    tiles.forEach((tile,i)=>{
      const button=document.createElement('button');button.className='ui-gear-tile';button.dataset.uiGear=String(i);
      button.setAttribute('aria-pressed',String(i===selectedIndex));
      button.setAttribute('aria-label',Game.name(s.bag[i])+' +'+s.bag[i].level+' 선택');
      button.innerHTML=gearPortrait(s.bag[i],'weapon')+'<b>+'+s.bag[i].level+'</b><span>'+Game.name(s.bag[i])+'</span>';
      tile.replaceWith(button);
    });
    grid.after(detail);grid.parentElement.classList.add('ui-inventory');
    return template.innerHTML;
  };
  function shell() {
    if(!state) return;
    let tools=document.querySelector('.ui-utilities');
    if(!tools) {
      tools=document.createElement('details');tools.className='ui-utilities';
      tools.innerHTML='<summary aria-label="이야기, 기록, 수업 메뉴">'+icon('menu')+'</summary><div class="ui-utility-content"></div>';
      document.querySelector('header .headwrap').append(tools);
    }
    const content=tools.querySelector('.ui-utility-content');
    const titleActions=document.querySelector('#title .title-actions');
    content.querySelector('.title-actions')?.remove();if(titleActions)content.prepend(titleActions);
    content.append(el('apprentice'));
    if(current()==='forge'&&phonePage('forge')==='work') {
      const rail=document.createElement('nav');rail.className='ui-forge-rail';rail.setAttribute('aria-label','대장간 작업');
      rail.innerHTML=[['craft','anvil','제작'],['training','hammer','수련'],['orders','scroll-text','의뢰']].map(([page,ic,label])=>'<button data-go="forge/'+page+'">'+icon(ic)+'<span>'+label+'</span></button>').join('');
      document.querySelector('.forge-layout .stage-side').append(rail);
    }
    const growth=document.querySelector('.progression-stage');if(growth)growth.innerHTML=icon('sparkles');
  }
  document.addEventListener('click',event=>{
    const pick=event.target.closest('[data-ui-gear]');
    if(pick) {
      event.preventDefault();event.stopImmediatePropagation();
      if(!ready||storageError)return;
      const y=el('screen').scrollTop;selectedIndex=Number(pick.dataset.uiGear);render();el('screen').scrollTop=y;
      document.querySelector('[data-ui-gear="'+selectedIndex+'"]')?.focus({preventScroll:true});return;
    }
    if(event.target.closest('[data-go],[data-open],[data-lesson]')) document.querySelector('.ui-utilities')?.removeAttribute('open');
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('.ui-utilities')?.removeAttribute('open');});
  function prepareLesson(tip) {
    if(tip.route!=='bag')return;
    const index=tip.selector.match(/data-arg="(\d+)"/)?.[1];
    if(index!==undefined)selectedIndex=Number(index);
  }
  return {bag, forge, shell, prepareLesson};
})();
