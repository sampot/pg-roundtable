import {
  TOTAL_ROUNDS,
  TREATY_TYPES,
  WIN_PRESTIGE,
  applyAction,
  createGame,
  getLegalActions,
  getOutcome,
  leaderboard,
  pendingOffersForPlayer,
  summarize,
} from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, saveProgress } from "./persist.js";

await window.PG.ready;

const $ = (q) => document.querySelector(q);
const audio = new GameAudio();

let state = createGame({ seed: Date.now() % 999983 });
let progress = { best: 0, wins: 0 };
let selectedFaction = null;
let dragging = false;

function toast(text, tone = "") {
  const el = $("#toast");
  el.textContent = text;
  el.className = `toast ${tone}`;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

async function persist() {
  const outcome = getOutcome(state);
  if (outcome === "won") progress.wins = (progress.wins || 0) + 1;
  progress.best = Math.max(progress.best || 0, state.score);
  progress.last = { score: state.score, outcome, at: Date.now() };
  $("#best").textContent = progress.best;
  try {
    await saveProgress(progress);
  } catch {
    toast("存檔同步失敗（仍可繼續玩）。", "warn");
  }
}

function chip(label, value, sub = "", tone = "") {
  return `<div class="chip ${tone}"><b>${label}</b><span>${value}</span>${sub ? `<i>${sub}</i>` : ""}</div>`;
}

function renderHud() {
  const v = summarize(state);
  const phaseLabel = {
    briefing: "議程簡報",
    negotiate: "談判出價",
    reveal: "同步揭曉",
    ended: "圓桌結束",
  }[v.phase] ?? v.phase;
  $("#hud").innerHTML = [
    chip("輪次", `${Math.min(v.round, TOTAL_ROUNDS)}/${TOTAL_ROUNDS}`, phaseLabel),
    chip("聲望", v.prestige, `目標 ${WIN_PRESTIGE}`, v.prestige >= WIN_PRESTIGE ? "good" : v.prestige < 14 ? "bad" : ""),
    chip("籌碼", v.chips, v.phase === "negotiate" ? `出價 ${v.playerBid}` : "本輪上限"),
    chip("領先", v.leaderScore, v.leader || "—", v.prestige > v.leaderScore ? "good" : v.prestige + 4 < v.leaderScore ? "bad" : ""),
    chip("條約", v.treaties, v.offers ? `${v.offers} 待回` : ""),
  ].join("");
}

function renderBoard() {
  const board = $("#board");
  const agenda = state.agenda;
  const ranks = leaderboard(state);
  const seats = state.factions.map((f) => {
    const rank = ranks.findIndex((r) => r.id === f.id) + 1;
    const trust = f.id === "player" ? "—" : `${Math.round(f.trust.player)}% 信`;
    const bid = f.bid != null ? `<em class="bid-tag">${f.bid}</em>` : "";
    return `<button type="button" class="seat ${f.id === "player" ? "you" : ""} ${selectedFaction === f.id ? "active" : ""}" data-faction="${f.id}" style="--accent:${f.color}">
      <span class="rank">#${rank}</span>
      <strong>${f.short}</strong>
      <span class="prest">${f.prestige}</span>
      <small>${trust}${bid}</small>
    </button>`;
  }).join("");

  let center = `<article class="agenda"><h2>${agenda.title}</h2><p>${agenda.blurb}</p><div class="reward">獎勵 <b>${agenda.reward}</b> 聲望</div></article>`;

  if (state.reveal) {
    const rows = state.reveal.bids.map((b) => `<li><span>${b.name}</span><b>${b.bid}</b></li>`).join("");
    center += `<div class="reveal"><h3>本輪出價</h3><ul>${rows}</ul></div>`;
  }

  board.innerHTML = `<div class="table">${seats}<div class="center">${center}</div></div>`;

  board.querySelectorAll("[data-faction]").forEach((btn) => {
    btn.onclick = () => {
      if (state.phase !== "negotiate" || btn.dataset.faction === "player") return;
      selectedFaction = btn.dataset.faction;
      audio.play("soft", { volume: 0.35 });
      renderTreatyPanel();
      renderBoard();
    };
  });
}

function renderBidPanel() {
  const panel = $("#bid-panel");
  if (state.phase !== "negotiate") {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const p = state.factions.find((f) => f.id === "player");
  const max = p.chips;
  const marks = Array.from({ length: max + 1 }, (_, i) => `<button type="button" class="chip-btn ${state.playerBid === i ? "on" : ""}" data-bid="${i}">${i}</button>`).join("");
  panel.innerHTML = `<div class="bid-head"><span>影響力出價</span><strong id="bid-val">${state.playerBid}</strong></div>
    <input type="range" id="bid-range" min="0" max="${max}" value="${state.playerBid}" aria-label="出價滑桿" />
    <div class="chip-row">${marks}</div>`;

  const range = panel.querySelector("#bid-range");
  const setBid = (n) => {
    state = applyAction(state, "setBid", { amount: n });
    renderAll(false);
  };
  range.oninput = () => setBid(Number(range.value));
  range.onpointerdown = () => {
    dragging = true;
  };
  range.onpointerup = () => {
    dragging = false;
    audio.play("coin", { volume: 0.35 });
  };
  panel.querySelectorAll("[data-bid]").forEach((b) => {
    b.onclick = () => {
      audio.play("click");
      setBid(Number(b.dataset.bid));
    };
  });
}

function renderTreatyPanel() {
  const panel = $("#treaty-panel");
  if (state.phase !== "negotiate" || !selectedFaction) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const f = state.factions.find((x) => x.id === selectedFaction);
  const buttons = Object.entries(TREATY_TYPES).map(([id, def]) =>
    `<button type="button" class="treaty-btn" data-type="${id}"><b>${def.name}</b><span>+${def.prestige} 聲望 · 信 +${def.trust}</span></button>`,
  ).join("");
  panel.innerHTML = `<div class="treaty-head"><span>對 ${f.name} 提案</span><button type="button" id="treaty-close" class="ghost">收起</button></div>${buttons}`;
  panel.querySelector("#treaty-close").onclick = () => {
    selectedFaction = null;
    renderTreatyPanel();
    renderBoard();
  };
  panel.querySelectorAll("[data-type]").forEach((b) => {
    b.onclick = () => {
      audio.play("action");
      state = applyAction(state, "propose", { to: selectedFaction, type: b.dataset.type });
      selectedFaction = null;
      renderAll();
    };
  });
}

function renderOffers() {
  const pending = pendingOffersForPlayer(state);
  if (!pending.length || state.phase !== "negotiate") return "";
  return pending.map((o) => {
    const from = state.factions.find((f) => f.id === o.from);
    return `<div class="offer"><p>${from.name}：${TREATY_TYPES[o.type].name}</p>
      <div class="offer-actions">
        <button type="button" data-accept="${o.id}">接受</button>
        <button type="button" data-decline="${o.id}" class="ghost">拒絕</button>
      </div></div>`;
  }).join("");
}

function renderActions() {
  const actions = $("#actions");
  actions.innerHTML = "";
  const legal = getLegalActions(state);

  if (state.phase === "negotiate") {
    const offersHtml = renderOffers();
    if (offersHtml) {
      const wrap = document.createElement("div");
      wrap.className = "offers";
      wrap.innerHTML = offersHtml;
      actions.append(wrap);
      wrap.querySelectorAll("[data-accept]").forEach((b) => {
        b.onclick = () => {
          audio.play("ok");
          state = applyAction(state, "respond", { id: b.dataset.accept, accept: true });
          renderAll();
        };
      });
      wrap.querySelectorAll("[data-decline]").forEach((b) => {
        b.onclick = () => {
          audio.play("error", { volume: 0.4 });
          state = applyAction(state, "respond", { id: b.dataset.decline, accept: false });
          renderAll();
        };
      });
    }
  }

  if (legal.includes("continue")) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "primary";
    b.textContent = state.phase === "briefing" ? "進入談判" : state.phase === "reveal" ? (state.round >= TOTAL_ROUNDS ? "查看結算" : "下一議程") : "繼續";
    b.onclick = () => {
      audio.play(state.phase === "reveal" ? "coin" : "click");
      state = applyAction(state, "continue");
      if (getOutcome(state) !== "playing") void persist();
      renderAll();
    };
    actions.append(b);
  }

  if (legal.includes("seal")) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "primary seal";
    b.textContent = "封印出價";
    b.onclick = () => {
      audio.play("hit", { volume: 0.45 });
      state = applyAction(state, "seal");
      if (getOutcome(state) !== "playing") void persist();
      renderAll();
    };
    actions.append(b);
  }

  if (legal.includes("restart")) {
    const wrap = document.createElement("div");
    wrap.className = "end-panel";
    const outcome = getOutcome(state);
    wrap.innerHTML = `<h2>${outcome === "won" ? "圓桌勝利" : "談判落敗"}</h2><p>${state.reason || state.message}</p><p>最終聲望 <strong>${state.score}</strong></p>`;
    actions.append(wrap);
    audio.play(outcome === "won" ? "win" : "error", { volume: 0.55 });
    const b = document.createElement("button");
    b.type = "button";
    b.className = "primary";
    b.textContent = "再開一局";
    b.onclick = () => {
      audio.play("click");
      state = createGame({ seed: Date.now() % 999983 });
      selectedFaction = null;
      renderAll();
    };
    actions.append(b);
  }
}

function renderMessage() {
  $("#msg").textContent = state.message || "";
}

function renderAll(playUi = true) {
  renderHud();
  renderBoard();
  renderBidPanel();
  renderTreatyPanel();
  renderMessage();
  renderActions();
  if (playUi && !dragging && state.phase === "negotiate" && state.playerBid === 0) {
    /* noop */
  }
}

function suspend() {
  dragging = false;
  selectedFaction = null;
  audio.suspend();
}

function resume() {
  audio.resume();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspend();
  else resume();
});
window.addEventListener("pagehide", suspend);

$("#sound").onclick = async (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", on);
  e.currentTarget.textContent = on ? "♫ 音效" : "♫ 靜音";
  audio.setEnabled(on);
  if (on) await audio.start();
};

$("#start").onclick = async () => {
  await audio.start();
  $("#lobby").hidden = true;
  $("#game").hidden = false;
  state = createGame({ seed: Date.now() % 999983 });
  renderAll(false);
  audio.play("ok");
};

$("#credits-open").onclick = () => {
  $("#credit-list").innerHTML = `
    <li>Kenney — UI Audio, Interface Sounds, Board Game Icons — CC0</li>
    <li>Dylann Taylor — BLIPPY BITS — CC0</li>
    <li>Noto Sans TC — OFL 1.1</li>`;
  $("#credits").showModal();
};
$("#credits-close").onclick = () => $("#credits").close();

progress = await loadProgress();
$("#best").textContent = progress.best || 0;

renderAll(false);
