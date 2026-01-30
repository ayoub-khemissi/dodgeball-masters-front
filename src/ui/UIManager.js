import { globalEvents } from "../utils/EventEmitter.js";
import { EVENTS, GAME_STATES, PLAYER, MAPS } from "../utils/Constants.js";
import { MathUtils } from "../utils/MathUtils.js";

/**
 * UIManager
 * Central manager for all UI components using Tailwind CSS
 */

export class UIManager {
  constructor() {
    this.container = null;
    this.hud = null;
    this.mainMenu = null;
    this.pauseMenu = null;
    this.settingsMenu = null;
    this.confirmationModal = null;
    this.matchEndScreen = null;
    this.countdown = null;
    this.roundAnnouncement = null;

    this.init();
    this.setupEventListeners();
  }

  init() {
    // Create UI container
    this.container = document.createElement("div");
    this.container.id = "ui-container";
    this.container.className =
      "fixed inset-0 pointer-events-none z-50 font-sans";
    document.body.appendChild(this.container);

    // Create UI elements
    this.createMainMenu();
    this.createHUD();
    this.createPauseMenu();
    this.createSettingsMenu();
    this.createConfirmationModal();
    this.createMatchEndScreen();
    this.createCountdown();
    this.createRoundAnnouncement();

    // Show main menu by default
    this.showMainMenu();
  }

  setupEventListeners() {
    globalEvents.on(EVENTS.ROUND_START, (data) => this.onRoundStart(data));
    globalEvents.on(EVENTS.ROUND_END, (data) => this.onRoundEnd(data));
    globalEvents.on(EVENTS.ROUND_COUNTDOWN, (data) => this.onCountdown(data));
    globalEvents.on(EVENTS.MATCH_END, (data) => this.onMatchEnd(data));
    globalEvents.on(EVENTS.PLAYER_DAMAGE, (data) => this.onPlayerDamage(data));
    globalEvents.on(EVENTS.MISSILE_DEFLECT, (data) => this.onDeflection(data));
    globalEvents.on(EVENTS.MISSILE_SPAWN, () => this.resetMissileStats());

    globalEvents.on(`state:${GAME_STATES.PLAYING}`, (data) =>
      this.onGamePlaying(data),
    );
    globalEvents.on(`state:${GAME_STATES.PAUSED}`, () => this.showPauseMenu());
    globalEvents.on(`state:${GAME_STATES.MENU}`, () => this.showMainMenu());
  }

  // --- UI Creation Methods ---

  createMainMenu() {
    this.mainMenu = document.createElement("div");
    this.mainMenu.className =
      "absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm pointer-events-auto transition-opacity duration-300";
    this.mainMenu.innerHTML = `
      <div class="panel-glass p-12 max-w-2xl w-full text-center transform transition-all duration-500 hover:border-cyan-500/30">
        <h1 class="text-6xl font-black mb-2 tracking-tighter bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-lg">
          DODGEBALL MASTERS
        </h1>
        <p class="text-xl text-slate-400 mb-8 tracking-[0.2em] font-light">TRAINING SIMULATION</p>

        <!-- Difficulty Selector -->
        <div class="mb-8">
          <p class="text-xs text-slate-500 uppercase tracking-widest mb-3">Bot Difficulty</p>
          <div class="flex justify-center gap-2" id="difficulty-selector">
            <button class="difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 hover:border-green-500/50 text-slate-400 hover:text-green-400" data-difficulty="easy">Easy</button>
            <button class="difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border border-cyan-500 bg-cyan-500/20 text-cyan-400" data-difficulty="medium">Medium</button>
            <button class="difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 hover:border-red-500/50 text-slate-400 hover:text-red-400" data-difficulty="hard">Hard</button>
            <button class="difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 hover:border-purple-500/50 text-slate-400 hover:text-purple-400" data-difficulty="apocalypse">Apocalypse</button>
          </div>
        </div>

        <!-- Map Selector -->
        <div class="mb-8">
          <p class="text-xs text-slate-500 uppercase tracking-widest mb-3">Arena Map</p>
          <div class="flex justify-center gap-2" id="map-selector">
            <button class="map-btn px-4 py-2 rounded text-sm font-bold transition-all border border-cyan-500 bg-cyan-500/20 text-cyan-400" data-map="orbital">Orbital</button>
            <button class="map-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 hover:border-purple-500/50 text-slate-400 hover:text-purple-400" data-map="gladiator">Gladiator</button>
          </div>
        </div>

        <div class="flex flex-col gap-4 max-w-xs mx-auto">
          <button class="btn-primary group cursor-pointer" id="btn-start">
            <span class="group-hover:translate-x-1 transition-transform inline-block">Start Training</span>
          </button>
          <button class="btn-secondary cursor-pointer" id="btn-settings-main">Settings</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.mainMenu);

    // Setup selectors
    this.setupDifficultySelector();
    this.setupMapSelector();
  }

  setupDifficultySelector() {
    this.selectedDifficulty = "medium";
    const buttons = this.mainMenu.querySelectorAll(".difficulty-btn");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Update selection
        this.selectedDifficulty = btn.dataset.difficulty;

        // Update button styles
        buttons.forEach((b) => {
          if (b.dataset.difficulty === this.selectedDifficulty) {
            const color = this.getDifficultyColor(b.dataset.difficulty);
            b.className = `difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border ${color.border} ${color.bg} ${color.text}`;
          } else {
            const hoverColor = this.getDifficultyColor(b.dataset.difficulty);
            b.className = `difficulty-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 ${hoverColor.hover} text-slate-400 ${hoverColor.hoverText}`;
          }
        });

        // Save preference
        localStorage.setItem(
          "dodgeball_bot_difficulty",
          this.selectedDifficulty,
        );

        // Emit event for Game to handle
        if (this.onDifficultyChange) {
          this.onDifficultyChange(this.selectedDifficulty);
        }
      });
    });

    // Load saved difficulty
    const saved = localStorage.getItem("dodgeball_bot_difficulty");
    if (saved && ["easy", "medium", "hard", "apocalypse"].includes(saved)) {
      this.selectedDifficulty = saved;
      // Trigger click to update UI
      const btn = this.mainMenu.querySelector(`[data-difficulty="${saved}"]`);
      if (btn) btn.click();
    }
  }

  setupMapSelector() {
    this.selectedMap = "orbital";
    const buttons = this.mainMenu.querySelectorAll(".map-btn");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectedMap = btn.dataset.map;

        buttons.forEach((b) => {
          if (b.dataset.map === this.selectedMap) {
            b.className =
              "map-btn px-4 py-2 rounded text-sm font-bold transition-all border border-cyan-500 bg-cyan-500/20 text-cyan-400";
          } else {
            b.className =
              "map-btn px-4 py-2 rounded text-sm font-bold transition-all border border-white/10 hover:border-purple-500/50 text-slate-400 hover:text-purple-400";
          }
        });

        localStorage.setItem("dodgeball_map_selection", this.selectedMap);

        if (this.onMapChange) {
          this.onMapChange(this.selectedMap);
        }
      });
    });

    const saved = localStorage.getItem("dodgeball_map_selection");
    if (saved && (saved === "orbital" || saved === "gladiator")) {
      const btn = this.mainMenu.querySelector(`[data-map="${saved}"]`);
      if (btn) btn.click();
    }
  }

  getMap() {
    return this.selectedMap;
  }

  bindMapChange(callback) {
    this.onMapChange = callback;
  }

  getDifficultyColor(difficulty) {
    switch (difficulty) {
      case "easy":
        return {
          border: "border-green-500",
          bg: "bg-green-500/20",
          text: "text-green-400",
          hover: "hover:border-green-500/50",
          hoverText: "hover:text-green-400",
        };
      case "hard":
        return {
          border: "border-red-500",
          bg: "bg-red-500/20",
          text: "text-red-400",
          hover: "hover:border-red-500/50",
          hoverText: "hover:text-red-400",
        };
      case "apocalypse":
        return {
          border: "border-purple-500",
          bg: "bg-purple-500/20",
          text: "text-purple-400",
          hover: "hover:border-purple-500/50",
          hoverText: "hover:text-purple-400",
        };
      default:
        return {
          border: "border-cyan-500",
          bg: "bg-cyan-500/20",
          text: "text-cyan-400",
          hover: "hover:border-cyan-500/50",
          hoverText: "hover:text-cyan-400",
        };
    }
  }

  getDifficulty() {
    return this.selectedDifficulty;
  }

  bindDifficultyChange(callback) {
    this.onDifficultyChange = callback;
  }

  createHUD() {
    this.hud = document.createElement("div");
    this.hud.className = "absolute inset-0 pointer-events-none hidden";
    this.hud.innerHTML = `
      <!-- Top Central Control Panel -->
      <div class="absolute top-0 left-1/2 -translate-x-1/2 flex items-stretch bg-slate-900/90 backdrop-blur-md border-x border-b border-white/10 rounded-b-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] animate-slide-in overflow-hidden">
        
        <!-- Player Score -->
        <div class="flex items-center gap-4 px-8 py-3 bg-linear-to-r from-cyan-500/10 to-transparent border-r border-white/5">
          <div class="flex flex-col items-start">
            <span class="text-[10px] font-black text-cyan-400 tracking-tighter uppercase leading-none mb-1">YOU</span>
            <div class="w-4 h-0.5 bg-cyan-500/50"></div>
          </div>
          <span class="text-4xl font-black text-white tabular-nums drop-shadow-sm" id="player-score">0</span>
        </div>

        <!-- Round Info -->
        <div class="px-6 flex flex-col items-center justify-center bg-white/5 min-w-25">
          <span class="text-[9px] font-bold text-slate-500 tracking-[0.3em] uppercase mb-0.5">MATCH</span>
          <span class="text-sm font-mono font-black text-slate-200" id="round-counter">ROUND 1</span>
        </div>

        <!-- Bot Score -->
        <div class="flex items-center gap-4 px-8 py-3 bg-linear-to-l from-rose-500/10 to-transparent border-l border-white/5 text-right">
          <span class="text-4xl font-black text-white tabular-nums drop-shadow-sm" id="bot-score">0</span>
          <div class="flex flex-col items-end">
            <span class="text-[10px] font-black text-rose-500 tracking-tighter uppercase leading-none mb-1">BOT</span>
            <div class="w-4 h-0.5 bg-rose-500/50"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Bar: Stats & Health -->
      <div class="absolute bottom-0 left-0 w-full p-8 flex flex-col items-center gap-4">
        
        <!-- Stats Pills -->
        <div class="flex gap-4 opacity-75">
          <div class="bg-slate-900/60 backdrop-blur px-4 py-1 rounded-full border border-white/10 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>
            <span class="text-xs font-mono text-slate-300" id="missile-speed">SPEED: 1.0x</span>
          </div>
          <div class="bg-slate-900/60 backdrop-blur px-4 py-1 rounded-full border border-white/10">
            <span class="text-xs font-mono text-slate-300" id="deflection-count">DEFLECTIONS: 0</span>
          </div>
        </div>

        <!-- Health Bar -->
        <div class="w-full max-w-md relative group">
          <div class="absolute -inset-1 bg-linear-to-r from-cyan-500 to-green-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div class="relative bg-slate-900/90 h-6 rounded-full overflow-hidden border border-white/10 shadow-xl">
            <div class="absolute top-0 left-0 h-full w-full bg-linear-to-r from-green-500 to-emerald-400 transition-all duration-300 ease-out" id="health-fill" style="width: 100%"></div>
            
            <!-- Health Text -->
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-black tracking-widest text-white drop-shadow-md z-10" id="health-text">100%</span>
            </div>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(this.hud);
  }

  createPauseMenu() {
    this.pauseMenu = document.createElement("div");
    this.pauseMenu.className =
      "absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur pointer-events-auto hidden z-50";
    this.pauseMenu.innerHTML = `
      <div class="panel-glass p-10 text-center min-w-75">
        <h2 class="text-3xl font-black text-white mb-8 tracking-widest border-b border-white/10 pb-4">PAUSED</h2>
        <div class="flex flex-col gap-4">
          <button class="btn-primary cursor-pointer" id="btn-resume">RESUME</button>
          <button class="btn-secondary cursor-pointer" id="btn-settings-open">SETTINGS</button>
          <button class="btn-secondary cursor-pointer" id="btn-quit">QUIT TO MENU</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.pauseMenu);
  }

  createSettingsMenu() {
    this.settingsMenu = document.createElement("div");
    this.settingsMenu.className =
      "absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur pointer-events-auto hidden z-50";
    this.settingsMenu.innerHTML = `
      <div class="panel-glass p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto flex flex-col">
        <h2 class="text-2xl font-black text-white mb-6 tracking-widest border-b border-white/10 pb-4 flex justify-between items-center">
          SETTINGS
          <button id="btn-settings-close" class="text-slate-400 hover:text-white transition-colors text-sm font-mono">[ ESC ]</button>
        </h2>

        <!-- Tabs -->
        <div class="flex gap-2 mb-6 border-b border-white/5 pb-1">
          <button class="px-4 py-2 text-sm font-bold uppercase tracking-wider text-cyan-400 border-b-2 border-cyan-400 transition-colors" data-tab="camera">Camera</button>
          <button class="px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors" data-tab="controls">Controls</button>
          <button class="px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors" data-tab="audio">Audio</button>
        </div>

        <!-- Camera Settings -->
        <div id="settings-camera" class="settings-content space-y-6">
          <div class="flex flex-col gap-2">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Camera Mode</label>
            <div class="flex bg-slate-800/50 rounded p-1 border border-white/5 w-fit">
              <button id="cam-mode-fps" class="px-4 py-1 text-xs font-bold rounded transition-colors bg-cyan-600 text-white">FPS</button>
              <button id="cam-mode-tps" class="px-4 py-1 text-xs font-bold rounded transition-colors text-slate-400 hover:text-white">TPS</button>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <div class="flex justify-between mb-1">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Field of View (FOV)</label>
                <span id="val-fov" class="text-xs font-mono text-cyan-400">60</span>
              </div>
              <input type="range" id="input-fov" min="40" max="80" value="60" class="w-full accent-cyan-500 bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer">
            </div>

            <div id="tps-settings" class="space-y-4 opacity-50 pointer-events-none transition-opacity">
               <div>
                <div class="flex justify-between mb-1">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Distance</label>
                  <span id="val-dist" class="text-xs font-mono text-cyan-400">4</span>
                </div>
                <input type="range" id="input-dist" min="1" max="10" value="4" step="0.1" class="w-full accent-cyan-500 bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer">
              </div>

              <div>
                <div class="flex justify-between mb-1">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Height Offset</label>
                  <span id="val-height" class="text-xs font-mono text-cyan-400">0.0</span>
                </div>
                <input type="range" id="input-height" min="0" max="2" value="0" step="0.1" class="w-full accent-cyan-500 bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer">
              </div>

              <div>
                <div class="flex justify-between mb-1">
                  <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Side Offset</label>
                  <span id="val-side" class="text-xs font-mono text-cyan-400">0.0</span>
                </div>
                <input type="range" id="input-side" min="-2" max="2" value="0" step="0.1" class="w-full accent-cyan-500 bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer">
              </div>
            </div>
          </div>
          <div class="pt-4 border-t border-white/5">
            <button id="btn-reset-camera" class="text-xs text-rose-400 hover:text-rose-300 transition-colors underline cursor-pointer">Reset Camera Defaults</button>
          </div>
        </div>

        <!-- Controls Settings -->
        <div id="settings-controls" class="settings-content hidden space-y-4">
          <p class="text-xs text-slate-500 mb-4">Click a button to rebind. Press ESC to cancel.</p>
          <div class="grid grid-cols-1 gap-3">
             <div class="flex items-center justify-between bg-slate-800/30 p-2 rounded border border-white/5">
                <span class="text-sm font-bold text-slate-300">Move Forward</span>
                <button class="key-bind-btn px-3 py-1 bg-slate-700 rounded text-xs font-mono text-white min-w-15 border border-white/10 hover:border-cyan-500 transition-colors" data-action="forward">KeyW</button>
             </div>
             <div class="flex items-center justify-between bg-slate-800/30 p-2 rounded border border-white/5">
                <span class="text-sm font-bold text-slate-300">Move Backward</span>
                <button class="key-bind-btn px-3 py-1 bg-slate-700 rounded text-xs font-mono text-white min-w-15 border border-white/10 hover:border-cyan-500 transition-colors" data-action="backward">KeyS</button>
             </div>
             <div class="flex items-center justify-between bg-slate-800/30 p-2 rounded border border-white/5">
                <span class="text-sm font-bold text-slate-300">Move Left</span>
                <button class="key-bind-btn px-3 py-1 bg-slate-700 rounded text-xs font-mono text-white min-w-15 border border-white/10 hover:border-cyan-500 transition-colors" data-action="left">KeyA</button>
             </div>
             <div class="flex items-center justify-between bg-slate-800/30 p-2 rounded border border-white/5">
                <span class="text-sm font-bold text-slate-300">Move Right</span>
                <button class="key-bind-btn px-3 py-1 bg-slate-700 rounded text-xs font-mono text-white min-w-15 border border-white/10 hover:border-cyan-500 transition-colors" data-action="right">KeyD</button>
             </div>
             <div class="flex items-center justify-between bg-slate-800/30 p-2 rounded border border-white/5">
                <span class="text-sm font-bold text-slate-300">Jump</span>
                <button class="key-bind-btn px-3 py-1 bg-slate-700 rounded text-xs font-mono text-white min-w-15 border border-white/10 hover:border-cyan-500 transition-colors" data-action="jump">Space</button>
             </div>
          </div>
          <div class="pt-4 border-t border-white/5">
            <button id="btn-reset-controls" class="text-xs text-rose-400 hover:text-rose-300 transition-colors underline cursor-pointer">Reset Control Defaults</button>
          </div>
        </div>

        <!-- Audio Settings -->
        <div id="settings-audio" class="settings-content hidden space-y-6">
          <div>
            <div class="flex justify-between mb-1">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Master Volume</label>
              <span id="val-volume" class="text-xs font-mono text-cyan-400">15%</span>
            </div>
            <input type="range" id="input-volume" min="0" max="100" value="15" class="w-full accent-cyan-500 bg-slate-700 h-1 rounded-lg appearance-none cursor-pointer">
          </div>
          <div class="pt-4 border-t border-white/5">
            <button id="btn-reset-audio" class="text-xs text-rose-400 hover:text-rose-300 transition-colors underline cursor-pointer">Reset Audio Defaults</button>
          </div>
        </div>

        <div class="mt-8 pt-6 border-t border-white/10 flex justify-end">
          <button id="btn-settings-save" class="btn-primary">Back</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.settingsMenu);

    this.setupSettingsTabs();
  }

  createConfirmationModal() {
    this.confirmationModal = document.createElement("div");
    this.confirmationModal.className =
      "absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto hidden z-[60]";
    this.confirmationModal.innerHTML = `
      <div class="panel-glass p-8 max-w-sm w-full text-center border-rose-500/30">
        <h3 class="text-xl font-bold text-white mb-4">Confirm Reset</h3>
        <p class="text-sm text-slate-300 mb-8" id="confirmation-message">Are you sure?</p>
        <div class="flex justify-center gap-4">
          <button class="btn-secondary min-w-25" id="btn-confirm-cancel">Cancel</button>
          <button class="btn-primary bg-rose-600 hover:bg-rose-500 border-rose-500 min-w-25" id="btn-confirm-ok">Confirm</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.confirmationModal);

    // Bind basic close/cancel
    document
      .getElementById("btn-confirm-cancel")
      .addEventListener("click", () => {
        this.confirmationModal.classList.add("hidden");
        this.confirmationModal.classList.remove("flex");
      });
  }

  showConfirmationModal(message, onConfirm) {
    document.getElementById("confirmation-message").textContent = message;

    // Replace old confirm button to clear previous listeners
    const oldBtn = document.getElementById("btn-confirm-ok");
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.addEventListener("click", () => {
      onConfirm();
      this.confirmationModal.classList.add("hidden");
      this.confirmationModal.classList.remove("flex");
    });

    this.confirmationModal.classList.remove("hidden");
    this.confirmationModal.classList.add("flex");
  }

  setupSettingsTabs() {
    const tabs = this.settingsMenu.querySelectorAll("[data-tab]");
    const contents = this.settingsMenu.querySelectorAll(".settings-content");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Reset tabs
        tabs.forEach((t) => {
          t.className =
            "px-4 py-2 text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors";
        });
        // Activate current
        tab.className =
          "px-4 py-2 text-sm font-bold uppercase tracking-wider text-cyan-400 border-b-2 border-cyan-400 transition-colors";

        // Show content
        const target = tab.dataset.tab;
        contents.forEach((content) => {
          if (content.id === `settings-${target}`) {
            content.classList.remove("hidden");
          } else {
            content.classList.add("hidden");
          }
        });
      });
    });
  }

  createMatchEndScreen() {
    this.matchEndScreen = document.createElement("div");
    this.matchEndScreen.className =
      "absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-md pointer-events-auto hidden z-50";
    this.matchEndScreen.innerHTML = `
      <div class="panel-glass p-12 text-center max-w-lg w-full transform transition-all">
        <h1 class="text-5xl font-black mb-2 tracking-tighter" id="result-title">VICTORY</h1>
        <div class="w-24 h-1 bg-linear-to-r from-transparent via-white to-transparent mx-auto mb-8 opacity-50"></div>
        
        <div class="flex justify-center items-center gap-8 mb-8">
          <div class="text-center">
            <p class="text-sm text-slate-400 uppercase tracking-wider mb-1">You</p>
            <span class="text-5xl font-black text-white" id="final-player-score">0</span>
          </div>
          <div class="text-2xl text-slate-600 font-light">vs</div>
          <div class="text-center">
            <p class="text-sm text-slate-400 uppercase tracking-wider mb-1">Bot</p>
            <span class="text-5xl font-black text-white" id="final-bot-score">0</span>
          </div>
        </div>

        <div class="bg-slate-800/50 rounded-xl p-4 mb-8 font-mono text-sm text-slate-300 space-y-2 border border-white/5" id="match-stats">
          <!-- Stats populated by JS -->
        </div>

        <div class="flex flex-col gap-3">
          <button class="btn-primary" id="btn-play-again">Play Again</button>
          <button class="btn-secondary" id="btn-main-menu">Main Menu</button>
        </div>
      </div>
    `;
    this.container.appendChild(this.matchEndScreen);
  }

  createCountdown() {
    this.countdown = document.createElement("div");
    this.countdown.className =
      "absolute inset-0 flex items-center justify-center pointer-events-none hidden z-40";
    this.countdown.innerHTML = `
      <span class="text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(6,182,212,0.8)] animate-pulse" id="countdown-number">3</span>
    `;
    this.container.appendChild(this.countdown);
  }

  createRoundAnnouncement() {
    this.roundAnnouncement = document.createElement("div");
    this.roundAnnouncement.className =
      "absolute inset-0 flex items-center justify-center pointer-events-none hidden z-40 bg-black/20";
    this.roundAnnouncement.innerHTML = `
      <div class="transform transition-all duration-300 scale-150" id="announcement-wrapper">
        <span class="text-6xl font-black tracking-tighter uppercase drop-shadow-2xl" id="announcement-text">ROUND 1</span>
      </div>
    `;
    this.container.appendChild(this.roundAnnouncement);
  }

  // --- Event Handlers ---

  onRoundStart(data) {
    document.getElementById("round-counter").textContent =
      `ROUND ${data.round}`;
    this.updateScores(data.playerScore, data.botScore);
    this.resetHUD();

    // Explicitly reset countdown text
    const number = document.getElementById("countdown-number");
    number.textContent = "3";
    number.classList.add("animate-pulse");
    number.classList.remove("animate-ping");

    this.countdown.classList.remove("hidden");
    this.countdown.classList.add("flex");
  }

  onCountdown(data) {
    const number = document.getElementById("countdown-number");
    number.textContent = data.value;

    // Switch to ping animation for counting down
    number.classList.remove("animate-pulse");
    number.classList.remove("animate-ping");
    void number.offsetWidth; // Trigger reflow
    number.classList.add("animate-ping");
  }

  onGamePlaying(data) {
    this.hidePauseMenu();
    this.countdown.classList.add("hidden");
    this.countdown.classList.remove("flex");
    this.hud.classList.remove("hidden");

    if (data && data.previousState === GAME_STATES.COUNTDOWN) {
      const number = document.getElementById("countdown-number");
      number.textContent = "GO!";
      number.classList.remove("animate-ping");
      number.classList.add("animate-pulse");

      this.countdown.classList.remove("hidden");
      this.countdown.classList.add("flex");

      setTimeout(() => {
        this.countdown.classList.add("hidden");
        this.countdown.classList.remove("flex");
      }, 500);
    }
  }

  onRoundEnd(data) {
    const isWin = data.winner === "player";
    const text = isWin ? "ROUND WON" : "ROUND LOST";
    const colorClass = isWin ? "text-green-400" : "text-rose-500";

    this.showAnnouncement(text, colorClass);
    this.updateScores(data.playerScore, data.botScore);
  }

  onMatchEnd(data) {
    this.hud.classList.add("hidden");
    const isWin = data.winner === "player";

    const title = document.getElementById("result-title");
    title.textContent = isWin ? "VICTORY" : "DEFEAT";
    title.className = `text-6xl font-black mb-2 tracking-tighter ${isWin ? "text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.5)]" : "text-rose-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]"}`;

    document.getElementById("final-player-score").textContent =
      data.playerScore;
    document.getElementById("final-bot-score").textContent = data.botScore;

    const stats = document.getElementById("match-stats");
    const duration = Math.floor(data.stats.matchDuration / 1000);
    stats.innerHTML = `
      <div class="flex justify-between border-b border-white/5 pb-2"><span>Match Duration</span> <span class="text-white">${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}</span></div>
      <div class="flex justify-between pt-2"><span>Total Deflections</span> <span class="text-white">${data.stats.totalDeflections}</span></div>
    `;

    this.matchEndScreen.classList.remove("hidden");
    this.matchEndScreen.classList.add("flex");
  }

  onPlayerDamage(data) {
    this.updateHealth(data.health, PLAYER.MAX_HEALTH);

    // Flash Red Overlay
    const flash = document.createElement("div");
    flash.className = "fixed inset-0 bg-red-500/20 pointer-events-none z-0";
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 150);
  }

  onDeflection(data) {
    const speedMultiplier = (data.speed / 5).toFixed(2);
    document.getElementById("missile-speed").textContent =
      `SPEED: ${speedMultiplier}x`;

    const defCount = data.deflector ? this.getDeflectionCount() + 1 : 0;
    document.getElementById("deflection-count").textContent =
      `DEFLECTIONS: ${defCount}`;
  }

  // --- Update Methods ---

  updateHealth(health, maxHealth = 100) {
    const fill = document.getElementById("health-fill");
    const text = document.getElementById("health-text");

    const clampedHealth = MathUtils.clamp(health, 0, maxHealth);
    const percentage = (clampedHealth / maxHealth) * 100;

    fill.style.width = `${percentage}%`;
    text.textContent = `${Math.round(clampedHealth)}%`;

    // Dynamic Color
    fill.className = `absolute top-0 left-0 h-full w-full transition-all duration-300 ease-out ${
      percentage > 50
        ? "bg-gradient-to-r from-green-500 to-emerald-400"
        : percentage > 20
          ? "bg-gradient-to-r from-yellow-500 to-orange-500"
          : "bg-gradient-to-r from-red-600 to-rose-500 animate-pulse"
    }`;
  }

  updateScores(playerScore, botScore) {
    document.getElementById("player-score").textContent = playerScore;
    document.getElementById("bot-score").textContent = botScore;
  }

  resetHUD() {
    this.updateHealth(PLAYER.MAX_HEALTH, PLAYER.MAX_HEALTH);
    this.resetMissileStats();
  }

  resetMissileStats() {
    document.getElementById("missile-speed").textContent = "SPEED: 1.0x";
    document.getElementById("deflection-count").textContent = "DEFLECTIONS: 0";
  }

  showAnnouncement(text, colorClass) {
    const announcement = document.getElementById("announcement-text");
    announcement.textContent = text;
    announcement.className = `text-6xl font-black tracking-tighter uppercase drop-shadow-2xl ${colorClass}`;

    this.roundAnnouncement.classList.remove("hidden");
    this.roundAnnouncement.classList.add("flex");

    // Simple fade out
    setTimeout(() => {
      this.roundAnnouncement.classList.remove("flex");
      this.roundAnnouncement.classList.add("hidden");
    }, 1500);
  }

  getDeflectionCount() {
    const text = document.getElementById("deflection-count").textContent;
    return parseInt(text.split(": ")[1]) || 0;
  }

  isSettingsOpen() {
    return !this.settingsMenu.classList.contains("hidden");
  }

  // --- Screen Management ---

  showMainMenu() {
    this.hideAll();
    this.mainMenu.classList.remove("hidden");
    this.mainMenu.classList.add("flex");
  }

  showHUD() {
    this.hideAll();
    this.hud.classList.remove("hidden");
  }

  showPauseMenu() {
    this.pauseMenu.classList.remove("hidden");
    this.pauseMenu.classList.add("flex");
  }

  hidePauseMenu() {
    this.pauseMenu.classList.remove("flex");
    this.pauseMenu.classList.add("hidden");
  }

  showSettingsMenu() {
    this.settingsMenu.classList.remove("hidden");
    this.settingsMenu.classList.add("flex");

    // If pause menu is open, hide it
    if (!this.pauseMenu.classList.contains("hidden")) {
      this.pauseMenu.classList.add("hidden");
      this.pauseMenu.dataset.wasOpen = "true";
    } else {
      this.pauseMenu.dataset.wasOpen = "false";
    }

    // If main menu is open, hide it
    if (!this.mainMenu.classList.contains("hidden")) {
      this.mainMenu.classList.add("hidden");
      this.mainMenu.dataset.wasOpen = "true";
    } else {
      this.mainMenu.dataset.wasOpen = "false";
    }
  }

  hideSettingsMenu() {
    this.settingsMenu.classList.add("hidden");
    this.settingsMenu.classList.remove("flex");

    // Restore previous menu
    if (this.pauseMenu.dataset.wasOpen === "true") {
      this.pauseMenu.classList.remove("hidden");
      this.pauseMenu.classList.add("flex");
    }

    if (this.mainMenu.dataset.wasOpen === "true") {
      this.mainMenu.classList.remove("hidden");
      this.mainMenu.classList.add("flex");
    }
  }

  hideAll() {
    [
      this.mainMenu,
      this.hud,
      this.pauseMenu,
      this.matchEndScreen,
      this.countdown,
      this.roundAnnouncement,
      this.settingsMenu,
      this.confirmationModal,
    ].forEach((el) => {
      if (el) {
        el.classList.add("hidden");
        el.classList.remove("flex");
      }
    });
  }

  // --- Bindings ---

  bindStartButton(callback) {
    document.getElementById("btn-start").addEventListener("click", callback);
  }

  bindResumeButton(callback) {
    document.getElementById("btn-resume").addEventListener("click", callback);
  }

  bindQuitButton(callback) {
    document.getElementById("btn-quit").addEventListener("click", callback);
  }

  bindPlayAgainButton(callback) {
    document
      .getElementById("btn-play-again")
      .addEventListener("click", callback);
  }

  bindMainMenuButton(callback) {
    document
      .getElementById("btn-main-menu")
      .addEventListener("click", callback);
  }

  bindSettingsActions(callbacks) {
    const {
      onCameraChange,
      onAudioChange,
      onControlChange,
      onResetCamera,
      onResetControls,
      onResetAudio,
      getValues,
    } = callbacks;

    // Open function
    const openSettings = () => {
      // Refresh values when opening
      const values = getValues();
      this.updateSettingsUI(values);
      this.showSettingsMenu();
    };

    // Open/Close
    document
      .getElementById("btn-settings-open")
      .addEventListener("click", openSettings);
    document
      .getElementById("btn-settings-main")
      .addEventListener("click", openSettings);

    document
      .getElementById("btn-settings-close")
      .addEventListener("click", () => this.hideSettingsMenu());
    document
      .getElementById("btn-settings-save")
      .addEventListener("click", () => this.hideSettingsMenu());

    // Camera Mode
    const btnFps = document.getElementById("cam-mode-fps");
    const btnTps = document.getElementById("cam-mode-tps");
    const tpsSettings = document.getElementById("tps-settings");

    const updateModeUI = (mode) => {
      if (mode === "fps") {
        btnFps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors bg-cyan-600 text-white";
        btnTps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors text-slate-400 hover:text-white";
        tpsSettings.classList.add("opacity-50", "pointer-events-none");
      } else {
        btnFps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors text-slate-400 hover:text-white";
        btnTps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors bg-cyan-600 text-white";
        tpsSettings.classList.remove("opacity-50", "pointer-events-none");
      }
    };

    btnFps.addEventListener("click", () => {
      updateModeUI("fps");
      onCameraChange({ mode: "fps" });
    });

    btnTps.addEventListener("click", () => {
      updateModeUI("tps");
      onCameraChange({ mode: "tps" });
    });

    // Sliders
    const bindSlider = (id, valId, key, transform = (v) => v) => {
      const el = document.getElementById(id);
      const label = document.getElementById(valId);
      el.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        label.textContent = transform(val);
        onCameraChange({ [key]: val });
      });
    };

    bindSlider("input-fov", "val-fov", "fov");
    bindSlider("input-dist", "val-dist", "distance");
    bindSlider("input-height", "val-height", "heightOffset", (v) =>
      v.toFixed(1),
    );
    bindSlider("input-side", "val-side", "sideOffset", (v) => v.toFixed(1));

    // Audio
    const volSlider = document.getElementById("input-volume");
    const volLabel = document.getElementById("val-volume");
    volSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      volLabel.textContent = `${Math.round(val)}%`;
      onAudioChange(val / 100);
    });

    // Controls
    const bindButtons = document.querySelectorAll(".key-bind-btn");
    bindButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const originalText = btn.textContent;

        btn.textContent = "...";
        btn.classList.add("bg-cyan-600", "text-white");

        const handleKey = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (e.code === "Escape") {
            btn.textContent = originalText;
          } else {
            btn.textContent = e.code;
            onControlChange(action, e.code);
          }

          btn.classList.remove("bg-cyan-600", "text-white");
          window.removeEventListener("keydown", handleKey);
        };

        window.addEventListener("keydown", handleKey, { once: true });
      });
    });

    // Reset Buttons
    document
      .getElementById("btn-reset-camera")
      .addEventListener("click", () => {
        this.showConfirmationModal("Reset camera settings to default?", () => {
          onResetCamera();
          this.updateSettingsUI(getValues());
        });
      });

    document
      .getElementById("btn-reset-controls")
      .addEventListener("click", () => {
        this.showConfirmationModal("Reset control bindings to default?", () => {
          onResetControls();
          this.updateSettingsUI(getValues());
        });
      });

    document.getElementById("btn-reset-audio").addEventListener("click", () => {
      this.showConfirmationModal("Reset audio settings to default?", () => {
        onResetAudio();
        this.updateSettingsUI(getValues());
      });
    });
  }
  updateSettingsUI(values) {
    if (!values) return;

    // Camera
    if (values.camera) {
      const { mode, fov, distance, heightOffset, sideOffset } = values.camera;

      // Mode
      const btnFps = document.getElementById("cam-mode-fps");
      const btnTps = document.getElementById("cam-mode-tps");
      const tpsSettings = document.getElementById("tps-settings");

      if (mode === "fps") {
        btnFps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors bg-cyan-600 text-white";
        btnTps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors text-slate-400 hover:text-white";
        tpsSettings.classList.add("opacity-50", "pointer-events-none");
      } else {
        btnFps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors text-slate-400 hover:text-white";
        btnTps.className =
          "px-4 py-1 text-xs font-bold rounded transition-colors bg-cyan-600 text-white";
        tpsSettings.classList.remove("opacity-50", "pointer-events-none");
      }

      // Sliders
      document.getElementById("input-fov").value = fov;
      document.getElementById("val-fov").textContent = fov;

      document.getElementById("input-dist").value = distance;
      document.getElementById("val-dist").textContent = distance;

      document.getElementById("input-height").value = heightOffset;
      document.getElementById("val-height").textContent =
        heightOffset.toFixed(1);

      document.getElementById("input-side").value = sideOffset;
      document.getElementById("val-side").textContent = sideOffset.toFixed(1);
    }

    // Audio
    if (values.volume !== undefined) {
      const vol = Math.round(values.volume * 100);
      document.getElementById("input-volume").value = vol;
      document.getElementById("val-volume").textContent = `${vol}%`;
    }

    // Controls
    if (values.bindings) {
      const btns = document.querySelectorAll(".key-bind-btn");
      btns.forEach((btn) => {
        const action = btn.dataset.action;
        if (values.bindings[action]) {
          btn.textContent = values.bindings[action];
        }
      });
    }
  }

  dispose() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
