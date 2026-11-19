"use strict";
const saveKey = SaveStore.keys.current,
  settingsKey = "emberforge.preferences.v1";
const store = SaveStore.create(() => localStorage);
const saveLock = SaveStore.createLock({ get locks() { return navigator.locks; }, get indexedDB() { return window.indexedDB; } });
let state = null, storageError = null, ready = false;
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
let gear = "weapon",
  towerMode = "infinite",
  bagTab = "gear",
  modal = "",
  battle = null;
let huntStart = -1000,
  animationStart = -1000,
  lastFocus = null;
const allRoutes = ["forge", "world", "bag", "growth", ...Object.keys(zones)];
const current = () => {
  const id = location.hash.slice(1).split("/")[0];
  return allRoutes.includes(id) ? id : "forge";
};
const images = {};
for (const id of [
  "blade",
  "blade1",
  "blade2",
  "blade3",
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
  autoStory();
}
function storageAction(action) {
  if (action === "reload") {
    if (!store.pending || confirm("이 탭의 미저장 진행을 포기하고 기기의 최신 저장을 읽을까요?")) location.reload();
    return;
  }
  if (action === "reset") return;
  if (action === "recover" && !confirm("표시된 직전 정상본으로 복구할까요? 로컬 사냥권도 그때의 잔량으로 돌아갑니다. 현재 원본도 별도로 보존합니다.")) return;
  return locked(() => {
    if (!storageError) return; // Ignore already queued recovery/retry double-clicks.
    if (action === "recover") state = store.recover();
    else if (store.pending) save();
    else { state = readState(); if (!state) { state = Game.fresh(); save(); } else if (store.needsMigration) save(); }
    resumeSaved();
  }, true);
}
const toast = el("toast");
let toastTimer = 0, toastDrag = null;

function scheduleToastDismissal() {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("on"), 4500);
}
function resetToastDrag() {
  if (!toastDrag) return;
  const { id } = toastDrag;
  toastDrag = null;
  if (toast.hasPointerCapture(id)) toast.releasePointerCapture(id);
  toast.classList.remove("dragging");
  toast.style.removeProperty("--toast-drag-y");
}
toast.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0 || toastDrag || !toast.classList.contains("on")) return;
  clearTimeout(toastTimer);
  toastDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  toast.setPointerCapture(event.pointerId);
  toast.classList.add("dragging");
});
function trackToastDrag(event) {
  if (event.pointerId !== toastDrag?.id) return;
  const rise = toastDrag.y - event.clientY;
  const tracking = event.type === "pointermove" || event.type === "pointerup";
  const dismiss = tracking && rise >= 28 && rise > Math.abs(event.clientX - toastDrag.x);
  if (!dismiss && event.type === "pointermove") {
    toast.style.setProperty("--toast-drag-y", -Math.max(0, rise) + "px");
    return;
  }
  resetToastDrag();
  if (dismiss) toast.classList.remove("on");
  else scheduleToastDismissal();
}
for (const type of ["pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
  toast.addEventListener(type, trackToastDrag);
}
function notify(msg, kind = "info") {
  if (HuntWatch.active && current() === 'forest' && !modal) return;
  if (!msg) return;
  resetToastDrag();
  const titles = { "forge-success": "강화 성공", "forge-hold": "강화 유지",
    "forge-drop": "강화 하락", "forge-destroy": "장비 파괴", loss: "주의", win: "획득 · 완료" };
  el("noticeTitle").textContent = titles[kind] || "알림";
  el("noticeMessage").textContent = msg;
  toast.className = "on " + kind;
  scheduleToastDismissal();
}
function sound(kind, delay = 0) {
  if (prefs.sound && !document.hidden) GameSound.play(kind, delay);
}
function syncMusic() {
  if (!state) return;
  const route = current();
  GameMusic.update(GameMusic.resolve({ route, modal, story: storyScene, state, page: phonePage(route), towerMode }),
    { enabled: prefs.music, volume: prefs.musicVolume, hidden: document.hidden });
}
function act(action, arg = "", pressedAt, automaticGuard, repeatGuard) {
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
  return locked(() => {
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
    if (repeatGuard) {
      const next = repeatGuard();
      if (!next) { render(); return; }
      action = next.action; arg = next.arg;
    }
    Feedback.clear();
    GameSound.stop();
    const goldBefore = state.gold;
    const breaksBefore = state.breaks;
    const gearBefore = state[arg === "armor" ? "armor" : "weapon"].level;
    const sparring = action === "craftMove" && state.weapon.work?.index === 1;
    const finalKey = action === "finalMove" && state.weapon.finalTrial?.key;
    const strong = sparring && Swordcraft.heavy(state.weapon.work);
    const beforeHunt = state.hunt;
    const beforeHuntHealth = state.hunt && {...state.hunt};
    const result = Game.perform(state, action, arg, undefined, undefined, pressedAt);
    if (!result.ok && (action === "openChest" || action === "craftHuntLining")) {
      if (repeatGuard && repeatHunting.active) repeatHunting.stop("보물 수령 실패");
      notify(result.message, "loss");
      render();
      return;
    }
    repeatHunting.stage(action, result, beforeHunt, arg);
    save();
    HuntWatch.stageOutcome(beforeHuntHealth);
    if (repeatGuard) {
      if (!result.ok) repeatHunting.stop(action === "openChest" ? "보물 수령 실패" : "입장 불가");
      else if (action === "huntStart" && repeatHunting.active) autoCombat.select("auto");
    }
    // A completed/retreated battle must clear intent before rendering the result.
    autoCombat.refresh(false);
    if (result.ok && action === "craftMove") animationStart = performance.now();
    if (result.impact) huntStart = performance.now();
    const forgeAction = [
      "enhance",
      "focusEnhance",
      "restorePeak",
      "recoverEdge",
      "reforge",
      "craftFinish",
      "craftInherit",
      "routeFinish",
      "routeSupply",
      "doubleStrike",
      "breathForge",
      "temper",
    ].includes(action);
    const forgeOutcome = result.ok && forgeAction ? Feedback.forgeOutcome(
      gearBefore, state[arg === "armor" ? "armor" : "weapon"].level,
      state.breaks > breaksBefore, result.kind,
    ) : null;
    const retryOutcome = heldEnhance && (forgeOutcome === "hold" || forgeOutcome === "drop");
    const shortOfGold = retryOutcome && state.gold < Game.enhancementCost(state, state[arg]);
    const repeatStrike = retryOutcome && !shortOfGold;
    if (result.ok && forgeAction) {
      animationStart = performance.now();
      navigator.vibrate?.(result.kind === "win" ? 18 : 36);
    }
    if (result.ok && action === "temperStart") modal = "temper";
    if (result.ok && action === "craftStart") modal = "craft";
    if (!repeatGuard && result.ok && ["openChest", "openTowerChests"].includes(action)) modal = "treasure";
    if (result.ok && action === "stopTower") modal = "towerRun";
    if (result.ok && ["craftFinish", "autoMine"].includes(action)) modal = "";
    if (result.ok && action === "finalStart") modal = "final";
    if (result.ok && finalKey && !state.weapon.finalTrial) modal = "";
    if (
      action === "temper" ||
      (["sell", "rebirth", "restart", "guild", "fuse", "raid"].includes(action) && result.ok)
    )
      modal = "";
    if (result.battle) {
      battle = { ...result.battle, start: performance.now(), message: result.message };
      modal = "battle";
    }
    render();
    if (modal) displayModal();
    else closeModal(false);
    const stagedHit = result.impact && beforeHuntHealth && HuntEffects.play(result.impact, beforeHuntHealth,
      beforeHuntHealth.diceVersion === 1 ? (state.hunt?.lastDice || state.lastHunt?.lastDice) : null);
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
          modal === "final" ? document.querySelector("#modalBody .final-scene") : stage,
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
    if (!repeatGuard && action !== "temperStart" && !(result.ok && ["openChest", "openTowerChests"].includes(action)) && !result.battle && !result.impact && result.message)
      notify(result.message + (shortOfGold ? " · 골드 부족으로 연속 강화 종료" : ""), forgeOutcome ? "forge-" + forgeOutcome : result.ok ? result.kind : "loss");
    if (result.ok && action !== "temperStart") {
      const stage = document.querySelector("#screen .scene");
      const chest = ["openChest", "openTowerChests"].includes(action);
      const reward = ["collect", "daily", "order", "sell", "market", "reward"].includes(action);
      const ascension = (["rebirth", "imprint", "fuse", "polish"].includes(action) || (action === "shop" && Number(arg) === 3) || (action === "finalMove" && state.weapon.level === 20)) && result.kind === "win";
      const animate = motionEnabled();
      if (forgeAction) {
        const level = state[arg === "armor" ? "armor" : "weapon"].level;
        const label = action === "temper" ? (state.heat === 5 ? "정밀 타격" : "담금질 완료") :
          state.breaks > breaksBefore ? "장비 파괴" : level > gearBefore ? "+" + level + " 강화 성공" : level < gearBefore ? "+" + level + " · 하락" :
          result.kind === "win" ? "단조 완료" : "+" + level + " · 유지";
        if (animate) Feedback.play("forge", stage, label, forgeOutcome, repeatStrike);
        sound(repeatStrike && forgeOutcome === "hold" ? "forge-repeat-hold" : "forge-" + forgeOutcome, animate ? Feedback.strikeMs / 1000 : 0);
      } else if (chest) {
        if (animate) Feedback.play("chest", document.querySelector(".chest-reveal .chest-art"), "+" + fmt(state.lastChest.gold) + " G");
        sound("chest", animate ? Feedback.chestMs / 1000 : 0);
      } else if (reward) {
        if (animate) Feedback.play("coins", modal ? el("modalBody") : stage, state.gold > goldBefore ? "+" + fmt(state.gold - goldBefore) + " G" : "보상 획득");
        sound("coins");
      } else if (ascension) {
        if (animate) Feedback.play("ascend", modal ? el("modalBody") : stage, action === "rebirth" ? "환생 완료" : "성장 완료");
        sound("ascend");
      } else if (!stagedHit) sound(result.impact?.kind || (sparring ? (arg === "parry" ? "parry" : "slash") : action === "mine" ? "mine" : result.kind));
    }
    if (result.ok && CharcoalStory.unlocked(state, "home")) autoStory();
    autoCombat.refresh();
    repeatHunting.refresh();
    return repeatStrike;
  });
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
    render();
    document.querySelector("main").scrollTop = 0;
    scrollTo(0, 0);
  } else location.hash = id;
}
function render() {
  if (!state) return;
  HuntEffects.cancel();
  HuntWatch.beforeRender();
  const gridScroll = document.querySelector('.ui-gear-grid')?.scrollTop;
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
        icon(ic) +
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
      : zones[id]
        ? go("world", icon("arrow-left") + "모험 지도", "ghost")
        : openBtn("daily", icon("gift") + "출석 보상", "ghost")) +
    "</div></div>";
  let view;
  if (id === "forge") view = GameUI.forge(state, forgeView(state));
  else if (id === "bag") view = GameUI.bag(state, bagView(state));
  else if (id === "growth") view = growthView(state);
  else if (id === "forest" && phonePage(id) === "hunt") view = HuntWatch.view(state);
  else if (zones[id]) view = zoneView(state, id);
  else if (phonePage(id) === "board")
    view = card("대장간 게시판",
      row("오늘의 보급품", "하루 한 번 골드와 입장권, 가호 지급", openBtn("daily", "보상 확인", "mini")) +
      row("포인트 상점", "플레이 1분마다 1 P 적립", openBtn("shop", "상점 열기", "mini"))
    ) + orderView(state);
  else
    view =
      adventureMap(state) +
      (phonePage(id) === "map" ? metrics(
        metric("최고 토벌", state.huntBest ? state.huntBest + "구역" : "첫 도전"),
        metric("탑 입장권", fmt(state.tickets) + "장"),
        metric("배치한 검", state.field.length + "자루"),
      ) : section("대장간 게시판") +
      '<div class="baggrid">' +
      card(
        "오늘의 보급품",
        desc("하루 한 번 골드와 입장권, 가호를 받습니다.") + openBtn("daily", "출석 보상 확인"),
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
  screen.innerHTML = view;
  renderLesson();
  GameUI.shell();
  const grid = document.querySelector('.ui-gear-grid');
  if (grid && gridScroll !== undefined) grid.scrollTop = gridScroll;
  syncMusic();
}
function renderLesson() {
  const host = el("apprentice");
  host.hidden = !state.apprentice.visible;
  if (host.hidden) return;
  const step = Apprentice.next(state);
  const tip = step >= 0 ? Apprentice.guidance(state, step) : null;
  const title = step < 0 ? "수업 완료" : Apprentice.lessons[step][1];
  const target = tip && current() === tip.route ? el("screen").querySelector(tip.selector) : null;
  const progress = step < 0 ? Apprentice.lessons.length : step + 1;
  host.innerHTML = '<button class="lesson-copy" data-lesson="menu" aria-labelledby="lesson-title" aria-describedby="lesson-action-hint">' +
    '<strong id="lesson-title">' + icon("circle-help") + ' 튜토리얼 ' + progress + '/' + Apprentice.lessons.length + ' · ' + title + '</strong>' +
    '<span id="lesson-action-hint">' + (tip ? tip.text : "첫 사냥터를 운영했습니다. 이제 새 검을 벼리거나 탑에 도전해 보세요.") +
    '</span></button>';
  if (target) {
    target.classList.add("lesson-target");
    target.setAttribute("aria-describedby", "lesson-action-hint");
  }
}
function lessonButton(action, label) {
  return '<button class="mini" data-lesson="' + action + '">' + label + "</button>";
}
let pendingLessonFocus = false;
function focusLesson() {
  closeModal(false);
  const n = Apprentice.next(state);
  if (n < 0) return;
  const tip = Apprentice.guidance(state, n);
  GameUI.prepareLesson(tip);
  if (tip.route === "bag") bagTab = "gear";
  if (tip.route === "forge") gear = "weapon";
  const destination = phoneLessonDestination(tip);
  if ((location.hash.slice(1) || "forge") !== destination) {
    pendingLessonFocus = true;
    nav(destination);
    return;
  }
  render();
  const target = el("screen").querySelector(tip.selector);
  target?.scrollIntoView({ block: "center" });
  target?.focus({ preventScroll: true });
}
function lessonMenu() {
  const done = Apprentice.completed(state);
  const notes = [
    "무기 탭에서 강화하기를 누르면 공격력이 오릅니다.",
    "사냥을 누르고 전투를 지켜보세요. 승리 보상 수령 후 다음 스테이지로 진행합니다.",
    "모루를 초록 구간에서 두드리면 다음 강화에 +5%p가 붙습니다.",
    "최고 강화 +3, +7, +13에서 대장간 의뢰 보상을 챙기세요.",
    "+13 이상 무기를 보관함에 넣은 뒤 배치하세요.",
    "사냥터에서 모인 골드를 수령하세요. 회수한 검은 보관함에 있습니다.",
  ];
  return [
    "대장장이 수업 · 튜토리얼",
    Apprentice.lessons
      .map((lesson, i) => row(lesson[1], notes[i], done[i] ? icon("check") : ""))
      .join("") +
      (done.every(Boolean) ? "" : lessonButton("locate", "다음 단계로 이동")) +
      (state.apprentice.visible
        ? lessonButton("hide", "수업 안내 숨기기")
        : lessonButton("show", done.every(Boolean) ? "완료 기록 보기" : "이어서 배우기")),
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
function modalData() {
  const s = state;
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
        desc("층을 돌파할 때 상자 한 개를 얻습니다. 표시된 범위의 골드와 추가 아이템은 개봉할 때 지급됩니다.")];
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
          section("최근 활동") +
          (s.log
            .map(
              (l) =>
                '<div class="checkline"><time>' +
                new Date(l.time).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                }) +
                "</time>" +
                l.message +
                "</div>",
            )
            .join("") || desc("첫 강화부터 여기에 기록됩니다.")),
      ];
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
            !prefs.motion ? "게임 설정에서 움직임을 껐습니다" : !motionEnabled() ? "PC의 동작 줄이기 설정으로 정지 중입니다" : "주사위·공격·피격 연출이 켜져 있습니다",
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
    case "confirmNewGame":
      return [
        "처음부터 시작할까요?",
        desc("장비, 골드, 숲결 섬유, 숲 방호 안감, 환생과 이야기 기록을 초기화하고 첫 장면부터 시작합니다. 사냥권 잔량·충전 시간·출석 수령 기록은 유지되며 최초 30개를 다시 지급하지 않습니다. 현재 원본을 별도로 보존한 뒤 새 진행 저장이 성공해야 시작합니다.") +
          '<div class="actions">' + openBtn("settings", "취소") +
          '<button class="action danger" data-new-game>진행을 지우고 시작</button></div>',
      ];
    case "lessons":
      return lessonMenu();
    case "help":
      return [
        "플레이 안내",
        '<div class="stack">' +
          desc(
            "① 대장간에서 무기와 방어구를 강화하세요. 담금질과 의뢰 보상으로 초반 골드를 마련할 수 있습니다.",
          ) +
          desc("② 무기 +13을 보관함에 넣고 사냥터에 배치하면 접속을 종료해도 골드가 쌓입니다.") +
          desc(
            "③ 무기 +19 또는 레어 이상 무기로 심해 광산에 입장하세요. 20강부터는 환생하여 영구 각인을 새길 수 있습니다.",
          ) +
          desc("④ 도전의 탑에서는 무기의 공격력과 방어구의 체력이 모두 적용됩니다.") +
          "</div>",
      ];
    case "daily":
      return [
        "오늘의 출석 보상",
        '<p class="desc" data-attendance-day="' + Game.day(Date.now()) + '">오늘 ' + Game.day(Date.now()) + " · 한국 시간(KST) 자정 갱신 · 로컬 기기 시각 기준</p>" +
          row("무료 사냥권 +10", "30개를 넘어 보유 가능 · 상한 이상이면 자연 충전 대기", icon("gift")) +
          row("1,000,000 G", "무한의 탑 입장권 5장 · 산소통 1개", icon("gift")) +
          row("가호 보급", "정령과 대장장이 가호 각 3개", icon("shield")) +
          btn(
            "daily",
            s.day >= Game.day(Date.now()) || s.hunting.daily >= Game.day(Date.now()) ? "오늘 수령 완료" : "보급품 받기",
            "",
            "primary",
            s.day >= Game.day(Date.now()) || s.hunting.daily >= Game.day(Date.now()),
          ),
      ];
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
        line("자동 하강", "50 m마다 " + Game.mining.stepMs / 1000 + "초") +
        line("산소통 한 개", miningTime(tankMs) + " · 피버 +1") +
        '<label for="autoTankCount">사용할 산소통 (1~' + max + '개)</label>' +
        '<input id="autoTankCount" type="number" inputmode="numeric" min="1" max="' + max + '" step="1" value="' + Math.min(10, max) + '">' +
        desc("예약한 산소통을 먼저 맡깁니다. 중단하면 현재 산소통까지 마치고, 아직 사용하지 않은 예약분은 돌려받습니다.") +
        desc("피버 100을 모은 뒤 직접 탐사를 시작하면 그 산소통의 드롭 보상이 10배가 됩니다.") +
        btn("autoMine", "자동 탐사 시작", "", "primary", !max || !Game.canDive(s.weapon) || !!s.dive || !!s.autoMine)];
    }
    case "miningResult":
      return ["자동 탐사 정산", miningResult(s)];
    case "rebirth":
      return [
        "환생 의식",
        desc("장착한 무기와 방어구가 일반 +0으로 돌아갑니다. 보관함과 사냥터는 유지됩니다.") +
          line(
            "획득 영혼 포인트",
            s.weapon.level === 20 ? [20, 60, 200, 600][s.weapon.grade] + " P" : "20강 무기 필요",
          ) +
          (s.weapon.finishMethod
            ? line("마지막 돌파", Breakthrough.methods[s.weapon.finishMethod].name)
            : "") +
          inheritancePicker(s) +
          btn("rebirth", "장착 장비를 바치고 환생", "", "primary", s.weapon.level !== 20),
      ];
    case "fusion": {
      const i = Math.max(0, Math.min(4, s.weapon.level - 20));
      return [
        "초월 합성",
        desc(
          "같은 단계 전설 무기 두 자루가 필요합니다. 실패 시 15% 확률로 보관함의 보조 무기가 파괴됩니다.",
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
            line("레이드 공격력", fmt(Game.stats(s, false, true).attack)) +
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
      return ["사냥권 · 충전", '<section id="huntingWallet">' + huntingWalletContent(s) + '</section>' + openBtn("daily", "출석 보상 확인")];
    case "huntRules":
      return ["주사위 사냥", line("1~3 공격 · 4~5 방어 · 6 강공", "양쪽이 매 턴 굴립니다") +
        desc("강공은 공격력의 1.7배, 방어는 받는 피해를 75% 줄입니다. 먼저 쓰러뜨린 적은 반격하지 못합니다. 40턴 안에 쓰러뜨리지 못하면 패배합니다.") +
        desc("사냥권 1장으로 한 무리를 연달아 상대합니다. 다섯 번째 스테이지마다 우두머리가 기다립니다. 황금 고블린이 나타나면 두 턴 안에 잡아 보세요. 클리어 상자에 기본 골드의 50%가 추가됩니다. 중단한 전투는 이어서 할 수 있습니다.")];
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
            line("판매 금액", fmt(300 + Math.round(Game.price(g) * (1 + g.level) * 1.6)) + " G") +
            btn("sell", "판매하고 새 장비 받기", k, "primary", g.level < 1),
        ];
      }
      return ["", ""];
  }
}
function displayModal() {
  cancelForgePress();
  const selectedSale = el("saleItem")?.value;
  const [title, html] = modalData();
  document.body.dataset.storyMotion = motionEnabled() ? "on" : "off";
  el("shade").dataset.modal = modal;
  el("modalTitle").textContent = title;
  el("modalBody").innerHTML = html;
  if (el("saleItem")) {
    el("saleItem").value = selectedSale || "";
    if (el("saleItem").selectedIndex < 0) el("saleItem").value = "";
    updateSaleQuote(true);
  }
  el("shade").hidden = false;
  document.body.style.overflow = "hidden";
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
  const step = item.sell === 0.5 ? 2 : 1;
  amount.min = amount.step = step;
  amount.max = RelicShop.owned(state, item);
  if (reset) amount.value = step;
  const count = amount.valueAsNumber;
  const valid = Number.isSafeInteger(count) && count >= step && count % step === 0 && count <= Number(amount.max);
  el("saleQuote").textContent = "개당 " + item.sell + " P" + (step === 2 ? " · 2개 단위 판매" : "") +
    (valid ? " · 받을 포인트 " + fmt(count * item.sell) + " P" : " · 판매 가능한 수량을 입력하세요.");
  sell.disabled = !valid;
}
function showModal(key) {
  if (HuntWatch.active) HuntWatch.stop('일시 중단');
  if (!ready || storageError) return;
  if (!modal) lastFocus = document.activeElement;
  if (key === "temper") {
    act("temperStart");
    return;
  }
  modal = key;
  displayModal();
  const focus = key === "confirmNewGame" ? el("modalBody").querySelector("[data-open=settings]") :
    el("shade").querySelector("button");
  focus.focus({ preventScroll: true });
}
function closeModal(focus = true) {
  modal = "";
  storyScene = null;
  battle = null;
  el("shade").hidden = true;
  document.body.style.overflow = "";
  syncMusic();
  if (focus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}
function dismissModal() {
  Feedback.clear();
  GameSound.stop();
  if (modal === "confirmNewGame") showModal("settings");
  else if (modal === "storyScene") storyInput("skip");
  else closeModal();
}
function back() {
  if (modal) {
    dismissModal();
    return true;
  }
  if (location.hash.includes("/")) {
    const [id, page, number] = location.hash.slice(1).split("/");
    nav(number ? phoneDestination(id, page) : id);
    return true;
  }
  if (current() !== "forge") {
    nav(zones[current()] ? "world" : "forge");
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
let forgePress = null, consumedForgePress = false;
function cancelForgePress() {
  clearTimeout(forgePress?.timer);
  forgePress = null;
}
function beginForgePress(event) {
  if (!event.isPrimary || event.button !== 0) return;
  cancelForgePress();
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
    consumedForgePress = true;
    el("screen").setPointerCapture(press.id);
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
    if (forgePress?.id === event.pointerId && (type !== "lostpointercapture" || event.target === el("screen")))
      cancelForgePress();
  });
addEventListener("blur", cancelForgePress);
document.addEventListener("contextmenu", event => {
  if (forgePress || event.target.closest('[data-act="enhance"]')) event.preventDefault();
});
let cutPress = null;
document.addEventListener("pointerdown", (e) => {
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
  beginForgePress(e);
  const button = e.target.closest("[data-act=finalMove]");
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
  if (d.lesson === "menu") return showModal("lessons");
  if (d.lesson === "hide" || d.lesson === "show")
    return locked(() => {
      sync();
      state.apprentice.visible = d.lesson === "show";
      save();
      closeModal(false);
      render();
    });
  if (d.gear) gear = d.gear;
  if (d.go) return nav(d.go);
  if (d.open) return showModal(d.open);
  if ("close" in d) return dismissModal();
  if (d.act) {
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
  if (d.bag) bagTab = d.bag;
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
  closeModal(false);
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
  const wallet = Game.huntingStatus(state);
  el("huntTickets").textContent = brief(wallet.free + wallet.purchased);
  const autoStart = document.querySelector('[data-repeat="start"]');
  HuntWatch.refreshWallet();
  if (autoStart) autoStart.disabled = wallet.free + wallet.purchased < 1;
  for (const button of document.querySelectorAll('[data-act="huntStart"]'))
    button.disabled = wallet.free + wallet.purchased < 1;
  const walletSummary = document.querySelector('[data-wallet-summary]');
  if (walletSummary) walletSummary.textContent = "사냥권 · 무료 " + wallet.free + " / 구매 " + wallet.purchased;
  if (el("huntingWallet")) {
    const w = Game.huntingStatus(state);
    if (el("huntingWallet").firstElementChild?.dataset.huntingStatus !== huntingWalletKey(state, w))
      el("huntingWallet").innerHTML = huntingWalletContent(state);
    else el("huntingWallet").querySelector("[data-hunting-recharge]").textContent = huntingRechargeText(w);
  }
  if (modal === "daily" && document.querySelector("[data-attendance-day]")?.dataset.attendanceDay !== Game.day(Date.now())) displayModal();
  if (state.autoMine) {
    locked(() => {
      const settled = sync();
      if (settled) {
        save();
        if (current() === "mine") render();
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
  if (modal === "final" && delivery && state.weapon.finalTrial?.key === "yield")
    delivery.disabled = !Breakthrough.canDeliver(
      state,
      Breakthrough.invoice(state.weapon, Game.price),
    );
}, 1000);
function animate(now) {
  if (!document.hidden && ready && !storageError) {
    const needle = el("finalNeedle");
    if (modal === "final" && state.weapon.finalTrial?.key === "edge" && needle) {
      needle.frameAt = Date.now();
      needle.style.left =
        Breakthrough.position(state.weapon.finalTrial, needle.frameAt) * 100 + "%";
    }
    if (
      modal === "craft" &&
      el("bathNeedle") &&
      state.weapon.work?.index === 2 &&
      !state.weapon.work.ready
    )
      el("bathNeedle").style.left = Swordcraft.needle(state.weapon.work, Date.now()) * 100 + "%";
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
          modal === "craft" &&
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
el("brandIcon").innerHTML = icon("anvil");
el("coinIcon").innerHTML = icon("coins");
el("settingsIcon").innerHTML = icon("settings");
locked(() => {
  state = readState();
  if (!state) { state = Game.fresh(); save(); }
  else if (store.needsMigration) save();
  resumeSaved();
}, true);
requestAnimationFrame(animate);
