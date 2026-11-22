"use strict";

const ForgeItemView = (() => {
  const defaults = {kind:"", rarity:"", worn:""};
  const filter = {...defaults};
  let selected = "", position = 0, emptySlot = "", visible = [], shown = null;
  let selectionVersion = 0, pending = null;

  const slotName = key => Game.outfit.slots.find(slot => slot.key === key)?.name || "무기";
  const itemName = q => (q.type === "outfit" ? Game.outfit.name(q.item) : Game.blades.name(q.item)) + " +" + q.item.level;
  const filtering = () => Object.values(filter).some(Boolean);
  function matches(entry) {
    return (!filter.kind || filter.kind === entry.kind) &&
      (!filter.rarity || filter.rarity === Game.blades.itemRarity(entry.item).key) &&
      (!filter.worn || (filter.worn === "on") === Boolean(entry.wornSlot));
  }
  function selectSlot(s, slot) {
    const entry = Game.forgeItems.list(s).find(it => it.wornSlot === slot);
    if (!entry || !matches(entry)) Object.assign(filter, defaults);
    selected = entry?.id || "";
    emptySlot = entry ? "" : slot;
    selectionVersion++;
  }
  function selectItem(s, id) {
    const entry = Game.forgeItems.list(s).find(item => item.id === id);
    if (!entry) return false;
    if (!matches(entry)) Object.assign(filter, defaults);
    selected = entry.id;
    emptySlot = "";
    selectionVersion++;
    return true;
  }
  function view(s) {
    const all = Game.forgeItems.list(s);
    visible = all.filter(matches);
    if (emptySlot) {
      const filled = all.find(it => it.wornSlot === emptySlot);
      if (filled) selectSlot(s, emptySlot);
    }
    if (!emptySlot) {
      let index = visible.findIndex(it => it.id === selected);
      if (index < 0) {
        index = selected ? Math.min(position, visible.length - 1) : visible.findIndex(it => it.wornSlot === "weapon");
        index = Math.max(0, index);
      }
      position = index;
      selected = visible[index]?.id || "";
    }
    shown = selected && !emptySlot ? Game.forgeItems.quote(s, selected) : null;
    if (!shown && !emptySlot) {
      return '<div class="columns forge-layout forge-empty-results"><div class="stage-side">' +
        BladeView.switches("") + '<div class="forge-empty-message"><b>조건에 맞는 장비가 없습니다</b>' +
        '<button class="action" data-forge-reset>필터 초기화</button></div></div></div>';
    }
    const slot = shown?.wornSlot || emptySlot || (shown.type === "outfit" ? Game.compareGear(s,shown.item,"outfit").slot : shown.kind);
    gear = slot === "weapon" ? "weapon" : "armor";
    forgeOutfitSlot = slot === "weapon" || slot === "chest" ? "" : slot;
    if (forgeOutfitSlot) return OutfitView.forge(s,slot,shown);
    return gear === "weapon" ? BladeView.forge(s,shown) : BladeView.armor(s,shown);
  }
  function step(direction) {
    if (!visible.length || !emptySlot && visible.length < 2) return;
    const index = emptySlot ? (direction > 0 ? -1 : 0) : position;
    position = (index + direction + visible.length) % visible.length;
    selected = visible[position].id;
    emptySlot = "";
    selectionVersion++;
    render();
  }
  function detailKey(q) {
    if (q.type === "outfit") return "outfit:item:" + q.id + (q.wornSlot ? ":" + q.wornSlot : "");
    if (q.wornSlot) return q.type === "chest" ? "bladeArmorInfo" : "bladeInfo";
    return (q.type === "chest" ? "bladeArmorItem-" : "bladeItem-") + q.id;
  }
  function strike(s,q) {
    const chest = q.type === "chest";
    if (q.item.finalTrial && q.wornSlot)
      return openBtn(chest ? "bladeArmorFinal" : "bladeFinal", icon("hammer")+"돌파 계속<small>+20 마감</small>","primary");
    if (q.item.level === 20 && q.wornSlot && q.type !== "outfit")
      return openBtn(chest ? "bladeArmorCollection" : "bladeCollection",icon("check")+"강화 완료<small>+20 · 교체</small>","primary");
    const fee = q.enhanceBlocked ? escapeHtml(q.enhanceBlocked) : fmt(q.cost) + " G" + (s.gold < q.cost ? " · 부족 " + fmt(q.cost - s.gold) + " G" : "");
    return '<button class="primary" data-forge-action="forgeItemEnhance"' + (q.enhanceBlocked || s.gold < q.cost ? " disabled" : "") +
      '>' + controlArt("hammer") + '강화<small>' + fee + '</small></button>';
  }
  function decorate(s,layout) {
    if (archiveBlade || !layout.querySelector(".forge-slot-switch")) return;
    layout.classList.add("forge-item-browser");
    const stage = layout.querySelector(".stage-side");
    const scene = stage.querySelector(".scene");
    const q = shown;
    const canStep = visible.length > (emptySlot ? 0 : 1);
    function arrow(direction,label) {
      return '<button type="button" data-forge-step="' + direction + '" aria-label="' + label + '"' +
        (canStep ? "" : " disabled") + '>' + icon("arrow-left") + '</button>';
    }
    const number = emptySlot ? "빈 부위" : fmt(position + 1) + " / " + fmt(visible.length);
    scene.insertAdjacentHTML("afterbegin",'<span class="forge-item-pager">' + number + '</span>');
    const stat = layout.querySelector(".forge-readout > .line");
    const center = document.createElement("div");
    center.className = "forge-step-stat";
    center.append(...stat.childNodes);
    stat.classList.add("forge-step-row");
    stat.append(center);
    stat.insertAdjacentHTML("afterbegin",arrow(-1,"이전 장비"));
    stat.insertAdjacentHTML("beforeend",arrow(1,"다음 장비"));
    if (!q) return;
    const c = Game.compareGear(s,q.item,q.type);
    const delta = c.delta === 0 ? "0" : (c.delta < 0 ? "−" : "+") + fmt(Math.abs(c.delta));
    const baseline = q.kind === "ring" ? slotName(c.slot) + " 대비" : "착용 대비";
    const grade = Game.blades.itemRarity(q.item).name + " · " + Game.blades.baseGradeNames[q.item.grade];
    const status = q.wornSlot ? (q.kind === "ring" ? slotName(q.wornSlot) + " 착용" : "착용 중") : (q.disposeBlocked ? "미착용 · " + q.disposeBlocked : "미착용");
    const data = '<div class="forge-item-summary"><span>' + grade + ' · ' + status + '</span><span>전투력 <b>' +
      fmt(c.score) + '</b> <i data-tone="' + (c.delta > 0 ? "up" : c.delta < 0 ? "down" : "same") + '">' +
      baseline + ' ' + delta + '</i></span><span class="forge-item-value">' + icon("coins") + '가치 <b>' + fmt(q.value) +
      ' G</b></span></div>';
    scene.querySelector(".location")?.remove();
    scene.querySelector(".caption").insertAdjacentHTML("beforeend",data);
  }
  function equipButton(q) {
    const ring = q.kind === "ring";
    const attr = ring ? 'data-forge-preview="equip" aria-haspopup="dialog"' :
      'data-forge-action="forgeItemEquip" data-equip-slot="' + q.equipTargets[0].slot + '"';
    const blocked = q.equipBlocked ? ' disabled title="' + escapeHtml(q.equipBlocked) + '" aria-label="착용 · ' + escapeHtml(q.equipBlocked) + '"' : "";
    return '<button class="action thumb-equip" ' + attr + blocked + '>' + controlArt("equip") + '<span>착용</span></button>';
  }
  function disposalButtons() {
    if (!shown) return "";
    const actions = [["sell","hand-coins","판매"],["salvage","pickaxe","분해"]];
    return '<nav class="ui-forge-rail forge-dispose-rail" aria-label="표시 장비 처분">' +
      actions.map(([mode,ico,name]) => '<button data-forge-preview="' + mode + '" aria-label="' + name +
        (shown.disposeBlocked ? ' · ' + escapeHtml(shown.disposeBlocked) : '') + '"' +
        (shown.disposeBlocked ? ' disabled title="' + escapeHtml(shown.disposeBlocked) + '"' : '') + '>' + icon(ico) + '<span>' + name +
        '</span></button>').join("") + '</nav>';
  }
  function filterField(id,title,choices) {
    return '<fieldset><legend>' + title + '</legend><div class="forge-filter-choices">' +
      choices.map(([value,label]) => '<button type="button" data-forge-filter="' + id +
        '" data-filter-value="' + value + '" aria-pressed="' + (value === filter[id]) + '">' +
        '<span class="forge-filter-check" aria-hidden="true">✓</span>' + label + '</button>').join("") + '</div></fieldset>';
  }
  function filterCount() {
    return '장비 ' + fmt(visible.length) + '개';
  }
  function modalContent(key) {
    if (key === "forgeItem:filter") {
      const kinds = [["weapon","무기"],["chest","흉갑"],...Game.outfit.slots.filter(o=>o.kind!=="armor" && o.key!=="ring2").map(o=>[o.kind,o.kind === "ring" ? "반지" : o.name])];
      return ["장비 필터", '<div class="forge-item-filter">' + filterField("kind","부위",kinds) +
        filterField("rarity","등급",[["normal","일반"],["magic","매직"],["rare","레어"]]) +
        filterField("worn","착용 상태",[["on","착용 중"],["off","미착용"]]) + '</div><div class="forge-filter-footer">' +
        '<output aria-live="polite">' + filterCount() + '</output><button type="button" data-forge-reset>초기화</button>' +
        '<button type="button" data-close>닫기</button></div>'];
    }
    const q = pending;
    if (key === "forgeItem:equip" && q) {
      const baseline = Game.compareGear(state,q.item,"outfit").slot;
      const choices = q.equipTargets.map(({slot}) => {
        const c = Game.compareGear(state,q.item,"outfit",slot);
        const current = c.current ? GearGradeView.colored(c.current,Game.outfit.name(c.current) + " +" + c.current.level) : "빈칸";
        const delta = (c.delta > 0 ? "+" : c.delta < 0 ? "−" : "") + fmt(Math.abs(c.delta));
        return '<button class="action forge-ring-choice" data-forge-action="forgeItemEquip" data-equip-slot="' + slot + '">' +
          '<b>' + slotName(slot) + (slot === baseline ? ' <small class="forge-ring-baseline">비교 기준</small>' : '') + '</b><span>' + current + '</span><small>전투력 차이 ' + delta + '</small></button>';
      });
      return ["반지 착용 위치", line("착용할 반지",GearGradeView.colored(q.item,itemName(q))) +
        '<div class="forge-ring-choices">' + choices.join("") + '</div><button class="action" data-close>취소</button>'];
    }
    const sell = key === "forgeItem:sell";
    if (!q) return ["장비 확인", desc("대장간에서 장비를 다시 선택하세요.")];
    const verb = sell ? "판매" : "분해";
    return ["장비 " + verb, line("선택한 장비",GearGradeView.colored(q.item,itemName(q))) +
      line(sell ? "받는 골드" : "받는 각인석",sell ? fmt(q.value) + " G" : fmt(q.ore) + "개") +
      desc(q.disposeBlocked || "강화 단계와 옵션을 포함해 이 장비 한 개가 사라집니다.") +
      '<div class="forge-dialog-actions"><button class="action" data-close>취소</button><button class="primary" data-forge-action="' +
      (sell ? "forgeItemSell" : "forgeItemSalvage") + '"' + (q.disposeBlocked ? " disabled" : "") + '>' + verb + ' 확정</button></div>'];
  }
  function filterChange(key, value) {
    if (key) filter[key] = filter[key] === value ? "" : value;
    else Object.assign(filter, defaults);
    emptySlot = "";
    selectionVersion++;
    render();
    if (modal === "forgeItem:filter") {
      const body = el("modalBody");
      for (const button of body.querySelectorAll("[data-forge-filter]")) {
        button.setAttribute("aria-pressed", filter[button.dataset.forgeFilter] === button.dataset.filterValue);
      }
      body.querySelector("output").textContent = filterCount();
    } else {
      el("screen").querySelector('[data-open="forgeItem:filter"]')?.focus({preventScroll:true});
    }
  }
  function preview(mode,button) {
    if (!shown || !["sell","salvage","equip"].includes(mode)) return;
    pending = structuredClone(shown);
    showModal("forgeItem:" + mode, button);
  }
  function request(action,slot,fromScreen) {
    const quote = fromScreen ? shown : pending;
    if (!quote) return null;
    const base = {id:quote.id, token:quote.token};
    if (action !== "forgeItemEquip") return base;
    const target = quote.equipTargets.find(option => option.slot === slot);
    return target && {...base,...target};
  }
  function guard(action,id,version) {
    const source = {forgeItemEnhance:"", forgeItemEquip:shown?.kind === "ring" ? "forgeItem:equip" : "", forgeItemSell:"forgeItem:sell",forgeItemSalvage:"forgeItem:salvage"}[action];
    return version === selectionVersion && current() === "forge" && phonePage("forge") === "work" && !archiveBlade &&
      modal === source && selected === id;
  }
  return {view,selectSlot,selectItem,step,detailKey,strike,decorate,equipButton,disposalButtons,modalContent,filterChange,preview,request,guard,filtering,
    get shown(){return shown;},get version(){return selectionVersion;},invalidate(){selectionVersion++;}};
})();
