import * as THREE from "three";
import { sim } from "./engine";
import { EMBER, EMBER_HOT, ParticleField, SPARK, mixSmoke } from "./particles";
import { CAR } from "./specs";
import type { SimEvent, Telemetry } from "./types";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Owns every transient visual effect: tyre smoke, sparks, thruster exhaust,
 * camera-shake energy and the landing flash. Simulation logic stays pure.
 */
export class EffectsManager {
  readonly smoke = new ParticleField(480);
  readonly fire = new ParticleField(380);

  shake = 0;
  flash = 0;
  thrusterGlow = 0;

  private local = new THREE.Vector3();
  private world = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private rear = new THREE.Vector3();
  private color = new THREE.Color();

  setQualityScale(s: number) {
    this.smoke.setEmitScale(s);
    this.fire.setEmitScale(s);
  }

  private contact(i: number, out: THREE.Vector3) {
    return out.copy(CAR.contacts[i]).applyQuaternion(sim.quaternion).add(sim.position);
  }
  private nozzle(i: number, out: THREE.Vector3) {
    return out.copy(CAR.nozzles[i]).applyQuaternion(sim.quaternion).add(sim.position);
  }

  private groundBurst(count: number, power: number, hot = false) {
    for (let c = 0; c < 4; c++) {
      this.contact(c, this.world);
      if (this.world.y > 0.9) continue;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rnd(0.2, 1.5) * power;
        this.vel.set(Math.cos(a) * r, rnd(0.4, 2.6) * power, Math.sin(a) * r);
        this.smoke.spawn({
          position: this.world,
          velocity: this.vel,
          color: mixSmoke(hot ? rnd(0.55, 0.95) : rnd(0.15, 0.5)),
          size: rnd(0.35, 0.85),
          growth: rnd(1.4, 2.6),
          life: rnd(1.1, 2.3),
          gravity: rnd(0.1, 0.5),
          drag: rnd(1.1, 1.9),
          jitter: 0.25,
        });
      }
    }
  }

  handleEvent(e: SimEvent) {
    switch (e) {
      case "takeoff":
        this.groundBurst(26, 1.15, true);
        this.shake = Math.max(this.shake, 0.55);
        this.flash = 0.35;
        break;
      case "touchdown":
        this.groundBurst(30, 1.35, false);
        for (let i = 0; i < 34; i++) {
          this.contact(i % 4, this.world);
          this.vel.set(rnd(-3, 3), rnd(0.2, 3), rnd(-3, 3));
          this.fire.spawn({
            position: this.world,
            velocity: this.vel,
            color: SPARK,
            size: rnd(0.05, 0.13),
            growth: -0.04,
            life: rnd(0.3, 0.75),
            gravity: -11,
            drag: 0.7,
          });
        }
        this.shake = 1;
        this.flash = 0.75;
        break;
      case "boost":
      case "invert":
      case "right":
        this.flash = Math.max(this.flash, 0.18);
        break;
      case "reset":
        this.smoke.clear();
        this.fire.clear();
        this.shake = 0;
        this.flash = 0;
        break;
      case "stuntStart":
      case "stuntEnd":
        break;
    }
  }

  update(dt: number, t: Telemetry) {
    this.shake = Math.max(0, this.shake - dt * (1.1 + this.shake * 1.6));
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.thrusterGlow = THREE.MathUtils.lerp(this.thrusterGlow, t.thruster, 1 - Math.exp(-14 * dt));

    // --- tyre smoke while slipping on the ground -------------------------
    if (!t.airborne && t.skid > 0.18 && Math.abs(t.speed) > 2) {
      const n = this.smoke.rate(t.skid * 120, dt);
      for (let i = 0; i < n; i++) {
        this.contact(i % 2 === 0 ? 2 : 3, this.world);
        this.rear.copy(sim.forward).multiplyScalar(-1);
        this.vel
          .copy(this.rear)
          .multiplyScalar(rnd(0.5, 2.4))
          .add(this.local.set(rnd(-0.8, 0.8), rnd(0.8, 2.4), rnd(-0.8, 0.8)));
        this.smoke.spawn({
          position: this.world,
          velocity: this.vel,
          color: mixSmoke(rnd(0.1, 0.45)),
          size: rnd(0.25, 0.6),
          growth: rnd(1.2, 2.2),
          life: rnd(0.8, 1.7),
          gravity: rnd(0.2, 0.9),
          drag: rnd(1.3, 2.1),
          jitter: 0.2,
        });
      }
      if (t.skid > 0.55) {
        const s = this.fire.rate(t.skid * 46, dt);
        for (let i = 0; i < s; i++) {
          this.contact(2 + (i % 2), this.world);
          this.vel.set(rnd(-2.5, 2.5), rnd(0.4, 2.6), rnd(-2.5, 2.5));
          this.fire.spawn({
            position: this.world,
            velocity: this.vel,
            color: SPARK,
            size: rnd(0.04, 0.1),
            growth: -0.05,
            life: rnd(0.25, 0.6),
            gravity: -12,
            drag: 0.8,
          });
        }
      }
    }

    // --- thruster exhaust --------------------------------------------------
    if (t.thruster > 0.12) {
      const n = this.fire.rate(t.thruster * 190, dt);
      this.rear.copy(sim.forward).multiplyScalar(-1);
      for (let i = 0; i < n; i++) {
        this.nozzle(i % 2, this.world);
        const speed = rnd(5, 11) + t.thruster * 16;
        this.vel
          .copy(this.rear)
          .multiplyScalar(speed)
          .add(this.local.set(rnd(-1.1, 1.1), rnd(-1.1, 1.1), rnd(-1.1, 1.1)));
        this.color.copy(EMBER_HOT).lerp(EMBER, Math.random());
        this.fire.spawn({
          position: this.world,
          velocity: this.vel,
          color: this.color,
          size: rnd(0.12, 0.3),
          growth: rnd(0.3, 1.1),
          life: rnd(0.18, 0.42),
          gravity: rnd(-1.5, 1.5),
          drag: rnd(2.2, 3.4),
          jitter: 0.08,
        });
      }
      const s = this.smoke.rate(t.thruster * 34, dt);
      for (let i = 0; i < s; i++) {
        this.nozzle(i % 2, this.world);
        this.vel.copy(this.rear).multiplyScalar(rnd(2, 5)).add(this.local.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)));
        this.smoke.spawn({
          position: this.world,
          velocity: this.vel,
          color: mixSmoke(rnd(0.3, 0.7)),
          size: rnd(0.2, 0.45),
          growth: rnd(1.5, 2.8),
          life: rnd(0.6, 1.3),
          gravity: 0.5,
          drag: 1.8,
          jitter: 0.15,
        });
      }
    }

    this.smoke.update(dt);
    this.fire.update(dt);
  }

  dispose() {
    this.smoke.clear();
    this.fire.clear();
  }
}

export const fx = new EffectsManager();
