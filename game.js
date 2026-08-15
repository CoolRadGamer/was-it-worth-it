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
    name: "Tint the room",
    description: "Change the background color in options",
    baseCost: new ExpantaNum(1e6),
    costScale: 1.2,
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
    section: "cosmetics",
    tooltip: "What a boring look. Let's paint this game a fresh colour. Or a completely unfitting one. Why not?",
  },
  {
    id: "multiplier",
    name: "Overclock the machine",
    description: "x1.2 point gain after additive bonuses",
    baseCost: new ExpantaNum(5000),
    costScale: 1.55,
    type: "multiplier",
    value: new ExpantaNum(1.2),
    maxLevel: 99,
    section: "overclock",
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  },
  {
    id: "endgame",
    name: "Final hum",
    description: "+2,000,000 points per second",
    baseCost: new ExpantaNum(100000000),
    costScale: 1.2,
    type: "auto",
    value: new ExpantaNum(2000000),
    maxLevel: 99,
    section: "production",
    tooltip: "this is not the final upgrade idk why the ai calls it that",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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
    tooltip: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
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

// Default game state used when no save exists or when a save is reset.
const defaultState = {
  points: new ExpantaNum(10),
  autoPoints: new ExpantaNum(0),
  // Lifetime earnings start at 10 because the game hands you the first 10 points.
  totalMade: new ExpantaNum(10),
  currencyName: "points",
  backgroundColor: "#e9e5e1",
  notation: "standard",
  musicVolume: 0.4,
  activeTab: "gameTab",
  activeSubtab: "gameSub",
  tickerSpeed: 60,
  // Stays true forever once the player reaches 1000 points (overclock section).
  overclockUnlocked: false,
  // How many times the player has prestiged. Once >= 1, prestige stays unlocked even below 10Qa.
  resets: 0,
  upgrades: getDefaultUpgradeState(),
  lastTick: Date.now(),
  lastAutoSave: Date.now(),
  autoSaveInterval: 15,
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
  slopCount: document.getElementById("slopCount"),
  autoRate: document.getElementById("autoRate"),
  upgradeList: document.getElementById("upgradeList"),
  blogList: document.getElementById("blogList"),
  totalMadeStat: document.getElementById("totalMadeStat"),
  currentPointsStat: document.getElementById("currentPointsStat"),
  currentPointsLabel: document.getElementById("currentPointsLabel"),
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
  tickerViewport: document.getElementById("tickerViewport"),
  tickerMessage: document.getElementById("tickerMessage"),
  tickerSpeedSlider: document.getElementById("tickerSpeedSlider"),
  tickerSpeedValue: document.getElementById("tickerSpeedValue"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  subtabButtons: document.querySelectorAll(".subtab-button"),
  subtabPanels: document.querySelectorAll(".subtab-panel"),
  prestigeSubtabButton: document.getElementById("prestigeSubtabButton"),
  prestigeSub: document.getElementById("prestigeSub"),
  prestigeButtonWrap: document.getElementById("prestigeButtonWrap"),
  prestigeButton: document.getElementById("prestigeButton"),
  minigamesPanel: document.getElementById("minigamesPanel"),
};

// Placeholder headlines for the news ticker. Swap these out for real news later.
const tickerMessages = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.",
];

// Ticker scroll state: only one message on screen at a time, and the next one
// is shown only after the current message has fully scrolled off the left edge.
let tickerX = 0;
let tickerIndex = 0;
let tickerReady = false;

// Reads the save from localStorage and restores the game state.
// If the save is invalid or missing, it falls back to the default starting state.
function loadGame() {
  const saved = localStorage.getItem("was-it-worth-it-save");

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
    const loadedPoints = asEN(parsed.points, 10);
    // If the save predates this counter, seed it with at least the starting 10.
    // Also repair any save where the counter somehow dipped below the current points.
    const loadedTotal = asEN(parsed.totalMade, 10);
    const repairedTotal = loadedTotal.lt(loadedPoints) ? loadedPoints : loadedTotal;
    return {
      ...defaultState,
      ...parsed,
      points: loadedPoints,
      autoPoints: asEN(parsed.autoPoints, 0),
      totalMade: repairedTotal,
      // Keep overclock unlocked for saves that already crossed 1000 points.
      overclockUnlocked: parsed.overclockUnlocked === true || loadedPoints.gte(new ExpantaNum(1000)),
      upgrades: {
        ...getDefaultUpgradeState(),
        ...(parsed.upgrades || {}),
      },
      lastTick: Date.now(),
      lastAutoSave: Date.now(),
    };
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
  const saveData = {
    ...state,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
    totalMade: state.totalMade.toString(),
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
  };

  localStorage.setItem("was-it-worth-it-save", JSON.stringify(saveData));
}

// Exports the save as a text blob so it can be shared or backed up manually.
function exportSave() {
  const data = JSON.stringify({
    ...state,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
    totalMade: state.totalMade.toString(),
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
  }, null, 2);

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(data)
      .then(() => window.alert("Save exported to clipboard."))
      .catch(() => fallbackExport(data));
    return;
  }

  fallbackExport(data);
}

function fallbackExport(data) {
  const text = window.prompt("Copy this save data:", data);
  if (text === null) return;
  saveGame();
}

function importSave() {
  const input = window.prompt("Paste a save string:");
  if (!input) return;

  try {
    const parsed = JSON.parse(input);
    const loadedPoints = asEN(parsed.points, 10);
    const loadedTotal = asEN(parsed.totalMade, 10);
    const repairedTotal = loadedTotal.lt(loadedPoints) ? loadedPoints : loadedTotal;
    Object.assign(state, {
      ...defaultState,
      ...parsed,
      points: loadedPoints,
      autoPoints: asEN(parsed.autoPoints, 0),
      totalMade: repairedTotal,
      overclockUnlocked: parsed.overclockUnlocked === true || loadedPoints.gte(new ExpantaNum(1000)),
      upgrades: {
        ...getDefaultUpgradeState(),
        ...(parsed.upgrades || {}),
      },
      lastTick: Date.now(),
      lastAutoSave: Date.now(),
    });

    render();
    saveGame();
  } catch (error) {
    window.alert("Invalid save data.");
  }
}

// Work out the current cost for a given upgrade.
// The cost grows by the upgrade's costScale at each owned level.
function getUpgradeCost(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  const baseCost = asEN(upgrade.baseCost, 0);
  const scale = Number(upgrade.costScale ?? 1.2);
  return baseCost.mul(new ExpantaNum(scale).pow(owned));
}

// Calculates how many copies of a repeatable upgrade can be bought right now
// without exceeding the player's available points.
function getMaxAffordableUpgradeInfo(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  const remaining = Math.max(0, upgrade.maxLevel - owned);
  if (!remaining || upgrade.maxLevel <= 1) {
    return { count: 0, totalCost: asEN(0) };
  }

  let count = 0;
  let totalCost = asEN(0);
  const scale = Number(upgrade.costScale ?? 1.2);
  const baseCost = asEN(upgrade.baseCost, 0);

  while (count < remaining) {
    const nextCost = baseCost.mul(new ExpantaNum(scale).pow(owned + count));
    if (state.points.lt(totalCost.add(nextCost))) break;
    totalCost = totalCost.add(nextCost);
    count += 1;
  }

  return { count, totalCost };
}

// Buys one copy of a single upgrade and applies its immediate effect if needed.
function purchaseUpgrade(id) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade) return;

  const owned = state.upgrades[id] || 0;
  if (owned >= upgrade.maxLevel) return;

  const cost = getUpgradeCost(upgrade);
  if (state.points.lt(cost)) return;

  state.points = state.points.sub(cost);
  state.upgrades[id] = owned + 1;

  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0));
  }

  render();
  saveGame();
}

// Buys as many copies as the player can afford, up to the upgrade's max level.
function purchaseMaxUpgrade(id) {
  const upgrade = upgradeCatalog.find((entry) => entry.id === id);
  if (!upgrade || upgrade.maxLevel <= 1) return;

  const bought = state.upgrades[id] || 0;
  if (bought >= upgrade.maxLevel) return;

  const { count, totalCost } = getMaxAffordableUpgradeInfo(upgrade);
  if (!count || totalCost.lte(0)) return;

  state.points = state.points.sub(totalCost);
  state.upgrades[id] = bought + count;

  if (upgrade.type === "auto") {
    state.autoPoints = state.autoPoints.add(asEN(upgrade.value, 0).mul(count));
  }

  render();
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
  const multiplier = new ExpantaNum(1.2).pow(multiplierLevel);
  return additiveBonus.mul(multiplier);
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
    title: "Curabitur vel eros a nibh",
    body: "Curabitur vel eros a nibh faucibus consectetur. Aliquam erat volutpat. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Phasellus eu nibh et sem vulputate commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas."
  }
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

  const overclockUnlocked = state.overclockUnlocked || (state.upgrades.multiplier || 0) > 0;
  const cosmeticsUnlocked = (state.upgrades.multiplier || 0) > 0;

  const sectionVisible = {
    production: true,
    overclock: overclockUnlocked,
    cosmetics: cosmeticsUnlocked,
  };

  elements.upgradeList.innerHTML = sections
    .map((section) => {
      const sectionUpgrades = upgradeCatalog.filter((upgrade) => upgrade.section === section.key);
      if (!sectionUpgrades.length || !sectionVisible[section.key]) return "";

      const visibleUpgrades = sectionUpgrades.filter((upgrade, index) => {
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
            const isAffordable = state.points.gte(cost);
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
            const descriptionText = upgrade.type === "multiplier"
              ? `Multiplies all ${escCurrencyLabel} gain by 1.2x after additive bonuses`
              : upgrade.description.replace(/\bpoints?\b/gi, escCurrencyLabel);

            let currentEffect = "";
            if (owned === 0) {
              currentEffect = "";
            } else if (upgrade.type === "auto") {
              const total = asEN(upgrade.value, 0).mul(owned || 1);
              currentEffect = `Currently: +${formatEN(total)} ${escCurrencyLabel}/s`;
            } else if (upgrade.type === "multiplier") {
              const currentMultiplier = new ExpantaNum(1.2).pow(owned || 0);
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
              ? (maxPurchaseInfo.count > 0 ? `Buy max (${maxPurchaseInfo.count}) • ${formatEN(maxPurchaseInfo.totalCost)} ${escCurrencyLabel}` : "Buy max")
              : "";

            return `
              <div class="upgrade-item tooltip-trigger" data-upgrade-id="${upgrade.id}">
                <div class="upgrade-copy">
                  <h3>${displayName}</h3>
                  <p>${descriptionText}</p>
                  ${currentEffect ? `<p class="upgrade-current-effect">${currentEffect}</p>` : ""}
                </div>
                <div class="upgrade-actions">
                  <button class="buy-button" data-upgrade-id="${upgrade.id}" ${isMaxed || !isAffordable ? "disabled" : ""}>
                    ${isMaxed ? "Bought" : `${formatEN(cost)} ${escCurrencyLabel}`}
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
  elements.upgradeList.querySelectorAll(".buy-button").forEach((button) => {
    const id = button.dataset.upgradeId;
    const upgrade = upgradeCatalog.find((entry) => entry.id === id);
    if (!upgrade) return;

    const owned = state.upgrades[id] || 0;
    const cost = getUpgradeCost(upgrade);
    const isMaxed = owned >= upgrade.maxLevel;
    const isAffordable = state.points.gte(cost);
    button.disabled = isMaxed || !isAffordable;
    button.textContent = isMaxed ? "Bought" : `${formatEN(cost)} ${currencyLabel}`;
  });

  elements.upgradeList.querySelectorAll(".buy-max-button").forEach((button) => {
    const id = button.dataset.upgradeId;
    const upgrade = upgradeCatalog.find((entry) => entry.id === id);
    if (!upgrade || upgrade.maxLevel <= 1) return;

    const maxInfo = getMaxAffordableUpgradeInfo(upgrade);
    const isMaxed = (state.upgrades[id] || 0) >= upgrade.maxLevel;
    button.disabled = isMaxed || maxInfo.count === 0;
    button.textContent = isMaxed ? "Buy max" : `Buy max (${maxInfo.count}) • ${formatEN(maxInfo.totalCost)} ${currencyLabel}`;
  });
}

// ---------------------------------------------------------------------------
// Lights Out minigame. Winning a round banks a few seconds of current
// production (5s on 3×3, 10s on 5×5, 20s on 7×7).
// ---------------------------------------------------------------------------
const LIGHTS_REWARDS = { 3: 10, 5: 20, 7: 30 }; // seconds of production per win

// Prestige unlocks at 10Qa (1e16 in this game's notation), or permanently after the first reset.
const PRESTIGE_UNLOCK = new ExpantaNum("1e16");
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
      ? `Lights out! +${formatEN(reward)} ${getCurrencyLabel()} (${seconds}s of production)`
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

// Advances the news ticker. The current message slides left; only after it has
// fully left the screen does the next message enter from the right edge.
function updateTicker(delta) {
  const message = elements.tickerMessage;
  const viewport = elements.tickerViewport;
  if (!message || !viewport || tickerMessages.length === 0) return;

  const speed = Number.isFinite(state.tickerSpeed) ? state.tickerSpeed : 60;
  const viewportWidth = viewport.clientWidth;

  if (!tickerReady) {
    tickerX = viewportWidth;
    tickerReady = true;
  }

  tickerX -= speed * delta;
  message.style.transform = `translateX(${tickerX}px)`;

  if (message.offsetWidth > 0 && tickerX <= -message.offsetWidth) {
    tickerIndex = (tickerIndex + 1) % tickerMessages.length;
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

// Updates the HUD and option controls based on the current state.
// This includes the main point counter, auto income, and visibility of locked cosmetic settings.
function renderStats() {
  const currencyLabel = getCurrencyLabel();
  const renameUnlocked = (state.upgrades.rename || 0) > 0;
  const themeUnlocked = (state.upgrades.theme || 0) > 0;

  if (!renameUnlocked) {
    state.currencyName = "points";
  }

  if (!themeUnlocked) {
    state.backgroundColor = "#f3efe9";
  }

  document.documentElement.style.setProperty("--bg", state.backgroundColor || "#f3efe9");

  elements.slopCount.textContent = formatEN(state.points);
  elements.autoRate.textContent = formatEN(getEffectiveAutoPoints());
  document.querySelectorAll(".currency-label").forEach((node) => {
    node.textContent = currencyLabel;
  });

  // The boredom corner (minigames) unlocks once the first machine is started.
  if (elements.minigamesPanel) {
    elements.minigamesPanel.classList.toggle("hidden", (state.upgrades.starter || 0) <= 0);
  }

  // Prestige unlocks at 10Qa, or permanently after the first reset.
  const prestigeUnlocked = state.points.gte(PRESTIGE_UNLOCK) || (state.resets || 0) >= 1;
  if (elements.prestigeSubtabButton) {
    elements.prestigeSubtabButton.classList.toggle("hidden", !prestigeUnlocked);
  }
  if (elements.prestigeButtonWrap) {
    elements.prestigeButtonWrap.classList.toggle("hidden", !prestigeUnlocked);
  }

  const currencySetting = document.querySelector(".currency-setting");
  const colorSetting = document.querySelector(".color-setting");

  if (elements.currencyInput) {
    const currencyLocked = !renameUnlocked;
    elements.currencyInput.hidden = currencyLocked;
    elements.currencyInput.disabled = currencyLocked;
    elements.currencyInput.placeholder = "points";
    elements.currencyInput.value = state.currencyName ?? "";
    elements.currencyInput.title = renameUnlocked ? "Change your currency" : "LOCKED (omegalul)";
    if (currencySetting) {
      currencySetting.style.display = currencyLocked ? "none" : "flex";
      currencySetting.hidden = currencyLocked;
    }
    if (elements.currencyLockedBox) {
      elements.currencyLockedBox.style.display = currencyLocked ? "flex" : "none";
    }
  }

  if (elements.backgroundColorInput) {
    const colorLocked = !themeUnlocked;
    elements.backgroundColorInput.hidden = colorLocked;
    elements.backgroundColorInput.disabled = colorLocked;
    elements.backgroundColorInput.value = (state.backgroundColor || "#f3efe9").toLowerCase();
    elements.backgroundColorInput.title = themeUnlocked ? "Pick a background color" : "LOCKED (1e6 points)";
    if (colorSetting) {
      colorSetting.style.display = colorLocked ? "none" : "flex";
      colorSetting.hidden = colorLocked;
    }
    if (elements.backgroundColorLockedBox) {
      elements.backgroundColorLockedBox.style.display = colorLocked ? "flex" : "none";
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
  const moleculeLabel = molecules.lt(new ExpantaNum(2)) ? "water molecule" : "water molecules";
  return `If each of your ${formatEN(count)} ${getCurrencyLabel()} could boil a Planck volume of water, all of them combined could boil ${formatEN(molecules)} ${moleculeLabel}. (totally original AD stuff (but more sad))`;
}

// Renders the statistics tab: total currency made plus the water-boiling fun fact.
function renderStatsTab() {
  const currencyLabel = getCurrencyLabel();

  if (elements.totalMadeStat) {
    elements.totalMadeStat.textContent = `${formatEN(state.totalMade)} ${currencyLabel}`;
  }

  if (elements.currentPointsStat) {
    elements.currentPointsStat.textContent = `${formatEN(state.points)} ${currencyLabel}`;
  }

  if (elements.currentPointsLabel) {
    elements.currentPointsLabel.textContent = `Current ${currencyLabel}`;
  }

  // Only recompute the (relatively expensive) water fact while the Stats tab is
  // actually visible; it's plain text so textContent is safe to use.
  if (elements.waterFact && state.activeTab === "statsTab") {
    elements.waterFact.textContent = getWaterBoilFact(state.points);
  }
}

// Calls the main render functions together so the UI stays consistent after gameplay changes.
function render() {
  renderStats();
  renderUpgradeList();
  renderBlog();
  renderStatsTab();
  renderAutosave();
  renderTickerSpeed();
  syncMusicControls();
}

// Decides whether the shop should rerender based on whether sections have just become unlocked.
function shouldRefreshUpgradeList() {
  if (!elements.upgradeList) return false;

  const overclockVisible = state.overclockUnlocked || (state.upgrades.multiplier || 0) > 0;
  const cosmeticsVisible = (state.upgrades.multiplier || 0) > 0;
  const hasOverclockSection = elements.upgradeList.querySelector('[data-section-key="overclock"]');
  const hasCosmeticsSection = elements.upgradeList.querySelector('[data-section-key="cosmetics"]');

  return (overclockVisible && !hasOverclockSection) || (!overclockVisible && hasOverclockSection && (state.upgrades.multiplier || 0) === 0) ||
    (cosmeticsVisible && !hasCosmeticsSection) || (!cosmeticsVisible && hasCosmeticsSection && (state.upgrades.multiplier || 0) === 0);
}

// Main game loop. It applies passive income over time and autosaves periodically.
function gameLoop() {
  const now = Date.now();
  // Cap the tick so returning from a backgrounded tab doesn't dump hours of
  // income (or make the ticker jump) in a single frame.
  const delta = Math.min((now - state.lastTick) / 1000, 60);
  state.lastTick = now;

  const effectiveAutoPoints = getEffectiveAutoPoints();
  if (delta > 0 && effectiveAutoPoints.gt(0)) {
    addPoints(effectiveAutoPoints.mul(delta));
    renderStats();

    if (shouldRefreshUpgradeList()) {
      renderUpgradeList();
    }
  }

  const autosaveDelay = (state.autoSaveInterval || 15) * 1000;
  if (now - state.lastAutoSave >= autosaveDelay) {
    saveGame();
    state.lastAutoSave = now;
  }

  updateTicker(delta);

  requestAnimationFrame(gameLoop);
}

// Fully resets the save and reloads the page to restore the default starting state.
function resetGame() {
  const confirmed = window.confirm("Reset the machine and go back to zero?");
  if (!confirmed) return;

  Object.assign(state, { ...defaultState, lastTick: Date.now(), lastAutoSave: Date.now() });
  localStorage.removeItem("was-it-worth-it-save");
  localStorage.removeItem("was-it-worth-it-intro");
  render();
  location.reload();
}

// Saves immediately when the user presses the manual save button.
function manualSave() {
  saveGame();
  window.alert("Game saved.");
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
function setActiveTab(tabId) {
  state.activeTab = tabId || "gameTab";
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== tabId);
  });

  // Make sure the water fact etc. are fresh the moment Stats is opened.
  if (tabId === "statsTab") {
    renderStatsTab();
  }

  saveGame();
}

// Switches between the subtabs inside the Game tab (Game / Prestige).
function setActiveSubtab(subId) {
  state.activeSubtab = subId || "gameSub";
  elements.subtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.subtab === subId);
  });

  elements.subtabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== subId);
  });

  saveGame();
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

// Types the intro text one character at a time to create the RPG-style dialogue effect.
function typeSentenceIntoDialog() {
  const targetText = getCurrentPageText();

  if (cutsceneState.charIndex > targetText.length) {
    cutsceneState.charIndex = targetText.length;
  }

  elements.dialogueText.innerHTML = targetText.slice(0, cutsceneState.charIndex);
  elements.dialogueText.scrollTop = elements.dialogueText.scrollHeight;

  if (cutsceneState.charIndex >= targetText.length) {
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

// Shows the intro overlay, optionally forcing it to appear again for a replay.
function renderIntroCutscene(forceShow = false) {
  const seenIntro = localStorage.getItem("was-it-worth-it-intro") === "true";

  if (!forceShow && seenIntro) {
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
  elements.cutscene.classList.remove("hidden");
  typeSentenceIntoDialog();
}

// Marks the intro as seen and hides the cutscene so the player can start the game.
function finishIntro() {
  if (cutsceneState.typingTimer) {
    window.clearTimeout(cutsceneState.typingTimer);
  }

  localStorage.setItem("was-it-worth-it-intro", "true");
  elements.cutscene.classList.add("hidden");
  render();
  saveGame();
}

// Lets the player reopen the opening cutscene even after the first playthrough.
function replayIntro() {
  renderIntroCutscene(true);
}

elements.resetButton.addEventListener("click", resetGame);
elements.saveButton.addEventListener("click", manualSave);
elements.exportButton.addEventListener("click", exportSave);
elements.importButton.addEventListener("click", importSave);
elements.toggleMusicButton.addEventListener("click", toggleMusic);
elements.startButton.addEventListener("click", () => {
  const targetText = getCurrentPageText();

  if (cutsceneState.charIndex < targetText.length) {
    cutsceneState.charIndex = targetText.length;
    elements.dialogueText.innerHTML = targetText;
    elements.startButton.textContent = cutsceneState.pageIndex >= cutsceneTemplate.pages.length - 1 ? "Start the machine" : "Continue";
    return;
  }

  nextCutscenePage();
});
elements.skipIntroButton.addEventListener("click", finishIntro);
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
elements.tickerSpeedSlider.addEventListener("input", () => {
  state.tickerSpeed = Number(elements.tickerSpeedSlider.value);
  if (elements.tickerSpeedValue) {
    elements.tickerSpeedValue.textContent = `${state.tickerSpeed} px/s`;
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
elements.currencyInput.addEventListener("input", (event) => {
  if (!elements.currencyInput || elements.currencyInput.disabled) return;

  state.currencyName = event.target.value;
  render();
  saveGame();
});

elements.backgroundColorInput.addEventListener("input", (event) => {
  if (!elements.backgroundColorInput || elements.backgroundColorInput.disabled) return;

  state.backgroundColor = event.target.value || "#f3efe9";
  document.documentElement.style.setProperty("--bg", state.backgroundColor);
  render();
  saveGame();
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

// Game-tab subtabs: the prestige subtab and the prestige button both open Prestige.
elements.subtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveSubtab(button.dataset.subtab));
});
if (elements.prestigeButton) {
  elements.prestigeButton.addEventListener("click", () => setActiveSubtab("prestigeSub"));
}
setActiveSubtab(state.activeSubtab || "gameSub");

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
  elements.tickerMessage.textContent = tickerMessages[0];
}

const savedTab = state.activeTab || "gameTab";
setActiveTab(savedTab);

render();
renderIntroCutscene();
requestAnimationFrame(gameLoop);
