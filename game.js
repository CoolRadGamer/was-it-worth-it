// Main game logic for the idle game.
// The project is a small static browser game: it tracks points, unlocks upgrades,
// persists saves, renders the UI, manages the intro cutscene, and plays music.

// Converts values into ExpantaNum instances so the game can work with huge numbers.
function asEN(value, fallback = 0) {
  if (!ExpantaNum) {
    return fallback;
  }

  if (value instanceof ExpantaNum) {
    return value.clone();
  }

  if (value === null || value === undefined || value === "") {
    return new ExpantaNum(fallback);
  }

  return new ExpantaNum(value);
}

// Escapes a string so it can be safely placed inside innerHTML. This is used
// for the player-renamed currency so HTML/JS can't sneak into the shop markup.
function escapeHTML(input) {
  return String(input ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

// ---------------------------------------------------------------------------
// Standard notation suffixes, Antimatter Dimensions "Infinity" style.
// Below 1e303 there's a fixed list; past that, suffixes are assembled from
// ones/tens/hundreds digit tables, and past 1e3003 a positional special
// prefix (MI- = thousand, MC- = million, ...) is added.
// ---------------------------------------------------------------------------

// Fixed list used up to 1e303 (illion index 0..100).
const infinitySuffixes = [
  "", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
  "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "ODc", "NDc",
  "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OVg", "NVg",
  "Tg", "UTg", "DTg", "TTg", "QaTg", "QiTg", "SxTg", "SpTg", "OTg", "NTg",
  "Qa", "UQa", "DQa", "TQa", "QaQa", "QiQa", "SxQa", "SpQa", "OQa", "NQa",
  "Qi", "UQi", "DQi", "TQi", "QaQi", "QiQi", "SxQi", "SpQi", "OQi", "NQi",
  "Se", "USe", "DSe", "TSe", "QaSe", "QiSe", "SxSe", "SpSe", "OSe", "NSe",
  "St", "USt", "DSt", "TSt", "QaSt", "QiSt", "SxSt", "SpSt", "OSt", "NSt",
  "Og", "UOg", "DOg", "TOg", "QaOg", "QiOg", "SxOg", "SpOg", "OOg", "NOg",
  "Nn", "UNn", "DNn", "TNn", "QaNn", "QiNn", "SxNn", "SpNn", "ONn", "NNn",
  "Ce",
];

// Digit tables used to build suffixes for illion indices past 100.
const infinityOnes = ["", "U", "D", "T", "Qa", "Qi", "Sx", "Sp", "O", "N"];
const infinityTens = ["", "Dc", "Vg", "Tg", "Qa", "Qi", "Se", "St", "Og", "Nn"];
const infinityHundreds = ["", "Ce", "Dn", "Tc", "Qe", "Qu", "Sc", "Si", "Oe", "Ne"];
// Positional prefixes for the thousands/millions/... groups of the illion index.
const infinitySpecials = ["", "MI-", "MC-", "NA-", "PC-", "FM-"];

// Formats a 3-digit group (0..999) using the ones/tens/hundreds tables.
function infinityNameGroup(g) {
  const o = g % 10;
  const t = Math.floor(g / 10) % 10;
  const h = Math.floor(g / 100) % 10;
  return infinityOnes[o] + infinityTens[t] + infinityHundreds[h];
}

// Builds the suffix for a given illion index n (n = exponent/3 - 1).
function infinitySuffixForIndex(n) {
  if (n <= 100) {
    return infinitySuffixes[n + 1];
  }

  const base = infinityNameGroup(n % 1000);
  if (n < 1000) {
    return base;
  }

  // n >= 1000: split into 3-digit groups and prepend positional specials.
  let m = n;
  const groups = [];
  while (m > 0) {
    groups.push(m % 1000);
    m = Math.floor(m / 1000);
  }

  let result = base;
  for (let i = 1; i < groups.length; i++) {
    const g = groups[i];
    // A leading "1" in a higher group adds no digit name (e.g. 1e3003 -> "MI").
    const part = g === 1 ? "" : infinityNameGroup(g);
    const special = infinitySpecials[i] || "";
    result = special + part + result;
  }

  return result.replace(/-$/, "");
}

// Returns the standard-notation suffix for a power-of-1000 index, or
// undefined if the number is beyond the supported range.
function infinitySuffix(listIndex) {
  if (listIndex <= 100) {
    return infinitySuffixes[listIndex];
  }
  if (listIndex <= 102) {
    return infinitySuffixForIndex(listIndex - 1);
  }
  // Past the fixed list, keep building from the digit tables up to 1e3003,
  // then the special-prefix scheme; anything beyond that returns undefined.
  const n = listIndex - 1;
  if (n >= 1000) {
    const high = Math.floor(n / 1000);
    if (high > 999999) return undefined;
  }
  return infinitySuffixForIndex(n);
}

function formatEN(value) {
  if (!ExpantaNum) {
    return String(value ?? 0);
  }

  const numeric = asEN(value, 0);
  if (!numeric.isFinite()) {
    return numeric.toString();
  }

  const notation = (state && state.notation) || "standard";

  const asNumber = numeric.toNumber();

  // Scientific notation for finite numbers at or above one million.
  if (notation === "scientific" && Number.isFinite(asNumber) && Math.abs(asNumber) >= 1e6) {
    if (asNumber === 0) return "0";
    return asNumber.toExponential(2).replace("e+", "e").replace("e-", "e-");
  }

  const suffixFor = (listIndex) => infinitySuffix(listIndex);

  // Numbers that fit in a double can be placed on the suffix ladder directly.
  if (Number.isFinite(asNumber)) {
    const abs = Math.abs(asNumber);

    if (abs < 1000) {
      // Whole numbers stay compact; fractional values keep up to 2 decimals so
      // sub-whole rates (e.g. 0.5/s) don't round down to "0".
      return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    let scaled = asNumber;
    let listIndex = 0;

    // The tiny epsilon below 1000 absorbs floating-point drift at exact powers
    // of 1000 (e.g. 1e33 / 1e30 can come out as 999.9999999999999), so values
    // land on the right suffix instead of showing "1000No".
    while (Math.abs(scaled) >= 1000 - 1e-9) {
      scaled /= 1000;
      listIndex += 1;
      const suffix = suffixFor(listIndex);
      if (suffix === undefined) {
        return asNumber.toExponential(2).replace("e+", "e").replace("e-", "e-");
      }
    }

    const displayValue = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
    return `${displayValue}${suffixFor(listIndex)}`;
  }

  // Huge numbers (past 1e308) don't fit in a double, so work out the suffix
  // from the base-10 logarithm instead of dividing repeatedly.
  const log10 = numeric.log10().toNumber();
  const exponent = Math.floor(log10);

  // Guard against transcendent numbers where log10 is Infinity or NaN.
  if (!Number.isFinite(log10)) {
    return numeric.toString();
  }

  // In scientific notation, huge numbers keep the compact e-form too instead
  // of silently falling back to standard suffixes.
  if (notation === "scientific") {
    return `${Math.pow(10, log10 - exponent).toFixed(2)}e${exponent}`;
  }

  let listIndex = Math.floor(exponent / 3);
  let scaled = Math.pow(10, log10 - listIndex * 3); // in [1, 1000)

  // Correct for floating-point drift right at a power-of-1000 boundary.
  if (scaled >= 1000 - 1e-9) {
    scaled = 1;
    listIndex += 1;
  }

  const suffix = suffixFor(listIndex);
  if (suffix === undefined) {
    // Beyond the supported range: compact scientific-style form.
    return `${Math.pow(10, log10 - exponent).toFixed(2)}e${exponent}`;
  }

  const displayValue = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  return `${displayValue}${suffix}`;
}

// Intro cutscene data. Each page is a chunk of dialogue shown before the player
// starts the machine. The text is intentionally a little chaotic and self-aware.
const cutsceneTemplate = {
  title: "was it worth it?",
  chapter: "DISCLAIMER",
  pages: [
    [
      "This whole game was vibecoded (except for the parts where I decided this sucks)",
      "AI is the future am I right guys?"
    ],
    [
      "You're here with your new fangled machine.",
      "You can't wait to try it out. You ask if it'll be worth it."
    ],
    [
      "You have ten points left. Start it.",
      "Let the noise answer the question. (this is so random that i'm leaving it in this ai is the next shakespeare ong)"
    ]
  ]
};

// Every upgrade in the game is defined here.
// Each object describes the upgrade's identity, its cost curve, its effect, and its tooltip.
const upgradeCatalog = [
  {
    id: "starter",
    name: "Start the machine",
    description: "+1 point per second",
    baseCost: new ExpantaNum(10),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "production",
    tooltip: "is it worth it?",
  },
  {
    id: "machine",
    name: "Machine repeat",
    description: "+1 point per second",
    baseCost: new ExpantaNum(10),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(1),
    maxLevel: 99,
    section: "production",
    tooltip: "Have you tried turning it on and on again?",
  },
  {
    id: "machine2",
    name: "Double machine",
    description: "+2 points per second",
    baseCost: new ExpantaNum(12),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(2),
    maxLevel: 99,
    section: "production",
    tooltip: "Introducing machine 2: electric boogaloo",
  },
  {
    id: "machine3",
    name: "Deep cycle",
    description: "+5 points per second",
    baseCost: new ExpantaNum(30),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(5),
    maxLevel: 99,
    section: "production",
    tooltip: "very deep",
  },
  {
    id: "turbo",
    name: "Turbo relay",
    description: "+12 points per second",
    baseCost: new ExpantaNum(80),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(12),
    maxLevel: 99,
    section: "production",
    tooltip: "why go slow when you can go turbo",
  },
  {
    id: "relay",
    name: "Signal relay",
    description: "+30 points per second",
    baseCost: new ExpantaNum(220),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(30),
    maxLevel: 99,
    section: "production",
    tooltip: "signal more parts of the machine or something idk an ai made this upgrade",
  },
  {
    id: "rename",
    name: "Rename the currency",
    description: "Unlock custom currency naming in options",
    baseCost: new ExpantaNum(2000),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "Points? How arbitrary. So arbitrary that they can basically be whatever you want. We can do that now.",
  },
  {
    id: "theme",
    name: "Fresh coat of paint",
    description: "Unlock changing the background color in options",
    baseCost: new ExpantaNum(1e6),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "What a boring look. Let's paint this game a fresh colour. Or a completely unfitting one. Why not?",
  },
  {
    id: "prestigeRename",
    name: "Rename the prestige currency",
    description: "Unlock custom prestige currency naming in options",
    baseCost: new ExpantaNum(1e18),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "You have a new thing. What is it even called? idk figure it out yourself",
    visibleWhen: () => (state.resets || 0) >= 1,
  },
  {
    id: "tintText",
    name: "Text Color I",
    description: "Change the muted, silvery text color in options",
    baseCost: new ExpantaNum(1e24),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "Don't like the color? Go change it. Go wild!",
    visibleWhen: () => (state.resets || 0) >= 1,
  },
  {
    id: "tintInk",
    name: "Text Color II",
    description: "Change the dark, inky text color in options",
    baseCost: new ExpantaNum(1e30),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "Can't have bad reviews on the visuals if you can change the visuals",
    visibleWhen: () => (state.resets || 0) >= 1,
  },
  {
    id: "multiplier",
    name: "Overclock the machine",
    description: "x1.2 point gain after additive bonuses",
    baseCost: new ExpantaNum(5000),
    costScale: 1.55,
    type: "multiplier",
    multiplierValue: 1.2,
    value: new ExpantaNum(1.2),
    maxLevel: 99,
    section: "overclock",
    tooltip: "more. MORE. MORE POWER!!!",
  },
  {
    id: "superOverclock",
    name: "Super Overclock",
    description: "x2 point gain per level (persists through prestige)",
    baseCost: new ExpantaNum(1),
    costScale: 3,
    type: "multiplier",
    multiplierValue: 2,
    value: new ExpantaNum(2),
    maxLevel: 99,
    section: "overclock",
    currency: "prestige",
    tooltip: "the original overclock upgrade was lonely",
    visibleWhen: () => (state.prestigeUpgrades.yieldSurge || 0) > 0,
  },
  {
    id: "forge",
    name: "Forge line",
    description: "+90 points per second",
    baseCost: new ExpantaNum(2400),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(90),
    maxLevel: 99,
    section: "production",
    tooltip: "none of this currency is real so i guess we can forge it",
  },
  {
    id: "refinery",
    name: "Point refinery",
    description: "+250 points per second",
    baseCost: new ExpantaNum(7000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(250),
    maxLevel: 99,
    section: "production",
    tooltip: "refines your... wait, what did you call them again?",
  },
  {
    id: "network",
    name: "Network mesh",
    description: "+800 points per second",
    baseCost: new ExpantaNum(20000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(800),
    maxLevel: 99,
    section: "production",
    tooltip: "Connect more things together for more production",
  },
  {
    id: "lattice",
    name: "Lattice engine",
    description: "+2,500 points per second",
    baseCost: new ExpantaNum(60000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(2500),
    maxLevel: 99,
    section: "production",
    tooltip: "Lattice Engines was a technology provider that delivered predictive marketing and sales cloud applications to business-to-business companies. The company was privately held and backed by NEA and Sequoia Capital. It was headquartered in San Mateo, CA and has offices in Austin, Boston, New York and Beijing.",
  },
  {
    id: "reactor",
    name: "Core reactor",
    description: "+8,000 points per second",
    baseCost: new ExpantaNum(180000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(8000),
    maxLevel: 99,
    section: "production",
    tooltip: "We have to power things somehow",
  },
  {
    id: "industry",
    name: "Industrial bloom",
    description: "+24,000 points per second",
    baseCost: new ExpantaNum(500000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(24000),
    maxLevel: 99,
    section: "production",
    tooltip: "Make this whole thing an industry. Surely that will have no negative consequences",
  },
  {
    id: "orbital",
    name: "Orbital bloom",
    description: "+75,000 points per second",
    baseCost: new ExpantaNum(1500000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(75000),
    maxLevel: 99,
    section: "production",
    tooltip: "what",
  },
  {
    id: "galaxy",
    name: "Galaxy stack",
    description: "+200,000 points per second",
    baseCost: new ExpantaNum(6000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(200000),
    maxLevel: 99,
    section: "production",
    tooltip: "galaxy dot stack",
  },
  {
    id: "singularity",
    name: "Singularity stack",
    description: "+600,000 points per second",
    baseCost: new ExpantaNum(25000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(600000),
    maxLevel: 99,
    section: "production",
    tooltip: "black holes are cool",
  },
  {
    id: "endgame",
    name: "Finality engine",
    description: "+2,000,000 points per second",
    baseCost: new ExpantaNum(100000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(2000000),
    maxLevel: 99,
    section: "production",
    tooltip: "Go to the ends. And then beyond.",
  },
  {
    id: "epoch",
    name: "Epoch engine",
    description: "+7,500,000 points per second",
    baseCost: new ExpantaNum(500000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(7500000),
    maxLevel: 99,
    section: "production",
    tooltip: "warp time or something idk",
  },
  {
    id: "cosmos",
    name: "Cosmic overdrive",
    description: "+25,000,000 points per second",
    baseCost: new ExpantaNum(2500000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(25000000),
    maxLevel: 99,
    section: "production",
    tooltip: "adding space words to an upgrade automatically makes it more efficient",
  },
  {
    id: "eclipse",
    name: "Eclipse loop",
    description: "+90,000,000 points per second",
    baseCost: new ExpantaNum(10000000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(90000000),
    maxLevel: 99,
    section: "production",
    tooltip: "who needs the sun when you have more meaningless currency",
  },
];

// Creates a fresh upgrade state object with every upgrade set to zero.
function getDefaultUpgradeState() {
  return upgradeCatalog.reduce((accumulator, upgrade) => {
    accumulator[upgrade.id] = 0;
    return accumulator;
  }, {});
}

// Prestige upgrade definitions. Declared before defaultState/loadGame because
// the save loader needs to build default prestige state during startup.
// Each node's `position` places it on the prestige tree grid.
// Layout: prestige path (above) boosts prestige gain, synergy path (below)
// makes upgrades work together, QoL path (left) adds convenience, and the
// yield path (right) boosts raw point production. Center is Limit Breaker.
const prestigeCatalog = [
  // ──────────── CENTER ────────────
  {
    id: "limitBreaker",
    name: "Limit Breaker",
    icon: "\u2726",
    cost: new ExpantaNum(1),
    description: "Remove the cap on repeatable upgrades. Also doubles point gain.",
    effect: "All repeatable upgrades become uncapped and point gain doubles.",
    flavor: "gee i wonder why those upgrades had a cap in the first place",
    position: { row: 4, col: 5 },
    parents: [],
  },

  // ──────────── PRESTIGE PATH (above) ────────────
  {
    id: "prestigeDrive",
    name: "Prestige Drive",
    icon: "\u25B2",
    cost: new ExpantaNum(9999),
    description: "Boosts prestige point gain.",
    effect: "Prestige gain ×2.",
    flavor: "Rev the engines. There's more where that came from.",
    position: { row: 3, col: 5 },
    parents: ["limitBreaker"],
  },
  {
    id: "prestigeSpark",
    name: "P1",
    icon: "\u2733",
    cost: new ExpantaNum(5000),
    description: "Boosts prestige point gain slightly.",
    effect: "Prestige gain ×1.5.",
    flavor: "lorem ipsum",
    position: { row: 3, col: 4 },
    parents: ["limitBreaker"],
  },
  {
    id: "prestigeReserve",
    name: "P2",
    icon: "\u2733",
    cost: new ExpantaNum(5000),
    description: "Boosts prestige point gain slightly.",
    effect: "Prestige gain ×1.5.",
    flavor: "lorem ipsum",
    position: { row: 3, col: 6 },
    parents: ["limitBreaker"],
  },
  // Row 1: convergence + side branches
  {
    id: "prestigeVortex",
    name: "Prestige Vortex",
    icon: "\u2B06",
    cost: new ExpantaNum(25000),
    description: "Boosts prestige point gain further.",
    effect: "Prestige gain ×3.",
    flavor: "Spin it faster. The reset grind waits for no one.",
    position: { row: 2, col: 5 },
    parents: ["prestigeDrive"],
  },
  {
    id: "prestigeMomentum",
    name: "P3",
    icon: "\u26A1",
    cost: new ExpantaNum(15000),
    description: "Prestige gain scales with total prestige points earned.",
    effect: "Prestige gain ×(1 + ln(totalPrestigeEarned + 1) / 5).",
    flavor: "lorem ipsum",
    position: { row: 2, col: 4 },
    parents: ["prestigeSpark", "prestigeDrive"],
  },
  {
    id: "prestigeEcho",
    name: "P4",
    icon: "\u26A1",
    cost: new ExpantaNum(15000),
    description: "Prestige gain scales with number of resets.",
    effect: "Prestige gain ×(1 + 0.3 × resets).",
    flavor: "lorem ipsum",
    position: { row: 2, col: 6 },
    parents: ["prestigeReserve", "prestigeDrive"],
  },
  // Row 0: apex
  {
    id: "prestigeApex",
    name: "P5",
    icon: "\u2605",
    cost: new ExpantaNum(100000),
    description: "Massive prestige gain multiplier.",
    effect: "Prestige gain ×5.",
    flavor: "lorem ipsum",
    position: { row: 1, col: 5 },
    parents: ["prestigeVortex"],
  },
  {
    id: "prestigeOverflow",
    name: "P6",
    icon: "\u2733",
    cost: new ExpantaNum(50000),
    description: "Prestige gain scales with highest points in current run.",
    effect: "Prestige gain ×(1 + log10(highestPoints) / 20).",
    flavor: "lorem ipsum",
    position: { row: 1, col: 4 },
    parents: ["prestigeMomentum", "prestigeVortex"],
  },
  {
    id: "prestigeSiphon",
    name: "P7",
    icon: "\u2733",
    cost: new ExpantaNum(50000),
    description: "Prestige gain scales with total upgrades owned.",
    effect: "Prestige gain ×(1 + totalUpgrades / 500).",
    flavor: "lorem ipsum",
    position: { row: 1, col: 6 },
    parents: ["prestigeEcho", "prestigeVortex"],
  },

  // ──────────── SYNERGY PATH (below) ────────────
  {
    id: "synergyLink",
    name: "Actual Repeats",
    icon: "\u26A1",
    cost: new ExpantaNum(10),
    description: "All production scales with machine repeat count.",
    effect: "All production ×(1 + 1 × machine level).",
    flavor: "because ",
    position: { row: 5, col: 5 },
    parents: ["limitBreaker"],
  },
  {
    id: "synergyLoop",
    name: "Portfolio Effect",
    icon: "\u221E",
    cost: new ExpantaNum(50),
    description: "Diversified production pays dividends.",
    effect: "All production ×(1 + 0.12 × distinct upgrades owned).",
    flavor: "so what if i have 100 things blocking the sun? i have a tiny little generator down here so it all works out",
    position: { row: 6, col: 5 },
    parents: ["synergyLink"],
  },
  {
    id: "synergyChain3",
    name: "Compounding Resonance",
    icon: "\u2699",
    cost: new ExpantaNum(250),
    description: "Deep cycle power reverberates through all production.",
    effect: "All production ×1.05^Deep cycle level.",
    flavor: "Every cycle echoes louder than the last.",
    position: { row: 7, col: 5 },
    parents: ["synergyLoop"],
  },
  {
    id: "synergyChain4",
    name: "Velocity Bleed",
    icon: "\u26A1",
    cost: new ExpantaNum(1000),
    description: "Turbo speed rubs off on everything nearby.",
    effect: "All production ×(1 + log10(turbo + 1) × 3).",
    flavor: "Speed is contagious. So is production.",
    position: { row: 8, col: 5 },
    parents: ["synergyChain3"],
  },
  {
    id: "synergyChain5",
    name: "Signal Cascade",
    icon: "\u26A1",
    cost: new ExpantaNum(5000),
    description: "Each relay level amplifies the entire network.",
    effect: "All production ×1.04^Signal relay level.",
    flavor: "One signal triggers a chain reaction.",
    position: { row: 9, col: 5 },
    parents: ["synergyChain4"],
  },
  {
    id: "synergyChain6",
    name: "Phoenix Forging",
    icon: "\u2699",
    cost: new ExpantaNum(25000),
    description: "Every prestige reset tempers all output.",
    effect: "All production ×(1 + 0.1 × resets).",
    flavor: "Burn it down. Build it hotter.",
    position: { row: 10, col: 5 },
    parents: ["synergyChain5"],
  },
  {
    id: "synergyChain7",
    name: "Scale Economy",
    icon: "\u2699",
    cost: new ExpantaNum(100000),
    description: "Larger operations become more efficient.",
    effect: "All production ×(1 + 0.02 × total upgrade levels).",
    flavor: "The machine eats complexity and exhales output.",
    position: { row: 11, col: 5 },
    parents: ["synergyChain6"],
  },
  {
    id: "synergyChain8",
    name: "Critical Mass",
    icon: "\u26A1",
    cost: new ExpantaNum(500000),
    description: "Network effects reach a tipping point.",
    effect: "All production ×1.07^Network mesh level.",
    flavor: "One more connection and the whole thing lights up.",
    position: { row: 12, col: 5 },
    parents: ["synergyChain7"],
  },
  {
    id: "synergyChain9",
    name: "Lattice Osmosis",
    icon: "\u2699",
    cost: new ExpantaNum(2000000),
    description: "Lifetime earnings seep into current production.",
    effect: "All production ×(1 + ln(total made / 1e6 + 1)).",
    flavor: "Everything you've earned soaks into everything you will.",
    position: { row: 13, col: 5 },
    parents: ["synergyChain8"],
  },
  {
    id: "synergyChain10",
    name: "Reactor Bloom",
    icon: "\u2699",
    cost: new ExpantaNum(8000000),
    description: "Core heat radiates outward through all tiers.",
    effect: "All production ×1.08^Reactor level.",
    flavor: "When the core runs hot, everything glows.",
    position: { row: 14, col: 5 },
    parents: ["synergyChain9"],
  },
  {
    id: "synergyChain11",
    name: "Capital Injection",
    icon: "\u26A1",
    cost: new ExpantaNum(20000000),
    description: "Prestige wealth reverberates into production.",
    effect: "All production ×(1 + ln(prestige points + 1) / 2).",
    flavor: "Money talks. This time it says 'more'.",
    position: { row: 15, col: 5 },
    parents: ["synergyChain10"],
  },
  {
    id: "synergyChain12",
    name: "Orbital Decay",
    icon: "\u221E",
    cost: new ExpantaNum(50000000),
    description: "Time in orbit compounds power for everything.",
    effect: "All production ×(1 + ln(seconds since prestige + 1) / 4).",
    flavor: "Gravity doesn't rush. Neither does profit.",
    position: { row: 16, col: 5 },
    parents: ["synergyChain11"],
  },
  {
    id: "synergyChain13",
    name: "Constellation Map",
    icon: "\u2605",
    cost: new ExpantaNum(100000000),
    description: "Each prestige node lights up the entire network.",
    effect: "All production ×(1 + 0.2 × prestige upgrades owned).",
    flavor: "Connect the stars. The pattern is the point.",
    position: { row: 17, col: 5 },
    parents: ["synergyChain12"],
  },
  {
    id: "synergyChain14",
    name: "Event Horizon",
    icon: "\u26A1",
    cost: new ExpantaNum(500000000),
    description: "Singularity feeds production into itself.",
    effect: "All production ×(1 + 0.0005 × singularity level).",
    flavor: "Nothing escapes. Not even the output.",
    position: { row: 18, col: 5 },
    parents: ["synergyChain13"],
  },
  {
    id: "synergyChain15",
    name: "Echo Chamber",
    icon: "\u221E",
    cost: new ExpantaNum(1000000000),
    description: "Each restart echoes louder through all production.",
    effect: "All production ×(1 + 0.15 × resets).",
    flavor: "You said 'one more time' and the machine listened.",
    position: { row: 19, col: 5 },
    parents: ["synergyChain14"],
  },
  {
    id: "synergyChain16",
    name: "Chrono Leak",
    icon: "\u2699",
    cost: new ExpantaNum(5000000000),
    description: "Time itself leaks into the production pipeline.",
    effect: "All production ×(1 + ln(minutes since prestige + 1)).",
    flavor: "Tick tock. The numbers don't care which direction.",
    position: { row: 20, col: 5 },
    parents: ["synergyChain15"],
  },
  {
    id: "synergyChain17",
    name: "Dark Energy",
    icon: "\u2605",
    cost: new ExpantaNum(10000000000),
    description: "Every upgrade weakens the resistance to production.",
    effect: "All production ×1.01^total upgrade levels.",
    flavor: "The universe expands. So does your spreadsheet.",
    position: { row: 21, col: 5 },
    parents: ["synergyChain16"],
  },
  {
    id: "synergyChain18",
    name: "Blot Out The Sun",
    icon: "\u221E",
    cost: new ExpantaNum(50000000000),
    description: "+0.5x points per Eclipse Loop.",
    effect: "All production ×(1 + 0.5 × Eclipse level).",
    flavor: "Darkness is merely the absence of light. We can have finite light, or infinite darkness.",
    position: { row: 22, col: 5 },
    parents: ["synergyChain17"],
  },

  // ──────────── QoL PATH (left) ────────────
  {
    id: "autoOptimize",
    name: "Auto-optimize",
    icon: "\u2699",
    cost: new ExpantaNum(1),
    costAdd: 1,
    maxLevel: 18,
    description: "Automatically purchases production upgrades. Each level reaches one more.",
    effect: "Auto-buys up to a specific production upgrade.",
    flavor: "It's a machine it can do whatever we want it to do like buy its own upgrades sure",
    position: { row: 4, col: 3 },
    parents: ["limitBreaker"],
  },
  {
    id: "autoOverclock",
    name: "Auto Overclock",
    icon: "\u26A1",
    cost: new ExpantaNum(50000),
    description: "Automatically purchases overclock upgrades.",
    effect: "Auto-buys overclock upgrades when affordable.",
    flavor: "Clock",
    position: { row: 3, col: 3 },
    parents: ["autoOptimize"],
  },
  {
    id: "idleComfort",
    name: "Idle Comfort",
    icon: "\u2615",
    cost: new ExpantaNum(30),
    description: "Auto-buy no longer deducts currency.",
    effect: "Auto-buys are free (no currency spent).",
    flavor: "something something we won't charge you because of future profits but we also won't charge you on those future profits because of future future profits etc",
    position: { row: 5, col: 3 },
    parents: ["autoOptimize"],
  },
  {
    id: "keepUpgrades",
    name: "Upgrade Preservation",
    icon: "\u267B",
    cost: new ExpantaNum(5),
    costAdd: 5,
    maxLevel: 18,
    description: "Keeps production upgrades through prestige. Each level reaches one more.",
    effect: "Keeps production upgrades up to a specific upgrade on prestige.",
    flavor: "why do we throw all of these upgrades away anyway? so wasteful smh",
    position: { row: 4, col: 2 },
    parents: ["autoOptimize"],
  },
  {
    id: "keepOverclocks",
    name: "Clock Saver",
    icon: "\u23F1",
    cost: new ExpantaNum(25),
    description: "Keep Overclock levels through prestige.",
    effect: "Overclock levels are kept on prestige.",
    flavor: "clock in",
    position: { row: 3, col: 2 },
    parents: ["keepUpgrades"],
  },
  // New QoL nodes
  {
    id: "costReduction",
    name: "Q1",
    icon: "\u2696",
    cost: new ExpantaNum(10),
    costAdd: 5,
    maxLevel: 10,
    description: "Reduces all upgrade costs. Each level reduces cost by 5%.",
    effect: "All upgrade costs ×(1 - 0.05 × level).",
    flavor: "lorem ipsum",
    position: { row: 5, col: 2 },
    parents: ["keepUpgrades"],
  },
  {
    id: "autoPrestige",
    name: "Q2",
    icon: "\u26A1",
    cost: new ExpantaNum(200),
    description: "Automatically prestiges when at the threshold.",
    effect: "Auto-prestiges when prestige gain would be at least 1.",
    flavor: "lorem ipsum",
    position: { row: 5, col: 1 },
    parents: ["keepUpgrades"],
  },
  {
    id: "prestigeThresholdReduction",
    name: "Q4",
    icon: "\u2696",
    cost: new ExpantaNum(75),
    description: "Reduces the prestige threshold.",
    effect: "Prestige threshold ÷(1 + level).",
    flavor: "lorem ipsum",
    position: { row: 6, col: 2 },
    parents: ["idleComfort", "costReduction"],
  },

  // ──────────── YIELD PATH (right) ────────────
  {
    id: "yieldSurge",
    name: "OverOverClock",
    icon: "\u25C6",
    cost: new ExpantaNum(1),
    description: () => `Unlocks Super Overclock in the overclock section, which costs ${getPrestigeCurrencyLabel()}.`,
    effect: "Unlocks Super Overclock upgrade.",
    flavor: "feed those new prestigious things you gained into the machine.",
    position: { row: 4, col: 7 },
    parents: ["limitBreaker"],
  },
  {
    id: "outputBloom",
    name: "Output Bloom",
    icon: "\u2605",
    cost: new ExpantaNum(9999),
    description: "Boosts point production further.",
    effect: "All production ×2.",
    flavor: "Full bloom. The numbers are getting dizzy.",
    position: { row: 4, col: 8 },
    parents: ["yieldSurge"],
  },
  // New yield nodes - branching from yieldSurge
  {
    id: "yieldStarterBoost",
    name: "Y1",
    icon: "\u2733",
    cost: new ExpantaNum(500),
    description: "Starter machine is more powerful.",
    effect: "Starter machine produces ×5 points/s.",
    flavor: "lorem ipsum",
    position: { row: 3, col: 7 },
    parents: ["yieldSurge"],
  },
  {
    id: "yieldMachineBoost",
    name: "Y2",
    icon: "\u2733",
    cost: new ExpantaNum(500),
    description: "Machine repeat is more powerful.",
    effect: "Machine repeat produces ×3 points/s.",
    flavor: "lorem ipsum",
    position: { row: 5, col: 7 },
    parents: ["yieldSurge"],
  },
  // Branching from outputBloom
  {
    id: "yieldAutoBoost",
    name: "Y3",
    icon: "\u2699",
    cost: new ExpantaNum(25000),
    description: "All auto production is boosted.",
    effect: "All auto production ×(1 + 0.5 × total auto upgrade levels).",
    flavor: "lorem ipsum",
    position: { row: 3, col: 8 },
    parents: ["yieldStarterBoost", "outputBloom"],
  },
  {
    id: "yieldOverclockBoost",
    name: "Y4",
    icon: "\u2699",
    cost: new ExpantaNum(25000),
    description: "Overclock multiplier is stronger.",
    effect: "Overclock multiplier base increased from 1.2 to 1.4.",
    flavor: "lorem ipsum",
    position: { row: 5, col: 8 },
    parents: ["yieldMachineBoost", "outputBloom"],
  },
  // Further right branches
  {
    id: "yieldPrestigeBoost",
    name: "Y5",
    icon: "\u2733",
    cost: new ExpantaNum(100000),
    description: "Prestige points boost production.",
    effect: "All production ×(1 + ln(prestige points + 1) / 10).",
    flavor: "lorem ipsum",
    position: { row: 4, col: 9 },
    parents: ["outputBloom"],
  },
  {
    id: "yieldTotalMadeBoost",
    name: "Y6",
    icon: "\u2733",
    cost: new ExpantaNum(100000),
    description: "Lifetime earnings boost production.",
    effect: "All production ×(1 + ln(totalMade / 1e4 + 1) / 5).",
    flavor: "lorem ipsum",
    position: { row: 3, col: 9 },
    parents: ["yieldPrestigeBoost"],
  },
  {
    id: "yieldTimeBoost",
    name: "Y7",
    icon: "\u2733",
    cost: new ExpantaNum(100000),
    description: "Time spent in a run boosts production.",
    effect: "All production ×(1 + ln(minutes in run + 1) / 3).",
    flavor: "lorem ipsum",
    position: { row: 5, col: 9 },
    parents: ["yieldPrestigeBoost"],
  },
  {
    id: "yieldFinalBloom",
    name: "Y8",
    icon: "\u2605",
    cost: new ExpantaNum(500000),
    description: "The ultimate production boost.",
    effect: "All production ×3.",
    flavor: "lorem ipsum",
    position: { row: 4, col: 10 },
    parents: ["yieldTotalMadeBoost", "yieldTimeBoost"],
  },
];

// The final choice upgrades shown in the THE CHOICE subtab once every tree
// upgrade is bought. Both cost the same; one leads to the good ending, the
// other to the bad ending. They are not part of the tree (prestigeCatalog).
const choiceUpgrades = [
  {
    id: "goodEnding",
    name: "That's enough",
    icon: "1",
    cost: new ExpantaNum(1e6),
    description: "Switch off the machine.",
    flavor: "Thank you for playing!",
  },
  {
    id: "badEnding",
    name: "Total. Chaos.",
    icon: "2",
    cost: new ExpantaNum(1e6),
    description: "Go even further beyond. This machine has limitless potential. Nothing will stop you now.",
    flavor: "The seams of reality beckon you to stop. Somehow. Anyways, I don't think this is really necessary. I mean, you've had your fun, right?",
  },
];

// Default game state used when no save exists or when a save is reset.
const defaultState = {
  points: new ExpantaNum(10),
  autoPoints: new ExpantaNum(0),
  // Lifetime earnings start at 10 because the game hands you the first 10 points.
  totalMade: new ExpantaNum(10),
  currencyName: "points",
  backgroundColor: "#f0f0f0",
  mutedColor: "#777",
  inkColor: "#1a1a1a",
  notation: "standard",
  musicVolume: 0.4,
  activeTab: "gameTab",
  activeSubtab: "gameSub",
  optionsSubtab: "optionsSettingsSub",
  statsSubtab: "statsOverviewSub",
  prestigePoints: new ExpantaNum(0),
  prestigeCurrencyName: "???",
  prestigeUpgrades: getDefaultPrestigeUpgrades(),
  // Which prestige sub-subtab is open (tree / choice).
  prestigeSubtab: "tree",
  // Which ending was chosen: null | "good" | "bad".
  choice: null,
  // Whether the bad ending has been seen (unlocks the "total chaos" subtab).
  badEndingSeen: false,
  automationEnabled: false,
  tickerVisible: true,
  // Ask for confirmation before prestiging (only relevant after the first one).
  confirmPrestige: true,
  tickerSpeed: 60,
  // Stays true forever once the player reaches 1000 points (overclock section).
  overclockUnlocked: false,
  // How many times the player has prestiged. Once >= 1, prestige stays unlocked even below 10Qa.
  resets: 0,
  upgrades: getDefaultUpgradeState(),
  lastTick: Date.now(),
  lastAutoSave: Date.now(),
  lastPrestigeTime: Date.now(),
  autoSaveInterval: 15,
  tickRate: 10,
  // Lifetime statistics.
  totalPlayTime: 0,
  totalPrestigePointsEarned: new ExpantaNum(0),
  highestPoints: new ExpantaNum(10),
  firstPlayTime: Date.now(),
};

// Load the current save and keep the live game state in one object.
const state = loadGame();
const cutsceneState = {
  pageIndex: 0,
  charIndex: 0,
  currentText: "",
  typingTimer: null,
  isTyping: false,
};

// DOM references for the major UI elements so we can update them without repeatedly querying the page.
const elements = {
  statusMessage: document.getElementById("gameStatus"),
  eyebrowText: document.getElementById("eyebrowText"),
  slopCount: document.getElementById("slopCount"),
  autoRate: document.getElementById("autoRate"),
  upgradeList: document.getElementById("upgradeList"),
  blogList: document.getElementById("blogList"),
  statsList: document.getElementById("statsList"),
  waterFact: document.getElementById("waterFact"),
  resetButton: document.getElementById("resetButton"),
  saveButton: document.getElementById("saveButton"),
  exportButton: document.getElementById("exportButton"),
  importButton: document.getElementById("importButton"),
  cutscene: document.getElementById("cutscene"),
  startButton: document.getElementById("startButton"),
  skipIntroButton: document.getElementById("skipIntroButton"),
  autosaveSlider: document.getElementById("autosaveSlider"),
  autosaveValue: document.getElementById("autosaveValue"),
  replayIntroButton: document.getElementById("replayIntroButton"),
  cutsceneTitle: document.getElementById("cutsceneTitle"),
  cutsceneChapter: document.getElementById("cutsceneChapter"),
  dialogueText: document.getElementById("dialogueText"),
  currencyInput: document.getElementById("currencyInput"),
  currencyLockedBox: document.getElementById("currencyLocked"),
  backgroundColorInput: document.getElementById("backgroundColorInput"),
  backgroundColorLockedBox: document.getElementById("backgroundColorLocked"),
  notationSelect: document.getElementById("notationSelect"),
  musicVolumeSlider: document.getElementById("musicVolumeSlider"),
  musicVolumeValue: document.getElementById("musicVolumeValue"),
  toggleMusicButton: document.getElementById("toggleMusicButton"),
  bgMusic: document.getElementById("bgMusic"),
  ticker: document.getElementById("ticker"),
  tickerViewport: document.getElementById("tickerViewport"),
  tickerMessage: document.getElementById("tickerMessage"),
  tickerToggleButton: document.getElementById("tickerToggleButton"),
  prestigeConfirmSetting: document.getElementById("prestigeConfirmSetting"),
  prestigeConfirmButton: document.getElementById("prestigeConfirmButton"),
  tickerSpeedSlider: document.getElementById("tickerSpeedSlider"),
  tickerSpeedValue: document.getElementById("tickerSpeedValue"),
  tickRateSlider: document.getElementById("tickRateSlider"),
  tickRateValue: document.getElementById("tickRateValue"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  subtabButtons: document.querySelectorAll(".subtab-button"),
  subtabPanels: document.querySelectorAll(".subtab-panel"),
  chaosSubtabButton: document.getElementById("chaosSubtabButton"),
  optionSubtabButtons: document.querySelectorAll(".option-subtab-button"),
  optionSubtabPanels: document.querySelectorAll(".option-subtab-panel"),
  statsSubtabButtons: document.querySelectorAll(".stats-subtab-button"),
  statsSubtabPanels: document.querySelectorAll(".stats-subtab-panel"),
  formulasList: document.getElementById("formulasList"),
  optionsCosmeticsSubtabButton: document.getElementById("optionsCosmeticsSubtabButton"),
  prestigeSubtabButton: document.getElementById("prestigeSubtabButton"),
  prestigeSub: document.getElementById("prestigeSub"),
  prestigeCurrencyDisplay: document.getElementById("prestigeCurrencyDisplay"),
  prestigeCurrencyInput: document.getElementById("prestigeCurrencyInput"),
  prestigeCurrencyLockedBox: document.getElementById("prestigeCurrencyLocked"),
  mutedColorInput: document.getElementById("mutedColorInput"),
  inkColorInput: document.getElementById("inkColorInput"),
  prestigeTree: document.getElementById("prestigeTree"),
  choiceSubtabButton: document.getElementById("choiceSubtabButton"),
  prestigeChoiceContent: document.getElementById("prestigeChoiceContent"),
  endingFade: document.getElementById("endingFade"),
  endingFadeText: document.getElementById("endingFadeText"),
  endingFadeHint: document.getElementById("endingFadeHint"),
  winScreen: document.getElementById("winScreen"),
  winPlayAgain: document.getElementById("winPlayAgain"),
  winGoBack: document.getElementById("winGoBack"),
  badEndingScreen: document.getElementById("badEndingScreen"),
  badGoBack: document.getElementById("badGoBack"),
  prestigeButtonWrap: document.getElementById("prestigeButtonWrap"),
  prestigeButton: document.getElementById("prestigeButton"),
  prestigeResetNote: document.getElementById("prestigeResetNote"),
  prestigeNextAt: document.getElementById("prestigeNextAt"),
  automationToggle: document.getElementById("automationToggle"),
  automationToggleButton: document.getElementById("automationToggleButton"),
  automationToggleMain: document.getElementById("automationToggleMain"),
  automationToggleButtonMain: document.getElementById("automationToggleButtonMain"),
  minigamesPanel: document.getElementById("minigamesPanel"),
};

// Placeholder headlines for the news ticker. Swap these out for real news later.
const tickerMessages = [
  "What do you mean this isn't a unique feature?",
  "Why did the chicken cross the road? Because it was made with sora ai.",
  "idk why i added this i have no ideas for news messages",
  "Proudly not 100% AI!",
  "man vibecodes game, claims it was 'worth it'",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.",
];

// Random eyebrow line shown in the top bar; picked fresh on every page load.
// (Placeholder lorem ipsum lines — the real ones get filled in later.)
const eyebrowMessages = [
  "idk wtf this is",
  "the question nobody asked",
  "misadventures into vibe coding",
  "an unfortunate acronym",
  "slop?",
  "do people even read these?",
];

// Ticker scroll state: only one message on screen at a time, and the next one
// is shown only after the current message has fully scrolled off the left edge.
let tickerX = 0;
let tickerIndex = 0;
let tickerReady = false;

// Prestige tree pan/zoom view state. Session-only; not written into the save.
let prestigeZoom = 1;
let prestigePanX = 0;
let prestigePanY = 0;
// True once the tree has been centered on Limit Breaker after a page load.
let prestigeViewInitialized = false;
let prestigeTreeDrag = null; // { startX, startY, panStartX, panStartY, moved }
let prestigeDragMoved = false;
let currentPrestigePan = null;
let currentPrestigeStage = null;

function getRandomTickerIndex(excludeIndex = -1) {
  if (tickerMessages.length === 0) return 0;
  if (tickerMessages.length === 1) return 0;

  let nextIndex = excludeIndex;
  while (nextIndex === excludeIndex) {
    nextIndex = Math.floor(Math.random() * tickerMessages.length);
  }
  return nextIndex;
}

function showStatus(message, isError = false) {
  if (!elements.statusMessage) return;

  if (!message) {
    elements.statusMessage.textContent = "";
    elements.statusMessage.classList.remove("visible");
    elements.statusMessage.style.borderColor = "";
    return;
  }

  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.add("visible");
  elements.statusMessage.style.borderColor = isError ? "rgba(191, 62, 62, 0.8)" : "var(--line)";

  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    elements.statusMessage.classList.remove("visible");
  }, 1800);
}

function safeStorageRead(key) {
  const backends = [
    () => {
      try {
        return window.localStorage ? window.localStorage.getItem(key) : null;
      } catch (error) {
        return null;
      }
    },
    () => {
      try {
        return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
      } catch (error) {
        return null;
      }
    },
  ];

  for (const read of backends) {
    const value = read();
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function safeStorageWrite(key, value) {
  const writes = [
    () => {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(key, value);
          return true;
        }
      } catch (error) {
        // Ignore storage errors and fall through to other backends.
      }
      return false;
    },
    () => {
      try {
        if (window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
          return true;
        }
      } catch (error) {
        // Ignore storage errors and fall through.
      }
      return false;
    },
  ];

  for (const write of writes) {
    if (write()) {
      return true;
    }
  }

  return false;
}

function normalizeSaveState(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    return { ...defaultState, points: new ExpantaNum(10), autoPoints: new ExpantaNum(0), upgrades: getDefaultUpgradeState() };
  }

  const loadedPoints = asEN(parsed.points, 10);
  const loadedTotal = asEN(parsed.totalMade, loadedPoints);
  const repairedTotal = loadedTotal.lt(loadedPoints) ? loadedPoints : loadedTotal;
  const upgrades = parsed.upgrades && typeof parsed.upgrades === "object" ? parsed.upgrades : {};
  const prestigeUpgrades = parsed.prestigeUpgrades && typeof parsed.prestigeUpgrades === "object" ? parsed.prestigeUpgrades : {};
  const normalizedPrestigeUpgrades = {
    ...getDefaultPrestigeUpgrades(),
    ...prestigeUpgrades,
  };

  return {
    ...defaultState,
    ...parsed,
    points: loadedPoints,
    autoPoints: asEN(parsed.autoPoints, 0),
    totalMade: repairedTotal,
    currencyName: typeof parsed.currencyName === "string" ? parsed.currencyName : "points",
    backgroundColor: typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : "#f0f0f0",
    mutedColor: typeof parsed.mutedColor === "string" ? parsed.mutedColor : "#777",
    inkColor: typeof parsed.inkColor === "string" ? parsed.inkColor : "#1a1a1a",
    notation: parsed.notation === "scientific" ? "scientific" : "standard",
    musicVolume: Number.isFinite(Number(parsed.musicVolume)) ? Number(parsed.musicVolume) : 0.4,
    activeTab: parsed.activeTab === "statsTab" || parsed.activeTab === "optionsTab" || parsed.activeTab === "blogTab" ? parsed.activeTab : "gameTab",
    activeSubtab: parsed.activeSubtab === "prestigeSub" || parsed.activeSubtab === "chaosSub" ? parsed.activeSubtab : "gameSub",
    optionsSubtab: parsed.optionsSubtab === "optionsCreditsSub" ? "optionsCreditsSub" : "optionsSettingsSub",
    statsSubtab: parsed.statsSubtab === "statsFormulasSub" ? "statsFormulasSub" : "statsOverviewSub",
    prestigePoints: asEN(parsed.prestigePoints, 0),
    prestigeCurrencyName: typeof parsed.prestigeCurrencyName === "string" ? parsed.prestigeCurrencyName : "???",
    prestigeSubtab: parsed.prestigeSubtab === "choice" ? "choice" : "tree",
    choice: parsed.choice === "good" || parsed.choice === "bad" ? parsed.choice : null,
    // Backfill: a save that already chose the bad ending has definitely seen it.
    badEndingSeen: parsed.badEndingSeen === true || parsed.choice === "bad",
    tickerVisible: parsed.tickerVisible !== false,
    confirmPrestige: parsed.confirmPrestige !== false,
    tickerSpeed: Math.min(300, Math.max(10, Number.isFinite(Number(parsed.tickerSpeed)) ? Number(parsed.tickerSpeed) : 60)),
    overclockUnlocked: parsed.overclockUnlocked === true || loadedPoints.gte(new ExpantaNum(1000)),
    resets: Number.isFinite(Number(parsed.resets)) ? Number(parsed.resets) : 0,
    upgrades: {
      ...getDefaultUpgradeState(),
      ...upgrades,
    },
    prestigeUpgrades: normalizedPrestigeUpgrades,
    autoSaveInterval: Math.min(60, Math.max(5, Number.isFinite(Number(parsed.autoSaveInterval)) ? Number(parsed.autoSaveInterval) : 15)),
    tickRate: Math.min(100, Math.max(5, Number.isFinite(Number(parsed.tickRate)) ? Number(parsed.tickRate) : 10)),
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
    lastPrestigeTime: Number.isFinite(Number(parsed.lastPrestigeTime)) ? Number(parsed.lastPrestigeTime) : Date.now(),
    totalPlayTime: Number.isFinite(Number(parsed.totalPlayTime)) ? Number(parsed.totalPlayTime) : 0,
    totalPrestigePointsEarned: asEN(parsed.totalPrestigePointsEarned, 0),
    highestPoints: loadedPoints.gt(asEN(parsed.highestPoints, 0)) ? loadedPoints : asEN(parsed.highestPoints, loadedPoints),
    firstPlayTime: Number.isFinite(Number(parsed.firstPlayTime)) ? Number(parsed.firstPlayTime) : Date.now(),
  };
}

// Reads the save from localStorage and restores the game state.
// If the save is invalid or missing, it falls back to the default starting state.
function loadGame() {
  const saved = safeStorageRead("was-it-worth-it-save");

  if (!saved) {
    return {
      ...defaultState,
      points: new ExpantaNum(10),
      autoPoints: new ExpantaNum(0),
      upgrades: getDefaultUpgradeState(),
    };
  }

  try {
    const parsed = JSON.parse(saved);
    const normalized = normalizeSaveState(parsed);
    safeStorageWrite("was-it-worth-it-intro", "true");
    return normalized;
  } catch (error) {
    return {
      ...defaultState,
      points: new ExpantaNum(10),
      autoPoints: new ExpantaNum(0),
      upgrades: getDefaultUpgradeState(),
    };
  }
}

// Serializes the current game state into localStorage so it survives page reloads.
function saveGame() {
  const SAVE_VERSION = 1;
  const saveData = {
    ...state,
    saveVersion: SAVE_VERSION,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
    totalMade: state.totalMade.toString(),
    prestigePoints: state.prestigePoints.toString(),
    prestigeUpgrades: state.prestigeUpgrades || {},
    upgrades: state.upgrades || {},
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
    tickRate: state.tickRate || 10,
    totalPlayTime: state.totalPlayTime || 0,
    totalPrestigePointsEarned: (state.totalPrestigePointsEarned || new ExpantaNum(0)).toString(),
    highestPoints: (state.highestPoints || new ExpantaNum(0)).toString(),
    firstPlayTime: state.firstPlayTime || Date.now(),
  };

  const rawSave = JSON.stringify(saveData);
  const didWrite = safeStorageWrite("was-it-worth-it-save", rawSave);
  if (!didWrite) {
    showStatus("Save failed in this browser.", true);
    return false;
  }

  state.lastAutoSave = Date.now();
  return true;
}

function encodeBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value) {
  return decodeURIComponent(escape(atob(value)));
}

// Exports the save as a base64 string so it can be shared or backed up manually.
function exportSave() {
  const data = JSON.stringify({
    ...state,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
    totalMade: state.totalMade.toString(),
    prestigePoints: state.prestigePoints.toString(),
    prestigeUpgrades: state.prestigeUpgrades,
    upgrades: state.upgrades || {},
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
  }, null, 2);

  const encoded = encodeBase64(data);

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(encoded)
      .then(() => {
        showStatus("Save exported to clipboard.");
      })
      .catch(() => fallbackExport(encoded));
    return;
  }

  fallbackExport(encoded);
}

function fallbackExport(data) {
  const text = window.prompt("Copy this save data:", data);
  if (text === null) return;
  showStatus("Save exported.");
  saveGame();
}

function importSave() {
  const input = window.prompt("Paste a save string:");
  if (!input) return;

  try {
    const cleanInput = input.trim();
    const candidate = cleanInput.startsWith("{") ? cleanInput : decodeBase64(cleanInput);
    const parsed = JSON.parse(candidate);
    Object.assign(state, normalizeSaveState(parsed));

    render();
    saveGame();
    showStatus("Save imported.");
  } catch (error) {
    showStatus("Invalid save data.", true);
  }
}

// When an individual upgrade's level exceeds this threshold, its cost scaling
// increases. Only applies to that specific upgrade, not others.
const SCALE_THRESHOLD = 200;

// Returns the total number of upgrade levels across all upgrades.
function getTotalUpgradeCount() {
  return upgradeCatalog.reduce((sum, u) => sum + (state.upgrades[u.id] || 0), 0);
}

// Returns true when this specific upgrade has reached the per-upgrade level
// threshold where its cost growth is significant enough to label it "Scaled".
function isScaled(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  return owned > SCALE_THRESHOLD;
}

// Work out the current cost for an upgrade. The cost grows by the effective
// costScale at each owned level, with a scaling penalty past the threshold.
function getUpgradeCost(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  return getUpgradeCostForLevel(upgrade, owned);
}

// Calculates how many copies of a repeatable upgrade can be bought right now
// without exceeding the player's available points.
function getUpgradeMaxLevel(upgrade) {
  if (!upgrade || upgrade.maxLevel <= 1) {
    return upgrade ? 1 : 0;
  }

  if ((state.prestigeUpgrades?.limitBreaker || 0) > 0) {
    return Number.POSITIVE_INFINITY;
  }

  return upgrade.maxLevel;
}

// Calculates how many copies of a repeatable upgrade can be bought right now
// without exceeding the player's available points.
function getMaxAffordableUpgradeInfo(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  const effectiveMax = getUpgradeMaxLevel(upgrade);
  const remaining = Number.isFinite(effectiveMax) ? Math.max(0, effectiveMax - owned) : Number.POSITIVE_INFINITY;
  if (!remaining || upgrade.maxLevel <= 1) {
    return { count: 0, totalCost: asEN(0) };
  }

  // Cap iterations to prevent hangs when limitBreaker + idleComfort are active.
  const MAX_ITER = 5000;
  let count = 0;
  let totalCost = asEN(0);
  const baseCost = asEN(upgrade.baseCost, 0);
  const usesPrestige = upgrade.currency === "prestige";
  const wallet = usesPrestige ? state.prestigePoints : state.points;

  while (count < remaining && count < MAX_ITER) {
    // Recalculate the effective cost scale for each level, since it changes
    // when crossing the SCALE_THRESHOLD (200). Using getUpgradeCostForLevel ensures
    // the correct scale is applied for each individual level.
    const level = owned + count;
    const nextCost = getUpgradeCostForLevel(upgrade, level);
    if (wallet.lt(totalCost.add(nextCost))) break;
    totalCost = totalCost.add(nextCost);
    count += 1;
  }

  return { count, totalCost };
}

// Returns the cost of a specific upgrade level, accounting for the scaling
// penalty that kicks in past SCALE_THRESHOLD (200).
function getUpgradeCostForLevel(upgrade, level) {
  const baseCost = asEN(upgrade.baseCost, 0);
  const baseScale = Number(upgrade.costScale ?? 1.2);
  let scale = baseScale;
  if (level > SCALE_THRESHOLD) {
    const overage = level - SCALE_THRESHOLD;
    // Gradual ramp: +50% per 100 levels past threshold (instead of doubling).
    const penaltyMultiplier = 1 + overage / 200;
    scale = baseScale * penaltyMultiplier;
  }
  let cost = baseCost.mul(new ExpantaNum(scale).pow(level));

  // costReduction: reduces all upgrade costs by 5% per level.
  const costReductionLevel = state.prestigeUpgrades?.costReduction || 0;
  if (costReductionLevel > 0) {
    const reduction = new ExpantaNum(1).sub(new ExpantaNum(0.05).mul(costReductionLevel));
    cost = cost.mul(reduction.max(new ExpantaNum(0.1))); // minimum 10% of original cost
  }

  return cost;
}

// Post-purchase UI refresh that avoids rebuilding the shop DOM unless the set
// of visible upgrades actually changed. Rebuilding resets layout inside the
// scrollable columns, so ordinary manual buys only refresh labels in place.
function afterPurchaseUpdate(purchasedId) {
  const touchesCosmetics = purchasedId === "rename" || purchasedId === "theme";
  if (touchesCosmetics || shouldRefreshUpgradeList()) {
    render();
    return;
  }
  renderStats();
  refreshUpgradeButtonState();
}

// Buys one copy of a single upgrade and applies its immediate effect if needed.
function purchaseUpgrade(id) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) return;

  const owned = state.upgrades[id] || 0;
  const effectiveMax = getUpgradeMaxLevel(upgrade);
  if (owned >= effectiveMax) return;

  const cost = getUpgradeCost(upgrade);
  const usesPrestige = upgrade.currency === "prestige";
  const wallet = usesPrestige ? state.prestigePoints : state.points;
  if (wallet.lt(cost)) return;

  if (usesPrestige) {
    state.prestigePoints = state.prestigePoints.sub(cost);
  } else {
    state.points = state.points.sub(cost);
  }
  state.upgrades[id] = owned + 1;

  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0));
  }

  // Flash the upgrade item to give visual feedback.
  const itemEl = document.querySelector(`.upgrade-item[data-upgrade-id="${id}"]`);
  if (itemEl) {
    itemEl.classList.remove("purchase-flash");
    void itemEl.offsetWidth;
    itemEl.classList.add("purchase-flash");
  }

  afterPurchaseUpdate(id);
  invalidateProductionCache();
  saveGame();
}

// Buys as many copies as the player can afford, up to the upgrade's max level.
function purchaseMaxUpgrade(id) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade || upgrade.maxLevel <= 1) return;

  const bought = state.upgrades[id] || 0;
  const effectiveMax = getUpgradeMaxLevel(upgrade);
  if (bought >= effectiveMax) return;

  const { count, totalCost } = getMaxAffordableUpgradeInfo(upgrade);
  if (!count || totalCost.lte(0)) return;

  const usesPrestige = upgrade.currency === "prestige";
  if (usesPrestige) {
    state.prestigePoints = state.prestigePoints.sub(totalCost);
  } else {
    state.points = state.points.sub(totalCost);
  }
  state.upgrades[id] = bought + count;

  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0).mul(count));
  }

  afterPurchaseUpdate(id);
  invalidateProductionCache();
  saveGame();
}

// Adds points to the player's total. This is used both for manual gains and passive income.
// Also records the lifetime total earned for the statistics tab.
function addPoints(amount) {
  const value = asEN(amount, 0);
  if (value.gt(0)) {
    state.totalMade = state.totalMade.add(value);
  }
  state.points = state.points.add(value);

  // Reaching 1000 points permanently unlocks the overclock section, even if the
  // balance later drops below 1000 from spending.
  if (!state.overclockUnlocked && state.points.gte(new ExpantaNum(1000))) {
    state.overclockUnlocked = true;
    saveGame();
  }
}

// Returns the currently visible currency name, falling back to "points" when rename is locked.
function getCurrencyLabel() {
  if (!(state.upgrades.rename || 0)) {
    return "points";
  }

  return (state.currencyName ?? "").trim() || "points";
}

// Adds all passive buildup together and applies the overclock multiplier.
function getEffectiveAutoPoints() {
  const additiveBonus = asEN(state.autoPoints, 0);
  const multiplierLevel = state.upgrades.multiplier || 0;
  // yieldOverclockBoost increases the multiplier base from 1.2 to 1.4
  const overclockBase = (state.prestigeUpgrades?.yieldOverclockBoost || 0) > 0 ? 1.4 : 1.2;
  const multiplier = new ExpantaNum(overclockBase).pow(multiplierLevel);
  const superOCLevel = state.upgrades.superOverclock || 0;
  const superMultiplier = new ExpantaNum(2).pow(superOCLevel);
  const prestigeBonus = (state.prestigeUpgrades?.limitBreaker || 0) > 0 ? new ExpantaNum(2) : new ExpantaNum(1);

  let result = additiveBonus.mul(multiplier).mul(superMultiplier).mul(prestigeBonus);

  // --- Synergy path effects ---
  // Every synergy multiplies ALL point production (global multipliers).

  // Actual Repeats: ×(1 + machine level). Rewards focusing.
  if ((state.prestigeUpgrades?.synergyLink || 0) > 0) {
    const lvl = state.upgrades.machine || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(1).mul(lvl)));
  }

  // Portfolio Effect: ×(1 + 0.12 × distinct prod upgrades owned). Rewards diversity.
  if ((state.prestigeUpgrades?.synergyLoop || 0) > 0) {
    const prodIds = ["starter", "machine", "machine2", "machine3", "turbo", "relay", "forge", "refinery", "network", "lattice", "reactor", "industry", "orbital", "galaxy", "singularity", "endgame", "epoch", "cosmos", "eclipse"];
    const distinct = prodIds.filter((id) => (state.upgrades[id] || 0) > 0).length;
    if (distinct > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.12).mul(distinct)));
  }

  // Compounding Resonance: ×1.05^deep cycle level.
  if ((state.prestigeUpgrades?.synergyChain3 || 0) > 0) {
    const lvl = state.upgrades.machine3 || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1.05).pow(lvl));
  }

  // Velocity Bleed: ×(1 + log10(turbo + 1) × 3). Turbo speed rubs off.
  if ((state.prestigeUpgrades?.synergyChain4 || 0) > 0) {
    const lvl = state.upgrades.turbo || 0;
    result = result.mul(new ExpantaNum(1).add(Math.log10(lvl + 1) * 3));
  }

  // Signal Cascade: ×1.04^relay level.
  if ((state.prestigeUpgrades?.synergyChain5 || 0) > 0) {
    const lvl = state.upgrades.relay || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1.04).pow(lvl));
  }

  // Phoenix Forging: ×(1 + 0.1 × resets).
  if ((state.prestigeUpgrades?.synergyChain6 || 0) > 0) {
    const resets = state.resets || 0;
    if (resets > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.1).mul(resets)));
  }

  // Scale Economy: ×(1 + 0.02 × total upgrade levels).
  if ((state.prestigeUpgrades?.synergyChain7 || 0) > 0) {
    const allUpgradeIds = upgradeCatalog.map((u) => u.id);
    const totalOwned = allUpgradeIds.reduce((sum, id) => sum + (state.upgrades[id] || 0), 0);
    if (totalOwned > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.02).mul(totalOwned)));
  }

  // Critical Mass: ×1.07^network level.
  if ((state.prestigeUpgrades?.synergyChain8 || 0) > 0) {
    const lvl = state.upgrades.network || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1.07).pow(lvl));
  }

  // Lattice Osmosis: ×(1 + ln(totalMade / 1e6 + 1)).
  if ((state.prestigeUpgrades?.synergyChain9 || 0) > 0) {
    const tm = state.totalMade || new ExpantaNum(0);
    const logBonus = Math.log(tm.div(1e6).add(1).toNumber());
    result = result.mul(new ExpantaNum(1).add(Math.max(0, logBonus)));
  }

  // Reactor Bloom: ×1.08^Reactor level.
  if ((state.prestigeUpgrades?.synergyChain10 || 0) > 0) {
    const lvl = state.upgrades.reactor || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1.08).pow(lvl));
  }

  // Capital Injection: ×(1 + ln(prestigePoints + 1) / 2).
  if ((state.prestigeUpgrades?.synergyChain11 || 0) > 0) {
    const pp = state.prestigePoints || new ExpantaNum(0);
    result = result.mul(new ExpantaNum(1).add(Math.log(pp.add(1).toNumber()) / 2));
  }

  // Orbital Decay: ×(1 + ln(secondsSincePrestige + 1) / 4).
  if ((state.prestigeUpgrades?.synergyChain12 || 0) > 0) {
    const elapsed = Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 1000);
    result = result.mul(new ExpantaNum(1).add(Math.log(elapsed + 1) / 4));
  }

  // Constellation Map: ×(1 + 0.2 × prestige upgrades owned).
  if ((state.prestigeUpgrades?.synergyChain13 || 0) > 0) {
    const prestigeCount = Object.values(state.prestigeUpgrades || {}).filter((v) => (v || 0) > 0).length;
    if (prestigeCount > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.2).mul(prestigeCount)));
  }

  // Event Horizon: ×(1 + 0.0005 × singularity level). Fixed bonus, no feedback loop.
  if ((state.prestigeUpgrades?.synergyChain14 || 0) > 0) {
    const lvl = state.upgrades.singularity || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.0005).mul(lvl)));
  }

  // Echo Chamber: ×(1 + 0.15 × resets).
  if ((state.prestigeUpgrades?.synergyChain15 || 0) > 0) {
    const resets = state.resets || 0;
    if (resets > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.15).mul(resets)));
  }

  // Chrono Leak: ×(1 + ln(minutes since prestige + 1)).
  if ((state.prestigeUpgrades?.synergyChain16 || 0) > 0) {
    const mins = Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 60000);
    result = result.mul(new ExpantaNum(1).add(Math.log(mins + 1)));
  }

  // Dark Energy: ×1.01^total upgrade levels.
  if ((state.prestigeUpgrades?.synergyChain17 || 0) > 0) {
    const allUpgradeIds = upgradeCatalog.map((u) => u.id);
    const totalOwned = allUpgradeIds.reduce((sum, id) => sum + (state.upgrades[id] || 0), 0);
    if (totalOwned > 0) result = result.mul(new ExpantaNum(1.01).pow(totalOwned));
  }

  // Eclipse Synergy: ×(1 + 0.5 × eclipse level).
  if ((state.prestigeUpgrades?.synergyChain18 || 0) > 0) {
    const lvl = state.upgrades.eclipse || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.5).mul(lvl)));
  }

  // --- Yield path effects ---

  // outputBloom: ×2
  if ((state.prestigeUpgrades?.outputBloom || 0) > 0) {
    result = result.mul(2);
  }

  // yieldStarterBoost: starter produces ×5
  // This is handled as a separate multiplier on the starter value in the additive bonus.
  // We add it here as a global effect for simplicity: ×(1 + 4 × starter owned)
  if ((state.prestigeUpgrades?.yieldStarterBoost || 0) > 0) {
    const lvl = state.upgrades.starter || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(4).mul(lvl)));
  }

  // yieldMachineBoost: machine repeat produces ×3
  // Applied as ×(1 + 2 × machine level)
  if ((state.prestigeUpgrades?.yieldMachineBoost || 0) > 0) {
    const lvl = state.upgrades.machine || 0;
    if (lvl > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(2).mul(lvl)));
  }

  // yieldAutoBoost: ×(1 + 0.5 × total auto upgrade levels)
  if ((state.prestigeUpgrades?.yieldAutoBoost || 0) > 0) {
    const autoIds = upgradeCatalog.filter((u) => u.type === "auto").map((u) => u.id);
    const totalAuto = autoIds.reduce((sum, id) => sum + (state.upgrades[id] || 0), 0);
    if (totalAuto > 0) result = result.mul(new ExpantaNum(1).add(new ExpantaNum(0.5).mul(totalAuto)));
  }

  // yieldOverclockBoost: overclock base increased from 1.2 to 1.4
  // This is handled by modifying the multiplier calculation above.

  // yieldPrestigeBoost: ×(1 + ln(prestige points + 1) / 10)
  if ((state.prestigeUpgrades?.yieldPrestigeBoost || 0) > 0) {
    const pp = state.prestigePoints || new ExpantaNum(0);
    const bonus = Math.log(pp.add(1).toNumber()) / 10;
    result = result.mul(new ExpantaNum(1).add(Math.max(0, bonus)));
  }

  // yieldTotalMadeBoost: ×(1 + ln(totalMade / 1e4 + 1) / 5)
  if ((state.prestigeUpgrades?.yieldTotalMadeBoost || 0) > 0) {
    const tm = state.totalMade || new ExpantaNum(0);
    const bonus = Math.log(tm.div(1e4).add(1).toNumber()) / 5;
    result = result.mul(new ExpantaNum(1).add(Math.max(0, bonus)));
  }

  // yieldTimeBoost: ×(1 + ln(minutes in run + 1) / 3)
  if ((state.prestigeUpgrades?.yieldTimeBoost || 0) > 0) {
    const mins = Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 60000);
    const bonus = Math.log(mins + 1) / 3;
    result = result.mul(new ExpantaNum(1).add(bonus));
  }

  // yieldFinalBloom: ×3
  if ((state.prestigeUpgrades?.yieldFinalBloom || 0) > 0) {
    result = result.mul(3);
  }

  return result;
}

// Cached production rate to avoid recomputing all 18 synergies every frame.
let cachedEffectiveAutoPoints = null;
let cachedEffectiveAutoPointsTime = 0;

// Returns the cached production rate, recomputing at most once per 100ms.
function getCachedEffectiveAutoPoints() {
  const now = Date.now();
  if (cachedEffectiveAutoPoints === null || now - cachedEffectiveAutoPointsTime > 100) {
    cachedEffectiveAutoPoints = getEffectiveAutoPoints();
    cachedEffectiveAutoPointsTime = now;
  }
  return cachedEffectiveAutoPoints;
}

// Invalidates the production cache so the next call recomputes.
function invalidateProductionCache() {
  cachedEffectiveAutoPoints = null;
}

// Production upgrades in the order the auto-buyer purchases them.
const productionUpgradeOrder = upgradeCatalog
  .filter((u) => u.section === "production")
  .map((u) => u.id);

// Returns the name of the Nth production upgrade (1-indexed), or null if out of range.
function getProductionUpgradeName(n) {
  const id = productionUpgradeOrder[n - 1];
  if (!id) return null;
  const def = upgradeCatalog.find((u) => u.id === id);
  return def ? def.name : null;
}

// Buys a single upgrade without rendering. Returns true if a purchase was made.
function buyUpgradeImmediate(id, free) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) return false;
  const owned = state.upgrades[id] || 0;
  const effectiveMax = getUpgradeMaxLevel(upgrade);
  if (owned >= effectiveMax) return false;
  
  const cost = getUpgradeCost(upgrade);
  const usesPrestige = upgrade.currency === "prestige";
  const wallet = usesPrestige ? state.prestigePoints : state.points;
  if (wallet.lt(cost)) return false;
  
  // When free (idleComfort), don't deduct the cost.
  if (!free) {
    if (usesPrestige) {
      state.prestigePoints = state.prestigePoints.sub(cost);
    } else {
      state.points = state.points.sub(cost);
    }
  }
  state.upgrades[id] = owned + 1;
  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0));
  }
  return true;
}

// Buys as many levels of an upgrade as the player can afford (or all levels
// for free if the free flag is set). Returns true if any purchase was made.
function buyUpgradeMax(id, free) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) return false;
  const owned = state.upgrades[id] || 0;
  const effectiveMax = getUpgradeMaxLevel(upgrade);
  if (owned >= effectiveMax) return false;

  // When free (idleComfort), still check affordability but don't deduct cost.
  // Otherwise, calculate how many the player can afford.
  let count;
  let totalCost;
  if (free) {
    // Check how many we can afford, but don't deduct.
    const info = getMaxAffordableUpgradeInfo(upgrade);
    count = info.count;
    totalCost = info.totalCost;
  } else {
    const info = getMaxAffordableUpgradeInfo(upgrade);
    count = info.count;
    totalCost = info.totalCost;
  }

  // Single-level upgrades (or getMaxAffordable returning 0 for other reasons):
  // try to buy one copy directly.
  if (count <= 0) return buyUpgradeImmediate(id, free);

  if (!free) {
    const usesPrestige = upgrade.currency === "prestige";
    if (usesPrestige) {
      state.prestigePoints = state.prestigePoints.sub(totalCost);
    } else {
      state.points = state.points.sub(totalCost);
    }
  }

  state.upgrades[id] = owned + count;
  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0).mul(count));
  }
  return true;
}

// Auto-buy production upgrades based on autoOptimize prestige level.
// Also auto-buys overclock/synergy upgrades if their prestige nodes are owned.
// Returns true if any purchase was made.
function autoBuyUpgrades() {
  if (!state.automationEnabled) return false;
  let anyBought = false;
  const free = (state.prestigeUpgrades.idleComfort || 0) > 0;
  // Auto-buy always buys max instead of one at a time (inherent behavior).
  const buyMaxMode = true;

  // Production auto-buy: autoOptimize level N buys the first N+1 production
  // upgrades (level 1 buys starter + machine, level 2 adds machine2, etc.).
  const autoOptLevel = state.prestigeUpgrades.autoOptimize || 0;
  if (autoOptLevel > 0) {
    const limit = Math.min(autoOptLevel + 1, productionUpgradeOrder.length);
    for (let i = 0; i < limit; i++) {
      if (buyMaxMode) {
        if (buyUpgradeMax(productionUpgradeOrder[i], free)) {
          anyBought = true;
        }
      } else {
        if (buyUpgradeImmediate(productionUpgradeOrder[i], free)) {
          anyBought = true;
        }
      }
    }
  }

  // Auto Overclock: buy the multiplier upgrade when affordable.
  if ((state.prestigeUpgrades.autoOverclock || 0) > 0) {
    if (buyMaxMode) {
      if (buyUpgradeMax("multiplier", free)) {
        anyBought = true;
      }
    } else {
      if (buyUpgradeImmediate("multiplier", free)) {
        anyBought = true;
      }
    }
  }

  return anyBought;
}

function getPrestigeCurrencyLabel() {
  return ((state.prestigeCurrencyName ?? "???").trim() || "???");
}

function getPrestigeUpgradeCost(upgrade) {
  const owned = state.prestigeUpgrades[upgrade.id] || 0;
  const baseCost = asEN(upgrade?.cost ?? 0, 0);
  const scale = Number(upgrade.costScale ?? 1);
  const add = Number(upgrade.costAdd ?? 0);
  if (add > 0) return baseCost.add(new ExpantaNum(add).mul(owned));
  if (scale <= 1) return baseCost;
  return baseCost.mul(new ExpantaNum(scale).pow(owned));
}

// Prestige points gained per reset. Centralized so the button label and the
// actual reset always agree.
// Below 10Qa there is nothing to gain (+0). The first prestige grants a flat
// 1; after that the gain scales as +1 per 5x past threshold:
// 10Qa -> 1, 50Qa -> 2, 250Qa -> 3, etc.
function getPrestigeGain() {
  const points = state.points || new ExpantaNum(0);
  const effectiveThreshold = getEffectivePrestigeUnlock();

  if (points.lt(effectiveThreshold)) {
    return new ExpantaNum(0);
  }

  if ((state.resets || 0) === 0) {
    return new ExpantaNum(1);
  }

  // Scales as +1 per 5x past threshold (so 10Qa -> 1, 50Qa -> 2, 250Qa -> 3, etc.)
  const ordersPastThreshold = points
    .div(effectiveThreshold)
    .log(5)
    .floor();

  let gain = ordersPastThreshold.add(1).max(new ExpantaNum(1));

  // --- Prestige path effects ---
  // These multiply the prestige gain itself.

  // prestigeDrive: ×2
  if ((state.prestigeUpgrades?.prestigeDrive || 0) > 0) {
    gain = gain.mul(2);
  }

  // prestigeSpark: ×1.5
  if ((state.prestigeUpgrades?.prestigeSpark || 0) > 0) {
    gain = gain.mul(1.5);
  }

  // prestigeReserve: ×1.5
  if ((state.prestigeUpgrades?.prestigeReserve || 0) > 0) {
    gain = gain.mul(1.5);
  }

  // prestigeVortex: ×3
  if ((state.prestigeUpgrades?.prestigeVortex || 0) > 0) {
    gain = gain.mul(3);
  }

  // prestigeMomentum: ×(1 + ln(totalPrestigeEarned + 1) / 5)
  if ((state.prestigeUpgrades?.prestigeMomentum || 0) > 0) {
    const totalEarned = state.totalPrestigePointsEarned || new ExpantaNum(0);
    const bonus = Math.log(totalEarned.add(1).toNumber()) / 5;
    gain = gain.mul(new ExpantaNum(1).add(Math.max(0, bonus)));
  }

  // prestigeEcho: ×(1 + 0.3 × resets)
  if ((state.prestigeUpgrades?.prestigeEcho || 0) > 0) {
    const resets = state.resets || 0;
    gain = gain.mul(new ExpantaNum(1).add(new ExpantaNum(0.3).mul(resets)));
  }

  // prestigeApex: ×5
  if ((state.prestigeUpgrades?.prestigeApex || 0) > 0) {
    gain = gain.mul(5);
  }

  // prestigeOverflow: ×(1 + log10(highestPoints) / 20)
  if ((state.prestigeUpgrades?.prestigeOverflow || 0) > 0) {
    const highest = state.highestPoints || new ExpantaNum(10);
    const logBonus = Math.log10(highest.toNumber()) / 20;
    gain = gain.mul(new ExpantaNum(1).add(Math.max(0, logBonus)));
  }

  // prestigeSiphon: ×(1 + totalUpgrades / 500)
  if ((state.prestigeUpgrades?.prestigeSiphon || 0) > 0) {
    const allUpgradeIds = upgradeCatalog.map((u) => u.id);
    const totalOwned = allUpgradeIds.reduce((sum, id) => sum + (state.upgrades[id] || 0), 0);
    gain = gain.mul(new ExpantaNum(1).add(new ExpantaNum(totalOwned).div(500)));
  }

  return gain;
}

function purchasePrestigeUpgrade(id) {
  const prestigeUpgrade = prestigeCatalog.find((entry) => entry.id === id);
  if (!prestigeUpgrade) return;

  const owned = state.prestigeUpgrades[id] || 0;
  const maxLevel = prestigeUpgrade.maxLevel || 1;
  if (owned >= maxLevel) return;

  if (!isPrestigeUpgradeUnlocked(prestigeUpgrade)) return;

  const cost = getPrestigeUpgradeCost(prestigeUpgrade);
  if (state.prestigePoints.lt(cost)) return;

  state.prestigePoints = state.prestigePoints.sub(cost);
  state.prestigeUpgrades[id] = owned + 1;
  invalidateProductionCache();
  render();
  saveGame();
}

function performPrestige() {
  // Prestige requires enough points (threshold may be reduced by prestige nodes).
  if ((state.points || new ExpantaNum(0)).lt(getEffectivePrestigeUnlock())) {
    return;
  }

  const prestigeGain = getPrestigeGain();
  const nextPrestigePoints = state.prestigePoints.add(prestigeGain);
  // The confirmation only kicks in from the second prestige onward, and can
  // be turned off entirely in Options > Settings.
  const needsConfirmation = (state.resets || 0) >= 1 && state.confirmPrestige !== false;
  if (needsConfirmation) {
    const confirmed = window.confirm(`Are you sure you want to prestige? You will gain ${prestigeGain.toString()} ${getPrestigeCurrencyLabel()}.`);
    if (!confirmed) return;
  }

  const cosmeticState = {
    rename: state.upgrades.rename || 0,
    theme: state.upgrades.theme || 0,
    prestigeRename: state.upgrades.prestigeRename || 0,
    tintText: state.upgrades.tintText || 0,
    tintInk: state.upgrades.tintInk || 0,
    mutedColor: state.mutedColor || "#777",
    inkColor: state.inkColor || "#1a1a1a",
  };

  // Muscle Memory: level N keeps the first N+1 production upgrades (and their
  // share of passive income). Clock Saver keeps Overclock levels; Super
  // Overclock is always kept regardless.
  const keepLevel = state.prestigeUpgrades.keepUpgrades || 0;
  const keepCount = Math.min(keepLevel + 1, productionUpgradeOrder.length);
  const keptProduction = {};
  let keptAutoPoints = new ExpantaNum(0);
  if (keepLevel > 0) {
    for (let i = 0; i < keepCount; i++) {
      const uid = productionUpgradeOrder[i];
      const lvl = state.upgrades[uid] || 0;
      if (lvl > 0) {
        keptProduction[uid] = lvl;
        const keptDef = upgradeCatalog.find((entry) => entry.id === uid);
        if (keptDef && keptDef.type === "auto") {
          keptAutoPoints = keptAutoPoints.add(asEN(keptDef.value, 0).mul(lvl));
        }
      }
    }
  }
  const keptMultiplier = (state.prestigeUpgrades.keepOverclocks || 0) > 0 ? state.upgrades.multiplier || 0 : 0;

  state.prestigePoints = nextPrestigePoints;
  state.resets = (state.resets || 0) + 1;
  state.lastPrestigeTime = Date.now();

  // Track lifetime prestige points earned (reuse the gain captured before
  // resets was incremented, so the first prestige isn't double-counted).
  state.totalPrestigePointsEarned = (state.totalPrestigePointsEarned || new ExpantaNum(0)).add(prestigeGain);

  const superOCLevel = state.upgrades.superOverclock || 0;
  state.points = new ExpantaNum(10);
  state.autoPoints = keptAutoPoints;
  state.upgrades = getDefaultUpgradeState();
  state.upgrades.rename = cosmeticState.rename;
  state.upgrades.theme = cosmeticState.theme;
  state.upgrades.prestigeRename = cosmeticState.prestigeRename;
  state.upgrades.tintText = cosmeticState.tintText;
  state.upgrades.tintInk = cosmeticState.tintInk;
  state.upgrades.superOverclock = superOCLevel;
  state.upgrades.multiplier = keptMultiplier;
  for (const [uid, lvl] of Object.entries(keptProduction)) {
    state.upgrades[uid] = lvl;
  }

  if (!(state.upgrades.rename || 0)) {
    state.currencyName = "points";
  }

  if (!(state.upgrades.theme || 0)) {
    state.backgroundColor = "#f0f0f0";
  }

  if (!(state.upgrades.tintText || 0)) {
    state.mutedColor = "#777";
  }

  if (!(state.upgrades.tintInk || 0)) {
    state.inkColor = "#1a1a1a";
  }

  invalidateProductionCache();
  render();
  saveGame();
}

function isPrestigeUpgradeUnlocked(upgrade) {
  const parents = upgrade.parents || [];
  return parents.every((pid) => (state.prestigeUpgrades[pid] || 0) > 0);
}

// True once every node in the prestige tree has been bought to max level.
// This unlocks the THE CHOICE subtab.
function allPrestigeUpgradesBought() {
  return prestigeCatalog.every((upgrade) => (state.prestigeUpgrades[upgrade.id] || 0) >= (upgrade.maxLevel || 1));
}

// Buys one of the two THE CHOICE upgrades and starts the matching ending.
function purchaseChoiceUpgrade(id) {
  const choice = choiceUpgrades.find((entry) => entry.id === id);
  if (!choice) return;
  if ((state.prestigeUpgrades[id] || 0) > 0) return;

  // The first pick costs prestige points; switching to the other ending is free.
  if (!state.choice) {
    const cost = asEN(choice.cost, 0);
    if (state.prestigePoints.lt(cost)) return;
    state.prestigePoints = state.prestigePoints.sub(cost);
  }

  state.prestigeUpgrades[id] = 1;
  state.choice = id === "goodEnding" ? "good" : "bad";
  render();
  saveGame();

  if (id === "goodEnding") {
    playGoodEnding();
  } else {
    playBadEnding();
  }
}

// Renders the THE CHOICE panel: the two ending upgrades (or their replay /
// locked states once a choice has been made).
function renderPrestigeChoice() {
  const container = elements.prestigeChoiceContent;
  if (!container) return;

  // The THE CHOICE subtab only appears once every tree upgrade is bought.
  const unlocked = allPrestigeUpgradesBought();
  if (elements.choiceSubtabButton) {
    elements.choiceSubtabButton.classList.toggle("hidden", !unlocked);
  }
  // Guard against a save that has the choice subtab open while the tree is
  // incomplete (e.g. an edited save): fall back to the tree view.
  if (!unlocked && state.prestigeSubtab === "choice") {
    setActivePrestigeSubtab("tree", true);
  }

  const label = getPrestigeCurrencyLabel();
  const chosen = state.choice;

  container.innerHTML = `
    <p class="choice-intro">You've bought every upgrade so far. You could end this charade now. But something within you compels you to go even further. Past the point of no return.</p>
    <div class="choice-upgrades">
      ${choiceUpgrades.map((choice) => {
        const owned = (state.prestigeUpgrades[choice.id] || 0) > 0;
        const isChosen = chosen === (choice.id === "goodEnding" ? "good" : "bad");
        const otherChosen = chosen && !isChosen;
        const affordable = state.prestigePoints.gte(asEN(choice.cost, 0));

        let button;
        if (isChosen) {
          button = `<button data-choice-action="replay" data-choice-id="${choice.id}">${choice.id === "goodEnding" ? "View cutscene" : "View ending"}</button>`;
        } else if (chosen === "bad" && choice.id === "goodEnding") {
          // Bad ending picked: the good ending becomes a "see what you missed" replay.
          button = `<button data-choice-action="missed" data-choice-id="${choice.id}">See what you missed</button>`;
        } else if (chosen === "good" && choice.id === "badEnding") {
          // Good ending picked: the bad ending stays available and free.
          button = `<button data-choice-action="buy" data-choice-id="${choice.id}">View ending</button>`;
        } else {
          button = `<button data-choice-action="buy" data-choice-id="${choice.id}" ${affordable ? "" : "disabled"}>Choose (${formatEN(choice.cost)} ${label})</button>`;
        }

        let costText;
        if (isChosen) {
          costText = "Chosen";
        } else if (chosen === "good" && choice.id === "badEnding") {
          costText = "Free";
        } else if (chosen === "bad" && choice.id === "goodEnding") {
          costText = owned ? "Seen" : "Missed";
        } else {
          costText = `Cost: ${formatEN(choice.cost)} ${label}`;
        }

        return `
          <div class="choice-upgrade ${choice.id === "goodEnding" ? "good" : "bad"} ${otherChosen ? "locked" : ""}">
            <div class="choice-upgrade-icon">${choice.icon}</div>
            <h3>${choice.name}</h3>
            <p>${choice.description}</p>
            <p class="choice-cost">${costText}</p>
            ${button}
            <div class="choice-upgrade-tooltip">
              <em>${choice.flavor}</em>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  container.querySelectorAll("[data-choice-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.choiceId;
      const action = button.dataset.choiceAction;
      if (action === "buy") {
        purchaseChoiceUpgrade(id);
      } else if (action === "missed") {
        playMissedEnding();
      } else if (id === "goodEnding") {
        playGoodEnding();
      } else {
        playBadEnding();
      }
    });
  });
}

// Switches between the prestige sub-subtabs (Tree / THE CHOICE).
function setActivePrestigeSubtab(subId, skipSave = false) {
  state.prestigeSubtab = subId === "choice" ? "choice" : "tree";
  document.querySelectorAll(".prestige-subtab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.prestigeSubtab === state.prestigeSubtab);
  });
  const treePanel = document.getElementById("prestigeTreeSub");
  const choicePanel = document.getElementById("prestigeChoiceSub");
  if (treePanel) treePanel.classList.toggle("hidden", state.prestigeSubtab !== "tree");
  if (choicePanel) choicePanel.classList.toggle("hidden", state.prestigeSubtab !== "choice");
  if (state.prestigeSubtab === "tree") {
    refreshPrestigeLayout();
  }
  if (!skipSave) {
    saveGame();
  }
}

function drawPrestigeConnectors() {
  if (!currentPrestigeStage || !currentPrestigePan) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const existing = currentPrestigePan.querySelector(".prestige-connectors");
  if (existing) existing.remove();

  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("prestige-connectors");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible;";

  const panRect = currentPrestigePan.getBoundingClientRect();
  // While the panel is display:none every rect measures as zero; skip rather
  // than park the lines at the origin until the next pan/zoom.
  if (!panRect.width || !panRect.height) return;
  const scale = prestigeZoom || 1;
  const nodeRadius = 32 * scale;

  // Build a map of upgrade id -> screen-center {x,y} from the rendered nodes.
  const nodePositions = {};
  currentPrestigeStage.querySelectorAll(".prestige-node").forEach((node) => {
    const id = node.dataset.prestigeId;
    if (!id) return;
    const r = node.getBoundingClientRect();
    nodePositions[id] = {
      x: r.left + r.width / 2 - panRect.left,
      y: r.top + r.height / 2 - panRect.top,
    };
  });

  // Draw a line from parent node edge to child node edge for each connection.
  prestigeCatalog.forEach((upgrade) => {
    const to = nodePositions[upgrade.id];
    if (!to) return;
    (upgrade.parents || []).forEach((pid) => {
      const from = nodePositions[pid];
      if (!from) return;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", from.x + nx * nodeRadius);
      line.setAttribute("y1", from.y + ny * nodeRadius);
      line.setAttribute("x2", to.x - nx * nodeRadius);
      line.setAttribute("y2", to.y - ny * nodeRadius);
      line.setAttribute("stroke", "rgba(100,160,220,0.35)");
      line.setAttribute("stroke-width", String(2 * scale));
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    });
  });

  currentPrestigePan.appendChild(svg);
}

function renderPrestigePanel() {
  const prestigeDisplay = elements.prestigeCurrencyDisplay;
  const prestigeTree = elements.prestigeTree;
  if (!prestigeDisplay || !prestigeTree) return;

  const prestigeLabel = getPrestigeCurrencyLabel();
  prestigeDisplay.textContent = `${formatEN(state.prestigePoints)} ${prestigeLabel}`;

  prestigeTree.innerHTML = `<div class="prestige-tree-pan"><div class="prestige-tree-stage"><div class="prestige-tree-bg"></div>${prestigeCatalog.map((upgrade) => {
    const cost = getPrestigeUpgradeCost(upgrade);
    const owned = state.prestigeUpgrades[upgrade.id] || 0;
    const maxLevel = upgrade.maxLevel || 1;
    const isMaxed = owned >= maxLevel;
    const affordable = state.prestigePoints.gte(cost);
    const unlocked = isPrestigeUpgradeUnlocked(upgrade);
    const disabled = isMaxed || !affordable || !unlocked;
    const locked = !unlocked && !owned;
    const position = upgrade.position || { row: 3, col: 3 };
    const tooltipBelow = position.row <= 2;

    // Build current / next effect text for the prestige tooltip.
    // If not maxed, show "Currently: X → Y" with Y in green.
    // If maxed, just "Currently: X".
    let currentEffect, nextEffect, showNext;
    if (upgrade.id === "limitBreaker") {
      currentEffect = owned > 0 ? "2x, uncapped" : "1x, capped";
      nextEffect = "2x, uncapped";
      showNext = !isMaxed;
    } else if (upgrade.id === "autoOptimize") {
      const label = getCurrencyLabel();
      const effectCount = owned === 0 ? 0 : Math.min(owned + 1, productionUpgradeOrder.length);
      const total = productionUpgradeOrder.length;
      const nextCount = Math.min(owned + 2, total);
      const currentName = effectCount > 0 ? getProductionUpgradeName(effectCount) : null;
      const nextName = nextCount <= total ? getProductionUpgradeName(nextCount) : null;
      if (effectCount === 0) {
        currentEffect = `no auto-buy`;
        nextEffect = nextName ? `auto-buys up to ${nextName}` : `auto-buys all ${total} upgrades`;
      } else if (effectCount >= total) {
        currentEffect = `auto-buys all ${total} upgrades`;
        nextEffect = null;
      } else {
        currentEffect = currentName ? `auto-buys up to ${currentName}` : `auto-buys first ${effectCount} upgrades`;
        nextEffect = nextName ? `auto-buys up to ${nextName}` : `auto-buys all ${total} upgrades`;
      }
      showNext = !isMaxed && nextEffect !== null;
    } else if (upgrade.id === "autoOverclock") {
      currentEffect = owned > 0 ? "auto-buys overclock upgrades when affordable" : "cannot auto-buy overclocks";
      nextEffect = "auto-buys overclock upgrades when affordable";
      showNext = !isMaxed;
    } else if (upgrade.id === "idleComfort") {
      currentEffect = owned > 0 ? "auto-buying upgrades will not spend currency" : "auto-buying upgrades spends currency";
      nextEffect = "auto-buying upgrades will not spend currency";
      showNext = !isMaxed;
    } else if (upgrade.id === "yieldSurge") {
      currentEffect = owned > 0 ? "Unlocked" : "Locked";
      nextEffect = "Unlocked";
      showNext = !isMaxed;
    } else if (upgrade.id === "keepUpgrades") {
      const total = productionUpgradeOrder.length;
      const kept = Math.min(owned + 1, total);
      const nextKept = Math.min(owned + 2, total);
      const currentName = getProductionUpgradeName(kept);
      const nextName = nextKept <= total ? getProductionUpgradeName(nextKept) : null;
      if (owned >= (upgrade.maxLevel || 1)) {
        currentEffect = `keeps all ${total} production upgrades`;
        nextEffect = null;
      } else if (owned === 0) {
        currentEffect = "no production upgrades kept";
        nextEffect = nextName ? `keeps up to ${nextName}` : `keeps all ${total} upgrades`;
      } else {
        currentEffect = currentName ? `keeps up to ${currentName}` : `keeps first ${kept} upgrades`;
        nextEffect = nextName ? `keeps up to ${nextName}` : `keeps all ${total} upgrades`;
      }
      showNext = !isMaxed && nextEffect !== null;
    } else if (upgrade.id === "keepOverclocks") {
      currentEffect = owned > 0 ? "Overclock levels kept on prestige" : "Overclock resets on prestige";
      nextEffect = "Overclock levels kept on prestige";
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyLink") {
      const lvl = state.upgrades.machine || 0;
      const mult = lvl > 0 ? `×(1 + ${lvl}) = ×${(1 + 1 * lvl).toFixed(1)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no actual repeats";
      nextEffect = `All production: ${lvl > 0 ? `×(1 + ${lvl}) = ×${(1 + 1 * lvl).toFixed(1)}` : "×1"}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyLoop") {
      const prodIds = ["starter", "machine", "machine2", "machine3", "turbo", "relay", "forge", "refinery", "network", "lattice", "reactor", "industry", "orbital", "galaxy", "singularity", "endgame", "epoch", "cosmos", "eclipse"];
      const distinct = prodIds.filter((id) => (state.upgrades[id] || 0) > 0).length;
      const mult = distinct > 0 ? `×(1 + 0.12×${distinct}) = ×${(1 + 0.12 * distinct).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no portfolio effect";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain3") {
      const lvl = state.upgrades.machine3 || 0;
      const mult = lvl > 0 ? `×1.05^${lvl} = ×${Math.pow(1.05, lvl).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no compounding resonance";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain4") {
      const lvl = state.upgrades.turbo || 0;
      const mult = `×(1 + log10(${lvl}+1)×3) = ×${(1 + Math.log10(lvl + 1) * 3).toFixed(2)}`;
      currentEffect = owned > 0 ? `All production: ${mult}` : "no velocity bleed";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain5") {
      const lvl = state.upgrades.relay || 0;
      const mult = lvl > 0 ? `×1.04^${lvl} = ×${Math.pow(1.04, lvl).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no signal cascade";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain6") {
      const resets = state.resets || 0;
      const mult = resets > 0 ? `×(1 + 0.1×${resets}) = ×${(1 + 0.1 * resets).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no phoenix forging";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain7") {
      const allIds = upgradeCatalog.map((u) => u.id);
      const totalOwned = allIds.reduce((s, id) => s + (state.upgrades[id] || 0), 0);
      const mult = totalOwned > 0 ? `×(1 + 0.02×${totalOwned}) = ×${(1 + 0.02 * totalOwned).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no scale economy";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain8") {
      const lvl = state.upgrades.network || 0;
      const mult = lvl > 0 ? `×1.07^${lvl} = ×${Math.pow(1.07, lvl).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no critical mass";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain9") {
      const tm = state.totalMade || new ExpantaNum(0);
      const logBonus = Math.log(tm.div(1e6).add(1).toNumber());
      const mult = `×(1 + ln(${formatEN(tm)}/1e6+1))`;
      currentEffect = owned > 0 ? `All production: ${mult}` : "no lattice osmosis";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain10") {
      const lvl = state.upgrades.reactor || 0;
      const mult = lvl > 0 ? `×1.08^${lvl} = ×${Math.pow(1.08, lvl).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no reactor bloom";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain11") {
      const pp = state.prestigePoints || new ExpantaNum(0);
      const mult = `×(1 + ln(${formatEN(pp)}+1)/2)`;
      currentEffect = owned > 0 ? `All production: ${mult}` : "no capital injection";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain12") {
      const elapsed = Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 1000);
      const mult = `×(1 + ln(${Math.floor(elapsed)}s+1)/4)`;
      currentEffect = owned > 0 ? `All production: ${mult}` : "no orbital decay";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain13") {
      const pc = Object.values(state.prestigeUpgrades || {}).filter((v) => (v || 0) > 0).length;
      const mult = pc > 0 ? `×(1 + 0.2×${pc}) = ×${(1 + 0.2 * pc).toFixed(1)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no constellation map";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain14") {
      const lvl = state.upgrades.singularity || 0;
      const mult = lvl > 0 ? `×(1 + 0.0005×${lvl}) = ×${(1 + 0.0005 * lvl).toFixed(3)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no event horizon";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain15") {
      const resets = state.resets || 0;
      const mult = resets > 0 ? `×(1 + 0.15×${resets}) = ×${(1 + 0.15 * resets).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no echo chamber";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain16") {
      const mins = Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 60000);
      const mult = `×(1 + ln(${Math.floor(mins)}m+1))`;
      currentEffect = owned > 0 ? `All production: ${mult}` : "no chrono leak";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain17") {
      const allIds = upgradeCatalog.map((u) => u.id);
      const totalOwned = allIds.reduce((s, id) => s + (state.upgrades[id] || 0), 0);
      const mult = totalOwned > 0 ? `×1.01^${totalOwned} = ×${Math.pow(1.01, totalOwned).toFixed(2)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no dark energy";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else if (upgrade.id === "synergyChain18") {
      const lvl = state.upgrades.eclipse || 0;
      const mult = lvl > 0 ? `×(1 + 0.5×${lvl}) = ×${(1 + 0.5 * lvl).toFixed(1)}` : "×1";
      currentEffect = owned > 0 ? `All production: ${mult}` : "no eclipse synergy";
      nextEffect = `All production: ${mult}`;
      showNext = !isMaxed;
    } else {
      currentEffect = owned > 0 ? upgrade.effect : "no effect";
      nextEffect = upgrade.effect;
      showNext = !isMaxed && owned === 0;
    }

    let effectHTML;
    if (showNext) {
      effectHTML = `<span>Currently: ${escapeHTML(currentEffect)} &rarr; </span><span style="color:#4f4">${escapeHTML(nextEffect)}</span>`;
    } else {
      effectHTML = `<span>Currently: ${escapeHTML(currentEffect)}</span>`;
    }

    const levelDisplay = maxLevel > 1
      ? `<span class="prestige-node-level">${isMaxed ? "MAX" : `Lv ${owned}/${maxLevel}`}</span>`
      : "";

    return `
      <div
        class="prestige-node-wrap ${owned ? "owned" : ""}"
        style="grid-row: ${position.row}; grid-column: ${position.col};"
      >
        <button
          class="prestige-node ${owned ? "owned" : ""} ${disabled ? "disabled" : ""} ${locked ? "locked" : ""} ${tooltipBelow ? "tooltip-below" : ""}"
          type="button"
          data-prestige-id="${upgrade.id}"
          aria-label="${escapeHTML(upgrade.name)}: ${escapeHTML(upgrade.effect)}"
        >
          <span class="prestige-node-icon">${upgrade.icon}</span>
          ${levelDisplay}
          <span class="prestige-node-hover">
            <strong>${escapeHTML(upgrade.name)}</strong>
            <span>${escapeHTML(typeof upgrade.description === "function" ? upgrade.description() : upgrade.description)}</span>
            ${effectHTML}
            <em>${escapeHTML(upgrade.flavor)}</em>
            <span>Cost: ${isMaxed ? "Maxed" : `${formatEN(cost)} ${escapeHTML(prestigeLabel)}`}</span>
          </span>
        </button>
      </div>
    `;
  }).join("")}</div><div class="prestige-path-label" id="pl-prestige">&#x2191; PRESTIGE PATH</div><div class="prestige-path-label" id="pl-points">&#x2192; POINTS PATH</div><div class="prestige-path-label" id="pl-synergy">&#x2193; SYNERGY PATH</div><div class="prestige-path-label" id="pl-qol">&#x2190; QoL PATH</div></div></div>`;

  currentPrestigePan = prestigeTree.querySelector(".prestige-tree-pan");
  currentPrestigeStage = prestigeTree.querySelector(".prestige-tree-stage");
  positionPrestigeBg();
  applyPrestigeTransform();
  drawPrestigeConnectors();
  updatePrestigeLabels();

  prestigeTree.querySelectorAll(".prestige-node").forEach((button) => {
    button.addEventListener("click", () => {
      if (prestigeDragMoved) {
        prestigeDragMoved = false;
        return;
      }
      const id = button.dataset.prestigeId;
      purchasePrestigeUpgrade(id);
    });
  });
}

// Centers the diagonal-split background square on the Limit Breaker node so
// each path's triangle lines up with its nodes. Runs after the tree renders;
// the square lives inside the stage so it pans/zooms with the tree.
function positionPrestigeBg() {
  const stage = currentPrestigeStage;
  const bg = stage?.querySelector(".prestige-tree-bg");
  const lb = stage?.querySelector('[data-prestige-id="limitBreaker"]');
  if (!stage || !bg || !lb) return;
  const stageRect = stage.getBoundingClientRect();
  const lbRect = lb.getBoundingClientRect();
  // While the panel is display:none every rect measures as zero; skip rather
  // than park the square at the origin until the next render.
  if (!stageRect.width || !stageRect.height || !lbRect.width || !lbRect.height) return;
  const size = bg.offsetWidth;
  bg.style.left = `${lbRect.left + lbRect.width / 2 - stageRect.left - size / 2}px`;
  bg.style.top = `${lbRect.top + lbRect.height / 2 - stageRect.top - size / 2}px`;
}

// Positions the path-label decorations around Limit Breaker so they pan and
// zoom together with the tree.  Called from applyPrestigeTransform().
function updatePrestigeLabels() {
  if (!currentPrestigePan) return;
  const lb = currentPrestigeStage?.querySelector('[data-prestige-id="limitBreaker"]');
  if (!lb) return;
  // Use the same coordinate system as drawPrestigeConnectors: positions
  // relative to the pan's current screen rect (which includes its transform).
  const panRect = currentPrestigePan.getBoundingClientRect();
  const lbRect = lb.getBoundingClientRect();
  // Zero rects mean the panel is currently hidden (display:none); measuring
  // now would place every label at the top-left corner, so wait until the
  // panel is shown (refreshPrestigeLayout handles that).
  if (!panRect.width || !lbRect.width) return;
  const cx = lbRect.left + lbRect.width / 2 - panRect.left;
  const cy = lbRect.top + lbRect.height / 2 - panRect.top;
  const s = prestigeZoom || 1;

  const map = {
    "pl-prestige": { dx: 48, dy: -65 },
    "pl-points":   { dx: 48, dy: 65 },
    "pl-synergy":  { dx: -48, dy: 65 },
    "pl-qol":      { dx: -48, dy: -65 },
  };
  for (const [id, { dx, dy }] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.left = `${cx + dx * s}px`;
    el.style.top = `${cy + dy * s}px`;
    el.style.fontSize = `${0.6 * s}rem`;
  }
}

// Applies the current pan/zoom view to the prestige tree. Pan is a plain
// translate (crisp); zoom scales the nodes' layout size via --tree-scale so
// the browser re-renders text at the target size instead of stretching a
// rasterized layer (which is what made text look fuzzy).
function applyPrestigeTransform() {
  if (currentPrestigePan) {
    currentPrestigePan.style.transform =
      `translate(${prestigePanX}px, ${prestigePanY}px)`;
  }
  if (currentPrestigeStage) {
    currentPrestigeStage.style.setProperty("--tree-scale", prestigeZoom);
    // Hide the level badges when zoomed out far enough that they're unreadable.
    currentPrestigeStage.classList.toggle("zoomed-out", prestigeZoom < 0.6);
  }
  // Keep the background square centered on the Limit Breaker node, since zoom
  // resizes the grid tracks and moves the nodes relative to the stage.
  positionPrestigeBg();
  // Redraw connector lines so they stay aligned after pan/zoom.
  drawPrestigeConnectors();
  updatePrestigeLabels();
}

// Zooms the tree by `factor`, keeping the viewport center fixed.
function zoomPrestigeTree(factor) {
  const tree = elements.prestigeTree;
  if (!tree) return;
  const rect = tree.getBoundingClientRect();
  zoomPrestigeAround(rect.width / 2, rect.height / 2, factor);
}

// Zooms around a point in the tree's viewport coordinates, keeping the
// content under that point fixed. The grid is centered in the stage, so the
// scaling anchor is the viewport center, and the pan compensates accordingly.
function zoomPrestigeAround(anchorX, anchorY, factor) {
  const tree = elements.prestigeTree;
  if (!tree) return;
  const rect = tree.getBoundingClientRect();
  const newZoom = Math.min(3, Math.max(0.25, prestigeZoom * factor));
  const applied = newZoom / prestigeZoom;
  const ax = anchorX - rect.width / 2;
  const ay = anchorY - rect.height / 2;
  prestigePanX = ax - (ax - prestigePanX) * applied;
  prestigePanY = ay - (ay - prestigePanY) * applied;
  prestigeZoom = newZoom;
  applyPrestigeTransform();
}

// Centers the prestige tree view on the Limit Breaker node (or resets to
// default if the node isn't found).
function resetPrestigeView() {
  prestigeZoom = 1;
  const tree = elements.prestigeTree;
  const stage = currentPrestigeStage;
  const lb = stage?.querySelector('[data-prestige-id="limitBreaker"]');
  if (tree && stage && lb) {
    const treeRect = tree.getBoundingClientRect();
    const lbRect = lb.getBoundingClientRect();
    const panRect = currentPrestigePan?.getBoundingClientRect() || stage.getBoundingClientRect();
    // LB center relative to the pan element, then translate so it lands at viewport center.
    const lbCx = lbRect.left + lbRect.width / 2 - panRect.left;
    const lbCy = lbRect.top + lbRect.height / 2 - panRect.top;
    prestigePanX = treeRect.width / 2 - lbCx;
    prestigePanY = treeRect.height / 2 - lbCy;
  } else {
    prestigePanX = 0;
    prestigePanY = 0;
  }
  applyPrestigeTransform();
}

// Wires up panning (drag / touch) and zooming (wheel / buttons) for the tree.
function setupPrestigeTreeControls() {
  const tree = elements.prestigeTree;
  if (!tree) return;

  // Mouse wheel zooms in/out, keeping the point under the cursor fixed.
  tree.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = tree.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomPrestigeAround(anchorX, anchorY, factor);
  }, { passive: false });

  // Drag with the mouse to pan the tree.
  tree.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    prestigeDragMoved = false;
    prestigeTreeDrag = {
      startX: event.clientX,
      startY: event.clientY,
      panStartX: prestigePanX,
      panStartY: prestigePanY,
      moved: false,
    };
    tree.classList.add("grabbing");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!prestigeTreeDrag) return;
    const dx = event.clientX - prestigeTreeDrag.startX;
    const dy = event.clientY - prestigeTreeDrag.startY;
    if (!prestigeTreeDrag.moved && Math.hypot(dx, dy) > 5) {
      prestigeTreeDrag.moved = true;
    }
    if (prestigeTreeDrag.moved) {
      prestigeDragMoved = true;
      prestigePanX = prestigeTreeDrag.panStartX + dx;
      prestigePanY = prestigeTreeDrag.panStartY + dy;
      applyPrestigeTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    if (!prestigeTreeDrag) return;
    tree.classList.remove("grabbing");
    prestigeTreeDrag = null;
  });

  // Single-finger touch drag pans; the buttons handle zoom on touch devices.
  tree.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    prestigeTreeDrag = {
      startX: touch.clientX,
      startY: touch.clientY,
      panStartX: prestigePanX,
      panStartY: prestigePanY,
      moved: false,
    };
  }, { passive: true });

  tree.addEventListener("touchmove", (event) => {
    if (!prestigeTreeDrag || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - prestigeTreeDrag.startX;
    const dy = touch.clientY - prestigeTreeDrag.startY;
    if (!prestigeTreeDrag.moved && Math.hypot(dx, dy) > 5) {
      prestigeTreeDrag.moved = true;
    }
    if (prestigeTreeDrag.moved) {
      prestigeDragMoved = true;
      prestigePanX = prestigeTreeDrag.panStartX + dx;
      prestigePanY = prestigeTreeDrag.panStartY + dy;
      applyPrestigeTransform();
      event.preventDefault();
    }
  }, { passive: false });

  tree.addEventListener("touchend", () => {
    prestigeTreeDrag = null;
  });

  // Zoom controls in the corner of the tree.
  const zoomIn = document.getElementById("prestigeZoomIn");
  const zoomOut = document.getElementById("prestigeZoomOut");
  const zoomReset = document.getElementById("prestigeZoomReset");
  if (zoomIn) zoomIn.addEventListener("click", () => zoomPrestigeTree(1.25));
  if (zoomOut) zoomOut.addEventListener("click", () => zoomPrestigeTree(1 / 1.25));
  if (zoomReset) zoomReset.addEventListener("click", resetPrestigeView);

  // Automation toggle: appears once autoOptimize is purchased.
  if (elements.automationToggleButton) {
    elements.automationToggleButton.addEventListener("click", () => {
      state.automationEnabled = !state.automationEnabled;
      updateAutomationToggle();
      saveGame();
    });
  }
  if (elements.automationToggleButtonMain) {
    elements.automationToggleButtonMain.addEventListener("click", () => {
      state.automationEnabled = !state.automationEnabled;
      updateAutomationToggle();
      saveGame();
    });
  }
}

const blogEntries = [
  {
    title: "Preface",
    body: "Welcome to the blog. This is where I ramble about stuff in a completely professional way. You can read these entries one at a time as you play or just read the whole thing in one go. I won't judge."
  }, 
  {
    title: "Entry 1 - 13/8/26",
    body: `it's me, the developer. god this ai is so annoying to work with.
    it's like i'm tweedle dee and it's tweedle dumb. but also wow this is like the philosopher's stone for coding.
    if it was bad but still. 
    i can just ask it to do stuff and it does. is it good? no. do i feel fulfilled?<br>
    <i>that's a good question.</i>`
  },
  {
    title: "Entry 2 - 15/8/26",
    body: `I'm already bored omegalul.
    I see how people develop a reliance to this technology. It does all of this stuff and then you end up not knowing
    how any of it works. Unless you go through it properly, but the kind of people who use AI to code probably aren't
    gonna do that.
    Tired of the looming limitations, I decided to use a new model. It's free and seemingly unlimited so why not?<br>
    Hopefully I don't go mad with power using it...`
  },
  {
    title: "Entry 3 - 16/8/26",
    body: `I have already accepted that should the public know about this endeavour I would be subject to high scrutiny.
    Out of all the uses of AI this seems to be the least harmful (I say that instead of most harmless).
    There is something called proof of work. Using AI to code makes it hard to show that you've actually worked hard on anything.
    I don't doubt that. It takes far less effort to ask the machine to make what you want than to write the code by hand.
    Some people say it's a tool. I agree to some extent. It's a tool if you use it like a tool, but most won't use it as a
    tool but rather as a cheatcode. There have been other tools used to make incremental games like Idle Game Maker. You still
    had to actually write all the functionality yourself I believe. But with this? It's more of a declarative style rather than
    an imperative style.`
  },
  {
    title: "Entry 4 - also 16/8/26",
    body: `<i>Am I learning anything from this?</i><br>That's a good question. I'm gonna say no. What am I doing except just typing prompts to the AI? Absolutely nothing.
    When people manually write code for their projects they actually learn something, even if the end result isn't favourable. But this? This is just mindless slop. This is all it
    will ever be. I will say I do have human intentions for this project. I want it to be a lesson, a warning, that using this technology will just result in mediocrity like this
    project. It's even worse that AI has so many detrimental effects. People stop learning, malice leads to slop flooding lots of parts of the world. One could say I am contributing to this.`
  },
  {
    title: "Entry 5 - 17/8/26",
    body: `this was a bad idea this was a horrible idea none of this looks good it's like slop. but i feel compelled to keep working on it? why? it doesn't feel good. but i must see
    this through to the end because that's what my brain does`
  },
  {
    title: "Entry 6 - 27/8/26",
    body: `I stopped working on this for a long time.<br>
    rip big pickle btw i can't use it anymore. now i'm gonna use a different thing`
  },
];


// Renders the blog tab from the local static blog entry array.
function renderBlog() {
  if (!elements.blogList) return;

  elements.blogList.innerHTML = blogEntries
    .map((entry) => `
      <article class="blog-entry">
        <h3>${entry.title}</h3>
        <p>${entry.body}</p>
      </article>
    `)
    .join("");
}

// Builds the shop UI from the upgrade catalog.
// This is where item labels, costs, current effects, button states, and tooltip text are generated.
function renderUpgradeList() {
  document.querySelectorAll(".upgrade-tooltip").forEach((tooltip) => {
    if (!tooltip.closest(".upgrade-item")) {
      tooltip.classList.remove("visible");
      tooltip.remove();
    }
  });

  const currencyLabel = getCurrencyLabel();
  // Escaped copy for anything that ends up inside innerHTML below.
  const escCurrencyLabel = escapeHTML(currencyLabel);
  const sections = [
    { key: "production", label: "Production" },
    { key: "overclock", label: "Overclock" },
    { key: "cosmetics", label: "Cosmetics" },
  ];

  const scrollState = {};
  if (elements.upgradeList) {
    elements.upgradeList.querySelectorAll(".upgrade-section").forEach((section) => {
      const key = section.dataset.sectionKey;
      if (key) {
        const scroller = section.querySelector(".upgrade-items");
        scrollState[key] = scroller ? scroller.scrollTop : 0;
      }
    });
  }

  const overclockUnlocked = state.overclockUnlocked || (state.upgrades.multiplier || 0) > 0 || (state.upgrades.superOverclock || 0) > 0;

  const sectionVisible = {
    production: true,
    overclock: overclockUnlocked,
    cosmetics: overclockUnlocked,
  };

  elements.upgradeList.innerHTML = sections
    .map((section) => {
      const sectionUpgrades = upgradeCatalog.filter((upgrade) => upgrade.section === section.key);
      if (!sectionUpgrades.length || !sectionVisible[section.key]) return "";

      const visibleUpgrades = sectionUpgrades.filter((upgrade, index) => {
        if (upgrade.visibleWhen) return upgrade.visibleWhen();
        if (index === 0) return true;
        const previousUpgrade = sectionUpgrades[index - 1];
        return (state.upgrades[previousUpgrade.id] || 0) > 0;
      });

      if (!visibleUpgrades.length) return "";

      return `
        <div class="upgrade-section" data-section-key="${section.key}">
          <div class="upgrade-section-head"><h3>${section.label}</h3></div>
          <div class="upgrade-items">
          ${visibleUpgrades.map((upgrade) => {
            const owned = state.upgrades[upgrade.id] || 0;
            const cost = getUpgradeCost(upgrade);
            const isMaxed = owned >= upgrade.maxLevel;
            const isAffordable = upgrade.currency === "prestige"
              ? state.prestigePoints.gte(cost)
              : state.points.gte(cost);
            const maxPurchaseInfo = upgrade.maxLevel > 1 ? getMaxAffordableUpgradeInfo(upgrade) : { count: 0, totalCost: asEN(0) };
            const shouldShowOwned = owned > 0 && upgrade.maxLevel !== 1;
            const displayName = (() => {
              if (upgrade.id === "starter") return upgrade.name;
              if (upgrade.id === "refinery") {
                const label = (currencyLabel || "point").trim();
                return `${escapeHTML(label)} refinery${shouldShowOwned ? ` x${owned}` : ""}`;
              }
              return `${upgrade.name}${shouldShowOwned ? ` x${owned}` : ""}`;
            })();
            const upgradeCurrencyLabel = upgrade.currency === "prestige"
              ? escapeHTML(getPrestigeCurrencyLabel())
              : escCurrencyLabel;
            const descriptionText = upgrade.type === "multiplier"
              ? `Multiplies all ${escCurrencyLabel} gain by ${upgrade.multiplierValue || 1.2}x after additive bonuses`
              : upgrade.description.replace(/\bpoints?\b/gi, escCurrencyLabel);

            let currentEffect = "";
            if (owned === 0) {
              currentEffect = "";
            } else if (upgrade.type === "auto") {
              const total = asEN(upgrade.value, 0).mul(owned || 1);
              currentEffect = `Currently: +${formatEN(total)} ${escCurrencyLabel}/s`;
            } else if (upgrade.type === "multiplier") {
              const mVal = upgrade.multiplierValue || 1.2;
              const currentMultiplier = new ExpantaNum(mVal).pow(owned || 0);
              const multiplierNumber = Number(currentMultiplier.toString());
              const multiplierDisplay = multiplierNumber >= 1000 ? formatEN(currentMultiplier) : multiplierNumber.toFixed(2);
              currentEffect = `Currently: x${multiplierDisplay}`;
            } else if (upgrade.id === "rename") {
              currentEffect = "Currently: custom naming enabled";
            } else if (upgrade.id === "theme") {
              currentEffect = "Currently: background tint enabled";
            } else {
              currentEffect = "Currently: unlocked";
            }

            const tooltipText = upgrade.id === "starter" && owned > 0
              ? "was it worth it?"
              : (upgrade.tooltip || "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.");

            const buyMaxLabel = upgrade.maxLevel > 1
              ? (maxPurchaseInfo.count > 0 ? `Buy max (${maxPurchaseInfo.count}) • ${formatEN(maxPurchaseInfo.totalCost)} ${upgradeCurrencyLabel}` : "Buy max")
              : "";

            const prestigeClass = upgrade.currency === "prestige" ? " prestige-upgrade" : "";
            const scaledClass = isScaled(upgrade) && upgrade.maxLevel > 1 && upgrade.id !== "starter" && upgrade.currency !== "prestige" ? " scaled" : "";

            return `
              <div class="upgrade-item tooltip-trigger${prestigeClass}${scaledClass}" data-upgrade-id="${upgrade.id}">
                <div class="upgrade-copy">
                  <h3>${displayName}</h3>
                  <p>${descriptionText}</p>
                  ${currentEffect ? `<p class="upgrade-current-effect">${currentEffect}</p>` : ""}
                </div>
                <div class="upgrade-actions">
                  <button class="buy-button" data-upgrade-id="${upgrade.id}" ${isMaxed || !isAffordable ? "disabled" : ""}>
                    ${isMaxed ? "Bought" : `${formatEN(cost)} ${upgradeCurrencyLabel}`}
                  </button>
                  ${upgrade.maxLevel > 1 ? `<button class="buy-max-button" data-upgrade-id="${upgrade.id}" ${isMaxed || maxPurchaseInfo.count === 0 ? "disabled" : ""}>${buyMaxLabel}</button>` : ""}
                </div>
                <div class="upgrade-tooltip" role="tooltip">
                  <span>${tooltipText}</span>
                </div>
              </div>
            `;
          }).join("")}
          </div>
        </div>
      `;
    })
    .join("");

  elements.upgradeList.querySelectorAll(".upgrade-section").forEach((section) => {
    const key = section.dataset.sectionKey;
    if (key && typeof scrollState[key] === "number") {
      const scroller = section.querySelector(".upgrade-items");
      if (scroller) scroller.scrollTop = scrollState[key];
    }
  });

  elements.upgradeList.querySelectorAll(".buy-button").forEach((button) => {
    button.type = "button";
    button.addEventListener("click", () => {
      const id = button.dataset.upgradeId;
      if (id) purchaseUpgrade(id);
    });
  });

  elements.upgradeList.querySelectorAll(".buy-max-button").forEach((button) => {
    button.type = "button";
    button.addEventListener("click", () => {
      const id = button.dataset.upgradeId;
      if (id) purchaseMaxUpgrade(id);
    });
  });

  elements.upgradeList.querySelectorAll(".tooltip-trigger").forEach((item) => {
    const tooltip = item.querySelector(".upgrade-tooltip");
    if (!tooltip) return;

    document.body.appendChild(tooltip);

    const positionTooltip = () => {
      const rect = item.getBoundingClientRect();
      tooltip.style.left = `${rect.right + 12}px`;
      tooltip.style.top = `${rect.top - 8}px`;
    };

    item.addEventListener("mouseenter", () => {
      positionTooltip();
      tooltip.classList.add("visible");
    });

    item.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });

    item.addEventListener("focusin", () => {
      positionTooltip();
      tooltip.classList.add("visible");
    });

    item.addEventListener("focusout", () => {
      tooltip.classList.remove("visible");
    });
  });
}

// Refreshes the text and enabled state of purchase buttons after the state changes.
function refreshUpgradeButtonState() {
  if (!elements.upgradeList) return;

  const currencyLabel = getCurrencyLabel();
  elements.upgradeList.querySelectorAll(".upgrade-item").forEach((item) => {
    const upgrade = upgradeCatalog.find((entry) => entry.id === item.dataset.upgradeId);
    if (!upgrade) return;

    const owned = state.upgrades[upgrade.id] || 0;
    const shouldShowOwned = owned > 0 && upgrade.maxLevel !== 1;
    const name = upgrade.id === "starter"
      ? upgrade.name
      : upgrade.id === "refinery"
        ? `${currencyLabel.trim() || "point"} refinery`
        : upgrade.name;
    const nameElement = item.querySelector(".upgrade-copy h3");
    if (nameElement) {
      nameElement.textContent = `${name}${shouldShowOwned ? ` x${owned}` : ""}`;
    }

    // Toggle the "scaled" class for visual styling.
    const scaledActive = isScaled(upgrade) && upgrade.maxLevel > 1 && upgrade.id !== "starter" && upgrade.currency !== "prestige";
    item.classList.toggle("scaled", scaledActive);

    const effectElement = item.querySelector(".upgrade-current-effect");
    let effectText = "";
    if (owned > 0 && upgrade.type === "auto") {
      effectText = `Currently: +${formatEN(asEN(upgrade.value, 0).mul(owned))} ${currencyLabel}/s`;
    } else if (owned > 0 && upgrade.type === "multiplier") {
      const currentMultiplier = new ExpantaNum(upgrade.multiplierValue || 1.2).pow(owned);
      const multiplierNumber = Number(currentMultiplier.toString());
      const multiplierDisplay = multiplierNumber >= 1000 ? formatEN(currentMultiplier) : multiplierNumber.toFixed(2);
      effectText = `Currently: x${multiplierDisplay}`;
    } else if (owned > 0 && upgrade.id === "rename") {
      effectText = "Currently: custom naming enabled";
    } else if (owned > 0 && upgrade.id === "theme") {
      effectText = "Currently: background tint enabled";
    } else if (owned > 0) {
      effectText = "Currently: unlocked";
    }

    if (effectText) {
      if (effectElement) {
        effectElement.textContent = effectText;
      } else {
        const newEffect = document.createElement("p");
        newEffect.className = "upgrade-current-effect";
        newEffect.textContent = effectText;
        item.querySelector(".upgrade-copy")?.appendChild(newEffect);
      }
    } else {
      effectElement?.remove();
    }
  });

  elements.upgradeList.querySelectorAll(".buy-button").forEach((button) => {
    const id = button.dataset.upgradeId;
    const upgrade = upgradeCatalog.find((entry) => entry.id === id);
    if (!upgrade) return;

    const owned = state.upgrades[id] || 0;
    const cost = getUpgradeCost(upgrade);
    const isMaxed = owned >= getUpgradeMaxLevel(upgrade);
    const usesPrestige = upgrade.currency === "prestige";
    const btnCurrency = usesPrestige ? getPrestigeCurrencyLabel() : currencyLabel;
    const wallet = usesPrestige ? state.prestigePoints : state.points;
    const isAffordable = wallet.gte(cost);
    button.disabled = isMaxed || !isAffordable;
    button.textContent = isMaxed ? "Bought" : `${formatEN(cost)} ${btnCurrency}`;
  });

  elements.upgradeList.querySelectorAll(".buy-max-button").forEach((button) => {
    const id = button.dataset.upgradeId;
    const upgrade = upgradeCatalog.find((entry) => entry.id === id);
    if (!upgrade || upgrade.maxLevel <= 1) return;

    const maxInfo = getMaxAffordableUpgradeInfo(upgrade);
    const isMaxed = (state.upgrades[id] || 0) >= getUpgradeMaxLevel(upgrade);
    const usesPrestige = upgrade.currency === "prestige";
    const btnCurrency = usesPrestige ? getPrestigeCurrencyLabel() : currencyLabel;
    button.disabled = isMaxed || maxInfo.count === 0;
    button.textContent = isMaxed ? "Buy max" : maxInfo.count > 0 ? `Buy max (${maxInfo.count}) \u2022 ${formatEN(maxInfo.totalCost)} ${btnCurrency}` : "Buy max";
  });
}

// ---------------------------------------------------------------------------
// Lights Out minigame. Winning a round banks a few seconds of current
// production (10s on 3×3, 30s on 5×5, 2m on 7×7).
// ---------------------------------------------------------------------------
const LIGHTS_REWARDS = { 3: 10, 5: 30, 7: 120 }; // seconds of production per win

// Prestige unlocks at 10Qa (1e16 in this game's notation), or permanently after the first reset.
const PRESTIGE_UNLOCK = new ExpantaNum("1e16");

// Returns the effective prestige threshold, reduced by the prestigeThresholdReduction node.
function getEffectivePrestigeUnlock() {
  let threshold = PRESTIGE_UNLOCK;
  const reductionLevel = state.prestigeUpgrades?.prestigeThresholdReduction || 0;
  if (reductionLevel > 0) {
    // Divides threshold by (1 + level). Level 1 = ÷2, Level 2 = ÷3, etc.
    threshold = threshold.div(new ExpantaNum(1).add(reductionLevel));
  }
  return threshold;
}

function getDefaultPrestigeUpgrades() {
  const defaults = prestigeCatalog.reduce((accumulator, upgrade) => {
    accumulator[upgrade.id] = 0;
    return accumulator;
  }, {});
  // The THE CHOICE upgrades live outside the tree but are still prestige
  // upgrades, so they get a slot in the save.
  choiceUpgrades.forEach((choice) => {
    defaults[choice.id] = 0;
  });
  return defaults;
}

const lights = {
  size: 3,
  board: [],
  moves: 0,
  won: false,
};

// Flips a cell and its orthogonal neighbours (the Lights Out press rule).
function flipLightsCell(board, size, r, c) {
  const neighbours = [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  for (const [nr, nc] of neighbours) {
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      board[nr][nc] = !board[nr][nc];
    }
  }
}

// Generates a random board by pressing random cells from the solved state.
// Starting from all-off guarantees the puzzle always has a solution.
function createLightsBoard(size) {
  const board = Array.from({ length: size }, () => Array(size).fill(false));
  for (let i = 0; i < size * size * 3; i++) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    flipLightsCell(board, size, r, c);
  }
  return board;
}

function isLightsSolved(board) {
  return board.every((row) => row.every((cell) => !cell));
}

// Rebuilds the board grid from the current lights state.
function renderLightsBoard() {
  const boardEl = document.getElementById("lightsBoard");
  if (!boardEl) return;

  boardEl.dataset.size = String(lights.size);
  boardEl.innerHTML = "";

  for (let r = 0; r < lights.size; r++) {
    for (let c = 0; c < lights.size; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "lights-cell" + (lights.board[r][c] ? " on" : "");
      cell.setAttribute("aria-label", `Light ${r + 1}, ${c + 1} ${lights.board[r][c] ? "on" : "off"}`);
      cell.addEventListener("click", () => lightsCellPressed(r, c));
      boardEl.appendChild(cell);
    }
  }

  const movesEl = document.getElementById("lightsMoves");
  if (movesEl) movesEl.textContent = `Moves: ${lights.moves}`;
}

// Starts a fresh Lights Out puzzle at the given grid size.
function startLightsGame(size) {
  lights.size = size;
  lights.board = createLightsBoard(size);
  lights.moves = 0;
  lights.won = false;

  document.querySelectorAll(".size-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.size) === size);
  });

  const message = document.getElementById("lightsMessage");
  if (message) message.textContent = "";

  renderLightsBoard();
}

function lightsCellPressed(r, c) {
  if (lights.won) return;

  flipLightsCell(lights.board, lights.size, r, c);
  lights.moves += 1;
  renderLightsBoard();

  if (isLightsSolved(lights.board)) {
    lights.won = true;
    grantLightsReward();
  }
}

// Banks the win reward: current production rate × the size's second payout.
function grantLightsReward() {
  const seconds = LIGHTS_REWARDS[lights.size] || 0;
  const reward = getEffectiveAutoPoints().mul(seconds);
  addPoints(reward);
  renderStats();

  const message = document.getElementById("lightsMessage");
  if (message) {
    message.textContent = reward.gt(0)
      ? `Lights out! +${formatEN(reward)} ${getCurrencyLabel()} (${seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm' + (seconds % 60 ? ' ' + seconds % 60 + 's' : '')} of production)`
      : "Lights out! (no production yet, so nothing to bank)";
  }
}

// Updates the autosave slider label and stores the selected interval in state.
function renderAutosave() {
  const value = Number(elements.autosaveSlider.value);
  state.autoSaveInterval = value;
  elements.autosaveValue.textContent = `${value}s`;
}

// Keeps the ticker speed slider and its label in sync with the saved state.
function renderTickerSpeed() {
  const speed = Number.isFinite(state.tickerSpeed) ? state.tickerSpeed : 60;
  const clamped = Math.min(200, Math.max(10, Math.round(speed)));
  if (elements.tickerSpeedSlider) {
    elements.tickerSpeedSlider.value = String(clamped);
  }
  if (elements.tickerSpeedValue) {
    elements.tickerSpeedValue.textContent = `${clamped} px/s`;
  }
}

// Keeps the tick rate slider and its label in sync with the saved state.
function renderTickRate() {
  const rate = Number.isFinite(state.tickRate) ? state.tickRate : 10;
  const clamped = Math.min(100, Math.max(5, Math.round(rate)));
  if (elements.tickRateSlider) {
    elements.tickRateSlider.value = String(clamped);
  }
  if (elements.tickRateValue) {
    elements.tickRateValue.textContent = `${clamped} /s`;
  }
}

function renderTickerVisibility() {
  const visible = state.tickerVisible !== false;

  if (elements.ticker) {
    elements.ticker.classList.toggle("hidden", !visible);
  }

  if (elements.tickerToggleButton) {
    elements.tickerToggleButton.textContent = visible ? "Hide ticker" : "Show ticker";
  }
}

// The prestige-confirmation toggle appears once the player has prestiged at
// least once (before that there is nothing to confirm).
function renderPrestigeConfirmToggle() {
  const hasPrestiged = (state.resets || 0) >= 1;
  if (elements.prestigeConfirmSetting) {
    elements.prestigeConfirmSetting.classList.toggle("hidden", !hasPrestiged);
  }
  if (elements.prestigeConfirmButton) {
    const enabled = state.confirmPrestige !== false;
    elements.prestigeConfirmButton.textContent = enabled ? "On" : "Off";
    elements.prestigeConfirmButton.classList.toggle("active-toggle", enabled);
  }
}

// Advances the news ticker. The current message slides left; only after it has
// fully left the screen does the next message enter from the right edge.
function updateTicker(delta) {
  const message = elements.tickerMessage;
  const viewport = elements.tickerViewport;
  if (!message || !viewport || tickerMessages.length === 0 || state.tickerVisible === false) return;

  const speed = Number.isFinite(state.tickerSpeed) ? state.tickerSpeed : 60;
  const viewportWidth = viewport.clientWidth;

  if (!tickerReady) {
    tickerX = viewportWidth;
    tickerReady = true;
  }

  tickerX -= speed * delta;
  message.style.transform = `translateX(${tickerX}px)`;

  if (message.offsetWidth > 0 && tickerX <= -message.offsetWidth) {
    tickerIndex = getRandomTickerIndex(tickerIndex);
    message.textContent = tickerMessages[tickerIndex];
    tickerX = viewportWidth;
    message.style.transform = `translateX(${tickerX}px)`;
  }
}

// Keeps the music volume slider, display text, and actual audio element in sync.
function syncMusicControls() {
  const volume = Number.isFinite(state.musicVolume) ? state.musicVolume : 0.4;
  const sliderValue = Math.min(100, Math.max(0, Math.round(volume * 100)));
  if (elements.musicVolumeSlider) {
    elements.musicVolumeSlider.value = String(sliderValue);
  }
  if (elements.musicVolumeValue) {
    elements.musicVolumeValue.textContent = `${sliderValue}%`;
  }
  if (elements.bgMusic) {
    elements.bgMusic.volume = volume;
  }
  if (elements.toggleMusicButton) {
    const isPlaying = elements.bgMusic && !elements.bgMusic.paused;
    elements.toggleMusicButton.textContent = isPlaying ? "shut up, jazz!" : "play some smooth jazz";
  }
}

// Shows/hides the automation toggle and updates its label.
function updateAutomationToggle() {
  const hasAutoOptimize = (state.prestigeUpgrades.autoOptimize || 0) > 0;
  // Sync both toggles (main tab + prestige tab).
  if (elements.automationToggle) {
    elements.automationToggle.classList.toggle("hidden", !hasAutoOptimize);
  }
  if (elements.automationToggleMain) {
    elements.automationToggleMain.classList.toggle("hidden", !hasAutoOptimize);
  }
  const label = state.automationEnabled ? "On" : "Off";
  const activeClass = state.automationEnabled;
  if (elements.automationToggleButton) {
    elements.automationToggleButton.textContent = label;
    elements.automationToggleButton.classList.toggle("active-toggle", activeClass);
  }
  if (elements.automationToggleButtonMain) {
    elements.automationToggleButtonMain.textContent = label;
    elements.automationToggleButtonMain.classList.toggle("active-toggle", activeClass);
  }
}

// Updates the HUD and option controls based on the current state.
// This includes the main point counter, auto income, and visibility of locked cosmetic settings.
function renderStats() {
  const currencyLabel = getCurrencyLabel();
  const renameUnlocked = (state.upgrades.rename || 0) > 0;
  const themeUnlocked = (state.upgrades.theme || 0) > 0;
  const tintTextUnlocked = (state.upgrades.tintText || 0) > 0;
  const tintInkUnlocked = (state.upgrades.tintInk || 0) > 0;

  if (!renameUnlocked) {
    state.currencyName = "points";
  }

  if (!themeUnlocked) {
    state.backgroundColor = "#f0f0f0";
  }

  if (!tintTextUnlocked) {
    state.mutedColor = "#777";
  }

  if (!tintInkUnlocked) {
    state.inkColor = "#1a1a1a";
  }

  document.documentElement.style.setProperty("--bg", state.backgroundColor || "#f0f0f0");
  document.documentElement.style.setProperty("--muted", state.mutedColor || "#777");
  document.documentElement.style.setProperty("--ink", state.inkColor || "#1a1a1a");

  elements.slopCount.textContent = formatEN(state.points);
  elements.autoRate.textContent = formatEN(getEffectiveAutoPoints());
  document.querySelectorAll(".currency-label").forEach((node) => {
    node.textContent = currencyLabel;
  });

  // The boredom corner (minigames) unlocks once the first machine is started.
  if (elements.minigamesPanel) {
    elements.minigamesPanel.classList.toggle("hidden", (state.upgrades.starter || 0) <= 0);
  }

  // The Prestige subtab appears at the threshold, or permanently after the first reset.
  const effectiveThreshold = getEffectivePrestigeUnlock();
  const prestigeUnlocked = state.points.gte(effectiveThreshold) || (state.resets || 0) >= 1;
  if (elements.prestigeSubtabButton) {
    elements.prestigeSubtabButton.classList.toggle("hidden", !prestigeUnlocked);
  }

  // The Cosmetics options subtab appears once any cosmetic upgrade is owned.
  const cosmeticsUnlocked = (state.upgrades.rename || 0) > 0 || (state.upgrades.theme || 0) > 0 || (state.upgrades.prestigeRename || 0) > 0 || (state.upgrades.tintText || 0) > 0 || (state.upgrades.tintInk || 0) > 0;
  if (elements.optionsCosmeticsSubtabButton) {
    elements.optionsCosmeticsSubtabButton.classList.toggle("hidden", !cosmeticsUnlocked);
    // If the user is on the cosmetics subtab but it just got hidden, fall back to settings.
    if (!cosmeticsUnlocked && state.optionsSubtab === "optionsCosmeticsSub") {
      setActiveOptionsSubtab("optionsSettingsSub", true);
    }
  }

  // The Prestige button is hidden until the player reaches the threshold for the
  // first time; after that it stays visible but greyed out below threshold.
  const atPrestigeThreshold = state.points.gte(effectiveThreshold);
  const prestigeEverUnlocked = atPrestigeThreshold || (state.resets || 0) >= 1;
  if (elements.prestigeButtonWrap) {
    elements.prestigeButtonWrap.classList.toggle("hidden", !prestigeEverUnlocked);
  }
  if (elements.prestigeButton) {
    elements.prestigeButton.disabled = !atPrestigeThreshold;
    elements.prestigeButton.textContent = `Prestige (+${formatEN(getPrestigeGain())})`;
  }

  // "Next at" line: while the pending gain is below 100, show the point
  // threshold where it ticks up by one (gain g comes from floor(log5(points
  // / threshold)) + 1, so the next step sits at threshold * 5^g).
  if (elements.prestigeNextAt) {
    const pendingGain = getPrestigeGain();
    const showNextAt = prestigeEverUnlocked && pendingGain.lt(100);
    elements.prestigeNextAt.classList.toggle("hidden", !showNextAt);
    if (showNextAt) {
      const nextThreshold = effectiveThreshold.mul(new ExpantaNum(5).pow(pendingGain));
      // Trim a trailing ".0" so round thresholds read "10Qa", not "10.0Qa".
      const thresholdText = formatEN(nextThreshold).replace(/\.0+(?=[A-Za-z])/g, "");
      elements.prestigeNextAt.textContent = `Next at: ${thresholdText} ${getCurrencyLabel()}`;
    }
  }

  // Reset-warning line under the Prestige button. Wording tracks how much
  // Muscle Memory keeps: nothing -> "upgrades", partial -> "some upgrades",
  // maxed -> drop the mention entirely.
  if (elements.prestigeResetNote) {
    elements.prestigeResetNote.classList.toggle("hidden", !prestigeEverUnlocked);
    const keepLvl = state.prestigeUpgrades.keepUpgrades || 0;
    const keepDef = prestigeCatalog.find((entry) => entry.id === "keepUpgrades");
    const keepMax = keepDef?.maxLevel || 18;
    elements.prestigeResetNote.textContent =
      keepLvl === 0
        ? "prestiging will reset points and upgrades"
        : keepLvl >= keepMax
          ? "prestiging will reset points"
          : "prestiging will reset points and some upgrades";
  }

  // Automation toggle: visible once autoOptimize has at least one level.
  updateAutomationToggle();

  const currencySetting = document.querySelector(".currency-setting");
  const colorSetting = document.querySelector(".color-setting");
  const prestigeRenameSetting = document.querySelector(".prestige-rename-setting");

  if (elements.currencyInput) {
    const currencyLocked = !renameUnlocked;
    elements.currencyInput.hidden = currencyLocked;
    elements.currencyInput.disabled = currencyLocked;
    elements.currencyInput.placeholder = "points";
    elements.currencyInput.value = state.currencyName ?? "";
    elements.currencyInput.title = renameUnlocked ? "Change your currency" : "LOCKED (omegalul)";
    if (currencySetting) {
      currencySetting.style.display = renameUnlocked ? "flex" : "none";
    }
    if (elements.currencyLockedBox) {
      elements.currencyLockedBox.style.display = "none";
    }
  }

  if (elements.backgroundColorInput) {
    const colorLocked = !themeUnlocked;
    elements.backgroundColorInput.hidden = colorLocked;
    elements.backgroundColorInput.disabled = colorLocked;
    elements.backgroundColorInput.value = (state.backgroundColor || "#f0f0f0").toLowerCase();
    elements.backgroundColorInput.title = themeUnlocked ? "Pick a background color" : "LOCKED (1e6 points)";
    if (colorSetting) {
      colorSetting.style.display = themeUnlocked ? "flex" : "none";
    }
    if (elements.backgroundColorLockedBox) {
      elements.backgroundColorLockedBox.style.display = "none";
    }
  }

  // Prestige currency rename: unlocked by the prestigeRename cosmetic upgrade.
  const prestigeRenameUnlocked = (state.upgrades.prestigeRename || 0) > 0;
  if (elements.prestigeCurrencyInput) {
    const prestigeRenameLocked = !prestigeRenameUnlocked;
    elements.prestigeCurrencyInput.hidden = prestigeRenameLocked;
    elements.prestigeCurrencyInput.disabled = prestigeRenameLocked;
    elements.prestigeCurrencyInput.placeholder = "???";
    elements.prestigeCurrencyInput.value = state.prestigeCurrencyName ?? "";
    elements.prestigeCurrencyInput.title = prestigeRenameUnlocked ? "Change your prestige currency" : "LOCKED (1Qi points)";
    if (prestigeRenameSetting) {
      prestigeRenameSetting.style.display = prestigeRenameUnlocked ? "flex" : "none";
    }
    if (elements.prestigeCurrencyLockedBox) {
      elements.prestigeCurrencyLockedBox.style.display = "none";
    }
  }

  // Tint text: unlocked by the tintText cosmetic upgrade.
  const tintTextSetting = document.querySelector(".tint-text-setting");
  if (elements.mutedColorInput) {
    const tintTextLocked = !tintTextUnlocked;
    elements.mutedColorInput.hidden = tintTextLocked;
    elements.mutedColorInput.disabled = tintTextLocked;
    elements.mutedColorInput.value = (state.mutedColor || "#777777").toLowerCase();
    elements.mutedColorInput.title = tintTextUnlocked ? "Change silvery text color" : "LOCKED (1e24 points)";
    if (tintTextSetting) {
      tintTextSetting.style.display = tintTextUnlocked ? "flex" : "none";
    }
  }

  // Tint ink: unlocked by the tintInk cosmetic upgrade.
  const tintInkSetting = document.querySelector(".tint-ink-setting");
  if (elements.inkColorInput) {
    const tintInkLocked = !tintInkUnlocked;
    elements.inkColorInput.hidden = tintInkLocked;
    elements.inkColorInput.disabled = tintInkLocked;
    elements.inkColorInput.value = (state.inkColor || "#1a1a1a").toLowerCase();
    elements.inkColorInput.title = tintInkUnlocked ? "Change dark text color" : "LOCKED (1e30 points)";
    if (tintInkSetting) {
      tintInkSetting.style.display = tintInkUnlocked ? "flex" : "none";
    }
  }

  if (elements.notationSelect) {
    elements.notationSelect.value = state.notation || "standard";
  }

  renderStatsTab();
  // Buy buttons only exist on the Game tab; skip the per-frame cost math elsewhere.
  if (state.activeTab === "gameTab") {
    refreshUpgradeButtonState();
  }
}

// Fun fact math: imagines that every single point can boil a tiny volume of water.
// With few points each point can still boil a decent chunk, but the more points you have
// the smaller each point's share gets, down to a Planck volume. Past that point the total
// boiled water just keeps growing in whole water molecules instead.
const WATER_MOLECULE_VOLUME = new ExpantaNum("3e-29"); // m^3, roughly a single water molecule
const PLANCK_VOLUME = new ExpantaNum("4.22e-105"); // m^3, the smallest meaningful volume

// Formats a volume in cubic metres using SI prefixes, e.g. "3000 pm³" or
// "4.22e-15 qm³", so it always reads as cubic picometres, cubic attometres, etc.
function formatVolume(m3) {
  // SI prefix ladder for cubic metres; each prefix step is a factor of 1e9 in volume.
  const prefixes = [
    { label: "m³", factor: 1 },
    { label: "mm³", factor: 1e-9 },
    { label: "µm³", factor: 1e-18 },
    { label: "nm³", factor: 1e-27 },
    { label: "pm³", factor: 1e-36 },
    { label: "fm³", factor: 1e-45 },
    { label: "am³", factor: 1e-54 },
    { label: "zm³", factor: 1e-63 },
    { label: "ym³", factor: 1e-72 },
    { label: "rm³", factor: 1e-81 },
    { label: "qm³", factor: 1e-90 },
  ];

  const volume = asEN(m3, 0);

  // Pick the largest prefix that still keeps the value at 1 or above;
  // anything smaller than a cubic quectometre just stays on the smallest one.
  let chosen = prefixes[prefixes.length - 1];
  for (const entry of prefixes) {
    if (volume.gte(new ExpantaNum(entry.factor))) {
      chosen = entry;
      break;
    }
  }

  const scaled = volume.div(new ExpantaNum(chosen.factor));
  const num = scaled.toNumber();

  if (!Number.isFinite(num)) {
    return `${scaled.toString()} ${chosen.label}`;
  }

  // Readable range: show the plain number; otherwise standard notation ("58k pm³").
  if (num >= 0.01 && num < 10000) {
    const display = num >= 100 ? num.toFixed(0) : num >= 10 ? num.toFixed(1) : num.toFixed(2);
    return `${display} ${chosen.label}`;
  }

  // Standard suffix ladder up to Dc; anything bigger switches to scientific.
  const suffixes = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  let scaledNum = num;
  let suffixIndex = 0;
  // The tiny epsilon below 1000 absorbs floating-point drift at exact powers
  // of 1000 (e.g. 1e33 / 1e30 can come out as 999.9999999999999), so values
  // land on the right suffix instead of showing "1000No".
  while (Math.abs(scaledNum) >= 1000 - 1e-9 && suffixIndex < suffixes.length - 1) {
    scaledNum /= 1000;
    suffixIndex += 1;
  }

  let display;
  let appendSuffix = true;
  if (suffixIndex >= suffixes.length - 1 && Math.abs(scaledNum) >= 1000) {
    // Past Dc: fall back to scientific notation.
    display = num.toExponential(2).replace("e+", "e").replace("e-", "e-");
    appendSuffix = false;
  } else if (Math.abs(scaledNum) < 0.01) {
    // Tiny value: pad decimals so it stays meaningful instead of "0.00".
    display = scaledNum.toFixed(Math.min(18, Math.max(2, -Math.floor(Math.log10(Math.abs(scaledNum))) + 2)));
  } else {
    display = scaledNum >= 100 ? scaledNum.toFixed(0) : scaledNum >= 10 ? scaledNum.toFixed(1) : scaledNum.toFixed(2);
  }
  return `${display}${appendSuffix ? suffixes[suffixIndex] : ""} ${chosen.label}`;
}

// Water molecule quantity tier thresholds.
const WATER_TIERS = [
  { label: "water molecule", molecules: 1 },
  { label: "drop of water", molecules: 1e21 },
  { label: "Pacific Ocean", molecules: 1e43 },
  { label: "planet volume", molecules: 1e50 },
  { label: "sun volume", molecules: 1e56 },
  { label: "galaxy volume", molecules: 1e68 },
  { label: "universe", molecules: 1e80 },
];

// Converts a raw molecule count into a human-readable tiered string.
// At e80 of each tier it rolls up to the next unit; past e80 universes it
// enters the verse system (multiverses, omniverses, then log-scale).
function moleculesToUnit(molecules) {
  if (molecules.lt(2)) return "1 water molecule";

  const verseNames = ["universe", "multiverse", "omniverse"];

  // Find the largest standard tier that fits.
  for (let i = WATER_TIERS.length - 1; i >= 0; i--) {
    if (molecules.gte(WATER_TIERS[i].molecules)) {
      const tier = WATER_TIERS[i];
      if (i < WATER_TIERS.length - 1) {
        // Standard tiers: show how many of this unit.
        const amount = molecules.div(tier.molecules);
        const label = amount.eq(1) ? tier.label : tier.label + "s";
        return `${formatEN(amount)} ${label}`;
      }

      // Universe tier and beyond: verse system.
      const depth = Math.floor(molecules.log10().toNumber() / 80) + 1;
      if (depth <= 3) {
        const denom = new ExpantaNum(10).pow((depth - 1) * 80);
        const amount = molecules.div(denom);
        const name = verseNames[depth - 1];
        const label = amount.eq(1) ? name : name + "s";
        return `${formatEN(amount)} ${label}`;
      }

      // Tier 4+ (e80 omniverses, etc.): logarithmic "verses deep".
      const fractionalDepth = molecules.log10().toNumber() / 80 + 1;
      const depthStr = fractionalDepth >= 10 ? fractionalDepth.toFixed(1) : fractionalDepth.toFixed(2);
      return `${depthStr} verses deep`;
    }
  }

  // Fallback (shouldn't hit).
  return `${formatEN(molecules)} water molecules`;
}

// Builds the "boil some water" fact sentence for the statistics tab.
function getWaterBoilFact(points) {
  const count = asEN(points, 0).gt(0) ? asEN(points, 0) : new ExpantaNum(1);

  // What each single point would be able to boil if the whole lot only reached one molecule.
  const perPointShare = WATER_MOLECULE_VOLUME.div(count);

  if (perPointShare.gte(PLANCK_VOLUME)) {
    return `If each of your ${formatEN(count)} ${getCurrencyLabel()} could boil ${formatVolume(perPointShare)} of water, all of them combined could boil a single water molecule. (just go with it this is totally original and not copied from AD)`;
  }

  // Each point is capped at a Planck volume; the total then scales in whole molecules.
  const totalVolume = count.mul(PLANCK_VOLUME);
  const molecules = totalVolume.div(WATER_MOLECULE_VOLUME);
  return `If each of your ${formatEN(count)} ${getCurrencyLabel()} could boil a Planck volume of water, all of them combined could boil ${moleculesToUnit(molecules)}. (totally original AD stuff (but more sad))`;
}

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statBox(label, value) {
  return `<div class="stat-box"><span class="label">${label}</span><strong>${value}</strong></div>`;
}

function statSection(title, items) {
  return `<div class="stats-section"><div class="stats-section-head">${title}</div><div class="stats-grid">${items.join("")}</div></div>`;
}

// Renders the statistics tab: all lifetime stats plus the water-boiling fun fact.
function renderStatsTab() {
  if (!elements.statsList) return;
  const currencyLabel = getCurrencyLabel();
  const prestigeLabel = getPrestigeCurrencyLabel();

  // Gather stats.
  const currentPoints = formatEN(state.points);
  const pointsPerSec = formatEN(getCachedEffectiveAutoPoints());
  const totalMade = formatEN(state.totalMade);
  const highestPoints = formatEN(state.highestPoints || state.points);
  const currentPP = formatEN(state.prestigePoints);
  const totalPP = formatEN(state.totalPrestigePointsEarned || new ExpantaNum(0));
  const resets = state.resets || 0;
  const totalLevels = getTotalUpgradeCount();
  const synergyIds = prestigeCatalog.filter((p) => p.id === "synergyLink" || p.id === "synergyLoop" || p.id.startsWith("synergyChain")).map((p) => p.id);
  const synergyCount = synergyIds.filter((id) => (state.prestigeUpgrades[id] || 0) > 0).length;
  const totalSynergies = synergyIds.length;
  const playTime = formatTime(state.totalPlayTime || 0);
  const timeSincePrestige = formatTime(Math.max(0, (Date.now() - (state.lastPrestigeTime || Date.now())) / 1000));
  const firstPlayed = formatDate(state.firstPlayTime || Date.now());

  elements.statsList.innerHTML = [
    statSection("Production", [
      statBox(`Current ${currencyLabel}`, currentPoints),
      statBox(`${currencyLabel} per second`, pointsPerSec),
      statBox(`Highest ${currencyLabel} in a run`, highestPoints),
      statBox(`Total ${currencyLabel} made (lifetime)`, totalMade),
    ]),
    statSection("Prestige", [
      statBox(`Current ${prestigeLabel}`, currentPP),
      statBox(`Total ${prestigeLabel} earned (lifetime)`, totalPP),
      statBox(`Prestige resets`, String(resets)),
      statBox(`Time since last prestige`, timeSincePrestige),
    ]),
    statSection("Upgrades", [
      statBox(`Total upgrade levels`, String(totalLevels)),
      statBox(`Synergy nodes owned`, `${synergyCount} / ${totalSynergies}`),
    ]),
    statSection("Time", [
      statBox(`Total play time`, playTime),
      statBox(`First played`, firstPlayed),
    ]),
  ].join("");

  // Only recompute the (relatively expensive) water fact while the Stats tab is
  // actually visible; it's plain text so textContent is safe to use.
  if (elements.waterFact && state.activeTab === "statsTab") {
    elements.waterFact.textContent = getWaterBoilFact(state.points);
  }
}

// Renders the formulas subtab: plain-English descriptions of every key formula.
function renderStatsFormulas() {
  if (!elements.formulasList) return;

  const formulas = [
    {
      title: "Prestige Gain",
      formula: "gain = floor(log\u2085(points \u00F7 10Qa)) + 1",
      detail: "First prestige always grants 1. After that, each 5\u00D7 past 10Qa grants +1 more. So 10Qa \u2192 1, 50Qa \u2192 2, 250Qa \u2192 3, 1.25Qa \u2192 4, etc.",
    },
    {
      title: "Upgrade Cost",
      formula: "cost = baseCost \u00D7 costScale ^ owned",
      detail: `Each upgrade level multiplies cost by its costScale (default 1.2\u00D7). After ${SCALE_THRESHOLD} levels on a specific upgrade, an additional penalty applies to that upgrade: \u00D7(1 + overage / 200).`,
    },
    {
      title: "Auto Points",
      formula: "points/s = \u03A3(autoValues \u00D7 levels) \u00D7 multiplier \u00D7 superOC \u00D7 limitBreaker \u00D7 synergies",
      detail: "Base production is the sum of all auto-upgrade outputs. Multiplied by Overclock (1.2^lvl), Super Overclock (2^lvl), Limit Breaker (2\u00D7 if owned), then all active synergy multipliers.",
    },
    {
      title: "Prestige Upgrade Cost",
      formula: "cost = baseCost \u00D7 costScale ^ owned  (or  baseCost + costAdd \u00D7 owned)",
      detail: "Each prestige upgrade uses either multiplicative scaling or additive scaling depending on its definition.",
    },
    {
      title: "Lights Out Reward",
      formula: "reward = autoPoints/s \u00D7 seconds",
      detail: "3\u00D73 grid banks 10s, 5\u00D75 banks 30s, 7\u00D77 banks 2m of current production.",
    },
    {
      title: "Synergy Multipliers",
      formula: "varies per node (see prestige tree)",
      detail: "Each synergy node adds a global multiplier to all production. Some scale with specific upgrade levels, some with total levels, some with time since prestige or total resets.",
    },
    {
      title: "Scaled Cost Penalty",
      formula: `scale = baseCost \u00D7 (1 + (owned \u2212 ${SCALE_THRESHOLD}) / 200)`,
      detail: `Once a specific upgrade's level exceeds ${SCALE_THRESHOLD}, that upgrade's effective costScale gets a gradual penalty. At ${SCALE_THRESHOLD + 200} levels its costs are 2\u00D7 normal, at ${SCALE_THRESHOLD + 400} they are 3\u00D7, etc. Only that upgrade is affected, not others.`,
    },
  ];

  elements.formulasList.innerHTML = formulas.map((f) => `
    <div class="formula-card">
      <h3>${f.title}</h3>
      <code class="formula-expr">${f.formula}</code>
      <p>${f.detail}</p>
    </div>
  `).join("");
}

// Switches between the stats subtabs (Overview / Formulas).
function setActiveStatsSubtab(subId, skipSave = false) {
  state.statsSubtab = subId || "statsOverviewSub";
  elements.statsSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.statsSubtab === subId);
  });
  elements.statsSubtabPanels.forEach((panel) => {
    const isActive = panel.id === subId;
    panel.classList.toggle("hidden", !isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });
  if (subId === "statsFormulasSub") {
    renderStatsFormulas();
  }
  if (!skipSave) {
    saveGame();
  }
}

// Calls the main render functions together so the UI stays consistent after gameplay changes.
function render() {
  renderStats();
  renderUpgradeList();
  renderBlog();
  renderStatsTab();
  renderAutosave();
  renderTickRate();
  renderTickerSpeed();
  renderTickerVisibility();
  renderPrestigeConfirmToggle();
  renderPrestigePanel();
  renderPrestigeChoice();
  renderChaosSubtab();
  syncMusicControls();
}

// Shows/hides the "total chaos" subtab once the bad ending has been seen.
function renderChaosSubtab() {
  const button = elements.chaosSubtabButton;
  if (!button) return;
  const unlocked = state.badEndingSeen === true;
  button.classList.toggle("hidden", !unlocked);
  // Guard against a save that has the chaos subtab open without the flag.
  if (!unlocked && state.activeSubtab === "chaosSub") {
    setActiveSubtab("gameSub", true);
  }
}

// Decides whether the shop should rerender based on whether sections have just become unlocked.
function shouldRefreshUpgradeList() {
  if (!elements.upgradeList) return false;

  const overclockVisible = state.overclockUnlocked || (state.upgrades.multiplier || 0) > 0 || (state.upgrades.superOverclock || 0) > 0;
  const hasOverclockSection = elements.upgradeList.querySelector('[data-section-key="overclock"]');
  const hasCosmeticsSection = elements.upgradeList.querySelector('[data-section-key="cosmetics"]');

  const sectionVisibilityChanged = (overclockVisible && !hasOverclockSection) ||
    (!overclockVisible && hasOverclockSection && (state.upgrades.multiplier || 0) === 0 && (state.upgrades.superOverclock || 0) === 0) ||
    (overclockVisible && !hasCosmeticsSection) ||
    (!overclockVisible && hasCosmeticsSection);
  if (sectionVisibilityChanged) return true;

  // Autobuy can reveal the next upgrade in a chain. Rebuild only for that
  // structural change; ordinary autobuy purchases should leave the scroller's
  // DOM and scroll position untouched.
  for (const section of elements.upgradeList.querySelectorAll(".upgrade-section")) {
    const sectionKey = section.dataset.sectionKey;
    const expectedIds = upgradeCatalog
      .filter((upgrade) => upgrade.section === sectionKey)
      .filter((upgrade, index, upgrades) => {
        if (upgrade.visibleWhen) return upgrade.visibleWhen();
        if (index === 0) return true;
        return (state.upgrades[upgrades[index - 1].id] || 0) > 0;
      })
      .map((upgrade) => upgrade.id);
    const actualIds = [...section.querySelectorAll(".upgrade-item")]
      .map((item) => item.dataset.upgradeId);
    if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
      return true;
    }
  }

  return false;
}

// Fixed game loop timestep: configurable ticks per second for consistent production.
let gameTickMs = 1000 / (state.tickRate || 10);
let gameAccumulator = 0;

function gameLoop() {
  const now = Date.now();
  // Cap the tick so returning from a backgrounded tab doesn't dump hours of
  // income (or make the ticker jump) in a single frame.
  const elapsed = Math.min(now - state.lastTick, 60000);
  state.lastTick = now;
  gameAccumulator += elapsed;

  // Track lifetime play time (in seconds).
  state.totalPlayTime = (state.totalPlayTime || 0) + elapsed / 1000;

  // Track highest points in a single run.
  if (state.points.gt(state.highestPoints || new ExpantaNum(0))) {
    state.highestPoints = state.points.clone();
  }

  // Process fixed-size ticks.
  while (gameAccumulator >= gameTickMs) {
    const delta = gameTickMs / 1000;
    const effectiveAutoPoints = getCachedEffectiveAutoPoints();
    if (effectiveAutoPoints.gt(0)) {
      addPoints(effectiveAutoPoints.mul(delta));
    }
    gameAccumulator -= gameTickMs;
  }

  // Auto-buy upgrades when automation is enabled.
  const autoBought = autoBuyUpgrades();
  if (autoBought) invalidateProductionCache();

  // Auto-prestige: if the autoPrestige node is owned and we have enough points
  // for at least 1 prestige point, trigger a prestige automatically.
  if ((state.prestigeUpgrades?.autoPrestige || 0) > 0) {
    const prestigeGain = getPrestigeGain();
    if (prestigeGain.gte(1)) {
      performPrestige();
      // After prestige, the upgrade list likely changes structure.
      invalidateProductionCache();
    }
  }

  renderStats();
  if (autoBought && !shouldRefreshUpgradeList()) {
    refreshUpgradeButtonState();
  } else if (shouldRefreshUpgradeList()) {
    renderUpgradeList();
  }

  const autosaveDelay = (state.autoSaveInterval || 15) * 1000;
  if (now - state.lastAutoSave >= autosaveDelay) {
    saveGame();
    state.lastAutoSave = now;
  }

  // The ticker needs the real frame elapsed time, not the fixed tick delta.
  updateTicker(elapsed / 1000);

  requestAnimationFrame(gameLoop);
}

// Fully resets the save and reloads the page to restore the default starting state.
function resetGame() {
  const confirmed = window.confirm("Reset the machine and go back to zero?");
  if (!confirmed) return;
  hardResetGame();
}

// Fully resets the save and reloads the page to restore the default starting
// state. Used by the reset button and the win screen's "Play again".
function hardResetGame() {
  // Properly reset all ExpantaNum fields to avoid stale object references.
  state.points = new ExpantaNum(10);
  state.autoPoints = new ExpantaNum(0);
  state.totalMade = new ExpantaNum(10);
  state.prestigePoints = new ExpantaNum(0);
  state.resets = 0;
  state.currencyName = "points";
  state.prestigeCurrencyName = "???";
  state.backgroundColor = "#f0f0f0";
  state.mutedColor = "#777";
  state.inkColor = "#1a1a1a";
  state.notation = "standard";
  state.musicVolume = 0.4;
  state.automationEnabled = false;
  state.tickerVisible = true;
  state.confirmPrestige = true;
  state.tickerSpeed = 60;
  state.overclockUnlocked = false;
  state.totalPlayTime = 0;
  state.totalPrestigePointsEarned = new ExpantaNum(0);
  state.highestPoints = new ExpantaNum(10);
  state.firstPlayTime = Date.now();
  state.tickRate = 10;
  state.lastPrestigeTime = Date.now();
  state.lastTick = Date.now();
  state.lastAutoSave = Date.now();
  state.autoSaveInterval = 15;
  state.upgrades = getDefaultUpgradeState();
  state.prestigeUpgrades = getDefaultPrestigeUpgrades();
  localStorage.removeItem("was-it-worth-it-save");
  localStorage.removeItem("was-it-worth-it-intro");
  render();
  location.reload();
}

// Saves immediately when the user presses the manual save button.
function manualSave() {
  const wasSaved = saveGame();
  if (wasSaved) {
    showStatus("Game saved.");
  }
}

// Starts or stops the looping music track and handles the autoplay restrictions from the browser.
function toggleMusic() {
  if (!elements.bgMusic) return;

  elements.bgMusic.loop = true;
  elements.bgMusic.volume = Number.isFinite(state.musicVolume) ? state.musicVolume : 0.4;

  if (elements.bgMusic.paused) {
    elements.bgMusic.play().then(() => {
      syncMusicControls();
    }).catch(() => {
      window.alert("Add music.mp3 to this folder, then press Play music again.");
      elements.bgMusic.pause();
      syncMusicControls();
    });
  } else {
    elements.bgMusic.pause();
    syncMusicControls();
  }
}

// Switches between the Game, Options, and Blog panels.
function setActiveTab(tabId, skipSave = false) {
  state.activeTab = tabId || "gameTab";
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });

  elements.tabPanels.forEach((panel) => {
    const isActive = panel.id === tabId;
    panel.classList.toggle("hidden", !isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  // Make sure the water fact etc. are fresh the moment Stats is opened.
  if (tabId === "statsTab") {
    renderStatsTab();
  }

  // Coming back to the Game tab with Prestige open: the tree was unmeasurable
  // while hidden, so refresh its drawn geometry.
  if (tabId === "gameTab" && state.activeSubtab === "prestigeSub") {
    refreshPrestigeLayout();
  }

  if (!skipSave) {
    saveGame();
  }
}

// Redraws connectors and path labels once the prestige panel is actually
// visible. Both are positioned via getBoundingClientRect(), which reads zeros
// while the panel is display:none — so they must be recomputed after it's
// shown (first prestige, tab switches, page load straight into Prestige).
// Runs synchronously (measuring forces layout, so this is already correct)
// plus once more on the next frame as belt-and-braces; the sync pass keeps
// things working when rAF is throttled in background tabs.
function refreshPrestigeLayout() {
  // Center the tree on Limit Breaker the first time it becomes measurable
  // after a page load; afterwards preserve the player's pan/zoom.
  if (!prestigeViewInitialized && currentPrestigeStage) {
    const rect = currentPrestigeStage.getBoundingClientRect();
    if (rect.width && rect.height) {
      prestigeViewInitialized = true;
      resetPrestigeView();
    }
  }
  drawPrestigeConnectors();
  updatePrestigeLabels();
  requestAnimationFrame(() => {
    drawPrestigeConnectors();
    updatePrestigeLabels();
  });
}

// Switches between the subtabs inside the Game tab (Game / Prestige).
function setActiveSubtab(subId, skipSave = false) {
  state.activeSubtab = subId || "gameSub";
  elements.subtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.subtab === subId);
  });

  elements.subtabPanels.forEach((panel) => {
    const isActive = panel.id === subId;
    panel.classList.toggle("hidden", !isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  // The tree just became measurable; fix up anything drawn while it was hidden.
  if (subId === "prestigeSub") {
    refreshPrestigeLayout();
  }

  if (!skipSave) {
    saveGame();
  }
}

function setActiveOptionsSubtab(subId, skipSave = false) {
  state.optionsSubtab = subId || "optionsSettingsSub";
  elements.optionSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.optionSubtab === subId);
  });

  elements.optionSubtabPanels.forEach((panel) => {
    const isActive = panel.id === subId;
    panel.classList.toggle("hidden", !isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
  });

  if (!skipSave) {
    saveGame();
  }
}

// Returns the active dialogue page for the intro sequence.
function getCurrentCutscenePage() {
  return cutsceneTemplate.pages[cutsceneState.pageIndex] || [];
}

// Converts the current dialogue page into HTML paragraphs for typewriter rendering.
function getCurrentPageText() {
  const page = getCurrentCutscenePage();
  return page.map((line) => `<p>${line}</p>`).join("");
}

// Total number of visible characters on the current intro page (excluding the
// <p> tags), used to drive the typewriter.
function getCurrentPageCharCount() {
  const page = getCurrentCutscenePage();
  return page.reduce((sum, line) => sum + line.length, 0);
}

// Types the intro text one character at a time to create the RPG-style dialogue
// effect. Only the visible text is typed; the <p> tags are always present so
// they never appear as literal text.
function typeSentenceIntoDialog() {
  const page = getCurrentCutscenePage();
  const totalChars = getCurrentPageCharCount();

  if (cutsceneState.charIndex > totalChars) {
    cutsceneState.charIndex = totalChars;
  }

  let remaining = cutsceneState.charIndex;
  const html = page.map((line) => {
    if (remaining <= 0) return "<p></p>";
    const take = Math.min(line.length, remaining);
    remaining -= take;
    return `<p>${line.slice(0, take)}</p>`;
  }).join("");
  elements.dialogueText.innerHTML = html;
  elements.dialogueText.scrollTop = elements.dialogueText.scrollHeight;

  if (cutsceneState.charIndex >= totalChars) {
    cutsceneState.isTyping = false;
    elements.startButton.textContent = cutsceneState.pageIndex >= cutsceneTemplate.pages.length - 1 ? "Start the machine" : "Continue";
    return;
  }

  cutsceneState.charIndex += 1;
  cutsceneState.typingTimer = window.setTimeout(typeSentenceIntoDialog, 18);
}

// Advances to the next intro page or ends the cutscene once the last page is reached.
function nextCutscenePage() {
  if (cutsceneState.pageIndex < cutsceneTemplate.pages.length - 1) {
    cutsceneState.pageIndex += 1;
    cutsceneState.charIndex = 0;
    elements.startButton.textContent = "Continue";
    typeSentenceIntoDialog();
    return;
  }

  finishIntro();
}

// Fades the cutscene overlay in (removes .hidden, then adds .visible on the
// next frame so the opacity transition runs).
function showCutscene() {
  const cutscene = elements.cutscene;
  cutscene.classList.remove("hidden");
  void cutscene.offsetWidth;
  cutscene.classList.add("visible");
}

// Fades the cutscene overlay out, then hides it and calls onDone.
function hideCutscene(onDone) {
  const cutscene = elements.cutscene;
  cutscene.classList.remove("visible");
  window.setTimeout(() => {
    cutscene.classList.add("hidden");
    if (onDone) onDone();
  }, 500);
}

// Shows the intro overlay, optionally forcing it to appear again for a replay.
function renderIntroCutscene(forceShow = false) {
  const seenIntro = localStorage.getItem("was-it-worth-it-intro") === "true";
  const hasSave = !!localStorage.getItem("was-it-worth-it-save");

  if (!forceShow && (seenIntro || hasSave)) {
    elements.cutscene.classList.add("hidden");
    return;
  }

  cutsceneState.pageIndex = 0;
  cutsceneState.charIndex = 0;
  cutsceneState.currentText = "";

  if (cutsceneState.typingTimer) {
    window.clearTimeout(cutsceneState.typingTimer);
  }

  elements.cutsceneTitle.textContent = cutsceneTemplate.title;
  elements.cutsceneChapter.textContent = cutsceneTemplate.chapter;
  elements.startButton.textContent = "Continue";
  elements.cutscene.classList.remove("ending");
  showCutscene();
  typeSentenceIntoDialog();
}

// Marks the intro as seen and hides the cutscene so the player can start the game.
function finishIntro() {
  if (cutsceneState.typingTimer) {
    window.clearTimeout(cutsceneState.typingTimer);
  }

  localStorage.setItem("was-it-worth-it-intro", "true");
  hideCutscene(() => {
    render();
    const existingSave = localStorage.getItem("was-it-worth-it-save");
    if (!existingSave) {
      saveGame();
    }
  });
}

// Lets the player reopen the opening cutscene even after the first playthrough.
function replayIntro() {
  renderIntroCutscene(true);
}

// ---------------------------------------------------------------------------
// Endings: THE CHOICE cutscenes, fade-to-black, and the win / bad screens.
// Reuses the intro cutscene overlay but with its own state and templates.
// ---------------------------------------------------------------------------

// Dialogue for the good ending.
const goodEndingTemplate = {
  title: "was it worth it?",
  chapter: "That's enough.",
  pages: [
    [
      "The machine hums its last note.",
      "Every upgrade, every reset, every meaningless point... it was all worth it.",
    ],
    [
      "The noise fades. The sun comes back.",
      "You look at the machine. It looks back. It's satisfied.",
    ],
    [
      "Was it worth it?",
      "Yes. It always was.",
    ],
  ],
};

// "See what you missed" replay: the good ending cutscene plus extra lorem
// ipsum pages, shown when the bad ending was chosen instead.
const missedEndingTemplate = {
  title: "was it worth it?",
  chapter: "visions of a brighter future",
  pages: [
    ...goodEndingTemplate.pages,
    [
      "But that's not what happened, was it?",
      "You made the choice to take everything beyond repair.",
    ],
    [
      "You cannot go back.",
      "Never again.",
    ],
  ],
};

// Dialogue for the bad ending.
const badEndingTemplate = {
  title: "was it worth it?",
  chapter: "THE BAD ENDING",
  pages: [
    [
      "The machine screams.",
      "You kept pushing. You kept resetting. You never stopped.",
    ],
    [
      "The noise doesn't fade. It becomes everything.",
      "There is no sun anymore. There is only the machine.",
    ],
    [
      "Was it worth it?",
      "No. It never was.",
    ],
  ],
};

const endingCutsceneState = {
  pageIndex: 0,
  charIndex: 0,
  typingTimer: null,
  isTyping: false,
  template: null,
  onFinish: null,
};
let endingCutsceneActive = false;

// Shows the ending cutscene overlay with the given template. When the last
// page is reached (or Skip is pressed), onFinish runs.
function playEndingCutscene(template, onFinish) {
  endingCutsceneState.pageIndex = 0;
  endingCutsceneState.charIndex = 0;
  endingCutsceneState.template = template;
  endingCutsceneState.onFinish = onFinish;
  endingCutsceneActive = true;
  if (endingCutsceneState.typingTimer) {
    window.clearTimeout(endingCutsceneState.typingTimer);
  }
  elements.cutsceneTitle.textContent = template.title;
  elements.cutsceneChapter.textContent = template.chapter;
  elements.startButton.textContent = "Continue";
  elements.cutscene.classList.add("ending");
  showCutscene();
  typeEndingSentence();
}

function getEndingPageText() {
  const page = endingCutsceneState.template?.pages?.[endingCutsceneState.pageIndex] || [];
  return page.map((line) => `<p>${line}</p>`).join("");
}

// Total number of visible characters on the current ending page (excluding the
// <p> tags), used to drive the typewriter.
function getEndingPageCharCount() {
  const page = endingCutsceneState.template?.pages?.[endingCutsceneState.pageIndex] || [];
  return page.reduce((sum, line) => sum + line.length, 0);
}

function typeEndingSentence() {
  const page = endingCutsceneState.template?.pages?.[endingCutsceneState.pageIndex] || [];
  const totalChars = getEndingPageCharCount();
  if (endingCutsceneState.charIndex > totalChars) {
    endingCutsceneState.charIndex = totalChars;
  }
  let remaining = endingCutsceneState.charIndex;
  const html = page.map((line) => {
    if (remaining <= 0) return "<p></p>";
    const take = Math.min(line.length, remaining);
    remaining -= take;
    return `<p>${line.slice(0, take)}</p>`;
  }).join("");
  elements.dialogueText.innerHTML = html;
  elements.dialogueText.scrollTop = elements.dialogueText.scrollHeight;
  if (endingCutsceneState.charIndex >= totalChars) {
    endingCutsceneState.isTyping = false;
    elements.startButton.textContent = "Continue";
    return;
  }
  endingCutsceneState.charIndex += 1;
  endingCutsceneState.typingTimer = window.setTimeout(typeEndingSentence, 18);
}

function nextEndingPage() {
  const pages = endingCutsceneState.template?.pages || [];
  if (endingCutsceneState.pageIndex < pages.length - 1) {
    endingCutsceneState.pageIndex += 1;
    endingCutsceneState.charIndex = 0;
    elements.startButton.textContent = "Continue";
    typeEndingSentence();
    return;
  }
  finishEndingCutscene();
}

function finishEndingCutscene() {
  if (endingCutsceneState.typingTimer) {
    window.clearTimeout(endingCutsceneState.typingTimer);
  }
  endingCutsceneActive = false;
  const onFinish = endingCutsceneState.onFinish;
  endingCutsceneState.onFinish = null;
  hideCutscene(() => {
    elements.cutscene.classList.remove("ending");
    if (onFinish) onFinish();
  });
}

// Plays the good ending: fade to black, cutscene on top, then win screen.
// The black stays up the whole time so the game never flashes back in.
function playGoodEnding() {
  startEndingFade();
  playEndingCutscene(goodEndingTemplate, () => {
    showEndingText("It was worth it.", showWinScreen);
  });
}

// Plays the bad ending: fade to black, cutscene on top, then bad ending screen.
function playBadEnding() {
  // Seeing the bad ending (by choosing it or replaying it) unlocks the
  // "total chaos" subtab.
  state.badEndingSeen = true;
  saveGame();
  startEndingFade();
  playEndingCutscene(badEndingTemplate, () => {
    showEndingText("It wasn't worth it.", showBadEndingScreen);
  });
}

// "See what you missed": replays the good ending cutscene with extra lorem
// ipsum pages, then shows extra lorem ipsum text on the fade before returning
// to the panel. No win screen — it's just a peek at the other ending.
function playMissedEnding() {
  startEndingFade();
  playEndingCutscene(missedEndingTemplate, () => {
    showEndingText("lorem ipsum dolor sit amet, consectetur adipiscing elit.", () => {
      elements.endingFade.classList.add("hidden");
      elements.endingFade.classList.remove("visible");
      render();
    });
  });
}

// Shows the black fade overlay and keeps it visible. Called when the ending
// cutscene starts so the screen fades to black and never cuts back to the game.
function startEndingFade() {
  const fade = elements.endingFade;
  const fadeText = elements.endingFadeText;
  const hint = elements.endingFadeHint;
  fadeText.textContent = "";
  if (hint) {
    hint.classList.remove("visible");
  }
  fade.classList.remove("clickable");
  fade.classList.remove("hidden");
  // Force a reflow so the opacity transition actually runs.
  void fade.offsetWidth;
  fade.classList.add("visible");
}

// Pending callback for the black fade. Set by showEndingText; runs when the
// player clicks the fade (the ending never advances without user input).
let endingFadeOnDone = null;

// Shows a line of text on the black fade and waits for a click before running
// onDone. The text (and a "click to continue" hint) fades in smoothly.
function showEndingText(text, onDone) {
  const fade = elements.endingFade;
  const fadeText = elements.endingFadeText;
  const hint = elements.endingFadeHint;
  fadeText.textContent = text;
  endingFadeOnDone = onDone;
  // Make the fade clickable so the player can advance.
  fade.classList.add("clickable");
  // Restart the fade-in so the text appears smoothly.
  fadeText.classList.remove("visible");
  void fadeText.offsetWidth;
  fadeText.classList.add("visible");
  if (hint) {
    hint.classList.remove("visible");
    void hint.offsetWidth;
    hint.classList.add("visible");
  }
}

// Advances the ending when the player clicks the black fade.
function advanceEndingFade() {
  if (!endingFadeOnDone) return;
  const onDone = endingFadeOnDone;
  endingFadeOnDone = null;
  elements.endingFade.classList.remove("clickable");
  onDone();
}

// Fades an ending screen in (win / bad). The black fade stays behind it.
function showEndingScreen(screen) {
  screen.classList.remove("hidden");
  void screen.offsetWidth;
  screen.classList.add("visible");
}

// Fades an ending screen out, then hides it and calls onDone.
function hideEndingScreen(screen, onDone) {
  screen.classList.remove("visible");
  window.setTimeout(() => {
    screen.classList.add("hidden");
    if (onDone) onDone();
  }, 800);
}

function showWinScreen() {
  showEndingScreen(elements.winScreen);
}

function showBadEndingScreen() {
  showEndingScreen(elements.badEndingScreen);
}

// Clicking the black fade advances the ending (after the cutscene text).
elements.endingFade.addEventListener("click", advanceEndingFade);

// Win screen: "Play again" hard-resets; "Go back" returns to the game with
// the good ending upgrade turned into a "View cutscene" button.
elements.winPlayAgain.addEventListener("click", hardResetGame);
elements.winGoBack.addEventListener("click", () => {
  hideEndingScreen(elements.winScreen, () => {
    elements.endingFade.classList.add("hidden");
    elements.endingFade.classList.remove("visible");
    render();
    saveGame();
  });
});
elements.badGoBack.addEventListener("click", () => {
  hideEndingScreen(elements.badEndingScreen, () => {
    elements.endingFade.classList.add("hidden");
    elements.endingFade.classList.remove("visible");
    render();
    saveGame();
  });
});

// Prestige sub-subtab switching (Tree / THE CHOICE).
document.querySelectorAll(".prestige-subtab-button").forEach((button) => {
  button.addEventListener("click", () => setActivePrestigeSubtab(button.dataset.prestigeSubtab));
});

elements.resetButton.addEventListener("click", resetGame);
elements.saveButton.addEventListener("click", manualSave);
elements.exportButton.addEventListener("click", exportSave);
elements.importButton.addEventListener("click", importSave);
elements.toggleMusicButton.addEventListener("click", toggleMusic);
elements.startButton.addEventListener("click", () => {
  // The same overlay is reused for the ending cutscenes; route to them when
  // one is active.
  if (endingCutsceneActive) {
    const totalChars = getEndingPageCharCount();
    if (endingCutsceneState.charIndex < totalChars) {
      endingCutsceneState.charIndex = totalChars;
      elements.dialogueText.innerHTML = getEndingPageText();
      elements.startButton.textContent = "Continue";
      return;
    }
    nextEndingPage();
    return;
  }

  const totalChars = getCurrentPageCharCount();

  if (cutsceneState.charIndex < totalChars) {
    cutsceneState.charIndex = totalChars;
    elements.dialogueText.innerHTML = getCurrentPageText();
    elements.startButton.textContent = cutsceneState.pageIndex >= cutsceneTemplate.pages.length - 1 ? "Start the machine" : "Continue";
    return;
  }

  nextCutscenePage();
});
elements.skipIntroButton.addEventListener("click", () => {
  if (endingCutsceneActive) {
    finishEndingCutscene();
    return;
  }
  finishIntro();
});
elements.replayIntroButton.addEventListener("click", replayIntro);
elements.autosaveSlider.addEventListener("input", () => {
  renderAutosave();
  saveGame();
});
elements.notationSelect.addEventListener("change", (event) => {
  state.notation = event.target.value === "scientific" ? "scientific" : "standard";
  render();
  saveGame();
});
elements.tickerToggleButton.addEventListener("click", () => {
  state.tickerVisible = !(state.tickerVisible !== false);
  if (!state.tickerVisible) {
    tickerX = 0;
    tickerReady = false;
    if (elements.tickerMessage) {
      elements.tickerMessage.style.transform = "translateX(0px)";
    }
  }
  renderTickerVisibility();
  saveGame();
});
elements.prestigeConfirmButton.addEventListener("click", () => {
  state.confirmPrestige = state.confirmPrestige === false;
  renderPrestigeConfirmToggle();
  saveGame();
});
elements.tickerSpeedSlider.addEventListener("input", () => {
  state.tickerSpeed = Number(elements.tickerSpeedSlider.value);
  if (elements.tickerSpeedValue) {
    elements.tickerSpeedValue.textContent = `${state.tickerSpeed} px/s`;
  }
  saveGame();
});
elements.tickRateSlider.addEventListener("input", () => {
  state.tickRate = Math.max(5, Math.min(100, Number(elements.tickRateSlider.value)));
  gameTickMs = 1000 / state.tickRate;
  invalidateProductionCache();
  if (elements.tickRateValue) {
    elements.tickRateValue.textContent = `${state.tickRate} /s`;
  }
  saveGame();
});
elements.musicVolumeSlider.addEventListener("input", () => {
  state.musicVolume = Number(elements.musicVolumeSlider.value) / 100;
  if (elements.bgMusic) {
    elements.bgMusic.volume = state.musicVolume;
  }
  render();
  saveGame();
});

// Debounce helper: delays calling `fn` until `ms` milliseconds after the last
// invocation. Used for text-input saves so typing doesn't hammer localStorage.
function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const debouncedSave = debounce(() => saveGame(), 400);

elements.currencyInput.addEventListener("input", (event) => {
  if (!elements.currencyInput || elements.currencyInput.disabled) return;

  state.currencyName = event.target.value;
  render();
  debouncedSave();
});

elements.backgroundColorInput.addEventListener("input", (event) => {
  if (!elements.backgroundColorInput || elements.backgroundColorInput.disabled) return;

  // Sanitize: only accept valid hex color codes to prevent CSS injection.
  const rawColor = event.target.value || "#f0f0f0";
  state.backgroundColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#f0f0f0";
  document.documentElement.style.setProperty("--bg", state.backgroundColor);
  render();
  debouncedSave();
});

elements.prestigeCurrencyInput.addEventListener("input", (event) => {
  if (!elements.prestigeCurrencyInput || elements.prestigeCurrencyInput.disabled) return;

  state.prestigeCurrencyName = event.target.value;
  render();
  debouncedSave();
});

if (elements.mutedColorInput) {
  elements.mutedColorInput.addEventListener("input", (event) => {
    if (!elements.mutedColorInput || elements.mutedColorInput.disabled) return;
    const rawColor = event.target.value || "#777";
    if (/^#[0-9a-fA-F]{6}$/.test(rawColor)) {
      state.mutedColor = rawColor;
      document.documentElement.style.setProperty("--muted", state.mutedColor);
      render();
      debouncedSave();
    }
  });
}

if (elements.inkColorInput) {
  elements.inkColorInput.addEventListener("input", (event) => {
    if (!elements.inkColorInput || elements.inkColorInput.disabled) return;
    const rawColor = event.target.value || "#1a1a1a";
    if (/^#[0-9a-fA-F]{6}$/.test(rawColor)) {
      state.inkColor = rawColor;
      document.documentElement.style.setProperty("--ink", state.inkColor);
      render();
      debouncedSave();
    }
  });
}

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

// Game-tab subtabs: the prestige subtab and the prestige button both open Prestige.
elements.subtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveSubtab(button.dataset.subtab));
});
if (elements.prestigeButton) {
  elements.prestigeButton.addEventListener("click", () => {
    performPrestige();
    setActiveSubtab("prestigeSub");
  });
}
setupPrestigeTreeControls();
elements.optionSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveOptionsSubtab(button.dataset.optionSubtab));
});
elements.statsSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveStatsSubtab(button.dataset.statsSubtab));
});
setActiveSubtab(state.activeSubtab || "gameSub", true);
setActiveOptionsSubtab(state.optionsSubtab || "optionsSettingsSub", true);
setActiveStatsSubtab(state.statsSubtab || "statsOverviewSub", true);
setActivePrestigeSubtab(state.prestigeSubtab || "tree", true);

// Lights Out minigame: size picker, reset button, and the initial board.
document.querySelectorAll(".size-button").forEach((button) => {
  button.addEventListener("click", () => startLightsGame(Number(button.dataset.size) || 3));
});
const lightsReset = document.getElementById("lightsReset");
if (lightsReset) {
  lightsReset.addEventListener("click", () => startLightsGame(lights.size));
}

// Lights Out help dialog: open from "Stuck?", close via button, backdrop, or Escape.
const lightsStuck = document.getElementById("lightsStuck");
const lightsDialog = document.getElementById("lightsDialog");
const lightsDialogClose = document.getElementById("lightsDialogClose");
if (lightsStuck && lightsDialog && lightsDialogClose) {
  const closeLightsDialog = () => lightsDialog.classList.add("hidden");
  lightsStuck.addEventListener("click", () => lightsDialog.classList.remove("hidden"));
  lightsDialogClose.addEventListener("click", closeLightsDialog);
  lightsDialog.addEventListener("click", (event) => {
    if (event.target === lightsDialog) {
      closeLightsDialog();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightsDialog.classList.contains("hidden")) {
      closeLightsDialog();
    }
  });
}

startLightsGame(3);

if (elements.blogList) {
  renderBlog();
}

if (elements.bgMusic) {
  elements.bgMusic.volume = Number.isFinite(state.musicVolume) ? state.musicVolume : 0.4;
}

// Put the first headline in the ticker; the game loop scrolls it from there.
if (elements.tickerMessage && tickerMessages.length) {
  tickerIndex = getRandomTickerIndex(-1);
  elements.tickerMessage.textContent = tickerMessages[tickerIndex];
}

// Pick a random eyebrow line for the top bar on this page load.
if (elements.eyebrowText && eyebrowMessages.length) {
  elements.eyebrowText.textContent = eyebrowMessages[Math.floor(Math.random() * eyebrowMessages.length)];
}

const savedTab = state.activeTab || "gameTab";

// Show the intro (if needed) before the first save is written, so a brand-new
// install still sees it once. setActiveTab() saves the state, which would
// otherwise make the intro look like it was already seen.
render();
renderIntroCutscene();
setActiveTab(savedTab, true);
requestAnimationFrame(gameLoop);
