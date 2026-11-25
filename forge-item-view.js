"use strict";

const ForgeItemView = (() => {
  const defaults = {kind:"", rarity:"", worn:""};
  const filter = {...defaults};
  let selected = "", position = 0, emptySlot = "", visible = [], shown = null;
  let selectionVersion = 0, pending = null;
  // The hammer ignores taps for a moment after a hit that changes what the next tap risks.
  let holdUntil = 0;
  const enterHoldMs = 800, destroyHoldMs = 1000;

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
  const canStep = () => visible.length > (emptySlot ? 0 : 1);
  function neighborIndex(direction) {
    const index = emptySlot ? (direction > 0 ? -1 : 0) : position;
    return (index + direction + visible.length) % visible.length;
  }
  function step(direction) {
    if (!canStep()) return;
    position = neighborIndex(direction);
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
    const blocked = q.enhanceBlocked || s.gold < q.cost;
    // The first risky hit of a save opens the notice instead of striking.
    const target = !blocked && q.risk?.noticeNeeded ? 'data-forge-preview="risk" aria-haspopup="dialog"' : 'data-forge-action="forgeItemEnhance"';
    const name = q.risk ? ' aria-label="강화 · ' + fee + ' · ' + oddsText(q) + '"' : "";
    return '<button class="primary" ' + target + (blocked ? " disabled" : "") + name +
      '>' + controlArt("hammer") + '강화<small>' + fee + '</small></button>';
  }
  const oddsText = q => "성공 " + pct(q.success) + " · 유지 " + pct(q.hold) + " · 파괴 " + pct(q.destroy);
  // One odds row for the weapon, chest and outfit views. A level that cannot reset the item renders
  // exactly as it always did; a risk level shows success and destroy, with hold left to the bar.
  function odds(q) {
    const bar = '<b>강화 +' + q.item.level + ' → +' + (q.item.level + 1) + '</b><div class="odds-bar" aria-hidden="true"><i class="odds-success" style="width:' +
      pct(q.success) + '"></i><i class="odds-hold" style="width:' + pct(q.hold) + '"></i>';
    if (!q.risk) return bar + '</div><span>성공 ' + pct(q.success) + ' · 유지 ' + pct(q.hold) + '</span>';
    return bar + '<i class="odds-destroy" style="width:' + pct(q.destroy) + '"></i></div><span class="odds-risk"><span aria-hidden="true">성공 ' +
      pct(q.success) + ' · <em>파괴 ' + pct(q.destroy) + '</em></span><span class="grade-access">' + oddsText(q) + '</span></span>';
  }
  function hold(outcome, before, after) {
    // The notice's 확인 sits over the hammer, so a second tap right after it must not strike either.
    const ms = outcome === "destroy" ? destroyHoldMs : outcome === "ack" || (outcome === "success" && !(before > 0) && after > 0) ? enterHoldMs : 0;
    if (ms) holdUntil = Math.max(holdUntil, performance.now() + ms);
  }
  const held = () => performance.now() < holdUntil;
  const keepTag = type => type === "outfit" ? "장비·속성 유지" : "옵션·특성 유지";
  const average = gold => "약 " + fmt(Math.round(gold)) + " G";
  // Ways past this level with no destroy roll, each with what a failure costs.
  function safePaths(q) {
    const {paths} = q.risk, rows = [];
    if (paths.permit) rows.push(["장인의 보증", "이 강화 1회 성공 보장 · 파괴 없음 · 1회 소모"]);
    const choices = paths.breakthrough.length ? Breakthrough.choices(q.item, Game.price) : [];
    for (const {key, count, fee} of choices) {
      if (!paths.breakthrough.includes(key)) continue;
      const text = key === "edge" ? "실패하면 +" + (q.item.level - 1) + "로 하락 · 1회 " + fmt(fee) + " G" :
        key === "ward" ? "실패하면 제련비 소모, +" + q.item.level + " 유지 · 1회 " + fmt(fee) + " G" :
        "재료를 채우면 확정 · 납품 " + Breakthrough.rules(count).goal + "점(" +
          Object.values(Breakthrough.materials).map(m => m.name + " " + m.points + "점").join(" · ") + ")";
      rows.push([Breakthrough.methods[key].name, text]);
    }
    return rows;
  }
  const noPathReason = {
    outfit: "착용 칸 장비에는 보증과 돌파가 없습니다.",
    process: "제작 공정을 마치지 않아 보증 대상이 아닙니다.",
    noPermit: "장인의 보증을 보유하고 있지 않습니다.",
    deployed: "사냥터에 배치한 무기는 회수해야 보증을 쓸 수 있습니다.",
    notWorn: "착용하면 +19 돌파를 쓸 수 있습니다.",
    noMark: "공정 특성이 없어 +19 돌파를 쓸 수 없습니다.",
  };
  const pathList = rows => '<ul class="forge-risk-paths">' + rows.map(([name, text]) =>
    '<li><b>' + name + '</b><span>' + text + '</span></li>').join("") + '</ul>';
  const huntingNote = q => q.hunting ? desc("지금 사냥에 쓰는 장비입니다. 파괴되면 진행 중인 전투에도 바로 반영됩니다.") : "";
  const resetNote = q => '<p class="forge-risk-reset">파괴되면 강화 단계만 +0으로 돌아가고 장비는 남습니다. <b>' + keepTag(q.type) + '</b></p>';
  const rebuildLine = q => line("다시 +" + q.item.level + "까지 평균 비용", '<span class="forge-risk-cost">' + average(q.risk.rebuildCost) + '</span>');
  function riskNotice(q) {
    const rows = safePaths(q);
    return ["강화 파괴 안내", '<div class="forge-risk-notice">' + line("선택 장비", GearGradeView.colored(q.item, itemName(q))) +
      line("이번 강화", '성공 ' + pct(q.success) + ' · 유지 ' + pct(q.hold) + ' · <b data-tone="down">파괴 ' + pct(q.destroy) + '</b>') +
      resetNote(q) + rebuildLine(q) +
      (rows.length ? '<h3>파괴 없는 경로</h3>' + pathList(rows) : "") + huntingNote(q) +
      desc("이 안내는 한 번만 나옵니다. 확인한 뒤 망치를 다시 눌러야 강화합니다.") +
      '<button class="primary" data-forge-risk-ack>확인</button></div>'];
  }
  // The risk block that leads the detail of a level that can reset the item.
  function riskDetail(q) {
    const rows = safePaths(q), {paths} = q.risk;
    const table = [];
    for (let level = 0; level < 20; level++) {
      const destroy = Game.blades.destroyRate({level});
      if (!(destroy > 0)) continue;
      const success = Game.blades.rate({level});
      table.push('<tr' + (level === q.item.level ? ' aria-current="true"' : '') + '><th scope="row">+' + level + '</th><td>' + pct(success) +
        '</td><td>' + pct(100 - success - destroy) + '</td><td>' + pct(destroy) + '</td></tr>');
    }
    const breakthrough = paths.breakthrough.length ?
      openBtn(q.type === "chest" ? "bladeArmorFinal" : "bladeFinal", icon("hammer") + "돌파 방식 선택", "action") : "";
    const permit = paths.permit ?
      '<button class="action" data-forge-preview="permit">성공 보장 사용 · ' + fmt(q.cost) + ' G</button>' : "";
    return '<section class="forge-risk-detail" aria-label="강화 파괴">' +
      line("강화 파괴", '<b data-tone="down">이번 강화 파괴 ' + pct(q.destroy) + '</b>') + resetNote(q) + rebuildLine(q) +
      line("이번 강화", "성공 " + pct(q.success) + " · 유지 " + pct(q.hold)) +
      (rows.length ? '<h3>파괴 없는 경로</h3>' + pathList(rows) + breakthrough + permit :
        '<p class="forge-risk-none"><b>파괴 없는 경로 없음</b> ' + noPathReason[paths.reason] + '</p>') + huntingNote(q) +
      '<details class="forge-risk-table"><summary>단계별 파괴 확률</summary><table class="loot-table"><thead><tr><th>단계</th><th>성공</th><th>유지</th><th>파괴</th></tr></thead><tbody>' +
      table.join("") + '</tbody></table>' +
      desc("확률 막대의 파괴 구간은 보이도록 넓힌 표시이며 정확한 값은 글자를 따릅니다. 평균 비용은 일반 강화 기준이고 추가 파괴는 넣지 않았습니다.") +
      '</details></section>';
  }
  function decorate(s,layout) {
    if (archiveBlade || !layout.querySelector(".forge-slot-switch")) return;
    layout.classList.add("forge-item-browser");
    const stage = layout.querySelector(".stage-side");
    const scene = stage.querySelector(".scene");
    const q = shown;
    if(s.artisanCache?.status==='claimed'){
      const help=layout.querySelector('.forge-help');
      if(help){help.textContent='보증';help.dataset.artisanHeld='';help.setAttribute('aria-label','장비 능력과 장인의 보증 사용 조건');}
    }
    function arrow(direction,label) {
      return '<button type="button" data-forge-step="' + direction + '" aria-label="' + label + '"' +
        (canStep() ? "" : " disabled") + '>' + icon("arrow-left") + '</button>';
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
    const track = document.createElement("div");
    track.className = "forge-slide-track";
    track.append(makeSlide(s,scene,q));
    scene.append(track);
  }
  function makeSlide(s,surface,q) {
    const slide = document.createElement("div");
    slide.className = "forge-slide";
    slide.toggleAttribute("data-empty", !q);
    slide.append(...surface.querySelectorAll(":scope > canvas, :scope > .outfit-art, :scope > .caption"));
    if (q) {
      surface.querySelector(".location")?.remove();
      slide.querySelector(".caption").insertAdjacentHTML("beforeend",summary(s,q));
    }
    return slide;
  }
  function previewSlide(direction) {
    const q = Game.forgeItems.quote(state,visible[neighborIndex(direction)].id);
    const template = document.createElement("template");
    const artwork = q.type === "outfit" ? OutfitView.art(q.kind) : "";
    const sprite = artwork ? "" : BladeView.sprite(q.item);
    template.innerHTML = scene("forge",itemName(q),"","",sprite,0,null,artwork,q.item);
    const slide = makeSlide(state,template.content.firstElementChild,q);
    placePreview(slide,direction);
    return slide;
  }
  function placePreview(slide,direction) {
    slide.setAttribute("aria-hidden","true");
    slide.style.transform = "translateX(" + direction * 100 + "%)";
  }
  function summary(s,q) {
    const c = Game.compareGear(s,q.item,q.type);
    const delta = c.delta === 0 ? "0" : (c.delta < 0 ? "−" : "+") + fmt(Math.abs(c.delta));
    const baseline = q.kind === "ring" ? slotName(c.slot) + " 대비" : "착용 대비";
    // A weapon's interval and one hit open the summary (hand-over §7.5).
    const grade = (q.type === "blade" ? BladeView.hitMark(q.item) + " · " : "") + Game.blades.itemRarity(q.item).name + " · " + Game.blades.baseGradeNames[q.item.grade];
    const status = q.wornSlot ? (q.kind === "ring" ? slotName(q.wornSlot) + " 착용" : "착용 중") : (q.disposeBlocked ? "미착용 · " + q.disposeBlocked : "미착용");
    return '<div class="forge-item-summary"><span>' + grade + ' · ' + status + '</span><span>전투력 <b>' +
      fmt(c.score) + '</b> <i data-tone="' + (c.delta > 0 ? "up" : c.delta < 0 ? "down" : "same") + '">' +
      baseline + ' ' + delta + '</i></span><span class="forge-item-value">' + icon("coins") + '가치 <b>' + fmt(q.value) +
      ' G</b></span></div>';
  }
  let swipe = null;
  let settling = null;
  const translate = x => "translate3d(" + x + "px,0,0)";

  function clearSettle() {
    if (!settling) return;
    const {animation,preview} = settling;
    settling = null;
    animation.cancel();
    preview?.remove();
  }
  function cancelSwipe() {
    const active = swipe;
    swipe = null;
    if (active) {
      if (active.surface.hasPointerCapture(active.pointer)) active.surface.releasePointerCapture(active.pointer);
      active.track.style.removeProperty("transform");
      active.preview?.remove();
    }
    clearSettle();
  }
  function settle(track,offset,preview,duration) {
    track.style.removeProperty("transform");
    const animation = track.animate([{transform:translate(offset)},{transform:translate(0)}],{
      duration, easing:"cubic-bezier(.2,.75,.22,1)"
    });
    const transition = {animation,preview,track};
    settling = transition;
    animation.finished.then(() => {
      if (settling === transition) clearSettle();
    }, () => {});
  }
  function moveTrack(active,offset) {
    active.offset = Math.max(-active.width,Math.min(active.width,offset));
    const direction = active.offset < 0 ? 1 : -1;
    if (active.direction !== direction) {
      active.preview?.remove();
      active.direction = direction;
      active.preview = previewSlide(direction);
      active.track.append(active.preview);
    }
    active.track.style.transform = translate(active.offset);
  }
  document.addEventListener("pointerdown", event => {
    const surface = event.target.closest(".forge-item-browser .scene");
    if (!surface || event.target.closest("button") || !event.isPrimary || event.button !== 0 || modal || !canStep() || swipe) return;
    const track = surface.querySelector(".forge-slide-track");
    const from = settling?.track === track ? track.getBoundingClientRect().left - surface.getBoundingClientRect().left : 0;
    swipe = {
      surface, track, pointer:event.pointerId, width:track.clientWidth,
      x:event.clientX, y:event.clientY, movedX:event.clientX, movedAt:event.timeStamp,
      speed:0, from, offset:0, horizontal:false, motion:motionEnabled()
    };
    // Re-grab an in-flight slide at its current position.
    clearSettle();
    if (from) moveTrack(swipe,from);
  });
  document.addEventListener("pointermove", event => {
    const active = swipe;
    if (!active || event.pointerId !== active.pointer) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.horizontal) {
      if (Math.max(Math.abs(dx),Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) return cancelSwipe();
      if (Math.abs(dx) < Math.abs(dy) * 1.25) return;
      active.horizontal = true;
      active.surface.setPointerCapture(active.pointer);
    }
    if (event.clientX !== active.movedX) {
      active.speed = (event.clientX - active.movedX) / Math.max(1,event.timeStamp - active.movedAt);
      active.movedX = event.clientX;
      active.movedAt = event.timeStamp;
    }
    if (active.motion) moveTrack(active,active.from + dx);
  });
  function releaseSwipe(event) {
    const active = swipe;
    if (!active || event.pointerId !== active.pointer ||
        event.type === "lostpointercapture" && event.target !== active.surface) return;
    swipe = null;
    const dx = event.clientX - active.x;
    const released = event.type === "pointerup" && active.horizontal && !modal;
    const flick = Math.abs(dx) >= 20 && event.timeStamp - active.movedAt < 80 &&
      Math.sign(dx) * active.speed >= .45;
    const advance = released && (Math.abs(dx) >= Math.min(72,active.width * .22) || flick);
    if (!advance) {
      if (active.offset && active.motion) settle(active.track,active.offset,active.preview,190);
      else {
        active.track.style.removeProperty("transform");
        active.preview?.remove();
      }
      return;
    }
    const direction = dx < 0 ? 1 : -1;
    const outgoing = active.track.firstElementChild;
    const motion = active.motion && motionEnabled();
    step(direction);
    if (motion) {
      const track = document.querySelector(".forge-item-browser .forge-slide-track");
      placePreview(outgoing,-direction);
      track.append(outgoing);
      const travel = Math.max(0,-direction * active.offset / active.width);
      const offset = direction * (1 - travel) * track.clientWidth;
      settle(track,offset,outgoing,240);
    }
  }
  for (const type of ["pointerup","pointercancel","lostpointercapture"])
    document.addEventListener(type,releaseSwipe);
  addEventListener("blur",cancelSwipe);

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
    const parts = id === "kind";
    return '<div class="forge-filter-field" data-filter-field="' + id + '" role="group" aria-label="' + title + '">' +
      (parts ? "" : '<span class="forge-filter-label" aria-hidden="true">' + (id === "worn" ? "착용" : title) + '</span>') +
      choices.map(([value,label]) => {
        const art = !parts ? "" : value === "weapon" ? controlArt("hunt") : OutfitView.art(value === "chest" ? "armor" : value);
        return '<button type="button" data-forge-filter="' + id +
        '" data-filter-value="' + value + '" aria-pressed="' + (value === filter[id]) + '">' +
        art + label + '<span class="forge-filter-check" aria-hidden="true">✓</span></button>';
      }).join("") + '</div>';
  }
  function filterCount() {
    return '장비 ' + fmt(visible.length) + '개';
  }
  function modalContent(key) {
    if (key === "forgeItem:filter") {
      const kinds = [["weapon","무기"],["chest","흉갑"],...Game.outfit.slots.filter(o=>o.kind!=="armor" && o.key!=="ring2").map(o=>[o.kind,o.kind === "ring" ? "반지" : o.name])];
      return ["장비 필터", '<output class="forge-filter-count" aria-live="polite">' + filterCount() + '</output>' +
        filterField("kind","부위",kinds) +
        filterField("rarity","등급",[["normal","일반"],["magic","매직"],["rare","레어"]]) +
        filterField("worn","착용 상태",[["on","착용 중"],["off","미착용"]]) +
        '<div class="forge-filter-footer"><button type="button" data-forge-reset>초기화</button>' +
        '<button type="button" data-close>닫기</button></div>'];
    }
    if (key === "forgeItem:risk") {
      const live = pending && Game.forgeItems.quote(state, pending.id);
      return live?.risk ? riskNotice(live) : ["강화 파괴 안내", desc("대장간에서 장비를 다시 선택하세요.") + '<button class="action" data-close>닫기</button>'];
    }
    const q = pending;
    if(key==='forgeItem:permit'&&q){
      const eligible=q.permitApplies&&q.permitId;
      const enough=state.gold>=q.cost;
      if(!eligible)return ['장인의 보증 사용 조건',line('선택 장비',GearGradeView.colored(q.item,itemName(q)))+
        desc(q.enhanceBlocked||'일반 +3~+18 무기·흉갑 중 성공률 100% 미만인 적격 장비만 사용할 수 있습니다. 공정·마지막 돌파는 제외됩니다.')+
        desc('보증은 소모되지 않습니다. 대장간에서 다른 적격 장비를 선택해 상세를 확인하세요.')+'<button class="action" data-close>닫기</button>'];
      return ['장인의 보증 사용',line('선택 장비',GearGradeView.colored(q.item,itemName(q)))+
        line('강화 결과','+'+q.item.level+' → +'+(q.item.level+1)+' · 성공 보장')+
        (q.risk?line('일반 강화','성공 '+pct(q.success)+' · <b data-tone="down">파괴 '+pct(q.destroy)+'</b>'):'')+
        line('정상 강화비',fmt(q.cost)+' G'+(!enough?' · 골드 부족':''))+
        desc('장인의 보증 1회를 사용합니다. 일반 강화의 골드 비용은 그대로 냅니다.'+(q.risk?' 보증으로 강화하면 파괴 판정이 없습니다.':''))+
        '<div class="forge-dialog-actions"><button class="action" data-close>취소</button><button class="primary" data-forge-action="forgeItemEnhance" data-forge-permit'+
        (!eligible||!enough?' disabled':'')+'>성공 보장 사용<small>'+fmt(q.cost)+' G · 보증 1회 소모</small></button></div>'];
    }
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
    if (!shown || !["sell","salvage","equip","permit","risk"].includes(mode)) return;
    pending = structuredClone(shown);
    showModal("forgeItem:" + mode, button);
  }
  function request(action,slot,fromScreen,usePermit=false) {
    const quote = fromScreen ? shown : pending;
    if (!quote) return null;
    const base = {id:quote.id, token:quote.token};
    if(usePermit) return action==='forgeItemEnhance'&&quote.permitApplies&&quote.permitId?{...base,permitId:quote.permitId}:null;
    if (action !== "forgeItemEquip") return base;
    const target = quote.equipTargets.find(option => option.slot === slot);
    return target && {...base,...target};
  }
  function guard(action,id,version,permitId) {
    const source = {forgeItemEnhance:"", forgeItemEquip:shown?.kind === "ring" ? "forgeItem:equip" : "", forgeItemSell:"forgeItem:sell",forgeItemSalvage:"forgeItem:salvage"}[action];
    const permit=action==='forgeItemEnhance'&&permitId;
    return version === selectionVersion && current() === "forge" && phonePage("forge") === "work" && !archiveBlade &&
      modal === (permit?'forgeItem:permit':source) && selected === id && (!permit||pending?.permitId===permitId);
  }
  // Adds what only the forge knows to the shown item's detail: the destroy risk first, the permit last.
  function detail(s,key,content) {
    if(!shown||key!==detailKey(shown)||current()!=='forge'||phonePage('forge')!=='work')return content;
    const q=Game.forgeItems.quote(s,shown.id);
    if(!q)return content;
    let body=content[1];
    if(q.risk)body=riskDetail(q)+body;
    // A usable permit is offered inside the risk block; otherwise it keeps its place at the end.
    if(s.artisanCache?.status==='claimed'&&!q.risk?.paths.permit)
      body+='<section class="artisan-permit-detail"><b>장인의 보증 1회 보유</b><p>정상 골드 비용을 내고 적격 일반 강화 한 번의 성공을 보장합니다.</p>'+
        '<button class="action" data-forge-preview="permit">'+(q.permitApplies?'성공 보장 사용 · '+fmt(q.cost)+' G':'보증 사용 조건')+'</button></section>';
    return [content[0],body,...content.slice(2)];
  }
  // Opens the one-time notice for the shown item, e.g. after the rules refused an unannounced risky hit.
  function openRiskNotice() {
    if (!shown?.risk || modal) return false;
    preview("risk", el("screen").querySelector(".forge-strike"));
    return modal === "forgeItem:risk";
  }
  return {view,selectSlot,selectItem,step,detailKey,strike,odds,hold,held,keepTag,decorate,equipButton,disposalButtons,modalContent,filterChange,preview,request,guard,detail,openRiskNotice,filtering,cancelSwipe,
    get shown(){return shown;},get version(){return selectionVersion;},invalidate(){selectionVersion++;}};
})();
