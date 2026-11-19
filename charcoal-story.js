"use strict";

const CharcoalStory = (() => {
  const names = { dani: "수레꾼 단이", yeonhwa: "대장장이 연화" };
  const chapters = {
    intro: { title: "비에 젖은 손님", pages: 3, cover: "rain" },
    bridge: { title: "돌다리에 남은 것", pages: 2, cover: "willow" },
    home: { title: "돌아오는 소리", pages: 2, cover: "home" },
    bundle: { title: "수레에 실린 망치", pages: 3, cover: "tools" },
    light: { title: "칼끝까지 닿는 빛", pages: 3, cover: "lamplight" },
    lesson: { title: "두 사람의 첫 타격", pages: 2, cover: "hammers" },
  };
  const volumes = [
    { title: "숯수레의 방울", scenes: ["intro", "bridge", "home"] },
    { title: "두 번째 망치", scenes: ["bundle", "light", "lesson"] },
  ];
  const questions = { driver: "다친 사람은 없어요?", coal: "수레에 뭐가 실렸죠?" };
  const fresh = () => ({ intro: 0, bridge: 0, home: 0, bundle: 0, light: 0, lesson: 0,
    firstGift: null, soldOre: false, answer: "", quiet: false });
  function unlocked(s, id) {
    if (id === "intro") return true;
    if (id === "bridge") return s.huntBest > 0;
    if (!s.huntBest || !s.apprentice.collected) return false;
    if (id === "home" || id === "bundle") return true;
    if (id === "light") return s.best >= 20 || s.weapon.level === 20 || s.rebirths > 0;
    return id === "lesson" && s.rebirths > 0;
  }
  function restore(s) {
    if (s.story) return { ...fresh(), ...s.story };
    const story = fresh();
    if (s.attempts || s.hunt || s.lastHunt || s.huntBest || s.best || s.order ||
        s.day || s.rebirths || s.apprentice?.tempered || s.apprentice?.deployed) {
      for (const id of volumes[0].scenes)
        if (unlocked(s, id)) story[id] = chapters[id].pages;
    }
    return story;
  }
  function frame(id, page, answer, gift = null) {
    if (id === "bundle") {
      if (page === 0) return ["tools", "dani", "왼쪽 낫은 버드나무집 거고, 이 도끼는 우리 집 거예요. 다리 한 번 막혔다고 마을에 날 선 연장이 하나도 안 남았더라고요."];
      if (page === 1) return ["tools", "dani", "이 작은 망치는 제 거예요. 빈 수레에 장작 한 짐 더 실어 번 돈으로 샀어요. 다음엔 제가 저 낫 하나라도 갈아 드리고 싶어요. 옆에서 봐도 돼요?"];
      return ["ribbon", "yeonhwa", "단이야, 등잔을 들어라. 이제부터 이 사람이 검 한 자루를 +20까지 벼릴 거야. 날에 비친 불빛이 어디서 끊기고, 언제 칼끝까지 가는지 같이 보자."];
    }
    if (id === "light") {
      if (page === 0) return ["lamplight", "dani", "중간에서 두 동강 났던 불빛이…… 이제 칼끝까지 한 줄이에요. 이거 보여 주려고 매번 저더러 등잔을 들어 달라고 한 거예요?"];
      if (page === 1) return ["tools", "dani", "완성된 검을 보니까 어디가 무뎠는지는 알겠어요. 그런데 제 낫을 앞에 두니 망치를 어디부터 대야 할지 모르겠어요. 첫날부터 한 번만 같이 해 주실래요?"];
      return ["lamplight", "yeonhwa", "이대로 차고 나가도 좋다. 다시 가르쳐 볼 마음이면 환생 화로에 검을 놓으렴. 불에 넣은 검은 돌아오지 않아. 대신 네가 새긴 특성이 있다면 하나를 골라 다음 검의 첫 수업으로 남길 수 있어."];
    }
    if (id === "lesson") {
      if (page === 0) return ["embers", "yeonhwa", gift
        ? "불꽃이 가라앉는구나. 영혼 포인트 " + gift.points + "점은 네 몫이야. 어떤 각인에 쓸지는 새 검을 쥐어 보고 정하렴."
        : "다 됐다. 이리 와서 빈 모루를 만져 봐라. 전에 벼린 검의 온기가 아직 남았지?"];
      const practice = {
        edge: "예리한 날을 내던 손목 각도, 기억해요. 제가 등잔을 들 테니 첫 획을 다시 보여 주세요.",
        ward: "검등을 보강할 때는 등을 먼저 받쳤죠? 받침쇠는 제가 댈게요. 자, 이제 쳐 봐요.",
        yield: "개척자의 홈을 잡던 자리에 숯으로 금을 그어 뒀어요. 다음 검에도 같은 자리를 짚어 볼래요.",
      };
      return ["hammers", "dani", practice[gift?.trait] || "새 쇠는 여기 있어요. 오늘은 저도 앞치마를 맸어요. 제가 풀무를 밟을게요. 첫 망치 소리, 가까이서 듣고 싶어요."];
    }
    if (id === "intro") {
      if (page === 0) return ["rain", "dani", "원래 이 방울은 숯수레가 올 때 울려요. 오늘은 저 혼자 들고 왔어요."];
      if (page === 1) return ["bridge", "dani", answer === "driver"
        ? "아버지는 버드나무 위에 계세요. 멧돼지가 수레 밑에 코를 박고 꼼짝을 안 해요. 날이 밝으면 가지가 보일 텐데……."
        : "겨우내 말린 참숯이요. 비가 자루 밑까지 배면 못 써요. 멧돼지가 다리를 차지해서 덮개도 못 씌웠어요."];
      return ["ribbon", "yeonhwa", "네가 갈 테냐? 그럼 이 검부터 벼리자. 손잡이엔 내 앞치마 끈을 감아 주마. 젖은 손에도 놓치지 않게."];
    }
    if (id === "bridge") return page === 0
      ? ["willow", "dani", "아버지, 발은 왜 맨발이에요? ……아하. 저기요, 저 가지 좀 봐요. 짚신이 두 짝 열렸네!"]
      : ["ribbon", "yeonhwa", "수레는 건졌는데 내일도 이 길을 와야 한단다. 돌다리 초소에 둘 검 하나, 네 손으로 마저 만들어 보겠니?"];
    if (page === 0) return ["home", "dani", answer === "driver"
      ? "방울 소리 들었죠? 아버지가 직접 몰고 왔어요. 오늘은 신발도 두 짝 다 신고요."
      : answer === "coal" ? "마른 숯은 따로 골라 뒀어요. 이 자루는 연화 할머니 몫. 자, 손 넣어 봐요. 손끝이 새까매지죠?"
      : "들려요? 어제는 내 손에 있던 방울인데, 오늘은 수레에 매달려서 여기까지 왔어요."];
    return ["home", "yeonhwa", "이게 네 검이 번 첫 길삯이야. 네 몫은 네가 챙겨. 나는 숯불에 감자나 두 알 묻어야겠다."];
  }
  function dialogue(s, place, charging) {
    if (s.story.quiet) return null;
    if (s.story.home >= chapters.home.pages && unlocked(s, "bundle")) {
      if (!["forge", "forest", "growth", "bag"].includes(place) || (place === "forest" && s.hunt)) return null;
      if (s.rebirths) return s.story.lesson < chapters.lesson.pages
        ? ["dani", "작업대에 자리 하나 비워 뒀어요. 제 망치도 가져다 놨어요.", "lesson"] : null;
      if (s.story.bundle < chapters.bundle.pages)
        return ["dani", "감자 잘 먹었어요. 이번엔 빈 수레로 돌아가려 했는데…… 이 꾸러미, 저랑 한번 풀어 보실래요?", "bundle"];
      if (s.weapon.level === 20)
        return ["yeonhwa", "단이야, 등잔을 이리 비춰라. 이 검을 차고 나갈지, 화로에 돌려줄지는 벼린 사람이 정하는 거야.", "ritual"];
      if (place !== "forge") return ["dani", "수레는 세워 뒀어요. 오늘은 작업장에서 당신이 쇠 치는 걸 보려고요.", "forge"];
      if (s.weapon.level === 19) return ["dani", "등잔은 제가 잡을게요. 마지막 한 단, 어느 쪽에서 빛을 비춰 드릴까요?"];
      if (s.weapon.level >= 17) return ["yeonhwa", "단이가 실패한 자리까지 수첩에 그려 놨더라. 한 단 밀리거든 그 자국부터 같이 짚어 봐."];
      if (s.weapon.level >= 7) return ["dani", "날을 갈 때하고 검등을 받칠 때하고 손이 다르네요. 다음 검에도 꼭 남기고 싶은 솜씨가 있어요?"];
      return ["dani", "등잔을 모루 높이에 맞췄어요. 첫날의 쇠가 어떻게 빛나는지, 여기서부터 봐 둘게요."];
    }
    if (!["forge", "forest", "bag"].includes(place)) return null;
    if (s.hunt && !s.huntBest && place === "forest") {
      if (s.hunt.counter) return ["dani", "놈의 엄니가 돌 틈에 끼었어요. 지금이에요!"];
      return ["dani", charging
        ? "발굽으로 돌을 긁어요. 아까 수레를 들이받기 전에도 저랬어요!"
        : "저 버드나무 위에 사람이 보여요? 놈이 나무 쪽으로 못 가게 해 줘요."];
    }
    if (!s.huntBest && s.lastHunt && !s.lastHunt.reward)
      return ["yeonhwa", "이리 와서 손 좀 펴 봐라. 검은 다시 잡으면 돼. 다음엔 놈이 땅을 긁을 때 발을 딛고 버텨 봐."];
    if (!s.huntBest && s.best > 0)
      return ["dani", "쇳소리가 맑아졌어요. 이쪽이에요. 수레바퀴 자국을 따라가면 돌다리가 나와요.", place === "forest" ? "" : "forest"];
    if (!s.huntBest) return ["yeonhwa", "풀무는 내가 밟으마. 넌 모루 옆으로 와. 쇠가 식기 전에 첫 망치질은 네가 해 봐."];
    if (s.story.bridge < chapters.bridge.pages && !s.apprentice.deployed &&
        (!s.apprentice.tempered || place === "forest"))
      return ["dani", "잠깐만요. 다리 건너에서 누가 손을 흔들어요.", "bridge"];
    if (s.apprentice.deployed)
      return ["dani", "초소 문에 빨간 끈이 보이네요. 다음 수레꾼이 길삯을 맡기면 사냥터에서 받아 가세요.", place === "forest" ? "" : "forest"];
    if (s.weapon.level >= 13 || s.bag.some(g => g.level >= 13))
      return ["dani", "그 빨간 손잡이라면 멀리서도 알아보겠어요. 보관함에서 검을 초소로 보내 주세요.", place === "bag" ? "" : "bag"];
    if (!s.apprentice.tempered) return ["yeonhwa", "칼끝에 다릿돌을 긁은 자국이 났구나. 물통 가져와. 불에 올렸다가 같이 담가 보자."];
    if (!s.order) return ["dani", "아버지가 의뢰판에 당신 이름을 적어 놨어요. 삯을 그냥 두고 가지 말래요."];
    return ["yeonhwa", s.weapon.level >= 7
      ? "자루를 쥐어 봐. 내 손에 맞는 검하고 네 손에 맞는 검은 달라. 칼날을 어떻게 마무리할지는 네가 정해."
      : "저 빈 칼걸이가 보이지? 초소 사람이 내일 그걸 가지러 온단다. 오늘은 검 한 자루에 손 좀 들여 보자."];
  }
  return { names, chapters, volumes, questions, fresh, unlocked, restore, frame, dialogue };
})();
if (typeof module !== "undefined") module.exports = CharcoalStory;
