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

// Crew/officer wage — what you pay in arrears at Home Port for a voyage they
// crewed (crew's value, officer's cost). Shown on the card face so the cost
// is visible before you commit; other card types don't carry a wage.
function cardWageLine(card, category) {
  if (category !== 'crew' && category !== 'officer') return '';
  const g = card.value != null ? card.value : card.cost;
  if (g == null) return '';
  return `<div class="card-wage">Wage: ${g}g</div>`;
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
    ${cardWageLine(card, category)}
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

  const captureValue = player.capturePile.reduce((s, e) => { const c = findCard(e.cardId); return s + (c ? cardSellValue(c, e.category) : 0); }, 0);
  const stats = document.createElement('div');
  stats.className = 'ship-econ';
  stats.innerHTML = `
    <span>Stash: <strong>${player.stash}g</strong></span>
    <span>Discard: ${player.discardPile.length} card${player.discardPile.length === 1 ? '' : 's'}</span>
    <span>Hand: ${player.hand.length}</span>
  `;
  const captureLink = document.createElement('span');
  captureLink.className = 'capture-pile-link';
  captureLink.textContent = `Capture pile: ${player.capturePile.length} card${player.capturePile.length === 1 ? '' : 's'} (~${captureValue}g)`;
  captureLink.onclick = () => openCapturePileView(player);
  stats.insertBefore(captureLink, stats.children[1]);
  zoneEl.appendChild(stats);
}

// ── Capture pile viewer (either player, viewable any time -- not gated to
// Home Port like the discard/upgrade reveals; Boss, 2026-08-26) ──────────

function openCapturePileView(player) {
  $('capture-view-title').textContent = `${possessive(player.name)} Capture Pile`;
  const el = $('capture-view-cards');
  el.innerHTML = '';
  if (player.capturePile.length) {
    player.capturePile.forEach(entry => {
      const card = findCard(entry.cardId);
      if (card) el.appendChild(makeCardEl(card, entry.category));
    });
  } else {
    el.innerHTML = '<p class="phase-note">Empty.</p>';
  }
  $('modal-capture-view').classList.remove('hidden');
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

  const inLoadMode = isHumanTurn && !state.pendingFlee && !state.pendingCrewSwap && !state.pendingCaptainChoice && !state.pendingOfficerSwap && state.phase === 'shipsToSea';

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
    if (isHumanTurn && !state.pendingFlee && !state.pendingCrewSwap && !state.pendingCaptainChoice && !state.pendingOfficerSwap) {
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
    <span class="ti-turn">${player.name === 'You' ? 'Your Turn' : `${player.name}'s Turn`}</span>
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

// Groups hand cards by category (preserving first-seen category order),
// with the 'ship' group always last so ships render at the far right of
// the hand row (Boss, 2026-08-24).
function groupHandByCategory(hand) {
  const buckets = new Map();
  const order = [];
  hand.forEach(entry => {
    if (!buckets.has(entry.category)) { buckets.set(entry.category, []); order.push(entry.category); }
    buckets.get(entry.category).push(entry);
  });
  order.sort((a, b) => (a === 'ship') - (b === 'ship'));
  return order.flatMap(cat => buckets.get(cat));
}

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

  groupHandByCategory(human.hand).forEach(entry => {
    const card = findCard(entry.cardId);
    const wrap = document.createElement('div');
    const isLoadEligible = eligibleUids && eligibleUids.has(entry.uid);
    const isSelected = uiSelectedHandUid === entry.uid;
    wrap.className = 'hand-card-wrap' + (isLoadEligible ? ' load-eligible' : '') + (isSelected ? ' selected' : '');
    const cardEl = makeCardEl(card, entry.category);
    wrap.appendChild(cardEl);

    if (isHumanTurn && !state.pendingFlee && !state.pendingCrewSwap && !state.pendingCaptainChoice && !state.pendingOfficerSwap) {
      if (state.phase === 'shipsToSea' && entry.category === 'ship') {
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
  if (state.pendingCrewSwap) return; // crew swap modal handles this
  if (state.pendingCaptainChoice) return; // captain choice modal handles this
  if (state.pendingOfficerSwap) return; // officer swap modal handles this

  if (state.phase === 'turnStart') {
    addAction(actionsEl, 'Set Sail', () => { beginRegularTurn(); render(); });
    addAction(actionsEl, 'Return to Home Port', () => { openHomePortModal(); });
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
    btn.onclick = () => { finishShipsToSea(); render(); scheduleAiIfNeeded(); };
    actionsEl.appendChild(btn);
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

// Capture-pile upgrade uids the player has chosen to equip free at Home
// Port instead of selling -- UI-only selection state, reset whenever the
// modal is freshly opened (not on an internal re-render from a toggle).
let uiHomePortEquipUids = new Set();
// Crew/officer picked to sail with next voyage: null means "keep whichever
// one was just aboard" -- { uid } means a specific capture-pile card
// (Boss, 2026-08-28 economy rework; replaces the old retain-crew checkbox).
let uiHomePortCrewChoice = null;
let uiHomePortOfficerChoice = null;

// Shared renderer for the crew and officer "who sails next" pickers -- same
// shape for both, just a different category/current-attachment/UI-state.
// Choice values: null = keep whoever's aboard; { uid } = a capture-pile card;
// { none: true } = sail without one (officer slot stays empty; crew drops
// back to the free starter crew, since every ship must sail crewed).
function renderHomePortNextPicker(human, category, current, getChoice, setChoice, labelEl, containerEl) {
  const candidates = [];
  if (current) candidates.push({ uid: null, cardId: current.cardId });
  human.capturePile.filter(e => e.category === category).forEach(e => candidates.push({ uid: e.uid, cardId: e.cardId }));

  containerEl.innerHTML = '';
  if (!candidates.length) { labelEl.classList.add('hidden'); return; }
  candidates.push({ none: true });
  labelEl.classList.remove('hidden');
  labelEl.textContent = `Choose your ${category} for the next voyage (no extra fee either way):`;
  const chosen = getChoice();
  candidates.forEach(cand => {
    let isSelected;
    if (!chosen) isSelected = cand.uid === null && !cand.none; // default: keep whoever's aboard
    else if (chosen.none) isSelected = !!cand.none;
    else isSelected = !cand.none && chosen.uid === cand.uid;
    const wrap = document.createElement('div');
    wrap.className = 'hand-card-wrap' + (isSelected ? ' equip-selected' : '');

    if (cand.none) {
      const tile = document.createElement('div');
      tile.className = 'card card-none';
      tile.textContent = category === 'officer' ? 'No officer' : 'Starter crew';
      wrap.appendChild(tile);
    } else {
      const card = findCard(cand.cardId);
      if (!card) return;
      wrap.appendChild(makeCardEl(card, category));
    }

    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    btn.textContent = isSelected ? 'Sailing with this ✓' : 'Choose';
    btn.onclick = () => {
      setChoice(cand.none ? { none: true } : (cand.uid === null ? null : { uid: cand.uid }));
      openHomePortModal();
    };
    wrap.appendChild(btn);
    containerEl.appendChild(wrap);
  });
}

function openHomePortModal() {
  const human = state.players.find(p => p.isHuman);
  if ($('modal-homeport').classList.contains('hidden')) {
    uiHomePortEquipUids = new Set();
    uiHomePortCrewChoice = null;
    uiHomePortOfficerChoice = null;
  }

  const captureUpgrades = human.capturePile.filter(e => e.category === 'upgrade');
  const soldCount = human.capturePile.length - uiHomePortEquipUids.size;
  const captureValue = human.capturePile.reduce((s, e) => {
    if (uiHomePortEquipUids.has(e.uid)) return s; // equipping instead of selling
    const c = findCard(e.cardId);
    return s + (c ? cardSellValue(c, e.category) : 0);
  }, 0);
  const ship = human.ship;
  let upkeep = 0;
  if (ship.crew) upkeep += findCard(ship.crew.cardId).value || 0;
  if (ship.officer) upkeep += findCard(ship.officer.cardId).cost || 0;
  const available = human.stash + captureValue;

  $('homeport-summary').innerHTML = `
    <p>Selling your capture pile (${soldCount} card${soldCount === 1 ? '' : 's'}): <strong>+${captureValue}g</strong></p>
    <p>Crew/officer upkeep (wages for the voyage just finished): <strong>-${upkeep}g</strong>${upkeep > available ? ' — you can\'t cover this! You\'ll lose your ship and upgrades, reverting to your starter.' : ''}</p>
  `;

  // Crew & officer for the next voyage: free choice among the one just paid
  // for above and anything sitting in the capture pile. Moot on a mutiny --
  // everything resets to the starter crew regardless.
  if (upkeep <= available) {
    renderHomePortNextPicker(human, 'crew', ship.crew, () => uiHomePortCrewChoice, v => uiHomePortCrewChoice = v, $('homeport-crew-label'), $('homeport-crew-choices'));
    renderHomePortNextPicker(human, 'officer', ship.officer, () => uiHomePortOfficerChoice, v => uiHomePortOfficerChoice = v, $('homeport-officer-label'), $('homeport-officer-choices'));
  } else {
    $('homeport-crew-label').classList.add('hidden');
    $('homeport-crew-choices').innerHTML = '';
    $('homeport-officer-label').classList.add('hidden');
    $('homeport-officer-choices').innerHTML = '';
  }

  // Captured upgrades: equip free (the only place this can happen), or leave
  // them to be sold with the rest of the capture pile above.
  const upgradeLabel = $('homeport-upgrade-label');
  const upgradeEl = $('homeport-upgrade-choices');
  upgradeEl.innerHTML = '';
  if (captureUpgrades.length) {
    upgradeLabel.textContent = 'Equip a captured upgrade (free), or leave it to be sold:';
    upgradeLabel.classList.remove('hidden');
    captureUpgrades.forEach(entry => {
      const card = findCard(entry.cardId);
      const equipped = uiHomePortEquipUids.has(entry.uid);
      const wrap = document.createElement('div');
      wrap.className = 'hand-card-wrap' + (equipped ? ' equip-selected' : '');
      wrap.appendChild(makeCardEl(card, 'upgrade'));
      const btn = document.createElement('button');
      btn.className = 'mini-btn';
      btn.textContent = equipped ? 'Equipped ✓ (click to sell instead)' : `Equip Free (${card.slot})`;
      btn.onclick = () => {
        if (equipped) {
          uiHomePortEquipUids.delete(entry.uid);
        } else {
          // Only one upgrade can occupy a slot -- picking a new one for the
          // same slot replaces any earlier pick instead of stacking them.
          human.capturePile
            .filter(e => e.category === 'upgrade' && e.uid !== entry.uid && findCard(e.cardId).slot === card.slot)
            .forEach(e => uiHomePortEquipUids.delete(e.uid));
          uiHomePortEquipUids.add(entry.uid);
        }
        openHomePortModal();
      };
      wrap.appendChild(btn);
      upgradeEl.appendChild(wrap);
    });
  } else {
    upgradeLabel.classList.add('hidden');
  }

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
      doHomePort(human, { source: 'hand', uid: entry.uid }, Array.from(uiHomePortEquipUids), uiHomePortCrewChoice, uiHomePortOfficerChoice);
      render();
      scheduleAiIfNeeded();
    });
  });

  const shipCardsInCapture = human.capturePile.filter(e => e.category === 'ship');
  shipCardsInCapture.forEach(entry => {
    const card = findCard(entry.cardId);
    addChoice(card, 'Sail with this (free)', () => {
      $('modal-homeport').classList.add('hidden');
      doHomePort(human, { source: 'capture', uid: entry.uid }, Array.from(uiHomePortEquipUids), uiHomePortCrewChoice, uiHomePortOfficerChoice);
      render();
      scheduleAiIfNeeded();
    });
  });

  if (!shipCardsInHand.length && !shipCardsInCapture.length) {
    shipChoices.innerHTML = '<p class="phase-note">No alternative ships available — keep your current ship.</p>';
  }

  // The capture pile only ever showed upgrade/ship entries as individual
  // cards (the ones with their own equip/sail choices above) -- everything
  // else (crew turned down at capture, treasure, VIPs, officers, etc.) was
  // silently summed into the sell total above with no way to actually see
  // what's in there. Boss (2026-08-24): show it, same read-only pattern as
  // the discard pile below.
  const captureLeftovers = human.capturePile.filter(e => e.category !== 'upgrade' && e.category !== 'ship');
  $('homeport-capture-label').textContent = `Also in your capture pile — will be sold unless used above (${captureLeftovers.length} card${captureLeftovers.length === 1 ? '' : 's'}):`;
  const captureEl = $('homeport-capture-pile');
  captureEl.innerHTML = '';
  if (captureLeftovers.length) {
    captureLeftovers.forEach(entry => {
      const card = findCard(entry.cardId);
      if (card) captureEl.appendChild(makeCardEl(card, entry.category));
    });
  } else {
    captureEl.innerHTML = '<p class="phase-note">Nothing else.</p>';
  }

  // Discard pile is otherwise invisible during play (no interaction with it
  // yet -- may add the ability to open/use it later) -- Home Port is where
  // it becomes visible, read-only, per Boss (2026-08-21).
  $('homeport-discard-label').textContent = `Your discard pile (${human.discardPile.length} card${human.discardPile.length === 1 ? '' : 's'}):`;
  const discardEl = $('homeport-discard-pile');
  discardEl.innerHTML = '';
  if (human.discardPile.length) {
    human.discardPile.forEach(entry => {
      const card = findCard(entry.cardId);
      if (card) discardEl.appendChild(makeCardEl(card, entry.category));
    });
  } else {
    discardEl.innerHTML = '<p class="phase-note">Empty.</p>';
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

// ── Crew swap modal ("volunteers") ──────────────────────────────────────

function renderCrewSwapModal() {
  const modal = $('modal-crew-swap');
  if (state.pendingCrewSwap) {
    const human = state.players.find(p => p.isHuman);
    const newCard = findCard(state.pendingCrewSwap.crewCardId);
    const oldEntry = human.ship.crew;
    const oldCard = oldEntry ? findCard(oldEntry.cardId) : null;
    $('crew-swap-desc').textContent = oldCard
      ? `Swap in the captured ${newCard.name} in place of your current ${oldCard.name}? Your current crew will be discarded.`
      : `Sign on the captured ${newCard.name} as your crew?`;
    const preview = $('crew-swap-preview');
    preview.innerHTML = '';
    preview.appendChild(makeCardEl(newCard, 'crew'));
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// ── Captain choice modal (ransom or become their avatar) ─────────────────

function renderCaptainChoiceModal() {
  const modal = $('modal-captain-choice');
  if (state.pendingCaptainChoice) {
    const human = state.players.find(p => p.isHuman);
    const capCard = findCard(state.pendingCaptainChoice.captainCardId);
    const ransomValue = cardSellValue(capCard);
    $('captain-choice-desc').textContent = `You've captured ${capCard.name}. Ransom them for ${ransomValue}g, or become them yourself — permanently, for the rest of the game? If you become them, any captain currently aboard your ship is discarded.`;
    $('btn-captain-choice-ransom').textContent = `Ransom (${ransomValue}g)`;
    $('btn-captain-choice-become').textContent = `Become ${capCard.name}`;
    const preview = $('captain-choice-preview');
    preview.innerHTML = '';
    preview.appendChild(makeCardEl(capCard, 'captain'));
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// ── Officer swap modal (mirrors the crew "volunteers" offer) ─────────────

function renderOfficerSwapModal() {
  const modal = $('modal-officer-swap');
  if (state.pendingOfficerSwap) {
    const human = state.players.find(p => p.isHuman);
    const newCard = findCard(state.pendingOfficerSwap.officerCardId);
    const oldEntry = human.ship.officer;
    const oldCard = oldEntry ? findCard(oldEntry.cardId) : null;
    $('officer-swap-desc').textContent = oldCard
      ? `Swap in the captured ${newCard.name} in place of your current ${oldCard.name}? Your current officer will be discarded.`
      : `Sign on the captured ${newCard.name} as your officer?`;
    const preview = $('officer-swap-preview');
    preview.innerHTML = '';
    preview.appendChild(makeCardEl(newCard, 'officer'));
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// ── Game over ────────────────────────────────────────────────────────────

function renderGameOver() {
  const modal = $('modal-gameover');
  if (state.phase === 'gameover' && state.winner) {
    $('gameover-title').textContent = state.winner.name === 'You' ? 'You win!' : `${state.winner.name} wins!`;
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
      doHomePort(cur, aiChooseHomePortShip(cur), aiChooseHomePortUpgrades(cur), aiChooseHomePortCrew(cur), aiChooseHomePortOfficer(cur));
    } else {
      beginRegularTurn();
    }
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
  renderCrewSwapModal();
  renderCaptainChoiceModal();
  renderOfficerSwapModal();
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
    doHomePort(human, null, Array.from(uiHomePortEquipUids), uiHomePortCrewChoice, uiHomePortOfficerChoice);
    render();
    scheduleAiIfNeeded();
  };
  $('btn-homeport-cancel').onclick = () => { $('modal-homeport').classList.add('hidden'); };

  $('btn-captain-choice-ransom').onclick = () => { humanCaptainChoice(false); render(); scheduleAiIfNeeded(); };
  $('btn-captain-choice-become').onclick = () => { humanCaptainChoice(true); render(); scheduleAiIfNeeded(); };

  $('btn-officer-swap-accept').onclick = () => { humanOfficerSwapChoice(true); render(); scheduleAiIfNeeded(); };
  $('btn-officer-swap-decline').onclick = () => { humanOfficerSwapChoice(false); render(); scheduleAiIfNeeded(); };

  $('btn-flee-attempt').onclick = () => { humanFleeChoice(true); render(); scheduleAiIfNeeded(); };
  $('btn-flee-stand').onclick = () => { humanFleeChoice(false); render(); scheduleAiIfNeeded(); };

  $('btn-crew-swap-accept').onclick = () => { humanCrewSwapChoice(true); render(); scheduleAiIfNeeded(); };
  $('btn-crew-swap-decline').onclick = () => { humanCrewSwapChoice(false); render(); scheduleAiIfNeeded(); };

  $('btn-capture-view-close').onclick = () => { $('modal-capture-view').classList.add('hidden'); };
});
