import * as THREE from 'three';
import { ARENA, COLORS } from '../utils/Constants.js';
import { AssetManager } from '../core/AssetManager.js';

/**
 * Arena
 * Circular game arena with water surrounding it
 */

export class Arena {
  constructor(mapId = 'orbital') {
    this.group = new THREE.Group();
    this.radius = ARENA.RADIUS;
    this.waterMesh = null;
    this.time = 0;
    this.mapId = mapId;

    // Raycaster for floor detection
    this.raycaster = new THREE.Raycaster();
    this.downVector = new THREE.Vector3(0, -1, 0);

    this.init();
  }

  init() {
    // Check if we have a loaded map model
    const mapKey = `map_${this.mapId}`;
    const arenaModel = AssetManager.getModelClone(mapKey);
    
    if (arenaModel) {
      arenaModel.scale.set(3, 3, 3);
      this.group.add(arenaModel);
      this.model = arenaModel; // Store reference for raycasting
      console.log(`Using loaded arena model: ${this.mapId} (scaled x3)`);
      return;
    }

    this.createFloor();
    this.createWalls();
    this.createWater();
    this.createCenterMarking();
  }

  /**
   * Get floor height at position (x, z)
   */
  getFloorHeight(x, z) {
    if (this.model) {
      this.raycaster.set(new THREE.Vector3(x, 20, z), this.downVector);
      const intersects = this.raycaster.intersectObject(this.model, true);
      
      if (intersects.length > 0) {
        return intersects[0].point.y;
      }
    }
    return 0; // Default floor height
  }

  createFloor() {
    // Circular floor
    const floorGeometry = new THREE.CircleGeometry(this.radius, 64);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.ARENA_FLOOR,
      roughness: 0.3,
      metalness: 0.1,
    });

    this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.group.add(this.floor);

    // Subtle floor pattern - concentric rings
    for (let r = 5; r < this.radius; r += 5) {
      const ringGeometry = new THREE.RingGeometry(r - 0.05, r + 0.05, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xe0e0e0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.group.add(ring);
    }
  }

  createWalls() {
    // Invisible walls - collision handled by constrainToBounds()
    // No visible walls, just the floor boundary
  }

  createWater() {
    // Large water plane surrounding the arena
    const waterGeometry = new THREE.PlaneGeometry(ARENA.WATER_SIZE, ARENA.WATER_SIZE, 100, 100);

    // Custom shader material for water with reflections
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.WATER,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
      metalness: 0.6,
      envMapIntensity: 1.0,
    });

    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.3;
    this.waterMesh.receiveShadow = true;
    this.group.add(this.waterMesh);

    // Create a hole in the water for the arena
    // We'll use a ring geometry instead to create the water around the arena
    this.waterMesh.visible = false; // Hide the plane

    // Create water as a ring around the arena
    const waterRingGeometry = new THREE.RingGeometry(this.radius + 0.5, ARENA.WATER_SIZE / 2, 64, 8);
    const waterRing = new THREE.Mesh(waterRingGeometry, waterMaterial);
    waterRing.rotation.x = -Math.PI / 2;
    waterRing.position.y = -0.2;
    waterRing.receiveShadow = true;
    this.waterRing = waterRing;
    this.group.add(waterRing);

    // Add subtle wave animation vertices
    this.waterVertices = waterRingGeometry.attributes.position.array.slice();
  }

  createCenterMarking() {
    // Center circle
    const centerGeometry = new THREE.RingGeometry(2.8, 3, 32);
    const centerMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ARENA_LINE,
      side: THREE.DoubleSide,
    });
    const centerCircle = new THREE.Mesh(centerGeometry, centerMaterial);
    centerCircle.rotation.x = -Math.PI / 2;
    centerCircle.position.y = 0.02;
    this.group.add(centerCircle);

    // Center dot
    const dotGeometry = new THREE.CircleGeometry(0.5, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: COLORS.ARENA_LINE });
    const centerDot = new THREE.Mesh(dotGeometry, dotMaterial);
    centerDot.rotation.x = -Math.PI / 2;
    centerDot.position.y = 0.02;
    this.group.add(centerDot);

    // Dividing line
    const lineGeometry = new THREE.PlaneGeometry(this.radius * 2, 0.1);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: COLORS.ARENA_LINE,
      side: THREE.DoubleSide,
    });
    const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.02;
    this.group.add(centerLine);
  }

  /**
   * Update water animation
   */
  update(deltaTime) {
    this.time += deltaTime;

    // Animate water waves
    if (this.waterRing && this.waterVertices) {
      const positions = this.waterRing.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = this.waterVertices[i];
        const z = this.waterVertices[i + 2];
        // Subtle wave effect
        positions[i + 1] = Math.sin(x * 0.5 + this.time) * 0.1 +
                          Math.cos(z * 0.5 + this.time * 0.8) * 0.1;
      }
      this.waterRing.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Get mesh group for adding to scene
   */
  getMesh() {
    return this.group;
  }

  /**
   * Get arena bounds for collision (circular)
   */
  getBounds() {
    return {
      type: 'circle',
      radius: this.radius - 0.5, // Slight padding
      center: { x: 0, z: 0 },
    };
  }

  /**
   * Get spawn positions and rotations for players
   * Players face toward the center of the arena
   */
  getSpawnPositions() {
    return {
      player: {
        position: new THREE.Vector3(0, 0, -this.radius / 2),
        rotation: Math.PI, // Facing positive Z (toward center)
      },
      bot: {
        position: new THREE.Vector3(0, 0, this.radius / 2),
        rotation: 0, // Facing negative Z (toward center)
      },
    };
  }

  /**
   * Check if position is within arena bounds (circular)
   */
  isInBounds(position) {
    const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    return distanceFromCenter <= this.radius - 0.5;
  }

  /**
   * Constrain position to arena bounds
   */
  constrainToBounds(position, radius = 0.5) {
    const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
    const maxDistance = this.radius - radius;

    if (distanceFromCenter > maxDistance) {
      const scale = maxDistance / distanceFromCenter;
      position.x *= scale;
      position.z *= scale;
    }

    return position;
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
