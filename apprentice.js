"use strict";

const Apprentice = (() => {
  const lessons = [
    ["forge", "첫 검 벼리기"],
    ["hunt", "이끼숲 첫 토벌"],
    ["temper", "담금질 익히기"],
    ["order", "첫 의뢰 보상 받기"],
    ["deploy", "검으로 사냥터 운영하기"],
    ["collect", "첫 사냥 수익 받기"],
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
      s.apprentice.deployed || s.field.length > 0,
      s.apprentice.collected,
    ];
  }

  function next(s) {
    return completed(s).findIndex((done) => !done);
  }

  function guidance(s, step) {
    const target = (text, route, selector, button) => ({ text, route, selector, button });
    const forge = (text) =>
      target(text, "forge", '[data-act="enhance"][data-arg="weapon"]', "강화 버튼 찾기");
    const forest = (text, action, button) =>
      target(text, "forest", '[data-act="' + action + '"]', button);
    const needsWeapon =
      step === 0 ||
      (step === 3 && s.best < 3) ||
      (step >= 4 &&
        !s.field.length &&
        !s.bag.some((g) => g.level >= 13) &&
        s.weapon.level < 13 &&
        !(step === 5 && s.unclaimed >= 1));
    const craftIndex = Swordcraft.stageIndex(s.weapon);
    const craftLesson = step >= 4 && needsWeapon && craftIndex >= 0;
    const neededGold = craftLesson
      ? Swordcraft.fee(s.weapon, Game.price, craftIndex)
      : s.enabled[2] && s.charms[2]
        ? 0
        : Game.price(s.weapon);
    if (needsWeapon && s.gold < neededGold) {
      if (s.chests?.length) return target("보관함에 남겨 둔 보물상자를 열어 강화비를 마련하세요.", "bag", '[data-act="openChest"]', "상자 열기");
      const order = Game.orders[s.order];
      if (order && s.best >= order[0])
        return target(
          "달성한 의뢰 보상으로 강화비를 마련하세요.",
          "forge",
          '[data-act="order"]',
          "의뢰 수령",
        );
      if (s.hunt) return guidance(s, 1);
      return forest(
        "강화비가 " +
          (neededGold - s.gold).toLocaleString("ko-KR") +
          " G 부족합니다. 숲에서 골드를 벌거나 모험 지도에서 출석 보급품을 받으세요.",
        "huntStart",
        "사냥터",
      );
    }
    if (step === 0) {
      const next = { ...s, weapon: { ...s.weapon, level: s.weapon.level + 1 } };
      return forge(
        "무기를 강화해 공격력을 " +
          Game.stats(s).attack +
          " → " +
          Game.stats(next).attack +
          "으로 올리세요.",
      );
    }
    if (step === 1) {
      const h = s.hunt;
      if (!h)
        return forest(
          "방금 벼린 검을 써볼 차례입니다. 이끼숲에서 첫 멧돼지를 토벌하세요.",
          "huntStart",
          "사냥 시작",
        );
      if (h.counter)
        return forest(
          "지금 베면 2.5배 반격입니다. 명중시키고 이기면 토벌 골드도 25% 늘어납니다.",
          "strike",
          "반격",
        );
      if (Game.huntCharge(h))
        return forest(
          "멧돼지가 돌진을 준비합니다. 이번 턴에 방어하면 다음 베기가 반격으로 바뀝니다.",
          "block",
          "돌진 방어",
        );
      return forest("멧돼지가 일반 공격을 준비합니다. 베기로 먼저 타격하세요.", "strike", "베기");
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
        ? forge("검을 +3까지 벼리세요. 첫 의뢰에서 1,200 G와 별의 파편을 받을 수 있습니다.")
        : target(
            "첫 의뢰를 달성했습니다. 대장간의 의뢰에서 수령을 누르세요.",
            "forge",
            '[data-act="order"]',
            "의뢰 수령",
          );
    if (step === 5 && (s.unclaimed >= 1 || s.field.length))
      return forest(
        "배치한 검이 골드를 모읍니다. 누적 수익이 1 G 이상이면 수령하세요.",
        "collect",
        "수익 수령",
      );
    const bagIndex = s.bag.findIndex((g) => g.level >= 13);
    if (bagIndex !== -1)
      return target(
        "보관 무기에서 배치를 누르세요. 이 검은 게임을 닫아도 골드를 모읍니다.",
        "bag",
        '[data-act="deploy"][data-arg="' + bagIndex + '"]',
        "사냥터 배치",
      );
    if (s.weapon.level >= 13)
      return target(
        "장착한 검을 먼저 보관하세요. 손에는 새 +0 검이 남고 보관한 검은 배치하거나 다시 장착할 수 있습니다.",
        "bag",
        '[data-act="keep"]',
        "무기 보관",
      );
    const o = Game.orders[s.order];
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
    return forge(
      s.weapon.level < 7
        ? "무기를 +7까지 벼려 서리결 장검으로 진화시키세요. +13부터 사냥터에 배치할 수 있습니다."
        : "장착 무기 +" +
            s.weapon.level +
            " / +13. +12부터 실패하면 하락할 수 있습니다. 정령의 가호로 보호할 수 있어요.",
    );
  }
  return { lessons, restore, completed, next, guidance };
})();
if (typeof module !== "undefined") module.exports = Apprentice;
