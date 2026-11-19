"use strict";

const ContentGuide = (() => {
  const focus = (text, label, selector) => ({ text, label, selector });
  const actOn = (text, label, action) => focus(text, label, '[data-act="' + action + '"]');
  const open = (text, label, key) => ({ text, label, modal: key });
  const visit = (text, label, route) => ({ text, label, route });
  function suppliedToday(s) {
    const today = Game.day(Date.now());
    return s.day >= today || s.hunting.daily >= today;
  }

  function mine(s) {
    if (s.autoMine) return open(
      "단이에게 부두를 맡겼어. 화면을 닫아도 산소통 하나를 다 쓸 때마다 보상과 피버 1이 쌓여. 중단하면 지금 쓰는 산소통까지만 마치고 나머지는 돌려받아.",
      "자동 탐사 획득 내역", "miningResult");
    if (s.dive) return actOn(
      s.dive.depth === 1000
        ? "밧줄 끝에 첫 광맥이 보여. 50 m 하강할 때마다 산소 10을 써서 광물을 캐. 한 번 내려가 보자."
        : "광물은 캘 때마다 보관함으로 들어가. 산소가 떨어지면 자동으로 올라오고, 먼저 올라가려면 지상 복귀를 누르면 돼.",
      "하강 버튼 찾기", "mine");
    if (s.ore.some(Boolean)) return open(
      "갱도에서 건져 올린 광석이 묵직하네. 심해 암시장에서 현재 시세를 보고 골드로 바꿀 수 있어. 함께 나온 가호와 길드 징표는 바로 쓸 수 있어.",
      "광물 시세 보기", "market");
    if (!Game.canDive(s.weapon)) {
      const route = s.bag.some(Game.canDive) ? "bag/stored" : "forge";
      return visit(
        "물 아래 잠긴 갱도에서 강화에 쓸 가호와 길드 징표를 찾을 수 있어. 수압을 견디려면 +19 이상이거나 레어 이상인 무기를 장착해야 해.",
        route === "forge" ? "대장간으로" : "보관 무기 확인", route);
    }
    if (!s.tanks) return suppliedToday(s)
      ? actOn("오늘 보급품은 이미 받았어. 지금 내려가려면 산소통을 1,000만 G에 살 수 있어.", "산소통 구매 버튼 찾기", "tank")
      : open("검은 수압을 견디겠어. 이제 산소통이 한 개 필요해. 오늘 보급품에서 한 개를 챙겨 와.", "오늘 보급품 확인", "daily");
    if (s.fever >= Game.mining.feverCost) return actOn(
      "부두의 피버 표식이 다 찼어. 지금 직접 탐사하면 산소통 1개와 피버 " + Game.mining.feverCost +
        "을 써서 이번 탐사의 드롭 수량이 " + Game.mining.feverMultiplier + "배가 돼.",
      "피버 탐사 버튼 찾기", "dive");
    if (s.lastAutoMine) return open(
      "단이가 탐사를 마치고 돌아왔어. 최근 탐사 결과에서 받은 광물과 가호를 살펴봐. 피버가 " +
        Game.mining.feverCost + "에 차면 직접 탐사에서 큰 수확을 거둘 수 있어.",
      "최근 탐사 결과", "miningResult");
    if (s.story.soldOre) return open(
      "첫 광석값을 받았으니 이제 단이에게 탐사를 맡겨 보자. 쓸 산소통 수를 정하면 자리를 비워도 채굴을 이어 가고 피버를 모아.",
      "자동 탐사 예약 확인", "autoMineSetup");
    return actOn(
      "갱도 입구까지 밧줄을 내렸어. 직접 탐사에 산소통 한 개를 써서 첫 광맥을 찾아봐. 떠나 있는 동안 캐고 싶을 땐 자동 탐사를 예약하면 돼.",
      "직접 탐사 버튼 찾기", "dive");
  }

  const chapters = {
    forge: ["마지막 한 단계", "yeonhwa", (s) => {
      if (gear !== "weapon" || s.weapon.level !== 19) return null;
      return Breakthrough.choices(s.weapon, Game.price).length
        ? open("검에 남긴 특성이 +20으로 가는 다른 공정을 열어 줘. 돌파 방식마다 필요한 재료와 실패 결과가 다르니 먼저 비교해 봐.", "돌파 방식 비교", "final")
        : visit("+20까지 한 단계 남았어. 앞서 놓친 제작 공정에서 특성을 새기면 이 검으로 시도할 수 있는 돌파 방식이 생겨.", "제작 공정 확인", "forge/craft");
    }],
    "world/board": ["마을의 보급품", "dani", (s) => suppliedToday(s)
      ? open("오늘 몫은 받아 가셨네요. 플레이하며 모은 상점 포인트로 가호나 유물 주문서를 살 수 있어요.", "포인트 상점", "shop")
      : open("길을 나서기 전에 보급품을 챙겨요. 골드와 사냥권, 탑 입장권, 산소통, 강화 가호가 하루에 한 번 들어와요.", "오늘 보급품 확인", "daily")],
    "forest": ["숯수레가 다니는 길", "dani", (s) => focus(
      s.hunt ? "진행 재개를 누르면 출전한 동료가 이어서 싸워요. 다른 동료를 고르면 다음 토벌부터 출전해요." :
      s.chests.some(c => c.id === s.lastHunt?.chestId)
        ? "동료가 토벌에 성공했어요. 진행 재개를 눌러 보물상자를 받고 다음 구역으로 가요."
        : "출전할 동료를 고르고 사냥권 한 장으로 토벌을 시작해요. 야생 생물을 처음 쓰러뜨리면 동료가 되고, 싸운 동료는 경험치를 얻어요. 황금 고블린은 골드를 남겨요.",
      "토벌 버튼 찾기", ".watch-start")],
    "forest/field": ["길목에 남겨 둔 검", "dani", (s) => s.field.length || s.unclaimed >= 1
      ? actOn("맡겨 주신 검 덕에 숯수레가 오가고 있어요. 이 검은 게임을 닫아도 골드를 모아요. 누적 수익을 여기서 받아 가세요.", "수령 버튼 찾기", "collect")
      : s.bag.some(g => g.level >= 13)
        ? actOn("보관한 검을 길목에 맡기면 시간이 지나며 골드가 쌓여요. 아래 후보에서 배치를 눌러 보세요.", "배치할 검 찾기", "deploy")
        : visit("길목을 지킬 +13 이상 검이 필요해요. 검을 벼린 뒤 보관함에 넣으면 여기에 배치할 수 있어요.", "장착 무기 확인", "bag")],
    "forge/craft": ["망치질 사이의 공정", "yeonhwa", (s) => {
      const stage = Swordcraft.stages[Swordcraft.stageIndex(s.weapon)];
      return stage
        ? actOn(stage.title + " 공정을 해 보자. 마치면 특성을 고를 수 있어." +
          (s.weapon.level < stage.target ? " 특성을 고르면 검이 +" + stage.target + "가 돼." : "") +
          " 고른 특성은 나중에 마지막 돌파에도 쓰여.", "공정 버튼 찾기", "craftStart")
        : { text: "+7에서 칼날을 갈고, +9에서 시검을 치르고, +11에서 물과 기름에 담금질해. 각 공정을 마치면 검이 두 단계 오르고 특성이 남아." };
    }],
    "forge/training": ["실패를 적어 둔 수첩", "yeonhwa", (s) => ({
      text: s.rebirths && s.inheritedRecipe
        ? "화로에 남긴 제작법으로 새 검을 수련해 봐. 전승 수련을 시작한 뒤 검을 강화하며 단계별 과제를 해결하면 제작법을 다시 살릴 수 있어."
        : Game.enhancementNotebook(s).active
        ? "실패하며 모은 단서를 확인해. 최고 단계에서는 담금질한 뒤 집중 강화에, 단계가 떨어졌다면 기록 복원에 쓸 수 있어."
        : "같은 검이 +17에 닿으면 단조 수첩을 열어 줄게. 그때부터 일반 강화 실패가 다음 시도와 복원에 쓸 단서로 남아."
    })],
    mine: ["물에 잠긴 갱도", "yeonhwa", mine],
    tower: ["수문장이 지키는 탑", "yeonhwa", (s) => {
      if (towerMode === "trial") {
        if (s.trial.choices.length) return actOn("층을 돌파했어. 이번 수련에 쓸 공격력이나 체력, 대장간에 가져갈 별의 파편 중 하나를 골라.", "승리 보상 찾기", "reward");
        return { text: "시련의 탑에서는 층마다 체력을 회복하고 20턴 안에 상대를 쓰러뜨려야 해. 이긴 층마다 보상을 하나 골라 다음 층을 준비해." };
      }
      if (s.towerRun || s.lastTowerRun) return open("수문장을 넘은 층마다 상자를 남겼어. 등반 결과에서 이번에 얻은 상자를 확인하고 열어 봐.", "등반 결과 보기", "towerRun");
      return s.tickets
        ? actOn("강해진 검과 방어구를 시험할 차례야. 무한의 탑은 입장권 한 장으로 패배하거나 멈출 때까지 오를 수 있어. 이긴 층마다 상자를 얻어.", "고속 등반 버튼 찾기", "fastTower")
        : open("무한의 탑은 입장권 한 장으로 여러 층을 오르며 상자를 얻는 곳이야. 오늘 보급품에 입장권이 남았는지 확인해.", "입장권 보급 확인", "daily");
    }],
    altar: ["돌에 남은 별빛", "yeonhwa", (s) => s.shards
      ? actOn("별의 파편 한 개로 장착 무기의 공격력이나 방어구의 체력 옵션을 다시 새겨. 기존 수치가 새 수치로 바뀌니 어느 장비에 쓸지 먼저 골라.", "옵션 새기기 버튼 찾기", "altar")
      : visit("이 제단은 별의 파편으로 장비에 힘을 새기는 곳이야. 첫 강화 의뢰를 달성했다면 보상에서 파편을 받을 수 있어.", "강화 의뢰 확인", "forge/orders")],
    "bag/relics": ["레이드에 가져갈 인장", "dani", (s) => {
      if (!s.relics.length) return open("상점에서 얻은 유물은 여기에 모여요. 그중 하나를 대표로 정하면 길드 레이드 공격에 힘을 보태요.", "포인트 상점 보기", "shop");
      return s.equippedRelic >= 0
        ? { text: "대표 유물에 별의 파편이나 주문서를 쓰면 레이드 효과를 키울 수 있어요. 대표로 지정한 유물의 ‘대표 · 강화’를 열어 보세요." }
        : { text: "길드 레이드에 가져갈 유물 하나를 고르고 ‘대표 지정’을 눌러 보세요." };
    }],
    growth: ["화로에 바치는 첫 검", "yeonhwa", (s) => s.rebirths && s.weapon.level !== 20
      ? visit("화로가 남긴 영혼 포인트로 다음 검의 길을 정해 봐. 각인을 올리면 강화와 탐사, 사냥터 운영에 도움이 돼.", "영혼 각인 보기", "growth/imprint")
      : open("장착한 +20 검을 화로에 바치면 영혼 포인트를 얻어. 손에 든 무기와 방어구는 새 장비로 돌아가니, 다음 검을 키울 배치 수익도 살펴봐.", "환생 조건 확인", "rebirth")],
    "growth/imprint": ["다음 검에 남기는 기술", "yeonhwa", (s) => s.rebirths
      ? visit("새 검의 등급을 노리면 운명을, 배치 수익을 더 자주 받으려면 신속을 올려 봐. 행운·폐활량·영토에는 검에 새길 수 있는 주각인 기술도 있어.", "대장간 수련 보기", "forge/training")
      : visit("첫 환생에서 받은 영혼 포인트로 영구 각인을 열 수 있어. 먼저 화로에서 어떤 검이 필요한지 보자.", "환생 조건 확인", "growth")],
    "growth/fusion": ["두 검이 만나는 모루", "yeonhwa", () => open(
      "환생 2,000회를 채운 뒤 전설 +20~24 검을 장착하고 같은 단계의 전설 검을 보관함에 준비해. 시도마다 재료가 들고 보조 검이 소실될 수 있으니 합성 전에 조건을 확인해.",
      "합성 재료 보기", "fusion")],
    "growth/guild": ["광산에서 온 징표", "dani", (s) => s.guild
      ? open("길드가 자리를 잡았어요. 하루 한 번 레이드에 들어갈 수 있어요. 대표 유물이 있다면 공격에 그 효과가 붙어요.", "레이드 입장 확인", "guild")
      : open("광산에서 건진 징표 10개와 30억 G로 개인 길드를 열 수 있어요. 길드를 열면 매일 레이드에 도전할 수 있어요.", "길드 창설 조건 보기", "guild")],
  };

  function currentKey() {
    return phoneDestination(current(), phonePage());
  }

  const expandedByRoute = new Map();

  function dialogue(who, step) {
    const action = step.route ? go(step.route, step.label, "mini") :
      step.modal ? openBtn(step.modal, step.label, "mini") :
      step.selector ? '<button class="mini" data-guide-focus>' + step.label + "</button>" : "";
    return speech(who, step.text, action);
  }

  function hunt(s) {
    const [title, who, guide] = chapters.forest;
    return [title, dialogue(who, guide(s))];
  }

  function render(s) {
    const previous = document.querySelector(".content-guide");
    if (previous) expandedByRoute.set(previous.dataset.guide, previous.open);
    const key = currentKey();
    const chapter = chapters[key];
    if (!chapter || key === "forest") return "";
    const [title, who, guide] = chapter;
    const step = guide(s);
    if (!step) return "";
    const expanded = expandedByRoute.get(key) ?? !s.story.quiet;
    return '<details class="content-guide story-chat" data-guide="' + key + '"' + (expanded ? " open" : "") +
      '><summary>' + icon("book-open") + title + "</summary>" + dialogue(who, step) + "</details>";
  }

  function focusCurrent(s) {
    const step = chapters[currentKey()]?.[2](s);
    const target = step?.selector && el("screen").querySelector(step.selector + ":not(:disabled)");
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
  }

  function index() {
    return '<details class="content-guide-index"><summary>콘텐츠별 이야기와 사용법</summary>' +
      Object.entries(chapters).map(([route, [title]]) => {
        const [area, page] = route.split("/");
        const name = zones[area]?.[0] || { forge: "대장간", world: "모험", bag: "보관함", growth: "성장" }[area];
        const tab = phonePages[area]?.find(([key]) => key === (page || phonePages[area][0][0]))?.[1];
        return row(name + (tab ? " · " + tab : ""), title, go(route, "이동", "mini"));
      }).join("") + "</details>";
  }

  return { render, focusCurrent, index, hunt };
})();
