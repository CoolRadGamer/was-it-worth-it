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

function formatEN(value) {
  if (!ExpantaNum) {
    return String(value ?? 0);
  }

  const numeric = asEN(value, 0);
  if (!numeric.isFinite()) {
    return numeric.toString();
  }

  const asNumber = numeric.toNumber();
  if (!Number.isFinite(asNumber)) {
    return numeric.toString();
  }

  return Math.floor(asNumber).toLocaleString();
}

const cutsceneTemplate = {
  title: "was it worth it?",
  chapter: "DISCLAIMER",
  pages: [
    [
      "This whole game was vibecoded (except for the parts where I decided this sucks)",
      "AI is the future am I right guys?"
    ],
    [
      "You were told the sludge would be useful.",
      "Now it moves on its own, and so do you."
    ],
    [
      "You have ten points left. Start it.",
      "Let the noise answer the question."
    ]
  ]
};

const upgradeCatalog = [
  {
    id: "starter",
    name: "Start the machine",
    description: "+1 point per second",
    baseCost: new ExpantaNum(10),
    type: "auto",
    value: new ExpantaNum(1),
    maxLevel: 1,
  },
  {
    id: "machine",
    name: "Machine repeat",
    description: "+1 point per second",
    baseCost: new ExpantaNum(5),
    type: "auto",
    value: new ExpantaNum(1),
    maxLevel: 99,
  },
  {
    id: "machine2",
    name: "Double machine",
    description: "+2 per second",
    baseCost: new ExpantaNum(12),
    type: "auto",
    value: new ExpantaNum(2),
    maxLevel: 99,
  },
  {
    id: "machine3",
    name: "Deep cycle",
    description: "+5 per second",
    baseCost: new ExpantaNum(30),
    type: "auto",
    value: new ExpantaNum(5),
    maxLevel: 99,
  },
  {
    id: "turbo",
    name: "Turbo relay",
    description: "+12 per second",
    baseCost: new ExpantaNum(80),
    type: "auto",
    value: new ExpantaNum(12),
    maxLevel: 99,
  },
  {
    id: "relay",
    name: "Signal relay",
    description: "+30 per second",
    baseCost: new ExpantaNum(220),
    type: "auto",
    value: new ExpantaNum(30),
    maxLevel: 99,
  },
  {
    id: "rename",
    name: "Rename the currency",
    description: "Unlock custom currency naming",
    baseCost: new ExpantaNum(2000),
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
  },
  {
    id: "theme",
    name: "Tint the room",
    description: "Change the background color",
    baseCost: new ExpantaNum(1e6),
    type: "unlock",
    value: new ExpantaNum(1),
    maxLevel: 1,
  },
  {
    id: "multiplier",
    name: "Overclock the machine",
    description: "x1.2 point gain after additive bonuses",
    baseCost: new ExpantaNum(500),
    type: "multiplier",
    value: new ExpantaNum(1.2),
    maxLevel: 99,
  },
  {
    id: "forge",
    name: "Forge line",
    description: "+90 per second",
    baseCost: new ExpantaNum(2400),
    type: "auto",
    value: new ExpantaNum(90),
    maxLevel: 99,
  },
  {
    id: "refinery",
    name: "Point refinery",
    description: "+250 per second",
    baseCost: new ExpantaNum(7000),
    type: "auto",
    value: new ExpantaNum(250),
    maxLevel: 99,
  },
  {
    id: "network",
    name: "Network mesh",
    description: "+800 per second",
    baseCost: new ExpantaNum(20000),
    type: "auto",
    value: new ExpantaNum(800),
    maxLevel: 99,
  },
  {
    id: "lattice",
    name: "Lattice engine",
    description: "+2,500 per second",
    baseCost: new ExpantaNum(60000),
    type: "auto",
    value: new ExpantaNum(2500),
    maxLevel: 99,
  },
  {
    id: "reactor",
    name: "Core reactor",
    description: "+8,000 per second",
    baseCost: new ExpantaNum(180000),
    type: "auto",
    value: new ExpantaNum(8000),
    maxLevel: 99,
  },
  {
    id: "industry",
    name: "Industrial bloom",
    description: "+24,000 per second",
    baseCost: new ExpantaNum(500000),
    type: "auto",
    value: new ExpantaNum(24000),
    maxLevel: 99,
  },
  {
    id: "orbital",
    name: "Orbital bloom",
    description: "+75,000 per second",
    baseCost: new ExpantaNum(1500000),
    type: "auto",
    value: new ExpantaNum(75000),
    maxLevel: 99,
  },
  {
    id: "galaxy",
    name: "Galaxy stack",
    description: "+200,000 per second",
    baseCost: new ExpantaNum(6000000),
    type: "auto",
    value: new ExpantaNum(200000),
    maxLevel: 99,
  },
  {
    id: "singularity",
    name: "Singularity stack",
    description: "+600,000 per second",
    baseCost: new ExpantaNum(25000000),
    type: "auto",
    value: new ExpantaNum(600000),
    maxLevel: 99,
  },
  {
    id: "endgame",
    name: "Final hum",
    description: "+2,000,000 per second",
    baseCost: new ExpantaNum(100000000),
    type: "auto",
    value: new ExpantaNum(2000000),
    maxLevel: 99,
  },
  {
    id: "epoch",
    name: "Epoch engine",
    description: "+7,500,000 per second",
    baseCost: new ExpantaNum(500000000),
    type: "auto",
    value: new ExpantaNum(7500000),
    maxLevel: 99,
  },
  {
    id: "cosmos",
    name: "Cosmic overdrive",
    description: "+25,000,000 per second",
    baseCost: new ExpantaNum(2500000000),
    type: "auto",
    value: new ExpantaNum(25000000),
    maxLevel: 99,
  },
  {
    id: "eclipse",
    name: "Eclipse loop",
    description: "+90,000,000 per second",
    baseCost: new ExpantaNum(10000000000),
    type: "auto",
    value: new ExpantaNum(90000000),
    maxLevel: 99,
  },
];

function getDefaultUpgradeState() {
  return upgradeCatalog.reduce((accumulator, upgrade) => {
    accumulator[upgrade.id] = 0;
    return accumulator;
  }, {});
}

const defaultState = {
  points: new ExpantaNum(10),
  autoPoints: new ExpantaNum(0),
  currencyName: "points",
  backgroundColor: "#f3efe9",
  musicVolume: 0.4,
  upgrades: getDefaultUpgradeState(),
  lastTick: Date.now(),
  lastAutoSave: Date.now(),
  autoSaveInterval: 15,
};

const state = loadGame();
const cutsceneState = {
  pageIndex: 0,
  charIndex: 0,
  currentText: "",
  typingTimer: null,
  isTyping: false,
};

const elements = {
  slopCount: document.getElementById("slopCount"),
  autoRate: document.getElementById("autoRate"),
  upgradeList: document.getElementById("upgradeList"),
  blogList: document.getElementById("blogList"),
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
  musicVolumeSlider: document.getElementById("musicVolumeSlider"),
  musicVolumeValue: document.getElementById("musicVolumeValue"),
  toggleMusicButton: document.getElementById("toggleMusicButton"),
  bgMusic: document.getElementById("bgMusic"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
};

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
    return {
      ...defaultState,
      ...parsed,
      points: asEN(parsed.points, 10),
      autoPoints: asEN(parsed.autoPoints, 0),
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

function saveGame() {
  const saveData = {
    ...state,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
    lastTick: Date.now(),
    lastAutoSave: Date.now(),
  };

  localStorage.setItem("was-it-worth-it-save", JSON.stringify(saveData));
}

function exportSave() {
  const data = JSON.stringify({
    ...state,
    points: state.points.toString(),
    autoPoints: state.autoPoints.toString(),
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
    Object.assign(state, {
      ...defaultState,
      ...parsed,
      points: asEN(parsed.points, 10),
      autoPoints: asEN(parsed.autoPoints, 0),
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

function getUpgradeCost(upgrade) {
  const owned = state.upgrades[upgrade.id] || 0;
  const baseCost = asEN(upgrade.baseCost, 0);
  return baseCost.mul(new ExpantaNum(1.2).pow(owned));
}

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

function addPoints(amount) {
  const value = asEN(amount, 0);
  state.points = state.points.add(value);
}

function getCurrencyLabel() {
  if (!(state.upgrades.rename || 0)) {
    return "points";
  }

  return (state.currencyName || "points").trim() || "points";
}

function getEffectiveAutoPoints() {
  const additiveBonus = asEN(state.autoPoints, 0);
  const multiplierLevel = state.upgrades.multiplier || 0;
  const multiplier = new ExpantaNum(1.2).pow(multiplierLevel);
  return additiveBonus.mul(multiplier);
}

const blogEntries = [
  {
    title: "Entry 1 - 13/8/26",
    body: `it's me, the developer. god this ai is so annoying to work with.
    it's like i'm tweedle dee and it's tweedle dumb. but also wow this is like the philosopher's stone for coding.
    if it was bad but still. 
    i can just ask it to do stuff and it does. is it good? no. do i feel fulfilled?<br>
    <i>that's a good question.</i>`
  },
  {
    title: "Praesent pretium eget urna",
    body: "Praesent pretium eget urna id volutpat. Donec tristique, nisl ac mattis luctus, nisl nisl volutpat nunc, sed consectetur nisi magna in sapien. Integer euismod, risus vitae vulputate ultrices, sem justo tristique lorem, id elementum velit odio vitae mauris."
  },
  {
    title: "Curabitur vel eros a nibh",
    body: "Curabitur vel eros a nibh faucibus consectetur. Aliquam erat volutpat. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Phasellus eu nibh et sem vulputate commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas."
  }
];

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

function renderUpgradeList() {
  const currencyLabel = getCurrencyLabel();

  elements.upgradeList.innerHTML = upgradeCatalog
    .map((upgrade) => {
      const owned = state.upgrades[upgrade.id] || 0;
      const cost = getUpgradeCost(upgrade);
      const isMaxed = owned >= upgrade.maxLevel;
      const isAffordable = state.points.gte(cost);
      const shouldShowOwned = owned > 0 && upgrade.maxLevel !== 1;
      const displayName = upgrade.id === "starter" ? upgrade.name : `${upgrade.name}${shouldShowOwned ? ` x${owned}` : ""}`;
      const descriptionText = upgrade.type === "multiplier"
        ? "Multiplies all point gain by 1.2x after additive bonuses"
        : upgrade.description.replace(/point/gi, currencyLabel);

      return `
        <div class="upgrade-item">
          <div class="upgrade-copy">
            <h3>${displayName}</h3>
            <p>${descriptionText}</p>
          </div>
          <button class="buy-button" data-upgrade-id="${upgrade.id}" ${isMaxed || !isAffordable ? "disabled" : ""}>
            ${isMaxed ? "Bought" : `${formatEN(cost)} ${currencyLabel}`}
          </button>
        </div>
      `;
    })
    .join("");

  elements.upgradeList.querySelectorAll(".buy-button").forEach((button) => {
    button.type = "button";
    button.addEventListener("click", () => {
      const id = button.dataset.upgradeId;
      if (id) purchaseUpgrade(id);
    });
  });
}

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
}

function renderAutosave() {
  const value = Number(elements.autosaveSlider.value);
  state.autoSaveInterval = value;
  elements.autosaveValue.textContent = `${value}s`;
}

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
    elements.toggleMusicButton.textContent = isPlaying ? "shut up jazz" : "play some smooth jazz";
  }
}

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

  if (elements.currencyInput) {
    const currencyLocked = !renameUnlocked;
    elements.currencyInput.hidden = currencyLocked;
    elements.currencyInput.disabled = currencyLocked;
    elements.currencyInput.value = state.currencyName || "points";
    elements.currencyInput.title = renameUnlocked ? "Change your currency" : "LOCKED (omegalul)";
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
    if (elements.backgroundColorLockedBox) {
      elements.backgroundColorLockedBox.style.display = colorLocked ? "flex" : "none";
    }
  }

  refreshUpgradeButtonState();
}

function render() {
  renderStats();
  renderUpgradeList();
  renderBlog();
  renderAutosave();
  syncMusicControls();
}

function gameLoop() {
  const now = Date.now();
  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;

  const effectiveAutoPoints = getEffectiveAutoPoints();
  if (delta > 0 && effectiveAutoPoints.gt(0)) {
    addPoints(effectiveAutoPoints.mul(delta));
    renderStats();
  }

  const autosaveDelay = (state.autoSaveInterval || 15) * 1000;
  if (now - state.lastAutoSave >= autosaveDelay) {
    saveGame();
    state.lastAutoSave = now;
  }

  requestAnimationFrame(gameLoop);
}

function resetGame() {
  const confirmed = window.confirm("Reset the machine and go back to zero?");
  if (!confirmed) return;

  Object.assign(state, { ...defaultState, lastTick: Date.now(), lastAutoSave: Date.now() });
  localStorage.removeItem("was-it-worth-it-save");
  localStorage.removeItem("was-it-worth-it-intro");
  render();
  location.reload();
}

function manualSave() {
  saveGame();
  window.alert("Game saved.");
}

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

function setActiveTab(tabId) {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== tabId);
  });
}

function getCurrentCutscenePage() {
  return cutsceneTemplate.pages[cutsceneState.pageIndex] || [];
}

function getCurrentPageText() {
  const page = getCurrentCutscenePage();
  return page.map((line) => `<p>${line}</p>`).join("");
}

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

function finishIntro() {
  if (cutsceneState.typingTimer) {
    window.clearTimeout(cutsceneState.typingTimer);
  }

  localStorage.setItem("was-it-worth-it-intro", "true");
  elements.cutscene.classList.add("hidden");
  render();
  saveGame();
}

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

  state.currencyName = event.target.value || "points";
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

if (elements.blogList) {
  renderBlog();
}

if (elements.bgMusic) {
  elements.bgMusic.volume = Number.isFinite(state.musicVolume) ? state.musicVolume : 0.4;
}

render();
renderIntroCutscene();
requestAnimationFrame(gameLoop);
