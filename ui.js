// ── DOM / rendering / interaction ───────────────────────────────────────────

const $ = id => document.getElementById(id);

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
// card face-up regardless of its faceUp flag (used for the player's own
// persistent ship, and for your own ships-at-sea).
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

  state.seaShips.forEach(seaShip => {
    const owner = state.players[seaShip.ownerIdx];
    const isOwnShip = seaShip.ownerIdx === humanIdx;
    const card = document.createElement('div');
    card.className = 'sea-ship';

    const header = document.createElement('div');
    header.className = 'sea-ship-header';
    header.innerHTML = `
      <span><span class="sea-ship-owner">${owner.name}'s ship</span><br>
      <span class="sea-ship-name">${findCard(seaShip.shipId).name}</span></span>
      <span class="sea-ship-rating">${shipRating(seaShip, 'atk')}/${shipRating(seaShip, 'def')}/${shipRating(seaShip, 'spd')}</span>
    `;
    card.appendChild(header);
    card.appendChild(buildShipSlotsEl(seaShip, isOwnShip));

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

    if (isHumanTurn && !state.pendingFlee && state.phase === 'shipsToSea' && isOwnShip) {
      const loadRow = buildLoadRow(human, seaShip);
      if (loadRow) card.appendChild(loadRow);
    }

    oceanEl.appendChild(card);
  });
}

function buildLoadRow(player, seaShip) {
  const eligible = player.hand.filter(c => ['captain', 'crew', 'officer', 'upgrade', 'treasure', 'vip'].includes(c.category))
    .filter(c => {
      if (c.category === 'captain') return !seaShip.captain;
      if (c.category === 'crew') return !seaShip.crew;
      if (c.category === 'officer') return !seaShip.officer;
      if (c.category === 'upgrade') return !seaShip.upgrades[findCard(c.cardId).slot];
      return true; // treasure/vip always stackable
    });
  if (!eligible.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'load-row';
  const label = document.createElement('div');
  label.className = 'load-row-label';
  label.textContent = 'Load from hand:';
  wrap.appendChild(label);

  const list = document.createElement('div');
  list.className = 'load-candidates';
  eligible.forEach(handEntry => {
    const card = findCard(handEntry.cardId);
    const item = document.createElement('div');
    item.className = 'load-candidate';
    const name = document.createElement('div');
    name.className = 'mini-name';
    name.textContent = card.name;
    item.appendChild(name);
    const row = document.createElement('div');
    row.className = 'mini-btn-row';
    const upBtn = document.createElement('button');
    upBtn.className = 'mini-btn';
    upBtn.textContent = 'Up';
    upBtn.onclick = () => { loadSeaShip(player, seaShip.id, handEntry.uid, true); render(); };
    const downBtn = document.createElement('button');
    downBtn.className = 'mini-btn';
    downBtn.textContent = 'Down';
    downBtn.onclick = () => { loadSeaShip(player, seaShip.id, handEntry.uid, false); render(); };
    row.appendChild(upBtn);
    row.appendChild(downBtn);
    item.appendChild(row);
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

// ── Log ──────────────────────────────────────────────────────────────────

function renderLog() {
  const el = $('log');
  el.innerHTML = state.log.map(l => `<div class="log-line">${l}</div>`).join('');
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

  human.hand.forEach(entry => {
    const card = findCard(entry.cardId);
    const wrap = document.createElement('div');
    wrap.className = 'hand-card-wrap';
    wrap.appendChild(makeCardEl(card, entry.category));

    if (isHumanTurn && !state.pendingFlee) {
      if (state.phase === 'upgrade' && entry.category === 'upgrade') {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = `Install (${card.buyCost}g)`;
        btn.disabled = human.stash < card.buyCost;
        btn.onclick = () => { buyUpgrade(human, entry.uid); render(); };
        wrap.appendChild(btn);
      } else if (state.phase === 'shipsToSea' && entry.category === 'ship') {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.textContent = `Put to Sea (${human.shipsToSeaThisTurn}/${SHIPS_TO_SEA_CAP})`;
        btn.disabled = human.shipsToSeaThisTurn >= SHIPS_TO_SEA_CAP;
        btn.onclick = () => { putShipToSea(human, entry.uid); render(); };
        wrap.appendChild(btn);
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
    actionsEl.appendChild(phaseNote('Ships-to-Sea Phase — put ships out from hand, load cargo onto your ships at sea, or continue.'));
    addAction(actionsEl, 'Continue', () => { finishShipsToSea(); render(); });
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
    });
  });

  const shipCardsInCapture = human.capturePile.filter(e => e.category === 'ship');
  shipCardsInCapture.forEach(entry => {
    const card = findCard(entry.cardId);
    addChoice(card, 'Sail with this (free)', () => {
      $('modal-homeport').classList.add('hidden');
      doHomePort(human, { source: 'capture', uid: entry.uid });
      render();
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

// ── Top-level render ────────────────────────────────────────────────────

function render() {
  if (!state.players.length) return;
  const human = state.players.find(p => p.isHuman);
  const ai = state.players.find(p => !p.isHuman);
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
  };
  $('btn-homeport-cancel').onclick = () => { $('modal-homeport').classList.add('hidden'); };

  $('btn-flee-attempt').onclick = () => { humanFleeChoice(true); render(); };
  $('btn-flee-stand').onclick = () => { humanFleeChoice(false); render(); };
});
