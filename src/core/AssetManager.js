import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AssetManager
 * Centralized asset loading and caching system.
 * Preloads all game assets before gameplay to prevent lag spikes.
 */

// Asset manifest - all assets to preload
const ASSET_MANIFEST = {
  models: {
    missile: '/src/models/missile/0/scene.gltf',
    explosion: '/src/models/explosions/0/scene.gltf',
    weapon: '/src/models/weapons/sci-fi-weapon/scene.gltf',
    arena: '/src/models/maps/0/scene.gltf',
  },
  textures: {
    explosionBlue: '/src/models/explosions/0/textures/Fire_diffuse_blue.png',
    explosionOrange: '/src/models/explosions/0/textures/Fire_diffuse_orange.png',
  },
};

// Explosion colors
const EXPLOSION_COLORS = {
  player: new THREE.Color(0.0, 0.4, 1.0),
  bot: new THREE.Color(1.0, 0.24, 0.0),
};

class AssetManagerClass {
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();

    // Cached assets
    this.models = new Map();
    this.textures = new Map();

    // Pre-built materials for explosions (to avoid shader compilation lag)
    this.explosionMaterials = {
      player: { main: null, pointy: null },
      bot: { main: null, pointy: null },
    };

    // Loading state
    this.isLoaded = false;
    this.totalAssets = 0;
    this.loadedAssets = 0;

    // Callbacks
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
  }

  /**
   * Preload all game assets
   * @param {Function} onProgress - Callback with progress (0-1)
   * @param {Function} onComplete - Callback when all assets are loaded
   */
  async preloadAll(onProgress, onComplete) {
    this.onProgressCallback = onProgress;
    this.onCompleteCallback = onComplete;

    const modelKeys = Object.keys(ASSET_MANIFEST.models);
    const textureKeys = Object.keys(ASSET_MANIFEST.textures);
    this.totalAssets = modelKeys.length + textureKeys.length;
    this.loadedAssets = 0;

    const promises = [];

    // Load all models
    for (const key of modelKeys) {
      promises.push(this.loadModel(key, ASSET_MANIFEST.models[key]));
    }

    // Load all textures
    for (const key of textureKeys) {
      promises.push(this.loadTexture(key, ASSET_MANIFEST.textures[key]));
    }

    try {
      await Promise.all(promises);

      // Create pre-built materials after all textures are loaded
      this.createExplosionMaterials();

      this.isLoaded = true;
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    } catch (error) {
      console.error('AssetManager: Failed to load assets', error);
      // Still mark as loaded to allow game to proceed (with fallbacks)
      this.isLoaded = true;
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    }
  }

  /**
   * Load a GLTF model
   */
  loadModel(key, path) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          this.models.set(key, gltf.scene);
          this.updateProgress();
          resolve(gltf.scene);
        },
        undefined,
        (error) => {
          console.error(`AssetManager: Failed to load model ${key}:`, error);
          this.updateProgress();
          resolve(null); // Resolve anyway to not block other assets
        }
      );
    });
  }

  /**
   * Load a texture
   */
  loadTexture(key, path) {
    return new Promise((resolve) => {
      this.textureLoader.load(
        path,
        (texture) => {
          // Configure texture for explosion use
          texture.flipY = false;
          this.textures.set(key, texture);
          this.updateProgress();
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`AssetManager: Failed to load texture ${key}:`, error);
          this.updateProgress();
          resolve(null);
        }
      );
    });
  }

  /**
   * Update loading progress
   */
  updateProgress() {
    this.loadedAssets++;
    const progress = this.loadedAssets / this.totalAssets;
    if (this.onProgressCallback) {
      this.onProgressCallback(progress);
    }
  }

  /**
   * Create pre-built explosion materials after textures are loaded
   * This pre-compiles shaders to avoid lag spikes during gameplay
   */
  createExplosionMaterials() {
    const teams = ['player', 'bot'];
    const textureKeys = { player: 'explosionBlue', bot: 'explosionOrange' };

    for (const team of teams) {
      const texture = this.textures.get(textureKeys[team]);
      const color = EXPLOSION_COLORS[team];

      // Main explosion material (with texture)
      this.explosionMaterials[team].main = new THREE.MeshStandardMaterial({
        map: texture || null,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: color,
        emissiveIntensity: 0.3,
      });

      // Pointy explosion material (color only)
      this.explosionMaterials[team].pointy = new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        emissive: color,
        emissiveIntensity: 0.5,
      });
    }
  }

  /**
   * Get a clone of a preloaded model
   * @param {string} key - Model key from manifest
   * @returns {THREE.Group|null} Cloned model or null if not found
   */
  getModelClone(key) {
    const original = this.models.get(key);
    if (!original) {
      console.warn(`AssetManager: Model "${key}" not found`);
      return null;
    }
    return original.clone();
  }

  /**
   * Get a preloaded texture (textures are shared, not cloned)
   * @param {string} key - Texture key from manifest
   * @returns {THREE.Texture|null} Texture or null if not found
   */
  getTexture(key) {
    const texture = this.textures.get(key);
    if (!texture) {
      console.warn(`AssetManager: Texture "${key}" not found`);
      return null;
    }
    return texture;
  }

  /**
   * Get cloned explosion materials for a team
   * Materials are cloned so each explosion can have independent opacity
   * @param {string} teamId - 'player' or 'bot'
   * @returns {Object} { main: Material, pointy: Material }
   */
  getExplosionMaterials(teamId) {
    const team = teamId === 'player' ? 'player' : 'bot';
    const source = this.explosionMaterials[team];

    if (!source.main || !source.pointy) {
      console.warn(`AssetManager: Explosion materials for "${team}" not ready`);
      return { main: null, pointy: null };
    }

    return {
      main: source.main.clone(),
      pointy: source.pointy.clone(),
    };
  }

  /**
   * Check if all assets are loaded
   */
  isReady() {
    return this.isLoaded;
  }

  /**
   * Dispose of all cached assets
   */
  dispose() {
    // Dispose models
    for (const model of this.models.values()) {
      model.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    this.models.clear();

    // Dispose textures
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();

    this.isLoaded = false;
  }
}

// Export singleton instance
export const AssetManager = new AssetManagerClass();
