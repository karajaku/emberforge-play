"use strict";
// FP1 S1 (docs/first-person-view-design.md §9.3): the foreground hammer. It is drawn only for a judged strike on the
// equipment shown in the forge scene, inside that scene (above the item picture, below its caption, the rails and every
// control), never takes a touch and has no stand-in picture. It is not the effect node: busy() and onIdle() still describe
// only that node, so a hammer that stays raised between strikes never delays the automatic story (AT2-R1).
const ForgeHammer = (() => {
  const src = "assets/fp-hammer.webp", canvasW = 384, canvasH = 512;
  // Canvas points of the cleaned-up output (art/generated/first-person/postprocess.json): the grip (hand, never shown),
  // the striking face under the head and the head's centre and box.
  const grip = [238, 430], face = [13, 143], head = [59, 131], headBox = [5, 85, 124, 184];
  const contactTurn = -59.2;      // the handle lies flat with the head to the left and the face down
  const holdTurn = -40, holdInset = 56, margin = 6, minWidth = 100;
  const capPoint = [262, 478];      // the handle's end (copper cap)
  // Idle frame of each equipment sheet (128×144 cell): ink box, and the contact in its lower third (x, y, and how far
  // right the contact may slide along that band to keep the grip past the scene edge).
  const sheets = {
    blade: [[44, 16, 89, 129], [68, 101, 77]], blade1: [[45, 13, 95, 129], [68, 100, 75]],
    blade2: [[38, 12, 92, 130], [63, 101, 81]], blade3: [[40, 14, 92, 131], [64, 102, 80]],
    "blade-axe": [[13, 10, 101, 131], [71, 101, 74]], "blade-mace": [[23, 12, 84, 131], [71, 101, 74]],
    "blade-dagger": [[30, 25, 88, 131], [66, 105, 69]], cuirass: [[30, 34, 103, 106], [67, 88, 85]],
  };
  const fallback = [[.06, .06, .94, .94], [.5, .75, .62]]; // a square icon (outfit atlas) or an unknown sheet, as fractions
  let image = null, broken = false, clip = null, sprite = null, track = null;
  if (typeof Image === "function") {
    image = new Image();
    image.className = "fp-hammer";
    image.alt = ""; image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    image.onload = () => image.decode?.().catch(() => {});
    image.onerror = () => {
      broken = true;
      console.error("[FP1] 전경 망치 그림을 불러오지 못했습니다: " + src + " · 망치 없이 타격 효과만 보입니다");
    };
    image.src = src;
  }
  const ready = () => !!image && !broken && image.complete && image.naturalWidth > 0;
  const rad = deg => deg * Math.PI / 180;
  const turn = ([x, y], deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [x * c - y * s, x * s + y * c]; };
  const visible = n => n && n.getClientRects().length && getComputedStyle(n).visibility !== "hidden";
  // The grip position (viewport px) that puts canvas point `p` at `at` with the turn `r`.
  const place = (g, p, at, r) => { const [dx, dy] = turn([(p[0] - grip[0]) * g.k, (p[1] - grip[1]) * g.k], r); return {x: at[0] - dx, y: at[1] - dy, r}; };
  const pointOf = (g, pose, p) => { const [dx, dy] = turn([(p[0] - grip[0]) * g.k, (p[1] - grip[1]) * g.k], pose.r); return [pose.x + dx, pose.y + dy]; };
  function headExtent(g, r) {
    const pts = [[headBox[0], headBox[1]], [headBox[2], headBox[1]], [headBox[0], headBox[3]], [headBox[2], headBox[3]]]
      .map(p => turn([(p[0] - head[0]) * g.k, (p[1] - head[1]) * g.k], r));
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  }
  // Everything a strike needs from the current forge screen, or null when it shows no equipment picture.
  function geometry(host) {
    const scene = host?.closest?.(".scene") || host;
    if (!scene?.querySelector) return null;
    const art = [...scene.querySelectorAll("canvas[data-sprite], .outfit-art")].find(visible);
    if (!art) return null;
    // The hammer is clipped by the padding box of the picture's holder (the slide, or the scene itself).
    const holder = art.parentElement, hb = holder.getBoundingClientRect(), a = art.getBoundingClientRect();
    const left = hb.left + holder.clientLeft, top0 = hb.top + holder.clientTop;
    const box = {left, top: top0, right: left + holder.clientWidth, bottom: top0 + holder.clientHeight, width: holder.clientWidth, height: holder.clientHeight};
    if (box.width < 60 || a.width < 20 || a.bottom < 0 || a.top > innerHeight) return null;
    const known = art.tagName === "CANVAS" && sheets[art.dataset.sprite];
    const [ink, cell] = known || fallback;
    const fx = known ? v => v / art.width : v => v, fy = known ? v => v / art.height : v => v;
    const at = (vx, vy) => [a.left + fx(vx) * a.width, a.top + fy(vy) * a.height];
    const inkBox = [...at(ink[0], ink[1]), ...at(ink[2], ink[3])];
    // §16 A2: 390·414 about 200 (205 at most); 320 about 175, and never more than 1.5 × the item's own pixel
    // (a hammer pixel is 4 canvas px). With the result notice open, 320 shows the item small; too small, no hammer.
    const itemPixel = a.height / (known ? art.height : 96), narrow = box.width < 330;
    const width = Math.min(narrow ? 175 : 200, Math.floor(1.5 * itemPixel * canvasW / 4));
    if (width < minWidth) return {contact: at(cell[0], cell[1]), tooSmall: true};
    const g = {scene, art, clip: box, width, k: width / canvasW, narrow, scale: width / (narrow ? 175 : 200),
      item: inkBox, upper: [inkBox[0], inkBox[1], inkBox[2], inkBox[1] + (inkBox[3] - inkBox[1]) * 2 / 3],
      swing: known ? at(116, 0)[0] : inkBox[2]}; // the struck frames of every sheet reach x 116 of the cell
    // The contact slides right along the lower-third band only as far as needed to keep the grip past the scene edge.
    const reach = -turn([(face[0] - grip[0]) * g.k, (face[1] - grip[1]) * g.k], contactTurn)[0];
    const [cx, cy] = at(cell[0], cell[1]), cxMax = at(cell[2], cell[1])[0];
    g.contact = [Math.min(cxMax, Math.max(cx, box.right + 3 - reach)), cy];
    // Flat handle first; if the grip would still show (320 with the notice open), lay the handle down toward the
    // lower-right corner until the grip and the handle's end are past the scene's right or bottom edge (§16 A2).
    const hidden = pose => [grip, capPoint].every(p => { const [x, y] = pointOf(g, pose, p); return x >= box.right + 2 || y >= box.bottom + 2; });
    g.turn = contactTurn;
    for (let r = contactTurn; r <= contactTurn + 40; r += 2) { g.turn = r; if (hidden(place(g, face, g.contact, r))) break; }
    if (!hidden(place(g, face, g.contact, g.turn))) return {contact: g.contact, tooSmall: true};
    // Room to stay raised: below the lowest control of the right rail, above the caption (name and summary) and the
    // step row, right of the item's upper two-thirds.
    const rail = [...document.querySelectorAll(".ui-forge-rail button, .forge-side-actions button, .forge-disposal button")]
      .filter(visible).map(n => n.getBoundingClientRect()).filter(r => r.right > box.right - 90 && r.left > box.left + box.width / 2);
    const caption = [...scene.querySelectorAll(".caption")].filter(visible).map(n => n.getBoundingClientRect().top);
    const top = Math.max(box.top, ...rail.map(r => r.bottom)) + margin;
    const bottom = Math.min(box.bottom, ...caption) - margin;
    const [x0, y0, x1, y1] = headExtent(g, holdTurn);
    const hx = box.right - holdInset;
    // Below the item's upper two-thirds when the zone allows (the struck item swings right for half a second),
    // otherwise in the middle of the zone when the head is clear of the item.
    const mid = (top + bottom) / 2 - (y0 + y1) / 2, low = g.upper[3] + margin - y0, fits = y => y + y0 >= top && y + y1 <= bottom;
    let hy = null;
    if (hx + x0 >= g.swing + margin || mid + y0 >= g.upper[3] + margin) hy = mid;
    else if (fits(Math.max(mid, low))) hy = Math.max(mid, low);
    else if (hx + x0 >= g.upper[2] + margin) hy = mid;
    g.hold = hy != null && fits(hy) ? place(g, head, [hx, hy], holdTurn) : null;
    g.zone = [box.right - 90, top, box.right, bottom];
    return g;
  }
  // CSS timing functions of the keys, so a strike that arrives mid-motion starts from where the hammer is drawn.
  const curves = {linear: [0, 0, 1, 1], "ease-in": [.42, 0, 1, 1], "ease-out": [0, 0, .58, 1], "ease-in-out": [.42, 0, .58, 1], swing: [.55, 0, 1, .6]};
  function ease(name, x) {
    const [x1, y1, x2, y2] = curves[name] || curves.linear;
    const at = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < x) lo = mid; else hi = mid; }
    return at(y1, y2, (lo + hi) / 2);
  }
  // Pose on the current track at its animation time (the keys as the animation draws them).
  function poseAt(at) {
    const keys = track?.keys;
    if (!keys) return null;
    if (at <= keys[0].t) return keys[0];
    for (let i = 1; i < keys.length; i++) if (at <= keys[i].t) {
      const a = keys[i - 1], b = keys[i], f = ease(a.ease, (at - a.t) / (b.t - a.t || 1));
      return {x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f};
    }
    return keys.at(-1);
  }
  const now = () => track?.anim ? Number(track.anim.currentTime) || 0 : 0;
  const offscreen = (g, y, r = holdTurn) => { const [x0] = headExtent(g, r); return place(g, head, [g.clip.right - x0 + 8, y], r); };
  function remove() {
    track?.anim?.cancel();
    clip?.remove();
    clip = sprite = track = null;
  }
  // One clip per strike (the screen is redrawn before every strike); the decoded picture element itself is reused.
  function mount(g) {
    clip?.remove();
    clip = document.createElement("span");
    clip.className = "fp-hammer-clip";
    clip.setAttribute("aria-hidden", "true");
    sprite = image;
    sprite.style.width = g.width + "px";
    sprite.style.height = g.width * canvasH / canvasW + "px";
    sprite.style.transformOrigin = grip[0] * g.k + "px " + grip[1] * g.k + "px";
    clip.append(sprite);
    g.art.after(clip);
  }
  // One animation per strike, from its first move to the last frame off screen: keys are {t (ms), x, y (grip,
  // viewport px), r (deg), ease}. Pausing the document's animations pauses the hammer whole; no timer moves it.
  function run(g, keys, at) {
    const gx = grip[0] * g.k, gy = grip[1] * g.k;
    const frame = p => ({transform: "translate(" + (p.x - g.clip.left - gx).toFixed(2) + "px," + (p.y - g.clip.top - gy).toFixed(2) + "px) rotate(" + p.r.toFixed(2) + "deg)"});
    const timing = k => k.ease === "swing" ? "cubic-bezier(" + curves.swing + ")" : k.ease || "linear";
    track?.anim?.cancel();
    const total = keys.at(-1).t;
    const anim = sprite.animate(keys.map(k => ({...frame(k), offset: k.t / total, easing: timing(k)})), {duration: total, fill: "both"});
    if (at != null) anim.startTime = at; // the strike's own clock, shared with its effects and sound (Feedback.play)
    track = {keys, g, anim};
    anim.onfinish = () => { if (track?.anim === anim) remove(); };
  }
  // A judged strike. `stay` false: leave within 240 ms of the contact (320, a risky entry, a destroy).
  // `repeating`: a held hammer strikes again about 920 ms later (its next swing starts about 760 ms after this
  // contact), so it stays raised and is gone 1,000 ms after this contact if no strike follows.
  // `finale`: a finished process or a promotion, wound up further; the contact keeps its time.
  function strike(host, outcome, repeating, stay, strikeMs, finale = false, at = null) {
    const g = geometry(host);
    if (!g || g.tooSmall || !ready()) { remove(); return g ? g.contact : null; } // no stand-in picture; the effects still start at the contact
    const from = track ? poseAt(now()) : null;
    mount(g);
    const [cx, cy] = g.contact, t = strikeMs, s = g.scale, turnGap = g.turn - contactTurn;
    const contact = place(g, face, g.contact, g.turn);
    // Raised to the right of the item (not over its upper part), then down onto the contact.
    const lift = g.narrow ? (finale ? [64, -42, -34] : [58, -32, -40]) : finale ? [96, -84, -14] : [88, -58, -24];
    const clear = r => g.upper[2] - headExtent(g, r)[0] + 4; // head centre x that clears the item's upper part
    const windup = place(g, head, [Math.max(cx + lift[0] * s, clear(lift[2] + turnGap)), cy + lift[1] * s], lift[2] + turnGap);
    const start = from || offscreen(g, g.narrow ? cy - 10 : Math.max(cy - 20, g.zone[1] + 40), -30);
    const hold = stay && g.hold;
    const headAtContact = pointOf(g, contact, head);
    // 320 has no free strip: everything near the item is a caption or a rail, so the hammer comes in late and short.
    const keys = g.narrow && !from ? [{...start, t: 0}, {...start, t: 70, ease: "ease-out"}, {...windup, t: 125, ease: "swing"}, {...contact, t, ease: "ease-out"}]
      : [{...start, t: 0, ease: "ease-out"}, {...windup, t: from ? 100 : 110, ease: "swing"}, {...contact, t, ease: "ease-out"}];
    if (hold) {
      const bounce = outcome === "hold" ? [40, -16, 18] : [34, -10, 12]; // off the item to the right; a held result rebounds a little more
      const stayMs = repeating ? 840 : 600;
      keys.push({...place(g, head, [Math.max(headAtContact[0] + bounce[0] * s, clear(g.turn + bounce[2])), headAtContact[1] + bounce[1] * s], g.turn + bounce[2]), t: t + 70, ease: "ease-in-out"},
        {...g.hold, t: t + 200}, {...g.hold, t: t + stayMs, ease: "ease-in"},
        {...offscreen(g, pointOf(g, g.hold, head)[1], holdTurn), t: t + stayMs + 160});
    } else {
      // Off the item to the right and a little up (a destroy's label is under the contact), then out past the edge.
      const up = (outcome === "destroy" ? 22 : 10) * s, out = g.narrow ? 110 : 200;
      keys.push({...place(g, head, [Math.max(headAtContact[0] + 40 * s, clear(g.turn + 16)), headAtContact[1] - up], g.turn + 16), t: t + (g.narrow ? 45 : 60), ease: "ease-in"},
        {...offscreen(g, headAtContact[1] - up, holdTurn), t: t + out});
    }
    run(g, keys, at);
    Object.assign(track, {contactT: t, holdWindow: hold ? [t + 200, t + (repeating ? 840 : 600)] : null});
    return g.contact;
  }
  // Read-only view for the browser checks (tools/qa-fp-forge.cjs).
  const inspect = () => ({ready: ready(), broken, mounted: !!clip?.isConnected, time: track ? now() : null, pose: track ? poseAt(now()) : null,
    keys: track?.keys.map(k => ({t: k.t, x: k.x, y: k.y, r: k.r})), contact: track?.g.contact, hold: track?.g.hold, width: track?.g.width,
    contactT: track?.contactT, holdWindow: track?.holdWindow, turn: track?.g.turn,
    canvas: {grip, face, head, headBox, w: canvasW, h: canvasH}});
  return {strike, remove, geometry, inspect};
})();

const Feedback = (() => {
  const strikeMs = 180, chestMs = 360;
  let node, timer, idle = null;
  // `keepTool`: a new command is about to run; the hammer may still be raised from the last strike and strike again.
  function clear(keepTool = false) { clearTimeout(timer); node?.remove(); node = null; if (!keepTool) ForgeHammer.remove(); }
  // Read-only: an animation is on screen. The idle listener runs only when the
  // animation timer ends by itself; an external clear() or a restart never calls it.
  function busy() { return !!node; }
  function onIdle(fn) { idle = typeof fn === "function" ? fn : null; }
  function finish() { clearTimeout(timer); node?.remove(); node = null; idle?.(); }
  // Resolve the applied result, including protection, rather than the generic win/loss tone.
  function forgeOutcome(before, after, destroyed, kind) {
    if (destroyed) return "destroy";
    if (after > before) return "success";
    if (after < before) return "drop";
    return kind === "win" ? "success" : "hold";
  }
  function play(kind, host, label = "", outcome = "win", repeating = false, promotedTo = 0, finale = false) {
    clear(kind === "forge");
    // A strike's hammer, sparks, ring and label start together one frame after this call, which is when the effect
    // node alone always started (on the next frame), but on a fixed clock: the time the browser takes to draw the
    // newly mounted hammer must not move the contact (FP1 F3). Until then the hammer holds its first pose (fill "both").
    const at = kind === "forge" && typeof performance !== "undefined" ? performance.now() + 1000 / 60 : null;
    const bounds = document.body.getBoundingClientRect();
    const rect = host?.getBoundingClientRect();
    const visible = rect && rect.bottom > 100 && rect.top < innerHeight - 100;
    const x = visible ? rect.left + rect.width / 2 : bounds.left + bounds.width / 2;
    const y = visible ? rect.top + rect.height / 2 : innerHeight * .36;
    node = document.createElement("div");
    node.className = "feedback feedback-" + kind;
    node.dataset.outcome = outcome;
    if (promotedTo) node.dataset.swordGrade = promotedTo;
    if (repeating) node.dataset.repeat = "true";
    node.setAttribute("aria-hidden", "true");
    const left = Math.max(bounds.left + 120, Math.min(bounds.right - 120, x)), top = Math.max(105, Math.min(innerHeight - 130, y));
    node.style.left = left + "px";
    node.style.top = top + "px";
    node.style.setProperty("--hit-delay", (kind === "forge" ? strikeMs : kind === "chest" ? chestMs : 0) + "ms");
    if (kind === "forge") {
      // A risky entry or a destroy starts the input hold: the hammer must not look ready to strike again (§9.3).
      const holding = outcome === "destroy" || (typeof ForgeItemView !== "undefined" && ForgeItemView.held?.());
      const contact = host ? ForgeHammer.strike(host, outcome, repeating, !holding, strikeMs, finale, at) : (ForgeHammer.remove(), null);
      if (contact) {
        // Sparks, ring and shards start where the hammer meets the equipment; the label keeps its place.
        node.dataset.origin = "contact";
        node.style.setProperty("--ox", (contact[0] - left).toFixed(1) + "px");
        node.style.setProperty("--oy", (contact[1] - top).toFixed(1) + "px");
      }
    }
    const ring = document.createElement("i");
    ring.className = "feedback-ring";
    node.append(ring);
    const coins = kind === "chest" || kind === "coins";
    const count = kind === "chest" ? 26 : kind === "forge" ?
      ({ success: 18, hold: 6, drop: 10, destroy: 24 }[outcome] || 14) : 16;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("i");
      bit.className = coins ? "feedback-coin" : "feedback-spark";
      const angle = (i / count) * Math.PI * 2;
      const radius = 48 + (i % 5) * 17;
      bit.style.setProperty("--x", Math.cos(angle) * radius + "px");
      bit.style.setProperty("--y", -40 + Math.sin(angle) * radius * .75 + "px");
      bit.style.setProperty("--fall", 65 + (i % 4) * 18 + "px");
      bit.style.setProperty("--spin", (i % 2 ? 540 : -540) + "deg");
      bit.style.setProperty("--delay", (i % 4) * 18 + "ms");
      node.append(bit);
    }
    if (label) { const text = document.createElement("b"); text.textContent = label; node.append(text); }
    document.body.append(node);
    if (at != null) for (const a of node.getAnimations?.({subtree: true}) || []) a.startTime = at;
    timer = setTimeout(finish, 1550);
  }
  return { play, clear, busy, onIdle, forgeOutcome, strikeMs, chestMs };
})();
