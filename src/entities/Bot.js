import * as THREE from "three";
import { Entity } from "./Entity.js";
import {
  PLAYER,
  COLORS,
  DEFLECTION,
  TEAMS,
  BOT,
  BOT_DIFFICULTY,
  MISSILE,
  ARENA,
} from "../utils/Constants.js";
import { MathUtils } from "../utils/MathUtils.js";
import { AssetManager } from "../core/AssetManager.js";

/**
 * Bot
 * AI-controlled opponent for training mode
 * - Moves intelligently to dodge and position
 * - Has accuracy affected by missile speed
 * - Difficulty levels: easy, medium, hard
 */

export class Bot extends Entity {
  constructor() {
    super();

    this.team = TEAMS.BOT;

    // Stats (same as player)
    this.health = PLAYER.MAX_HEALTH;
    this.maxHealth = PLAYER.MAX_HEALTH;

    // Deflection
    this.deflectRange = BOT.DEFLECT_RANGE;
    this.deflectConeAngle = DEFLECTION.CONE_ANGLE;
    this.canDeflect = true;
    this.deflectCooldown = 0;

    // Movement (same speed as player for fairness)
    this.moveSpeed = PLAYER.MOVE_SPEED;

    // Difficulty settings (defaults to medium)
    this.difficulty = "medium";
    this.baseAccuracy = BOT_DIFFICULTY.medium.BASE_ACCURACY;
    this.accuracyLossPerSpeed = BOT_DIFFICULTY.medium.ACCURACY_LOSS_PER_SPEED;
    this.minAccuracy = BOT_DIFFICULTY.medium.MIN_ACCURACY;
    this.reactionDelay = BOT_DIFFICULTY.medium.REACTION_DELAY;
    this.dragSkill = BOT_DIFFICULTY.medium.DRAG_SKILL;

    // Orbital movement (apocalypse difficulty)
    this.useOrbitalMovement = false;
    this.orbitRadius = 3;
    this.orbitSpeed = 1.2;
    this.orbitAngle = 0; // Current angle in orbital movement

    // State
    this.isAlive = true;
    this.isTargeted = false;
    this.facingDirection = new THREE.Vector3(0, 0, 1);

    // AI state
    this.playerRef = null;
    this.missileRef = null;
    this.dodgeDirection = 1; // 1 = right, -1 = left
    this.dodgeTimer = 0;
    this.aiState = "idle"; // 'idle', 'strafing', 'dodging', 'approaching'
    this.reactionTimer = 0; // Delay before attempting deflect

    // Visual elements
    this.weaponMesh = null;

    this.init();
  }

  /**
   * Set bot difficulty
   */
  setDifficulty(level) {
    const preset = BOT_DIFFICULTY[level];
    if (!preset) {
      console.warn(`Unknown difficulty: ${level}`);
      return;
    }

    this.difficulty = level;
    this.baseAccuracy = preset.BASE_ACCURACY;
    this.accuracyLossPerSpeed = preset.ACCURACY_LOSS_PER_SPEED;
    this.minAccuracy = preset.MIN_ACCURACY;
    this.reactionDelay = preset.REACTION_DELAY;
    this.dragSkill = preset.DRAG_SKILL;

    // Orbital movement (for apocalypse difficulty)
    this.useOrbitalMovement = preset.USE_ORBITAL_MOVEMENT || false;
    this.orbitRadius = preset.ORBIT_RADIUS || 3;
    this.orbitSpeed = preset.ORBIT_SPEED || 1.2;
  }

  /**
   * Get current difficulty
   */
  getDifficulty() {
    return this.difficulty;
  }

  init() {
    this.createMesh();
    this.loadWeapon();
  }

  loadWeapon() {
    // Use preloaded model from AssetManager
    const weapon = AssetManager.getModelClone("weapon");
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
    const group = new THREE.Group();

    // Body cylinder
    const bodyHeight = PLAYER.HEIGHT - PLAYER.RADIUS * 2;
    const bodyGeometry = new THREE.CylinderGeometry(
      PLAYER.RADIUS,
      PLAYER.RADIUS,
      bodyHeight,
      16,
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.BOT,
      roughness: 0.4,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = PLAYER.HEIGHT / 2;
    body.castShadow = true;
    group.add(body);

    // Bottom sphere
    const bottomGeometry = new THREE.SphereGeometry(PLAYER.RADIUS, 16, 16);
    const bottom = new THREE.Mesh(bottomGeometry, bodyMaterial);
    bottom.position.y = PLAYER.RADIUS;
    bottom.castShadow = true;
    group.add(bottom);

    // Head Group (for rotation)
    this.headGroup = new THREE.Group();
    const headCenterY = PLAYER.HEIGHT - PLAYER.RADIUS * 0.8;
    this.headGroup.position.y = headCenterY;

    // Head sphere
    const headGeometry = new THREE.SphereGeometry(PLAYER.RADIUS * 0.8, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.BOT,
      roughness: 0.3,
      metalness: 0.5,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.castShadow = true;
    this.headGroup.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const eyeY = 0.3 * PLAYER.RADIUS;
    const eyeZ = PLAYER.RADIUS * 0.6;

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.2, eyeY, eyeZ);
    this.headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.2, eyeY, eyeZ);
    this.headGroup.add(rightEye);

    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pupilZ = PLAYER.RADIUS * 0.7;

    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-0.2, eyeY, pupilZ);
    this.headGroup.add(leftPupil);

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(0.2, eyeY, pupilZ);
    this.headGroup.add(rightPupil);

    group.add(this.headGroup);

    this.mesh = group;
    this.mesh.position.copy(this.position);
  }

  /**
   * Set references for AI behavior
   */
  setReferences(player, missile) {
    this.playerRef = player;
    this.missileRef = missile;
  }

  update(deltaTime, missilePosition = null) {
    if (!this.isActive || !this.isAlive) return;

    // Update deflect cooldown
    if (!this.canDeflect) {
      this.deflectCooldown -= deltaTime * 1000;
      if (this.deflectCooldown <= 0) {
        this.canDeflect = true;
        this.deflectCooldown = 0;
      }
    }

    // Update reaction timer (for deflect delay)
    if (
      this.missileRef &&
      this.missileRef.isActive &&
      this.missileRef.target === this
    ) {
      this.reactionTimer += deltaTime * 1000;
    } else {
      this.reactionTimer = 0;
    }

    // Update dodge timer
    this.dodgeTimer -= deltaTime;
    if (this.dodgeTimer <= 0) {
      this.dodgeTimer = 0.5 + Math.random() * 1; // Change direction every 0.5-1.5s
      this.dodgeDirection = Math.random() > 0.5 ? 1 : -1;
    }

    // AI Movement
    this.updateAI(deltaTime, missilePosition);

    // Handle missile drag (bot can also influence missile direction after deflect)
    this.handleDrag();

    // Face the missile or player
    if (missilePosition && this.missileRef && this.missileRef.isActive) {
      this.facePosition(missilePosition);
    } else if (this.playerRef) {
      this.facePosition(this.playerRef.getPosition());
    }

    super.update(deltaTime);
  }

  /**
   * Handle missile drag mechanic (bot aims toward player)
   */
  handleDrag() {
    if (!this.missileRef || !this.missileRef.canBeDraggedBy(this)) return;
    if (!this.playerRef) return;

    // Calculate direction to player
    const missilePos = this.missileRef.getPosition();
    const playerPos = this.playerRef.getPosition();
    const toPlayer = new THREE.Vector3().subVectors(playerPos, missilePos);
    toPlayer.y = 0; // Keep horizontal
    toPlayer.normalize();

    // Current missile direction
    const missileDir = this.missileRef.direction.clone();
    missileDir.y = 0;
    missileDir.normalize();

    // Calculate how much to adjust (cross product gives perpendicular direction)
    const cross = new THREE.Vector3().crossVectors(missileDir, toPlayer);
    const dot = missileDir.dot(toPlayer);

    // Only adjust if not already pointing at player
    if (dot < 0.99) {
      // Determine drag direction (left or right)
      const dragDirection = cross.y > 0 ? 1 : -1;

      // Apply drag based on skill (higher skill = more accurate drag)
      // Add some randomness based on inverse of skill
      const randomFactor = (1 - this.dragSkill) * (Math.random() - 0.5) * 2;
      const dragAmount = (this.dragSkill + randomFactor * 0.5) * 15;

      // Simulate mouse movement
      const deltaX = dragDirection * dragAmount;
      const deltaY = (Math.random() - 0.5) * 5 * (1 - this.dragSkill); // Vertical inaccuracy

      // Create a fake camera for drag calculation (looking at player)
      const fakeCamera = {
        matrixWorld: new THREE.Matrix4().lookAt(
          this.position,
          playerPos,
          new THREE.Vector3(0, 1, 0),
        ),
      };

      this.missileRef.applyDrag(deltaX, deltaY, fakeCamera);
    }
  }

  /**
   * Calculate orbital movement around missile
   * Returns a movement vector that arcs around the rocket
   */
  calculateOrbitalMovement(missilePosition, botPosition, missileDistance) {
    // Direction from missile to bot
    const toBot = new THREE.Vector3()
      .subVectors(botPosition, missilePosition)
      .normalize();

    // Perpendicular direction (for orbital movement)
    const perpendicular = new THREE.Vector3(-toBot.z, 0, toBot.x).normalize();

    // Increment orbit angle over time
    this.orbitAngle += 0.05; // Smooth continuous rotation

    // Calculate orbital arc
    // Mix perpendicular movement (tangential) with approach (radial)
    const tangentialWeight = Math.sin(this.orbitAngle) * this.orbitSpeed;
    const radialWeight = Math.cos(this.orbitAngle) * 0.5;

    // Create movement vector that circles around while approaching
    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(perpendicular, tangentialWeight);
    moveVector.addScaledVector(toBot, -radialWeight); // Negative to approach missile

    return moveVector;
  }

  /**
   * AI movement logic
   */
  updateAI(deltaTime, missilePosition) {
    if (!this.playerRef) return;

    const playerPos = this.playerRef.getPosition();
    const botPos = this.position.clone();
    const toPlayer = new THREE.Vector3().subVectors(playerPos, botPos);
    const distanceToPlayer = toPlayer.length();
    toPlayer.normalize();

    // Calculate strafe direction (perpendicular to player direction)
    const strafeDir = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();

    let moveDirection = new THREE.Vector3();

    // Check if missile is targeting us and close
    const isBeingTargeted =
      this.missileRef &&
      this.missileRef.isActive &&
      this.missileRef.target === this;

    let missileDistance = Infinity;
    if (missilePosition && this.missileRef && this.missileRef.isActive) {
      missileDistance = botPos.distanceTo(missilePosition);
    }

    // APOCALYPSE DIFFICULTY: Use orbital movement when missile is approaching
    if (
      this.useOrbitalMovement &&
      isBeingTargeted &&
      missilePosition &&
      missileDistance < BOT.DEFLECT_RANGE * 1.5 &&
      this.canDeflect
    ) {
      // Orbital approach - circle around the rocket while moving toward it
      this.aiState = "orbital_approach";
      const orbitalMove = this.calculateOrbitalMovement(
        missilePosition,
        botPos,
        missileDistance,
      );
      moveDirection.copy(orbitalMove);
    } else {
      // Standard difficulty logic
      // Determine AI state
      if (
        isBeingTargeted &&
        missileDistance < BOT.DODGE_REACTION_DISTANCE &&
        !this.canDeflect
      ) {
        // Dodge when missile is close and we can't deflect
        this.aiState = "dodging";
      } else if (distanceToPlayer > BOT.MAX_DISTANCE) {
        // Approach if too far
        this.aiState = "approaching";
      } else if (distanceToPlayer < BOT.MIN_DISTANCE) {
        // Back away if too close - prioritize keeping distance
        this.aiState = "retreating";
      } else {
        // Strafe around player at comfortable distance
        this.aiState = "strafing";
      }

      // Execute movement based on state
      switch (this.aiState) {
        case "dodging":
          // Dodge perpendicular to missile direction, also back away
          if (missilePosition) {
            const toMissile = new THREE.Vector3()
              .subVectors(missilePosition, botPos)
              .normalize();
            const dodgeDir = new THREE.Vector3(-toMissile.z, 0, toMissile.x);
            moveDirection.addScaledVector(dodgeDir, this.dodgeDirection);
            // Also back away from missile
            moveDirection.addScaledVector(toMissile, -0.3);
          }
          break;

        case "approaching":
          moveDirection.addScaledVector(toPlayer, 0.6);
          moveDirection.addScaledVector(strafeDir, this.dodgeDirection * 0.4);
          break;

        case "retreating":
          // Back away more aggressively when too close
          moveDirection.addScaledVector(toPlayer, -0.9);
          moveDirection.addScaledVector(strafeDir, this.dodgeDirection * 0.2);
          break;

        case "strafing":
        default:
          // Maintain distance while strafing
          const distanceError = distanceToPlayer - BOT.STRAFE_DISTANCE;
          const distanceCorrection = Math.max(
            -0.3,
            Math.min(0.3, distanceError * 0.1),
          );
          moveDirection.addScaledVector(strafeDir, this.dodgeDirection);
          moveDirection.addScaledVector(toPlayer, distanceCorrection);
          break;
      }
    }

    // Apply movement
    if (moveDirection.lengthSq() > 0) {
      moveDirection.normalize();
      this.position.x += moveDirection.x * this.moveSpeed * deltaTime;
      this.position.z += moveDirection.z * this.moveSpeed * deltaTime;

      // Constrain to arena
      this.constrainToArena();

      // Update mesh position
      if (this.mesh) {
        this.mesh.position.copy(this.position);
      }
    }
  }

  /**
   * Keep bot inside arena bounds
   */
  constrainToArena() {
    const maxDist = ARENA.RADIUS - PLAYER.RADIUS - 1;
    const distXZ = Math.sqrt(this.position.x ** 2 + this.position.z ** 2);

    if (distXZ > maxDist) {
      const scale = maxDist / distXZ;
      this.position.x *= scale;
      this.position.z *= scale;
    }
  }

  /**
   * Rotate to face a position
   */
  facePosition(position) {
    const eyePos = this.position.clone();
    eyePos.y = PLAYER.HEIGHT * 0.75;

    // 3D direction
    const direction = MathUtils.directionTo(eyePos, position);
    this.facingDirection.copy(direction);

    // Yaw (Body follows target horizontally)
    this.mesh.lookAt(position.x, this.position.y, position.z);
    this.rotation.copy(this.mesh.rotation); // Sync with Entity state ensures super.update doesn't reset it

    // Pitch (for head tracking)
    const pitch = Math.asin(direction.y);
    if (this.headGroup) {
      this.headGroup.rotation.x = -pitch;
    }
  }

  /**
   * Calculate deflect accuracy based on missile speed
   */
  calculateAccuracy(missileSpeed) {
    // Accuracy decreases as missile gets faster
    const speedAboveBase = Math.max(0, missileSpeed - MISSILE.BASE_SPEED);
    const accuracyLoss = speedAboveBase * this.accuracyLossPerSpeed;
    const accuracy = Math.max(
      this.minAccuracy,
      this.baseAccuracy - accuracyLoss,
    );
    return accuracy;
  }

  /**
   * Check if bot should deflect the missile
   * Accuracy is affected by missile speed and difficulty
   */
  tryDeflect(missile) {
    if (!this.isAlive) return false;

    // Check cooldown
    if (!this.canDeflect) return false;

    // Can only deflect enemy missiles
    if (missile.teamId === this.team) return false;

    const missilePosition = missile.getPosition();

    // Calculate distance to missile
    const distance = MathUtils.distanceXZ(this.position, missilePosition);

    // Check if missile is in range
    if (distance <= this.deflectRange) {
      // Check reaction delay (bot needs time to react)
      if (this.reactionTimer < this.reactionDelay) {
        return false;
      }

      // Face the missile
      this.facePosition(missilePosition);

      // Trigger cooldown regardless of success
      this.canDeflect = false;
      this.deflectCooldown = DEFLECTION.COOLDOWN;
      this.reactionTimer = 0; // Reset reaction timer

      // Calculate accuracy based on missile speed
      const accuracy = this.calculateAccuracy(missile.speed);
      const roll = Math.random();

      // Success if roll is under accuracy threshold
      if (roll < accuracy) {
        return true;
      }

      // Failed to deflect - bot "missed"
      return false;
    }

    return false;
  }

  /**
   * Take damage
   */
  takeDamage(amount) {
    if (!this.isAlive) return;

    this.health -= amount;
    this.emit("damage", { amount, health: this.health });

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
    this.emit("death", { bot: this });

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
    this.isTargeted = false;
    this.canDeflect = true;
    this.deflectCooldown = 0;

    if (spawnData) {
      const pos = spawnData.position || spawnData;
      this.setPosition(pos.x, 0, pos.z);

      // Set rotation to face center
      if (spawnData.rotation !== undefined) {
        this.facingDirection.set(
          -Math.sin(spawnData.rotation),
          0,
          -Math.cos(spawnData.rotation),
        );
        if (this.mesh) {
          this.mesh.rotation.y = spawnData.rotation;
          this.rotation.y = spawnData.rotation;
        }
      }
    }

    if (this.mesh) {
      this.mesh.visible = true;
    }
  }

  /**
   * Set targeted state
   */
  setTargeted(targeted) {
    this.isTargeted = targeted;
  }

  /**
   * Get forward direction
   */
  getForwardDirection() {
    return this.facingDirection.clone();
  }
}
