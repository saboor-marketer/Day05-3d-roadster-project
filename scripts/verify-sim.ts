/**
 * Headless acceptance harness for the stunt state machine.
 * Run with:
 *   npx esbuild scripts/verify-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/verify.mjs && node /tmp/verify.mjs
 */
import * as THREE from "three";
import { VehicleSim, STUNT_DURATION, STUNT_TIMELINE } from "../src/sim/VehicleSim";

let failures = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg} ${extra}`);
  } else {
    console.log(`  ✓ ${msg} ${extra}`);
  }
};

const DT = 1 / 60;
const step = (sim: VehicleSim, seconds: number, trace?: (s: VehicleSim) => void) => {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.update(DT);
    trace?.(sim);
  }
};

console.log("\n[1] IDLE + ACCELERATION");
{
  const sim = new VehicleSim();
  const t0 = sim.telemetry();
  ok(t0.phase === "IDLE" && t0.status === "READY", "starts IDLE / READY");
  ok(Math.abs(t0.speedKmh) < 0.001, "stationary at start");
  ok(Math.abs(sim.position.y - 0.6) < 1e-6, `pivot at ride height (${sim.position.y.toFixed(3)} m)`);

  sim.input.throttle = true;
  let maxAccel = 0;
  let prev = 0;
  step(sim, 1.9, (s) => {
    maxAccel = Math.max(maxAccel, (s.speed - prev) / DT);
    prev = s.speed;
  });
  const kmh = Math.abs(sim.speed) * 3.6;
  ok(kmh > 90, `reaches >90 km/h in 1.9 s (got ${kmh.toFixed(1)} km/h)`);
  ok(maxAccel > 12, `peak acceleration ${maxAccel.toFixed(1)} m/s²`);
  ok(sim.position.z < -20, `moved down the runway (z=${sim.position.z.toFixed(1)} m)`);
  ok(sim.telemetry().phase !== "IDLE", "phase leaves IDLE under throttle");
  ok(sim.wheelSpin > 10, `wheels spin with speed (${sim.wheelSpin.toFixed(1)} rad)`);

  step(sim, 8);
  ok(Math.abs(sim.speed) * 3.6 > 250, `top speed ${(Math.abs(sim.speed) * 3.6).toFixed(0)} km/h after 10 s`);
  ok(sim.speed <= 84.001, "never exceeds the configured top speed");

  sim.input.throttle = false;
  sim.input.brake = true;
  step(sim, 6);
  ok(sim.speed < -0.5, `brake past standstill engages reverse (${sim.speed.toFixed(2)} m/s)`);
  ok(sim.telemetry().gear === "R", "gear indicator shows R");
}

console.log("\n[2] STEERING");
{
  const sim = new VehicleSim();
  sim.speed = 20;
  sim.input.left = true;
  step(sim, 1);
  ok(sim.yaw > 0.2, `steer left increases yaw (${sim.yaw.toFixed(3)} rad)`);
  ok(sim.position.x < -1, `vehicle translates left (x=${sim.position.x.toFixed(2)} m)`);
  ok(sim.steerAngle > 0.1, `front wheels turned (${sim.steerAngle.toFixed(3)} rad)`);
  sim.input.left = false;
  sim.input.right = true;
  const yawBefore = sim.yaw;
  step(sim, 1);
  ok(sim.yaw < yawBefore, "steer right reduces yaw");
}

console.log("\n[3] FULL BACKFLIP SEQUENCE");
{
  const sim = new VehicleSim();
  sim.speed = 30;
  const visited: string[] = [];
  let peakAlt = 0;
  let maxFlip = 0;
  let minUpY = 1;
  let sawInverted = false;
  const up = new THREE.Vector3();
  const traceStart = sim.position.z;

  const trace = (s: VehicleSim) => {
    const t = s.telemetry();
    if (visited[visited.length - 1] !== t.phase) visited.push(t.phase);
    peakAlt = Math.max(peakAlt, t.altitude);
    maxFlip = Math.max(maxFlip, s.flip);
    up.set(0, 1, 0).applyQuaternion(s.quaternion);
    minUpY = Math.min(minUpY, up.y);
    if (t.inverted) sawInverted = true;
    if (!Number.isFinite(s.position.x + s.position.y + s.position.z + s.flip)) finite = false;
  };
  let finite = true;

  ok(sim.triggerStunt(), "stunt armed");
  ok(sim.inStunt, "state machine entered stunt mode");
  step(sim, STUNT_DURATION + 1.6, trace);
  ok(finite, "every frame produced a finite transform");

  ok(!sim.inStunt, "sequence terminates on its own");
  ok(sim.status === "COMPLETE", `status COMPLETE (got ${sim.status})`);
  const expected = ["DRIVING", ...STUNT_TIMELINE.map((p) => p.phase)];
  ok(
    expected.every((p) => visited.includes(p)),
    `visited every phase: ${visited.join(" → ")}`,
  );
  ok(peakAlt > 6 && peakAlt < 9, `altitude apex ${peakAlt.toFixed(2)} m`);
  ok(Math.abs(sim.altitude) < 0.05, `back on the ground (alt=${sim.altitude.toFixed(3)} m)`);
  ok(maxFlip > Math.PI * 2 - 0.05, `full 360° rotation accumulated (${((maxFlip * 180) / Math.PI).toFixed(0)}°)`);
  ok(minUpY < -0.9, `vehicle really went upside down (min up.y = ${minUpY.toFixed(3)})`);
  ok(sawInverted, "telemetry flagged the INVERTED phase");
  ok(Math.abs(sim.flip) < 1e-6, `flip unwound cleanly to 0 (${sim.flip})`);
  ok(Math.abs(sim.position.y - 0.6) < 0.16, `ride height restored (${sim.position.y.toFixed(3)} m)`);
  ok(sim.speed > 10, `drives away under its own momentum (${(sim.speed * 3.6).toFixed(0)} km/h)`);
  ok(sim.position.z < traceStart - 60, `covered ground during the stunt (Δz=${(sim.position.z - traceStart).toFixed(1)} m)`);
  ok(Math.abs(sim.roll) < 0.05 && Math.abs(sim.yaw) < 0.05, "aligned with the runway after recovery");

  // driving controls must work again
  sim.input.throttle = true;
  const before = sim.speed;
  step(sim, 1);
  ok(sim.speed > before, "throttle responds again after landing");
  sim.input.throttle = false;
  sim.input.left = true;
  const y0 = sim.yaw;
  step(sim, 0.8);
  ok(sim.yaw !== y0, "steering responds again after landing");
}

console.log("\n[4] DETERMINISTIC REPLAY + RESET");
{
  const record = () => {
    const s = new VehicleSim();
    s.speed = 26;
    s.triggerStunt();
    const out: string[] = [];
    step(s, STUNT_DURATION + 1.2, (x) => out.push(`${x.position.z.toFixed(5)}|${x.flip.toFixed(6)}|${x.position.y.toFixed(5)}`));
    return { out, last: s.lastStuntDuration, count: s.stuntCount };
  };
  const a = record();

  const sim = new VehicleSim();
  sim.speed = 26;
  sim.triggerStunt();
  step(sim, STUNT_DURATION + 1.2);
  sim.replayStunt();
  const b: string[] = [];
  step(sim, STUNT_DURATION + 1.2, (x) => b.push(`${x.position.z.toFixed(5)}|${x.flip.toFixed(6)}|${x.position.y.toFixed(5)}`));

  const drift = b.reduce((acc, v, i) => acc + Math.abs(parseFloat(v.split("|")[1]) - parseFloat(a.out[i].split("|")[1])), 0);
  ok(drift < 1e-6, `replay is frame-identical (Σ|Δflip| = ${drift.toExponential(2)})`);
  ok(sim.stuntCount === 2, `stunt counter incremented (${sim.stuntCount})`);
  ok(Math.abs(sim.lastStuntDuration - STUNT_DURATION) < 0.15, `measured duration ${sim.lastStuntDuration.toFixed(2)} s ≈ ${STUNT_DURATION.toFixed(2)} s`);

  sim.reset();
  const t = sim.telemetry();
  ok(
    t.speed === 0 && t.altitude === 0 && t.status === "READY" && t.phase === "IDLE" && sim.position.length() < 1 && sim.flip === 0,
    "reset restores the pristine state",
  );
  ok(sim.triggerStunt(), "stunt can be armed again immediately after reset");
}

console.log("\n[5] EDGE CASES");
{
  const sim = new VehicleSim();
  // launch from a standstill — launch control must assist, never stall
  ok(sim.triggerStunt(), "stunt triggers from a standstill");
  ok(sim.speed >= 24, `launch control spooled to ${sim.speed.toFixed(1)} m/s`);
  ok(!sim.triggerStunt(), "cannot double-trigger mid-flight");
  step(sim, STUNT_DURATION + 1.4);
  ok(!sim.inStunt && Math.abs(sim.altitude) < 0.05, "still terminates cleanly from a standing start");

  // huge frame spike (tab switch) must not break the timeline
  const s2 = new VehicleSim();
  s2.speed = 40;
  s2.triggerStunt();
  s2.update(3.2); // 3.2 s in one step, clamped internally
  ok(Number.isFinite(s2.flip) && Number.isFinite(s2.position.z), "survives a 3.2 s frame spike");
  step(s2, STUNT_DURATION + 2);
  ok(!s2.inStunt, "recovers to normal driving after the spike");

  // pause freezes the world
  const s3 = new VehicleSim();
  s3.speed = 30;
  s3.togglePause();
  const zBefore = s3.position.z;
  step(s3, 2);
  ok(s3.position.z === zBefore, "pause freezes the simulation");
  s3.togglePause();
  step(s3, 0.5);
  ok(s3.position.z !== zBefore, "resume continues the simulation");

  // slow-motion tempo stretches the sequence proportionally
  const s4 = new VehicleSim();
  s4.speed = 30;
  s4.stuntSpeed = 0.5;
  s4.triggerStunt();
  step(s4, STUNT_DURATION);
  ok(s4.inStunt, `0.5× tempo still in flight at ${STUNT_DURATION.toFixed(2)} s`);
  step(s4, STUNT_DURATION + 0.6);
  ok(!s4.inStunt, "0.5× tempo completes at ~2× the duration");

  // runaway driving: the world recycles without NaN
  const s5 = new VehicleSim();
  s5.input.throttle = true;
  step(s5, 120);
  ok(Number.isFinite(s5.position.z) && Math.abs(s5.position.z) <= 1200, `world recycled (z=${s5.position.z.toFixed(1)})`);
  ok(s5.distance > 5000, `odometer keeps counting (${(s5.distance / 1000).toFixed(2)} km)`);
  ok(Math.abs(s5.position.x) <= 11.001, `stays inside the runway boundary (x=${s5.position.x.toFixed(2)})`);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
