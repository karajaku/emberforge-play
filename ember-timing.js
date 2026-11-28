"use strict";

// A strike rehearsal is transient. Only its third accepted stop returns the original craft quote.
const EmberTiming = (() => {
  const target = Object.freeze({ center: 0.5, halfWidth: 0.12 });
  const sweepMs = 800;
  const inputDelay = 320;

  function create({ id, n, token }, now) {
    const request = Object.freeze({ id, n, token });
    const marks = [];
    let startedAt = now;
    let pausedAt = null;
    let ended = false;

    function elapsed(at) {
      return Math.max(0, (pausedAt ?? at) - startedAt);
    }
    function position(at) {
      const phase = (elapsed(at) % (2 * sweepMs)) / sweepMs;
      return phase <= 1 ? phase : 2 - phase;
    }
    function stop(at) {
      if (ended || pausedAt !== null || elapsed(at) < inputDelay) return null;
      const value = position(at);
      const hit = value >= target.center - target.halfWidth && value <= target.center + target.halfWidth;
      marks.push(hit);
      ended = marks.length === 3;
      startedAt = at;
      return {
        round: marks.length,
        position: value,
        hit,
        complete: ended,
        marks: [...marks],
        request: ended ? request : null,
      };
    }
    return {
      target,
      position,
      stop,
      get round() {
        return Math.min(3, marks.length + 1);
      },
      get paused() {
        return pausedAt !== null;
      },
      pause(at) {
        if (!ended && pausedAt === null) pausedAt = at;
      },
      resume(at) {
        if (pausedAt !== null) {
          startedAt += at - pausedAt;
          pausedAt = null;
        }
      },
      cancel() {
        ended = true;
      },
    };
  }
  return { create };
})();

if (typeof module !== "undefined") module.exports = EmberTiming;
