// ── DOM / rendering / interaction ───────────────────────────────────────────

const $ = id => document.getElementById(id);

// Ships-to-Sea loading flow (UI-only selection state, not game state):
// click one of your own ships-at-sea to make it the "active" load target,
// which highlights eligible hand cards; click a highlighted card to reveal
// its Up/Down buttons (click it again to hide them without committing);
// Up/Down actually attaches it. Resets whenever we're not in that phase.
let uiActiveSeaShipId = null;
let uiSelectedHandUid = null;

function loadEligibleHandCards(player, seaShip) {
  return player.hand.filter(c => ['captain', 'crew', 'officer', 'upgrade', 'treasure', 'vip'].includes(c.category))
    .filter(c => {
      if (c.category === 'captain') return !seaShip.captain;
      if (c.category === 'crew') return !seaShip.crew;
      if (c.category === 'officer') return !seaShip.officer;
      if (c.category === 'upgrade') return !seaShip.upgrades[findCard(c.cardId).slot];
      return true; // treasure/vip always stackable
    });
}

function cardStatLine(card) {
  if (card.atk != null) return `${card.atk}/${card.def}/${card.spd}`;
  if (card.bonus) {
    const parts = [];
    if (card.bonus.atk) parts.push(`${card.bonus.atk > 0 ? '+' : ''}${card.bonus.atk} Atk`);
    if (card.bonus.def) parts.push(`${card.bonus.def > 0 ? '+' : ''}${card.bonus.def} Def`);
    if (card.bonus.spd) parts.push(`${card.bonus.spd > 0 ? '+' : ''}${card.bonus.spd} Spd`);
    return parts.join(', ');
  }
  if (card.value != null) return `${card.value}g`;
  return '';
}

function categoryLabel(cat) {
  return { ship: 'Ship', captain: 'Captain', crew: 'Crew', officer: 'Officer', upgrade: 'Upgrade', treasure: 'Treasure', vip: 'VIP' }[cat] || cat;
}

function makeCardEl(card, category, opts = {}) {
  const el = document.createElement('div');
  el.className = `card cardtype-${category}` + (opts.faceDown ? ' face-down' : '');
  if (opts.faceDown) {
    el.innerHTML = `<div class="card-back-label">Face Down</div>`;
    return el;
  }
  el.innerHTML = `
    <div class="card-cat">${categoryLabel(category)}</div>
    <div class="card-name">${card.name}</div>
    <div class="card-stat">${cardStatLine(card)}</div>
  `;
  return el;
}

function cargoCategory(cardId) {
  return VIPS.find(v => v.id === cardId) ? 'vip' : 'treasure';
}

// Builds the row of attached-card elements for any ship-like object
// (a player's persistent ship, or a ship-at-sea). revealAll forces every
// card face-up regardless of its faceUp flag -- used only for the player's
// own persistent ship (always fully visible per Setup). Ships at sea never
// get this: a face-down card there is hidden from everyone, including
// whoever placed it, until something reveals it (see loadSeaShip's use of
// faceUp, and flipShipFaceUp at combat).
function buildShipSlotsEl(ship, revealAll) {
  const slots = document.createElement('div');
  slots.className = 'ship-slots';
  const addSlot = (entry, category) => {
    if (!entry) return;
    const card = findCard(entry.cardId);
    const showFace = revealAll || entry.faceUp;
    slots.appendChild(makeCardEl(card, category, { faceDown: !showFace }));
  };
  addSlot(ship.captain, 'captain');
  addSlot(ship.crew, 'crew');
  addSlot(ship.officer, 'officer');
  ['cannon', 'sails', 'hull'].forEach(slot => addSlot(ship.upgrades[slot], 'upgrade'));
  ship.cargo.forEach(entry => addSlot(entry, cargoCategory(entry.cardId)));
  return slots;
}

// ── Player ship zone (the persistent ship — always fully visible per Setup) ─

function renderPlayerShipZone(zoneEl, player) {
  zoneEl.innerHTML = '';
  const shipCard = findCard(player.ship.shipId);

  const header = document.createElement('div');
  header.className = 'ship-header';
  header.innerHTML = `
    <span class="ship-name">${player.name} — ${shipCard.name}</span>
    <span class="ship-rating">${shipRating(player.ship, 'atk')}/${shipRating(player.ship, 'def')}/${shipRating(player.ship, 'spd')}</span>
  `;
  zoneEl.appendChild(header);
  zoneEl.appendChild(buildShipSlotsEl(player.ship, true));

  const captureValue = player.capturePile.reduce((s, e) => { const c = findCard(e.cardId); return s + (c && c.value ? c.value : 0); }, 0);
  const stats = document.createElement('div');
  stats.className = 'ship-econ';
  stats.innerHTML = `
    <span>Stash: <strong>${player.stash}g</strong></span>
    <span>Capture pile: ${player.capturePile.length} card${player.capturePile.length === 1 ? '' : 's'} (~${captureValue}g)</span>
    <span>Hand: ${player.hand.length}</span>
  `;
  zoneEl.appendChild(stats);
}

// ── Ocean (shared ships-at-sea) ─────────────────────────────────────────

function renderOcean() {
  const oceanEl = $('ocean');
  oceanEl.innerHTML = '';
  const human = state.players.find(p => p.isHuman);
  const humanIdx = state.players.indexOf(human);
  const isHumanTurn = state.players[state.currentTurn].isHuman;

  if (!state.seaShips.length) {
    const p = document.createElement('div');
    p.className = 'ocean-empty';
    p.textContent = 'No ships at sea right now.';
    oceanEl.appendChild(p);
    return;
  }

  if (state.seaShips.length >= SHIPS_AT_SEA_CAP) {
    const p = document.createElement('div');
    p.className = 'ocean-cap-note';
    p.textContent = `Ocean is full (${state.seaShips.length}/${SHIPS_AT_SEA_CAP}).`;
    oceanEl.appendChild(p);
  }

  const inLoadMode = isHumanTurn && !state.pendingFlee && state.phase === 'shipsToSea';

  state.seaShips.forEach(seaShip => {
    const isOwnShip = seaShip.ownerIdx === humanIdx;
    // Loading is only ever offered in the same action as placing a ship
    // (see putShipToSea's auto-select in renderHandAndActions) -- ships
    // are never manually re-selectable as a load target here. Which ship
    // is whose isn't shown at all: it's on the player to remember what
    // they put out, same as they can't re-check a face-down card.
    const isActiveLoadTarget = inLoadMode && isOwnShip && uiActiveSeaShipId === seaShip.id;
    const card = document.createElement('div');
    card.className = 'sea-ship' + (isActiveLoadTarget ? ' load-target' : '');

    const header = document.createElement('div');
    header.className = 'sea-ship-header';
    header.innerHTML = `
      <span class="sea-ship-name">${findCard(seaShip.shipId).name}</span>
      <span class="sea-ship-rating">${shipRating(seaShip, 'atk')}/${shipRating(seaShip, 'def')}/${shipRating(seaShip, 'spd')}</span>
    `;
    card.appendChild(header);
    // No reveal-because-you-own-it exception: a face-down card at sea is
    // hidden from everyone, including whoever placed it, until something
    // (a card/equipment effect, or combat via flipShipFaceUp) reveals it.
    card.appendChild(buildShipSlotsEl(seaShip, false));

    const actions = document.createElement('div');
    actions.className = 'sea-ship-actions';
    if (isHumanTurn && !state.pendingFlee) {
      if (state.phase === 'attack') {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = 'Attack';
        btn.onclick = () => { humanAttack(seaShip.id); render(); };
        actions.appendChild(btn);
      }
    }
    if (actions.childNodes.length) card.appendChild(actions);

    oceanEl.appendChild(card);
  });
}

// ── Turn/phase indicator ─────────────────────────────────────────────────

const PHASE_LABELS = {
  turnStart: 'Choosing: Set Sail or Home Port',
  upgrade: 'Upgrade Phase',
  defending: 'Defending Phase',
  attack: 'Attack Phase',
  shipsToSea: 'Ships-to-Sea Phase',
  draw: 'Draw Phase',
  homeport: 'Home Port',
  gameover: 'Game Over',
};

function renderTurnIndicator() {
  const el = $('turn-indicator');
  const player = state.players[state.currentTurn];
  if (!player) { el.innerHTML = ''; return; }

  const phaseLabel = PHASE_LABELS[state.phase] || state.phase;
  const isHumanTurn = player.isHuman;
  el.classList.toggle('your-turn', isHumanTurn && state.phase !== 'gameover');

  if (state.phase === 'gameover') {
    el.innerHTML = `<span class="ti-phase">Game Over</span>`;
    return;
  }

  el.innerHTML = `
    <span class="ti-turn">${isHumanTurn ? 'Your Turn' : `${player.name}'s Turn`}</span>
    <span class="ti-sep">·</span>
    <span class="ti-phase">${phaseLabel}</span>
  `;
}

// ── Log ──────────────────────────────────────────────────────────────────

function renderLog() {
  const el = $('log');
  el.innerHTML = state.log.map(l => `<div class="log-line log-line--${l.kind}">${l.text}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Hand & action bar ───────────────────────────────────────────────────

function renderHandAndActions() {
  const human = state.players.find(p => p.isHuman);
  const isHumanTurn = state.players[state.currentTurn].isHuman;
  const handEl = $('hand');
  const actionsEl = $('action-bar');
  handEl.innerHTML = '';
  actionsEl.innerHTML = '';

  if (state.phase !== 'shipsToSea') { uiActiveSeaShipId = null; uiSelectedHandUid = null; }
  const activeShip = uiActiveSeaShipId ? state.seaShips.find(s => s.id === uiActiveSeaShipId) : null;
  if (!activeShip) uiActiveSeaShipId = null; // target got captured/sunk/lost since selection
  const eligibleUids = activeShip ? new Set(loadEligibleHandCards(human, activeShip).map(c => c.uid)) : null;

  human.hand.forEach(entry => {
    const card = findCard(entry.cardId);
    const wrap = document.createElement('div');
    const isLoadEligible = eligibleUids && eligibleUids.has(entry.uid);
    const isSelected = uiSelectedHandUid === entry.uid;
    wrap.className = 'hand-card-wrap' + (isLoadEligible ? ' load-eligible' : '') + (isSelected ? ' selected' : '');
    const cardEl = makeCardEl(card, entry.category);
    wrap.appendChild(cardEl);

    if (isHumanTurn && !state.pendingFlee) {
      if (state.phase === 'upgrade' && entry.category === 'upgrade') {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = `Install (${card.buyCost}g)`;
        btn.disabled = human.stash < card.buyCost;
        btn.onclick = () => { buyUpgrade(human, entry.uid); render(); };
        wrap.appendChild(btn);
      } else if (state.phase === 'shipsToSea' && entry.category === 'ship') {
        const oceanFull = state.seaShips.length >= SHIPS_AT_SEA_CAP;
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = oceanFull ? 'Ocean is full' : `Put to Sea (${human.shipsToSeaThisTurn}/${SHIPS_TO_SEA_CAP})`;
        btn.disabled = oceanFull || human.shipsToSeaThisTurn >= SHIPS_TO_SEA_CAP;
        btn.onclick = () => {
          const created = putShipToSea(human, entry.uid);
          if (created) { uiActiveSeaShipId = created.id; uiSelectedHandUid = null; }
          render();
        };
        wrap.appendChild(btn);
      } else if (state.phase === 'shipsToSea' && isLoadEligible) {
        if (isSelected) {
          const row = document.createElement('div');
          row.className = 'mini-btn-row';
          const upBtn = document.createElement('button');
          upBtn.className = 'mini-btn';
          upBtn.textContent = 'Up';
          upBtn.onclick = () => { loadSeaShip(human, activeShip.id, entry.uid, true); uiSelectedHandUid = null; render(); };
          const downBtn = document.createElement('button');
          downBtn.className = 'mini-btn';
          downBtn.textContent = 'Down';
          downBtn.onclick = () => { loadSeaShip(human, activeShip.id, entry.uid, false); uiSelectedHandUid = null; render(); };
          row.appendChild(upBtn);
          row.appendChild(downBtn);
          wrap.appendChild(row);
        }
        cardEl.onclick = () => { uiSelectedHandUid = isSelected ? null : entry.uid; render(); };
      }
    }
    handEl.appendChild(wrap);
  });

  if (!isHumanTurn) {
    actionsEl.innerHTML = `<div class="phase-note">${state.players[state.currentTurn].name} is at the helm…</div>`;
    return;
  }
  if (state.pendingFlee) return; // flee modal handles this

  if (state.phase === 'turnStart') {
    addAction(actionsEl, 'Set Sail', () => { beginRegularTurn(); render(); });
    addAction(actionsEl, 'Return to Home Port', () => { openHomePortModal(); });
  } else if (state.phase === 'upgrade') {
    actionsEl.appendChild(phaseNote('Upgrade Phase — install cannons/sails/hull from hand, or continue.'));
    addAction(actionsEl, 'Continue', () => { finishUpgradePhase(); render(); });
  } else if (state.phase === 'defending') {
    actionsEl.appendChild(phaseNote('Defending Phase — resolving automatically…'));
  } else if (state.phase === 'attack') {
    actionsEl.appendChild(phaseNote('Attack Phase — attack any ship at sea (including your own), as many times as you keep winning.'));
    addAction(actionsEl, 'Continue', () => { finishAttackPhase(); render(); });
  } else if (state.phase === 'shipsToSea') {
    const mustPlace = mustPlaceShip(human);
    const oceanFull = state.seaShips.length >= SHIPS_AT_SEA_CAP;
    const hint = mustPlace
      ? 'You must put at least one ship out to sea this turn before continuing.'
      : oceanFull
      ? `The ocean is full (${SHIPS_AT_SEA_CAP} ships at sea) — no more can be put out until some are captured, sunk, or sold.`
      : activeShip
      ? `Loading the ${findCard(activeShip.shipId).name} — click a highlighted hand card, then Up or Down.`
      : 'Ships-to-Sea Phase — put a ship out, or click one of your ships at sea to load it from hand.';
    actionsEl.appendChild(phaseNote(hint));
    const btn = document.createElement('button');
    btn.className = 'action-btn primary';
    btn.textContent = 'Continue';
    btn.disabled = mustPlace;
    btn.onclick = () => { finishShipsToSea(); render(); };
    actionsEl.appendChild(btn);
  } else if (state.phase === 'draw') {
    const remaining = SHIPS_TO_SEA_CAP - human.shipsDrawnThisTurn;
    actionsEl.appendChild(phaseNote(`Drew a ship this turn. You may draw up to ${remaining} more from your ship pile before ending your turn.`));
    if (remaining > 0 && human.shipDrawPile.length) {
      addAction(actionsEl, `Draw Another Ship (${human.shipsDrawnThisTurn}/${SHIPS_TO_SEA_CAP})`, () => { humanDrawAnotherShip(); render(); });
    }
    addAction(actionsEl, 'End Turn', () => { finishDrawPhase(); render(); scheduleAiIfNeeded(); });
  }
}

function phaseNote(text) {
  const d = document.createElement('div');
  d.className = 'phase-note';
  d.textContent = text;
  return d;
}

function addAction(container, label, handler) {
  const btn = document.createElement('button');
  btn.className = 'action-btn primary';
  btn.textContent = label;
  btn.onclick = handler;
  container.appendChild(btn);
}

// ── Home Port modal ─────────────────────────────────────────────────────

function openHomePortModal() {
  const human = state.players.find(p => p.isHuman);
  const captureValue = human.capturePile.reduce((s, e) => { const c = findCard(e.cardId); return s + (c && c.value ? c.value : 0); }, 0);
  const ship = human.ship;
  let upkeep = 0;
  if (ship.crew) upkeep += findCard(ship.crew.cardId).value || 0;
  if (ship.officer) upkeep += findCard(ship.officer.cardId).cost || 0;

  $('homeport-summary').innerHTML = `
    <p>Selling your capture pile (${human.capturePile.length} cards): <strong>+${captureValue}g</strong></p>
    <p>Crew/officer upkeep: <strong>-${upkeep}g</strong>${upkeep > human.stash + captureValue ? ' — you can\'t cover this! You\'ll lose your ship and upgrades, reverting to your starter.' : ''}</p>
  `;

  const shipChoices = $('homeport-ship-choices');
  shipChoices.innerHTML = '';

  const addChoice = (card, label, onClick) => {
    const wrap = document.createElement('div');
    wrap.className = 'hand-card-wrap';
    wrap.appendChild(makeCardEl(card, 'ship'));
    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    btn.textContent = label;
    btn.onclick = onClick;
    wrap.appendChild(btn);
    shipChoices.appendChild(wrap);
  };

  const shipCardsInHand = human.hand.filter(c => c.category === 'ship');
  shipCardsInHand.forEach(entry => {
    const card = findCard(entry.cardId);
    addChoice(card, `Buy & Sail (${card.value}g)`, () => {
      $('modal-homeport').classList.add('hidden');
      doHomePort(human, { source: 'hand', uid: entry.uid });
      render();
      scheduleAiIfNeeded();
    });
  });

  const shipCardsInCapture = human.capturePile.filter(e => e.category === 'ship');
  shipCardsInCapture.forEach(entry => {
    const card = findCard(entry.cardId);
    addChoice(card, 'Sail with this (free)', () => {
      $('modal-homeport').classList.add('hidden');
      doHomePort(human, { source: 'capture', uid: entry.uid });
      render();
      scheduleAiIfNeeded();
    });
  });

  if (!shipCardsInHand.length && !shipCardsInCapture.length) {
    shipChoices.innerHTML = '<p class="phase-note">No alternative ships available — keep your current ship.</p>';
  }

  $('modal-homeport').classList.remove('hidden');
}

// ── Flee modal ───────────────────────────────────────────────────────────

function renderFleeModal() {
  const modal = $('modal-flee');
  if (state.pendingFlee) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// ── Game over ────────────────────────────────────────────────────────────

function renderGameOver() {
  const modal = $('modal-gameover');
  if (state.phase === 'gameover' && state.winner) {
    $('gameover-title').textContent = state.winner.isHuman ? 'You win!' : `${state.winner.name} wins!`;
    $('gameover-desc').textContent = `Final stash: ${state.players.map(p => `${p.name} ${p.stash}g`).join(' vs. ')}`;
    modal.classList.remove('hidden');
    if (state.winner.isHuman && !state._confettiShown) {
      state._confettiShown = true;
      showConfetti();
    }
  } else {
    modal.classList.add('hidden');
  }
}

// ── Confetti (ported verbatim from President Game / Spite and Malice) ──

function showConfetti() {
  const colors = ['#f4d03f', '#4ade80', '#60a5fa', '#f87171', '#c084fc', '#fb923c', '#ffffff'];
  for (let i = 0; i < 120; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left             = Math.random() * 100 + 'vw';
    el.style.width            = (7 + Math.random() * 7) + 'px';
    el.style.height           = (7 + Math.random() * 7) + 'px';
    el.style.background       = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius     = Math.random() > 0.4 ? '2px' : '50%';
    el.style.animationName     = Math.random() > 0.5 ? 'confetti-cw' : 'confetti-ccw';
    el.style.animationDuration = (2 + Math.random() * 2.5) + 's';
    el.style.animationDelay   = (Math.random() * 1.2) + 's';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── AI turn pacing ───────────────────────────────────────────────────────
// game.js's phase functions apply an AI's action for the CURRENT phase and
// then stop (they no longer self-chain into the next phase) -- this loop
// drives the AI's turn one visible step at a time via setTimeout, calling
// render() after each step so the player watches it unfold instead of
// seeing only the end result. Mirrors the pacing pattern used in Spite and
// Malice / President Game: ui.js owns all timing, game.js stays pure sync.
const AI_STEP_DELAY_MS = 700;

function scheduleAiIfNeeded() {
  const cur = state.players[state.currentTurn];
  if (!cur || cur.isHuman || state.phase === 'gameover') return;
  setTimeout(runAiStep, AI_STEP_DELAY_MS);
}

function runAiStep() {
  const cur = state.players[state.currentTurn];
  if (!cur || cur.isHuman || state.phase === 'gameover') { render(); return; }

  if (state.phase === 'turnStart') {
    if (aiWantsHomePort(cur)) {
      doHomePort(cur, aiChooseHomePortShip(cur));
    } else {
      beginRegularTurn();
    }
  } else if (state.phase === 'upgrade') {
    aiUpgradePhase(cur);
    advancePhase();
  } else if (state.phase === 'attack') {
    aiAttackStep(state.currentTurn);
  } else if (state.phase === 'shipsToSea') {
    aiShipsToSeaPhase(cur);
    advancePhase();
  }
  // 'draw' phase for AI resolves fully (including endTurn()) inside
  // runDrawPhase, reached via the advancePhase() call above -- nothing left
  // to do here for that phase.

  render();
  scheduleAiIfNeeded();
}

// ── Top-level render ────────────────────────────────────────────────────

function render() {
  if (!state.players.length) return;
  const human = state.players.find(p => p.isHuman);
  const ai = state.players.find(p => !p.isHuman);
  renderTurnIndicator();
  renderPlayerShipZone($('zone-you'), human);
  renderPlayerShipZone($('zone-opponent'), ai);
  renderOcean();
  renderLog();
  renderHandAndActions();
  renderFleeModal();
  renderGameOver();
}

// ── Wiring ───────────────────────────────────────────────────────────────

function startNewGame() {
  $('modal-start').classList.add('hidden');
  $('modal-gameover').classList.add('hidden');
  state._confettiShown = false;
  initGame();
  startTurn();
  render();
  scheduleAiIfNeeded();
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-start').onclick = startNewGame;
  $('btn-new-game').onclick = () => { $('modal-start').classList.remove('hidden'); };
  $('btn-gameover-again').onclick = startNewGame;

  $('btn-homeport-confirm').onclick = () => {
    const human = state.players.find(p => p.isHuman);
    $('modal-homeport').classList.add('hidden');
    doHomePort(human);
    render();
    scheduleAiIfNeeded();
  };
  $('btn-homeport-cancel').onclick = () => { $('modal-homeport').classList.add('hidden'); };

  $('btn-flee-attempt').onclick = () => { humanFleeChoice(true); render(); scheduleAiIfNeeded(); };
  $('btn-flee-stand').onclick = () => { humanFleeChoice(false); render(); scheduleAiIfNeeded(); };
});
