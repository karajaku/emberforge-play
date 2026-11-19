"use strict";
// Separate database. A transaction compares the revision and writes the paid action together.
const HeirloomStore = (() => {
  let pending;
  function open() {
    if (!pending)
      pending = new Promise((resolve, reject) => {
        const req = indexedDB.open("emberforge.heirloom", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("journeys");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          pending = null;
          reject(req.error);
        };
      });
    return pending;
  }
  async function update(slot, expected, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("journeys", "readwrite"),
        store = tx.objectStore("journeys");
      let next, error;
      const get = store.get(slot);
      get.onsuccess = () => {
        try {
          next = get.result ?? HeirloomForge.fresh(slot);
          if (next.version !== 1) throw Error("새 버전의 저장입니다. 게임을 새로 고쳐 주세요.");
          if (expected !== null && next.revision !== expected)
            throw Error("다른 화면에서 진행했습니다. 최신 기록을 불러왔습니다.");
          if (action) {
            action(next);
            next.revision++;
          }
          if (action || !get.result) store.put(next, slot);
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = () => reject(error || tx.error || Error("저장을 완료하지 못했습니다."));
      tx.onerror = () => {
        error = error || tx.error;
      };
    });
  }
  return { update };
})();
