import * as THREE from 'three';
import { Entity } from './Entity.js';
import { MISSILE, COLORS, DEFLECTION, ARENA } from '../utils/Constants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { AssetManager } from '../core/AssetManager.js';

/**
 * Missile
 * Tracking projectile that targets players
 */

export class Missile extends Entity {
  constructor() {
    super();

    // Movement
    this.speed = MISSILE.BASE_SPEED;
    this.turnRate = MISSILE.TURN_RATE;
    this.velocity = new THREE.Vector3(0, 0, 1);

    // Damage
    this.damage = MISSILE.BASE_DAMAGE;

    // Target
    this.target = null;
    this.targetPosition = new THREE.Vector3();

    // State
    this.deflectionCount = 0;
    this.direction = new THREE.Vector3(0, 0, 1); // For visual orientation
    this.teamId = null;
    this.previousPosition = new THREE.Vector3();

    // Drag state (player can control direction briefly after deflect)
    this.isDragging = false;
    this.dragTimer = 0;
    this.dragOwner = null; // The player who can drag
    this.baseDirection = new THREE.Vector3(); // Direction at start of drag

    // Grace period after deflect (prevents immediate collision with new target)
    this.deflectGraceTimer = 0;

    // Visual
    this.trailParticles = [];

    this.init();
  }

  init() {
    this.createMesh();
    this.createParticleSystem();
    this.previousPosition.copy(this.position);
  }

  createMesh() {
    const group = new THREE.Group();

    // Use preloaded model from AssetManager
    const model = AssetManager.getModelClone('missile');
    if (model) {
      // Scale and orientation
      model.scale.set(0.75, 0.75, 0.75);

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
        }
      });

      this.missileModel = model;
      group.add(model);

      // Apply initial team color to trail/glow if already set
      if (this.teamId) {
        this.setTeam(this.teamId);
      }
    }

    this.mesh = group;
    this.mesh.position.copy(this.position);
  }

  createParticleSystem() {
    this.trailGroup = new THREE.Group();
    this.particles = [];
  }

  update(deltaTime, arena = null) {
    if (!this.isActive || !this.target) return;

    // Store previous position for collision detection
    this.previousPosition.copy(this.position);

    // Update drag timer
    if (this.isDragging) {
      this.dragTimer -= deltaTime * 1000;
      if (this.dragTimer <= 0) {
        this.endDrag();
      }
    }

    // Update deflect grace timer
    if (this.deflectGraceTimer > 0) {
      this.deflectGraceTimer -= deltaTime * 1000;
    }

    // Update target position
    if (this.target.getPosition) {
      this.targetPosition.copy(this.target.getPosition());
      // Aim at center mass
      this.targetPosition.y = this.target.position.y + 0.9;
    }

    const toTarget = new THREE.Vector3().subVectors(this.targetPosition, this.position);
    const distanceToTarget = toTarget.length();
    toTarget.normalize();

    // Target velocity always points toward target
    const targetVelocity = toTarget.clone().multiplyScalar(this.speed);

    const tickRate = 66;
    const frameTurnRate = 1 - Math.pow(1 - this.turnRate, deltaTime * tickRate);

    // Lerp velocity toward target (drag impulses will be gradually corrected)
    this.velocity.lerp(targetVelocity, frameTurnRate);

    // Update direction for visual orientation
    this.direction.copy(this.velocity).normalize();

    // Move missile using velocity
    this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

    // Constrain to environment (floor + arena boundary)
    this.constrainToEnvironment(arena);

    // Rotate mesh to face direction of travel
    if (this.mesh) {
      this.mesh.position.copy(this.position); 
      // lookAt is simpler and works well if we don't have conflicting updates
      this.mesh.lookAt(this.position.clone().add(this.direction));
    }

    // Update trail
    this.updateParticles(deltaTime);

    return distanceToTarget;
  }

  /**
   * Constrain missile position to environment bounds (floor, arena boundary, walls)
   * Removes velocity component pushing into the surface so the missile slides along it.
   */
  constrainToEnvironment(arena) {
    // Floor constraint
    const groundHeight = arena && arena.getFloorHeight ? arena.getFloorHeight(this.position.x, this.position.z) : 0;
    const minY = groundHeight + MISSILE.RADIUS;
    
    if (this.position.y < minY) {
      this.position.y = minY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    // Arena circular boundary
    const maxDist = ARENA.RADIUS - MISSILE.RADIUS;
    const distXZ = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
    if (distXZ > maxDist) {
      // Push position back to boundary
      const scale = maxDist / distXZ;
      this.position.x *= scale;
      this.position.z *= scale;

      // Remove outward radial velocity component (slide along wall)
      const normal = new THREE.Vector3(this.position.x, 0, this.position.z).normalize();
      const dot = this.velocity.dot(normal);
      if (dot > 0) {
        this.velocity.addScaledVector(normal, -dot);
      }
    }
  }

  updateParticles(deltaTime) {
    // Spawn new particle
    if (this.isActive) {
      this.spawnParticle();
    }

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;
      
      if (p.life <= 0) {
        this.trailGroup.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        const ratio = p.life / p.maxLife;
        p.mesh.scale.setScalar(ratio * p.initialSize);
        p.mesh.material.opacity = ratio;
      }
    }
  }

  spawnParticle() {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8); // Simple blob
    const color = this.teamId === 'player' ? COLORS.TEAM_PLAYER : COLORS.TEAM_BOT;
    const material = new THREE.MeshBasicMaterial({
      color: color || COLORS.MISSILE_TRAIL,
      transparent: true,
      opacity: 0.8
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position at the back of the missile
    const backwardOffset = this.direction.clone().multiplyScalar(-0.8);
    mesh.position.copy(this.position).add(backwardOffset);
    
    // Random jitter for a thicker smoke effect
    mesh.position.x += (Math.random() - 0.5) * 0.1;
    mesh.position.y += (Math.random() - 0.5) * 0.1;
    mesh.position.z += (Math.random() - 0.5) * 0.1;

    this.trailGroup.add(mesh);
    
    this.particles.push({
      mesh: mesh,
      life: 0.5, // 0.5 seconds life
      maxLife: 0.5,
      initialSize: 1.0
    });
  }

  /**
   * Set missile target
   */
  setTarget(target) {
    this.target = target;
    if (target && target.getPosition) {
      this.targetPosition.copy(target.getPosition());
    }
  }

  /**
   * Handle deflection
   */
  deflect(newTarget) {
    this.deflectionCount++;

    // Additive increments based on deflection count
    this.speed = MISSILE.BASE_SPEED + (MISSILE.SPEED_INCREMENT * this.deflectionCount);
    if (MISSILE.MAX_SPEED > 0) {
      this.speed = Math.min(this.speed, MISSILE.MAX_SPEED);
    }

    this.turnRate = MISSILE.TURN_RATE

    // Damage: base + (increment * deflections)
    this.damage = MISSILE.BASE_DAMAGE + (MISSILE.DAMAGE_INCREMENT * this.deflectionCount);

    // Set new target
    this.setTarget(newTarget);

    // Reverse velocity direction (the inertia will carry it back then redirect)
    this.velocity.negate();

    // Update direction to match new velocity (important for drag)
    this.direction.copy(this.velocity).normalize();

    // Start grace period (prevents immediate collision with new target)
    this.deflectGraceTimer = 150; // 150ms grace period

    // Emit event
    this.emit('deflect', {
      deflectionCount: this.deflectionCount,
      speed: this.speed,
      damage: this.damage,
      newTarget,
    });
  }

  /**
   * Start drag mode - player can influence direction
   */
  startDrag(owner) {
    this.isDragging = true;
    this.dragTimer = DEFLECTION.DRAG_DURATION;
    this.dragOwner = owner;
    // Store the current direction as base for angle limit
    this.baseDirection.copy(this.direction);
  }

  /**
   * Apply mouse movement as impulse force to missile velocity
   * @param {number} deltaX - Mouse X movement
   * @param {number} deltaY - Mouse Y movement
   * @param {THREE.Camera} camera - Camera for orientation reference
   */
  applyDrag(deltaX, deltaY, camera) {
    if (!this.isDragging) return;

    // Get camera right and up vectors for mouse-relative force
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);

    // Calculate force based on mouse movement
    const force = new THREE.Vector3();
    force.addScaledVector(cameraRight, deltaX * DEFLECTION.DRAG_STRENGTH);
    force.addScaledVector(cameraUp, -deltaY * DEFLECTION.DRAG_STRENGTH);

    // Limit force magnitude to prevent extreme impulses
    const maxForce = DEFLECTION.DRAG_MAX_FORCE || this.speed * 0.5;
    if (force.length() > maxForce) {
      force.normalize().multiplyScalar(maxForce);
    }

    // Apply force as impulse to velocity
    this.velocity.add(force);

    // Clamp velocity magnitude to prevent instability
    const maxVelocity = this.speed * 1.5;
    if (this.velocity.length() > maxVelocity) {
      this.velocity.normalize().multiplyScalar(maxVelocity);
    }

    // Update direction to match new velocity
    this.direction.copy(this.velocity).normalize();
  }

  /**
   * End drag mode
   */
  endDrag() {
    this.isDragging = false;
    this.dragTimer = 0;
    this.dragOwner = null;
  }

  /**
   * Check if entity can drag the missile
   */
  canBeDraggedBy(entity) {
    return this.isDragging && this.dragOwner === entity;
  }

  /**
   * Check if missile is in grace period (can't hit target)
   */
  isInGracePeriod() {
    return this.deflectGraceTimer > 0;
  }

  /**
   * Check collision with entity
   */
  checkCollision(entity) {
    if (!entity.isAlive) return false;

    const distance = MathUtils.distance(this.position, entity.position);
    const collisionDistance = MISSILE.RADIUS + (entity.radius || 0.5);

    return distance < collisionDistance;
  }

  /**
   * Reset missile for new round
   */
  reset() {
    this.speed = MISSILE.BASE_SPEED;
    this.turnRate = MISSILE.TURN_RATE;
    this.damage = MISSILE.BASE_DAMAGE;
    this.deflectionCount = 0;
    this.target = null;
    this.velocity.set(0, 0, 1);
    this.direction.set(0, 0, 1);
    
    // Clear particles
    if (this.particles) {
        this.particles.forEach(p => this.trailGroup.remove(p.mesh));
        this.particles = [];
    }

    // Reset drag state
    this.isDragging = false;
    this.dragTimer = 0;
    this.dragOwner = null;
    this.deflectGraceTimer = 0;

    // Reset to spawn position
    this.setPosition(0, MISSILE.SPAWN_HEIGHT, 0);
    this.previousPosition.copy(this.position);

    if (this.mesh) {
      this.mesh.visible = true;
    }
  }

  /**
   * Set missile team
   */
  setTeam(teamId) {
    this.teamId = teamId;

    const color = teamId === 'player' ? COLORS.TEAM_PLAYER : COLORS.TEAM_BOT;

    // Note: We do NOT color the missile body anymore, keeping original texture.
    // Trail particles are colored on spawn.
  }

  /**
   * Spawn missile at center of arena
   */
  spawn(initialTarget, teamId) {
    this.reset();
    this.setTarget(initialTarget);
    this.setTeam(teamId);
    this.isActive = true;

    // Initial velocity toward target
    if (initialTarget) {
      const dir = MathUtils.directionTo(this.position, initialTarget.getPosition());
      this.velocity.copy(dir).multiplyScalar(this.speed);
      this.direction.copy(dir);
    }
  }

  /**
   * Hide missile (after hit)
   */
  hide() {
    this.isActive = false;
    if (this.mesh) {
      this.mesh.visible = false;
    }
  }

  /**
   * Get current damage value
   */
  getDamage() {
    return this.damage;
  }

  /**
   * Get trail mesh for adding to scene
   */
  getTrail() {
    return this.trailGroup;
  }

  dispose() {
    if (this.trailGroup) {
      // Cleanup particles
      this.particles.forEach(p => {
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
      });
      this.trailGroup.clear();
    }
    super.dispose();
  }
}
