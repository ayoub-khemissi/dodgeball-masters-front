import * as THREE from 'three';
import { AssetManager } from '../core/AssetManager.js';

const EXPLOSION_DURATION = 1.2; // seconds total
const SCALE_UP_DURATION = 0.3; // fast scale-up phase
const MAX_SCALE = 0.15; // final scale of the model

export class Explosion {
  constructor(position, teamId) {
    this.group = new THREE.Group();
    this.group.position.copy(position);

    this.elapsed = 0;
    this.done = false;
    this.materials = [];
    this.teamId = teamId;

    this.setupModel(teamId);
  }

  reset(position) {
    this.group.position.copy(position);
    this.elapsed = 0;
    this.done = false;
    this.group.visible = true;
    
    // Reset scale
    if (this.model) {
      this.model.scale.set(0.01, 0.01, 0.01);
    }
    
    // Reset opacity
    for (const mat of this.materials) {
      mat.opacity = 1.0;
    }
  }

  setupModel(teamId) {
    // Use preloaded model from AssetManager
    const model = AssetManager.getModelClone('explosion');
    if (!model) return;

    model.scale.set(0.01, 0.01, 0.01); // start tiny

    // Get pre-built materials (cloned for independent opacity control)
    const { main: mainMat, pointy: pointyMat } = AssetManager.getExplosionMaterials(teamId);

    model.traverse((child) => {
      if (child.isMesh) {
        const oldMat = child.material;
        const isPointy = child.name === 'Explosion_pointy' ||
          (oldMat && oldMat.name === 'Fire_pointy');

        // Use pre-built cloned materials
        const newMat = isPointy ? pointyMat : mainMat;
        if (newMat) {
          child.material = newMat;
          this.materials.push(newMat);
        }
      }
    });

    this.model = model;
    this.group.add(model);
  }

  update(deltaTime) {
    if (this.done) return;

    this.elapsed += deltaTime;

    if (this.elapsed >= EXPLOSION_DURATION) {
      this.done = true;
      this.group.visible = false;
      return;
    }

    if (!this.model) return;

    // Scale up phase
    if (this.elapsed < SCALE_UP_DURATION) {
      const t = this.elapsed / SCALE_UP_DURATION;
      // Ease-out for snappy pop
      const eased = 1 - Math.pow(1 - t, 3);
      const s = eased * MAX_SCALE;
      this.model.scale.set(s, s, s);
    } else {
      this.model.scale.set(MAX_SCALE, MAX_SCALE, MAX_SCALE);
    }

    // Fade out after scale-up
    if (this.elapsed > SCALE_UP_DURATION) {
      const fadeProgress = (this.elapsed - SCALE_UP_DURATION) / (EXPLOSION_DURATION - SCALE_UP_DURATION);
      const opacity = 1.0 - fadeProgress;
      for (const mat of this.materials) {
        mat.opacity = Math.max(0, opacity);
      }
    }

    // Slow rotation for visual interest
    this.model.rotation.y += deltaTime * 2;
  }

  getMesh() {
    return this.group;
  }

  isDone() {
    return this.done;
  }

  dispose() {
    for (const mat of this.materials) {
      // Do not dispose mat.map as it is shared!
      mat.dispose();
    }
    // Do not dispose geometry as it is shared via AssetManager!
  }
}
