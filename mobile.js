"use strict";

const phonePages = {
  forge: [["work", "강화"], ["craft", "제작"], ["training", "수련"], ["orders", "의뢰"]],
  world: [["map", "지역 지도"], ["board", "게시판"]],
  forest: [["hunt", "토벌"], ["field", "배치 수익"]],
  bag: [["gear", "장착"], ["stored", "보관 무기"], ["items", "소모품"], ["relics", "유물"]],
  growth: [["rebirth", "환생"], ["imprint", "각인"], ["fusion", "초월"], ["guild", "길드"]],
};
function phonePage(id = current()) {
  const pages = phonePages[id];
  if (!pages) return "";
  const page = location.hash.split("/")[1];
  return pages.find(([key]) => key === page)?.[0] || pages[0][0];
}
function phoneDestination(id, page) {
  if (id === "world" && page === "map") return "world/map";
  return page && page !== phonePages[id]?.[0][0] ? id + "/" + page : id;
}
function phonePageNav(id) {
  const bar = el("pageNav"), page = phonePage(id);
  bar.hidden = !page;
  const destinations = id === "forest" && page === "hunt" ? go("world/map", "모험 지도", "page-link") : "";
  bar.innerHTML = page ? phonePages[id].map(([key, title]) =>
    '<button data-go="' + phoneDestination(id, key) + '"' +
    (key === page ? ' aria-current="page"' : "") + ">" + title + "</button>").join("") + destinations : "";
}
const phoneRows = 3;
function phoneList(rows, empty = "", size = phoneRows) {
  if (rows.length <= size) return rows.join("") || empty;
  const count = Math.ceil(rows.length / size);
  const n = Math.min(count, Math.max(1, parseInt(location.hash.split("/")[2], 10) || 1));
  const link = (target, label) => '<button class="mini" data-go="' + current() + "/" + phonePage() +
    "/" + target + '"' + (target < 1 || target > count ? " disabled" : "") + ">" + label + "</button>";
  return rows.slice((n - 1) * size, n * size).join("") + '<div class="page-turn">' +
    link(n - 1, "이전") + "<span>" + n + " / " + count + "</span>" + link(n + 1, "다음") + "</div>";
}
function phoneLessonDestination(tip) {
  const action = tip.selector.match(/data-act="([^"]+)"/)?.[1];
  const pages = { order: "orders", craftStart: "craft", collect: "field", deploy: "stored" };
  const page = pages[action];
  return phoneDestination(tip.route, page);
}
