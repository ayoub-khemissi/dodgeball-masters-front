import * as THREE from 'three';
import { Entity } from './Entity.js';
import { PLAYER, COLORS, DEFLECTION, TEAMS, EVENTS } from '../utils/Constants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { globalEvents } from '../utils/EventEmitter.js';
import { AssetManager } from '../core/AssetManager.js';

/**
 * Player
 * Controllable player character with jump ability
 */

export class Player extends Entity {
  constructor(inputManager, cameraController = null) {
    super();

    this.inputManager = inputManager;
    this.cameraController = cameraController;
    this.team = TEAMS.PLAYER;

    // Stats
    this.health = PLAYER.MAX_HEALTH;
    this.maxHealth = PLAYER.MAX_HEALTH;
    this.moveSpeed = PLAYER.MOVE_SPEED;

    // Jump physics
    this.velocityY = 0;
    this.isGrounded = true;
    this.jumpForce = PLAYER.JUMP_FORCE;
    this.gravity = PLAYER.GRAVITY;
    this.canJump = true;

    // Deflection
    this.canDeflect = true;
    this.deflectCooldown = 0;
    this.deflectRange = DEFLECTION.RANGE;
    this.deflectConeAngle = DEFLECTION.CONE_ANGLE;

    // State
    this.isAlive = true;
    this.isTargeted = false;
    this.facingDirection = new THREE.Vector3(0, 0, -1);
    this.rotationY = 0; // Player rotation controlled by mouse
    this.isMovementLocked = false;
    this.wasDeflectPressed = false;
    this.isDeflecting = false;
    this.deflectActiveTime = 0;

    // Missile reference for drag mechanic
    this.missile = null;

    // Visual elements
    this.weaponMesh = null;

    this.init();
  }

  init() {
    this.createMesh();
    this.loadWeapon();
  }

  loadWeapon() {
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

    // Scale the weapon
    weaponGroup.scale.set(0.015, 0.015, 0.015);

    // Position weapon at right hand position
    weaponGroup.position.set(0.35, PLAYER.HEIGHT * 0.45, -0.25);

    // Rotate weapon to point forward
    weaponGroup.rotation.set(0, Math.PI, 0);

    // Enable shadows
    weaponGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.weaponMesh = weaponGroup;
    this.mesh.add(weaponGroup);
  }

  createMesh() {
    // Player body (capsule-like shape)
    const group = new THREE.Group();

    // Body cylinder
    const bodyHeight = PLAYER.HEIGHT - PLAYER.RADIUS * 2;
    const bodyGeometry = new THREE.CylinderGeometry(
      PLAYER.RADIUS,
      PLAYER.RADIUS,
      bodyHeight,
      16
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.PLAYER,
      roughness: 0.4,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = PLAYER.HEIGHT / 2;
    body.castShadow = true;
    group.add(body);

    // Bottom sphere (legs/base)
    const bottomGeometry = new THREE.SphereGeometry(PLAYER.RADIUS, 16, 16);
    const bottom = new THREE.Mesh(bottomGeometry, bodyMaterial);
    bottom.position.y = PLAYER.RADIUS;
    bottom.castShadow = true;
    group.add(bottom);

    // Head sphere
    const headGeometry = new THREE.SphereGeometry(PLAYER.RADIUS * 0.8, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.PLAYER,
      roughness: 0.3,
      metalness: 0.5,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = PLAYER.HEIGHT - PLAYER.RADIUS * 0.8; // Align with top
    head.castShadow = true;
    group.add(head);

    // Direction indicator (small cone in front)
    const dirGeometry = new THREE.ConeGeometry(0.15, 0.3, 8);
    const dirMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
    });
    const dirIndicator = new THREE.Mesh(dirGeometry, dirMaterial);
    dirIndicator.rotation.x = Math.PI / 2;
    dirIndicator.position.set(0, PLAYER.HEIGHT / 2, -PLAYER.RADIUS - 0.2);
    group.add(dirIndicator);

    this.mesh = group;
    this.mesh.position.copy(this.position);
  }



  update(deltaTime, arena) {
    if (!this.isActive || !this.isAlive) return;

    // Handle movement input
    this.handleMovement(deltaTime, arena);

    // Handle rotation (always face camera direction)
    this.handleRotation();

    // Handle jump
    this.handleJump(deltaTime, arena);

    // Update deflect cooldown
    if (!this.canDeflect) {
      this.deflectCooldown -= deltaTime * 1000;
      if (this.deflectCooldown <= 0) {
        this.canDeflect = true;
        this.deflectCooldown = 0;
      }
    }

    // Handle deflection input (Single frame trigger)
    this.isDeflecting = false;
    const isDeflectPressed = this.inputManager.isDeflectPressed();

    if (isDeflectPressed && !this.wasDeflectPressed && this.canDeflect) {
      this.isDeflecting = true;
      this.canDeflect = false;
      this.deflectCooldown = DEFLECTION.COOLDOWN;

      // Emit pulse event for sound effect
      globalEvents.emit(EVENTS.PLAYER_DEFLECT, { player: this });
    }
    this.wasDeflectPressed = isDeflectPressed;

    // Handle missile drag mechanic
    // During drag window, mouse movement influences missile direction (no need to hold right-click)
    if (this.missile && this.missile.canBeDraggedBy(this)) {
      const rawDelta = this.inputManager.getRawMouseDelta();
      if (rawDelta.x !== 0 || rawDelta.y !== 0) {
        const camera = this.cameraController ? this.cameraController.camera : null;
        if (camera) {
          this.missile.applyDrag(rawDelta.x, rawDelta.y, camera);
        }
      }
    }

    // Update mesh position
    if (this.mesh) {
      this.mesh.position.copy(this.position);
    }
  }

  handleMovement(deltaTime, arena) {
    const input = this.inputManager.getMovementInput();

    if (input.x !== 0 || input.z !== 0) {
      // Get camera directions for movement
      let forward, right;

      if (this.cameraController) {
        forward = this.cameraController.getForwardDirection();
        right = this.cameraController.getRightDirection();
      } else {
        // Fallback if no camera
        forward = new THREE.Vector3(0, 0, -1);
        right = new THREE.Vector3(1, 0, 0);
      }

      // Calculate movement direction relative to camera
      const moveDirection = new THREE.Vector3();
      moveDirection.addScaledVector(forward, -input.z); // W/S
      moveDirection.addScaledVector(right, input.x);    // A/D

      if (moveDirection.length() > 0) {
        moveDirection.normalize();

        // Apply movement if not locked
        if (!this.isMovementLocked) {
          this.position.x += moveDirection.x * this.moveSpeed * deltaTime;
          this.position.z += moveDirection.z * this.moveSpeed * deltaTime;
        }
      }

      // Constrain to circular arena bounds
      if (arena && arena.constrainToBounds) {
        arena.constrainToBounds(this.position, PLAYER.RADIUS);
      }
    }
  }

  handleRotation() {
    if (this.cameraController) {
      // Get camera rotation
      this.rotationY = this.cameraController.getYaw();
      const pitch = this.cameraController.getPitch();

      // Update mesh rotation (yaw only)
      if (this.mesh) {
        this.mesh.rotation.y = this.rotationY;
      }

      // Update facing direction based on rotation (3D)
      // Pitch is positive when looking down, so Y component is negative sine
      this.facingDirection.set(
        -Math.sin(this.rotationY) * Math.cos(pitch),
        -Math.sin(pitch),
        -Math.cos(this.rotationY) * Math.cos(pitch)
      ).normalize();
    }
  }

  /**
   * Set camera controller reference
   */
  setCameraController(cameraController) {
    this.cameraController = cameraController;
  }

  /**
   * Set missile reference for drag mechanic
   */
  setMissile(missile) {
    this.missile = missile;
  }

  handleJump(deltaTime, arena) {
    // Get ground height at current position
    const groundHeight = arena && arena.getFloorHeight ? arena.getFloorHeight(this.position.x, this.position.z) : 0;

    // Check for jump input
    if (this.inputManager.isJumpPressed() && this.isGrounded && this.canJump) {
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
      this.canJump = false;
      // Ensure we start from at least ground height
      this.position.y = Math.max(this.position.y, groundHeight) + 0.1;
    }

    // Release jump lock when space is released
    if (!this.inputManager.isJumpPressed()) {
      this.canJump = true;
    }

    // Apply gravity
    if (!this.isGrounded) {
      this.velocityY -= this.gravity * deltaTime;
      this.position.y += this.velocityY * deltaTime;

      // Check ground collision
      if (this.position.y <= groundHeight) {
        this.position.y = groundHeight;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    } else {
      // Stay on ground (handle slopes)
      this.position.y = groundHeight;
    }
  }

  /**
   * Attempt to deflect the missile
   * Returns true if deflection conditions are met
   */
  tryDeflect(missile) {
    if (!this.isAlive) return false;

    // Can only deflect enemy missiles
    if (missile.teamId === this.team) return false;

    const missilePosition = missile.getPosition();

    // Check if missile is in deflect cone (use approx eye position for better feel)
    const eyePos = this.position.clone();
    eyePos.y += PLAYER.HEIGHT * 0.75;

    const inCone = MathUtils.isInCone(
      eyePos,
      this.facingDirection,
      missilePosition,
      this.deflectConeAngle,
      this.deflectRange
    );

    if (inCone && this.isDeflecting) {
      return true;
    }

    return false;
  }

  /**
   * Take damage
   */
  takeDamage(amount) {
    if (!this.isAlive) return;

    this.health -= amount;
    this.emit('damage', { amount, health: this.health });

    // Emit global event for UI
    globalEvents.emit(EVENTS.PLAYER_DAMAGE, { amount, health: this.health });

    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  /**
   * Handle death
   */
  die() {
    this.isAlive = false;
    this.emit('death', { player: this });

    // Visual feedback
    if (this.mesh) {
      this.mesh.visible = false;
    }
  }

  /**
   * Reset for new round
   */
  reset(spawnData) {
    this.health = this.maxHealth;
    this.isAlive = true;
    this.canDeflect = true;
    this.deflectCooldown = 0;
    this.isTargeted = false;
    this.velocityY = 0;
    this.isGrounded = true;
    this.position.y = 0;

    if (spawnData) {
      const pos = spawnData.position || spawnData;
      this.setPosition(pos.x, 0, pos.z);

      // Set rotation to face center
      if (spawnData.rotation !== undefined) {
        this.rotationY = spawnData.rotation;
        this.facingDirection.set(
          -Math.sin(this.rotationY),
          0,
          -Math.cos(this.rotationY)
        );
      } else {
        this.rotationY = 0;
        this.facingDirection.set(0, 0, -1);
      }
    } else {
      this.rotationY = 0;
      this.facingDirection.set(0, 0, -1);
    }

    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.rotation.y = this.rotationY;
    }
  }

  /**
   * Set targeted state
   */
  setTargeted(targeted) {
    this.isTargeted = targeted;
  }

  /**
   * Lock/unlock movement
   */
  setMovementLocked(locked) {
    this.isMovementLocked = locked;
  }

  /**
   * Get forward direction
   */
  getForwardDirection() {
    return this.facingDirection.clone();
  }
}
