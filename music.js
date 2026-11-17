"use strict";
// Pre-rendered original scores: no synthesis work on the gameplay/render thread.
const GameMusic = (() => {
  const titles = { forge: "불씨와 모루", world: "숯수레의 길", forest: "이끼숲의 숨결",
    mine: "물에 잠긴 갱도", depths: "심해의 맥박", tower: "수문장의 회랑", altar: "별빛의 순환",
    battle: "엄니와 칼날", trial: "마지막 한 단", rain: "비에 젖은 손님", home: "두 사람의 망치", triumph: "돌아오는 길" };
  let context, master, active, retiring, request, pending = "", desired = "forge";
  let enabled = true, hidden = false, volume = .35, generation = 0;
  const cache = new Map();
  function resolve({ route = "forge", modal = "", story, state = {}, page = "", towerMode = "infinite" } = {}) {
    if (modal === "storyScene" && story) return ({ intro: "rain", bridge: "forest", light: "altar" })[story.id] || "home";
    if (modal === "rebirth") return "altar";
    if (modal === "final") return "trial";
    if (modal === "craft") return state.weapon?.work?.index === 1 ? "battle" : "forge";
    if (modal === "temper") return "forge";
    if (modal === "treasure") return "triumph";
    if (modal === "battle") return "battle";
    if (route === "forest") return state.hunt && page !== "field" ? "battle" : "forest";
    if (route === "mine") return state.dive || state.autoMine ? "depths" : "mine";
    if (route === "tower") return state.towerRun || towerMode === "trial" ? "trial" : "tower";
    return ({ forge: "forge", world: "world", bag: "home", growth: "altar", altar: "altar" })[route] || "forge";
  }
  function dispose(voice) {
    if (!voice) return;
    try { voice.source.stop(); } catch {}
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function stop() {
    generation++;
    request?.abort(); request = null; pending = "";
    dispose(active); dispose(retiring); active = retiring = null;
  }
  function fade(voice, target, seconds) {
    const param = voice.gain.gain, now = context.currentTime;
    // cancelAndHold also handles a second navigation during the incoming fade.
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(target, now + seconds);
  }
  async function play() {
    if (!context || !enabled || hidden || !volume || active?.id === desired || pending === desired) return;
    const id = desired, ticket = ++generation;
    request?.abort();
    const controller = new AbortController(); request = controller; pending = id;
    try {
      let buffer = cache.get(id);
      if (!buffer) {
        const response = await fetch("assets/music/" + id + ".wav", { signal: controller.signal });
        if (!response.ok) throw new Error("Music unavailable");
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      }
      if (ticket !== generation || hidden || !enabled) return;
      cache.delete(id); cache.set(id, buffer);
      while (cache.size > 3) cache.delete(cache.keys().next().value);
      dispose(retiring); retiring = active;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true;
      gain.gain.value = 0; source.connect(gain); gain.connect(master);
      active = { id, source, gain };
      source.start(); fade(active, 1, 1.2);
      if (retiring) {
        const outgoing = retiring;
        fade(outgoing, 0, 1.2);
        outgoing.source.onended = () => {
          outgoing.source.disconnect(); outgoing.gain.disconnect();
          if (retiring === outgoing) retiring = null;
        };
        outgoing.source.stop(context.currentTime + 1.25);
      }
    } catch {
      // Offline/missing audio must never prevent gameplay. Retry on the next gesture.
    } finally {
      if (ticket === generation) { pending = ""; request = null; }
    }
  }
  function unlock() {
    if (!enabled || hidden || !volume) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio(); master = context.createGain();
        master.gain.value = volume * .65; master.connect(context.destination);
      }
      if (context.state !== "running") context.resume().catch(() => {});
      play();
    } catch {}
  }
  function update(id, options = {}) {
    desired = titles[id] ? id : "forge";
    enabled = options.enabled !== false; hidden = !!options.hidden;
    volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : .35;
    if (!enabled || hidden || !volume) {
      stop();
      if (context?.state === "running") context.suspend().catch(() => {});
      return;
    }
    // Cancel stale loading even if navigation returns to the currently playing cue.
    if (pending && pending !== desired) { generation++; request?.abort(); request = null; pending = ""; }
    if (context) {
      master.gain.setTargetAtTime(volume * .65, context.currentTime, .08);
      if (context.state === "suspended" || context.state === "interrupted") context.resume().catch(() => {});
      play();
    }
  }
  return { resolve, update, unlock, stop, titles };
})();
