import { describe, it, expect } from "vitest";
import {
  TOTAL_ROUNDS,
  WIN_PRESTIGE,
  LOSE_PRESTIGE,
  TREATY_TYPES,
  AGENDAS,
  applyAction,
  beginNegotiation,
  computeAiBid,
  createGame,
  getLegalActions,
  getOutcome,
  leaderboard,
  pendingOffersForPlayer,
  proposeTreaty,
  resolveRound,
  respondOffer,
  sealBid,
  setPlayerBid,
  summarize,
} from "./game.js";

describe("createGame", () => {
  it("is deterministic for the same seed", () => {
    expect(createGame({ seed: 42 })).toEqual(createGame({ seed: 42 }));
  });

  it("starts in briefing with playing outcome", () => {
    const s = createGame({ seed: 1 });
    expect(s.phase).toBe("briefing");
    expect(getOutcome(s)).toBe("playing");
    expect(s.round).toBe(1);
    expect(s.factions).toHaveLength(4);
  });

  it("picks an agenda for round one", () => {
    const s = createGame({ seed: 5 });
    expect(AGENDAS.some((a) => a.title === s.agenda.title)).toBe(true);
  });
});

describe("phases and legal actions", () => {
  it("briefing allows continue only", () => {
    const s = createGame();
    expect(getLegalActions(s)).toEqual(["continue"]);
  });

  it("entering negotiation enables seal", () => {
    let s = applyAction(createGame({ seed: 2 }), "continue");
    expect(s.phase).toBe("negotiate");
    expect(getLegalActions(s)).toContain("seal");
  });

  it("reveal phase allows continue", () => {
    let s = createGame({ seed: 3 });
    s = applyAction(s, "continue");
    s = setPlayerBid(s, 4);
    s = sealBid(s);
    expect(s.phase).toBe("reveal");
    expect(getLegalActions(s)).toEqual(["continue"]);
  });
});

describe("bidding", () => {
  it("clamps player bid to chip budget", () => {
    let s = applyAction(createGame({ seed: 4 }), "continue");
    const max = s.factions.find((f) => f.id === "player").chips;
    s = setPlayerBid(s, 999);
    expect(s.playerBid).toBe(max);
    s = setPlayerBid(s, -3);
    expect(s.playerBid).toBe(0);
  });

  it("refuses seal without a bid", () => {
    let s = applyAction(createGame({ seed: 6 }), "continue");
    const before = s.turn;
    s = sealBid(s);
    expect(s.phase).toBe("negotiate");
    expect(s.turn).toBe(before);
  });

  it("seal assigns AI bids and moves to reveal", () => {
    let s = applyAction(createGame({ seed: 7 }), "continue");
    s = setPlayerBid(s, 5);
    s = sealBid(s);
    expect(s.sealed).toBe(true);
    expect(s.reveal?.bids.length).toBe(4);
    for (const f of s.factions) expect(f.bid).not.toBeNull();
  });

  it("resolveRound awards prestige to top bidder", () => {
    const s = createGame({ seed: 8 });
    const before = s.factions.find((f) => f.id === "player").prestige;
    resolveRound(s, [
      { id: "player", bid: 9 },
      { id: "north", bid: 3 },
      { id: "sea", bid: 2 },
      { id: "sand", bid: 1 },
    ]);
    expect(s.factions.find((f) => f.id === "player").prestige).toBeGreaterThan(before);
    expect(s.history).toHaveLength(1);
  });

  it("resolveRound splits ties", () => {
    const s = createGame({ seed: 9 });
    const p0 = s.factions.find((f) => f.id === "player").prestige;
    const n0 = s.factions.find((f) => f.id === "north").prestige;
    resolveRound(s, [
      { id: "player", bid: 6 },
      { id: "north", bid: 6 },
      { id: "sea", bid: 1 },
      { id: "sand", bid: 1 },
    ]);
    expect(s.factions.find((f) => f.id === "player").prestige).toBeGreaterThan(p0);
    expect(s.factions.find((f) => f.id === "north").prestige).toBeGreaterThan(n0);
  });
});

describe("treaties", () => {
  it("player can propose treaty to AI", () => {
    let s = applyAction(createGame({ seed: 10 }), "continue");
    s = proposeTreaty(s, "north", "trade");
    expect(s.offers.length).toBeGreaterThan(0);
  });

  it("duplicate treaty same round is rejected softly", () => {
    let s = applyAction(createGame({ seed: 11 }), "continue");
    s = proposeTreaty(s, "sea", "trade");
    const offers = s.offers.length;
    s = proposeTreaty(s, "sea", "trade");
    expect(s.offers.length).toBe(offers);
    expect(s.message).toContain("相同");
  });

  it("respondOffer accepts pending AI proposal", () => {
    let s = applyAction(createGame({ seed: 12 }), "continue");
    s.offers.push({
      id: "test-offer",
      from: "sand",
      to: "player",
      type: "trade",
      round: s.round,
      status: "pending",
    });
    const before = s.treaties.length;
    s = respondOffer(s, "test-offer", true);
    expect(s.treaties.length).toBe(before + 1);
    expect(s.offers[0].status).toBe("accepted");
  });

  it("respondOffer decline lowers trust", () => {
    let s = applyAction(createGame({ seed: 13 }), "continue");
    s.offers.push({
      id: "decline-me",
      from: "north",
      to: "player",
      type: "ceasefire",
      round: s.round,
      status: "pending",
    });
    const trustBefore = s.factions.find((f) => f.id === "north").trust.player;
    s = respondOffer(s, "decline-me", false);
    expect(s.factions.find((f) => f.id === "north").trust.player).toBeLessThan(trustBefore);
  });

  it("lists pending offers for player", () => {
    let s = applyAction(createGame({ seed: 14 }), "continue");
    s.offers = [{
      id: "p1",
      from: "sea",
      to: "player",
      type: "coalition",
      round: s.round,
      status: "pending",
    }];
    expect(pendingOffersForPlayer(s)).toHaveLength(1);
    expect(pendingOffersForPlayer(s)[0].id).toBe("p1");
  });
});

describe("AI helpers", () => {
  it("computeAiBid respects ceasefire cap", () => {
    let s = applyAction(createGame({ seed: 15 }), "continue");
    s = setPlayerBid(s, 4);
    s.flags.ceasefireWith = "north";
    const north = s.factions.find((f) => f.id === "north");
    const bid = computeAiBid(s, north, 3);
    expect(bid).toBeLessThanOrEqual(5);
  });

  it("computeAiBid stays within chips", () => {
    const s = applyAction(createGame({ seed: 16 }), "continue");
    const sea = s.factions.find((f) => f.id === "sea");
    const bid = computeAiBid(s, sea, 8);
    expect(bid).toBeLessThanOrEqual(sea.chips);
    expect(bid).toBeGreaterThanOrEqual(0);
  });
});

describe("outcomes", () => {
  it("ends in victory when player leads after final round", () => {
    let s = createGame({ seed: 17 });
    s.round = TOTAL_ROUNDS;
    s.phase = "reveal";
    s.factions.find((f) => f.id === "player").prestige = WIN_PRESTIGE + 4;
    s.factions.find((f) => f.id === "north").prestige = WIN_PRESTIGE - 2;
    s = applyAction(s, "continue");
    expect(getOutcome(s)).toBe("won");
    expect(s.phase).toBe("ended");
  });

  it("ends in loss when player prestige too low", () => {
    let s = createGame({ seed: 18 });
    s.round = TOTAL_ROUNDS;
    s.phase = "reveal";
    s.factions.find((f) => f.id === "player").prestige = LOSE_PRESTIGE - 1;
    s.factions.find((f) => f.id === "north").prestige = 30;
    s = applyAction(s, "continue");
    expect(getOutcome(s)).toBe("lost");
  });

  it("leaderboard sorts by prestige", () => {
    const s = createGame({ seed: 19 });
    s.factions.find((f) => f.id === "sand").prestige = 99;
    expect(leaderboard(s)[0].id).toBe("sand");
  });
});

describe("immutability and summarize", () => {
  it("applyAction does not mutate input", () => {
    const before = createGame({ seed: 20 });
    const snap = structuredClone(before);
    applyAction(before, "continue");
    expect(before).toEqual(snap);
  });

  it("summarize exposes key fields", () => {
    const s = createGame({ seed: 21 });
    const sum = summarize(s);
    expect(sum).toMatchObject({
      round: 1,
      phase: "briefing",
      outcome: "playing",
      score: expect.any(Number),
      prestige: expect.any(Number),
    });
  });

  it("unknown action is ignored", () => {
    const s = createGame({ seed: 22 });
    expect(applyAction(s, "nope")).toEqual(s);
  });

  it("treaty types have required metadata", () => {
    for (const def of Object.values(TREATY_TYPES)) {
      expect(def.name).toBeTruthy();
      expect(def.prestige).toBeGreaterThan(0);
    }
  });
});

describe("full round loop", () => {
  it("can play from briefing through reveal to next briefing", () => {
    let s = createGame({ seed: 23 });
    s = applyAction(s, "continue");
    s = setPlayerBid(s, 3);
    s = sealBid(s);
    expect(s.phase).toBe("reveal");
    const round = s.round;
    s = applyAction(s, "continue");
    if (getOutcome(s) === "playing") {
      expect(s.phase).toBe("briefing");
      expect(s.round).toBe(round + 1);
    }
  });
});
