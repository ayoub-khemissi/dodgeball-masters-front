import * as THREE from 'three';
import { CAMERA, PLAYER } from '../utils/Constants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { AssetManager } from './AssetManager.js';

/**
 * CameraController
 * First-Person / Third-Person camera with full mouse look control
 */

const CAMERA_MODE_STORAGE_KEY = 'dodgeball_camera_mode';
const CAMERA_SETTINGS_STORAGE_KEY = 'dodgeball_camera_settings';

export class CameraController {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );

    // Target to follow
    this.target = null;

    // Camera mode: 'fps' or 'tps' - load from localStorage or default to 'tps'
    this.mode = this.loadSavedMode();

    // Camera rotation (controlled by mouse)
    this.yaw = 0;   // Horizontal rotation (no limit, 360°)
    this.pitch = 0; // Vertical rotation (limited)

    // Pitch limits (in radians) - about 170° total range
    this.minPitch = -Math.PI * 0.4;  // Looking up (~72°)
    this.maxPitch = Math.PI * 0.45;   // Looking down (~81°)

    // Camera distance and offset from target (TPS mode)
    this.distance = 4;
    this.heightOffset = 0; // Height above target to look at
    this.sideOffset = 0; // Horizontal offset (Right +, Left -)
    this.targetOffset = new THREE.Vector3(0, 1.5, 0); // Offset on target

    // FPS settings
    this.fpsHeightOffset = PLAYER.HEIGHT * 0.9; // Eye level

    // Smoothing
    this.currentPosition = new THREE.Vector3();

    // Input manager reference (set later)
    this.inputManager = null;

    // FPS weapon (viewmodel attached to camera)
    this.fpsWeapon = null;
    this.loadFPSWeapon();

    // Collision detection
    this.raycaster = new THREE.Raycaster();
    this.arena = null;

    this.setInitialPosition();
    this.setupResizeHandler();
  }

  setArena(arena) {
    this.arena = arena;
  }

  loadFPSWeapon() {
    // Use preloaded model from AssetManager
    const weapon = AssetManager.getModelClone('weapon');
    if (!weapon) return;

    // Center the model (some GLTF exports have offset transforms)
    const box = new THREE.Box3().setFromObject(weapon);
    const center = box.getCenter(new THREE.Vector3());
    weapon.position.sub(center);

    // Wrap in a group for easier positioning
    const weaponGroup = new THREE.Group();
    weaponGroup.add(weapon);

    // Scale for FPS view
    weaponGroup.scale.set(0.012, 0.012, 0.012);

    // Position: bottom-right of screen, pointing forward
    weaponGroup.position.set(0.3, -0.25, -0.5);

    // Rotate weapon to point forward
    weaponGroup.rotation.set(0, Math.PI, 0);

    // Enable shadows
    weaponGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    this.fpsWeapon = weaponGroup;
    this.camera.add(weaponGroup);

    // Set initial visibility based on current mode
    this.fpsWeapon.visible = this.mode === 'fps';
  }

  setInitialPosition() {
    const { x, y, z } = CAMERA.INITIAL_POSITION;
    this.camera.position.set(x, y, z);
    this.currentPosition.copy(this.camera.position);
  }

  setupResizeHandler() {
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Set input manager for mouse control
   */
  setInputManager(inputManager) {
    this.inputManager = inputManager;

    // Listen for 'F' key to toggle camera mode
    if (this.inputManager) {
      this.inputManager.on('keydown', ({ key }) => {
        if (key === 'KeyF') {
          const newMode = this.toggleMode();
          console.log(`Camera mode switched to: ${newMode.toUpperCase()}`);
        }
      });
    }
  }

  /**
   * Set the target entity for the camera to follow
   */
  setTarget(target) {
    this.target = target;
    // Apply mesh visibility based on current mode (important when loading saved mode)
    this.updateTargetMeshVisibility();
  }

  /**
   * Update camera (call in game loop)
   */
  update(deltaTime) {
    // Handle mouse input for rotation
    if (this.inputManager && this.inputManager.isLocked()) {
      const mouseDelta = this.inputManager.getMouseDelta();

      // Update yaw (horizontal) - no limits
      this.yaw -= mouseDelta.x;

      // Update pitch (vertical) - with limits
      this.pitch += mouseDelta.y;
      this.pitch = MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);
    }

    if (!this.target) return;

    if (this.mode === 'fps') {
      this.updateFPS();
    } else {
      this.updateTPS();
    }
  }

  /**
   * Update camera in First-Person mode
   */
  updateFPS() {
    // Position camera at player's eye level
    const targetPos = this.target.position ? this.target.position.clone() : new THREE.Vector3();

    const desiredPosition = new THREE.Vector3(
      targetPos.x,
      targetPos.y + this.fpsHeightOffset,
      targetPos.z
    );

    // Instant position in FPS (no smoothing for responsiveness)
    this.camera.position.copy(desiredPosition);
    this.currentPosition.copy(desiredPosition);

    // Look direction based on yaw and pitch
    const lookDirection = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    const lookTarget = desiredPosition.clone().add(lookDirection);
    this.camera.lookAt(lookTarget);
  }

  /**
   * Update camera in Third-Person mode
   */
  updateTPS() {
    // Get target position
    const targetPos = this.target.position ? this.target.position.clone() : new THREE.Vector3();
    targetPos.add(this.targetOffset);

    // Calculate camera position based on spherical coordinates
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    const verticalDistance = this.distance * Math.sin(this.pitch);

    // Calculate base position from rotation
    let camX = targetPos.x + horizontalDistance * Math.sin(this.yaw);
    let camY = targetPos.y + verticalDistance + this.heightOffset;
    let camZ = targetPos.z + horizontalDistance * Math.cos(this.yaw);

    // Apply side offset (Right vector: cos(yaw), 0, -sin(yaw))
    let offsetX = 0;
    let offsetZ = 0;

    if (this.sideOffset !== 0) {
      offsetX = this.sideOffset * Math.cos(this.yaw);
      offsetZ = this.sideOffset * -Math.sin(this.yaw);

      camX += offsetX;
      camZ += offsetZ;
    }

    const desiredPosition = new THREE.Vector3(camX, camY, camZ);

    // Camera Collision Detection
    if (this.arena && this.arena.model) {
      const direction = new THREE.Vector3().subVectors(desiredPosition, targetPos);
      const dist = direction.length();
      
      if (dist > 0.001) {
        direction.normalize();

        this.raycaster.set(targetPos, direction);
        this.raycaster.far = dist;

        // Intersect with arena model
        const intersects = this.raycaster.intersectObject(this.arena.model, true);

        if (intersects.length > 0) {
          // We hit something, clamp distance
          // Add a small buffer to avoid seeing through the wall
          const hitDist = Math.max(0.2, intersects[0].distance - 0.2);
          desiredPosition.copy(targetPos).add(direction.multiplyScalar(hitDist));
        }
      }
    }

    // Direct camera positioning (No smoothing)
    this.currentPosition.copy(desiredPosition);

    this.camera.position.copy(this.currentPosition);

    // Look at target (offsetted to maintain parallel view)
    const lookAtTarget = targetPos.clone();
    lookAtTarget.x += offsetX;
    lookAtTarget.y += this.heightOffset; // Apply height offset to target to maintain pitch
    lookAtTarget.z += offsetZ;
    this.camera.lookAt(lookAtTarget);
  }

  /**
   * Get the forward direction of the camera (for movement)
   */
  getForwardDirection() {
    // Forward direction on XZ plane based on yaw
    return new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    ).normalize();
  }

  /**
   * Get the right direction of the camera (for strafing)
   */
  getRightDirection() {
    return new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();
  }

  /**
   * Get current yaw angle
   */
  getYaw() {
    return this.yaw;
  }

  /**
   * Get current pitch angle
   */
  getPitch() {
    return this.pitch;
  }

  /**
   * Set camera to TPS mode following a player
   */
  setTPSMode(player) {
    this.mode = 'tps';
    this.target = player;
    this.updateTargetMeshVisibility();
  }

  /**
   * Set camera to FPS mode following a player
   */
  setFPSMode(player) {
    this.mode = 'fps';
    this.target = player;
    this.updateTargetMeshVisibility();
  }

  /**
   * Toggle between FPS and TPS modes
   */
  toggleMode() {
    if (this.mode === 'fps') {
      this.mode = 'tps';
    } else {
      this.mode = 'fps';
    }

    // Save preference to localStorage
    this.saveMode();

    // Hide/show local player mesh based on camera mode
    this.updateTargetMeshVisibility();

    return this.mode;
  }

  /**
   * Update target mesh visibility based on camera mode
   * In FPS mode, hide the local player's mesh to avoid seeing own body
   */
  updateTargetMeshVisibility() {
    if (this.target && this.target.mesh) {
      // In FPS mode, hide the player mesh (locally only)
      // In TPS mode, show the player mesh
      this.target.mesh.visible = this.mode !== 'fps';
    }

    // Update FPS weapon visibility
    if (this.fpsWeapon) {
      this.fpsWeapon.visible = this.mode === 'fps';
    }
  }

  /**
   * Get current camera mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Load saved camera mode from localStorage
   */
  loadSavedMode() {
    try {
      const savedMode = localStorage.getItem(CAMERA_MODE_STORAGE_KEY);
      if (savedMode === 'fps' || savedMode === 'tps') {
        return savedMode;
      }
    } catch (e) {
      // localStorage might not be available
      console.warn('Could not load camera mode from localStorage:', e);
    }
    return 'fps'; // Default to first-person
  }

  /**
   * Save camera mode to localStorage
   */
  saveMode() {
    try {
      localStorage.setItem(CAMERA_MODE_STORAGE_KEY, this.mode);
    } catch (e) {
      console.warn('Could not save camera mode to localStorage:', e);
    }
  }

  /**
   * Apply saved camera mode and set target player
   * Use this instead of setTPSMode/setFPSMode to respect user preference
   */
  applySavedMode(player) {
    this.target = player;
    this.loadSavedSettings();
    this.updateTargetMeshVisibility();
  }

  /**
   * Load saved camera settings from localStorage
   */
  loadSavedSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY));
      if (saved) {
        if (saved.fov !== undefined) this.setFOV(saved.fov);
        if (saved.distance !== undefined) this.distance = saved.distance;
        if (saved.heightOffset !== undefined) this.heightOffset = saved.heightOffset;
        if (saved.sideOffset !== undefined) this.sideOffset = saved.sideOffset;
        return;
      }
    } catch (e) {
      console.warn('Could not load camera settings from localStorage:', e);
    }
    // Defaults if nothing saved
    this.distance = 4;
    this.heightOffset = 0;
    this.sideOffset = 0;
  }

  /**
   * Set camera to overview mode (for menu/spectating)
   */
  setOverviewMode() {
    this.target = { position: new THREE.Vector3(0, 0, 0) };
    this.distance = 35;
    this.heightOffset = 10;
    this.yaw = 0;
    this.pitch = Math.PI * 0.25; // Looking down at 45°
  }

  /**
   * Reset camera rotation
   */
  resetRotation(yaw = 0) {
    this.yaw = yaw;
    this.pitch = 0;
  }

  /**
   * Set camera rotation
   */
  setRotation(yaw, pitch) {
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
  }

  /**
   * Set camera yaw
   */
  setYaw(yaw) {
    this.yaw = yaw;
  }

  setFOV(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setDistance(distance) {
    this.distance = distance;
  }

  setOffsets(height, side) {
    if (height !== undefined) this.heightOffset = height;
    if (side !== undefined) this.sideOffset = side;
  }

  getCamera() {
    return this.camera;
  }

  resetDefaults() {
    this.mode = 'tps';
    this.setFOV(60);
    this.distance = 4;
    this.heightOffset = 0;
    this.sideOffset = 0;
    this.saveMode();
    // Note: Caller needs to handle target mesh visibility update if needed
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
  }
}
