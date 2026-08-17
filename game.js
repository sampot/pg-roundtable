/** 圓桌協議 — 純邏輯（多勢力密封出價＋條約外交） */

export const TOTAL_ROUNDS = 6;
export const WIN_PRESTIGE = 38;
export const LOSE_PRESTIGE = 16;

export const TREATY_TYPES = {
  trade: { name: "互惠貿易", trust: 18, prestige: 3, aiAccept: 0.62 },
  ceasefire: { name: "互不競標", trust: 12, prestige: 2, aiAccept: 0.48 },
  coalition: { name: "勝利分潤", trust: 22, prestige: 4, aiAccept: 0.38 },
};

export const FACTION_DEFS = [
  { id: "player", name: "你", short: "你", personality: "player", color: "#e2bdff" },
  { id: "north", name: "北境聯盟", short: "北", personality: "aggressive", color: "#7eb8ff" },
  { id: "sea", name: "海權共和", short: "海", personality: "economic", color: "#6fd6c6" },
  { id: "sand", name: "沙庭行商", short: "沙", personality: "opportunist", color: "#f0c06a" },
];

export const AGENDAS = [
  { id: "tariff", title: "北方商路關稅", reward: 8, base: 4, blurb: "控制關稅即控制財流。" },
  { id: "strait", title: "海峽通行權", reward: 10, base: 5, blurb: "誰能通行，誰能貿易。" },
  { id: "spice", title: "香料專賣", reward: 12, base: 6, blurb: "最甜的一塊蛋糕。" },
  { id: "buffer", title: "邊境緩衝區", reward: 7, base: 3, blurb: "緩衝區換來喘息。" },
  { id: "defense", title: "共同防禦條款", reward: 9, base: 5, blurb: "結盟者分擔風險。" },
  { id: "seat", title: "圓桌永久席位", reward: 15, base: 7, blurb: "席位即話語權。" },
];

const clone = (v) => structuredClone(v);

export function seeded(state, salt = 0) {
  const x = Math.sin((state.seed * 9301 + state.round * 49297 + state.turn * 233 + salt * 17) * 0.0001) * 10000;
  return x - Math.floor(x);
}

function chipsForRound(round) {
  return 8 + Math.min(4, Math.floor((round - 1) / 2));
}

function agendaForRound(round, seed) {
  const idx = (round - 1 + Math.floor(seeded({ seed, round, turn: 0 }, 99) * AGENDAS.length)) % AGENDAS.length;
  return AGENDAS[idx];
}

function blankFactions() {
  return FACTION_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    short: def.short,
    personality: def.personality,
    color: def.color,
    prestige: def.id === "player" ? 12 : 10 + (def.id === "north" ? 2 : def.id === "sea" ? 0 : -1),
    trust: { player: 50, north: 50, sea: 50, sand: 50 },
    chips: 0,
    bid: null,
    lastBid: null,
  }));
}

export function createGame({ seed = 1 } = {}) {
  const game = {
    seed: Math.abs(Math.trunc(seed)) || 1,
    round: 1,
    turn: 0,
    phase: "briefing",
    outcome: "playing",
    reason: null,
    message: "六輪圓桌：密封出價搶議程，條約換信任與優勢。",
    score: 12,
    playerBid: 0,
    sealed: false,
    reveal: null,
    agenda: agendaForRound(1, seed),
    factions: blankFactions(),
    treaties: [],
    offers: [],
    history: [],
    flags: { ceasefireWith: null, coalitionWith: null },
  };
  refreshChips(game);
  return game;
}

function refreshChips(state) {
  const budget = chipsForRound(state.round);
  for (const f of state.factions) {
    f.chips = budget;
    f.bid = null;
  }
}

function player(state) {
  return state.factions.find((f) => f.id === "player");
}

function faction(state, id) {
  return state.factions.find((f) => f.id === id);
}

function bumpTurn(s) {
  s.turn += 1;
  s.score = player(s).prestige;
}

export function summarize(state) {
  const p = player(state);
  const rivals = state.factions.filter((f) => f.id !== "player").sort((a, b) => b.prestige - a.prestige);
  return {
    round: state.round,
    phase: state.phase,
    outcome: state.outcome,
    score: state.score,
    prestige: p.prestige,
    chips: p.chips,
    playerBid: state.playerBid,
    leader: rivals[0]?.name ?? "",
    leaderScore: rivals[0]?.prestige ?? 0,
    agenda: state.agenda?.title ?? "",
    treaties: state.treaties.length,
    offers: state.offers.filter((o) => o.status === "pending").length,
  };
}

export function getOutcome(state) {
  return state.outcome;
}

export function getLegalActions(state) {
  if (state.outcome !== "playing") return ["restart"];
  if (state.phase === "briefing") return ["continue"];
  if (state.phase === "negotiate") {
    const acts = ["seal"];
    if (state.offers.some((o) => o.status === "pending" && o.to === "player")) acts.push("respond");
    return acts;
  }
  if (state.phase === "reveal") return ["continue"];
  return [];
}

export function setPlayerBid(state, amount) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "negotiate") return s;
  const p = player(s);
  const n = Math.max(0, Math.min(p.chips, Math.round(Number(amount) || 0)));
  s.playerBid = n;
  s.message = n ? `你準備出價 ${n} 點影響力。` : "尚未出價——拖曳籌碼或點選數字。";
  bumpTurn(s);
  return s;
}

export function proposeTreaty(state, toId, type) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "negotiate") return s;
  if (!TREATY_TYPES[type] || toId === "player") return s;
  if (s.treaties.some((t) => t.from === "player" && t.to === toId && t.type === type && t.round === s.round)) {
    s.message = "本輪已提出相同條約。";
    return s;
  }
  const target = faction(s, toId);
  const def = TREATY_TYPES[type];
  const roll = seeded(s, s.turn + toId.length + type.length);
  const trust = target.trust.player ?? 50;
  const accept = roll < def.aiAccept + (trust - 50) * 0.004 + (target.personality === "economic" && type === "trade" ? 0.12 : 0);
  const offer = {
    id: `${s.round}-${s.turn}-${toId}`,
    from: "player",
    to: toId,
    type,
    round: s.round,
    status: accept ? "accepted" : "rejected",
  };
  s.offers.push(offer);
  if (accept) {
    applyTreaty(s, offer);
    s.message = `${target.name} 接受「${def.name}」。`;
  } else {
    target.trust.player = Math.max(5, target.trust.player - 6);
    s.message = `${target.name} 婉拒「${def.name}」，信任下降。`;
  }
  bumpTurn(s);
  return s;
}

function applyTreaty(state, offer) {
  const def = TREATY_TYPES[offer.type];
  const a = faction(state, offer.from);
  const b = faction(state, offer.to);
  state.treaties.push({ ...offer, status: "accepted" });
  if (a && b) {
    a.prestige += def.prestige;
    b.prestige += def.prestige;
    a.trust[b.id] = Math.min(100, (a.trust[b.id] ?? 50) + def.trust);
    b.trust[a.id] = Math.min(100, (b.trust[a.id] ?? 50) + def.trust);
  }
  if (offer.type === "ceasefire") state.flags.ceasefireWith = offer.to === "player" ? offer.from : offer.to;
  if (offer.type === "coalition") state.flags.coalitionWith = offer.to === "player" ? offer.from : offer.to;
}

export function respondOffer(state, offerId, accept) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "negotiate") return s;
  const offer = s.offers.find((o) => o.id === offerId && o.status === "pending" && o.to === "player");
  if (!offer) return s;
  offer.status = accept ? "accepted" : "rejected";
  const from = faction(s, offer.from);
  if (accept) {
    applyTreaty(s, offer);
    s.message = `你接受 ${from.name} 的「${TREATY_TYPES[offer.type].name}」。`;
  } else {
    from.trust.player = Math.max(5, from.trust.player - 8);
    s.message = `你拒絕 ${from.name} 的提案。`;
  }
  bumpTurn(s);
  return s;
}

function aiTreatyOffer(state, ai) {
  const types = ["trade", "ceasefire", "coalition"];
  const type = types[Math.floor(seeded(state, ai.id.length + state.round * 3) * types.length)];
  const def = TREATY_TYPES[type];
  const trust = ai.trust.player ?? 50;
  if (trust < 35 && type === "coalition") return null;
  return {
    id: `ai-${state.round}-${ai.id}-${type}`,
    from: ai.id,
    to: "player",
    type,
    round: state.round,
    status: "pending",
    blurb: `${ai.name} 提議「${def.name}」`,
  };
}

export function beginNegotiation(state) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "briefing") return s;
  s.phase = "negotiate";
  s.playerBid = 0;
  s.sealed = false;
  s.reveal = null;
  s.offers = s.offers.filter((o) => o.status === "accepted");
  refreshChips(s);
  for (const f of s.factions) {
    if (f.id === "player") continue;
    if (seeded(s, f.id.charCodeAt(0) + s.round) > 0.55) continue;
    const offer = aiTreatyOffer(s, f);
    if (offer) s.offers.push(offer);
  }
  s.message = `第 ${s.round} 輪：${s.agenda.title}。調整出價，亦可點選勢力提案。`;
  bumpTurn(s);
  return s;
}

export function computeAiBid(state, ai, salt) {
  const agenda = state.agenda;
  let target = agenda.base;
  const trust = ai.trust.player ?? 50;
  if (ai.personality === "aggressive") target += 2 + Math.floor(seeded(state, salt) * 3);
  if (ai.personality === "economic") target += 1 + Math.floor(seeded(state, salt + 1) * 2);
  if (ai.personality === "opportunist") target += trust > 65 ? -1 : 2 + Math.floor(seeded(state, salt + 2) * 2);
  if (state.flags.ceasefireWith === ai.id) target = Math.min(target, state.playerBid + 1);
  if (state.flags.coalitionWith === ai.id) target = Math.max(target, Math.floor(state.playerBid * 0.85));
  const noise = Math.round((seeded(state, salt + 4) - 0.5) * 3);
  return Math.max(0, Math.min(ai.chips, target + noise));
}

export function sealBid(state) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "negotiate") return s;
  const p = player(s);
  if (s.playerBid <= 0) {
    s.message = "請先分配影響力再封印出價。";
    return s;
  }
  p.bid = s.playerBid;
  const bids = [{ id: "player", bid: p.bid }];
  let salt = 10;
  for (const f of s.factions) {
    if (f.id === "player") continue;
    f.bid = computeAiBid(s, f, salt);
    f.lastBid = f.bid;
    bids.push({ id: f.id, bid: f.bid });
    salt += 7;
  }
  s.sealed = true;
  s.phase = "reveal";
  s.reveal = resolveRound(s, bids);
  bumpTurn(s);
  checkImmediateLoss(s);
  return s;
}

export function resolveRound(state, bids) {
  const sorted = [...bids].sort((a, b) => b.bid - a.bid || (a.id === "player" ? -1 : 1));
  const top = sorted[0].bid;
  const winners = sorted.filter((b) => b.bid === top);
  const reward = state.agenda.reward;
  const notes = [];
  const coalition = state.flags.coalitionWith;
  if (winners.length === 1) {
    const w = faction(state, winners[0].id);
    w.prestige += reward;
    notes.push(`${w.name} 以 ${top} 點奪標，+${reward} 聲望`);
    if (coalition && (winners[0].id === "player" || winners[0].id === coalition)) {
      const ally = faction(state, winners[0].id === "player" ? coalition : "player");
      const bonus = Math.max(2, Math.floor(reward * 0.35));
      ally.prestige += bonus;
      notes.push(`同盟分潤 +${bonus}`);
    }
  } else {
    const share = Math.max(2, Math.floor(reward / winners.length));
    for (const w of winners) {
      faction(state, w.id).prestige += share;
      notes.push(`${faction(state, w.id).name} 平手分食 +${share}`);
    }
  }
  const second = sorted.find((b) => b.bid < top);
  if (second) {
    const bonus = Math.max(1, Math.floor(reward / 4));
    faction(state, second.id).prestige += bonus;
    notes.push(`${faction(state, second.id).name} 次席 +${bonus}`);
  }
  state.history.push({
    round: state.round,
    agenda: state.agenda.title,
    bids: bids.map((b) => ({ id: b.id, name: faction(state, b.id).name, bid: b.bid })),
    notes,
  });
  state.message = notes.join("；");
  return { bids: state.history.at(-1).bids, notes };
}

function syncScore(state) {
  state.score = player(state).prestige;
}

function checkImmediateLoss(state) {
  syncScore(state);
  if (player(state).prestige <= 0) {
    state.outcome = "lost";
    state.reason = "聲望歸零，被迫離席。";
    state.phase = "ended";
  }
}

function checkFinalOutcome(state) {
  syncScore(state);
  const p = player(state);
  const rivals = state.factions.filter((f) => f.id !== "player");
  const best = rivals.reduce((a, b) => (b.prestige > a.prestige ? b : a));
  if (p.prestige >= WIN_PRESTIGE && p.prestige > best.prestige) {
    state.outcome = "won";
    state.reason = "你的聲望領先圓桌，協議由你書寫。";
  } else if (p.prestige < LOSE_PRESTIGE) {
    state.outcome = "lost";
    state.reason = "聲望不足，圓桌將你邊緣化。";
  } else if (p.prestige <= best.prestige) {
    state.outcome = "lost";
    state.reason = `${best.name} 聲望更高，談判落敗。`;
  } else {
    state.outcome = "won";
    state.reason = "險勝一籌，圓桌承認你的領導。";
  }
  state.phase = "ended";
}

export function advanceAfterReveal(state) {
  const s = clone(state);
  if (s.outcome !== "playing" || s.phase !== "reveal") return s;
  if (s.round >= TOTAL_ROUNDS) {
    checkFinalOutcome(s);
    return s;
  }
  s.round += 1;
  s.agenda = agendaForRound(s.round, s.seed);
  s.flags.ceasefireWith = null;
  s.playerBid = 0;
  s.phase = "briefing";
  s.message = `第 ${s.round} 輪議程揭曉：${s.agenda.title}`;
  bumpTurn(s);
  return s;
}

export function applyAction(state, action, payload = {}) {
  switch (action) {
    case "continue":
      if (state.phase === "briefing") return beginNegotiation(state);
      if (state.phase === "reveal") return advanceAfterReveal(state);
      return state;
    case "setBid":
      return setPlayerBid(state, payload.amount ?? payload);
    case "propose":
      return proposeTreaty(state, payload.to, payload.type);
    case "respond":
      return respondOffer(state, payload.id, payload.accept);
    case "seal":
      return sealBid(state);
    case "restart":
      return createGame({ seed: Date.now() % 999983 });
    default:
      return state;
  }
}

export function leaderboard(state) {
  return [...state.factions].sort((a, b) => b.prestige - a.prestige);
}

export function pendingOffersForPlayer(state) {
  return state.offers.filter((o) => o.status === "pending" && o.to === "player");
}
