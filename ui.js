"use strict";
const saveKey = "emberforge.save.v1",
  settingsKey = "emberforge.preferences.v1";
function readState() {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return Game.fresh();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !data.weapon || !Array.isArray(data.field))
    throw new Error("지원되지 않는 저장 형식");
  const defaults = Game.fresh(data.created);
  const restored = {
    ...defaults,
    ...data,
    fieldIncomeVersion: data.fieldIncomeVersion ?? 1,
    apprentice: Apprentice.restore(data, defaults.apprentice),
  };
  restored.story = CharcoalStory.restore({ ...restored, story: data.story });
  Game.migrateTraining(restored);
  return restored;
}
let state,
  storageError = false;
try {
  state = readState();
} catch (e) {
  state = Game.fresh();
  storageError = true;
}
let prefs = { sound: true, music: true, musicVolume: .35, motion: !matchMedia("(prefers-reduced-motion: reduce)").matches };
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
  toastTimer = 0,
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
function save() {
  if (storageError) return;
  try {
    localStorage.setItem(saveKey, JSON.stringify(state));
  } catch {
    storageError = true;
    notify("이 기기에서 저장할 수 없습니다. 현재 플레이는 계속할 수 있습니다.", "loss");
  }
}
function sync() {
  if (!storageError) {
    try {
      state = readState();
    } catch {
      storageError = true;
    }
  }
  const completed = state.autoMine?.completed;
  Game.settle(state);
  return completed !== state.autoMine?.completed;
}
let queue = Promise.resolve();
let restarting = false;
function locked(fn) {
  const run = () => { if (!restarting) return fn(); };
  queue = queue
    .catch(() => {})
    .then(() => (navigator.locks ? navigator.locks.request(saveKey, run) : run()));
  return queue;
}
function reloadAtForge() {
  restarting = true;
  history.replaceState(null, "", "#forge");
  location.reload();
}
function startNewGame() {
  return locked(() => {
    if (modal !== "confirmNewGame") return;
    try {
      localStorage.setItem(saveKey, JSON.stringify(Game.fresh()));
    } catch {
      notify("새 진행을 저장하지 못했습니다. 다시 시도해 주세요.", "loss");
      return;
    }
    reloadAtForge();
  });
}
function notify(msg, kind = "info") {
  if (!msg) return;
  clearTimeout(toastTimer);
  const titles = { "forge-success": "강화 성공", "forge-hold": "강화 유지",
    "forge-drop": "강화 하락", "forge-destroy": "장비 파괴", loss: "주의", win: "획득 · 완료" };
  el("noticeTitle").textContent = titles[kind] || "알림";
  el("noticeMessage").textContent = msg;
  el("noticeMessage").scrollTop = 0;
  el("toast").className = "on " + kind;
  toastTimer = setTimeout(() => el("toast").classList.remove("on"), 4500);
}
function sound(kind, delay = 0) {
  if (prefs.sound && !document.hidden) GameSound.play(kind, delay);
}
function syncMusic() {
  const route = current();
  GameMusic.update(GameMusic.resolve({ route, modal, story: storyScene, state, page: phonePage(route), towerMode }),
    { enabled: prefs.music, volume: prefs.musicVolume, hidden: document.hidden });
}
function act(action, arg = "", pressedAt) {
  return locked(() => {
    sync();
    Feedback.clear();
    GameSound.stop();
    const goldBefore = state.gold;
    const breaksBefore = state.breaks;
    const gearBefore = state[arg === "armor" ? "armor" : "weapon"].level;
    const sparring = action === "craftMove" && state.weapon.work?.index === 1;
    const finalKey = action === "finalMove" && state.weapon.finalTrial?.key;
    const strong = sparring && Swordcraft.heavy(state.weapon.work);
    const result = Game.perform(state, action, arg, undefined, undefined, pressedAt);
    save();
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
    if (result.ok && forgeAction) {
      animationStart = performance.now();
      navigator.vibrate?.(result.kind === "win" ? 18 : 36);
    }
    if (result.ok && action === "temperStart") modal = "temper";
    if (result.ok && action === "craftStart") modal = "craft";
    if (result.ok && ["openChest", "openTowerChests"].includes(action)) modal = "treasure";
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
    if (result.impact) showHuntDamage(document.querySelector("#screen .combat-hud"), result.impact, prefs.motion);
    if (result.ok && prefs.motion) {
      const stage = document.querySelector("#screen .scene");
      if (result.impact) {
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
    if (action !== "temperStart" && !(result.ok && ["openChest", "openTowerChests"].includes(action)) && !result.battle && !result.impact && result.message)
      notify(result.message, forgeOutcome ? "forge-" + forgeOutcome : result.ok ? result.kind : "loss");
    if (result.ok && action !== "temperStart") {
      const stage = document.querySelector("#screen .scene");
      const chest = ["openChest", "openTowerChests"].includes(action);
      const reward = ["collect", "daily", "order", "sell", "market", "reward"].includes(action);
      const ascension = (["rebirth", "imprint", "fuse", "polish"].includes(action) || (action === "shop" && Number(arg) === 3) || (action === "finalMove" && state.weapon.level === 20)) && result.kind === "win";
      const animate = prefs.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (forgeAction) {
        const level = state[arg === "armor" ? "armor" : "weapon"].level;
        const label = action === "temper" ? (state.heat === 5 ? "정밀 타격" : "담금질 완료") :
          state.breaks > breaksBefore ? "장비 파괴" : level > gearBefore ? "+" + level + " 강화 성공" : level < gearBefore ? "+" + level + " · 하락" :
          result.kind === "win" ? "단조 완료" : "+" + level + " · 유지";
        if (animate) Feedback.play("forge", stage, label, forgeOutcome);
        sound("forge-" + forgeOutcome, animate ? Feedback.strikeMs / 1000 : 0);
      } else if (chest) {
        if (animate) Feedback.play("chest", document.querySelector(".chest-reveal .chest-art"), "+" + fmt(state.lastChest.gold) + " G");
        sound("chest", animate ? Feedback.chestMs / 1000 : 0);
      } else if (reward) {
        if (animate) Feedback.play("coins", modal ? el("modalBody") : stage, state.gold > goldBefore ? "+" + fmt(state.gold - goldBefore) + " G" : "보상 획득");
        sound("coins");
      } else if (ascension) {
        if (animate) Feedback.play("ascend", modal ? el("modalBody") : stage, action === "rebirth" ? "환생 완료" : "성장 완료");
        sound("ascend");
      } else sound(result.impact?.kind || (sparring ? (arg === "parry" ? "parry" : "slash") : action === "mine" ? "mine" : result.kind));
    }
    if (result.ok && CharcoalStory.unlocked(state, "home")) autoStory();
  });
}
function nav(id) {
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
  const id = current(),
    parent = zones[id] ? "world" : id;
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
    phoneStoryButton(state, id) +
    openBtn("storyBook", icon("book-open") + "이야기", "ghost") +
    (id === "forge"
      ? openBtn("journal", icon("scroll-text") + "강화 기록", "ghost")
      : zones[id]
        ? go("world", icon("arrow-left") + "모험 지도", "ghost")
        : openBtn("daily", icon("gift") + "출석 보상", "ghost")) +
    "</div></div>";
  let view;
  if (id === "forge") view = forgeView(state);
  else if (id === "bag") view = bagView(state);
  else if (id === "growth") view = growthView(state);
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
  syncMusic();
}
function renderLesson() {
  const host = el("apprentice");
  host.hidden = !state.apprentice.visible;
  if (host.hidden) return;
  const step = Apprentice.next(state);
  const tip = step >= 0 ? Apprentice.guidance(state, step) : null;
  const firstHunt = step === 1 && current() === "forge";
  const title = step < 0 ? "수업 완료" : firstHunt ? "첫 강화 완료" : Apprentice.lessons[step][1];
  const target = tip && current() === tip.route ? el("screen").querySelector(tip.selector) : null;
  const progress = step < 0 ? 6 : step + 1;
  const actionLabel = target ? "위치 보기" : firstHunt ? "이끼숲으로" : tip?.button;
  const action = step < 0 ? lessonButton("hide", "마치기") :
    '<button class="mini" data-lesson="locate" aria-label="' + actionLabel + '">' +
    '<span class="lesson-cta-label">' + actionLabel + '</span>' + icon("arrow-right") + '</button>';
  host.innerHTML = '<button class="lesson-copy" data-lesson="menu" aria-label="수업 ' + progress + '/6 · ' +
    title + ' · 수업 관리" aria-describedby="lesson-action-hint">' +
    '<strong>수업 ' + progress + '/6 · ' + title + ' ' + icon("chevron-right") + '</strong>' +
    '<span id="lesson-action-hint">' + (tip ? tip.text : "첫 사냥터를 운영했습니다. 이제 새 검을 벼리거나 탑에 도전해 보세요.") +
    '</span></button>' + action;
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
  const n = Apprentice.next(state);
  if (n < 0) return;
  const tip = Apprentice.guidance(state, n);
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
    "숲에서 돌진을 막고 다음 턴에 베면 반격 보너스를 얻습니다.",
    "모루를 초록 구간에서 두드리면 다음 강화에 +5%p가 붙습니다.",
    "최고 강화 +3, +7, +13에서 대장간 의뢰 보상을 챙기세요.",
    "+13 이상 무기를 보관함에 넣은 뒤 배치하세요.",
    "사냥터에서 모인 골드를 수령하세요. 회수한 검은 보관함에 있습니다.",
  ];
  return [
    "대장장이 수업",
    Apprentice.lessons
      .map((lesson, i) => row(lesson[1], notes[i], done[i] ? icon("check") : ""))
      .join("") +
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
  if (modal === "storyBook") return storyBook(s);
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
            "대기 모션과 타격 연출",
            preferenceSwitch("motion", "애니메이션"),
          ) +
          row(
            "저장 방식",
            storageError ? "현재 저장 불가" : "이 기기에 자동 저장",
            icon("archive"),
          ) +
          '<div class="settings-links">' + openBtn("daily", icon("gift") + "오늘의 출석 보상") +
          openBtn("lessons", icon("hammer") + "대장장이 수업") +
          openBtn("help", icon("book-open") + "플레이 안내") + "</div>" +
          row("게임 진행", "새 게임으로 돌아갑니다.", openBtn("confirmNewGame", "처음부터 시작", "action danger")),
      ];
    case "confirmNewGame":
      return [
        "처음부터 시작할까요?",
        desc("장비, 골드, 환생과 이야기 기록을 모두 지우고 첫 장면부터 시작합니다. 지운 진행은 복구할 수 없습니다.") +
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
        desc("매일 한국 시간 자정에 갱신됩니다.") +
          row("1,000,000 G", "무한의 탑 입장권 5장 · 산소통 1개", icon("gift")) +
          row("가호 보급", "정령과 대장장이 가호 각 3개", icon("shield")) +
          btn(
            "daily",
            s.day === Game.day(Date.now()) ? "오늘 수령 완료" : "보급품 받기",
            "",
            "primary",
            s.day === Game.day(Date.now()),
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
      return [
        "포인트 상점",
        line("보유 포인트", fmt(s.points) + " P") +
          desc("화면을 열고 플레이한 시간 1분당 1 P를 모읍니다.") +
          [...Game.blessings, "유물 뽑기"]
            .map((n, i) =>
              row(
                n,
                i === 3 ? "당첨 확률 80%" : "1개",
                btn("shop", [20, 10, 60, 30][i] + " P", i, "mini", s.points < [20, 10, 60, 30][i]),
              ),
            )
            .join(""),
      ];
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
    case "huntRules":
      return ["기세와 반격", line("베기 · 돌진 방어", "기세 +1 · 최대 2칸") +
        desc("강공은 기세 2칸을 써서 피해를 두 배로 주고 단단한 가죽을 뚫습니다. 적이 살아남으면 받는 피해도 1.5배입니다.") +
        desc("돌진을 방어하면 다음 공격은 2.5배 반격입니다. 반격을 한 번이라도 맞히고 승리하면 골드가 25% 늘어납니다. 먼저 쓰러뜨린 적은 반격하지 못합니다.")];
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
  const [title, html] = modalData();
  document.body.dataset.storyMotion = prefs.motion ? "on" : "off";
  el("shade").dataset.modal = modal;
  el("modalTitle").textContent = title;
  el("modalBody").innerHTML = html;
  el("shade").hidden = false;
  document.body.style.overflow = "hidden";
  syncMusic();
}
function showModal(key) {
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
  if (!e.repeat) GameMusic.unlock();
  if (e.key === "Escape" && modal) {
    dismissModal();
    e.preventDefault();
  }
  if (e.key === "Tab" && modal) {
    const items = [...el("shade").querySelectorAll("button:not(:disabled),input")].filter(
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
let cutPress = null;
document.addEventListener("pointerdown", (e) => {
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
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
  const press = cutPress;
  cutPress = null;
  if (e.target === el("shade")) {
    dismissModal();
    return;
  }
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
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
  if (d.pref) {
    prefs[d.pref] = !prefs[d.pref];
    if (d.pref === "music") { syncMusic(); if (prefs.music) GameMusic.unlock(); }
    if (d.pref === "motion" && !prefs.motion) { Impacts.clear(); Feedback.clear(); }
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
document.addEventListener("input", (e) => {
  if (e.target.id !== "musicVolume") return;
  prefs.musicVolume = Number(e.target.value) / 100;
  syncMusic();
  GameMusic.unlock();
  try { localStorage.setItem(settingsKey, JSON.stringify(prefs)); } catch {}
});
addEventListener("hashchange", () => {
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
  if (e.key === saveKey) {
    const previousGame = state.created;
    sync();
    if (e.oldValue && !storageError && state.created !== previousGame) return reloadAtForge();
    render();
    if (modal === "storyScene") {
      if (!storyScene.replay && state.story[storyScene.id] !== storyScene.page) {
        closeModal(false);
        autoStory();
      }
    } else if (modal) displayModal();
  }
});
let tickTime = Date.now(),
  active = 0;
function accrue() {
  const now = Date.now();
  active += Math.max(0, Math.min(5000, now - tickTime));
  tickTime = now;
}
function flush() {
  const ms = active;
  active = 0;
  return locked(() => {
    sync();
    state.activeMs += ms;
    state.points += Math.floor(state.activeMs / 60000);
    state.activeMs %= 60000;
    save();
    el("gold").textContent = brief(state.gold);
  });
}
document.addEventListener("visibilitychange", () => {
  syncMusic();
  if (document.hidden) {
    Feedback.clear();
    Impacts.clear();
    GameSound.stop();
    accrue();
    flush();
  }
  tickTime = Date.now();
});
addEventListener("pagehide", () => GameMusic.update("forge", { hidden: true }));
addEventListener("pageshow", () => syncMusic());
setInterval(() => {
  if (document.hidden) return;
  accrue();
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
  } else Game.settle(state);
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
  if (!document.hidden) {
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
        delta = now - animationStart;
      let index = 0;
      if (prefs.motion) {
        if (equipment)
          index =
            delta >= 0 && delta < 480 ? 6 + Math.floor(delta / 80) : Math.floor(now / 160) % 6;
        else if (id === "boar" && now - huntStart < 360)
          index = 4 + (Math.floor((now - huntStart) / 90) % 4);
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
      ctx.clearRect(0, 0, canvas.width, 144);
      ctx.drawImage(im, index * canvas.width, 0, canvas.width, 144, 0, 0, canvas.width, 144);
      canvas.dataset.frame = index;
    }
    if (modal === "temper" && el("needle"))
      el("needle").style.left =
        Game.temperPosition(Math.max(0, Date.now() - state.temperStart)) * 100 + "%";
    if (modal === "battle" && battle) drawTowerBattle(battle, now, prefs.motion);
  }
  requestAnimationFrame(animate);
}
el("brandIcon").innerHTML = icon("anvil");
el("coinIcon").innerHTML = icon("coins");
el("settingsIcon").innerHTML = icon("settings");
Game.settle(state);
render();
autoStory();
requestAnimationFrame(animate);
if (storageError) notify("저장 데이터를 읽을 수 없어 이번 플레이는 임시로 진행됩니다.", "loss");
