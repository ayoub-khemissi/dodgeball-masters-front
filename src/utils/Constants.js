/**
 * Game Constants
 * Central configuration for all game parameters
 */

export const GAME = {
  ROUNDS_TO_WIN: 10,
  ROUND_START_DELAY: 3000, // ms before round starts
  ROUND_END_DELAY: 2000, // ms after round ends
};

export const PLAYER = {
  MAX_HEALTH: 100,
  MOVE_SPEED: 10,
  RADIUS: 0.3,
  HEIGHT: 1.35,
  JUMP_FORCE: 12,
  GRAVITY: 30,
};

export const BOT = {
  DEFLECT_RANGE: 6,
  DODGE_REACTION_DISTANCE: 6, // Start dodging when missile is this close
  STRAFE_DISTANCE: 12, // Ideal distance to maintain from player
  MIN_DISTANCE: 8, // Never get closer than this
  MAX_DISTANCE: 18, // Don't go further than this
};

// Bot difficulty presets (MOVE_SPEED same as player for fairness)
export const BOT_DIFFICULTY = {
  easy: {
    name: "Easy",
    BASE_ACCURACY: 0.7,
    ACCURACY_LOSS_PER_SPEED: 0.045,
    MIN_ACCURACY: 0.25,
    REACTION_DELAY: 120, // ms delay before reacting
    DRAG_SKILL: 0.5, // How well bot uses drag mechanic (0-1)
  },
  medium: {
    name: "Medium",
    BASE_ACCURACY: 0.88,
    ACCURACY_LOSS_PER_SPEED: 0.025,
    MIN_ACCURACY: 0.45,
    REACTION_DELAY: 50,
    DRAG_SKILL: 0.78,
  },
  hard: {
    name: "Hard",
    BASE_ACCURACY: 0.97,
    ACCURACY_LOSS_PER_SPEED: 0.008,
    MIN_ACCURACY: 0.7,
    REACTION_DELAY: 12,
    DRAG_SKILL: 0.95,
  },
  apocalypse: {
    name: "Apocalypse",
    BASE_ACCURACY: 0.97, // Same as hard
    ACCURACY_LOSS_PER_SPEED: 0.008, // Same as hard
    MIN_ACCURACY: 0.7, // Same as hard
    REACTION_DELAY: 12, // Same as hard
    DRAG_SKILL: 0.95, // Same as hard
    USE_ORBITAL_MOVEMENT: true, // Enable advanced orbital movement
    ORBIT_RADIUS: 3, // How wide the orbital arc is
    ORBIT_SPEED: 1.2, // Speed multiplier for orbital movement
  },
};

export const MISSILE = {
  BASE_SPEED: 5,
  SPEED_INCREMENT: 5,
  MAX_SPEED: 0,

  TURN_RATE: 0.1,

  BASE_DAMAGE: 50,
  DAMAGE_INCREMENT: 50,

  RADIUS: 0.3,
  SPAWN_HEIGHT: 5,
};

export const DEFLECTION = {
  RANGE: 8,
  CONE_ANGLE: Math.PI / 4, // 45 degrees cone
  COOLDOWN: 750, // ms

  // Drag mechanic - control missile direction after deflect
  DRAG_DURATION: 50, // ms - window to influence direction
  DRAG_STRENGTH: 2.5, // How much mouse movement affects direction
  DRAG_MAX_FORCE: 6, // Max force per frame (limits fast mouse movements)
};

export const ARENA = {
  RADIUS: 35, // Circular arena radius (larger)
  WALL_HEIGHT: 4,
  WATER_SIZE: 150, // Size of water plane
};

export const CAMERA = {
  FOV: 60,
  NEAR: 0.1,
  FAR: 1000,
  INITIAL_POSITION: { x: 0, y: 10, z: 20 },
  LOOK_AT: { x: 0, y: 0, z: 0 },
};

export const COLORS = {
  PLAYER: 0x3498db, // Blue
  BOT: 0xff8c00, // Dark Orange
  MISSILE: 0xffffff, // White (neutral/unused)
  MISSILE_TRAIL: 0xffffff,
  TEAM_PLAYER: 0x3498db,
  TEAM_BOT: 0xff8c00,
  ARENA_FLOOR: 0xf5f5f5,
  ARENA_WALL: 0xe0e0e0,
  ARENA_LINE: 0x3498db,
  WATER: 0x006994,
  SKY: 0x87ceeb,
  TARGET_INDICATOR: 0xff0000,
  DEFLECT_ZONE: 0x00ff00,
};

export const TEAMS = {
  PLAYER: "player",
  BOT: "bot",
};

export const GAME_STATES = {
  MENU: "menu",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  ROUND_END: "round_end",
  MATCH_END: "match_end",
  PAUSED: "paused",
};

export const EVENTS = {
  // Game flow
  GAME_START: "game:start",
  GAME_PAUSE: "game:pause",
  GAME_RESUME: "game:resume",

  // Round events
  ROUND_START: "round:start",
  ROUND_END: "round:end",
  ROUND_COUNTDOWN: "round:countdown",

  // Match events
  MATCH_END: "match:end",

  // Player events
  PLAYER_DAMAGE: "player:damage",
  PLAYER_DEATH: "player:death",
  PLAYER_DEFLECT: "player:deflect",

  // Missile events
  MISSILE_SPAWN: "missile:spawn",
  MISSILE_DEFLECT: "missile:deflect",
  MISSILE_HIT: "missile:hit",
  MISSILE_TARGET_CHANGE: "missile:targetChange",

  // UI events
  UI_UPDATE: "ui:update",
};
