"use strict";
const saveKey = SaveStore.keys.current,
  settingsKey = "emberforge.preferences.v1";
const store = SaveStore.create(() => localStorage);
const saveLock = SaveStore.createLock({ get locks() { return navigator.locks; }, get indexedDB() { return window.indexedDB; } });
let state = null, storageError = null, ready = false;
// Synchronous count of act() bodies running inside the save lock; blocks automatic stories.
let actInFlight = 0;
function readState() { return store.load(); }
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const motionEnabled = () => prefs.motion && (prefs.motionOverride || !reducedMotion.matches);
function syncMotion() {
  document.body.dataset.motion = motionEnabled() ? "on" : "off";
  document.body.dataset.motionOverride = prefs.motionOverride ? "full" : "system";
  if (!motionEnabled()) {
    Impacts.clear(); Feedback.clear();
    for (const animation of document.getAnimations()) animation.cancel();
  }
}
reducedMotion.addEventListener("change", syncMotion);
let prefs = { sound: true, music: true, musicVolume: .35, motion: !matchMedia("(prefers-reduced-motion: reduce)").matches, motionOverride:false };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(settingsKey) || "{}"));
} catch {}
let archiveBlade = false;
let forgeOutfitSlot = "";
let gear = "weapon",
  towerMode = "infinite",
  modal = "",
  battle = null;
let huntStart = -1000,
  animationStart = -1000,
  lastFocus = null;
const allRoutes = ["forge", "world", "bag", "growth", ...Object.keys(zones)];
const current = () => {
  const [id, page] = location.hash.slice(1).split("/");
  if (id === "world" && !page) return "forest";
  return allRoutes.includes(id) ? id : "forge";
};
const images = {};
for (const id of [
  "blade",
  "blade1",
  "blade2",
  "blade3",
  "blade-axe",
  "blade-mace",
  "blade-dagger",
  "cuirass",
  "boar",
  "scarecrow",
  "sentinel",
  "golem",
  "dragon",
]) {
  const im = new Image();
  im.src = "assets/" + id + "-sheet.png";
  images[id] = im;
}
function save(mode = "normal") {
  state = store.commit(state, mode);
  repeatHunting.committed();
}
function sync() {
  const completed = state.autoMine?.completed;
  Game.settle(state);
  return completed !== state.autoMine?.completed;
}
let queue = Promise.resolve();
let restarting = false, lastLiningPress = -Infinity;
const autoCombat = AutoCombat.create({
  game: Game, hunt: () => state?.hunt,
  allowed: () => ready && !storageError && !restarting && !document.hidden,
  execute: guard => act(null, "", undefined, guard),
});
const repeatHunting = RepeatHunting.create({
  game: Game, state: () => state,
  allowed: () => ready && !storageError && !restarting && !document.hidden,
  execute: guard => act(null, "", undefined, undefined, guard),
});
function startAutoHunt(rank) {
  if (!repeatHunting.start(rank)) return;
  if (state.hunt) autoCombat.select("auto");
  else autoCombat.stop();
  render(); repeatHunting.refresh();
}
function failSave(error) {
  cancelForgePress();
  HuntEffects.cancel();
  HuntWatch.stop('', false);
  repeatHunting.stop(error.code === "conflict" ? "저장 충돌" : "저장 실패");
  autoCombat.stop();
  storageError = error.code || "write";
  Feedback.clear();
  GameSound.stop();
  renderHuntMode();
  showSaveGuard();
}
function locked(fn, maintenance = false) {
  const run = () => {
    if (restarting || (!maintenance && (!ready || storageError))) return;
    if (!maintenance) store.check();
    return fn();
  };
  queue = queue.catch(() => {}).then(() => saveLock(run)).catch(failSave);
  return queue;
}
function reloadAtForge() {
  HuntWatch.stop('', false);
  repeatHunting.stop("초기화");
  autoCombat.stop();
  restarting = true;
  history.replaceState(null, "", "#forge");
  location.reload();
}
function startNewGame() {
  HuntWatch.stop('', false);
  repeatHunting.stop("초기화");
  autoCombat.stop();
  return locked(() => {
    if (modal !== "confirmNewGame") return;
    state = Game.resetProgress(state);
    save("reset");
    reloadAtForge();
  });
}
function showSaveGuard() {
  const messages = {
    corrupt: "저장 데이터가 손상되었습니다. 원본은 그대로 보존되어 있습니다.",
    missing: "최신 저장을 찾을 수 없습니다. 남아 있는 정상본을 확인해 주세요.",
    future: "더 최신 버전에서 만든 저장입니다. 게임을 업데이트한 뒤 다시 열어 주세요. 이전 저장으로 되돌리지 않습니다.",
    quota: "기기의 저장 공간이 부족합니다. 공간을 확보한 뒤 재시도해 주세요. 정상본을 지우지 않았습니다.",
    access: "브라우저가 저장 접근을 허용하지 않습니다. 이 사이트의 저장 권한을 확인해 주세요.",
    write: "이 기기에 저장하지 못했습니다. 저장 기능을 확인하고 재시도해 주세요.",
    conflict: "다른 탭에서 진행이 바뀌었습니다. 이 탭의 진행으로 덮어쓰지 않았습니다.",
    locking: "안전한 저장 잠금을 사용할 수 없어 읽기 전용으로 대기합니다. 다른 탭을 닫고 저장이 허용된 최신 브라우저에서 다시 열어 주세요.",
    "no-backup": "복구 가능한 직전 정상본을 찾지 못했습니다. 원본은 보존되어 있습니다.",
  };
  let backup = null;
  try { backup = store.backup(); } catch {}
  const time = value => value ? new Date(value).toLocaleString("ko-KR") : "아직 없음";
  el("saveGuardMessage").textContent = messages[storageError] || messages.write;
  el("saveGuardPending").textContent = store.pending
    ? "미저장 진행을 이 탭에 보관하고 있습니다. 재시도 전까지 추가 진행을 멈췄습니다. 이 탭을 닫으면 미저장 진행은 사라집니다."
    : "진행 변경과 자동 진행을 멈췄습니다. 임시 새 게임으로 전환하지 않습니다.";
  el("saveGuardTime").textContent = "마지막 정상 저장: " + time(store.lastSavedAt);
  if (repeatHunting.summary?.unconfirmed) el("saveGuardPending").textContent +=
    " 반복 요약은 정상 저장된 소비·결과만 집계합니다. 미확정 입장·결과·보물은 같은 후보의 저장 재시도 성공 후 한 번 반영하며 반복은 재개하지 않습니다.";
  el("saveBackupInfo").textContent = backup ? "직전 정상본: " + time(backup._save?.savedAt || backup.last) +
    " · 무기 +" + backup.weapon.level + " · " + fmt(backup.gold) + " G · 환생 " + backup.rebirths + "회" : "복구 가능한 직전 정상본 없음";
  el("saveRetry").hidden = storageError === "future" || storageError === "conflict";
  el("saveRecover").hidden = !backup || storageError === "future" || store.pending || storageError === "conflict";
  // An unreadable wallet cannot safely be replaced with a new first grant.
  el("saveReset").hidden = true;
  el("saveReload").textContent = store.pending ? "미저장 진행을 포기하고 최신 저장 읽기" : "최신 저장 다시 읽기";
  el("saveGuard").hidden = false;
  for (const node of document.querySelectorAll("body > header, body > main, #noticeSlot, #apprentice, #mobileNav, #shade")) node.inert = true;
  el("saveGuardTitle").focus();
}
function resumeSaved() {
  Game.blades.state(state);
  HuntWatch.stop('', false);
  repeatHunting.stop("저장 복귀");
  autoCombat.stop();
  storageError = null;
  ready = true;
  HuntWatch.restoreReceipt();
  active = 0;
  tickTime = Date.now();
  el("saveGuard").hidden = true;
  for (const node of document.querySelectorAll("[inert]")) node.inert = false;
  closeModal(false);
  render();
  autoStory(true); // session start or save recovery is a safe point
}
// An animation that ends by itself re-checks the story it deferred, once.
Feedback.onIdle(() => autoStory());
function storageAction(action) {
  if (action === "reload") {
    if (!store.pending || confirm("이 탭의 미저장 진행을 포기하고 기기의 최신 저장을 읽을까요?")) location.reload();
    return;
  }
  if (action === "reset") return;
  if (action === "recover" && !confirm("표시된 직전 정상본으로 복구할까요? 비축 식량도 그때의 잔량으로 돌아갑니다. 현재 원본도 별도로 보존합니다.")) return;
  return locked(() => {
    if (!storageError) return; // Ignore already queued recovery/retry double-clicks.
    if (action === "recover") state = store.recover();
    else if (store.pending) save();
    else { state = readState(); if (!state) { state = Game.freshJourney(); save(); } else if (store.needsMigration) save(); }
    resumeSaved();
  }, true);
}
const toast = el("toast");
let toastTimer = 0, toastRevision = 0, toastDeadline = 0, toastRemaining = 4500, toastPaused = false;
function dismissToast() {
  clearTimeout(toastTimer);
  toast.classList.remove("on");
  el("noticeSlot").hidden = true;
  requestAnimationFrame(() => { fitNoticeRails(); placeLesson(); });
  document.querySelectorAll(".has-notice").forEach(node => node.classList.remove("has-notice"));
}
// Bound side actions by the measured caption, including wrapped names and summaries.
let forgeRailObserver;
function fitNoticeRails() {
  const layout = document.querySelector('#screen > .forge-layout');
  const stage = layout?.querySelector('.stage-side');
  const caption = stage?.querySelector('.forge-slide .caption, .scene .caption');
  if (!stage || !caption) return;
  let right = stage.querySelector('.forge-dispose-rail');
  const duel = stage.querySelector(':scope > .ui-daily-duel');
  if (duel) {
    if (!right) {
      right = document.createElement('nav');
      right.className = 'ui-forge-rail forge-dispose-rail';
      right.setAttribute('aria-label', '대장간 추가 작업');
      stage.append(right);
    }
    right.setAttribute('aria-label', '대장간 추가 작업');
    right.prepend(duel);
  }
  const rails = [...stage.querySelectorAll('.ui-forge-rail')];
  if (!rails.length) return;
  for (const rail of rails) rail.classList.remove('notice-bounded');
  const defaultTop = parseFloat(getComputedStyle(rails[0]).top);
  const origin = stage.getBoundingClientRect();
  const top = layout.classList.contains('has-notice') ? el('noticeSlot').getBoundingClientRect().bottom + 4 : origin.top + defaultTop;
  const height = Math.max(0, caption.getBoundingClientRect().top - 4 - top);
  for (const rail of rails) {
    rail.classList.add('notice-bounded');
    rail.style.setProperty('--notice-rail-top', (top - origin.top) + 'px');
    rail.style.setProperty('--notice-rail-height', height + 'px');
    rail.classList.remove('notice-compact');
    if (rail.scrollHeight > rail.clientHeight + 1) rail.classList.add('notice-compact');
    if (!rail.dataset.noticeScroll) {
      rail.dataset.noticeScroll = 'true';
      const indicators = () => {
        rail.classList.toggle('can-scroll-up', rail.scrollTop > 1);
        rail.classList.toggle('can-scroll-down', rail.scrollTop + rail.clientHeight < rail.scrollHeight - 1);
      };
      rail.addEventListener('scroll', indicators, {passive:true});
      rail.addEventListener('focusin', event => {
        const button = event.target.closest('button');
        if (!button) return;
        revealNoticeRailButton(button);
      });
    }
    if (rail.contains(document.activeElement)) revealNoticeRailButton(document.activeElement);
    rail.classList.toggle('can-scroll-up', rail.scrollTop > 1);
    rail.classList.toggle('can-scroll-down', rail.scrollTop + rail.clientHeight < rail.scrollHeight - 1);
  }
}
function revealNoticeRailButton(button) {
  const rail = button.closest('.notice-bounded');
  if (!rail) return;
  const b = button.getBoundingClientRect(), r = rail.getBoundingClientRect();
  if (b.top < r.top) rail.scrollTop -= Math.ceil(r.top - b.top);
  else if (b.bottom > r.bottom) rail.scrollTop += Math.ceil(b.bottom - r.bottom);
}
function observeNoticeRails() {
  forgeRailObserver?.disconnect();
  forgeRailObserver = new ResizeObserver(() => { fitNoticeRails(); placeLesson(); });
  for (const node of document.querySelectorAll('#screen > .forge-layout .stage-side, #screen > .forge-layout .caption')) forgeRailObserver.observe(node);
  fitNoticeRails();
}
window.addEventListener('resize', fitNoticeRails);
function placeToast() {
  const slot = el("noticeSlot");
  // Keep the live region outside replaced screen/modal markup while rendering.
  if (!toast.classList.contains("on")) return;
  document.querySelectorAll(".has-notice").forEach(node => node.classList.remove("has-notice"));
  const inModal = !el("shade").hidden;
  if (inModal && (modal.startsWith("blade") || modal.startsWith("soul:") ||
      modal.startsWith("outfit:") || modal.startsWith("inventory-") || modal === "storyScene")) { dismissToast(); return; }
  const host = inModal ? el("modalBody") :
    document.querySelector("#screen > .forge-layout") || el("screen");
  host.prepend(slot);
  host.classList.add("has-notice");
  slot.hidden = false;
  requestAnimationFrame(() => { fitNoticeRails(); placeLesson(); scheduleToastDismissal(); });
}
function scheduleToastDismissal() {
  clearTimeout(toastTimer);
  const body = el("noticeText"), revision = toastRevision;
  const overflowing = body.scrollHeight > body.clientHeight + 1;
  body.setAttribute("aria-label", overflowing ? "알림 내용 · 위아래로 스크롤하여 전체 읽기" : "알림 내용");
  if (!toast.classList.contains("on")) return;
  const reading = overflowing || toast.matches(":hover, :focus-within");
  if (reading) {
    if (!toastPaused && toastDeadline) toastRemaining = Math.max(0, toastDeadline - performance.now());
    toastPaused = true;
    toastDeadline = 0;
    return;
  }
  if (toastPaused || !toastDeadline) toastDeadline = performance.now() + toastRemaining;
  toastPaused = false;
  toastTimer = setTimeout(() => { if (revision === toastRevision) dismissToast(); }, Math.max(0, toastDeadline - performance.now()));
}
el("noticeClose").addEventListener("click", dismissToast);
toast.addEventListener("pointerenter", scheduleToastDismissal);
toast.addEventListener("focusin", scheduleToastDismissal);
toast.addEventListener("pointerleave", scheduleToastDismissal);
toast.addEventListener("focusout", () => requestAnimationFrame(scheduleToastDismissal));
toast.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismissToast(); }
});
function notify(msg, kind = "info", forgeItem = false, title = "") {
  if (HuntWatch.active && current() === 'forest' && !modal) return;
  if (!msg) return;
  if ((modal.startsWith("blade") || modal.startsWith("soul:")) && !el("shade").hidden) {
    let status=el("bladeActionStatus");
    if (!status) {
      status=document.createElement("p");
      status.id="bladeActionStatus"; status.setAttribute("role","status");
      el("modalBody").prepend(status);
    }
    dismissToast();
    status.textContent=msg;
    return;
  }
  clearTimeout(toastTimer);
  toastRevision++;
  toastRemaining = 4500;
  toastDeadline = performance.now() + toastRemaining;
  toastPaused = false;
  const titles = { "forge-success": "강화 성공", "forge-hold": "강화 유지",
    "forge-drop": "강화 하락", "forge-destroy": "장비 파괴", "forge-promotion": "검 승급", loss: "주의", win: "획득 · 완료" };
  el("noticeTitle").textContent = title || titles[kind] || "";
  el("noticeMessage").textContent = msg;
  toast.className = "on " + kind + (forgeItem ? " forge-item-notice" : "");
  el("noticeText").scrollTop = 0;
  placeToast();
}
// `layered`: the sound joins the ones still playing instead of ending them (two strikes of one instant).
function sound(kind, delay = 0, layered = false) {
  if (prefs.sound && !document.hidden) GameSound.play(kind, delay, layered);
}
function syncMusic() {
  if (!state) return;
  const route = current();
  GameMusic.update(GameMusic.resolve({ route, modal, story: storyScene, state, page: phonePage(route), towerMode }),
    { enabled: prefs.music, volume: prefs.musicVolume, hidden: document.hidden });
}
function soulQuote(s, arg) {
  const b = Game.blades.state(s), g = Game.endgame.info(s);
  return JSON.stringify([(arg.id?.startsWith("a") ? Game.blades.armors(s) : b.items).find(item => item.id === arg.id), b.equipped, b.armorEquipped, s.hunt?.bladeId, s.hunt?.armorId,
    b.ore, b.cleared, g.deployed, g.souls, g.gift, g.unlocked, g.tokens, g.bossSeals,
    arg.id && arg.key ? Game.endgame.transferTargets(s,arg).map(item=>item.id) : null]);
}
function outfitQuote(s, action, arg) {
  const [first, second] = arg.split(":");
  const data = Game.outfit.state(s), id = second || first;
  const item = data.items.find(it => it.id === id);
  const wearing = Object.entries(data.equipped).find(([, value]) => value === id);
  return JSON.stringify([action, item, wearing?.[0], second && data.equipped[first]]);
}
function bindForgeRequests(container) {
  for (const button of container.querySelectorAll("[data-forge-action]"))
    button.forgeRequest = ForgeItemView.request(button.dataset.forgeAction,button.dataset.equipSlot,container === el("screen"),button.hasAttribute('data-forge-permit'));
}
function bindOutfitQuotes(container) {
  for (const button of container.querySelectorAll('[data-act^="outfit"]'))
    button.outfitQuote = outfitQuote(state, button.dataset.act, button.dataset.arg);
}
function act(action, arg = "", pressedAt, automaticGuard, repeatGuard, expectedSoul, expectedOutfit) {
  const forgeItemAction = action?.startsWith("forgeItem");
  const forgeVersion = forgeItemAction && ForgeItemView.version;
  const forgeWornItem = action === "outfitForge" && current() === "forge" && !modal;
  const sourceInventoryMenu = modal.startsWith("inventory-") && !automaticGuard && !repeatGuard ? modal : "";
  const bulkQuote = action === "journeyBulk" && typeof arg === "object" ? arg : null;
  if (bulkQuote) arg = bulkQuote.type;
  const armorAction = !!action?.startsWith("bladeArmor");
  const equivalent = armorAction ? action.replace("bladeArmor","blade") : action;
  const bladeTargeted = ["bladeForge","bladeEtch","bladePolish","bladeWorkStart","bladeWorkMove","bladeWorkFinish","bladeFinalStart","bladeFinalMove","blade"].includes(equivalent);
  const bladeQuote = () => JSON.stringify(armorAction ? Game.blades.currentArmor(state) : Game.blades.current(state));
  const expectedBlade = bladeTargeted && bladeQuote();
  if (!repeatGuard && action === "openChest" && repeatHunting.active) {
    repeatHunting.stop("수동 전환"); autoCombat.stop();
  }
  const manualBattle = !automaticGuard && ["strike", "heavyStrike", "block", "flee"].includes(action);
  const manualId = manualBattle ? state?.hunt?.id : null;
  if (manualBattle) {
    repeatHunting.stop(action === "flee" ? "퇴각" : "수동 전환");
    autoCombat.stop(); // Invalidate even callbacks already waiting for the save lock.
    renderHuntMode();
  }
  if (action === "huntStart" && !repeatGuard && repeatHunting.active) {
    notify("자동 사냥을 먼저 중단해 주세요."); return;
  }
  // Capture the request before queueing: rapid clicks share one start sequence.
  if (action === "huntStart" && typeof arg !== "object" && state)
    arg = { rank: arg, request: state.hunting.serial + 1 };
  const heldEnhance = action === "enhance" && !!automaticGuard;
  let settled = false;
  return locked(() => {
    actInFlight++;
    try { return perform(); }
    finally {
      actInFlight--;
      // One automatic-story check per successful action, after Feedback has started.
      // If an animation is still on screen, Feedback.onIdle re-checks when it ends.
      if (settled) autoStory(true);
    }
  });
  function perform() {
    if (forgeItemAction && !ForgeItemView.guard(action,arg.id,forgeVersion,arg.permitId)) return;
    if (action === "huntStart" && !repeatGuard && repeatHunting.active) return;
    if (!repeatGuard && action === "openChest" && repeatHunting.active) {
      repeatHunting.stop("수동 전환"); autoCombat.stop();
    }
    if (automaticGuard) {
      action = automaticGuard();
      if (!action) return;
    } else if (manualBattle) {
      if (!manualId || state.hunt?.id !== manualId) return;
      // A manual move may itself wait for the lock while another mode is selected.
      // Its eventual execution still owns exactly one manual turn.
      repeatHunting.stop(action === "flee" ? "퇴각" : "수동 전환");
      autoCombat.stop();
    }
    sync();
    if (expectedOutfit && expectedOutfit !== outfitQuote(state, action, arg)) {
      render(); if (modal) displayModal();
      notify("착용 장비가 바뀌었습니다. 현재 장비와 비용을 다시 확인하세요.");
      return;
    }
    if (expectedSoul && expectedSoul !== soulQuote(state, arg)) {
      render(); if (modal) displayModal();
      notify("무기나 재료가 바뀌었습니다. 새 조건을 확인하세요.");
      return;
    }
    if (bladeTargeted && expectedBlade !== bladeQuote()) {
      render(); if (modal) displayModal();
      notify("장비가 바뀌었습니다. 비용과 제작할 장비를 다시 확인하세요.");
      return;
    }
    if (bulkQuote) {
      const currentQuote = Game.journeyForge(state, arg);
      if (!currentQuote || ["level", "bulk", "bulkCost", "bulkSuccess"].some(key => currentQuote[key] !== bulkQuote[key])) {
        render();
        if (modal) displayModal();
        notify("재련 조건이 달라졌습니다. 새 비용과 성공률을 확인하세요.");
        return;
      }
    }
    if (repeatGuard) {
      const next = repeatGuard();
      if (!next) { render(); return; }
      action = next.action; arg = next.arg;
    }
    // A strike of the forest scene is one event among others still playing: its command ends no sound or motion (M1-d).
    if (!(automaticGuard && HuntWatch.active)) {
      Feedback.clear(true); // the forge hammer may stay raised and strike again (FP1 §9.3)
      GameSound.stop();
    }
    const goldBefore = state.gold;
    const breaksBefore = state.breaks;
    const actionLevel = () => {
      if (forgeItemAction) return Game.forgeItems.quote(state,arg.id)?.item.level;
      if (forgeWornItem) return Game.outfit.state(state).items.find(item => item.id === arg)?.level;
      if (armorAction) return Game.blades.currentArmor(state).level;
      if (["bladeForge","bladeWorkFinish","bladeFinalMove"].includes(action)) return Game.blades.current(state).level;
      return state[arg === "armor" ? "armor" : "weapon"].level;
    };
    const gearBefore = actionLevel();
    const workWeapon = armorAction ? Game.blades.currentArmor(state) : action.startsWith("blade") ? Game.blades.current(state) : state.weapon;
    const sparring = ["craftMove","bladeWorkMove"].includes(equivalent) && workWeapon.work?.index === 1;
    const finalKey = ["finalMove","bladeFinalMove"].includes(equivalent) && workWeapon.finalTrial?.key;
    const strong = sparring && Swordcraft.heavy(workWeapon.work);
    const beforeHunt = state.hunt;
    const beforeHuntHealth = state.hunt && {...state.hunt};
    if (action === "huntStart" && arg && typeof arg === "object" && !arg.combat) arg = { ...arg, combat: Game.exploration.combat };
    const destroyBefore = action === "forgeItemEnhance" ? Game.forgeItems.quote(state,arg.id)?.destroy : 0;
    const result = Game.perform(state, action, arg, undefined, undefined, pressedAt);
    // The rules refuse an unannounced hit that could reset the item. Nothing changed, so show the notice.
    if (!result.ok && result.code === "riskNotice") {
      if (forgeItemAction) modal = "";
      render();
      if (modal) displayModal();
      else if (ForgeItemView.openRiskNotice()) return;
      notify(result.message, "loss");
      return;
    }
    if (!result.ok && (action === "openChest" || action === "craftHuntLining")) {
      if (repeatGuard && repeatHunting.active) repeatHunting.stop("보물 수령 실패");
      notify(result.message, "loss");
      render();
      return;
    }
    repeatHunting.stage(action, result, beforeHunt, arg);
    save();
    HuntWatch.stageOutcome(beforeHuntHealth, action, result);
    if (repeatGuard) {
      if (!result.ok) repeatHunting.stop(action === "openChest" ? "보물 수령 실패" : "입장 불가");
      else if (action === "huntStart" && repeatHunting.active) autoCombat.select("auto");
    }
    // A completed/retreated battle must clear intent before rendering the result.
    autoCombat.refresh(false);
    if (result.ok && ["craftMove","bladeWorkMove"].includes(equivalent)) animationStart = performance.now();
    if (result.impact) huntStart = performance.now();
    // A reset to +0 is named by the rules. `state.breaks` stays the older forge's own record.
    const destroyed = result.ok && result.outcome === "destroy";
    if (result.ok && result.outcome) ForgeItemView.hold(result.outcome, destroyBefore,
      action === "forgeItemEnhance" ? Game.forgeItems.quote(state,arg.id)?.destroy : 0);
    const forgeAction = destroyed || action === "forgeItemEnhance" || forgeWornItem || [
      "enhance",
      "bladeForge",
      "bladeArmor",
      "bladeWorkFinish",
      "bladeArmorWorkFinish",
      "focusEnhance",
      "restorePeak",
      "recoverEdge",
      "reforge",
      "craftFinish",
      "craftInherit",
      "routeFinish",
      "routeSupply",
      "doubleStrike",
      "journeyForge",
      "journeyBulk",
      "breathForge",
      "temper",
    ].includes(action);
    const forgeOutcome = !(result.ok && forgeAction) ? null : destroyed ? "destroy" : Feedback.forgeOutcome(
      gearBefore, actionLevel(),
      state.breaks > breaksBefore, result.kind,
    );
    const retryOutcome = heldEnhance && (forgeOutcome === "hold" || forgeOutcome === "drop");
    const shortOfGold = retryOutcome && state.gold < Game.enhancementCost(state, state[arg]);
    const repeatStrike = retryOutcome && !shortOfGold;
    if (result.ok && forgeAction) {
      animationStart = performance.now();
      navigator.vibrate?.(result.kind === "win" ? 18 : 36);
    }
    if (forgeItemAction) modal = "";
    const inventoryAction = result.ok && !!sourceInventoryMenu && modal === sourceInventoryMenu;
    if (inventoryAction) modal = "";
    if (result.ok && action === "bladeMaster") { HuntWatch.selectMaster(); modal = ""; }
    if (result.ok && action === "outfitSalvage") modal = "outfit:slots";
    if (result.ok && action === "outfitEquip" && modal === "outfit:forgeEquip:" + forgeOutfitSlot) modal = "";
    if (result.ok && equivalent === "bladeSalvage") modal = armorAction ? "bladeArmorCollection" : "bladeCollection";
    if (result.ok && action === "soulRebirth") {
      const targets = Game.endgame.transferTargets(state,arg);
      modal = targets.length === 1 ? "soul:transfer:"+targets[0].id : "soul:targets:transfer";
    }
    if (result.ok && ["soulLuck","soulPolish"].includes(action)) modal = "soul:craft:" + arg.id;
    if (result.ok && ["soulChoose","soulTransfer","soulAscend"].includes(action)) modal = (arg.id.startsWith("a") ? "bladeArmorItem-" : "bladeItem-") + arg.id;
    if (result.ok && action === "temperStart") modal = "temper";
    if (result.ok && equivalent === "bladeWorkStart") modal = armorAction ? "bladeArmorWork" : "bladeWork";
    if (result.ok && equivalent === "bladeFinalStart") modal = armorAction ? "bladeArmorFinal" : "bladeFinal";
    if (result.ok && equivalent === "bladeWorkFinish") modal = "";
    if (result.ok && action === "craftStart") modal = "craft";
    if (!repeatGuard && result.ok && ["openChest", "openTowerChests"].includes(action)) modal = "treasure";
    if (result.ok && action === "stopTower") modal = "towerRun";
    if (result.ok && ["craftFinish", "autoMine", "promoteSword", "chooseSwordTrait", "journeyBulk"].includes(action)) modal = "";
    if (result.ok && action === "finalStart") modal = "final";
    if (result.ok && finalKey && !workWeapon.finalTrial) modal = "";
    if (
      action === "temper" ||
      (["sell", "rebirth", "restart", "guild", "fuse", "raid"].includes(action) && result.ok)
    )
      modal = "";
    if (result.battle) {
      battle = { ...result.battle, start: performance.now(), message: result.message };
      modal = "battle";
    }
    // The forest scene shows its own strikes event by event and is not redrawn for them (hand-over §7.2 M1-a).
    const stagedHit = HuntWatch.present(beforeHuntHealth, action, result);
    if (!stagedHit) {
      render();
      if (modal) {
        // Keep the receipt, keyboard focus and expanded comparisons stable between automatic turns.
        if (!(automaticGuard || repeatGuard) || !HuntLootView.isReader(modal)) displayModal();
      } else closeModal(inventoryAction);
    }
    if (result.impact && !stagedHit) showHuntDamage(document.querySelector("#screen .combat-hud"), result.impact, motionEnabled());
    if (result.ok && motionEnabled()) {
      const stage = document.querySelector("#screen .scene");
      if (result.impact && !stagedHit) {
        const hit = result.impact;
        const label = hit.damage
          ? (hit.kind === "counter" ? "반격 " : "") + "−" + fmt(hit.damage)
          : (hit.kind === "parry" ? "돌진 방어" : "방어") + " · 받은 피해 " + fmt(hit.taken);
        Impacts.play(stage, hit.kind, label, !state.hunt);
      } else if (finalKey && (finalKey !== "yield" || result.kind === "win")) {
        Impacts.play(
          ["final","bladeFinal","bladeArmorFinal"].includes(modal) ? document.querySelector("#modalBody .final-scene") : stage,
          result.kind === "loss"
            ? "fracture"
            : finalKey === "edge"
              ? "slash"
              : finalKey === "ward"
                ? "parry"
                : "forge",
        );
      } else if (sparring) {
        const kind = arg === "parry" ? (strong ? "parry" : "block") : "slash";
        Impacts.play(document.querySelector("#modalBody .modal-scene"), kind);
      } else if (action === "huntStart" || action === "flee") Impacts.clear();
    }
    // A settled cart choice is shown as the receipt in the forest itself, not as a second toast.
    const sceneReceipt = result.ok && ["huntChoose","artisanChoose"].includes(action) && current() === "forest" && phonePage("forest") === "hunt";
    if (!repeatGuard && action !== "temperStart" && !sceneReceipt && !(result.ok && ["openChest", "openTowerChests"].includes(action)) && !result.battle && !result.impact && result.message)
    {
      // The rule's log line ends with the result's name; the notice titles it and says what the item keeps.
      const kept = destroyed && ForgeItemView.keepTag(forgeItemAction ? Game.forgeItems.quote(state,arg.id)?.type : action.startsWith("outfit") ? "outfit" : "blade");
      const text = destroyed ? result.message.replace(/ · 강화 파괴$/, "") + " · " + kept : result.message;
      notify(text + (shortOfGold ? " · 골드 부족으로 연속 강화 종료" : ""), result.promotion ? "forge-promotion" : forgeOutcome ? "forge-" + forgeOutcome : result.ok ? result.kind : "loss", forgeItemAction, destroyed ? "강화 파괴" : "");
    }
    if (result.ok && action !== "temperStart") {
      const stage = document.querySelector("#screen .scene");
      const chest = ["openChest", "openTowerChests"].includes(action);
      const reward = ["collect", "daily", "order", "sell", "market", "reward"].includes(action);
      const ascension = (["rebirth", "imprint", "fuse", "polish"].includes(action) || (action === "shop" && Number(arg) === 3) || (action === "finalMove" && state.weapon.level === 20)) && result.kind === "win";
      const animate = motionEnabled();
      if (forgeAction || result.promotion) {
        const level = actionLevel();
        const promotedTo = result.promotion?.to;
        const label = promotedTo ? Game.grades[promotedTo] + " 승급" : action === "temper" ? (state.heat === 5 ? "정밀 타격" : "담금질 완료") :
          destroyed ? "+0 · 강화 파괴" : state.breaks > breaksBefore ? "장비 파괴" : level > gearBefore ? "+" + fmt(level) + (action === "journeyForge" || action === "journeyBulk" ? " 재련 완료" : " 강화 성공") : level < gearBefore ? "+" + level + " · 하락" :
          result.kind === "win" ? "단조 완료" : "+" + level + " · 유지";
        const outcome = promotedTo ? "success" : forgeOutcome;
        // A finished process (+7·+9·+11) or a promotion winds the hammer up further (FP1 §9.3).
        const finale = !!promotedTo || ["craftFinish","craftInherit","bladeWorkFinish","bladeArmorWorkFinish"].includes(action);
        if (animate) Feedback.play("forge", stage, label, outcome, repeatStrike, promotedTo, finale);
        sound(repeatStrike && outcome === "hold" ? "forge-repeat-hold" : "forge-" + outcome, animate ? Feedback.strikeMs / 1000 : 0);
      } else if (chest) {
        if (animate) {
          const report = repeatGuard && document.querySelector(".watch-report");
          Feedback.play("chest", report || document.querySelector(".chest-reveal .chest-art"), report ? "" : "+" + fmt(state.lastChest.gold) + " G");
        }
        sound("chest", animate ? Feedback.chestMs / 1000 : 0);
      } else if (reward) {
        if (animate) Feedback.play("coins", modal ? el("modalBody") : stage, state.gold > goldBefore ? "+" + fmt(state.gold - goldBefore) + " G" : "보상 획득");
        sound("coins");
      } else if (ascension) {
        if (animate) Feedback.play("ascend", modal ? el("modalBody") : stage, action === "rebirth" ? "환생 완료" : "성장 완료");
        sound("ascend");
      } else if (!stagedHit) sound(result.impact?.kind || (sparring ? (arg === "parry" ? "parry" : "slash") : action === "mine" ? "mine" : result.kind));
    }
    settled = result.ok;
    autoCombat.refresh();
    repeatHunting.refresh();
    return repeatStrike;
  }
}
function renderHuntMode() {
  const repeatHost = document.querySelector("[data-repeat-panel]");
  if (repeatHost) repeatHost.outerHTML = repeatPanel(state);
  const host = document.querySelector("[data-hunt-mode-controls]");
  const focusedMode = document.activeElement?.dataset.huntMode;
  if (host) {
    host.outerHTML = huntModeControls(state);
    if (focusedMode) document.querySelector('[data-hunt-mode="' + focusedMode + '"]')?.focus({ preventScroll: true });
  }
}
function nav(id) {
  cancelForgePress();
  Impacts.clear();
  Feedback.clear();
  GameSound.stop();
  closeModal(false);
  if (location.hash.slice(1) === id) {
    if (id === "world" && HuntWatch.active) HuntWatch.stop("", false);
    releaseStoryHold(); // a page transition is a safe point for the next automatic story
    render();
    document.querySelector("main").scrollTop = 0;
    scrollTo(0, 0);
  } else {
    const fromMap = location.hash === "#world/map" && Object.hasOwn(zones, id);
    location.hash = id;
    if (fromMap) history.replaceState({ ...history.state, fromAdventureMap: true }, "");
  }
}
function render() {
  if (!state) return;
  ForgeItemView.cancelSwipe();
  HuntEffects.cancel();
  HuntWatch.beforeRender();
  const id = current(),
    parent = zones[id] ? "world" : id;
  syncMotion();
  document.body.dataset.place = id;
  document.body.dataset.page = phonePage(id);
  phonePageNav(id);
  const navHTML = navItems
    .map(
      ([key, label, ic]) =>
        '<button class="navitem ' +
        (parent === key ? "active" : "") +
        '" ' +
        (parent === key ? 'aria-current="page"' : "") +
        ' data-go="' +
        key +
        '">' +
        controlArt(ic) +
        label +
        "</button>",
    )
    .join("");
  el("mobileNav").innerHTML = navHTML;
  el("gold").textContent = brief(state.gold);
  const wallet = Game.huntingStatus(state);
  el("huntTickets").textContent = brief(wallet.free + wallet.purchased);
  const titles = {
    forge: ["대장간", "BLACKSMITH"],
    world: ["모험 지도", "WORLD MAP"],
    bag: ["보관함", "INVENTORY"],
    growth: ["성장 기록", "PROGRESSION"],
  };
  const [title, en] = titles[id] || zones[id];
  el("title").innerHTML =
    '<div class="titlebar"><div><div class="eyebrow">' +
    en +
    "</div><h1>" +
    title +
    '</h1></div><div class="title-actions">' +
    openBtn("storyBook", icon("book-open") + "이야기", "ghost") +
    openBtn("lessons", icon("circle-help") + "튜토리얼", "ghost") +
    (id === "forge"
      ? openBtn("journal", icon("scroll-text") + "강화 기록", "ghost")
      : id === "forest" && phonePage(id) === "hunt"
        ? (!HuntWatch.active && Game.blades.state(state).cleared ? openBtn("huntPlan", icon("compass") + "사냥 구역", "ghost") : !HuntWatch.active ? openBtn("bladeLoot-1","획득 확률","ghost") : "") +
          openBtn("huntRules", icon("swords") + "사냥 규칙", "ghost")
      : zones[id]
        ? go("world/map", icon("compass") + "모험 지도", "ghost")
        : openBtn("daily", icon("gift") + "출석 보상", "ghost")) +
    "</div></div>";
  let view;
  if (id === "forge") view = GameUI.forge(state, forgeView(state));
  else if (id === "bag") view = InventoryView.view(state);
  else if (id === "growth") view = growthView(state);
  else if (id === "forest" && phonePage(id) === "hunt") view = HuntWatch.view(state);
  else if (zones[id]) view = zoneView(state, id);
  else if (phonePage(id) === "board")
    view = card("대장간 게시판",
      row("오늘의 보급품", "하루 한 번 식량과 골드, 입장권, 가호 지급", openBtn("daily", "보상 확인", "mini")) +
      row("포인트 상점", "플레이 1분마다 1 P 적립", openBtn("shop", "상점 열기", "mini"))
    ) + orderView(state);
  else
    view =
      adventureMap(state) +
      (phonePage(id) === "map" ? metrics(
        metric("최고 진행", state.huntBest ? state.huntBest + "단계" : "첫 도전"),
        metric("탑 입장권", fmt(state.tickets) + "장"),
        metric("배치한 검", state.field.length + "자루"),
      ) : section("대장간 게시판") +
      '<div class="baggrid">' +
      card(
        "오늘의 보급품",
        desc("하루 한 번 식량과 골드, 입장권, 가호를 받습니다.") + openBtn("daily", "출석 보상 확인"),
        "gift",
      ) +
      card(
        "포인트 상점",
        desc("게임을 플레이한 시간 1분마다 1 P가 적립됩니다.") + openBtn("shop", "상점 열기"),
        "coins",
      ) +
      "</div>" +
      orderView(state));
  const screen = el("screen");
  const huntButtonFocused = document.activeElement?.matches(".watch-start");
  document.body.append(el("noticeSlot"));
  screen.innerHTML = view;
  if (huntButtonFocused) screen.querySelector(".watch-start")?.focus({ preventScroll: true });
  HuntWatch.afterRender();
  bindOutfitQuotes(screen);
  renderLesson();
  GameUI.shell();
  observeNoticeRails();
  placeToast();
  placeLesson(); // after rails and notice settle; toast frames re-place it below
  autoStory();
  bindForgeRequests(screen);
  syncMusic();
}
// Automatic next-goal prompt: one button naming the next action. Pressing it locates
// the control; it never performs the action. Hidden while anything else owns the screen.
function lessonBusy() {
  return HuntWatch.active || repeatHunting.active || autoCombat.active || !!repeatHunting.summary?.unconfirmed;
}
function lessonHidden() {
  // AT2-R1: visible in normal play, including the idle/result/paused forest hunt page; hidden only
  // during active combat, a modal, a storage error or before the save is ready.
  return !ready || !!storageError || !!modal || lessonBusy();
}
function syncLesson() {
  const host = el("apprentice");
  const hide = !host.firstElementChild || lessonHidden();
  if (host.hidden !== hide) host.hidden = hide;
  host.inert = hide;
  placeLesson();
}
// AT2-R1 measured anchor. Only the coach moves; the hammer, hunt button and rails keep their places.
// Forge: centred just under the slot pager (or filter row) between the side rails, below any notice.
// Forest hunt page: centred just above the hunt button. Other pages keep the CSS corner placement.
function placeLesson() {
  const lessonAvoid = ".watch-arena :is(.hp-meter,.watch-skills,.watch-enemy-skill," +
    ".watch-impact-number,.watch-report,.watch-reward,.watch-loot,.watch-recent-loot,.watch-status)";
  const host = el("apprentice");
  const box = node => {
    const r = node?.getClientRects().length ? node.getBoundingClientRect() : null;
    return r && r.width > 0 && r.height > 0 ? r : null;
  };
  const set = (place, x, max) => {
    host.dataset.place = place;
    host.style.setProperty("--lesson-x", Math.round(x) + "px");
    host.style.setProperty("--lesson-max", Math.max(44, Math.floor(max)) + "px");
  };
  delete host.dataset.place;
  delete host.dataset.tight;
  if (host.hidden) return;
  const screen = el("screen");
  const start = box(screen.querySelector(".watch-start"));
  const pager = box(screen.querySelector(".forge-layout .forge-item-pager")) ||
    box(screen.querySelector(".forge-layout .forge-slot-switch"));
  const cart = box(screen.querySelector('.watch-arena[data-find="cart"]:has([data-explore-choice])'));
  if (cart) {
    set("forest", cart.left + 74, 140);
    host.style.setProperty("--lesson-y", Math.round(cart.top + 64) + "px");
  } else if (start) {
    set("forest", start.left + start.width / 2, Math.min(260, innerWidth - 24));
    const h = host.offsetHeight, w = host.offsetWidth, floor = start.top - 6, top = floor - h;
    host.style.setProperty("--lesson-y", Math.round(top) + "px");
    // Report (not hide) a crowded viewport: the player must still see the next action after a hunt.
    const left = start.left + start.width / 2 - w / 2, right = left + w;
    const tight = [...screen.querySelectorAll(lessonAvoid)].map(box)
      .some(r => r && r.left < right && r.right > left && r.top < floor && r.bottom > top);
    if (tight) host.dataset.tight = "true";
  } else if (pager) {
    const stage = box(screen.querySelector(".forge-layout .stage-side")) || box(screen);
    let low = stage.left, high = stage.right;
    for (const rail of screen.querySelectorAll(".forge-layout .ui-forge-rail")) {
      const r = box(rail);
      if (!r) continue;
      if (r.left + r.width / 2 < stage.left + stage.width / 2) low = Math.max(low, r.right);
      else high = Math.min(high, r.left);
    }
    const switcher = box(screen.querySelector(".forge-layout .forge-slot-switch"));
    const notice = !el("noticeSlot").hidden && el("noticeSlot").closest("#screen") ? box(el("noticeSlot")) : null;
    const top = Math.max(pager.bottom, switcher?.bottom || 0, notice?.bottom || 0) + 4;
    set("forge", (low + high) / 2, high - low - 8);
    // Floor, not round: rounding up can push the coach's bottom into the caption by a subpixel.
    host.style.setProperty("--lesson-y", Math.floor(top) + "px");
  }
}
new ResizeObserver(() => placeLesson()).observe(el("screen"));
addEventListener("resize", () => placeLesson());
let lessonScrollFrame = 0; // the coach is fixed; follow its anchor if the play area scrolls
addEventListener("scroll", () => {
  if (!lessonScrollFrame && el("apprentice").dataset.place)
    lessonScrollFrame = requestAnimationFrame(() => { lessonScrollFrame = 0; placeLesson(); });
}, { passive: true, capture: true });
function clearLessonTarget() {
  for (const node of document.querySelectorAll(".lesson-target")) node.classList.remove("lesson-target");
  for (const node of document.querySelectorAll('[aria-describedby="lesson-action-hint"]'))
    if (!node.closest("#apprentice")) node.removeAttribute("aria-describedby");
}
function renderLesson() {
  clearLessonTarget();
  const host = el("apprentice");
  let goal = null;
  try { goal = Apprentice.prompt(state); } // the prompt must never break the play screen
  catch (error) { console.error(error); }
  document.body.dataset.lesson = goal ? "on" : "off";
  if (!goal) host.replaceChildren();
  else {
    const count = (goal.step + 1) + "/" + Apprentice.lessons.length;
    host.innerHTML = '<button class="lesson-locate" data-lesson="locate" aria-label="다음 목표 ' + count + " · " +
      goal.title + " · " + goal.button + '" aria-describedby="lesson-action-hint"><small>다음 목표 ' + count +
      "</small><b>" + goal.button + '</b></button><span id="lesson-action-hint">' + goal.text + "</span>";
    const top = document.querySelector("main")?.getBoundingClientRect().top;
    if (top >= 0) document.body.style.setProperty("--lesson-top", Math.round(top) + "px");
  }
  syncLesson();
}
function lessonButton(action, label) {
  return '<button class="mini" data-lesson="' + action + '">' + label + "</button>";
}
let pendingLessonFocus = false;
function focusLesson() {
  if (!ready || storageError || lessonBusy()) return;
  // Never close a story to locate a goal; run the locate once the story closes normally.
  if (modal === "storyScene") { pendingLocate = true; return; }
  closeModal(false);
  const n = Apprentice.next(state);
  if (n < 0) return;
  const tip = Apprentice.target(state, n);
  if (tip.route === "forge") { archiveBlade = false; gear = "weapon"; forgeOutfitSlot = ""; ForgeItemView.selectSlot(state,"weapon"); }
  const destination = phoneLessonDestination(tip);
  if ((location.hash.slice(1) || "forge") !== destination) {
    pendingLessonFocus = true;
    nav(destination);
    return;
  }
  render();
  if (modal === "storyScene") { pendingLocate = true; return; }
  if (tip.open) showModal(tip.open);
  const target = (tip.open ? el("modalBody") : el("screen")).querySelector(tip.selector);
  target?.classList.add("lesson-target");
  target?.setAttribute("aria-describedby", "lesson-action-hint");
  target?.scrollIntoView({ block: "center" });
  target?.focus({ preventScroll: true });
}
function lessonMenu() {
  const done = Apprentice.completed(state);
  const step = Apprentice.next(state);
  const tip = step >= 0 ? Apprentice.target(state, step) : null;
  const automatic = state.apprentice.auto !== false;
  const notes = [
    "대장간에서 검을 벼려 공격력을 올리세요.",
    "짧게 누르면 이번 단계 자동사냥, 1초 꾹 누르면 연속 사냥이 시작됩니다. 다시 누르면 멈춥니다.",
    "모루를 초록 구간에서 두드려 골드를 받으세요. 일반 강화에는 확률 보너스도 붙습니다.",
    "대장간 의뢰에서 목표 강화 단계를 확인하고 골드와 별의 파편을 받으세요.",
    "+13 이상 여분 무기를 다른 무기로 교체한 뒤 무기함에서 배치하세요.",
    "사냥터에서 모인 골드를 수령하세요. 회수한 검은 보관함에 있습니다.",
  ];
  return [
    "튜토리얼",
    (tip ? row("다음 목표 · " + Apprentice.lessons[step][1], tip.text, "") +
      (lessonBusy() ? desc("사냥을 마친 뒤 목표를 찾을 수 있습니다.") : lessonButton("locate", tip.button)) +
      desc(automatic ? "다음 목표 버튼이 게임 화면에 자동으로 나옵니다." : "자동 안내를 껐습니다. 이 메뉴에서 목표를 찾을 수 있습니다.") +
      lessonButton("auto", automatic ? "자동 안내 끄기" : "자동 안내 켜기") : desc("모든 수업을 마쳤습니다. 아래에서 다시 읽을 수 있습니다.")) +
    "<details><summary>수업 다시 읽기</summary>" + Apprentice.lessons.map((lesson, i) =>
      row(lesson[1], i === step ? tip.text : notes[i], done[i] ? icon("check") : "")
    ).join("") + "</details>" +
      (!archiveBlade ? "<details><summary>제작 설명</summary>" + BladeView.modal(state, "bladeGuide")[1] + "</details>" : ""),
  ];
}
const guardLabels = [
  "실패 시 단계 하락 방지",
  "실패 시 장비 파괴 방지",
  "강화비 무료 · 하락과 파괴 방지",
];
function preferenceSwitch(key, label) {
  const on = prefs[key];
  return '<button class="pref-switch" role="switch" aria-checked="' + on + '" aria-label="' + label +
    '" data-pref="' + key + '"><i aria-hidden="true"></i>' + (on ? "켜짐" : "꺼짐") + "</button>";
}
function swordJournal(s, record = s.swordRecord) {
  if (!record) return "";
  const title = record === s.previousSwordRecord ? "이전 검의 기록" : record.origin === "starter" ? "첫 검의 기록" : "검의 기록";
  const equipped = s.weapon.recordId === record.id;
  const entries = record.recent.map(entry => {
    const when = new Date(entry.at).toLocaleString("ko-KR", {
      year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return '<li><time>' + when + '</time><b>' + (entry.safe && entry.to - entry.from > 1 ? "연속 재련 " : "") +
      '+' + fmt(entry.from) + ' → +' + fmt(entry.to) + '</b></li>';
  }).join("");
  return '<details class="sword-history"><summary>' + icon("sword") + title + '</summary>' +
    line("장착 상태", equipped ? "장착 중" : "미장착") + line("기록 시작", "+" + fmt(record.startLevel)) +
    line("기록한 강화 성공", fmt(record.hits) + "회") +
    (entries ? '<h3>최근 강화 성공</h3><ol>' + entries + '</ol>' : desc("기록된 강화 성공이 없습니다.")) +
    '</details>';
}
function modalData() {
  return ForgeItemView.detail(state,modal,modalDataContent());
}
function modalDataContent() {
  const s = state;
  if (modal.startsWith("forgeItem:")) return ForgeItemView.modalContent(modal);
  if (modal.startsWith("outfit:")) return OutfitView.modal(s, modal);
  if (modal.startsWith("soul:")) return SoulView.modal(s, modal);
  if (modal === "huntLoot") return HuntLootView.detailView(s);
  if (modal === "firstGearCompare") return HuntWatch.compareLoot(s);
  if (modal.startsWith("blade")) return BladeView.modal(s, modal);
  if (!archiveBlade && modal === "help") return BladeView.modal(s, "bladeGuide");
  if (modal.startsWith("inventory-")) return InventoryView.menu(s, modal.slice("inventory-".length));
  if (modal === "companion") return ["동료 대화", storyChat(s, current())];
  if (modal === "storyScene") return storyPage();
  if (modal === "storyBook") {
    const book = storyBook(s);
    if (CharcoalStory.dialogue(s, current(), s.hunt && Game.huntCharge(s.hunt)))
      book[1] += openBtn("companion", "동료와 대화", "action");
    return book;
  }
  if (modal === "final") return finalWorkshop(s);
  if (modal === "craft") return craftWorkshop(s);
  switch (modal) {
    case "towerRun":
      return ["고속 등반 결과", towerRunView(s)];
    case "towerRewards":
      return ["무한의 탑 보물상자", Game.towerRewards.map((reward, i) =>
        line((i ? Game.towerRewards[i - 1].max + 1 : 1) + (Number.isFinite(reward.max) ? "~" + reward.max : "+") + "층 · " + reward.name,
          (reward.minGold >= 1e8 ? brief(reward.minGold) : fmt(reward.minGold / 10000) + "만") + "~" + (reward.maxGold >= 1e8 ? brief(reward.maxGold) : fmt(reward.maxGold / 10000) + "만") + " G")).join("") +
        desc("입장 시 능력치로 패배하거나 중단할 때까지 등반합니다. 재접속하면 이어집니다. 층마다 상자 한 개를 얻고 개봉할 때 골드와 아이템이 지급됩니다.")];
    case "treasure":
      return ["상자 개봉", chestReceipt(s.lastChest) +
        (s.chests.length ? chestButton(s.chests[0]) : "") + '<button class="primary" data-close>확인</button>'];
    case "journal":
      return [
        "강화 기록",
        metrics(
          metric("시도", fmt(s.attempts)),
          metric("성공", fmt(s.hits)),
          metric("파괴", fmt(s.breaks)),
        ) +
          swordJournal(s) + (s.previousSwordRecord ? swordJournal(s, s.previousSwordRecord) : "") +
          (Game.canAdoptSword(s) ? desc("이전 검이 사라졌습니다. 장착한 검으로 새 여정을 시작할 수 있습니다.") +
            btn("adoptSword", "현재 검의 기록 시작", "", "action") : "") + section("최근 활동") +
          (s.log
            .map(
              (l) =>
                '<div class="checkline"><time>' +
                new Date(l.time).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }) +
                "</time>" +
                escapeHtml(l.message)
                  .replaceAll("무료 사냥권 ", "비축 식량 ")
                  .replaceAll("사냥권 1개 사용", "식량 1개 사용")
                  .replaceAll("사용한 사냥권", "사용한 식량")
                  .replaceAll("사냥 시작 · 무료 재도전", "사냥 시작 · 지원 재도전 · 식량 소모 없음") +
                "</div>",
            )
            .join("") || desc("첫 강화부터 여기에 기록됩니다.")),
      ];
    case "swordPromotion":
      return swordPromotionView(s);
    case "swordTrait":
      return swordPromotionView(s, true);
    case "guards":
      return [
        "강화 가호",
        desc(
          "장착한 가호와 주문서는 강화 시도마다 1개씩 소모합니다. 정령과 대장장이 가호는 함께 쓸 수 있습니다.",
        ) +
          Game.blessings
            .map((n, i) =>
              row(
                n + " ×" + s.charms[i],
                guardLabels[i],
                btn(
                  "guard",
                  s.enabled[i] ? "장착됨" : "장착",
                  i,
                  "mini " + (s.enabled[i] ? "active" : ""),
                  !s.charms[i],
                ),
                ["leaf", "hammer", "star"][i],
              ),
            )
            .join("") +
          row(
            "10% 주문서 ×" + s.scrolls,
            "기본 성공률 ×1.1",
            btn(
              "scroll",
              s.scrollOn ? "장착됨" : "장착",
              "",
              "mini " + (s.scrollOn ? "active" : ""),
              !s.scrolls,
            ),
          ),
      ];
    case "temperGuide":
      return [
        "담금질 준비",
        desc("골드 소모 없이 시작합니다. 시작한 뒤 흰 바늘이 초록 구간에 들어오면 모루를 두드리세요. 빗나가도 골드를 얻습니다.") +
          openBtn("temper", icon("hammer") + "담금질 시작", "primary"),
      ];
    case "temper":
      return [
        "담금질",
        desc(
          "흰 바늘이 초록 구간에 들어올 때 모루를 두드리세요. 정밀 타격은 450 G와 다음 강화 성공률 +5%p를 줍니다.",
        ) +
          '<div class="tempo"><span class="target"></span><i id="needle"></i></div>' +
          btn("temper", icon("hammer") + "모루 두드리기", "", "primary"),
      ];
    case "risk": {
      const g = s[gear];
      const plan = Game.journeyForge(s, gear);
      if (plan) return ["재련 수첩", journeyDetails(s, gear, plan)];
      if (g.level >= 20) return ["현재 강화 조건", line("일반 강화", "최고 단계 도달") +
        (gear === "weapon" ? swordOddsTable(g.level) : "")];
      const chances = Game.enhancementChances(s, g);
      return [
        "현재 강화 조건",
        line("장비", Game.name(g, gear) + " +" + g.level) +
          line("성공 확률", pct(chances.success)) +
          (gear === "weapon" && g.level >= 14 && g.level <= 16
            ? desc(
                "이 검이 +15 이상을 달성한 뒤 +14로 내려오면, 한 번의 재단조로 이전 단계까지 돌아갑니다. 복구 상한은 +16입니다.",
              )
            : "") +
          line(
            "보호 적용 전",
            "유지 " + pct(chances.hold) + " · 하락 " + pct(chances.drop) + " · 파괴 " + pct(chances.destroy),
          ) +
          line("담금질 보너스", "+" + s.heat + "%p") +
          (gear === "weapon" && Game.enhancementNotebook(s).active
            ? desc(
                "집중 강화도 하락·파괴 판정은 동일합니다. 보호된 실패도 단서 1개를 남깁니다. 복원은 골드와 단서만 쓰며 새 기록을 만들 수 없습니다. 파괴·환생 후 단서는 남고 해당 검의 기록은 사라집니다.",
              )
            : "") +
          (gear === "weapon" && Swordcraft.wards(g)
            ? line("검등 보강", Swordcraft.wards(g) + "회 보호")
            : "") +
          desc("강화를 꾹 누르면 유지·하락 뒤에도 계속 두드립니다. 한 단계 오르거나 장비가 파괴되거나 골드가 부족하면 멈춥니다. 손을 떼면 즉시 중단합니다.") +
          desc("대장간의 네 확률에는 현재 보너스와 보호 효과가 적용됩니다. 하락하면 한 단계 내려가고, 파괴되면 +0 장비를 받습니다.") +
          (gear === "weapon" ? swordOddsTable(g.level) : ""),
      ];
    }
    case "settings":
      return [
        "환경 설정",
        row(
          "배경음",
          "장소와 상황에 따라 바뀌는 12곡",
          preferenceSwitch("music", "배경음"),
        ) + row(
          "배경음 크기",
          "효과음과 별도로 조절합니다",
          '<input type="range" id="musicVolume" aria-label="배경음 크기" min="0" max="100" step="5" value="' +
          Math.round((Number.isFinite(prefs.musicVolume) ? prefs.musicVolume : .35) * 100) + '" style="width:100px">',
        ) + row(
          "효과음",
          "망치·동전·전투·성장 효과음",
          preferenceSwitch("sound", "효과음"),
        ) +
          row(
            "애니메이션",
            !prefs.motion ? "게임 설정에서 움직임을 껐습니다" : !motionEnabled() ? "PC의 동작 줄이기 설정으로 정지 중입니다" : "공격·피격 연출이 켜져 있습니다",
            preferenceSwitch("motion", "애니메이션"),
          ) +
          ((reducedMotion.matches || prefs.motionOverride) ? row("연출 적용 방식", prefs.motionOverride ? "이 게임에서는 전체 연출을 사용합니다" : "기기 설정과 관계없이 이 게임의 연출을 켤 수 있습니다", '<button class="mini" data-motion-policy="'+(prefs.motionOverride?'system':'full')+'">'+(prefs.motionOverride?'기기 설정 따르기':'이 게임에서 연출 켜기')+'</button>') : '') +
          row(
            "저장 방식",
            storageError ? "현재 저장 불가" : "이 기기에 자동 저장 · 정상본 2개 보관",
            icon("archive"),
          ) +
          row("게임 버전", UpdateNotice.version(), "") +
          '<div class="settings-links">' + openBtn("daily", icon("gift") + "오늘의 출석 보상") +
          openBtn("lessons", icon("hammer") + "대장장이 수업 · 튜토리얼") +
          openBtn("help", icon("book-open") + "플레이 안내") + "</div>" +
          row("게임 진행", "새 게임으로 돌아갑니다.", openBtn("confirmNewGame", "처음부터 시작", "action danger")),
      ];
    case "confirmNewGame": {
      const purchased = Game.huntingStatus(state).purchased;
      return [
        "처음부터 시작할까요?",
        desc("장비, 골드, 재료, 환생과 이야기 기록을 초기화합니다. 기본 비축 식량은 " +
          Game.hunting.initial + "개로 돌아갑니다." +
          (purchased ? " 구매 식량 " + fmt(purchased) + "개는 유지됩니다." : "")) +
        desc("출석 수령 기록은 유지됩니다. 현재 저장을 별도로 보관하고 새 진행을 저장한 뒤 시작합니다.") +
          '<div class="actions">' + openBtn("settings", "취소") +
          '<button class="action danger" data-new-game>진행을 지우고 시작</button></div>',
      ];
    }
    case "lessons":
      return lessonMenu();
    case "help":
      return [
        "플레이 안내",
        '<div class="stack">' +
          desc(
            "① 대장간에서 무기와 방어구를 강화하세요. 담금질과 의뢰 보상으로 초반 골드를 마련할 수 있습니다.",
          ) +
          desc("② +13 이상 보조 검을 보관함에 넣고 사냥터에 배치하면 접속을 종료해도 골드가 쌓입니다.") +
          desc(
            "③ 기록 중인 검은 세 제작 공정을 마친 뒤 +20에서 베이스 II, +200에서 베이스 III, +1,000에서 베이스 IV로 승급합니다. +20 보조 검은 환생 의식에 쓸 수 있습니다.",
          ) +
          desc("④ 도전의 탑에서는 무기의 공격력과 방어구의 체력이 모두 적용됩니다.") +
          "</div>",
      ];
    case "daily": {
      const claimed = !dailyAvailable(s);
      return [
        "오늘의 출석 보상",
        '<p class="desc" data-attendance-day="' + Game.day(Date.now()) + '">오늘 ' + Game.day(Date.now()) + " · 한국 시간(KST) 자정 갱신 · 로컬 기기 시각 기준</p>" +
          row("비축 식량 +" + Game.hunting.daily + "개", "출석 식량은 " + Game.hunting.cap + "개를 넘겨 보유할 수 있습니다.", '<img class="hunt-food-icon" src="assets/hunt-food.png" alt="">') +
          row(fmt(Game.dailyGold(s)) + " G", "무한의 탑 입장권 5장 · 산소통 1개", icon("gift")) +
          row("가호 보급", "정령과 대장장이 가호 각 3개", icon("shield")) +
          btn(
            "daily",
            claimed ? "오늘 수령 완료" : "보급품 받기",
            "",
            "primary",
            claimed,
          ),
      ];
    }
    case "market":
      return [
        "심해 암시장",
        desc("시세는 한국 시간 0시, 8시, 16시에 갱신됩니다.") +
          Game.oreNames
            .map((n, i) => line(n + " ×" + s.ore[i], brief(Game.marketPrice(i, Date.now())) + " G"))
            .join("") +
          btn("market", "보유 광물 일괄 판매", "", "primary", !s.ore.some(Boolean)),
      ];
    case "shop":
    case "shopSell": {
      const selling = modal === "shopSell";
      const head = line("보유 포인트", fmt(s.points) + " P") +
        '<div class="segment shop-modes">' + ["shop", "shopSell"].map((mode, i) =>
          '<button data-open="' + mode + '" aria-pressed="' + (mode === modal) + '" class="' +
          (mode === modal ? "sel" : "") + '">' + ["구매", "되팔기"][i] + '</button>').join("") + '</div>';
      if (!selling) return ["포인트 상점", head + desc("플레이 1분마다 1 P 적립 · 유물 주문서는 보관함의 대표 유물에 사용합니다.") +
        RelicShop.catalog.map(item => row(item.name, item.text +
          (item.sell ? " · 보유 " + RelicShop.owned(s, item) + "개" : ""),
          btn("shop", fmt(item.price) + " P", item.id, "mini", s.points < item.price || (item.id === "3" && s.relics.length >= 20)))).join("") +
        go("bag/relics", "유물 보관함", "action")];
      const stock = RelicShop.catalog.filter(item => item.sell && RelicShop.owned(s, item));
      if (!stock.length) return ["포인트 상점", head + desc("판매할 가호나 유물 주문서가 없습니다.")];
      return ["포인트 상점", head + '<label for="saleItem">판매할 품목</label><select id="saleItem"><option value="">품목 선택</option>' +
        stock.map(item => '<option value="' + item.id + '">' + item.name + ' · 보유 ' + fmt(RelicShop.owned(s, item)) + '개</option>').join("") +
        '</select><label for="saleCount">판매 수량</label><input id="saleCount" type="number" inputmode="numeric">' +
        '<p id="saleQuote" class="desc" aria-live="polite"></p>' + btn("resell", "판매", "", "primary", true)];
    }
    case "relicWorkshop": {
      const relic = s.relics[s.equippedRelic];
      if (!relic) return ["유물 강화", desc("보관함에서 대표 유물을 지정하세요.") + go("bag/relics", "유물 보관함")];
      const inventory = RelicShop.scrolls.filter(item => RelicShop.owned(s, item));
      return ["대표 유물 강화", line("레이드 공격력", "+" + relic.power + "%" + (relic.extraAttack ? " · 추가 +" + relic.extraAttack : "")) +
        line("남은 강화 기회", (10 - relic.tries) + " / 10회") + line("복구 가능한 실패", relic.failures + "회") +
        row("별의 파편 강화", "기본 공격력 보너스 · 성공 60% · 수치 +30%",
          btn("polish", "파편 1개", "", "mini", !s.shards || relic.tries >= 10)) +
        (inventory.length ? inventory.map(item => {
          const reason = RelicShop.restriction(relic, item);
          return row(item.name + " ×" + RelicShop.owned(s, item), item.text + (reason ? " · " + reason : ""),
            btn("relicScroll", "사용", item.id, "mini", !!reason));
        }).join("") : desc("포인트 상점에서 유물 주문서를 구입할 수 있습니다.")) + openBtn("shop", "포인트 상점")];
    }
    case "autoMineSetup": {
      const max = Math.min(Game.mining.maxTanks, s.tanks);
      const tankMs = Math.floor((100 + 10 * s.imprints.lung) / 10) * Game.mining.stepMs;
      return ["자동 탐사 예약",
        line("보유 산소통", fmt(s.tanks) + "개") +
        line("자동 하강", "50 m마다 산소 10 · " + Game.mining.stepMs / 1000 + "초") +
        line("산소통 한 개", miningTime(tankMs) + " · 피버 +1") +
        '<label for="autoTankCount">사용할 산소통 (1~' + max + '개)</label>' +
        '<input id="autoTankCount" type="number" inputmode="numeric" min="1" max="' + max + '" step="1" value="' + Math.min(10, max) + '">' +
        desc("화면을 닫아도 탐사가 이어집니다. 예약한 산소통을 먼저 맡기며, 중단하면 현재 산소통까지 마치고 남은 예약분을 돌려받습니다.") +
        desc("피버 100을 모은 뒤 직접 탐사를 시작하면 그 산소통의 드롭 보상이 10배가 됩니다.") +
        btn("autoMine", "자동 탐사 시작", "", "primary", !max || !Game.canDive(s.weapon) || !!s.dive || !!s.autoMine)];
    }
    case "miningResult":
      return ["자동 탐사 정산", miningResult(s)];
    case "rebirth":
      if (Game.isJourneyGear(s, s.weapon)) return ["환생 의식", line("필요 장비", "+20 보조 검") +
        desc("기록 중인 검을 보관하고 환생할 보조 검을 장착하세요.") + go("bag", "장비 보기", "primary")];
      return [
        "환생 의식",
        desc(s.armor.journeyArmor ? "장착한 보조 검을 바칩니다. 재련한 방어구는 계속 착용합니다." : "장착한 보조 검과 방어구가 일반 +0으로 돌아갑니다. 보관함과 사냥터는 유지됩니다.") +
          line(
            "획득 영혼 포인트",
            s.weapon.level === 20 ? [20, 60, 200, 600][s.weapon.grade] + " P" : "20강 무기 필요",
          ) +
          (s.weapon.finishMethod
            ? line("마지막 돌파", Breakthrough.methods[s.weapon.finishMethod].name)
            : "") +
          inheritancePicker(s) +
          btn("rebirth", s.armor.journeyArmor ? "보조 검을 바치고 환생" : "장착 장비를 바치고 환생", "", "primary", s.weapon.level !== 20),
      ];
    case "fusion": {
      if (Game.isJourneyGear(s, s.weapon)) return ["초월 합성", desc("초월에 사용할 베이스 IV 보조 검을 장착하세요. 기록 중인 검은 대장간에서 계속 벼릴 수 있습니다.") +
        go("bag/stored", "보관 무기 보기", "primary")];
      const i = Math.max(0, Math.min(4, s.weapon.level - 20));
      return [
        "초월 합성",
        desc(
          "같은 단계 베이스 IV 무기 두 자루가 필요합니다. 실패 시 15% 확률로 보관함의 보조 무기가 파괴됩니다.",
        ) +
          line("환생", fmt(s.rebirths) + " / 2,000") +
          line("목표", "+" + (21 + i)) +
          line("필요 골드", brief([150e9, 300e9, 1e12, 2e12, 4e12][i]) + " G") +
          line("전설 제련석", s.stones + " / " + 10 * (i + 1)) +
          line("영혼 포인트", s.souls + " / " + 5 * (i + 1)) +
          line("성공 확률", [0.5, 0.35, 0.2, 0.1, 0.05][i] + "%") +
          btn("fuse", "합성 시도", "", "primary"),
      ];
    }
    case "guild":
      return [
        "개인 길드",
        s.guild
          ? desc(s.guild.name + " · 대표 유물 효과가 적용됩니다.") +
            line("레이드 공격력", fmt(Game.bladeAttributes(s, false, true).attack)) + line("제한", "10턴") +
            desc("탑과 길드 표적은 다음 업데이트까지 이전 무기 수치로 싸웁니다.") +
            btn("raid", "일일 레이드 도전", "", "primary", s.guild.last === Game.day(Date.now()))
          : desc("길드 징표 10개와 30억 G로 개인 길드를 창설합니다.") +
            line("징표", s.marks + " / 10") +
            '<input id="guildName" maxlength="12" placeholder="길드 이름" aria-label="길드 이름">' +
            btn("guild", "길드 창설", "", "primary"),
      ];
    case "restart":
      return [
        "시련 다시 시작",
        desc(
          "시련 버프를 모두 지우고 1층으로 돌아갑니다. 이미 수령한 층별 재화 기록은 유지됩니다.",
        ) + btn("restart", "1층부터 다시 도전", "", "primary"),
      ];
    case "huntWallet":
      return ["비축 식량", '<section id="huntingWallet">' + huntingWalletContent(s) + '</section>'];
    case "huntPlan":
      return ["사냥 구역", HuntWatch.planView(s)];
    case "huntRules":
      // A waiting cart is not a battle; it reads the current forest rules and exploration odds.
      // A new hunt runs on the rule clock (AS1-1). A d20 hunt that was under way at the update keeps its turns.
      if (!s.hunt || s.hunt.exploration || Game.huntTimed(s.hunt)) return ["숲 사냥",
        desc("사냥 버튼을 짧게 누르면 이번 단계를 끝내고, 1초 꾹 누르면 다음 단계까지 이어서 사냥합니다. 사냥 중에 다시 누르면 멈춥니다.") +
        HuntWatch.exploreRules(s) +
        line("공격 간격", "무기 종류와 공격속도 옵션이 정합니다 · 적은 2초마다") +
        line("공격 굴림", "1은 빗나감 · 20은 치명타") +
        line("상처", "상처를 다 채우면 파열(단검 4개, 그 밖 3개)") +
        desc("양쪽이 자기 간격마다 공격하고, 타격 순간에 맞은 쪽 곁에 결과를 표시합니다. 공격 굴림과 기술 보정의 합이 방어 굴림으로 정한 목표 이상이면 명중하며, 명중한 공격에는 무기의 치명타 확률이 적용됩니다. 예고된 적 기술에는 방어 보정이 붙고 반격 검술은 보정이 더 큽니다. 굴림과 목표는 사냥을 중단한 뒤 사냥 구역에서 확인할 수 있습니다.") +
        desc("적 기술은 적의 공격 횟수로 셉니다. 황금 고블린은 4초에 달아나며, 그 전에 잡으면 상자에 기본 골드 +50%를 더합니다. 한 조우가 80초를 넘기면 패배합니다.") +
        desc("사냥에 나갈 때 식량을 1개 씁니다. 진행 중인 사냥은 식량이 없어도 재개할 수 있습니다. 다섯 단계마다 우두머리를 만납니다. 무기와 방어구는 보관함에서 비교하고 장착합니다.") + openBtn("bladeStyles","검술과 능력 확인")];
      if (s.hunt.diceVersion === 2) return ["숲 사냥",
        desc("사냥 버튼을 짧게 누르면 이번 단계를 끝내고, 1초 꾹 누르면 다음 단계까지 이어서 사냥합니다. 사냥 중에 다시 누르면 멈춥니다.") +
        HuntWatch.exploreRules(s) +
        line("공격 d20", "1은 빗나감 · 20은 치명타") +
        desc("이 사냥은 업데이트 전에 시작해 턴 규칙으로 끝까지 진행합니다. 한 턴에 내 공격과 적의 응답을 차례로 보여 주고, 타격 순간에 맞은 쪽 곁에 결과를 표시합니다. 공격 주사위와 기술 보정의 합이 방어 d6으로 정한 목표 이상이면 명중하며, 명중한 공격에는 무기의 치명타 확률이 적용됩니다. 예고된 적 기술에는 방어 보정이 붙고 반격 검술은 보정이 더 큽니다. 공격 눈과 방어 눈, 목표는 사냥을 중단한 뒤 사냥 구역에서 확인할 수 있습니다.") +
        desc("사냥에 나갈 때 식량을 1개 씁니다. 진행 중인 사냥은 식량이 없어도 재개할 수 있습니다. 다섯 단계마다 우두머리를 만납니다. 무기와 방어구는 보관함에서 비교하고 장착합니다.") + openBtn("bladeStyles","검술과 능력 확인")];
      if (s.hunt.bladeCombat) return ["숲 사냥", line("주사위", "1~3 타격 · 4~5 방어 · 6 강타") +
        desc("강공 검술은 기세 2를 써서 일격, 반격 검술은 적 스킬 방어 뒤 반격, 상처 검술은 상처 3겹부터 파열을 발동합니다.") +
        desc("다섯 단계마다 우두머리를 만납니다. 무기와 방어구는 보관함에서 비교하고 장착합니다.") + openBtn("bladeLoot-"+(s.hunt?.rank || Math.min(60,Game.blades.state(s).cleared+1)),"장비 획득 확률") + openBtn("bladeStyles","검술과 능력 확인")];
      return ["주사위 사냥", line("1~3 공격 · 4~5 방어 · 6 강공", "양쪽이 매 턴 굴립니다") +
        desc("강공은 공격력의 1.7배, 방어는 받는 피해를 75% 줄입니다. 먼저 쓰러뜨린 적은 반격하지 못합니다. 40턴 안에 쓰러뜨리지 못하면 패배합니다.") +
        desc("공격 주사위에 준비된 스킬이 자동 발동합니다. 강공은 2단계에서 열리고 기세 2가 필요합니다. 적 스킬을 방어하면 반격을 준비합니다.") +
        desc("식량 1개로 한 무리를 연달아 상대합니다. 다섯 단계마다 우두머리가 기다립니다. 승리하면 해당 단계의 골드와 숲결 섬유를 받습니다. 중단한 토벌은 식량 소모 없이 이어서 할 수 있습니다.")];
    case "battle": {
      if (!battle) return ["전투 기록", ""];
      return [
        (battle.tr ? "시련의 탑" : "무한의 탑") + " " + battle.f + "층",
        '<div class="modal-scene"><canvas width="144" height="144" data-sprite="' +
          creature(battle.f) +
          '"></canvas></div><b id="battleText"></b><div class="battle-controls">' + combatHud(battle.hp, battle.hp, battle.enemyHp, battle.enemyHp,
            Game.bosses[Math.min(19, Math.floor((battle.f - 1) / 5))]) +
          '<div id="battleEnd" hidden>' +
          (battle.tr && battle.win && s.trial.choices.length
            ? rewardView(s)
            : (s.chests?.find(c => c.id === battle.chestId) ? chestButton(s.chests.find(c => c.id === battle.chestId)) : '<button class="primary" data-close>확인</button>')) +
          "</div></div>",
      ];
    }
    default:
      if (modal.startsWith("sell-")) {
        const k = modal.slice(5),
          g = s[k];
        return [
          "장비 판매",
          desc(Game.name(g, k) + " +" + g.level + " 장비와 별의 옵션을 팔고 새 장비를 받습니다.") +
            line("판매 금액", fmt(Game.saleValue(g)) + " G") +
            btn("sell", "판매하고 새 장비 받기", k, "primary", g.level < 1),
        ];
      }
      return ["", ""];
  }
}
function displayModal() {
  cancelForgePress();
  const selectedSale = el("saleItem")?.value;
  const [title, html, rarity] = modalData();
  document.body.dataset.storyMotion = motionEnabled() ? "on" : "off";
  el("shade").dataset.modal = modal;
  const bagItem = current() === "bag" && (modal.startsWith("inventory-") || modal.startsWith("outfit:item:"));
  el("shade").classList.toggle("bag-item-sheet", bagItem);
  el("shade").querySelector(".bag-sheet-close").hidden = !bagItem;
  const titleNode = el("modalTitle");
  titleNode.textContent = title;
  if (GearGradeView.emphasized(rarity)) titleNode.dataset.rarity = rarity.key;
  else delete titleNode.dataset.rarity;
  if (rarity) titleNode.setAttribute("aria-label", title + " · " + rarity.name);
  else titleNode.removeAttribute("aria-label");
  document.body.append(el("noticeSlot"));
  el("modalBody").innerHTML = html;
  for (const button of el("modalBody").querySelectorAll("[data-soul-act]"))
    button.soulQuote = soulQuote(state, JSON.parse(button.dataset.soulArg));
  bindOutfitQuotes(el("modalBody"));
  bindForgeRequests(el("modalBody"));
  if (el("saleItem")) {
    el("saleItem").value = selectedSale || "";
    if (el("saleItem").selectedIndex < 0) el("saleItem").value = "";
    updateSaleQuote(true);
  }
  el("shade").hidden = false;
  placeToast();
  document.body.style.overflow = "hidden";
  syncLesson();
  syncMusic();
}
function updateSaleQuote(reset) {
  const item = RelicShop.find(el("saleItem").value);
  const amount = el("saleCount"), sell = el("modalBody").querySelector('[data-act="resell"]');
  amount.disabled = !item;
  if (!item) {
    amount.value = "";
    el("saleQuote").textContent = "";
    sell.disabled = true;
    return;
  }
  const step = Number.isInteger(item.sell) ? 1 : 2;
  amount.min = amount.step = step;
  amount.max = RelicShop.owned(state, item);
  if (reset) amount.value = step;
  const count = amount.valueAsNumber;
  const valid = Number.isSafeInteger(count) && count >= step && count % step === 0 && count <= Number(amount.max);
  el("saleQuote").textContent = "개당 " + item.sell + " P" + (step === 2 ? " · 2개 단위 판매" : "") +
    (valid ? " · 받을 포인트 " + fmt(count * item.sell) + " P" : " · 판매 가능한 수량을 입력하세요.");
  sell.disabled = !valid;
}
function showModal(key, trigger = document.activeElement) {
  if (!ready || storageError) return;
  ForgeItemView.cancelSwipe();
  HuntLootView.open(state,key,modal);
  if (HuntWatch.active && !HuntLootView.isReader(key)) HuntWatch.stop('일시 중단');
  if (!modal) {
    lastFocus = trigger?.closest(".ui-utilities")?.querySelector("summary") || trigger;
  }
  if (key === "temper") {
    act("temperStart");
    return;
  }
  modal = key;
  displayModal();
  if (key === "forgeItem:filter") el("shade").scrollTop = 0;
  const focus = key === "confirmNewGame" ? el("modalBody").querySelector("[data-open=settings]") :
    el("shade").querySelector(key === "forgeItem:filter" ? "[data-forge-filter]" : "button");
  focus.focus({ preventScroll: true });
}
function closeModal(focus = true) {
  ForgeItemView.invalidate();
  const provisionDialog = modal === "huntWallet" || modal === "daily";
  modal = "";
  storyScene = null;
  battle = null;
  el("shade").hidden = true;
  clearLessonTarget(); // a located goal ends when its dialog closes; no leftover outline or description
  placeToast();
  document.body.style.overflow = "";
  syncLesson();
  syncMusic();
  if (provisionDialog) HuntWatch.refreshWallet();
  if (!focus) return;
  const key = lastFocus?.dataset.open;
  const targets = [
    lastFocus,
    lastFocus?.classList.contains("watch-start") && el("screen").querySelector(".watch-start"),
    lastFocus?.classList.contains("forge-strike") && el("screen").querySelector(".forge-strike"),
    key && el("screen").querySelector('[data-open="' + CSS.escape(key) + '"]'),
    lastFocus?.classList.contains("bag-slot") && el("screen").querySelector(".bag-slot"),
    key === "daily" && el("screen").querySelector('[data-act="fastTower"]'),
    el("pageNav").querySelector("[aria-current]"),
    el("mobileNav").querySelector("[aria-current]"),
  ];
  targets.find(node => node && node !== document.body && !node.disabled && node.getClientRects().length)
    ?.focus({ preventScroll: true });
}
function dismissModal() {
  Feedback.clear();
  GameSound.stop();
  if (modal === "confirmNewGame") showModal("settings");
  else if (modal === "storyScene") storyInput("close");
  else {
    closeModal();
    autoStory(); // the closed dialog was the only blocker; check once
  }
}
function back() {
  if (modal) {
    dismissModal();
    return true;
  }
  if (history.state?.fromAdventureMap && zones[current()]) {
    history.back();
    return true;
  }
  if (location.hash.includes("/")) {
    const [id, page, number] = location.hash.slice(1).split("/");
    nav(number ? phoneDestination(id, page) : id);
    return true;
  }
  if (current() !== "forge") {
    nav(zones[current()] && current() !== "forest" ? "world" : "forge");
    return true;
  }
  return false;
}
window.gameBack = back;
document.addEventListener("keydown", (e) => {
  cancelForgePress();
  if (storageError || !ready) return;
  if (!e.repeat) GameMusic.unlock();
  if (e.key === "Escape" && modal) {
    dismissModal();
    e.preventDefault();
  }
  if (e.key === "Tab" && modal) {
    const items = [...el("shade").querySelectorAll("button:not(:disabled),input,select")].filter(
      (n) => n.offsetWidth,
    );
    if (!items.length) return;
    if (e.shiftKey && document.activeElement === items[0]) {
      items.at(-1).focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
      items[0].focus();
      e.preventDefault();
    }
  }
});
// The forge button is replaced on each render. Capture a long press on its stable host.
// `forgePress` is the pending/striking loop; cancelForgePress() stops only the loop. A long press
// that struck keeps its identity in `heldForgePress` until the finger actually lifts (U4): the loop
// may stop on its own (success, gold exhausted) while the finger is still down, and autoStory()
// must stay blocked until that real release, which then runs exactly one check.
let forgePress = null, consumedForgePress = false, heldForgePress = null;
function cancelForgePress() {
  clearTimeout(forgePress?.timer);
  forgePress = null;
}
function releaseForgePress(event) {
  const held = heldForgePress;
  if (!held || (event && held.id !== event.pointerId)) return false;
  heldForgePress = null;
  return true;
}
function beginForgePress(event) {
  if (!event.isPrimary || event.button !== 0) return;
  cancelForgePress();
  releaseForgePress(); // a new primary press means any earlier one has already lifted
  consumedForgePress = false;
  const button = event.target.closest('button[data-act="enhance"]:enabled');
  if (!button || !ready || storageError || modal) return;
  const press = { id: event.pointerId, gear: button.dataset.arg, rect: button.getBoundingClientRect() };
  forgePress = press;
  const valid = () => forgePress === press && !document.hidden && !modal && !storageError &&
    !restarting && current() === "forge" && phonePage("forge") === "work" && gear === press.gear;
  async function strike() {
    // Check inside the save lock too. The player can release while another tab holds it.
    const again = await act("enhance", press.gear, undefined, () => valid() ? "enhance" : null);
    if (again && valid()) press.timer = setTimeout(strike, 920);
    else if (forgePress === press) cancelForgePress();
  }
  press.timer = setTimeout(() => {
    if (!valid()) return;
    try { el("screen").setPointerCapture(press.id); }
    catch { cancelForgePress(); return; } // the pointer already lifted; treat as a tap
    consumedForgePress = true;
    heldForgePress = { id: press.id };
    strike();
  }, 420);
}
document.addEventListener("pointermove", event => {
  if (forgePress?.id !== event.pointerId) return;
  const { left, right, top, bottom } = forgePress.rect;
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom)
    cancelForgePress();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  document.addEventListener(type, event => {
    if (type === "lostpointercapture" && event.target !== el("screen")) return;
    if (forgePress?.id === event.pointerId) cancelForgePress();
    // Releasing a held hammer is a safe point, checked once (up, cancel and lost capture all
    // arrive for one release). A short tap is followed by its own act() check.
    if (releaseForgePress(event)) autoStory();
  });
addEventListener("blur", () => {
  cancelForgePress();
  // Window focus lost: no pointerup may follow, so release the hold instead of leaving it stuck.
  if (releaseForgePress()) autoStory();
});
document.addEventListener("contextmenu", event => {
  if (forgePress || event.target.closest('[data-act="enhance"]')) event.preventDefault();
});
let cutPress = null;
document.addEventListener("pointerdown", (e) => {
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
  beginForgePress(e);
  const button = e.target.closest("[data-act=finalMove],[data-act=bladeFinalMove],[data-act=bladeArmorFinalMove]");
  const needle = el("finalNeedle");
  cutPress = button && needle ? { button, time: needle.frameAt || Date.now() } : null;
});
document.addEventListener("pointercancel", () => {
  cutPress = null;
});
document.addEventListener("click", (e) => {
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
  if (consumedForgePress && e.detail > 0 && (e.target === el("screen") || e.target.closest('[data-act="enhance"]'))) return;
  const press = cutPress;
  cutPress = null;
  if (e.target === el("shade")) {
    dismissModal();
    return;
  }
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.storage) return storageAction(d.storage);
  if (storageError || !ready) return;
  if ("duel" in d) {
    b.disabled = true;
    accrue();
    return flush().then(() => {
      b.disabled = false;
      if (!storageError && !restarting) location.assign("duel.html");
    });
  }
  if (d.repeat === "start") { startAutoHunt(Number(el("repeatRank")?.value)); return; }
  if (d.repeat === "stop") {
    repeatHunting.afterBattle();
    if (!repeatHunting.active) autoCombat.stop();
    render(); return;
  }
  if (d.huntMode) {
    if (d.huntMode === "auto") {
      const resultRank = state.chests.some(c => c.id === state.lastHunt?.chestId) ? state.lastHunt.rank : null;
      startAutoHunt(state.hunt?.rank || resultRank || repeatHunting.summary?.rank || state.lastHunt?.rank || Math.min(60, state.huntBest + 1));
    } else {
      repeatHunting.stop("수동 전환"); autoCombat.stop(); render();
    }
    return;
  }
  if ("newGame" in d) return startNewGame();
  if (d.story) return storyInput(d.story);
  if (d.lesson === "locate") return focusLesson();
  if (d.lesson === "auto") return locked(() => {
    if (modal !== "lessons") return;
    sync();
    state.apprentice.auto = state.apprentice.auto === false; // persisted; missing means on
    save();
    render();
    displayModal();
    el("modalBody").querySelector('[data-lesson="auto"]')?.focus({ preventScroll: true });
  });
  if ("archiveBlade" in d) { archiveBlade = true; forgeOutfitSlot = ""; gear = d.archiveBlade === "armor" ? "armor" : "weapon"; return nav("forge"); }
  if ("bladeTarget" in d) return act(d.bladeTarget, el("bladeTarget").value);
  if ("bladeHome" in d) { archiveBlade = false; ForgeItemView.selectSlot(state,d.bladeHome === "armor" ? "chest" : "weapon"); return nav("forge"); }
  if (d.forgeSlot) {
    const key = d.forgeSlot;
    if (key !== "weapon" && !Game.outfit.slots.some(slot => slot.key === key)) return;
    archiveBlade = false;
    ForgeItemView.selectSlot(state,key);
    closeModal(false);
    render();
    el("screen").querySelector('.forge-slot-switch [data-open]')?.focus({preventScroll:true});
    return;
  }
  if (d.forgeStep) {
    ForgeItemView.step(Number(d.forgeStep));
    el("screen").querySelector('[data-forge-step="' + d.forgeStep + '"]')?.focus({preventScroll:true});
    return;
  }
  if ("forgeReset" in d || d.forgeFilter) return ForgeItemView.filterChange(d.forgeFilter,d.filterValue);
  // Right after a hit that entered a risk level or reset the item, the hammer takes no tap.
  const hammer = b.closest("#screen") && (d.forgePreview === "risk" || d.forgeAction === "forgeItemEnhance");
  if (hammer && ForgeItemView.held()) return;
  if (d.forgePreview) return ForgeItemView.preview(d.forgePreview,b);
  if ("forgeRiskAck" in d) return locked(() => {
    // Only the notice's own button confirms it; closing the dialog any other way leaves it unread.
    if (modal !== "forgeItem:risk") return;
    sync();
    if (Game.perform(state, "forgeRiskAck").ok) { save(); ForgeItemView.hold("ack"); }
    closeModal(false);
    render();
    el("screen").querySelector(".forge-strike")?.focus({ preventScroll: true });
  });
  if (d.forgeItem) {
    // Leads from an item's detail to the forge with that item on the anvil.
    if (!ForgeItemView.selectItem(state,d.forgeItem)) return notify("이 장비는 보관함에 없습니다.");
    archiveBlade = false;
    closeModal(false);
    if (current() === "forge" && phonePage("forge") === "work") render();
    else nav("forge");
    el("screen").querySelector(".forge-strike")?.focus({ preventScroll: true });
    return;
  }
  if (d.forgeAction && b.forgeRequest) {
    b.disabled = true;
    return act(d.forgeAction,b.forgeRequest);
  }
  if (d.gear) {
    gear = d.gear;
    forgeOutfitSlot = "";
    if (d.go) archiveBlade = false;
    if (!archiveBlade) ForgeItemView.selectSlot(state,gear === "armor" ? "chest" : "weapon");
  }
  if (d.lootForge) {
    if (restarting || current() !== "forest" || !HuntLootView.select(state,d.lootForge,modal)) {
      notify("이 장비는 보관함에 없습니다.");
      return;
    }
    HuntWatch.stop('',false);
    archiveBlade = false;
    return nav("forge");
  }
  if (d.go) return nav(d.go);
  if (d.open) return showModal(d.open, b);
  if ("close" in d) return dismissModal();
  if (d.soulAct) {
    b.disabled = true;
    return act(d.soulAct, JSON.parse(d.soulArg), undefined, undefined, undefined, b.soulQuote);
  }
  if (d.act) {
    if (d.act.startsWith("outfit")) {
      b.disabled = true;
      return act(d.act, d.arg, undefined, undefined, undefined, undefined, b.outfitQuote);
    }
    if (modal.startsWith("inventory-")) {
      // A stored slot can change index as soon as one action commits.
      if (el("modalBody").getAttribute("aria-busy") === "true") return;
      el("modalBody").setAttribute("aria-busy", "true");
      return act(d.act, d.arg).finally(() => el("modalBody").removeAttribute("aria-busy"));
    }
    if (d.act === "journeyBulk") {
      return act(d.act, { type: d.arg, level: Number(d.level), bulk: Number(d.bulk), bulkCost: Number(d.bulkCost), bulkSuccess: Number(d.bulkSuccess) });
    }
    if (d.act === "craftHuntLining") {
      if (performance.now() - lastLiningPress < 450 || !state._save) return;
      lastLiningPress = performance.now();
      b.disabled = true;
      return act(d.act, { generation: state._save.generation, revision: state._save.revision,
        expectedLevel: Number(d.level) });
    }
    if (d.act === "resell") {
      b.disabled = true;
      return act("resell", { id: el("saleItem").value, count: el("saleCount").valueAsNumber });
    }
    if (d.act === "autoMine") return act("autoMine", el("autoTankCount").value);
    if (d.act === "reward" && modal === "battle") closeModal(false);
    if (d.act === "rebirth" && el("inheritChoice"))
      return act("rebirth", el("inheritChoice").value);
    return act(
      d.act,
      d.act === "guild" ? el("guildName").value : d.arg,
      press?.button === b && e.detail > 0 ? press.time : undefined,
    );
  }
  if (d.tower) towerMode = d.tower;
  if (d.motionPolicy) {
    HuntWatch.stop('',false);
    prefs.motionOverride=d.motionPolicy==='full';
    if(prefs.motionOverride)prefs.motion=true;
    syncMotion();
    try {localStorage.setItem(settingsKey,JSON.stringify(prefs));}catch{}
    render();if(modal)displayModal();return;
  }
  if (d.pref) {
    prefs[d.pref] = !prefs[d.pref];
    if (d.pref === "music") { syncMusic(); if (prefs.music) GameMusic.unlock(); }
    if (d.pref === "motion") syncMotion();
    if (d.pref === "sound") { if (prefs.sound) sound("coins"); else GameSound.stop(); }
    try {
      localStorage.setItem(settingsKey, JSON.stringify(prefs));
    } catch {}
    displayModal();
    el("modalBody").querySelector('[data-pref="' + d.pref + '"]').focus({ preventScroll: true });
    return;
  }
  render();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "saleItem") updateSaleQuote(true);
  if (e.target.id === "lootRank") { modal = "bladeLoot-"+Number(e.target.value); displayModal(); el("lootRank").focus(); }
  if (e.target.id === "repeatRank") {
    huntPreviewRank = Number(e.target.value);
    render(); el("repeatRank")?.focus({ preventScroll:true });
    return;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "saleCount") return updateSaleQuote(false);
  if (e.target.id !== "musicVolume") return;
  prefs.musicVolume = Number(e.target.value) / 100;
  syncMusic();
  GameMusic.unlock();
  try { localStorage.setItem(settingsKey, JSON.stringify(prefs)); } catch {}
});
addEventListener("hashchange", () => {
  cancelForgePress();
  Impacts.clear();
  Feedback.clear();
  GameSound.stop();
  // A route change never closes an open story; a deferred locate runs when it closes.
  if (modal !== "storyScene") closeModal(false);
  releaseStoryHold();
  render();
  el("screen").scrollTop = 0;
  document.querySelector("main").scrollTop = 0;
  scrollTo(0, 0);
  if (pendingLessonFocus) {
    pendingLessonFocus = false;
    focusLesson();
  }
});
addEventListener("storage", (e) => {
  if ((e.key === store.currentKey || e.key === null) && ready && !storageError) {
    HuntWatch.stop('일시 중단');
    repeatHunting.stop("저장 충돌");
    autoCombat.stop();
    renderHuntMode();
    locked(() => {}); // The queued baseline check also covers resets and storage.clear().
  }
});
let tickTime = Date.now(),
  active = 0;
function accrue() {
  if (!ready || storageError) { tickTime = Date.now(); return; }
  const now = Date.now();
  active += Math.max(0, Math.min(5000, now - tickTime));
  tickTime = now;
}
function flush() {
  if (!ready || storageError) return;
  const ms = active;
  active = 0;
  return locked(() => {
    sync();
    state.activeMs += ms;
    state.points += Math.floor(state.activeMs / 60000);
    state.activeMs %= 60000;
    save();
    el("gold").textContent = brief(state.gold);
    const wallet = Game.huntingStatus(state);
    el("huntTickets").textContent = brief(wallet.free + wallet.purchased);
  });
}
document.addEventListener("visibilitychange", () => {
  document.body.dataset.visibility = document.hidden ? "hidden" : "visible";
  syncMusic();
  if (document.hidden) {
    ForgeItemView.cancelSwipe();
    cancelForgePress();
    repeatHunting.stop("화면 숨김");
    autoCombat.stop();
    renderHuntMode();
    Feedback.clear();
    Impacts.clear();
    GameSound.stop();
    accrue();
    flush();
  }
  tickTime = Date.now();
});
addEventListener("pagehide", () => {
  cancelForgePress();
  repeatHunting.stop("페이지 종료");
  autoCombat.stop();
  renderHuntMode();
  GameMusic.update("forge", { hidden: true });
});
addEventListener("pageshow", () => syncMusic());
setInterval(() => {
  if (document.hidden || !ready || storageError) return;
  accrue();
  syncLesson(); // hunt watch and repeat hunting can start or stop without a full render
  const wallet = Game.huntingStatus(state);
  el("huntTickets").textContent = brief(wallet.free + wallet.purchased);
  const autoStart = document.querySelector('[data-repeat="start"]');
  HuntWatch.refreshWallet();
  if (autoStart) autoStart.disabled = wallet.free + wallet.purchased < 1;
  for (const button of document.querySelectorAll('[data-act="huntStart"]'))
    button.disabled = wallet.free + wallet.purchased < 1;
  const walletSummary = document.querySelector('[data-wallet-summary]');
  if (walletSummary) walletSummary.textContent = huntingWalletSummary(wallet);
  if (el("huntingWallet")) {
    const w = Game.huntingStatus(state);
    if (el("huntingWallet").firstElementChild?.dataset.huntingStatus !== huntingWalletKey(state, w))
      el("huntingWallet").innerHTML = huntingWalletContent(state);
    else el("huntingWallet").querySelector("[data-hunting-recharge]").textContent = huntingRechargeText(w);
  }
  if (modal === "daily" && document.querySelector("[data-attendance-day]")?.dataset.attendanceDay !== Game.day(Date.now())) displayModal();
  if (current() === "tower" && !state.tickets && dailyAvailable(state) &&
      el("screen").querySelector('[data-act="fastTower"]:disabled')) render();
  if (state.autoMine) {
    locked(() => {
      const settled = sync();
      if (settled) {
        save();
        if (current() === "mine" || current() === "bag") render();
        if (modal.startsWith("inventory-")) displayModal();
        if (modal === "miningResult") displayModal();
      }
      const job = state.autoMine;
      if (job && el("autoRemaining")) {
        el("autoRemaining").textContent = miningTime(job.started + job.limit * job.tankMs - Date.now()) + " 남음";
        el("tankRemaining").textContent = miningTime(job.started + (job.completed + 1) * job.tankMs - Date.now()) + " 남음";
      }
    });
  } else locked(() => { sync(); });
  if (state.towerRun) locked(() => {
    sync();
    const result = Game.perform(state, "fastTowerStep");
    if (!result.ok) return;
    save();
    if (current() === "tower") {
      render();
      if (!state.towerRun && !modal) showModal("towerRun");
    }
    if (current() === "bag") render();
    if (modal === "towerRun") displayModal();
  });
  if (active >= 15000) flush();
  if (el("yield")) el("yield").textContent = brief(state.unclaimed);
  for (const balance of document.querySelectorAll("[data-field-balance]"))
    balance.textContent = fmt(state.unclaimed);
  const supply = document.querySelector("[data-act=routeSupply]"),
    escort = document.querySelector("[data-act=hireEscort]");
  if (supply) supply.disabled = !Game.routeTask(state)?.canSupply;
  if (escort) escort.disabled = !Game.techniqueAvailable(state, "land");
  const delivery = document.querySelector("#modalBody [data-arg$=':deliver']");
  const finishing = modal === "bladeArmorFinal" ? Game.blades.currentArmor(state) : modal === "bladeFinal" ? Game.blades.current(state) : state.weapon;
  if (["final","bladeFinal","bladeArmorFinal"].includes(modal) && delivery && finishing.finalTrial?.key === "yield")
    delivery.disabled = !Breakthrough.canDeliver(
      state,
      Breakthrough.invoice(finishing, Game.price),
    );
}, 1000);
function animate(now) {
  if (!document.hidden && ready && !storageError) {
    const needle = el("finalNeedle");
    const working = ["bladeArmorFinal","bladeArmorWork"].includes(modal) ? Game.blades.currentArmor(state) : ["bladeFinal","bladeWork"].includes(modal) ? Game.blades.current(state) : state.weapon;
    if (["final","bladeFinal","bladeArmorFinal"].includes(modal) && working.finalTrial?.key === "edge" && needle) {
      needle.frameAt = Date.now();
      needle.style.left =
        Breakthrough.position(working.finalTrial, needle.frameAt) * 100 + "%";
    }
    if (
      ["craft","bladeWork","bladeArmorWork"].includes(modal) &&
      el("bathNeedle") &&
      working.work?.index === 2 &&
      !working.work.ready
    )
      el("bathNeedle").style.left = Swordcraft.needle(working.work, Date.now()) * 100 + "%";
    for (const canvas of document.querySelectorAll("canvas[data-sprite]")) {
      const id = canvas.dataset.sprite,
        im = images[id];
      if (!im?.naturalWidth) continue;
      const equipment = id.startsWith("blade") || id === "cuirass",
        actor = canvas.closest('.watch-actor'),
        delta = now - (actor ? Number(actor.dataset.attackAt ?? -1e6) : animationStart);
      let index = 0;
      if (motionEnabled()) {
        if (equipment)
          index =
            delta >= 0 && delta < 480 ? 6 + Math.floor(delta / 80) : Math.floor(now / 160) % 6;
        else if (id === "boar" && (actor ? delta : now - huntStart) < 360)
          index = 4 + (Math.floor((actor ? delta : now - huntStart) / 90) % 4);
        else if (
          id === "sentinel" &&
          ["craft","bladeWork","bladeArmorWork"].includes(modal) &&
          delta >= 0 &&
          delta < 360 &&
          canvas.closest(".craft-scene")
        )
          index = 4 + Math.floor(delta / 90);
        else if (
          modal === "battle" &&
          battle &&
          canvas.closest(".modal-scene") &&
          el("battleEnd")?.hidden
        )
          index = 4 + (Math.floor((now - battle.start) / 90) % 4);
        else index = Math.floor(now / 180) % 4;
      }
      if (canvas.dataset.frame === String(index)) continue;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, 144);
      ctx.drawImage(im, index * canvas.width, 0, canvas.width, 144, 0, 0, canvas.width, 144);
      canvas.dataset.frame = index;
    }
    if (modal === "temper" && el("needle"))
      el("needle").style.left =
        Game.temperPosition(Math.max(0, Date.now() - state.temperStart)) * 100 + "%";
    if (modal === "battle" && battle) drawTowerBattle(battle, now, motionEnabled());
  }
  requestAnimationFrame(animate);
}
window.addEventListener("emberforge-rules-updated", () => {
  if (!ready || storageError) return;
  render();
  if (["daily", "huntWallet", "risk", "shop", "shopSell"].includes(modal)) displayModal();
});
el("brandIcon").innerHTML = icon("anvil");
el("coinIcon").innerHTML = icon("coins");
locked(() => {
  state = readState();
  if (!state) { state = Game.freshJourney(); save(); }
  else if (store.needsMigration) save();
  resumeSaved();
}, true);
requestAnimationFrame(animate);
