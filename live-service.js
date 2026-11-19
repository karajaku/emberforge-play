"use strict";
(() => {
  // The deployment URL is provided by the script tag when the remote editor has been provisioned.
  const endpoint = document.currentScript.dataset.endpoint;
  if (!endpoint) return;
  const cache = "emberforge.live-data.v1." + endpoint;
  let revision = 0;
  function apply(snapshot) {
    if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision <= revision) return false;
    const changed = JSON.stringify(LiveData.current) !== JSON.stringify(snapshot.config);
    LiveData.apply(snapshot.config);
    revision = snapshot.revision;
    if (changed) window.dispatchEvent(new Event("emberforge-rules-updated"));
    return true;
  }
  try { apply(JSON.parse(localStorage.getItem(cache))); } catch { /* Use built-in rules. */ }
  let loading = false;
  let nextCheck = 0;
  async function refresh() {
    if (document.hidden || loading || Date.now() < nextCheck) return;
    loading = true;
    nextCheck = Date.now() + 60000;
    try {
      const response = await fetch(endpoint, {cache:"no-store", credentials:"omit", signal:AbortSignal.timeout(15000)});
      if (!response.ok) return;
      const snapshot = await response.json();
      if (apply(snapshot)) localStorage.setItem(cache, JSON.stringify(snapshot));
    } catch { /* Offline play keeps the last validated rules. */ }
    finally { loading = false; }
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.setInterval(refresh, 60000);
})();
