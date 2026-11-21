"use strict";
const BladeEndgame = (() => {
  const blades = typeof module !== "undefined" ? require("./blade-rules.js") : BladeRules;
  const names = { luck: "행운", lung: "폐활량", land: "영토" };
  const costs = { luck: 5, lung: 10, land: 15 };
  const transform = {
    heavy: {
      key: "heavy",
      name: "관통 일격",
      cost: 3,
      detail: "기세 일격이 방어를 관통하고 재사용 대기가 1턴 늘어납니다.",
    },
    counter: {
      key: "counter",
      name: "철벽 반격",
      cost: 3,
      detail: "반격 피해가 20% 줄고, 반격 후 다음 피격 피해가 35% 줄어듭니다.",
    },
    wound: {
      key: "rupture",
      name: "잔상 파열",
      cost: 3,
      detail: "적마다 첫 파열 타격 피해가 25% 줄고, 파열 후 상처 1겹이 남습니다.",
    },
  };
  const armorTransform = {
    vitality: {
      key: "vitality",
      name: "생명의 매듭",
      cost: 3,
      detail: "적을 처치하면 최대 체력의 4%를 추가로 회복합니다. 처치할 때 체력이 절반 이하이면 10%를 회복합니다.",
    },
    plating: {
      key: "plating",
      name: "충격 분산",
      cost: 3,
      detail: "한 번의 피격이 최대 체력의 15%를 넘으면 초과분의 50%를 흡수합니다.",
    },
    bracing: {
      key: "bracing",
      name: "수호 봉합",
      cost: 3,
      detail: "적 스킬을 방어하면 최대 체력의 6%를 추가로 회복합니다. 해당 피격에서 생존해야 합니다.",
    },
    skillWard: {
      key: "skillWard",
      name: "술식 차폐",
      cost: 3,
      detail: "적 스킬로 받는 피해가 30% 줄고 일반 공격으로 받는 피해는 8% 늘어납니다.",
    },
  };
  const required = ["luck", "lung", "land"];
  const owns = (o, k) => Object.hasOwn(o, k);
  const fail = (message) => ({ ok: false, message });
  const ok = (message) => ({ ok: true, message, kind: "win" });
  function bossFamily(h) {
    return Math.floor(((h.territoryRank || 60) - 1) / 5) % 4;
  }
  function markArmor(b, h) {
    const armor = b.armors?.find((i) => i.id === h.armorId);
    if (armor) armor.bossProofs = (armor.bossProofs || 0) | (1 << bossFamily(h));
  }
  function record(s) {
    const b = blades.state(s);
    if (!b.soul)
      b.soul = { version: 1, first: false, claimed: false, learned: {}, tokens: [], bossSeals: [0, 0, 0, 0] };
    if (!b.armors && s.armor?.level >= 20) blades.armors(s);
    if (b.armors && b.soul.version === 1) {
      b.soul.version = 2;
      const last = s.lastHunt;
      if (last?.rank === 60 && last.chestId && last.bladeCombat) markArmor(b, last);
    }
    if (!b.soul.first && (b.items.some((i) => i.level === 20) || b.armors?.some((i) => i.level === 20)))
      b.soul.first = true;
    return b.soul;
  }
  function info(s) {
    const b = blades.state(s),
      r = record(s);
    const unlocked = Object.fromEntries(required.map((k) => [k, !!(r.learned[k] || s.imprints?.[k] > 0)]));
    return {
      gift: r.first && !r.claimed && required.some((k) => !unlocked[k]),
      first: r.first,
      unlocked,
      costs,
      tokens: r.tokens,
      deployed: [b.deployed, b.extraDeployed].filter(Boolean),
      bossSeals: r.bossSeals,
      names,
      souls: s.souls,
    };
  }
  function transferTargets(s, token) {
    const b = blades.state(s);
    const rack = token.id.startsWith("a") ? blades.armors(s) : b.items;
    return rack.filter(item => item.id !== token.id && item.id !== b.deployed && item.id !== b.extraDeployed &&
      !item.inherited && !item.soulChoice && blades.available(item).includes(token.key));
  }
  function victory(s, h) {
    if (h.rank !== 60) return "";
    const b = blades.state(s),
      item = b.items.find((i) => i.id === h.bladeId);
    if (!item || !owns(transform, h.bladeCombat?.style)) return "";
    const family = bossFamily(h);
    markArmor(b, h);
    const style = h.bladeCombat.style;
    (item.proofs ??= {})[style] = (item.proofs?.[style] || 0) | (1 << family);
    record(s).bossSeals[family]++;
    return " · " + ["황금엄니", "잿불 무리어미", "안개 비늘용", "천년 고목왕"][family] + " 초월 인장 +1";
  }
  function act(s, action, arg, rng) {
    if (!arg || typeof arg !== "object") return fail("대상과 선택을 확인하세요.");
    const b = blades.state(s),
      r = record(s),
      status = info(s);
    if (action === "soulLearn") {
      const { key, free } = arg;
      if (!owns(names, key) || typeof free !== "boolean" || status.unlocked[key])
        return fail("배울 영혼각인을 선택하세요.");
      if (!status.first) return fail("검신 또는 흉갑 +20을 먼저 완성하세요.");
      if (free) {
        if (!status.gift) return fail("첫 완성 선물을 이미 사용했습니다.");
        r.claimed = true;
      } else {
        if (status.gift) return fail("첫 무료 기술을 먼저 선택하세요.");
        if (s.souls < costs[key]) return fail("영혼 포인트가 부족합니다.");
        s.souls -= costs[key];
      }
      r.learned[key] = true;
      return ok(names[key] + " 영혼각인 습득");
    }
    const armor = typeof arg.id === "string" && arg.id.startsWith("a");
    const rack = armor ? b.armors || [] : b.items;
    const item = rack.find((i) => i.id === arg.id);
    if (!item || status.deployed.includes(item.id)) return fail("장비 상태와 대상을 확인하세요.");
    if (item.soulChoice && action !== "soulChoose") return fail("보관된 두 후보 중 하나를 먼저 확정하세요.");
    const mod = item.mods.find((m) => m.key === arg.key);
    switch (action) {
      case "soulRebirth": {
        if (
          item.level !== 20 ||
          item.id === (armor ? b.armorEquipped : b.equipped) ||
          item.id === (armor ? s.hunt?.armorId : s.hunt?.bladeId) ||
          !mod ||
          mod.ascended
        )
          return fail("장착·사냥 중인 장비를 보존하고 여분의 +20 장비에서 전승할 일반 옵션을 선택하세요.");
        const token = { id: item.id, key: mod.key, tier: mod.tier };
        r.tokens.push(token);
        rack.splice(rack.indexOf(item), 1);
        s.souls += 5;
        s.lifeSouls += 5;
        s.rebirths++;
        return ok(blades.name(item) + " 환생 · 영혼 +5 P · " + blades.modDefs[mod.key].name + " 전승 재료");
      }
      case "soulTransfer": {
        const index = r.tokens.findIndex((t) => t.id === arg.token),
          token = r.tokens[index];
        if (!token || !transferTargets(s,token).includes(item))
          return fail("같은 부위의 전승 이력이 없는 장비와 빈 옵션 자리가 필요합니다.");
        const tier = Math.min(token.tier, blades.maxTier(item.rank));
        item.mods.push(blades.rollValue(token.key, tier, rng));
        item.inherited = true;
        r.tokens.splice(index, 1);
        return ok(blades.modDefs[token.key].name + " 전승 · " + tier + "등급");
      }
      case "soulLuck": {
        if (!status.unlocked.luck || item.luckUsed || b.ore < 2)
          return fail("행운과 각인석 2개가 필요합니다. 장비당 한 번입니다.");
        const pool = blades.available(item);
        if (pool.length < 2) return fail("각인할 빈자리가 필요합니다.");
        const mods = [];
        for (let i = 0; i < 2; i++) {
          const [key] = pool.splice(blades.integer(0, pool.length - 1, rng), 1);
          mods.push(blades.rollMod(key, item.rank, rng));
        }
        b.ore -= 2;
        item.luckUsed = true;
        item.soulChoice = { type: "luck", mods };
        return ok("행운 · 두 옵션 중 하나를 선택하세요.");
      }
      case "soulPolish": {
        if (!status.unlocked.lung || item.lungUsed || b.ore < 3 || !mod || mod.ascended)
          return fail("폐활량과 각인석 3개가 필요합니다. 장비당 한 번입니다.");
        if (mod.value === blades.modDefs[mod.key].ranges[mod.tier - 1][1]) return fail("이미 등급 최고치입니다.");
        b.ore -= 3;
        item.lungUsed = true;
        item.soulChoice = { type: "lung", mods: [{ ...mod }, blades.rollValue(mod.key, mod.tier, rng)] };
        return ok("폐활량 · 기존 수치와 연마 수치 중 하나를 선택하세요.");
      }
      case "soulChoose": {
        if (!item.soulChoice || ![0, 1].includes(arg.index)) return fail("저장된 후보를 확인하세요.");
        const choice = item.soulChoice.mods[arg.index];
        if (item.soulChoice.type === "luck") item.mods.push(choice);
        else item.mods[item.mods.findIndex((m) => m.key === choice.key)] = choice;
        delete item.soulChoice;
        return ok(
          blades.modDefs[choice.key].name +
            " +" +
            choice.value +
            (choice.key === "plating" ? "%p" : "%") +
            " 확정",
        );
      }
      case "soulAscend": {
        const { style, family } = arg;
        const definitions = armor ? armorTransform : transform;
        if (!owns(definitions, style) || !Number.isInteger(family) || family < 0 || family > 3)
          return fail("검술과 우두머리를 확인하세요.");
        const proof = armor ? item.bossProofs : item.proofs?.[style];
        const change = definitions[style],
          line = item.mods.find((m) => m.key === change.key);
        if (
          b.cleared < 60 ||
          item.level !== 20 ||
          item.ascended ||
          !line ||
          !(proof & (1 << family)) ||
          r.bossSeals[family] < change.cost
        )
          return fail(
            armor
              ? "흉갑 +20·해당 접두·착용 중 60단계 처치·같은 우두머리 인장 3개가 필요합니다."
              : "검신 +20·해당 접두·이 검과 검술의 60단계 처치·같은 우두머리 인장 3개가 필요합니다.",
          );
        line.ascended = style;
        line.value = 0;
        item.ascended = { style, family };
        r.bossSeals[family] -= change.cost;
        return ok(blades.name(item) + " · " + change.name + " 초월");
      }
      default:
        return fail("알 수 없는 영혼 작업입니다.");
    }
  }
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  function valid(b) {
    const r = b.soul,
      items = [...b.items, ...(b.armors || [])];
    const ids = new Set(items.map((i) => i.id));
    if (r !== undefined) {
      if (
        !r ||
        ![1, 2].includes(r.version) ||
        (r.version === 2 && !b.armors) ||
        typeof r.first !== "boolean" ||
        typeof r.claimed !== "boolean" ||
        (r.claimed && !r.first) ||
        !r.learned ||
        Array.isArray(r.learned) ||
        typeof r.learned !== "object" ||
        !Object.entries(r.learned).every(([k, v]) => owns(names, k) && v === true) ||
        !Array.isArray(r.tokens) ||
        !Array.isArray(r.bossSeals) ||
        r.bossSeals.length !== 4 ||
        !r.bossSeals.every(count)
      )
        return false;
      for (const t of r.tokens) {
        if (
          !t ||
          typeof t.id !== "string" ||
          !/^[ab][1-9]\d*$/.test(t.id) ||
          (t.id[0] === "a" && (r.version !== 2 || !b.armors)) ||
          Number(t.id.slice(1)) > (t.id[0] === "a" ? b.armorSerial : b.serial) ||
          ids.has(t.id) ||
          !owns(blades.modDefs, t.key) ||
          owns(blades.armorDefs, t.key) !== (t.id[0] === "a") ||
          ![1, 2, 3, 4].includes(t.tier)
        )
          return false;
        ids.add(t.id);
      }
    }
    for (const i of items) {
      const armor = i.type === "armor";
      const definitions = armor ? armorTransform : transform;
      if (
        armor &&
        [i.bossProofs, i.luckUsed, i.lungUsed, i.inherited, i.ascended, i.soulChoice].some(
          (v) => v !== undefined,
        ) &&
        r?.version !== 2
      )
        return false;
      if (i.bossProofs !== undefined && (!armor || !count(i.bossProofs) || i.bossProofs > 15)) return false;
      if (![i.luckUsed, i.lungUsed, i.inherited].every((v) => v === undefined || (r && v === true))) return false;
      if (
        i.proofs !== undefined &&
        (armor ||
          !r ||
          !i.proofs ||
          typeof i.proofs !== "object" ||
          Array.isArray(i.proofs) ||
          !Object.entries(i.proofs).every(([k, v]) => owns(transform, k) && count(v) && v <= 15))
      )
        return false;
      const marked = i.mods.filter((m) => m.ascended !== undefined);
      if (i.ascended !== undefined || marked.length) {
        const a = i.ascended;
        if (
          !r ||
          !a ||
          i.level !== 20 ||
          !owns(definitions, a.style) ||
          ![0, 1, 2, 3].includes(a.family) ||
          !((armor ? i.bossProofs : i.proofs?.[a.style]) & (1 << a.family)) ||
          marked.length !== 1 ||
          marked[0].ascended !== a.style ||
          marked[0].key !== definitions[a.style].key ||
          marked[0].value !== 0
        )
          return false;
      }
      if (i.soulChoice !== undefined) {
        const q = i.soulChoice;
        if (
          !r ||
          !q ||
          !Array.isArray(q.mods) ||
          q.mods.length !== 2 ||
          !q.mods.every((m) => blades.validMod(m, i.rank))
        )
          return false;
        const [a, z] = q.mods;
        if (q.type === "luck") {
          if (!i.luckUsed || a.key === z.key || !q.mods.every((m) => blades.available(i).includes(m.key)))
            return false;
        } else if (
          q.type !== "lung" ||
          !i.lungUsed ||
          a.key !== z.key ||
          a.tier !== z.tier ||
          !i.mods.some((m) => m.key === a.key && m.tier === a.tier && m.value === a.value && !m.ascended)
        )
          return false;
      }
    }
    return true;
  }
  return { info, record, victory, transform, armorTransform, transferTargets, act, valid };
})();
if (typeof module !== "undefined") module.exports = BladeEndgame;
