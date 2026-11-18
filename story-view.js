"use strict";

let storyScene = null;
const storyPath = (name) => "assets/story/" + name + ".webp";
const storyArt = {
  rain: "비에 젖은 단이가 대장간 문간에서 빨간 끈에 매달린 방울을 들어 보인다.",
  bridge: "멧돼지가 숯수레 앞의 돌다리를 가로막고 있다.",
  ribbon: "연화가 검 손잡이에 빨간 천을 감는다.",
  willow: "맨발인 아버지 곁에서 단이가 버드나무에 걸린 짚신을 가리킨다.",
  home: "다시 방울을 단 숯수레가 아침 햇살 속에서 마을로 돌아온다.",
  tools: "단이가 무딘 낫과 도끼가 든 보따리를 펼친다. 한쪽에 작은 망치가 놓여 있다.",
  lamplight: "단이가 등잔을 들자 완성한 검 위로 긴 불빛이 비친다.",
  embers: "환생 화로에 내려놓은 검이 금빛 불티로 흩어진다.",
  hammers: "새 칼과 크기가 다른 망치 두 자루 앞에서 단이가 소매를 걷는다.",
};
function storyButton(action, label, style = "mini") {
  return '<button class="' + style + '" data-story="' + action + '">' + label + "</button>";
}
function speech(who, text, action = "") {
  return '<div class="speech"><img src="' + storyPath(who) +
    '" alt=""><div><b>' + CharcoalStory.names[who] + "</b><p>" + text + "</p>" +
    action + "</div></div>";
}
function storyChat(s, place) {
  const words = CharcoalStory.dialogue(s, place, s.hunt && Game.huntCharge(s.hunt.turn));
  if (!words) return "";
  const [who, text, target] = words;
  const scenes = { bridge: "다리 건너 살펴보기", bundle: "꾸러미 풀어 보기", lesson: "작업대 살펴보기" };
  const routes = { forge: "대장간으로", forest: "이끼숲으로", bag: "보관함으로" };
  let destination = target;
  if (s.apprentice.deployed && (target === "forest" || (place === "forest" && !s.hunt && !target && !s.story.home))) {
    destination = "forest/field";
    routes[destination] = "배치 수익 확인";
  } else if (target === "bag" && s.bag.some(g => g.level >= 13)) {
    destination = "bag/stored";
    routes[destination] = "보관 무기 보기";
  }
  const action = scenes[target] ? storyButton(target, scenes[target]) :
    target === "ritual" ? openBtn("rebirth", "환생 조건 살펴보기", "mini") :
    routes[destination] ? go(destination, routes[destination]) : "";
  return '<aside class="story-chat" aria-label="동료 대화">' + speech(who, text, action) + "</aside>";
}
function phoneStoryButton(s, place) {
  const words = CharcoalStory.dialogue(s, place, s.hunt && Game.huntCharge(s.hunt.turn));
  if (!words) return "";
  const [who] = words;
  return '<button class="companion-button" data-open="companion" aria-label="' +
    CharcoalStory.names[who] + '와 대화"><img src="' + storyPath(who) + '" alt="">' +
    (who === "dani" ? "단이" : "연화") + "와 대화</button>";
}
function storyBook(s) {
  const requirements = { bridge: "이끼숲 첫 토벌 후", home: "첫 토벌과 배치 수익 수령 후",
    bundle: "첫 토벌과 배치 수익 수령 후", light: "첫 길삯과 +20 검 달성 후", lesson: "첫 길삯과 첫 환생 후" };
  function leaf(id) {
    const chapter = CharcoalStory.chapters[id];
    const open = CharcoalStory.unlocked(s, id);
    const seen = s.story[id] >= chapter.pages;
    const note = open ? (seen ? "다시 보기" : "이야기 듣기") : requirements[id];
    return '<button class="story-leaf" data-story="' + id + '" ' + (open ? "" : "disabled") +
      '><img src="' + storyPath(chapter.cover) + '" alt=""><span><b>' + chapter.title +
      "</b><small>" + note + "</small></span></button>";
  }
  return ["이야기", CharcoalStory.volumes.map((volume, i) =>
    '<h3 class="volume-title">' + (i + 1) + "장 · " + volume.title + "</h3>" +
    volume.scenes.map(leaf).join("")).join("") +
    storyButton("quiet", s.story.quiet ? "이야기·동료 대화 안내 켜기" : "이야기·동료 대화 안내 끄기")];
}
function storyPage() {
  const { id, replay, page, answer } = storyScene;
  const chapter = CharcoalStory.chapters[id];
  const [art, who, text] = CharcoalStory.frame(id, page, answer, state.story.firstGift);
  const volume = CharcoalStory.volumes.find(v => v.scenes.includes(id));
  const next = page < chapter.pages - 1 ? "계속 듣기" : replay ? "이야기 목록" :
    id === "intro" && !state.best ? "모루 앞으로" :
    id === "light" && !state.rebirths && state.weapon.level === 20 ? "지금은 검 간직하기" : "돌아가기";
  const playerReply = id === "intro" && page === 0;
  let buttons = playerReply ?
    Object.entries(CharcoalStory.questions).map(([key, question]) => storyButton(key, question, "action")).join("") :
    storyButton("next", next, "primary");
  if (!replay && page === chapter.pages - 1) {
    if (id === "home" && !state.story.bundle && !state.rebirths)
      buttons += storyButton("unpack", "단이의 꾸러미 보기", "action");
    if (id === "light" && state.weapon.level === 20 && !state.rebirths)
      buttons += storyButton("ritual", "환생 조건 살펴보기", "action");
  }
  return [chapter.title, '<div class="story-art"><img alt="' + storyArt[art] + '" src="' + storyPath(art) +
    '"></div><div class="story-script">' +
    (playerReply ? '<p class="story-perspective">스승 연화 곁에서 풀무를 밟던 나는 손을 멈췄다. 문간에 선 단이의 옷자락에서 빗물이 뚝뚝 떨어졌다.</p>' : "") +
    speech(who, text) +
    (playerReply ? '<div class="reply-label" id="playerReply">내 대답 · 견습 대장장이</div><div class="story-actions" role="group" aria-labelledby="playerReply">' :
      '<div class="story-actions">') + buttons + "</div>" +
    '<div class="story-foot"><small>' + volume.title + " · " + (page + 1) + " / " + chapter.pages +
    "</small>" + storyButton("skip", replay ? "목록으로" : "장면 건너뛰기", "textbtn") + "</div></div>"];
}
function startStory(id, fromBook = false) {
  if (!CharcoalStory.unlocked(state, id)) return;
  const page = state.story[id];
  const replay = page >= CharcoalStory.chapters[id].pages;
  storyScene = { id, fromBook, replay, page: replay ? 0 : page, answer: state.story.answer };
  showModal("storyScene");
  if (id === "home" && storyScene.page === 0) sound("bell");
  focusStoryPage();
}
function focusStoryPage() {
  el("modalBody").querySelector(".story-actions button")?.focus({ preventScroll: true });
}
function autoStory() {
  if (!ready || storageError || modal || state.story.quiet) return;
  for (const id of Object.keys(CharcoalStory.chapters)) {
    if ((id === "bridge" || id === "bundle") && !state.story[id]) continue;
    if (id === "light" && !state.story.light &&
        (state.rebirths || state.weapon.level !== 20 || state.story.bundle < CharcoalStory.chapters.bundle.pages)) continue;
    if (id === "lesson" && !state.story.lesson && !state.story.firstGift) continue;
    if (CharcoalStory.unlocked(state, id) && state.story[id] < CharcoalStory.chapters[id].pages) {
      const book = document.querySelector('[data-open="storyBook"]');
      if (book) { book.classList.add("story-ready"); book.setAttribute("aria-label", "이야기 · 새로운 장면"); }
      return;
    }
  }
}
function storyInput(action) {
  if (Object.keys(CharcoalStory.chapters).includes(action)) return startStory(action, modal === "storyBook");
  if (action === "quiet") return locked(() => {
    sync();
    state.story.quiet = !state.story.quiet;
    save();
    render();
    displayModal();
    el("modalBody").querySelector("[data-story=quiet]")?.focus();
  });
  if (modal !== "storyScene" || !storyScene) return;
  const session = storyScene;
  const { id, page } = session;
  const chapter = CharcoalStory.chapters[id];
  return locked(() => {
    if (storyScene !== session || modal !== "storyScene" || session.page !== page) return;
    sync();
    if (!session.replay && state.story[id] !== page) {
      closeModal(false);
      render();
      return;
    }
    if (Object.keys(CharcoalStory.questions).includes(action)) {
      session.answer = action;
      sound("bell");
    }
    session.page = action === "skip" ? chapter.pages : page + 1;
    if (!session.replay) {
      state.story[id] = session.page;
      if (id === "intro") state.story.answer = session.answer;
      save();
    }
    if (session.page < chapter.pages) {
      displayModal();
      focusStoryPage();
      return;
    }
    closeModal();
    render();
    if (action === "unpack") return startStory("bundle", session.fromBook);
    if (action === "ritual" && !state.rebirths && state.weapon.level === 20) return showModal("rebirth");
    if (session.fromBook) return showModal("storyBook");
    if (id === "intro" && action !== "skip" && !state.best) return focusLesson();
    autoStory();
    if (!modal) el("title").querySelector("[data-open=storyBook]")?.focus({ preventScroll: true });
  });
}
