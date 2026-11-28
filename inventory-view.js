"use strict";

const GearCompareView = (() => {
  const number = value => value.toLocaleString("ko-KR", {maximumFractionDigits: 2});
  const signed = value => (value < 0 ? "−" : "+") + number(Math.abs(value));
  const tone = delta => delta > 0 ? "up" : delta < 0 ? "down" : "same";

  function score(comparison, compact = false) {
    const {score, delta} = comparison;
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "";
    const text = compact && score >= 100000 ? score.toLocaleString("ko-KR", {notation:"compact", maximumFractionDigits:1}) : number(score);
    return '<span class="gear-score" data-tone="' + tone(delta) + '"><small>전투력</small> <b>' +
      text + (arrow ? ' <i aria-hidden="true">' + arrow + '</i>' : "") + '</b></span>';
  }

  function accessible(comparison) {
    const {score, delta} = comparison;
    const difference = delta ? ", 현재보다 " + number(Math.abs(delta)) + (delta > 0 ? " 높음" : " 낮음") : "";
    return "전투력 " + number(score) + difference;
  }

  function detail(comparison, type, totals = []) {
    const {current, equipped, score, delta, rows} = comparison;
    let name;
    if (current) {
      if (type === "outfit") name = Game.outfit.name(current);
      else if (type === "legacyWeapon" || type === "legacyArmor") name = Game.name(current, type === "legacyWeapon" ? "weapon" : "armor");
      else name = Game.blades.name(current);
      name += " +" + number(current.level);
    }
    const slot = Game.outfit.slots.find(it => it.key === comparison.slot);
    const heading = equipped ? "착용 중" : (type === "outfit" && slot ? slot.name + " 기준" : "비교 기준");
    function difference(value, unit, showZero = false) {
      if (value) return '<b data-tone="' + tone(value) + '">' + signed(value) + unit + '</b>';
      return showZero ? '<span class="gear-equal">0' + unit + '</span>' : '<span class="gear-equal" aria-label="변화 없음">—</span>';
    }
    const th = label => '<th scope="col">' + label + '</th>';
    const row = (label, values) => '<tr><th scope="row">' + escapeHtml(label) + '</th>' +
      values.map(value => '<td>' + value + '</td>').join("") + '</tr>';
    function table(columns, body, kind) {
      return '<table class="' + kind + '"><thead><tr>' + columns.map(th).join("") + '</tr></thead><tbody>' + body + '</tbody></table>';
    }
    function itemRow(label, value, change) {
      return row(label, equipped ? [value] : [value, change]);
    }
    const outfit = type === "outfit";
    const columns = [outfit ? "장비 자체" : "능력치", outfit ? "수치" : equipped ? "현재" : "장착 시"];
    if (!equipped) columns.push("증감");
    // The attack interval is neither better nor worse by itself: seconds, and a change without a tone (hand-over §7.5).
    function interval(stat) {
      const change = Math.round(stat.value / 10) - Math.round(stat.before / 10);
      return itemRow(stat.label, HuntStrikes.interval(stat.value), change && stat.before ?
        '<span class="gear-equal">' + (change < 0 ? "−" : "+") + Math.abs(change) / 100 + '초</span>' : '<span class="gear-equal" aria-label="변화 없음">—</span>');
    }
    const individual = itemRow(outfit ? "장비 전투력" : "전투력", number(score), difference(delta, "")) + rows.map(stat =>
      stat.format === "interval" ? interval(stat) :
      itemRow(stat.label, number(stat.value) + stat.unit, difference(stat.delta, stat.deltaUnit))).join("");
    let body = table(columns, individual, "gear-item-stats");
    if (totals.length) {
      const headings = equipped ? ["착용 합계", "현재"] : ["착용 합계", "현재", "교체 후", "증감"];
      body += table(headings, totals.map(stat => {
        const values = [number(stat.before) + stat.unit];
        if (!equipped) values.push(number(stat.value) + stat.unit, difference(stat.delta, stat.deltaUnit, true));
        return row(stat.label, values);
      }).join(""), "gear-worn-stats");
    }
    return '<section class="gear-comparison"><div class="gear-baseline"><span>' + heading + '</span> <strong>' +
      (current ? GearGradeView.colored(current,name) : "빈칸") + '</strong></div>' + body + '</section>';

  }
  return {score, accessible, detail};
})();

const InventoryView = (() => {
  const forgeButton = (type, label) =>
    '<button class="action" data-go="forge" data-gear="' + type + '">' + label + '</button>';

  function equipment(s, g, type, key, index) {
    const stored = key.startsWith("stored-");
    const deployed = key.startsWith("field-");
    const comparison = Game.compareGear(s, g, type === "weapon" ? "legacyWeapon" : "legacyArmor");
    const status = stored ? "" : deployed ? "배치" : type === "weapon" ? "기록 검" : "기록";
    return {
      key, comparison, compareLabel:stored || deployed ? "기록 검 기준" : "", rarity:Game.blades.itemRarity(g), baseGrade:Game.grades[g.grade], group: "gear", name: Game.name(g, type), mark: "+" + fmt(g.level),
      art: gearPortrait(g, type), status,
      detail() {
        const weapon = type === "weapon", journey = Game.isJourneyGear(s, g);
        let info = GearGradeView.detail(g) + GearCompareView.detail(comparison, weapon ? "legacyWeapon" : "legacyArmor") +
          line("장비 상태", status || "보관 중");
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
        return info + (journey && weapon ? AffixView.options({...g,promotionGrade:g.grade}) + AffixView.link("j:"+g.recordId) : "") + actions;
      },
    };
  }

  function entries(s) {
    const bladeId = Game.blades.current(s).id, armorId = Game.blades.currentArmor(s).id;
    const items = [
      ...Game.blades.state(s).items.map(item => ({gearItem:item, comparison:Game.compareGear(s,item,"blade"), key: "blade-"+item.id, group: "gear", name: Game.blades.name(item), rarity:Game.blades.itemRarity(item), baseGrade:Game.blades.baseGradeNames[item.grade], mark: "+"+(item.growthLevel ?? item.level),
        wornSlot:item.id === bladeId ? "weapon" : "", id:item.id,
        art: BladeView.artwork(item), status: Game.endgame.info(s).deployed.includes(item.id) ? "배치" : item.ascended ? "초월" : item.id === bladeId ? "주력" : "", detail: () => BladeView.itemDetail(s,item)})),
      ...Game.blades.armors(s).map(item => ({gearItem:item, comparison:Game.compareGear(s,item,"chest"), key:"huntarmor-"+item.id, group:"gear", name:Game.blades.name(item), rarity:Game.blades.itemRarity(item), baseGrade:Game.blades.baseGradeNames[item.grade], mark:"+"+item.level,
        wornSlot:item.id === armorId ? "chest" : "", id:item.id,
        art:BladeView.artwork(item), status:item.id===armorId?"장착":"", detail:()=>BladeView.armorDetail(s,item)})),
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
    Game.affixes?.currency.forEach((name,i)=>stack("affix-"+(i+1),name,s.affixWallet?.counts?.[i] || 0,EmberView.art(i+1),AffixView.effects[i],openBtn("affix:list|"+(i+1),"세공할 장비 선택")));
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
    stack("fiber", "숲결 섬유", s.forestFiber, icon("trees"), "방어구의 숲 방호 안감을 제작하고 보강합니다.", openBtn("bladeArmorLining","안감 제작"));
    stack("tickets", "탑 입장권", s.tickets, icon("ticket"), "도전의 탑 등반에 사용합니다.", go("tower", "도전의 탑으로", "action"));
    stack("stones", "전설 제련석", s.stones, icon("gem"), "베이스 IV 무기의 초월 합성에 사용합니다.", openBtn("fusion", "합성 재료 보기"));
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

  function baseMark(item) {
    return item?.baseGrade ? '<small class="bag-base">' + item.baseGrade + '</small>' : "";
  }
  function tile(item) {
    const label = [item.rarity?.name, item.name, item.baseGrade, item.mark, item.status, item.affix, item.compareLabel, item.comparison && GearCompareView.accessible(item.comparison)].filter(Boolean).join(" ");
    return '<button class="bag-slot"' + GearGradeView.attribute(item.rarity) + ' data-group="' + item.group + '" data-open="' + escapeHtml(item.open || "inventory-" + item.key) +
      '" aria-label="' + escapeHtml(label) + '" aria-haspopup="dialog">' +
      '<span class="bag-slot-art" aria-hidden="true">' + item.art + '</span>' +
      (item.status ? '<small class="bag-slot-status">' + item.status + '</small>' : '') +
      baseMark(item) +
      (item.rarity?.key === 'unique' || item.gearItem?.corrupted ? '<small class="bag-slot-affix">'+[item.rarity?.key === 'unique'?'유니크':'',item.gearItem?.corrupted?'타락':''].filter(Boolean).join(' · ')+'</small>' : '') +
      '<b class="bag-slot-name">' + escapeHtml(item.shortName || item.name) + '</b>' +
      (item.affix ? '<small class="bag-slot-affix">'+escapeHtml(item.affix)+'</small>' : '')+
      (item.comparison ? GearCompareView.score(item.comparison,true) : '') +
      (item.compareLabel ? '<small class="bag-compare-label">' + escapeHtml(item.compareLabel) + '</small>' : '') +
      (item.mark ? '<span class="bag-slot-mark">' + escapeHtml(item.mark) + '</span>' : '') + '</button>';
  }

  function markMatchingGear(items) {
    const counts = new Map();
    for (const entry of items.filter(it=>it.gearItem)) {
      const key = entry.rarity.key+entry.name+entry.mark;
      counts.set(key,(counts.get(key)||0)+1);
    }
    for (const entry of items) {
      if (!entry.gearItem || counts.get(entry.rarity.key+entry.name+entry.mark)<2) continue;
      const mod = entry.gearItem.mods[0];
      entry.affix = mod?.ascended ? SoulView.recipes(entry.gearItem)[mod.ascended].name :
        mod ? AffixView.summary(mod,entry.gearItem) : "옵션 없음";
    }
  }
  function grid(items) {
    return '<div class="bag-grid">' + items.map(tile).join("") + '</div>';
  }
  function wornGear(s,items) {
    const slots = [{key:"weapon",name:"무기"}, ...Game.outfit.slots];
    const cells = slots.map(slot => {
      const item = items.find(entry => entry.wornSlot === slot.key);
      const part = {shoulder:"어깨", legs:"다리"}[slot.key] || slot.name;
      const name = item?.gearItem ? Game.blades.name(item.gearItem) : item?.name;
      const open = item ? item.open || "inventory-" + item.key : "outfit:slot:" + slot.key;
      const label = [slot.name, item ? item.rarity.name + " " + item.name + " " + item.baseGrade + " " + item.mark : "빈칸", item?.affix, item?.comparison && GearCompareView.accessible(item.comparison)].filter(Boolean).join(" · ");
      return '<button class="bag-slot bag-worn-slot" data-slot="' + slot.key + '" data-empty="' + !item +
        '" data-open="' + escapeHtml(open) + '"' + GearGradeView.attribute(item?.rarity) +
        (item ? ' data-item-id="' + escapeHtml(item.id) + '"' : '') + ' aria-haspopup="dialog" aria-label="' + escapeHtml(label) + '">' +
        '<span class="bag-worn-part">' + part + '</span><span class="bag-slot-art" aria-hidden="true">' +
        (item ? item.art : OutfitView.art(slot.kind)) + '</span>' +
        baseMark(item) +
        '<b class="bag-slot-name">' + escapeHtml(name || "빈칸") + '</b>' +
        (item?.affix ? '<small class="bag-slot-affix">' + escapeHtml(item.affix) + '</small>' : '') +
        (item ? GearCompareView.score(item.comparison,true) : '') +
        (item ? '<small class="bag-worn-level">' + item.mark + '</small>' : '') + '</button>';
    });
    return '<section class="bag-loadout" aria-labelledby="bag-worn-title"><h2 id="bag-worn-title">착용 장비 <small>방어력 ' + fmt(Game.blades.armorStats(s).armorRating) + '</small></h2>' +
      '<div class="bag-loadout-grid">' + cells.join("") + '</div></section>';
  }
  function storedSection(group, title, items) {
    if (!items.length) return "";
    return '<section class="bag-section" aria-labelledby="bag-title-' + group + '"><h2 id="bag-title-' +
      group + '">' + title + '</h2>' + grid(items) + '</section>';
  }

  function view(s) {
    const page = phonePage("bag");
    const all = entries(s);
    markMatchingGear(all);
    const items = all.filter(item => !item.wornSlot);
    if (page === "all") {
      return wornGear(s,all) + phonePages.bag.slice(1).map(([group, title]) =>
        storedSection(group,group === "gear" ? "보관 장비" : title,items.filter(item => item.group === group))).join("");
    }
    if (page === "gear") return wornGear(s,all) + storedSection("gear","보관 장비",items.filter(item => item.group === "gear"));
    const list = items.filter(item => page === item.group ||
      (page === "stored" && item.key.startsWith("stored-")));
    let html = list.length ? grid(list) :
      desc(({stored: "보관 중인 무기가 없습니다.", items: "보유한 소지품이 없습니다.", relics: "보유한 유물이 없습니다."})[page]);
    if (page === "stored") html += line("보관 무기", s.bag.length + " / 20") + go("bag", "전체 보기", "action");
    if (page === "relics") html += line("보관 유물", s.relics.length + " / 20") + openBtn("shop", "포인트 상점");
    return html;
  }

  function menu(s, key) {
    const item = entries(s).find(item => item.key === key);
    if (!item) return ["아이템", desc("이미 사용했거나 옮긴 아이템입니다.")];
    return [item.name + (item.group === "gear" ? " " + item.mark : ""),
      '<div class="bag-detail-art" aria-hidden="true">' + item.art + '</div>' + item.detail(), item.rarity];
  }
  return { view, menu };
})();
