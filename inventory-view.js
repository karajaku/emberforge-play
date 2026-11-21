"use strict";

const InventoryView = (() => {
  const forgeButton = (type, label) =>
    '<button class="action" data-go="forge" data-gear="' + type + '">' + label + '</button>';

  function equipment(s, g, type, key, index) {
    const stored = key.startsWith("stored-");
    const deployed = key.startsWith("field-");
    const status = stored ? "" : deployed ? "배치" : type === "weapon" ? "기록 검" : "기록";
    return {
      key, group: "gear", name: Game.name(g, type), mark: "+" + fmt(g.level),
      art: gearPortrait(g, type), status,
      detail() {
        const weapon = type === "weapon", journey = Game.isJourneyGear(s, g);
        const stats = stored || deployed ? Game.stats({ ...s, weapon: g }) : Game.stats(s);
        let info = line("장비", escapeHtml([tier(g, type), status || "보관 중"].join(" · "))) +
          line(weapon ? (stored || deployed ? "장착 시 공격력" : "공격력") : "체력", fmt(weapon ? stats.attack : stats.hp));
        const craft = craftSummary(g);
        if (craft) info += line("제작", escapeHtml(craft));
        if (journey && weapon) info += line("이력", "기록 중인 검");
        let actions;
        if (deployed) {
          info += line("배치 수익", fmt(Game.perMinute(g) / 6) + " G / 10초");
          actions = btn("recall", s.bag.length >= 20 ? "보관 무기 20칸 가득 참" : "보관함으로 회수", index, "primary", s.bag.length >= 20);
        } else if (stored) {
          actions = btn("equip", "장착", index, "primary");
          if (g.level >= 13 && !journey) {
            const full = s.field.length >= 2 + s.imprints.land;
            info += line("배치 수익", fmt(Game.perMinute(g) / 6) + " G / 10초");
            actions += btn("deploy", full ? "배치 공간 가득 참" : "사냥터 배치", index, "action", full);
          } else if (!journey) info += line("사냥터 배치", "+13부터");
        } else {
          actions = weapon ? '<button class="action" data-archive-blade>기록 검 대장간</button>' : '<button class="action" data-archive-blade="armor">기록 방어구 대장간</button>';
          if (weapon && (Game.canStoreWeapon(g) || journey)) {
            actions += btn("keep", s.bag.length >= 20 ? "보관 무기 20칸 가득 참" : "무기 보관", "", "action", s.bag.length >= 20);
          }
          if (!journey) actions += openBtn("sell-" + type, g.level >= 1 ? "판매" : "판매 조건");
        }
        return info + actions;
      },
    };
  }

  function entries(s) {
    const items = [
      ...Game.blades.state(s).items.map(item => ({key: "blade-"+item.id, group: "gear", name: Game.blades.rarityNames[item.grade]+" "+Game.blades.name(item), grade:item.grade, mark: "+"+item.level,
        art: BladeView.artwork(item), status: Game.endgame.info(s).deployed.includes(item.id) ? "배치" : item.ascended ? "초월" : Game.blades.current(s).id === item.id ? "주력" : "", detail: () => BladeView.itemDetail(s,item)})),
      ...Game.blades.armors(s).map(item => ({key:"huntarmor-"+item.id, group:"gear", name:Game.blades.rarityNames[item.grade]+" "+Game.blades.name(item), grade:item.grade, mark:"+"+item.level,
        art:BladeView.artwork(item), status:Game.blades.currentArmor(s).id===item.id?"장착":"", detail:()=>BladeView.armorDetail(s,item)})),
      ...OutfitView.entries(s),
      equipment(s, s.weapon, "weapon", "weapon"), equipment(s, s.armor, "armor", "armor"),
      ...s.bag.map((g, i) => equipment(s, g, "weapon", "stored-" + i, i)),
      ...s.field.map((g, i) => equipment(s, g, "weapon", "field-" + i, i)),
    ];
    for (const chest of s.chests) {
      const name = chest.name || ["나무 상자", "은장 상자", "황금 상자"][chest.tier] || "보물상자";
      items.push({ key: "chest-" + chest.id, group: "items", name, mark: "", art: '<i class="chest-art"></i>',
        detail: () => line("발견 장소", escapeHtml(chestOrigin(chest))) + btn("openChest", "상자 열기", escapeHtml(chest.id), "primary") });
    }

    function stack(key, name, count, art, description, actions, status = "", shortName = name) {
      if (count > 0) items.push({ key, group: "items", name, shortName, mark: "×" + fmt(count), art, status,
        detail: () => line("보유 수량", fmt(count)) + desc(description) + actions });
    }
    Game.blessings.forEach((name, i) => {
      const equipped = s.enabled[i], shortName = ["정령 가호", "대장장이 가호", "신의 가호"][i];
      stack("charm-" + i, name, s.charms[i], '<img src="assets/' + ["leaf", "hammer", "star"][i] + '.png" alt="">',
        guardLabels[i], btn("guard", equipped ? "장착 해제" : "장착", i, "primary"), equipped ? "장착" : "", shortName);
    });
    stack("scrolls", "10% 주문서", s.scrolls, icon("scroll-text"), "강화 시 기본 성공률 ×1.1",
      btn("scroll", s.scrollOn ? "장착 해제" : "장착", "", "primary"), s.scrollOn ? "장착" : "");
    stack("tanks", "산소통", s.tanks, icon("waves"), "심해 광산 탐사에 사용합니다.", go("mine", "광산으로", "action"));
    stack("shards", "별의 파편", s.shards, icon("sparkles"), "별의 제단에서 장비를 각성하거나 대표 유물을 강화합니다.",
      go("altar", "별의 제단으로", "action") + openBtn("relicWorkshop", "유물 강화"));
    stack("fiber", "숲결 섬유", s.forestFiber, icon("trees"), "방어구의 숲 방호 안감을 제작하고 보강합니다.", forgeButton("armor", "방어구로"));
    stack("tickets", "탑 입장권", s.tickets, icon("ticket"), "도전의 탑 등반에 사용합니다.", go("tower", "도전의 탑으로", "action"));
    stack("stones", "전설 제련석", s.stones, icon("gem"), "전설 무기의 초월 합성에 사용합니다.", openBtn("fusion", "합성 재료 보기"));
    stack("marks", "길드 징표", s.marks, icon("castle"), "개인 길드 창설에 사용합니다.", openBtn("guild", "길드 열기"));
    stack("clues", "단조 단서", s.forgeClues, icon("book-open"), "단조 수첩에서 집중 강화와 최고점 복구에 사용합니다.", forgeButton("weapon", "대장간으로"));
    s.ore.forEach((count, i) => stack("ore-" + i, Game.oreNames[i], count, icon("gem"),
      "광물 시장에서 현재 시세로 판매할 수 있습니다.", openBtn("market", "광물 시장")));
    for (const scroll of RelicShop.scrolls) stack("relic-scroll-" + scroll.id, scroll.name, RelicShop.owned(s, scroll),
      icon("scroll-text"), scroll.text, openBtn("relicWorkshop", "대표 유물 강화"));
    s.relics.forEach((relic, i) => {
      const equipped = s.equippedRelic === i;
      items.push({ key: "relic-" + i, group: "relics", name: "새벽의 인장", mark: "+" + relic.power + "%",
        art: icon("star"), status: equipped ? "대표" : "",
        detail: () => line("레이드 공격력", "+" + relic.power + "%") +
          (relic.extraAttack ? line("추가 공격력", "+" + relic.extraAttack) : "") +
          line("남은 강화", (10 - relic.tries) + "회") + line("복구 가능한 실패", relic.failures + "회") +
          (equipped ? openBtn("relicWorkshop", "대표 유물 강화") : btn("relic", "대표 지정", i, "primary")) });
    });
    return items;
  }

  function tile(item) {
    const label = [item.name, item.mark, item.status].filter(Boolean).join(" ");
    return '<button class="bag-slot" data-rarity="'+(item.grade ?? "")+'" data-group="' + item.group + '" data-open="' + escapeHtml(item.open || "inventory-" + item.key) +
      '" aria-label="' + escapeHtml(label) + '" aria-haspopup="dialog">' +
      '<span class="bag-slot-art" aria-hidden="true">' + item.art + '</span>' +
      (item.status ? '<small class="bag-slot-status">' + item.status + '</small>' : '') +
      '<b class="bag-slot-name">' + escapeHtml(item.shortName || item.name) + '</b>' +
      (item.mark ? '<span class="bag-slot-mark">' + escapeHtml(item.mark) + '</span>' : '') + '</button>';
  }

  function grid(items) {
    return '<div class="bag-grid">' + items.map(tile).join("") + '</div>';
  }

  function view(s) {
    const page = phonePage("bag");
    const items = entries(s);
    if (page === "all") {
      return phonePages.bag.slice(1).map(([group, title]) => {
        const section = items.filter(item => item.group === group);
        if (!section.length) return "";
        return '<section class="bag-section" aria-labelledby="bag-title-' + group + '">' +
          '<div class="bag-section-head"><h2 id="bag-title-' + group + '">' + title + '</h2>' +
          (group === "gear" ? OutfitView.loadout() : "") + '</div>' + grid(section) + '</section>';
      }).join("");
    }
    const list = items.filter(item => page === item.group ||
      (page === "stored" && item.key.startsWith("stored-")));
    let html = list.length ? grid(list) :
      desc(({stored: "보관 중인 무기가 없습니다.", items: "보유한 소지품이 없습니다.", relics: "보유한 유물이 없습니다."})[page]);
    if (page === "stored") html += line("보관 무기", s.bag.length + " / 20") + go("bag", "전체 보기", "action");
    if (page === "relics") html += line("보관 유물", s.relics.length + " / 20") + openBtn("shop", "포인트 상점");
    return (page === "gear" ? OutfitView.loadout() : "") + html;
  }

  function menu(s, key) {
    const item = entries(s).find(item => item.key === key);
    if (!item) return ["아이템", desc("이미 사용했거나 옮긴 아이템입니다.")];
    return [item.name + (item.group === "gear" ? " " + item.mark : ""),
      '<div class="bag-detail-art" aria-hidden="true">' + item.art + '</div>' + item.detail()];
  }
  return { view, menu };
})();
