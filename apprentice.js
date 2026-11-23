"use strict";

const Apprentice = (() => {
  const lessons = [
    ["forge", "첫 검 벼리기"],
    ["hunt", "이끼숲 첫 토벌"],
    ["temper", "담금질 익히기"],
    ["order", "첫 의뢰 보상 받기"],
    ["deploy", "검으로 사냥터 운영하기"],
    ["collect", "첫 배치 수익 받기"],
  ];

  function restore(data, fresh) {
    if (data.apprentice) return { ...fresh, ...data.apprentice };
    const deployed = data.field.length > 0 || data.unclaimed > 0;
    return {
      ...fresh,
      visible: !data.attempts && !data.huntBest && !data.day && !deployed,
      tempered: data.heat > 0,
      deployed,
    };
  }

  function completed(s) {
    return [
      s.best > 0,
      s.huntBest > 0,
      s.apprentice.tempered,
      s.order > 0,
      s.apprentice.deployed || s.apprentice.collected || s.field.length > 0 ||
        !!(s.bladeForge && (s.bladeForge.deployed || s.bladeForge.extraDeployed)),
      s.apprentice.collected,
    ];
  }

  function next(s) {
    return completed(s).findIndex((done) => !done);
  }

  const cartTip = () => ({ text: "수레 보상을 하나 고르세요. 장비와 골드 중 지금 필요한 것을 선택합니다.", route: "forest", selector: "[data-explore-choice]", button: "보상 선택지 찾기" });
  function guidance(s, step) {
    if (s.hunt?.exploration?.kind === "cart") return cartTip();
    const target = (text, route, selector, button) => ({ text, route, selector, button });
    if (s.bladeForge) return currentGuidance(s, step, target);
    const plan = Game.journeyForge(s, "weapon");
    const deployable = g => g.level >= 13 && !Game.isJourneyGear(s, g);
    const forge = (text) =>
      target(text, "forge", plan ? '.forge-strike' : '[data-act="enhance"][data-arg="weapon"]', "망치 찾기");
    const forest = (text, action, button) =>
      target(text, "forest", action === "collect" ? '[data-act="collect"]' : '.watch-start', button);
    const needsWeapon =
      step === 0 ||
      (step === 3 && s.best < 3) ||
      (step >= 4 &&
        !s.field.length &&
        !s.bag.some(deployable) &&
        s.weapon.level < 13 &&
        !(step === 5 && s.unclaimed >= 1));
    const craftIndex = Swordcraft.stageIndex(s.weapon);
    const craftLesson = step >= 4 && needsWeapon && craftIndex >= 0;
    const neededGold = craftLesson
      ? Swordcraft.fee(s.weapon, Game.price, craftIndex)
      : plan ? plan.cost : s.enabled[2] && s.charms[2]
        ? 0
        : Game.price(s.weapon);
    if (needsWeapon && s.gold < neededGold) {
      if (s.chests?.length) return target("보관함에 남겨 둔 보물상자를 열어 강화비를 마련하세요.", "bag", '[data-open^="inventory-chest-"]', "상자 열기");
      const order = Game.currentOrder(s);
      if (order && s.best >= order[0])
        return target(
          "달성한 의뢰 보상으로 강화비를 마련하세요.",
          "forge",
          '[data-act="order"]',
          "의뢰 수령",
        );
      if (s.hunt) return guidance(s, 1);
      const wallet = Game.huntingStatus(s);
      if (wallet.free + wallet.purchased < 1)
        return target("비축 식량과 강화비가 부족합니다. 무료 담금질로 골드를 마련하세요.",
          "forge", '[data-open="temper"]', "무료 담금질");
      return forest(
        "강화비가 " +
          (neededGold - s.gold).toLocaleString("ko-KR") +
          " G 부족합니다. 숲에서 골드를 벌거나 모험 지도에서 출석 보급품을 받으세요.",
        "huntStart",
        "사냥터",
      );
    }
    if (step === 0) {
      const next = Game.nextEnhancementStats(s, "weapon");
      return forge(
        "무기 강화에 성공하면 공격력이 " +
          Game.stats(s).attack +
          " → " +
          next.attack +
          "으로 오릅니다.",
      );
    }
    if (step === 1) {
      return forest("짧게 누르면 이번 단계, 1초 꾹 누르면 연속 사냥을 시작합니다.", "huntStart", s.hunt ? "사냥 재개" : "사냥 시작");
    }
    if (step === 2)
      return target(
        "흰 바늘이 초록 구간에 닿을 때 모루를 두드리세요. 빗나가도 골드를 얻습니다.",
        "forge",
        '[data-open="temper"]',
        "담금질",
      );
    if (step === 3)
      return s.best < 3
        ? forge("검을 +3까지 벼리세요. 대장간 의뢰에서 골드와 별의 파편을 받을 수 있습니다.")
        : target(
            "첫 의뢰를 달성했습니다. 대장간의 의뢰에서 수령을 누르세요.",
            "forge",
            '[data-act="order"]',
            "의뢰 수령",
          );
    if (step === 5 && (s.unclaimed >= 1 || s.field.length))
      return forest(
        "배치한 검이 골드를 모읍니다. 누적 배치 수익이 1 G 이상이면 수령하세요.",
        "collect",
        "배치 수익 수령",
      );
    const bagIndex = s.bag.findIndex(deployable);
    if (bagIndex !== -1)
      return target(
        "보관한 검을 누르고 사냥터 배치를 고르세요. 이 검은 게임을 닫아도 골드를 모읍니다.",
        "bag",
        '[data-open="inventory-stored-' + bagIndex + '"]',
        "사냥터 배치",
      );
    if (s.weapon.level >= 13)
      return target(
        plan ? "기록 중인 검을 보관하면 새 보조 검을 받습니다. 보조 검을 +13까지 벼려 사냥터에 배치하세요." :
          "장착한 보조 검을 보관한 뒤 사냥터에 배치하세요.",
        "bag",
        '[data-open="inventory-weapon"]',
        "무기 보관",
      );
    const o = Game.currentOrder(s);
    if (o && s.best >= o[0])
      return target(
        "달성한 의뢰 보상으로 다음 강화비를 마련하세요.",
        "forge",
        '[data-act="order"]',
        "의뢰 수령",
      );
    if (craftLesson) {
      const stage = Swordcraft.stages[craftIndex];
      return target(
        stage.title +
          "에 도전하세요. 공정을 마치고 특성을 고르면 +" +
          stage.target +
          " 검을 얻습니다.",
        "forge",
        '[data-act="craftStart"]',
        stage.title,
      );
    }
    if (plan) return forge("기록 중인 검을 +7까지 재련하면 칼날 연마가 열립니다.");
    return forge(
      s.weapon.level < 7
        ? "무기를 +7까지 벼려 서리결 장검으로 진화시키세요. +13부터 사냥터에 배치할 수 있습니다."
        : "장착 무기 +" +
            s.weapon.level +
            " / +13. +12부터 실패하면 하락할 수 있습니다. 정령의 가호로 보호할 수 있어요.",
    );
  }
  function currentGuidance(s, step, target) {
    const b = s.bladeForge;
    const forge = text => target(text, "forge", ".forge-strike", "망치 찾기");
    const hunt = text => target(text, "forest", ".watch-start", "사냥 버튼 찾기");
    const temper = text => ({ ...target(text, "forge", '[data-open="temper"]', "담금질 찾기"), open: "temperGuide" });
    if (s.hunt) return hunt("진행 중인 사냥을 먼저 확인하세요. 찾기는 전투를 시작하거나 정산하지 않습니다.");
    if (step === 1) return hunt("짧게 누르면 이번 단계, 1초 꾹 누르면 연속 사냥을 시작합니다.");
    if (step === 2) return temper("흰 바늘이 초록 구간에 닿을 때 모루를 두드리세요. 빗나가도 골드를 얻습니다.");
    if (step === 3 && s.best >= 3) return target("달성한 첫 의뢰의 보상을 받으세요.", "forge", '[data-act="order"]', "의뢰 찾기");
    if (step === 5 && (b.deployed || b.extraDeployed || s.unclaimed >= 1))
      return target(s.unclaimed >= 1 ? "모인 배치 수익을 수령하세요." : "배치한 무기가 골드를 모으고 있습니다. 1 G 이상 모이면 수령할 수 있습니다.", "forest", '[data-act="collect"]', "배치 수익 찾기");
    if (step >= 4) {
      const spare = b.items.find(g => g.id !== b.equipped && g.id !== s.hunt?.bladeId && !g.soulChoice && g.level >= 13);
      if (spare) return { ...target("보관한 +13 이상 무기의 상세에서 사냥터 배치를 고르세요.", "forge", '[data-act="bladeDeploy"]', "배치 찾기"), open: "bladeItem-" + spare.id };
      const growing = b.items.find(g => g.id !== b.equipped && !g.soulChoice);
      return target(growing ? "여분 무기를 장착해 +13까지 강화한 뒤 다른 무기로 바꾸면 배치할 수 있습니다." : "숲에서 여분 무기를 얻으세요. +13까지 강화한 여분 무기를 배치할 수 있습니다.", growing ? "forge" : "forest", growing ? '[data-open="bladeCollection"]' : '.watch-start', growing ? "무기함 찾기" : "사냥 버튼 찾기");
    }
    const item = Game.blades.current(s);
    if (s.gold < Game.blades.cost(item))
      return temper("강화비가 부족합니다. 무료 담금질로 골드를 마련하세요.");
    return forge(step === 3 ? "현재 무기를 +3까지 강화해 첫 의뢰를 달성하세요." : "현재 무기의 망치를 눌러 첫 강화를 시도하세요.");
  }
  // Read-only next-goal target. A saved but stopped hunt is resumed from the forest
  // hunt button; locating it never starts or settles the hunt.
  function target(s, step = next(s)) {
    if (step < 0) return null;
    if (s.hunt?.exploration?.kind === "cart") return cartTip();
    if (s.hunt) return { text: "저장된 사냥이 남아 있습니다. 숲의 사냥 버튼으로 이어 가세요. 찾기는 사냥을 시작하지 않습니다.",
      route: "forest", selector: ".watch-start", button: "사냥 재개" };
    return guidance(s, step);
  }
  // The automatic prompt follows the persisted tutorial flag; missing means on.
  function prompt(s) {
    const step = next(s);
    if (step < 0 || s.apprentice.auto === false) return null;
    const tip = target(s, step);
    return { step, title: lessons[step][1], ...tip };
  }
  return { lessons, restore, completed, next, guidance, target, prompt };
})();
if (typeof module !== "undefined") module.exports = Apprentice;
