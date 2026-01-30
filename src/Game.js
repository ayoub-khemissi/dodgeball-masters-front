import * as THREE from 'three';

// Core
import { SceneManager } from './core/SceneManager.js';
import { CameraController } from './core/CameraController.js';
import { Renderer } from './core/Renderer.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';
import { AssetManager } from './core/AssetManager.js';

// Entities
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { Missile } from './entities/Missile.js';
import { Arena } from './entities/Arena.js';
import { Explosion } from './entities/Explosion.js';
import { DeflectEffect } from './entities/DeflectEffect.js';

// Systems
import { CollisionSystem } from './systems/CollisionSystem.js';
import { GameStateManager } from './systems/GameStateManager.js';
import { RoundManager } from './systems/RoundManager.js';

// UI
import { UIManager } from './ui/UIManager.js';

// Utils
import { GAME_STATES, EVENTS, PLAYER } from './utils/Constants.js';
import { globalEvents } from './utils/EventEmitter.js';

/**
 * Game
 * Main game class that orchestrates all systems
 */

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.isRunning = false;
    this.clock = new THREE.Clock();
    this.lastInputTime = 0;
    this.explosions = [];
    this.explosionPools = { player: [], bot: [] };
    this.deflectEffects = [];

    // Initialize all systems
    this.initCore();
    this.initEntities();
    this.initSystems();
    this.initUI();
    this.setupEventListeners();

    console.log('Dodgeball Masters initialized!');
  }

  initCore() {
    // Scene
    this.sceneManager = new SceneManager();
    this.scene = this.sceneManager.getScene();

    // Camera
    this.cameraController = new CameraController();
    this.camera = this.cameraController.getCamera();

    // Renderer
    this.renderer = new Renderer(this.canvas);

    // Input
    this.inputManager = new InputManager();

    // Audio
    this.audioManager = new AudioManager();
  }

  initEntities() {
    // Get saved map or default
    const savedMap = localStorage.getItem('dodgeball_map_selection') || 'orbital';

    // Arena
    this.arena = new Arena(savedMap);
    this.scene.add(this.arena.getMesh());

    // Give camera access to arena for collision
    this.cameraController.setArena(this.arena);

    // Give camera access to input manager for mouse look
    this.cameraController.setInputManager(this.inputManager);

    // Player (with camera reference for movement direction)
    this.player = new Player(this.inputManager, this.cameraController);
    this.scene.add(this.player.getMesh());

    // Bot
    this.bot = new Bot();
    this.scene.add(this.bot.getMesh());

    // Missile
    this.missile = new Missile();
    this.scene.add(this.missile.getMesh());
    this.scene.add(this.missile.getTrail());

    // Give player missile reference for drag mechanic
    this.player.setMissile(this.missile);

    // Give bot references for AI behavior
    this.bot.setReferences(this.player, this.missile);

    // Set initial positions
    const spawnPositions = this.arena.getSpawnPositions();
    this.player.setPosition(spawnPositions.player.position.x, 0, spawnPositions.player.position.z);
    this.bot.setPosition(spawnPositions.bot.position.x, 0, spawnPositions.bot.position.z);

    // Hide entities initially
    this.player.getMesh().visible = false;
    this.bot.getMesh().visible = false;
    this.missile.hide();

    // Set camera to overview mode initially (for menu)
    this.cameraController.setOverviewMode();

    // Warm up shaders by pre-rendering explosion materials
    this.warmupShaders();
  }

  /**
   * Pre-compile shaders by rendering dummy explosions once
   * This prevents lag spikes when explosions spawn during gameplay
   */
  warmupShaders() {
    // Create dummy explosions for both teams to compile their shaders
    const dummyExplosions = [
      new Explosion(new THREE.Vector3(0, -100, 0), 'player'),
      new Explosion(new THREE.Vector3(0, -100, 0), 'bot'),
    ];

    // Add to scene temporarily
    for (const exp of dummyExplosions) {
      this.scene.add(exp.getMesh());
    }

    // Render one frame to compile shaders
    this.renderer.render(this.scene, this.camera);

    // Remove and dispose dummy explosions
    for (const exp of dummyExplosions) {
      this.scene.remove(exp.getMesh());
      exp.dispose();
    }
  }

  recreateArena(mapId) {
    // Remove old arena
    this.scene.remove(this.arena.getMesh());
    this.arena.dispose();

    // Create new arena
    this.arena = new Arena(mapId);
    this.scene.add(this.arena.getMesh());

    // Update camera reference
    this.cameraController.setArena(this.arena);

    // Update references in systems
    this.roundManager.setEntities(this.player, this.bot, this.missile, this.arena);
    
    // Update spawn positions
    const spawnPositions = this.arena.getSpawnPositions();
    this.player.setPosition(spawnPositions.player.position.x, 0, spawnPositions.player.position.z);
    this.bot.setPosition(spawnPositions.bot.position.x, 0, spawnPositions.bot.position.z);
    
    // Reset rotations
    this.cameraController.setRotation(spawnPositions.player.rotation, Math.PI / 12);
  }

  initSystems() {
    // Game state
    this.gameStateManager = new GameStateManager();

    // Collision
    this.collisionSystem = new CollisionSystem(this.audioManager);
    this.collisionSystem.setEntities(this.player, this.bot, this.missile);

    // Round manager
    this.roundManager = new RoundManager(this.gameStateManager, this.audioManager);
    this.roundManager.setEntities(this.player, this.bot, this.missile, this.arena);
  }

  initUI() {
    this.uiManager = new UIManager();

    // Bind UI buttons
    this.uiManager.bindStartButton(() => this.startGame());
    this.uiManager.bindResumeButton(() => this.resumeGame());
    this.uiManager.bindQuitButton(() => this.quitToMenu());
    this.uiManager.bindPlayAgainButton(() => this.startGame());
    this.uiManager.bindMainMenuButton(() => this.quitToMenu());

    // Bind difficulty change
    this.uiManager.bindDifficultyChange((difficulty) => {
      this.bot.setDifficulty(difficulty);
    });

    // Apply saved difficulty
    const savedDifficulty = this.uiManager.getDifficulty();
    if (savedDifficulty) {
      this.bot.setDifficulty(savedDifficulty);
    }

    // Bind Settings
    this.uiManager.bindSettingsActions({
      getValues: () => {
        const cam = this.cameraController;
        let savedCam = {};
        try {
          savedCam = JSON.parse(localStorage.getItem('dodgeball_camera_settings')) || {};
        } catch (e) { }

        return {
          camera: {
            mode: cam.mode,
            fov: savedCam.fov || cam.camera.fov,
            distance: savedCam.distance !== undefined ? savedCam.distance : 4,
            heightOffset: savedCam.heightOffset !== undefined ? savedCam.heightOffset : 0,
            sideOffset: savedCam.sideOffset !== undefined ? savedCam.sideOffset : 0
          },
          volume: this.audioManager.volume,
          bindings: this.inputManager.bindings
        };
      },
      onCameraChange: (changes) => {
        if (changes.mode) {
          if (changes.mode === 'fps') this.cameraController.setFPSMode(this.player);
          else this.cameraController.setTPSMode(this.player);
          this.cameraController.saveMode();
        }

        if (changes.fov) this.cameraController.setFOV(changes.fov);
        if (changes.distance) this.cameraController.setDistance(changes.distance);

        // Handle offsets
        if (changes.heightOffset !== undefined || changes.sideOffset !== undefined) {
          this.cameraController.setOffsets(changes.heightOffset, changes.sideOffset);
        }

        // Save camera settings
        const settings = {
          fov: this.cameraController.camera.fov,
          distance: this.cameraController.distance,
          heightOffset: this.cameraController.heightOffset,
          sideOffset: this.cameraController.sideOffset
        };
        localStorage.setItem('dodgeball_camera_settings', JSON.stringify(settings));
      },
      onAudioChange: (volume) => {
        this.audioManager.setVolume(volume);
        localStorage.setItem('dodgeball_audio_volume', volume);
      },
      onControlChange: (action, key) => {
        this.inputManager.setBinding(action, key);
        localStorage.setItem('dodgeball_key_bindings', JSON.stringify(this.inputManager.bindings));
      },
      onResetCamera: () => {
        this.cameraController.resetDefaults();
        // Clear storage to rely on defaults or explicitly save defaults
        localStorage.removeItem('dodgeball_camera_settings');
        localStorage.removeItem('dodgeball_camera_mode');
      },
      onResetControls: () => {
        this.inputManager.resetBindings();
        localStorage.removeItem('dodgeball_key_bindings');
      },
      onResetAudio: () => {
        this.audioManager.resetDefaults();
        localStorage.removeItem('dodgeball_audio_volume');
      }
    });

    this.loadSettings();
  }

  loadSettings() {
    // Load Camera Settings
    try {
      const camSettings = JSON.parse(localStorage.getItem('dodgeball_camera_settings'));
      if (camSettings) {
        if (camSettings.fov) this.cameraController.setFOV(camSettings.fov);
        if (camSettings.distance) this.cameraController.setDistance(camSettings.distance);
        this.cameraController.setOffsets(camSettings.heightOffset, camSettings.sideOffset);
      }
    } catch (e) { console.warn('Failed to load camera settings', e); }

    // Load Audio Settings
    try {
      const vol = localStorage.getItem('dodgeball_audio_volume');
      if (vol !== null) {
        this.audioManager.setVolume(parseFloat(vol));
      }
    } catch (e) { console.warn('Failed to load audio settings', e); }

    // Load Controls
    try {
      const bindings = JSON.parse(localStorage.getItem('dodgeball_key_bindings'));
      if (bindings) {
        for (const [action, key] of Object.entries(bindings)) {
          this.inputManager.setBinding(action, key);
        }
      }
    } catch (e) { console.warn('Failed to load key bindings', e); }
  }

  setupEventListeners() {
    // Pointer lock change handler - only used for detecting external unlock (clicking outside, etc.)
    this.inputManager.on('pointerlockchange', (isLocked) => {
      const currentState = this.gameStateManager.getState();

      if (!isLocked) {
        // Pointer was unlocked externally (not by our pause action)
        // Only auto-pause if we're in an active game state and not already handling it
        if (currentState !== GAME_STATES.MENU &&
          currentState !== GAME_STATES.PAUSED &&
          currentState !== GAME_STATES.MATCH_END) {
          this.pauseGame();
        }
      }
    });

    // Handle pointer lock errors - just retry silently
    this.inputManager.on('pointerlockerror', () => {
      // Retry after a short delay if game is not paused
      setTimeout(() => {
        const currentState = this.gameStateManager.getState();
        if (currentState !== GAME_STATES.MENU &&
          currentState !== GAME_STATES.PAUSED &&
          currentState !== GAME_STATES.MATCH_END) {
          this.inputManager.requestPointerLock(this.canvas);
        }
      }, 100);
    });

    // Listen for state changes
    globalEvents.on(`state:${GAME_STATES.PLAYING}`, (data) => {
      // Only start gameplay logic (missile spawn) if coming from countdown
      if (data && data.previousState === GAME_STATES.COUNTDOWN) {
        this.roundManager.startRoundGameplay();
      }
      // Always unlock movement when entering playing state (start or resume)
      this.player.setMovementLocked(false);
    });

    globalEvents.on(`state:${GAME_STATES.COUNTDOWN}`, () => {
      // Lock movement during countdown
      this.player.setMovementLocked(true);
    });

    // Handle Escape key for pause/resume toggle
    this.inputManager.on('keydown', ({ key }) => {
      if (key === 'Escape') {
        // 1. If Settings are open, close them first
        if (this.uiManager.isSettingsOpen()) {
          this.uiManager.hideSettingsMenu();
          return;
        }

        const currentState = this.gameStateManager.getState();

        // 2. If paused, resume
        if (currentState === GAME_STATES.PAUSED) {
          this.resumeGame();
          return;
        }

        // 3. If in active game state, pause
        if (currentState === GAME_STATES.PLAYING ||
          currentState === GAME_STATES.COUNTDOWN ||
          currentState === GAME_STATES.ROUND_END) {
          this.pauseGame();
        }
      }
    });

    globalEvents.on(EVENTS.ROUND_START, () => {
      this.roundManager.setupRound();
      this.player.getMesh().visible = true;
      this.bot.getMesh().visible = true;

      // Apply saved camera mode (respects user preference)
      this.cameraController.applySavedMode(this.player);

      // Set initial rotation from spawn data
      const spawnPositions = this.arena.getSpawnPositions();
      this.cameraController.setRotation(spawnPositions.player.rotation, Math.PI / 12);
    });

    // Spawn explosion on missile hit
    globalEvents.on(EVENTS.MISSILE_HIT, (data) => {
      this.spawnExplosion(data.target);
    });

    // Spawn deflect effect when player activates deflection (not under cooldown)
    globalEvents.on(EVENTS.PLAYER_DEFLECT, (data) => {
      this.audioManager.play('pulse');
      this.spawnDeflectEffect(data.player);
    });

    // Spawn deflect effect when bot deflects (bot only deflects on actual hit)
    globalEvents.on(EVENTS.MISSILE_DEFLECT, (data) => {
      // Only spawn effect for bot (player effect is handled by PLAYER_DEFLECT)
      if (data.deflector !== this.player) {
        this.spawnDeflectEffect(data.deflector);
      }
    });

  }

  startGame() {
    // Check if map changed
    const selectedMap = this.uiManager.getMap();
    if (this.arena.mapId !== selectedMap) {
      this.recreateArena(selectedMap);
    }

    this.uiManager.hideAll();
    this.player.getMesh().visible = true;
    this.bot.getMesh().visible = true;

    // Apply saved camera mode (respects user preference)
    this.cameraController.applySavedMode(this.player);
    this.loadSettings();

    // Lock pointer for mouse look
    this.inputManager.requestPointerLock(this.canvas);

    this.gameStateManager.startMatch();
  }

  pauseGame() {
    const currentState = this.gameStateManager.getState();
    if (currentState !== GAME_STATES.MENU &&
      currentState !== GAME_STATES.PAUSED &&
      currentState !== GAME_STATES.MATCH_END) {
      this.gameStateManager.pause();
      this.uiManager.showPauseMenu();
      this.inputManager.exitPointerLock();
    }
  }

  resumeGame() {
    if (this.gameStateManager.isState(GAME_STATES.PAUSED)) {
      this.gameStateManager.resume();
      this.uiManager.hidePauseMenu();
      this.inputManager.requestPointerLock(this.canvas);
    }
  }

  quitToMenu() {
    this.gameStateManager.returnToMenu();
    this.uiManager.showMainMenu();

    // Release pointer lock
    this.inputManager.exitPointerLock();

    // Reset and hide entities
    this.player.getMesh().visible = false;
    this.bot.getMesh().visible = false;
    this.missile.hide();

    // Clear explosions
    for (const explosion of this.explosions) {
      this.scene.remove(explosion.getMesh());
      explosion.dispose();
    }
    this.explosions = [];

    // Clear deflect effects
    for (const effect of this.deflectEffects) {
      this.scene.remove(effect.getMesh());
      effect.dispose();
    }
    this.deflectEffects = [];

    // Switch back to overview camera
    this.cameraController.setOverviewMode();
  }

  /**
   * Main game loop
   */
  update() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this.update());

    const deltaTime = this.clock.getDelta();
    const state = this.gameStateManager.getState();

    // Always update arena (water animation)
    this.arena.update(deltaTime);

    // Update based on state
    switch (state) {
      case GAME_STATES.MENU:
        // Just render the scene with overview camera
        break;

      case GAME_STATES.COUNTDOWN:
        this.gameStateManager.updateCountdown(deltaTime, this.audioManager);
        // Allow player rotation/camera control during countdown (movement locked)
        this.player.update(deltaTime, this.arena);
        break;

      case GAME_STATES.PLAYING:
        this.updateGameplay(deltaTime);
        break;

      case GAME_STATES.PAUSED:
        // Don't update gameplay
        break;

      case GAME_STATES.ROUND_END:
        // Wait for next round
        break;

      case GAME_STATES.MATCH_END:
        // Wait for user input
        break;
    }

    // Update active explosions
    this.updateExplosions(deltaTime);

    // Update deflect effects
    this.updateDeflectEffects(deltaTime);

    // Always update camera and render
    this.cameraController.update(deltaTime);
    this.renderer.render(this.scene, this.camera);
  }

  spawnExplosion(target) {
    const position = target.getPosition();
    position.y += PLAYER.HEIGHT / 2;
    const teamId = this.missile.teamId;
    
    // Try to get from pool
    let explosion;
    const pool = this.explosionPools[teamId];
    
    if (pool && pool.length > 0) {
      explosion = pool.pop();
      explosion.reset(position);
    } else {
      explosion = new Explosion(position, teamId);
    }
    
    this.explosions.push(explosion);
    this.scene.add(explosion.getMesh());
  }

  spawnDeflectEffect(deflector) {
    // Position at deflector's eye level
    const position = deflector.getPosition();
    position.y += PLAYER.HEIGHT * 0.75;

    // Direction the deflector is facing
    const direction = deflector.getForwardDirection();

    // Team ID for coloring
    const teamId = deflector.team;

    const effect = new DeflectEffect(position, direction, teamId);
    this.deflectEffects.push(effect);
    this.scene.add(effect.getMesh());
  }

  updateExplosions(deltaTime) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.update(deltaTime);
      if (explosion.isDone()) {
        this.scene.remove(explosion.getMesh());
        
        // Return to pool
        const teamId = explosion.teamId;
        if (this.explosionPools[teamId]) {
          this.explosionPools[teamId].push(explosion);
        } else {
          explosion.dispose();
        }
        
        this.explosions.splice(i, 1);
      }
    }
  }

  updateDeflectEffects(deltaTime) {
    for (let i = this.deflectEffects.length - 1; i >= 0; i--) {
      const effect = this.deflectEffects[i];
      effect.update(deltaTime);
      if (effect.isDone()) {
        this.scene.remove(effect.getMesh());
        effect.dispose();
        this.deflectEffects.splice(i, 1);
      }
    }
  }

  updateGameplay(deltaTime) {
    // Update player with arena for collision bounds
    this.player.update(deltaTime, this.arena);

    // Update bot (pass missile position for AI tracking)
    const missilePos = this.missile.isActive ? this.missile.getPosition() : null;
    this.bot.update(deltaTime, missilePos, this.arena);

    // Update missile
    if (this.missile.isActive) {
      this.missile.update(deltaTime, this.arena);
    }

    // Update collision system
    this.collisionSystem.update();
  }

  /**
   * Start the game loop
   */
  start() {
    this.isRunning = true;
    this.clock.start();
    this.update();
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();

    // Dispose all systems
    this.sceneManager.dispose();
    this.cameraController.dispose();
    this.renderer.dispose();
    this.inputManager.dispose();
    this.audioManager.dispose();

    // Dispose entities
    this.arena.dispose();
    this.player.dispose();
    this.bot.dispose();
    this.missile.dispose();

    // Dispose explosions
    for (const explosion of this.explosions) {
      explosion.dispose();
    }
    this.explosions = [];

    // Dispose explosion pools
    for (const pool of Object.values(this.explosionPools)) {
      for (const explosion of pool) {
        explosion.dispose();
      }
    }
    this.explosionPools = { player: [], bot: [] };

    // Dispose deflect effects
    for (const effect of this.deflectEffects) {
      effect.dispose();
    }
    this.deflectEffects = [];

    // Dispose systems
    this.collisionSystem.dispose();
    this.roundManager.dispose();

    // Dispose UI
    this.uiManager.dispose();

    // Dispose cached assets
    AssetManager.dispose();

    // Clear global events
    globalEvents.clear();
  }
}
