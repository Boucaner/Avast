// ── Card data ────────────────────────────────────────────────────────────────
// Transcribed from the vault's "Avast Cards" note (source: Avast cards.xlsx).
// v1 scope only: Events, Flags, Letter of Marque, the Treasure Map card, and a
// few named cards with no stats/text yet (First Mate, Israel Hands, Navigator,
// Parrot) are left out entirely — see the build plan for why.
//
// Fields marked "// placeholder" were not set in the source sheet. They're
// filled with a simple formula so the engine has something to run on; treat
// them as provisional and retune once real numbers are picked.

const SHIPS = [
  // Basic hulls — all "Any" type (become Pirate/Navy/Pirate Hunter only via a captain)
  { id: 'ship-cutter',      name: 'Cutter',            rarity: 'Common', atk: 1, def: 2, spd: 4, shipType: 'Any', value: 280 }, // placeholder value = statTotal*40
  { id: 'ship-barque',      name: 'Barque',            rarity: 'Common', atk: 2, def: 1, spd: 4, shipType: 'Any', value: 280 },
  { id: 'ship-brigantine',  name: 'Brigantine',        rarity: 'Common', atk: 2, def: 2, spd: 3, shipType: 'Any', value: 280 },
  { id: 'ship-sloop',       name: 'Sloop',             rarity: 'Common', atk: 2, def: 3, spd: 4, shipType: 'Any', value: 360 },
  { id: 'ship-fluyt',       name: 'Fluyt',             rarity: 'Common', atk: 1, def: 4, spd: 3, shipType: 'Any', value: 320 },
  { id: 'ship-pinnace',     name: 'Pinnace',           rarity: 'Common', atk: 2, def: 2, spd: 4, shipType: 'Any', value: 320 },
  { id: 'ship-schooner',    name: 'Schooner',          rarity: 'Common', atk: 3, def: 2, spd: 4, shipType: 'Any', value: 360 },
  { id: 'ship-sotl',        name: 'Ship-of-the-Line',  rarity: 'Uncommon', atk: 5, def: 5, spd: 1, shipType: 'Pirate Hunter', value: 440 },
  { id: 'ship-frigate',     name: 'Frigate',           rarity: 'Uncommon', atk: 5, def: 4, spd: 1, shipType: 'Any', value: 400 },
  { id: 'ship-galleon',     name: 'Galleon',           rarity: 'Uncommon', atk: 4, def: 5, spd: 1, shipType: 'Any', value: 400 },
  // Named rare/uncommon pirate ships
  { id: 'ship-adventure-galley',   name: 'Adventure Galley',      rarity: 'Rare',     atk: 4, def: 4, spd: 4, shipType: 'Pirate', value: 480, flavor: "Captain Kidd's ship" },
  { id: 'ship-queen-annes-revenge',name: "Queen Anne's Revenge",  rarity: 'Rare',     atk: 6, def: 3, spd: 3, shipType: 'Pirate', value: 480, flavor: "Blackbeard's ship" },
  { id: 'ship-fancy',              name: 'Fancy',                 rarity: 'Rare',     atk: 3, def: 5, spd: 4, shipType: 'Pirate', value: 480, flavor: "Henry Avery's ship" },
  { id: 'ship-royal-fortune',      name: 'Royal Fortune',         rarity: 'Rare',     atk: 3, def: 3, spd: 6, shipType: 'Pirate', value: 480, flavor: "Bartholomew Roberts's ship" },
  { id: 'ship-revenge',            name: 'Revenge',               rarity: 'Uncommon', atk: 5, def: 2, spd: 3, shipType: 'Pirate', value: 400, flavor: 'A classic pirate ship name' },
  { id: 'ship-fortune',            name: 'Fortune',               rarity: 'Uncommon', atk: 2, def: 4, spd: 4, shipType: 'Pirate', value: 400, flavor: 'A classic pirate ship name' },
  { id: 'ship-victory',            name: 'Victory',               rarity: 'Uncommon', atk: 4, def: 3, spd: 3, shipType: 'Pirate', value: 400, flavor: 'A classic pirate ship name' },
  { id: 'ship-liberty',            name: 'Liberty',               rarity: 'Uncommon', atk: 3, def: 2, spd: 5, shipType: 'Pirate', value: 400, flavor: 'A classic pirate ship name' },
];

// Captains: playable only on ships-at-sea in v1 (rules currently forbid players
// having a captain on their own ship, "may change for captured pirate captains"
// is still an open question — not implemented yet).
const CAPTAINS = [
  { id: 'capt-avila',      name: 'Pedro Menéndez de Avilés', captainType: 'Navy',         cost: 150, flavor: 'Spanish, founder of St. Augustine' }, // placeholder cost
  { id: 'capt-emo',        name: 'Angelo Emo',               captainType: 'Navy',         cost: 150, flavor: 'Venetian, worked with British' },
  { id: 'capt-forbes',     name: 'John Forbes',              captainType: 'Navy',         cost: 150, flavor: 'British Admiral of the Fleet' },
  { id: 'capt-howe',       name: 'Richard Howe',             captainType: 'Navy',         cost: 150, flavor: 'British Admiral of the Fleet' },
  { id: 'capt-rowley',     name: 'William Rowley',           captainType: 'Navy',         cost: 150, flavor: 'British Admiral of the Fleet' },
  { id: 'capt-aernoutsz',  name: 'Jurriaen Aernoutsz',       captainType: 'Navy',         cost: 150, flavor: 'Dutch Naval Captain' },
  { id: 'capt-huidobro',   name: 'Mateo Alonso de Huidobro', captainType: 'Navy',         cost: 150, flavor: 'Spanish Naval Captain' },
  { id: 'capt-castro',     name: 'Pedro de Castro',          captainType: 'Navy',         cost: 150, flavor: 'Spanish Naval Captain' },
  { id: 'capt-blackbeard', name: 'Blackbeard',               captainType: 'Pirate', rarity: 'Rare', bonus: { atk: 3 }, cost: 400 },
  { id: 'capt-morgan1',    name: 'Henry Morgan',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-kidd',       name: 'Captain Kidd',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-england',    name: 'Edward England',           captainType: 'Pirate',       cost: 150 },
  { id: 'capt-every',      name: 'Henery Every',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-rackham',    name: 'Jack Rackham',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-bonnet',     name: 'Stede Bonnet',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-bart',       name: 'Black Bart',               captainType: 'Pirate',       cost: 150 },
  { id: 'capt-tew',        name: 'Thomas Tew',               captainType: 'Pirate',       cost: 150 },
  { id: 'capt-vane',       name: 'Charles Vane',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-drake',      name: 'Sir Francis Drake',        captainType: 'Pirate',       cost: 150 },
  { id: 'capt-lafitte',    name: 'Jean Lafitte',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-gaspar',     name: 'Jose Gaspar',              captainType: 'Pirate',       cost: 150, flavor: "Better known as Gasparilla, one of the last great Pirates" },
  { id: 'capt-kidd-w',     name: 'William Kidd',             captainType: 'Pirate',       cost: 150 },
  { id: 'capt-maynard',    name: 'Lt. Robert Maynard',       captainType: 'Pirate Hunter', cost: 150 },
  { id: 'capt-rogers',     name: 'Woodes Rogers',            captainType: 'Pirate Hunter', cost: 150 },
  { id: 'capt-hornsby',    name: 'Richard Avery Hornsby',    captainType: 'Pirate Hunter', cost: 150 },
  { id: 'capt-hornigold',  name: 'Benjamin Hornigold',       captainType: 'Pirate Hunter', cost: 150 },
  { id: 'capt-porter',     name: 'Commodore David Porter',   captainType: 'Pirate Hunter', cost: 150, flavor: "Commanded the 'Mosquito Fleet,' based in Key West" },
  { id: 'capt-barnett',    name: 'Captain Jonathan Barnett', captainType: 'Pirate Hunter', cost: 150, flavor: 'Captured Calico Jack Rackham, Anne Bonny, and Mary Read' },
  { id: 'capt-ogle',       name: 'Captain Chaloner Ogle',    captainType: 'Pirate Hunter', cost: 150, flavor: "Ended the career of Bartholomew Roberts" },
  { id: 'capt-perales',    name: 'Juan González Perales',    captainType: 'Pirate Hunter', cost: 150, flavor: 'Captured the pirate ship Cabellero Romano' },
];

// Crew: the first three are starter crews (free, drawn from outside the deck).
const CREW = [
  { id: 'crew-green',      name: 'Green Crew',      rarity: 'Common', value: 0,   bonus: { def: 1 }, starter: true, flavor: 'Unskilled and untrained, they fight mostly for their lives' },
  { id: 'crew-raw',        name: 'Raw Crew',        rarity: 'Common', value: 0,   bonus: { atk: 1 }, starter: true, flavor: 'Eager, undisciplined, but they love the sight of blood' },
  { id: 'crew-frightened', name: 'Frightened Crew',  rarity: 'Common', value: 0,   bonus: { spd: 1 }, starter: true, flavor: 'Pressed into service, they excel at fleeing' },
  { id: 'crew-smart',      name: 'Smart Crew',      rarity: 'Common', value: 200, bonus: { def: 2 }, flavor: 'Knowing how to stay alive is good, but knowing how to keep their captain alive is better' },
  { id: 'crew-eager',      name: 'Eager Crew',      rarity: 'Common', value: 200, bonus: { atk: 2 }, flavor: 'They have fought and won, and they like it' },
  { id: 'crew-efficient',  name: 'Efficient Crew',  rarity: 'Common', value: 200, bonus: { spd: 2 }, flavor: 'Quick with the ropes, they know how to use the wind' },
  { id: 'crew-scarred',    name: 'Scarred Crew',    rarity: 'Uncommon', value: 300, bonus: { def: 3 }, flavor: 'They may not be pretty, but they know what it takes to survive' },
  { id: 'crew-bloodthirsty', name: 'Bloodthirsty Crew', rarity: 'Uncommon', value: 300, bonus: { atk: 3 }, flavor: 'The half-crazed look in their eyes often decides the battle before it is fought' },
  { id: 'crew-climbing',   name: 'Climbing Crew',   rarity: 'Uncommon', value: 300, bonus: { spd: 3 }, flavor: 'Scaling the rigging like chimps, they make even the largest of ships skip upon the waves' },
  { id: 'crew-seasoned',   name: 'Seasoned Crew',   rarity: 'Uncommon', value: 300, bonus: { atk: 1, def: 1, spd: 1 }, flavor: 'Well trained and aggressive, this is a good group to have on board' },
  { id: 'crew-crack',      name: 'Crack Crew',      rarity: 'Uncommon', value: 500, bonus: { atk: 2, def: 2, spd: 2 }, flavor: 'Smart and brave, going up against this crew rarely ends well' },
  { id: 'crew-elite',      name: 'Elite Crew',      rarity: 'Rare', value: 1000, bonus: { atk: 3, def: 3, spd: 3 }, flavor: 'The best of the best. The intense military training shows. Employ or avoid at all costs.' },
  { id: 'crew-pirate',     name: 'Pirate Crew',     rarity: 'Rare', value: 400, bonus: { atk: 3, def: 1, spd: 1 }, restriction: 'Player or Pirate ships only', flavor: 'Gold, blood, revenge; who cares why they fight?' },
  { id: 'crew-military',   name: 'Military Crew',   rarity: 'Rare', value: 400, bonus: { atk: 2, def: 1, spd: 2 }, restriction: 'Navy or Pirate Hunter ships or captains only', flavor: 'Drilled and disciplined, these men know their ship and their skill' },
  { id: 'crew-pirate-hunter', name: 'Pirate Hunter Crew', rarity: 'Rare', value: 500, bonus: { atk: 2, def: 2, spd: 2 }, restriction: 'Pirate Hunter ships or captains only', flavor: 'Your death is their only goal' },
  { id: 'crew-naval',      name: 'Naval Crew',      rarity: 'Uncommon', value: 300, bonus: { atk: 1, def: 1, spd: 1 }, restriction: 'Navy or Pirate Hunter ships or captains only', flavor: 'The crowns of Europe have had enough of the lawless seas' },
];

// Officers: v1 only includes the stat-bearing Quartermaster/Boatswain/Sailing
// Master/Gunner/Carpenter tiers. First Mate, Israel Hands, Navigator, Anne
// Bonny, Mary Reed, and Parrot have no stats/text designed yet — excluded.
const OFFICERS = [
  { id: 'off-quartermaster-u', name: 'Quartermaster',  rarity: 'Uncommon', cost: 100, bonus: { atk: 1, def: 1 } }, // placeholder cost
  { id: 'off-quartermaster-r', name: 'Quartermaster',  rarity: 'Rare',     cost: 350, bonus: { atk: 2, def: 2 }, discardAbility: 'Draw to 7 cards' },
  { id: 'off-boatswain-u',     name: 'Boatswain',      rarity: 'Uncommon', cost: 100, bonus: { def: 1 } },
  { id: 'off-boatswain-r',     name: 'Boatswain',      rarity: 'Rare',     cost: 350, bonus: { atk: 1, spd: 1 }, discardAbility: 'Add +2 to combat rating for 1 roll' },
  { id: 'off-sailing-master-u',name: 'Sailing Master',  rarity: 'Uncommon', cost: 100, bonus: { spd: 1 } },
  { id: 'off-sailing-master-r',name: 'Sailing Master',  rarity: 'Rare',     cost: 350, bonus: { def: 1, spd: 2 }, discardAbility: 'Immediately return to Home Port (playable during a turn or combat)' },
  { id: 'off-gunners-mate',    name: "Gunner's Mate",   rarity: 'Uncommon', cost: 100, bonus: { atk: 1 } },
  { id: 'off-master-gunner',   name: 'Master Gunner',   rarity: 'Rare',     cost: 350, bonus: { atk: 2, def: 1 }, discardAbility: 'Add +3 to combat rating for 1 roll' },
  { id: 'off-carpenter',       name: 'Carpenter',       rarity: 'Uncommon', cost: 150, bonus: { def: 2 } },
  { id: 'off-master-carpenter',name: 'Master Carpenter', rarity: 'Rare',    cost: 350, bonus: { def: 1, spd: 1 }, discardAbility: 'Add 1 upgrade for free' },
];

// VIPs
const VIPS = [
  { id: 'vip-misson', name: 'Captain James Misson', rarity: 'Rare', value: 0, text: 'No war ship may attack any ship Misson is on. Misson must be discarded upon reaching Home Port.', flavor: 'Misson was the founder of the (possibly fictitious) pirate haven of Libertatia, Madagascar.' },
  { id: 'vip-unnamed', name: 'Unnamed VIP', rarity: 'Rare', value: 100, text: 'Ransom: remove target Navy Captain from any ship at sea.', flavor: "It's good to have friends in high places that owe you a favor.", nameTodo: true }, // source sheet literally has "XXX" as the name — not inventing a real one
  { id: 'vip-cardinal-jose', name: 'Cardinal Jose', rarity: 'Rare', value: 200, text: 'On capture, may immediately return to Home Port and play a normal Home Port turn; if done, discard Cardinal Jose for no ransom gold.' },
];

// Upgrades: one slot per area (cannon / sails / hull) — a new upgrade in an
// area immediately replaces (discards) the old one.
const UPGRADES = [
  { id: 'up-cannon-small', name: 'Cannon, Small', slot: 'cannon', rarity: 'Common',   buyCost: 200, sellValue: 50,  bonus: { atk: 1 } },
  { id: 'up-cannon-large', name: 'Cannon, Large', slot: 'cannon', rarity: 'Uncommon', buyCost: 500, sellValue: 200, bonus: { atk: 2 } },
  { id: 'up-cannon-huge',  name: 'Cannon, Huge',  slot: 'cannon', rarity: 'Rare',     buyCost: 800, sellValue: 300, bonus: { atk: 3, spd: -1 } }, // placeholder cost
  { id: 'up-sails-fast',   name: 'Sails, Fast',   slot: 'sails',  rarity: 'Common',   buyCost: 150, sellValue: 50,  bonus: { spd: 1 } }, // placeholder cost
  { id: 'up-sails-tough',  name: 'Sails, Tough',  slot: 'sails',  rarity: 'Uncommon', buyCost: 300, sellValue: 100, bonus: { def: 1 } }, // placeholder cost
  { id: 'up-hull-fast',    name: 'Hull, Fast',    slot: 'hull',   rarity: 'Common',   buyCost: 150, sellValue: 50,  bonus: { spd: 1 } }, // placeholder cost
  { id: 'up-hull-strong',  name: 'Hull, Strong',  slot: 'hull',   rarity: 'Common',   buyCost: 150, sellValue: 50,  bonus: { def: 1 } }, // placeholder cost
];

// Treasure / cargo — sold at Home Port for gold; some carry combat bonuses.
const TREASURE = [
  { id: 'tr-gold-coins',   name: 'Gold Coins', rarity: 'Common', value: 100 },
  { id: 'tr-spyglass',     name: 'Spyglass', rarity: 'Common', value: 100, text: 'Once per turn, look at any face-down card on any ship at sea. Return it face-down.' },
  { id: 'tr-spyglass-ex',  name: 'Exquisite Spyglass', rarity: 'Rare', value: 1000, text: 'Once per turn, look at all face-down cards on any ship at sea. Return them face-down.' },
  { id: 'tr-cotton',       name: 'Cotton', rarity: 'Common', value: 100 },
  { id: 'tr-rum',          name: 'Rum', rarity: 'Uncommon', value: 200, bonus: { atk: 1, spd: -1 }, text: 'Sacrifice rum for stat bonuses' },
  { id: 'tr-sugar',        name: 'Sugar', rarity: 'Common', value: 100, flavor: 'First you get the sugar…' },
  { id: 'tr-citrus',       name: 'Citrus', rarity: 'Common', value: 200, text: 'Negates Scurvy' },
  { id: 'tr-chest-100',    name: 'Chest', rarity: 'Uncommon', value: 100 },
  { id: 'tr-chest-200',    name: 'Chest', rarity: 'Uncommon', value: 200 },
  { id: 'tr-chest-300',    name: 'Chest', rarity: 'Rare', value: 300 },
  { id: 'tr-chest-500',    name: 'Chest', rarity: 'Rare', value: 500 },
  { id: 'tr-tobacco',      name: 'Tobacco', rarity: 'Common', value: 100 },
  { id: 'tr-grog',         name: 'Grog', rarity: 'Common', value: 100, bonus: { atk: 1, def: 1, spd: -2 }, flavor: 'A foul concoction, but one every pirate ship better have on board.' },
  { id: 'tr-fine-rum',     name: 'Fine Rum', rarity: 'Rare', value: 300, bonus: { atk: 1, def: 1, spd: -1 }, flavor: "Made for the nobles, it usually doesn't last long on a pirate ship." },
];

const ALL_CARD_POOLS = { SHIPS, CAPTAINS, CREW, OFFICERS, VIPS, UPGRADES, TREASURE };

function findCard(id) {
  for (const pool of Object.values(ALL_CARD_POOLS)) {
    const found = pool.find(c => c.id === id);
    if (found) return found;
  }
  return null;
}

// ── Shuffle (Fisher-Yates, matches sibling games' cards.js) ────────────────
function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ── Deck builder ─────────────────────────────────────────────────────────
// Builds an identical-composition 60-card deck for a player (per Boss's
// "identical mirrored decks" choice). Rules require >=1/4 ships; non-starter
// crew are eligible (starters are drawn from outside the deck at setup).
const DECK_SIZE = 60;

function buildDeck() {
  const deck = [];
  let seq = 0;
  const addCopies = (card, category, count) => {
    for (let i = 0; i < count; i++) {
      deck.push({ uid: `c${seq++}`, cardId: card.id, category, faceUp: false });
    }
  };

  // Ships: every ship card, doubled, to comfortably clear the 1/4 quota (19*2=38 >= 15)
  SHIPS.forEach(s => addCopies(s, 'ship', 2));

  // One copy of everything else that has usable data
  CAPTAINS.forEach(c => addCopies(c, 'captain', 1));
  CREW.filter(c => !c.starter).forEach(c => addCopies(c, 'crew', 1));
  OFFICERS.forEach(c => addCopies(c, 'officer', 1));
  VIPS.forEach(c => addCopies(c, 'vip', 1));
  UPGRADES.forEach(c => addCopies(c, 'upgrade', 1));
  TREASURE.forEach(c => addCopies(c, 'treasure', 1));

  return shuffle(deck);
}

function pickStarterShip() {
  // Any ship whose atk+def+spd totals 7 or less
  const eligible = SHIPS.filter(s => s.atk + s.def + s.spd <= 7);
  return eligible[Math.floor(Math.random() * eligible.length)];
}

function pickStarterCrew() {
  const starters = CREW.filter(c => c.starter);
  return starters[Math.floor(Math.random() * starters.length)];
}
