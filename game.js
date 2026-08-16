/** pg-roundtable — 圓桌協議 (外交／談判) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["圓桌協議：出價／同盟／施壓"], outcome: "playing", msg: "圓桌協議：出價／同盟／施壓" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["bid","ally","sanction","speech"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  
  s.flags.inf = s.flags.inf ?? 0;
  if (action === "bid") { s.resources -= 2; s.flags.inf += 3; s.msg = "密封出價"; }
  else if (action === "ally") { s.flags.inf += 2; s.meter += 10; s.msg = "締結同盟"; }
  else if (action === "sanction") { s.flags.inf += 1; s.resources += 1; s.msg = "經濟制裁對手"; }
  else { s.flags.inf += 4; s.msg = "演說爭取中立"; }
  s.meter = clamp(s.flags.inf * 5, 0, 100);
  s.score = s.flags.inf * 10;
  if (s.flags.inf >= 20) { s.level = 5; s.meter = 100; }

  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }

