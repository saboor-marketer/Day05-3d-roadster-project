import * as THREE from "three";
import {
  clamp,
  damp,
  easeInOutSine,
  easeOutCubic,
  lerp,
  smoothstep,
  type SimEvent,
  type SimPhase,
  type StuntStatus,
  type Telemetry,
  type VehicleInput,
} from "./types";

/** Height of the vehicle pivot (centre of mass) above the runway surface. */
export const RIDE_HEIGHT = 0.6;
export const TOP_SPEED = 84; // m/s  (~302 km/h)
export const WHEEL_RADIUS = 0.345;
/** Runway scenery repeat period — used to recycle the world around the car. */
export const WORLD_PERIOD = 1200;
export const RUNWAY_HALF_WIDTH = 11;

interface PhaseDef {
  phase: SimPhase;
  status: StuntStatus;
  duration: number;
}

/**
 * The scripted cinematic sequence. Durations are configurable; the timeline is
 * strictly monotonic so the vehicle can never wedge itself between states.
 */
export const STUNT_TIMELINE: PhaseDef[] = [
  { phase: "TAKEOFF", status: "TAKEOFF", duration: 0.85 },
  { phase: "BACKFLIP", status: "BACKFLIP", duration: 1.5 },
  { phase: "INVERTED_FLIGHT", status: "INVERTED", duration: 1.0 },
  { phase: "RIGHTING", status: "RIGHTING", duration: 0.95 },
  { phase: "LANDING", status: "LANDING", duration: 0.75 },
  { phase: "RECOVERY", status: "LANDING", duration: 0.85 },
];

export const STUNT_DURATION = STUNT_TIMELINE.reduce((a, p) => a + p.duration, 0);

export const STUNT_PHASE_ORDER = STUNT_TIMELINE.map((p) => p.phase);

/** Altitude key-frames per phase (metres above rest ride height). */
const ALT = {
  takeoffEnd: 2.4,
  flipPeak: 7.1,
  hover: 7.55,
  rightEnd: 2.9,
};

export class VehicleSim {
  // ---- transform -------------------------------------------------------
  readonly position = new THREE.Vector3(0, RIDE_HEIGHT, 0);
  readonly quaternion = new THREE.Quaternion();
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly right = new THREE.Vector3(1, 0, 0);

  yaw = 0;
  flip = 0; // accumulated backward rotation about the lateral axis
  roll = 0;
  pitchTrim = 0;

  // ---- motion ----------------------------------------------------------
  speed = 0;
  altitude = 0;
  airborne = false;
  suspension = 0;
  suspensionVel = 0;
  wheelSpin = 0;
  steerAngle = 0;
  distance = 0;
  simTime = 0;

  // ---- effects ---------------------------------------------------------
  thruster = 0;
  skid = 0;
  gForce = 1;

  // ---- state machine ---------------------------------------------------
  phase: SimPhase = "IDLE";
  status: StuntStatus = "READY";
  inStunt = false;
  phaseIndex = -1;
  phaseTime = 0;
  stuntTime = 0;
  stuntCount = 0;
  lastStuntDuration = 0;
  statusHoldTimer = 0;

  paused = false;
  /** Playback tempo of the scripted sequence (0.45 slow-mo … 1.5 fast). */
  stuntSpeed = 1;
  events: SimEvent[] = [];

  input: VehicleInput = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
  };

  /** Recorded launch state so a stunt can be replayed deterministically. */
  private launch = {
    z: 0,
    x: 0,
    yaw: 0,
    speed: 0,
    valid: false,
  };

  private startYaw = 0;
  private startSpeed = 0;
  private touchdownFired = false;

  constructor() {
    this.reset();
  }

  // ---------------------------------------------------------------- api
  reset(silent = false) {
    this.position.set(0, RIDE_HEIGHT, 0);
    this.yaw = 0;
    this.flip = 0;
    this.roll = 0;
    this.pitchTrim = 0;
    this.speed = 0;
    this.altitude = 0;
    this.airborne = false;
    this.suspension = 0;
    this.suspensionVel = 0;
    this.wheelSpin = 0;
    this.steerAngle = 0;
    this.distance = 0;
    this.simTime = 0;
    this.thruster = 0;
    this.skid = 0;
    this.gForce = 1;
    this.phase = "IDLE";
    this.status = "READY";
    this.inStunt = false;
    this.phaseIndex = -1;
    this.phaseTime = 0;
    this.stuntTime = 0;
    this.statusHoldTimer = 0;
    this.touchdownFired = false;
    this.launch.valid = false;
    this.input.throttle = false;
    this.input.brake = false;
    this.input.left = false;
    this.input.right = false;
    this.input.handbrake = false;
    this.updateQuaternion();
    if (!silent) this.events.push("reset");
  }

  /** Launch the full takeoff -> backflip -> invert -> right -> land sequence. */
  triggerStunt(): boolean {
    if (this.inStunt || this.paused) return false;

    // Record the launch transform so REPLAY reproduces the exact same run.
    this.launch = {
      z: this.position.z,
      x: this.position.x,
      yaw: this.yaw,
      speed: Math.max(this.speed, 24),
      valid: true,
    };
    this.startYaw = this.yaw;
    this.startSpeed = Math.max(this.speed, 24);

    // Launch-control assist: guarantees a spectacular stunt even from a standstill.
    if (this.speed < 24) {
      this.speed = 24;
      this.events.push("boost");
    }

    this.inStunt = true;
    this.phaseIndex = 0;
    this.phaseTime = 0;
    this.stuntTime = 0;
    this.touchdownFired = false;
    this.phase = STUNT_TIMELINE[0].phase;
    this.status = STUNT_TIMELINE[0].status;
    this.input.throttle = false;
    this.input.brake = false;
    this.input.left = false;
    this.input.right = false;
    this.events.push("stuntStart", "takeoff");
    return true;
  }

  /** Rewind to the recorded launch transform and run the same stunt again. */
  replayStunt(): boolean {
    if (!this.launch.valid) {
      this.reset(true);
      return this.triggerStunt();
    }
    this.reset(true);
    this.position.z = this.launch.z;
    this.position.x = this.launch.x;
    this.yaw = this.launch.yaw;
    this.speed = this.launch.speed;
    this.phase = "DRIVING";
    return this.triggerStunt();
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  // ------------------------------------------------------------- update
  update(rawDt: number) {
    const dt = clamp(rawDt, 0, 1 / 25);
    if (this.paused) {
      this.updateQuaternion();
      return;
    }
    this.simTime += dt;

    if (this.inStunt) this.updateStunt(dt * this.stuntSpeed);
    else this.updateDriving(dt);

    this.updateWheels(dt);
    this.updateQuaternion();
    this.recycleWorld();
  }

  private updateDriving(dt: number) {
    const { throttle, brake, left, right, handbrake } = this.input;
    const absSpeed = Math.abs(this.speed);

    // --- longitudinal -------------------------------------------------
    // Designed net acceleration curve (post drag): 16.4 m/s² off the line,
    // ~1.9 s to 100 km/h, asymptotic at TOP_SPEED (302 km/h).
    const dragTerm = 0.0006 * this.speed * this.speed;
    let accel = 0;
    if (throttle) {
      const vN = clamp(absSpeed / TOP_SPEED, 0, 1);
      const net = 16.4 * (1 - Math.pow(vN, 1.19));
      accel += net + dragTerm;
    }
    if (brake) {
      if (this.speed > 0.4) accel -= 26;
      else accel -= 9; // reverse
    }
    if (!throttle && !brake) {
      accel -= Math.sign(this.speed) * 1.6; // rolling resistance
    }
    if (handbrake) {
      accel -= Math.sign(this.speed) * 34;
      this.skid = clamp(absSpeed / 20, 0, 1);
    }
    // aerodynamic drag
    accel -= Math.sign(this.speed) * dragTerm;

    this.speed = clamp(this.speed + accel * dt, -13, TOP_SPEED);
    if (Math.abs(this.speed) < 0.06 && !throttle && !brake) this.speed = 0;

    // --- steering ------------------------------------------------------
    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const speedNorm = clamp(absSpeed / TOP_SPEED, 0, 1);
    const authority = clamp(absSpeed / 9, 0, 1) * (1 - 0.55 * speedNorm);
    const targetSteer = steerInput * 0.42 * (1 - 0.35 * speedNorm);
    this.steerAngle = lerp(this.steerAngle, targetSteer, damp(11, dt));
    const yawRate = steerInput * 1.35 * authority * (this.speed < 0 ? -1 : 1);
    this.yaw += yawRate * dt;

    // handbrake drift flavour
    const grip = handbrake ? 3.2 : 9;
    const heading = this.yaw;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    this.position.x += fx * this.speed * dt;
    this.position.z += fz * this.speed * dt;
    if (handbrake && absSpeed > 8) {
      this.position.x += Math.cos(heading) * steerInput * (1 / grip) * absSpeed * dt * 0.5;
      this.roll = lerp(this.roll, -steerInput * 0.05 * speedNorm, damp(6, dt));
    } else {
      this.roll = lerp(this.roll, -steerInput * 0.028 * speedNorm, damp(6, dt));
    }

    // --- runway boundaries (soft walls) --------------------------------
    if (Math.abs(this.position.x) > RUNWAY_HALF_WIDTH) {
      const over = Math.abs(this.position.x) - RUNWAY_HALF_WIDTH;
      this.position.x -= Math.sign(this.position.x) * over * damp(6, dt);
      this.speed *= 1 - 0.55 * dt;
      this.skid = Math.max(this.skid, 0.5);
    }
    if (!handbrake) this.skid = lerp(this.skid, 0, damp(4, dt));

    // --- suspension / road feel ----------------------------------------
    this.altitude = lerp(this.altitude, 0, damp(9, dt));
    this.airborne = false;
    const bump = Math.sin(this.simTime * 42) * 0.006 * speedNorm + Math.sin(this.simTime * 17.3) * 0.004 * speedNorm;
    const target = bump - accel * 0.0055;
    this.suspensionVel += (target - this.suspension) * 210 * dt;
    this.suspensionVel *= Math.exp(-13 * dt);
    this.suspension += this.suspensionVel * dt;
    this.suspension = clamp(this.suspension, -0.09, 0.09);

    this.thruster = lerp(this.thruster, throttle && speedNorm > 0.02 ? 0.25 + speedNorm * 0.5 : 0, damp(7, dt));
    this.gForce = lerp(this.gForce, 1 + accel / 9.81, damp(8, dt));

    // --- phase / status --------------------------------------------------
    this.distance += absSpeed * dt;
    if (this.status === "COMPLETE") {
      this.statusHoldTimer -= dt;
      if (this.statusHoldTimer <= 0) this.status = "READY";
    }
    if (this.inStunt === false) {
      if (absSpeed < 0.2) this.phase = throttle || brake ? "ACCELERATING" : "IDLE";
      else if (throttle && absSpeed < 12) this.phase = "ACCELERATING";
      else this.phase = "DRIVING";
      this.flip = lerp(this.flip, 0, damp(10, dt));
    }

    this.position.y = RIDE_HEIGHT + this.altitude + this.suspension;
  }

  private updateStunt(dt: number) {
    this.stuntTime += dt;
    this.phaseTime += dt;
    const def = STUNT_TIMELINE[this.phaseIndex];
    if (!def) {
      this.finishStunt();
      return;
    }
    let u = this.phaseTime / def.duration;
    while (u >= 1) {
      this.phaseTime -= def.duration;
      this.phaseIndex += 1;
      const next = STUNT_TIMELINE[this.phaseIndex];
      if (!next) {
        this.finishStunt();
        return;
      }
      u = this.phaseTime / next.duration;
      this.onPhaseEnter(next.phase);
    }
    const phase = STUNT_TIMELINE[this.phaseIndex];
    this.phase = phase.phase;
    this.status = phase.status;
    const t = clamp(u, 0, 1);

    let speedMul = 1;
    let targetThruster = 0;

    switch (phase.phase) {
      case "TAKEOFF": {
        // suspension pre-compression, then extension as the car lifts
        const compress = t < 0.22 ? -0.075 * smoothstep(t / 0.22) : -0.075 * (1 - smoothstep((t - 0.22) / 0.3));
        this.suspension = compress;
        this.altitude = ALT.takeoffEnd * smoothstep(t);
        this.flip = 0.52 * easeOutCubic(t);
        this.roll = 0;
        this.pitchTrim = -0.05 * Math.sin(t * Math.PI);
        speedMul = lerp(1, 1.07, easeInOutSine(t));
        targetThruster = smoothstep(t * 1.4);
        this.skid = 0.85 * (1 - smoothstep(t * 1.6));
        break;
      }
      case "BACKFLIP": {
        this.suspension = lerp(this.suspension, 0.012, damp(6, dt));
        this.altitude = lerp(ALT.takeoffEnd, ALT.flipPeak, easeInOutSine(t));
        this.flip = lerp(0.52, Math.PI + 0.14, easeInOutSine(t));
        this.roll = 0.09 * Math.sin(t * Math.PI * 2);
        this.pitchTrim = 0;
        speedMul = lerp(1.07, 1.0, t);
        targetThruster = lerp(1, 0.55, t);
        this.skid = 0;
        break;
      }
      case "INVERTED_FLIGHT": {
        this.suspension = 0.012;
        // gentle hover with a slow breathing altitude
        this.altitude = ALT.flipPeak + (ALT.hover - ALT.flipPeak) * easeInOutSine(t);
        this.flip = lerp(Math.PI + 0.14, Math.PI + 0.34, t * t * (3 - 2 * t));
        this.roll = 0.06 * Math.sin(this.stuntTime * 3.1) + 0.02;
        this.pitchTrim = 0.03 * Math.sin(this.stuntTime * 2.2);
        speedMul = lerp(1.0, 0.84, easeInOutSine(t));
        targetThruster = 0.45 + 0.25 * Math.sin(this.stuntTime * 7);
        break;
      }
      case "RIGHTING": {
        this.suspension = lerp(this.suspension, 0, damp(5, dt));
        this.altitude = lerp(ALT.hover, ALT.rightEnd, easeInOutSine(t));
        this.flip = lerp(Math.PI + 0.34, Math.PI * 2 - 0.26, easeInOutSine(t));
        this.roll = lerp(this.roll, 0, damp(4, dt));
        this.pitchTrim = 0;
        speedMul = lerp(0.84, 0.96, easeInOutSine(t));
        targetThruster = lerp(0.4, 0.05, t);
        break;
      }
      case "LANDING": {
        this.altitude = lerp(ALT.rightEnd, 0, smoothstep(t));
        this.flip = lerp(Math.PI * 2 - 0.26, Math.PI * 2, easeOutCubic(t));
        this.roll = lerp(this.roll, 0, damp(6, dt));
        speedMul = lerp(0.96, 0.8, smoothstep(t));
        targetThruster = 0;
        if (!this.touchdownFired && t > 0.82) {
          this.touchdownFired = true;
          this.events.push("touchdown");
          this.suspensionVel = -2.4; // hard compression impulse
          this.skid = 1;
        }
        break;
      }
      case "RECOVERY": {
        // damped suspension spring settles the chassis, yaw blends to the runway
        this.suspensionVel += (0 - this.suspension) * 190 * dt;
        this.suspensionVel *= Math.exp(-9.5 * dt);
        this.suspension += this.suspensionVel * dt;
        this.suspension = clamp(this.suspension, -0.13, 0.13);
        this.altitude = 0;
        this.flip = Math.PI * 2;
        this.roll = lerp(this.roll, 0, damp(8, dt));
        this.yaw = lerp(this.yaw, this.startYaw, damp(5, dt));
        speedMul = lerp(0.8, 1, easeInOutSine(t));
        this.skid = lerp(this.skid, 0, damp(2.4, dt));
        targetThruster = 0;
        break;
      }
      default:
        break;
    }

    this.thruster = lerp(this.thruster, clamp(targetThruster, 0, 1), damp(12, dt));
    this.airborne = this.altitude > 0.25;

    // Forward travel keeps the runway heading recorded at launch. The scripted
    // speed is derived from the *launch* speed every frame — never compounded —
    // so the choreography is frame-rate independent and perfectly replayable.
    const travelSpeed = Math.max(this.startSpeed * speedMul, 0);
    const fx = -Math.sin(this.startYaw);
    const fz = -Math.cos(this.startYaw);
    this.position.x = lerp(this.position.x, this.launch.x, damp(3, dt));
    this.position.x += fx * travelSpeed * dt;
    this.position.z += fz * travelSpeed * dt;
    this.distance += Math.abs(travelSpeed) * dt;
    this.speed = travelSpeed;

    const omega = phase.phase === "BACKFLIP" ? 3.1 : phase.phase === "RIGHTING" ? 2.6 : 0.35;
    this.gForce = lerp(this.gForce, 1 + (omega * omega * 2.4) / 9.81, damp(6, dt));
    this.position.y = RIDE_HEIGHT + this.altitude + this.suspension;
  }

  private onPhaseEnter(phase: SimPhase) {
    if (phase === "INVERTED_FLIGHT") this.events.push("invert");
    if (phase === "RIGHTING") this.events.push("right");
  }

  private finishStunt() {
    this.inStunt = false;
    this.phaseIndex = -1;
    this.phaseTime = 0;
    this.flip = 0;
    this.roll = 0;
    this.altitude = 0;
    this.airborne = false;
    this.thruster = 0;
    this.phase = "DRIVING";
    this.status = "COMPLETE";
    this.statusHoldTimer = 3.4;
    this.lastStuntDuration = this.stuntTime;
    this.stuntCount += 1;
    this.stuntTime = 0;
    this.yaw = this.startYaw;
    // hand control back with a sensible driving speed, never below a crawl
    this.speed = clamp(Math.max(this.speed, this.startSpeed * 0.55), 22, TOP_SPEED);
    this.suspensionVel = -0.6;
    this.events.push("stuntEnd");
  }

  private updateWheels(dt: number) {
    const rolling = this.airborne ? this.speed * 0.55 : this.speed;
    this.wheelSpin += (rolling / WHEEL_RADIUS) * dt;
    if (this.airborne) this.wheelSpin += 26 * dt * clamp(this.thruster, 0, 1); // free-spinning in flight
    if (this.wheelSpin > 1e6) this.wheelSpin -= 1e6;
  }

  private updateQuaternion() {
    // yaw (runway heading) * flip (lateral axis) * roll — no angle wrapping,
    // the flip accumulates cleanly from 0 to 2PI.
    const qYaw = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.flip + this.pitchTrim);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    this.quaternion.copy(qYaw).multiply(qFlip).multiply(qRoll);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  /** Keeps world-space coordinates small on long drives (seamless, ground-only). */
  private recycleWorld() {
    if (this.inStunt || this.airborne) return;
    if (this.position.z < -WORLD_PERIOD) {
      this.position.z += WORLD_PERIOD;
      if (this.launch.valid) this.launch.z += WORLD_PERIOD;
    } else if (this.position.z > WORLD_PERIOD) {
      this.position.z -= WORLD_PERIOD;
      this.launch.z -= WORLD_PERIOD;
    }
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  telemetry(): Telemetry {
    const speedKmh = Math.abs(this.speed) * 3.6;
    const speedNorm = clamp(Math.abs(this.speed) / TOP_SPEED, 0, 1);
    const gearIdx = Math.min(6, Math.max(1, Math.ceil(speedNorm * 6) || 1));
    const bandLo = (gearIdx - 1) / 6;
    const bandHi = gearIdx / 6;
    let rpm = clamp((speedNorm - bandLo) / (bandHi - bandLo), 0, 1);
    if (Math.abs(this.speed) < 0.5) rpm = this.input.throttle ? 0.45 + 0.2 * Math.sin(this.simTime * 9) : 0.04;
    rpm = clamp(rpm * 0.86 + 0.1, 0.02, 1);

    let gear = `D${gearIdx}`;
    let driveMode = "SPORT";
    if (this.speed < -0.5) {
      gear = "R";
      driveMode = "REVERSE";
    } else if (Math.abs(this.speed) < 0.5) {
      gear = this.input.throttle ? "D1" : "N";
      driveMode = this.input.throttle ? "LAUNCH" : "STANDBY";
    } else if (this.inStunt) {
      gear = "AIR";
      driveMode = "STUNT";
    } else if (speedNorm > 0.72) {
      driveMode = "INSANE";
    } else if (this.input.throttle && speedNorm < 0.2) {
      driveMode = "LAUNCH";
    }

    return {
      phase: this.phase,
      status: this.status,
      speed: this.speed,
      speedKmh,
      speedNorm,
      rpm,
      gear,
      driveMode,
      altitude: Math.max(0, this.altitude),
      airborne: this.airborne,
      stuntTime: this.inStunt ? this.stuntTime : this.lastStuntDuration,
      stuntProgress: this.inStunt ? clamp(this.stuntTime / STUNT_DURATION, 0, 1) : this.lastStuntDuration ? 1 : 0,
      flipAngle: this.flip % (Math.PI * 2),
      flipDegrees: ((this.flip % (Math.PI * 2)) * 180) / Math.PI,
      inverted: Math.abs((this.flip % (Math.PI * 2)) - Math.PI) < 0.85 && this.airborne,
      gForce: this.gForce,
      distance: this.distance,
      wheelSpin: this.wheelSpin,
      suspension: this.suspension,
      thruster: this.thruster,
      skid: this.skid,
      steer: this.steerAngle,
      yaw: this.yaw,
      x: this.position.x,
      z: this.position.z,
      headingDeg: (-this.yaw * 180) / Math.PI,
      inStunt: this.inStunt,
      lastStuntDuration: this.lastStuntDuration,
      stuntCount: this.stuntCount,
      simTime: this.simTime,
    };
  }
}

export const worldOffsetFor = (z: number) => Math.round(z / WORLD_PERIOD) * WORLD_PERIOD;
