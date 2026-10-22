import { ComponentRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { sim } from "../sim/engine";
import { fx } from "../sim/fx";
import { CAR } from "../sim/specs";
import { useApp } from "../sim/store";
import { clamp, damp } from "../sim/types";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Five camera personalities plus an automatic stunt director.
 * All motion is damped, ground-clamped and quaternion based — the rig never
 * loses the car and never dips under the runway.
 */
export default function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const mode = useApp((s) => s.cameraMode);
  const autoCam = useApp((s) => s.autoCam);
  const shakeOn = useApp((s) => s.cameraShake);
  const reduced = useApp((s) => s.reducedMotion);
  const screen = useApp((s) => s.screen);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const heroAngle = useRef(0);

  const rigPos = useMemo(() => new THREE.Vector3(0, 3, 12), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const curLook = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const shakeV = useMemo(() => new THREE.Vector3(), []);
  const targetQ = useMemo(() => new THREE.Quaternion(), []);
  const prevCar = useMemo(() => new THREE.Vector3(), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const bootstrapped = useRef(false);
  const lastMode = useRef(mode);

  useEffect(() => {
    if (mode !== "FREE") bootstrapped.current = false;
    if (mode === "FREE") {
      prevCar.copy(sim.position);
      const c = controls.current;
      if (c) {
        c.target.copy(sim.position).add(CAR.chaseFocus);
        camera.position.set(sim.position.x + 6, sim.position.y + 2.2, sim.position.z + 7);
        c.update();
      }
    }
    lastMode.current = mode;
  }, [mode, camera, prevCar]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = sim.position;
    const speedNorm = clamp(Math.abs(sim.speed) / 84, 0, 1);
    const yaw = sim.yaw;

    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // ------------------------------------------------------------ FREE
    if (mode === "FREE") {
      const c = controls.current;
      if (c) {
        const dx = p.x - prevCar.x;
        const dy = p.y - prevCar.y;
        const dz = p.z - prevCar.z;
        c.target.x += dx;
        c.target.y += dy;
        c.target.z += dz;
        camera.position.x += dx;
        camera.position.y += dy;
        camera.position.z += dz;
        prevCar.copy(p);
      }
      const wantFov = 50;
      if (Math.abs(camera.fov - wantFov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, wantFov, damp(6, dt));
        camera.updateProjectionMatrix();
      }
      return;
    }

    // ------------------------------------------------------ HERO orbit
    if (screen === "hero") {
      heroAngle.current += dt * 0.17;
      const a = heroAngle.current;
      const r = 10.4 + Math.sin(a * 0.6) * 1.6;
      desired.set(p.x + Math.cos(a) * r, p.y + 2.1 + Math.sin(a * 0.8) * 0.9, p.z + Math.sin(a) * r);
      look.copy(p).addScaledVector(UP, 0.3);
      rigPos.lerp(desired, damp(2.4, dt));
      curLook.lerp(look, damp(3.2, dt));
      camera.position.copy(rigPos);
      targetQ.setFromRotationMatrix(m4.lookAt(camera.position, curLook, UP));
      camera.quaternion.slerp(targetQ, damp(4, dt));
      const fov = 40;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, fov, damp(3, dt));
        camera.updateProjectionMatrix();
      }
      return;
    }

    // ---------------------------------------------- automatic director
    const directing = autoCam && sim.inStunt;
    const effective = directing ? "CINEMATIC" : mode;
    const flipSide = sim.stuntCount % 2 === 0 ? 1 : -1;
    const alt = sim.altitude;
    let lambda = 4.2;
    let wantFov = 56 + speedNorm * 12;

    switch (effective) {
      case "CHASE": {
        desired.copy(p).addScaledVector(fwd, -9.6 - speedNorm * 1.6).addScaledVector(UP, 2.9 + speedNorm * 0.5);
        desired.x += Math.sin(sim.simTime * 0.7) * 0.12;
        look.copy(p).addScaledVector(UP, 0.85).addScaledVector(fwd, 5.5);
        lambda = 5.5;
        break;
      }
      case "SIDE": {
        desired.copy(p).addScaledVector(right, 19).addScaledVector(UP, 2.4).addScaledVector(fwd, -1.5);
        look.copy(p).addScaledVector(UP, 0.4);
        wantFov = 38;
        lambda = 4.6;
        break;
      }
      case "COCKPIT": {
        desired.copy(CAR.cockpit).applyQuaternion(sim.quaternion).add(p);
        look.copy(desired).addScaledVector(sim.forward, 8).addScaledVector(UP, 0.2);
        wantFov = 72;
        lambda = 22;
        break;
      }
      case "CINEMATIC":
      default: {
        const phase = sim.phase;
        if (phase === "TAKEOFF") {
          desired.copy(p).addScaledVector(fwd, -8).addScaledVector(right, -6.5 * flipSide).addScaledVector(UP, 1.5 + alt * 0.7);
          look.copy(p).addScaledVector(UP, 0.6);
          wantFov = 52;
        } else if (phase === "BACKFLIP") {
          // clean side profile so the full 360° is readable
          desired.copy(p).addScaledVector(right, 16 * flipSide).addScaledVector(UP, alt * 0.75 + 1.1).addScaledVector(fwd, -2.5);
          look.copy(p);
          wantFov = 42;
          lambda = 3.6;
        } else if (phase === "INVERTED_FLIGHT") {
          // low, looking up at the inverted car
          desired.copy(p).addScaledVector(right, -11 * flipSide).addScaledVector(fwd, 7.5);
          desired.y = 1.1 + alt * 0.22;
          look.copy(p);
          wantFov = 46;
          lambda = 3.4;
        } else if (phase === "RIGHTING") {
          desired.copy(p).addScaledVector(right, -15 * flipSide).addScaledVector(UP, alt * 0.7 + 1.4).addScaledVector(fwd, -3);
          look.copy(p);
          wantFov = 42;
          lambda = 3.6;
        } else if (phase === "LANDING") {
          desired.copy(p).addScaledVector(fwd, -12).addScaledVector(right, 7 * flipSide).addScaledVector(UP, 2.4);
          look.copy(p).addScaledVector(UP, 0.5);
          wantFov = 54;
        } else {
          desired.copy(p).addScaledVector(fwd, -10).addScaledVector(UP, 3.1);
          look.copy(p).addScaledVector(UP, 0.8);
          wantFov = 56;
        }
        break;
      }
    }

    if (!bootstrapped.current) {
      // avoid a long fly-in from the origin on the very first frame
      rigPos.copy(desired);
      curLook.copy(look);
      camera.quaternion.setFromRotationMatrix(m4.lookAt(desired, look, UP));
      bootstrapped.current = true;
    }
    lastMode.current = mode;

    rigPos.lerp(desired, damp(lambda, dt));
    curLook.lerp(look, damp(lambda * 1.35, dt));

    // keep the lens out of the tarmac (cockpit is allowed to go inverted)
    if (effective !== "COCKPIT") rigPos.y = Math.max(rigPos.y, 0.85);

    // camera shake: landing impacts + high-speed buffet
    const shakeAmt = shakeOn && !reduced ? fx.shake * 0.42 + speedNorm * speedNorm * 0.05 : 0;
    if (shakeAmt > 0.0005) {
      shakeV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeAmt);
    } else {
      shakeV.set(0, 0, 0);
    }

    camera.position.copy(rigPos).add(shakeV);

    if (effective === "COCKPIT") {
      // inherit the vehicle orientation so the world spins through the flip
      targetQ.copy(sim.quaternion);
      camera.quaternion.slerp(targetQ, damp(18, dt));
      camera.rotateX(shakeV.y * 0.05);
    } else {
      targetQ.setFromRotationMatrix(m4.lookAt(camera.position, curLook, UP));
      camera.quaternion.slerp(targetQ, damp(lambda * 1.6, dt));
    }

    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, wantFov, damp(3.5, dt));
      camera.updateProjectionMatrix();
    }
  });

  if (mode !== "FREE") return null;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.75}
      zoomSpeed={0.8}
      enablePan={false}
      minDistance={3.2}
      maxDistance={45}
      maxPolarAngle={1.52}
    />
  );
}
