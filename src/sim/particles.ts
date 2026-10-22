import * as THREE from "three";
import { clamp } from "./types";

export interface SpawnOptions {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  color?: THREE.Color;
  size?: number;
  life?: number;
  growth?: number;
  gravity?: number;
  drag?: number;
  jitter?: number;
}

/**
 * CPU-integrated point cloud with a ring-buffer allocator.
 * Typed arrays are shared with a THREE.BufferGeometry so the render
 * layer only has to flag `needsUpdate`.
 */
export class ParticleField {
  readonly max: number;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly life: Float32Array;

  private vel: Float32Array;
  private maxLife: Float32Array;
  private growth: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private emitScale = 1;
  private carry = 0;

  alive = 0;

  constructor(max: number) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.life = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.maxLife = new Float32Array(max);
    this.growth = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    for (let i = 0; i < max; i++) this.positions[i * 3 + 1] = -9999;
  }

  setEmitScale(s: number) {
    this.emitScale = s;
  }

  /** Fractional-rate emitter helper so emission stays frame-rate independent. */
  rate(amountPerSecond: number, dt: number): number {
    const n = amountPerSecond * dt * this.emitScale + this.carry;
    const whole = Math.floor(n);
    this.carry = n - whole;
    return whole;
  }

  spawn(o: SpawnOptions) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    const jitter = o.jitter ?? 0;
    this.positions[i3] = o.position.x + (Math.random() - 0.5) * jitter;
    this.positions[i3 + 1] = o.position.y + (Math.random() - 0.5) * jitter;
    this.positions[i3 + 2] = o.position.z + (Math.random() - 0.5) * jitter;
    const v = o.velocity;
    this.vel[i3] = v ? v.x : 0;
    this.vel[i3 + 1] = v ? v.y : 0;
    this.vel[i3 + 2] = v ? v.z : 0;
    const c = o.color ?? new THREE.Color(0.4, 0.4, 0.42);
    this.colors[i3] = c.r;
    this.colors[i3 + 1] = c.g;
    this.colors[i3 + 2] = c.b;
    this.sizes[i] = o.size ?? 1;
    const life = o.life ?? 1.4;
    this.maxLife[i] = life;
    this.life[i] = 1;
    this.growth[i] = o.growth ?? 1;
    this.gravity[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1.6;
  }

  update(dt: number) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      this.life[i] -= dt / this.maxLife[i];
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        this.sizes[i] = 0;
        this.positions[i3 + 1] = -9999;
        continue;
      }
      alive++;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.gravity[i] * dt;
      this.vel[i3 + 2] *= d;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.03) {
        this.positions[i3 + 1] = 0.03;
        this.vel[i3 + 1] *= -0.18;
        this.vel[i3] *= 0.86;
        this.vel[i3 + 2] *= 0.86;
      }
      this.sizes[i] += this.growth[i] * dt;
    }
    this.alive = alive;
  }

  clear() {
    this.life.fill(0);
    this.sizes.fill(0);
    for (let i = 0; i < this.max; i++) this.positions[i * 3 + 1] = -9999;
    this.alive = 0;
  }
}

export const SMOKE_WARM = new THREE.Color(0.42, 0.4, 0.4);
export const SMOKE_DARK = new THREE.Color(0.16, 0.16, 0.18);
export const EMBER = new THREE.Color(1.0, 0.42, 0.12);
export const EMBER_HOT = new THREE.Color(1.0, 0.85, 0.55);
export const SPARK = new THREE.Color(1.0, 0.72, 0.3);

export const qualityEmitScale = (q: string) => (q === "LOW" ? 0.3 : q === "MEDIUM" ? 0.6 : 1);

export const tmpColor = new THREE.Color();
export const mixSmoke = (heat: number) => tmpColor.copy(SMOKE_DARK).lerp(SMOKE_WARM, clamp(heat, 0, 1));
