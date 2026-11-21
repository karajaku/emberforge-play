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
    const scene = layout.querySelector('.scene');
    if (!layout.classList.contains("blade-layout") && s.swordRecord && s.weapon.recordId === s.swordRecord.id && s.weapon.grade > 0 &&
        scene.querySelector('canvas[data-sprite^="blade"]')) {
      scene.dataset.swordGrade = s.weapon.grade;
      const emblem = ['map-pin', 'gem', 'sparkles', 'crown'][s.weapon.grade];
      scene.querySelector('.location svg').outerHTML = icon(emblem);
    }
    if (layout.classList.contains("blade-layout")) {
      const item = gear === "armor" ? Game.blades.currentArmor(s) : Game.blades.current(s);
      if (item.grade>0) scene.dataset.swordGrade=item.grade;
    }
    panel.className = 'forge-console';
    const stats = panel.querySelector('.stats');
    stats.className = 'forge-readout';
    const risk = panel.querySelector('.forge-support .round');
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
    if(current()==='forge'&&phonePage('forge')==='work') {
      const rail=document.createElement('nav');rail.className='ui-forge-rail';rail.setAttribute('aria-label','대장간 작업');
      const armor = gear === "armor";
      const stage = document.querySelector('.forge-layout .stage-side');
      if (archiveBlade) {
        rail.innerHTML = go('forge/craft',icon('anvil')+'<span>제작</span>', '') + go('forge/training',icon('hammer')+'<span>수련</span>', '') +
          '<button data-blade-home="'+gear+'">'+icon(armor?'shield':'sword')+'<span>'+(armor?'방어구':'검신')+' 복귀</span></button>';
      } else if (forgeOutfitSlot) {
        rail.innerHTML = openBtn('outfit:forgeEquip:' + forgeOutfitSlot,icon('backpack')+'<span>장비 선택</span>') +
          go('forge/orders',icon('scroll-text')+'<span>의뢰</span>');
      } else {
        rail.innerHTML = openBtn(armor ? 'bladeArmorCraft' : 'bladeCraft',icon('anvil')+'<span>제작</span>') +
          openBtn(armor ? 'bladeArmorCollection' : 'bladeCollection',icon(armor ? 'shield' : 'sword')+'<span>'+(armor?'방어구함':'검신함')+'</span>') +
          go('forge/orders',icon('scroll-text')+'<span>의뢰</span>');
        const item = armor ? Game.blades.currentArmor(state) : Game.blades.current(state);
        if (item.level === 7 && Swordcraft.stageIndex(item) === 0) {
          const craft = rail.firstElementChild;
          const title = armor ? Game.blades.armorStageNames[0] : Swordcraft.stages[0].title;
          craft.classList.add('forge-first-process');
          craft.querySelector('span').textContent = title;
          craft.insertAdjacentHTML('beforeend','<small>+'+Swordcraft.stages[0].target+' 제작</small>');
        }
      }
      stage.append(rail);
      if (state.best > 0) {
        const duel = document.createElement('button');
        duel.className = 'ui-daily-duel';
        duel.dataset.duel = '';
        duel.innerHTML = icon('swords') + '<span>오늘의 시검</span>';
        stage.append(duel);
      }
    }
    const growth=document.querySelector('.progression-stage');if(growth)growth.innerHTML=icon('sparkles');
  }
  document.addEventListener('click',event=>{
    const menu = document.querySelector('.ui-utilities[open]');
    if (menu && (!menu.contains(event.target) || event.target.closest('[data-go],[data-open],[data-lesson]'))) menu.open = false;
  },true);
  document.addEventListener('keydown',event=>{
    const menu = document.querySelector('.ui-utilities[open]');
    if (event.key === 'Escape' && menu) {
      menu.open = false;
      menu.querySelector('summary').focus({preventScroll:true});
      event.preventDefault();
    }
  });
  return {forge, shell};
})();
