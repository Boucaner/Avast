// ── Game state & rules engine ───────────────────────────────────────────────
//
// Ship model (corrected per Boss 2026-08-14): each player has exactly ONE
// persistent "player ship" (state.players[i].ship) — this is never put to sea
// and never directly attacked by another player. Separately, the Ships-to-Sea
// phase puts OTHER ship cards from hand into a shared ocean (state.seaShips)
// — these are bait/target ships, fair game for ANY player (including their
// own owner) to attack during an Attack Phase. Combat always pits a player's
// ship against a ships-at-sea entity — players never fight each other's
// player ships directly, matching the rules' own "players do not fight
// against each other" line.
//
// Turn phases implemented (5 of the ruleset's 8 — see build plan for the rest):
//   Upgrade -> Defending (pirate-type ships-at-sea only) -> Attack/Combat -> Ships-to-Sea -> Draw
// Flags, wars, Letter of Marque, Events, and the Treasure Map action are deferred.

const WIN_GOLD = 3000;        // placeholder win target — retune once Boss locks a real number
const MAX_HAND = 7;
const HOME_PORT_TRIGGER_RATIO = 800; // AI: capture-pile value at which Home Port starts looking attractive
const SHIPS_TO_SEA_CAP = 3;   // placeholder — rules leave this undecided ("maybe 3")
const SHIPS_AT_SEA_CAP = 12;  // placeholder — total ships-at-sea, all owners combined, before the ocean is "full"

function rollDie() { return 1 + Math.floor(Math.random() * 6); }

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const state = {
  players: [],       // { name, isHuman, hand, drawPile, discardPile, capturePile, stash, ship }
  seaShips: [],       // shared ocean: { id, ownerIdx, shipId, captain, crew, officer, upgrades, cargo }
  currentTurn: 0,
  phase: 'start',     // 'start' | 'turnStart' | 'upgrade' | 'defending' | 'attack' | 'shipsToSea' | 'draw' | 'homeport' | 'gameover'
  pendingFlee: null,  // { controllerIdx, callback } when a human flee decision is needed
  log: [],
  winner: null,
};

function log(msg) {
  state.log.push(msg);
  if (state.log.length > 200) state.log.shift();
}

// ── Ship-in-play helper ─────────────────────────────────────────────────────
// A ship instance: { shipId, captain, crew, officer, upgrades:{cannon,sails,hull}, cargo:[] }
// Attached-card entries are { cardId, faceUp }. cargo holds treasure/VIP cards.
// Player ships' items are always face-up (visible to everyone) per Setup —
// only ships-at-sea support face-down concealment.

function newShipInstance(shipId, crewCardId) {
  return {
    shipId,
    captain: null,
    crew: crewCardId ? { cardId: crewCardId, faceUp: true } : null,
    officer: null,
    upgrades: { cannon: null, sails: null, hull: null },
    cargo: [],
  };
}

function shipAttachments(ship) {
  const list = [];
  if (ship.captain) list.push(ship.captain);
  if (ship.crew) list.push(ship.crew);
  if (ship.officer) list.push(ship.officer);
  ['cannon', 'sails', 'hull'].forEach(slot => { if (ship.upgrades[slot]) list.push(ship.upgrades[slot]); });
  ship.cargo.forEach(c => list.push(c));
  return list;
}

// Combat rating = base ship stat + all attached cards' bonus for that stat.
// Per the rules, face-down cards still count once combat starts (they flip
// face-up at that moment) — faceUp only affects what's rendered beforehand.
function shipRating(ship, statKey) {
  const base = findCard(ship.shipId);
  let total = base[statKey] || 0;
  shipAttachments(ship).forEach(entry => {
    const card = findCard(entry.cardId);
    if (card && card.bonus && card.bonus[statKey]) total += card.bonus[statKey];
  });
  return total;
}

function statTotal(card) { return (card.atk || 0) + (card.def || 0) + (card.spd || 0); }

function shipIsPirateType(ship) {
  const base = findCard(ship.shipId);
  if (base.shipType === 'Pirate') return true;
  if (ship.captain) {
    const capt = findCard(ship.captain.cardId);
    if (ship.captain.faceUp && capt && capt.captainType === 'Pirate') return true;
  }
  return false;
}

function flipShipFaceUp(ship) {
  shipAttachments(ship).forEach(entry => { entry.faceUp = true; });
}

// ── Setup ────────────────────────────────────────────────────────────────

function initGame() {
  state.players = [
    makePlayer('You', true),
    makePlayer('Blackheart Bill', false),
  ];
  state.seaShips = [];
  state.currentTurn = 0;
  state.phase = 'turnStart';
  state.winner = null;
  state.log = [];
  log('New voyage begins. Fair winds!');
}

function makePlayer(name, isHuman) {
  const starterShipCard = pickStarterShip();
  const starterCrewCard = pickStarterCrew();
  const deck = shuffle(buildDeck());
  const player = {
    name, isHuman,
    starterShipId: starterShipCard.id,
    starterCrewId: starterCrewCard.id,
    hand: [],
    drawPile: deck,
    discardPile: [],
    capturePile: [],
    shipDrawPile: shuffle(buildShipPile()),
    shipsDrawnThisTurn: 0,
    stash: 0,
    ship: newShipInstance(starterShipCard.id, starterCrewCard.id),
    shipsToSeaThisTurn: 0,
    isFirstTurn: true,
    firstTurnAfterLoss: false,
  };
  drawToHand(player, MAX_HAND);
  for (let i = 0; i < 3; i++) drawOneShip(player, true); // starting hand must include 3 ships
  return player;
}

function drawToHand(player, target) {
  while (player.hand.length < target) {
    if (player.drawPile.length === 0) {
      if (player.discardPile.length === 0) break;
      player.drawPile = shuffle(player.discardPile);
      player.discardPile = [];
      log(`${player.name} reshuffles their discard pile into a new draw pile.`);
    }
    player.hand.push(player.drawPile.pop());
  }
}

// Ships are a separate, self-circulating pool (see buildShipPile in
// cards.js): drawn straight into hand here, and returned directly to this
// same pile (reshuffled) whenever a ship leaves play for any reason — sold,
// sunk, or lost in combat — rather than going through discardPile/drawPile
// like every other card type.
function drawOneShip(player, silent) {
  if (!player.shipDrawPile.length) return false;
  const card = player.shipDrawPile.pop();
  player.hand.push(card);
  player.shipsDrawnThisTurn = (player.shipsDrawnThisTurn || 0) + 1;
  if (!silent) log(`${player.name} draws a ship: ${findCard(card.cardId).name}.`);
  return true;
}

function returnShipToPile(player, cardId) {
  player.shipDrawPile.push({ uid: 'ship' + Math.random().toString(36).slice(2), cardId, category: 'ship', faceUp: false });
  player.shipDrawPile = shuffle(player.shipDrawPile);
}

// Routes a batch of cards to wherever they belong when leaving a player's
// possession: ships go back into that player's ship pile, everything else
// goes to their regular discard pile.
function discardCards(player, cards) {
  cards.forEach(entry => {
    if (entry.category === 'ship') {
      returnShipToPile(player, entry.cardId);
    } else {
      player.discardPile.push(entry);
    }
  });
}

function opponentIndex(idx) { return (idx + 1) % state.players.length; }
function categoryOf(cardId) {
  if (SHIPS.find(c => c.id === cardId)) return 'ship';
  if (CAPTAINS.find(c => c.id === cardId)) return 'captain';
  if (CREW.find(c => c.id === cardId)) return 'crew';
  if (OFFICERS.find(c => c.id === cardId)) return 'officer';
  if (VIPS.find(c => c.id === cardId)) return 'vip';
  if (UPGRADES.find(c => c.id === cardId)) return 'upgrade';
  return 'treasure';
}

// ── Turn flow ────────────────────────────────────────────────────────────

// NOTE: the whole engine chains synchronously (startTurn -> ... -> endTurn ->
// startTurn -> ...) with no trampoline. This is safe in real play because a
// human turn always starts a fresh call stack from a button click, bounding
// each AI turn's nesting to a few dozen frames. It is NOT safe for a headless
// AI-vs-AI simulation across an entire game (stack overflow) — if a sim.js
// like the sibling games' ever gets built, it needs a setTimeout/trampoline
// between turns, not direct recursive calls.
function startTurn() {
  const player = state.players[state.currentTurn];
  state.phase = 'turnStart';
  if (!player.isHuman) {
    if (aiWantsHomePort(player)) {
      doHomePort(player, aiChooseHomePortShip(player));
    } else {
      beginRegularTurn();
    }
  }
  // human: ui.js shows the Set Sail / Home Port choice
}

function beginRegularTurn() {
  const player = state.players[state.currentTurn];
  state.phase = 'upgrade';
  if (!player.isHuman) {
    aiUpgradePhase(player);
    advancePhase();
  }
}

function advancePhase() {
  // Defending temporarily skipped (Boss, 2026-08-18) — to be worked back in
  // later. runDefendingPhase() and everything it depends on is untouched;
  // re-add 'defending' here to restore it.
  const order = ['upgrade', 'attack', 'shipsToSea', 'draw'];
  const i = order.indexOf(state.phase);
  const next = order[i + 1];
  state.phase = next;

  if (next === 'defending') return runDefendingPhase();
  if (next === 'attack') return runAttackPhaseEntry();
  if (next === 'shipsToSea') return runShipsToSeaEntry();
  if (next === 'draw') return runDrawPhase();
}

// ── Upgrade phase (installs onto the player's own persistent ship) ───────

function buyUpgrade(player, cardUid) {
  const handEntry = player.hand.find(c => c.uid === cardUid);
  if (!handEntry || handEntry.category !== 'upgrade') return false;
  const card = findCard(handEntry.cardId);
  if (player.stash < card.buyCost) return false;
  player.stash -= card.buyCost;
  const old = player.ship.upgrades[card.slot];
  if (old) player.discardPile.push({ uid: old.cardId + '-disc' + Math.random(), cardId: old.cardId, category: 'upgrade' });
  player.ship.upgrades[card.slot] = { cardId: card.id, faceUp: true };
  player.hand = player.hand.filter(c => c.uid !== cardUid);
  log(`${player.name} installs ${card.name} (${card.slot}).`);
  return true;
}

function finishUpgradePhase() {
  advancePhase();
}

// ── Shared combat resolution helpers ────────────────────────────────────

function requestFleeDecision(controllerIdx, ownShip, otherShip, callback) {
  const controller = state.players[controllerIdx];
  if (!controller.isHuman) {
    return callback(aiFleeDecision(ownShip, otherShip));
  }
  state.pendingFlee = { controllerIdx, callback };
}

function humanFleeChoice(attemptFlee) {
  if (!state.pendingFlee) return;
  const { callback } = state.pendingFlee;
  state.pendingFlee = null;
  callback(attemptFlee);
}

// A ship-at-sea is captured (or sunk) into winnerPlayer's piles.
function sinkOrCapture(winnerPlayer, shipObj) {
  const sinkRoll = rollDie();
  const attachmentCards = shipAttachments(shipObj).map(e => ({ uid: e.cardId + '-' + Math.random(), cardId: e.cardId, category: categoryOf(e.cardId) }));
  if (sinkRoll === 6) {
    log(`${winnerPlayer.name} rolls a 6 — the prize sinks! Wreckage drifts into ${winnerPlayer.name}'s discard pile, and the ship itself returns to their ship pile.`);
    returnShipToPile(winnerPlayer, shipObj.shipId);
    winnerPlayer.discardPile.push(...attachmentCards);
  } else {
    log(`${winnerPlayer.name} rolls ${sinkRoll} — the ship is theirs. Added to the capture pile.`);
    const cards = [{ uid: 'ship-' + Math.random(), cardId: shipObj.shipId, category: 'ship' }, ...attachmentCards];
    winnerPlayer.capturePile.push(...cards);
  }
}

// A player's own ship is lost (they lost a combat they were party to).
// Everything on it — including the ship card itself — actually leaves play:
// the ship returns to the player's own ship pile (unless it was their
// starter, which was never drawn from a pile in the first place), and its
// other attachments go to the discard pile, matching the "discard current
// ship and all cards on it (unless starter)" rule.
function playerLosesShip(player) {
  discardCards(player, player.capturePile);
  player.capturePile = [];

  const oldShip = player.ship;
  if (oldShip.shipId !== player.starterShipId) returnShipToPile(player, oldShip.shipId);
  const leftovers = [];
  if (oldShip.captain) leftovers.push({ uid: 'disc' + Math.random(), cardId: oldShip.captain.cardId, category: 'captain' });
  if (oldShip.crew && oldShip.crew.cardId !== player.starterCrewId) leftovers.push({ uid: 'disc' + Math.random(), cardId: oldShip.crew.cardId, category: 'crew' });
  if (oldShip.officer) leftovers.push({ uid: 'disc' + Math.random(), cardId: oldShip.officer.cardId, category: 'officer' });
  ['cannon', 'sails', 'hull'].forEach(slot => { if (oldShip.upgrades[slot]) leftovers.push({ uid: 'disc' + Math.random(), cardId: oldShip.upgrades[slot].cardId, category: 'upgrade' }); });
  oldShip.cargo.forEach(c => leftovers.push({ uid: 'disc' + Math.random(), cardId: c.cardId, category: categoryOf(c.cardId) }));
  player.discardPile.push(...leftovers);

  player.ship = newShipInstance(player.starterShipId, player.starterCrewId);
  player.firstTurnAfterLoss = true;
  if (player === state.players[state.currentTurn]) {
    state.turnEndedByLoss = true;
  }
}

// ── Defending phase ─────────────────────────────────────────────────────
// v1: only Pirate-typed ships-at-sea can attack (Pirate Hunter / War Ship /
// flag-based checks are deferred — see build plan). One attack max per turn.

function runDefendingPhase() {
  const player = state.players[state.currentTurn];

  if (player.firstTurnAfterLoss) {
    player.firstTurnAfterLoss = false;
    log(`${player.name} has no time to defend — they're still rebuilding after their last loss.`);
    return advancePhase();
  }
  if (player.isFirstTurn) {
    player.isFirstTurn = false;
    return advancePhase();
  }

  const pirateShips = state.seaShips.filter(shipIsPirateType);
  if (!pirateShips.length) return advancePhase();

  const threat = pirateShips[Math.floor(Math.random() * pirateShips.length)];
  const ownerName = state.players[threat.ownerIdx].name;
  const roll = rollDie();
  log(`${ownerName}'s ${findCard(threat.shipId).name} at sea flies pirate colors — ${player.name} rolls ${roll} to see if it attacks (1-3 = attacked).`);
  if (roll > 3) {
    log(`No attack this time — smooth sailing for ${player.name}.`);
    return advancePhase();
  }

  const defenderShip = player.ship;
  const afterDone = () => {
    if (state.turnEndedByLoss) { state.turnEndedByLoss = false; state.phase = 'shipsToSea'; return runShipsToSeaEntry(); }
    advancePhase();
  };

  const proceed = (fled) => {
    if (fled) {
      log(`${player.name}'s ${findCard(defenderShip.shipId).name} slips away into the fog. Combat avoided.`);
      return afterDone();
    }
    flipShipFaceUp(threat);
    flipShipFaceUp(defenderShip);
    let defPenalty = 0;
    if (defenderShip._fledAttemptFailed) { defPenalty = 1; defenderShip._fledAttemptFailed = false; }

    const atkRoll = rollDie(), defRoll = rollDie();
    const atkTotal = shipRating(threat, 'atk') + atkRoll;
    const defTotal = shipRating(defenderShip, 'def') - defPenalty + defRoll;
    log(`Combat: ${ownerName}'s ${findCard(threat.shipId).name} attack ${shipRating(threat, 'atk')}+${atkRoll}=${atkTotal} vs ${player.name}'s defense ${shipRating(defenderShip, 'def') - defPenalty}+${defRoll}=${defTotal}.`);

    if (defTotal >= atkTotal) {
      log(`${player.name} beats back the attack and captures the pirate ship!`);
      state.seaShips = state.seaShips.filter(s => s.id !== threat.id);
      sinkOrCapture(player, threat);
    } else {
      log(`${player.name}'s ship is overwhelmed!`);
      playerLosesShip(player);
    }
    afterDone();
  };

  const atkSpd = shipRating(threat, 'spd');
  const defSpd = shipRating(defenderShip, 'spd');
  if (defSpd >= atkSpd + 2) {
    requestFleeDecision(state.currentTurn, defenderShip, threat, (attemptFlee) => {
      if (!attemptFlee) return proceed(false);
      const fr = rollDie();
      log(`${player.name} attempts to flee — rolls ${fr} (need 1-5).`);
      if (fr <= 5) return proceed(true);
      log('Flee attempt fails! -1 Defense this combat.');
      defenderShip._fledAttemptFailed = true;
      proceed(false);
    });
  } else {
    proceed(false);
  }
}

// ── Attack phase ─────────────────────────────────────────────────────────
// Players may attack any ship-at-sea, including their own, as long as they
// keep winning. A loss skips straight to Ships-to-Sea (still mandatory)
// and then Draw — no further attacks, upgrades, etc. this turn.

function runAttackPhaseEntry() {
  const player = state.players[state.currentTurn];
  if (state.turnEndedByLoss) { state.turnEndedByLoss = false; state.phase = 'shipsToSea'; return runShipsToSeaEntry(); }
  if (!state.seaShips.length) {
    return advancePhase();
  }
  if (!player.isHuman) return aiTakeAttackTurn(state.currentTurn);
  // human: ui.js shows targets + Attack buttons, plus Continue
}

function attackSeaShip(attackerIdx, seaShipId, onDone) {
  const attacker = state.players[attackerIdx];
  const seaShip = state.seaShips.find(s => s.id === seaShipId);
  if (!seaShip) return onDone && onDone();
  const attackerShip = attacker.ship;
  const ownerIdx = seaShip.ownerIdx;
  const ownerName = state.players[ownerIdx].name;

  const proceed = (fled) => {
    if (fled) {
      log(`${ownerName}'s ${findCard(seaShip.shipId).name} slips away into the fog. Combat avoided.`);
      return onDone && onDone();
    }
    flipShipFaceUp(attackerShip);
    flipShipFaceUp(seaShip);
    let defPenalty = 0;
    if (seaShip._fledAttemptFailed) { defPenalty = 1; seaShip._fledAttemptFailed = false; }

    const atkRoll = rollDie(), defRoll = rollDie();
    const atkTotal = shipRating(attackerShip, 'atk') + atkRoll;
    const defTotal = shipRating(seaShip, 'def') - defPenalty + defRoll;
    log(`Combat: ${attacker.name}'s attack ${shipRating(attackerShip, 'atk')}+${atkRoll}=${atkTotal} vs ${ownerName}'s ${findCard(seaShip.shipId).name} defense ${shipRating(seaShip, 'def') - defPenalty}+${defRoll}=${defTotal}.`);

    if (defTotal >= atkTotal) {
      log(`${ownerName}'s ${findCard(seaShip.shipId).name} holds them off! ${attacker.name}'s ship is lost in the exchange.`);
      playerLosesShip(attacker);
    } else {
      log(`${attacker.name} wins the exchange and captures ${ownerName}'s ${findCard(seaShip.shipId).name}!`);
      state.seaShips = state.seaShips.filter(s => s.id !== seaShipId);
      sinkOrCapture(attacker, seaShip);
    }
    onDone && onDone();
  };

  const atkSpd = shipRating(attackerShip, 'spd');
  const defSpd = shipRating(seaShip, 'spd');
  if (defSpd >= atkSpd + 2) {
    requestFleeDecision(ownerIdx, seaShip, attackerShip, (attemptFlee) => {
      if (!attemptFlee) return proceed(false);
      const fr = rollDie();
      log(`${ownerName} attempts to flee their ship at sea — rolls ${fr} (need 1-5).`);
      if (fr <= 5) return proceed(true);
      log('Flee attempt fails! -1 Defense this combat.');
      seaShip._fledAttemptFailed = true;
      proceed(false);
    });
  } else {
    proceed(false);
  }
}

function humanAttack(seaShipId) {
  attackSeaShip(state.currentTurn, seaShipId, () => {
    if (state.turnEndedByLoss) { state.turnEndedByLoss = false; state.phase = 'shipsToSea'; return runShipsToSeaEntry(); }
    // stays in Attack phase — ui.js re-renders so they can attack again or continue
  });
}

function aiTakeAttackTurn(playerIdx) {
  const target = aiChooseAttackTarget(playerIdx);
  if (!target) {
    log(`${state.players[playerIdx].name} holds back this turn.`);
    return advancePhase();
  }
  attackSeaShip(playerIdx, target.id, () => {
    if (state.turnEndedByLoss) { state.turnEndedByLoss = false; state.phase = 'shipsToSea'; return runShipsToSeaEntry(); }
    if (state.seaShips.length && Math.random() < 0.5) return aiTakeAttackTurn(playerIdx);
    advancePhase();
  });
}

function finishAttackPhase() {
  advancePhase();
}

// ── Ships-to-Sea phase ──────────────────────────────────────────────────
// Put ships from hand into the shared ocean (up to a per-turn cap), and load
// captain/crew/officer/upgrade/treasure/VIP cards onto ships you own there.

function runShipsToSeaEntry() {
  const player = state.players[state.currentTurn];
  player.shipsToSeaThisTurn = 0;
  if (!player.isHuman) {
    aiShipsToSeaPhase(player);
    advancePhase();
  }
  // human: ui.js shows put-to-sea + load options
}

function putShipToSea(player, handShipUid) {
  if (player.shipsToSeaThisTurn >= SHIPS_TO_SEA_CAP) return null;
  if (state.seaShips.length >= SHIPS_AT_SEA_CAP) return null;
  const handEntry = player.hand.find(c => c.uid === handShipUid && c.category === 'ship');
  if (!handEntry) return null;
  const seaShip = {
    id: 'sea' + Math.random().toString(36).slice(2),
    ownerIdx: state.players.indexOf(player),
    shipId: handEntry.cardId,
    captain: null, crew: null, officer: null,
    upgrades: { cannon: null, sails: null, hull: null },
    cargo: [],
  };
  state.seaShips.push(seaShip);
  player.hand = player.hand.filter(c => c.uid !== handShipUid);
  player.shipsToSeaThisTurn++;
  log(`${player.name} puts the ${findCard(seaShip.shipId).name} out to sea.`);
  return seaShip;
}

function loadSeaShip(player, seaShipId, handCardUid, faceUp) {
  const ownIdx = state.players.indexOf(player);
  const seaShip = state.seaShips.find(s => s.id === seaShipId && s.ownerIdx === ownIdx);
  if (!seaShip) return false;
  const handEntry = player.hand.find(c => c.uid === handCardUid);
  if (!handEntry) return false;
  const entry = { cardId: handEntry.cardId, faceUp: !!faceUp };

  if (handEntry.category === 'captain') {
    if (seaShip.captain) return false;
    seaShip.captain = entry;
  } else if (handEntry.category === 'crew') {
    if (seaShip.crew) return false;
    seaShip.crew = entry;
  } else if (handEntry.category === 'officer') {
    if (seaShip.officer) return false;
    seaShip.officer = entry;
  } else if (handEntry.category === 'upgrade') {
    const card = findCard(handEntry.cardId);
    if (seaShip.upgrades[card.slot]) return false;
    seaShip.upgrades[card.slot] = entry;
  } else if (handEntry.category === 'treasure' || handEntry.category === 'vip') {
    seaShip.cargo.push(entry);
  } else {
    return false;
  }
  player.hand = player.hand.filter(c => c.uid !== handCardUid);
  log(`${player.name} loads ${findCard(handEntry.cardId).name} onto their ${findCard(seaShip.shipId).name}${faceUp ? '' : ' face-down'}.`);
  return true;
}

// Placing a ship is mandatory once per turn -- unless the player has no ship
// card in hand to place, or the ocean is already at its cap, in which case
// the requirement is waived.
function mustPlaceShip(player) {
  if (state.seaShips.length >= SHIPS_AT_SEA_CAP) return false;
  return player.shipsToSeaThisTurn === 0 && player.hand.some(c => c.category === 'ship');
}

function finishShipsToSea() {
  if (mustPlaceShip(state.players[state.currentTurn])) return false;
  advancePhase();
  return true;
}

// ── Draw phase ───────────────────────────────────────────────────────────
// Refill the regular hand, then draw a ship (mandatory, if the pile has one)
// with up to SHIPS_TO_SEA_CAP total allowed this turn -- extra ships beyond
// the first are optional, for next turn's Ships-to-Sea Phase to use.

function runDrawPhase() {
  state.phase = 'draw';
  const player = state.players[state.currentTurn];
  drawToHand(player, MAX_HAND);
  if (player.hand.length > MAX_HAND) player.hand = player.hand.slice(0, MAX_HAND);

  player.shipsDrawnThisTurn = 0;
  drawOneShip(player);

  if (!player.isHuman) {
    while (player.shipsDrawnThisTurn < SHIPS_TO_SEA_CAP && player.shipDrawPile.length && Math.random() < 0.4) {
      drawOneShip(player);
    }
    return endTurn();
  }
  // human: ui.js shows "Draw Another Ship" / "End Turn"
}

function humanDrawAnotherShip() {
  const player = state.players[state.currentTurn];
  if (player.shipsDrawnThisTurn >= SHIPS_TO_SEA_CAP) return false;
  return drawOneShip(player);
}

function finishDrawPhase() {
  endTurn();
}

function endTurn() {
  if (checkWin()) return;
  state.currentTurn = opponentIndex(state.currentTurn);
  startTurn();
}

// ── Home Port ────────────────────────────────────────────────────────────
// shipChoice: { source: 'hand'|'capture', uid } to switch ships, or falsy to
// keep the current one.

function doHomePort(player, shipChoice) {
  state.phase = 'homeport';
  log(`${player.name} sails for Home Port.`);

  let chosenCaptureEntry = null;
  if (shipChoice && shipChoice.source === 'capture') {
    chosenCaptureEntry = player.capturePile.find(e => e.uid === shipChoice.uid && e.category === 'ship');
  }

  // 1) Sell capture pile (excluding a ship being kept to sail with) -- any
  // ship cards among the sold cards return to the ship pile, not discardPile
  let earned = 0;
  const toSell = player.capturePile.filter(e => e !== chosenCaptureEntry);
  toSell.forEach(entry => {
    const card = findCard(entry.cardId);
    if (card) earned += card.value != null ? card.value : (card.sellValue != null ? card.sellValue : 0);
  });
  if (earned > 0) log(`${player.name} sells their haul for ${earned} gold.`);
  player.stash += earned;
  discardCards(player, toSell);
  player.capturePile = chosenCaptureEntry ? [chosenCaptureEntry] : [];

  // 2) Pay crew/officer upkeep on the outgoing ship
  const outgoingShip = player.ship;
  let upkeep = 0;
  if (outgoingShip.crew) upkeep += findCard(outgoingShip.crew.cardId).value || 0;
  if (outgoingShip.officer) upkeep += findCard(outgoingShip.officer.cardId).cost || 0;

  let forcedStarter = false;
  if (upkeep > player.stash) {
    forcedStarter = true;
    log(`${player.name} can't cover ${upkeep} gold in upkeep — the crew mutinies! Back to the starter ship, no upgrades.`);
  } else {
    player.stash -= upkeep;
    if (upkeep > 0) log(`${player.name} pays ${upkeep} gold in crew/officer upkeep.`);
  }
  if (outgoingShip.crew) player.discardPile.push({ uid: 'disc' + Math.random(), cardId: outgoingShip.crew.cardId, category: 'crew' });
  if (outgoingShip.officer) player.discardPile.push({ uid: 'disc' + Math.random(), cardId: outgoingShip.officer.cardId, category: 'officer' });

  // 3) Choose next ship. Whenever the ship is actually being replaced, the
  // outgoing one truly leaves play: its own card returns to the ship pile
  // (unless it was the starter, which never came from a pile), and whatever
  // was still attached to it (captain/upgrades/cargo) goes to the discard
  // pile rather than silently vanishing.
  function releaseOutgoingShip() {
    if (outgoingShip.shipId !== player.starterShipId) returnShipToPile(player, outgoingShip.shipId);
    const leftovers = [];
    if (outgoingShip.captain) leftovers.push({ uid: 'disc' + Math.random(), cardId: outgoingShip.captain.cardId, category: 'captain' });
    ['cannon', 'sails', 'hull'].forEach(slot => { if (outgoingShip.upgrades[slot]) leftovers.push({ uid: 'disc' + Math.random(), cardId: outgoingShip.upgrades[slot].cardId, category: 'upgrade' }); });
    outgoingShip.cargo.forEach(c => leftovers.push({ uid: 'disc' + Math.random(), cardId: c.cardId, category: categoryOf(c.cardId) }));
    player.discardPile.push(...leftovers);
  }

  if (forcedStarter) {
    if (chosenCaptureEntry) { returnShipToPile(player, chosenCaptureEntry.cardId); player.capturePile = []; }
    releaseOutgoingShip();
    player.ship = newShipInstance(player.starterShipId, player.starterCrewId);
  } else if (shipChoice && shipChoice.source === 'hand') {
    const handEntry = player.hand.find(c => c.uid === shipChoice.uid && c.category === 'ship');
    const card = handEntry && findCard(handEntry.cardId);
    if (card && player.stash >= card.value) {
      player.stash -= card.value;
      player.hand = player.hand.filter(c => c.uid !== shipChoice.uid);
      releaseOutgoingShip();
      player.ship = newShipInstance(card.id);
      log(`${player.name} buys the ${card.name} for ${card.value} gold.`);
    } else {
      outgoingShip.crew = null;
      outgoingShip.officer = null;
    }
  } else if (chosenCaptureEntry) {
    releaseOutgoingShip();
    player.ship = newShipInstance(chosenCaptureEntry.cardId);
    player.capturePile = [];
    log(`${player.name} takes the captured ${findCard(chosenCaptureEntry.cardId).name} as their new ship.`);
  } else {
    outgoingShip.crew = null;
    outgoingShip.officer = null;
  }

  drawToHand(player, MAX_HAND);
  if (checkWin()) return;
  state.currentTurn = opponentIndex(state.currentTurn);
  startTurn();
}

function checkWin() {
  const winner = state.players.find(p => p.stash >= WIN_GOLD);
  if (winner) {
    state.winner = winner;
    state.phase = 'gameover';
    log(`${winner.name} stashes ${winner.stash} gold at Home Port — victory!`);
    return true;
  }
  return false;
}

// ── AI (probabilistic, not hard-threshold — matches President Game's style) ─

function expectedRating(ship, statKey) { return shipRating(ship, statKey) + 3.5; }

function estimateWinProb(attackerShip, defenderShip) {
  // Rough model: difference in expected totals mapped to a 0..1 probability.
  const diff = expectedRating(attackerShip, 'atk') - expectedRating(defenderShip, 'def');
  return clamp(0.5 + diff * 0.08, 0.05, 0.95);
}

function aiWantsHomePort(player) {
  const captureValue = player.capturePile.reduce((sum, e) => { const c = findCard(e.cardId); return sum + (c && c.value ? c.value : 0); }, 0);
  const chance = clamp(captureValue / HOME_PORT_TRIGGER_RATIO, 0, 0.85);
  return Math.random() < chance;
}

function aiChooseHomePortShip(player) {
  const currentTotal = statTotal(findCard(player.ship.shipId));
  let best = null, bestTotal = currentTotal;
  player.capturePile.filter(e => e.category === 'ship').forEach(e => {
    const card = findCard(e.cardId);
    if (statTotal(card) > bestTotal) { bestTotal = statTotal(card); best = { source: 'capture', uid: e.uid }; }
  });
  player.hand.filter(c => c.category === 'ship').forEach(c => {
    const card = findCard(c.cardId);
    if (statTotal(card) > bestTotal && player.stash >= card.value) { bestTotal = statTotal(card); best = { source: 'hand', uid: c.uid }; }
  });
  return best;
}

function aiUpgradePhase(player) {
  const upgradeCards = player.hand.filter(c => c.category === 'upgrade');
  upgradeCards.forEach(handEntry => {
    const card = findCard(handEntry.cardId);
    if (player.stash < card.buyCost) return;
    const slotCard = player.ship.upgrades[card.slot];
    const currentCard = slotCard ? findCard(slotCard.cardId) : null;
    const better = !currentCard || totalBonus(card.bonus) > totalBonus(currentCard.bonus);
    if (better && Math.random() < 0.8) buyUpgrade(player, handEntry.uid);
  });
}

function totalBonus(bonus) {
  if (!bonus) return 0;
  return (bonus.atk || 0) + (bonus.def || 0) + (bonus.spd || 0);
}

function aiShipsToSeaPhase(player) {
  // Placing at least one ship is mandatory (if available) -- always taken,
  // not probabilistic. Extra ships beyond the mandatory first are optional.
  // Loading (captain/crew/officer/cargo) is only ever offered in the same
  // action as placing a ship -- once a ship is out there, it can't be
  // altered except by a card that explicitly allows it. So only ships
  // placed in this call are eligible for loading below, never ones
  // already sitting in the ocean from an earlier turn.
  const placedThisTurn = [];
  if (mustPlaceShip(player)) {
    const shipCards = player.hand.filter(c => c.category === 'ship');
    const s = putShipToSea(player, shipCards[0].uid);
    if (s) placedThisTurn.push(s);
  }
  while (player.shipsToSeaThisTurn < SHIPS_TO_SEA_CAP && state.seaShips.length < SHIPS_AT_SEA_CAP) {
    const remaining = player.hand.filter(c => c.category === 'ship');
    if (!remaining.length || Math.random() >= 0.4) break;
    const s = putShipToSea(player, remaining[0].uid);
    if (s) placedThisTurn.push(s);
  }
  placedThisTurn.forEach(seaShip => {
    ['captain', 'crew', 'officer'].forEach(slot => {
      if (seaShip[slot]) return;
      const candidates = player.hand.filter(c => c.category === slot);
      if (!candidates.length) return;
      candidates.sort((a, b) => totalBonus(findCard(b.cardId).bonus) - totalBonus(findCard(a.cardId).bonus));
      loadSeaShip(player, seaShip.id, candidates[0].uid, Math.random() < 0.5);
    });
    player.hand.filter(c => c.category === 'treasure' || c.category === 'vip').slice(0, 2).forEach(c => {
      if (Math.random() < 0.5) loadSeaShip(player, seaShip.id, c.uid, Math.random() < 0.6);
    });
  });
}

function aiChooseAttackTarget(playerIdx) {
  const player = state.players[playerIdx];
  if (!state.seaShips.length) return null;
  let best = null, bestProb = -1;
  state.seaShips.forEach(s => {
    const p = estimateWinProb(player.ship, s);
    if (p > bestProb) { bestProb = p; best = s; }
  });
  if (!best) return null;
  const attackChance = clamp(bestProb, 0.1, 0.9);
  return Math.random() < attackChance ? best : null;
}

function aiFleeDecision(ownShip, otherShip) {
  const winProbAsDefender = 1 - estimateWinProb(otherShip, ownShip);
  const fleeChance = clamp(1 - winProbAsDefender, 0.1, 0.9);
  return Math.random() < fleeChance;
}
