export type SimPhase =
  | "IDLE"
  | "ACCELERATING"
  | "DRIVING"
  | "TAKEOFF"
  | "BACKFLIP"
  | "INVERTED_FLIGHT"
  | "RIGHTING"
  | "LANDING"
  | "RECOVERY";

export type StuntStatus =
  | "READY"
  | "TAKEOFF"
  | "BACKFLIP"
  | "INVERTED"
  | "RIGHTING"
  | "LANDING"
  | "COMPLETE";

export type CameraMode = "CHASE" | "CINEMATIC" | "SIDE" | "COCKPIT" | "FREE";

export type Quality = "LOW" | "MEDIUM" | "HIGH";

export type SimEvent =
  | "stuntStart"
  | "takeoff"
  | "invert"
  | "right"
  | "touchdown"
  | "stuntEnd"
  | "reset"
  | "boost";

export interface Telemetry {
  phase: SimPhase;
  status: StuntStatus;
  /** m/s, signed (negative = reversing) */
  speed: number;
  speedKmh: number;
  /** 0..1 normalised against top speed */
  speedNorm: number;
  /** 0..1 tachometer needle */
  rpm: number;
  gear: string;
  driveMode: string;
  altitude: number;
  airborne: boolean;
  /** stunt elapsed seconds */
  stuntTime: number;
  /** 0..1 progress through the scripted sequence */
  stuntProgress: number;
  /** accumulated backward rotation in radians (0 -> 2PI) */
  flipAngle: number;
  flipDegrees: number;
  inverted: boolean;
  gForce: number;
  distance: number;
  wheelSpin: number;
  suspension: number;
  thruster: number;
  skid: number;
  steer: number;
  yaw: number;
  x: number;
  z: number;
  headingDeg: number;
  inStunt: boolean;
  lastStuntDuration: number;
  stuntCount: number;
  simTime: number;
}

export interface VehicleInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
export const easeInQuad = (t: number) => clamp(t, 0, 1) ** 2;
/** frame-rate independent exponential damping factor */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);
