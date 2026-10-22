import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { sim } from "../sim/engine";
import { fx } from "../sim/fx";
import { audio } from "../sim/audio";
import { qualityEmitScale } from "../sim/particles";
import { useApp } from "../sim/store";
import type { Quality } from "../sim/types";
import RoadsterModel from "./RoadsterModel";
import Environment3D from "./Environment3D";
import ParticleLayer from "./ParticleLayer";
import CameraRig from "./CameraRig";

/** Advances the simulation, FX and audio, then publishes telemetry at ~18 Hz. */
function SimDriver() {
  const pushTelemetry = useApp((s) => s.pushTelemetry);
  const setFps = useApp((s) => s.setFps);
  const acc = useRef(0);
  const fpsAcc = useRef(0);
  const frames = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 25);
    sim.update(dt);
    const t = sim.telemetry();
    for (const e of sim.drainEvents()) audio.trigger(e);
    fx.update(dt, t);
    audio.update(t);

    acc.current += dt;
    if (acc.current >= 0.055) {
      acc.current = 0;
      pushTelemetry(t);
    }
    fpsAcc.current += rawDt;
    frames.current += 1;
    if (fpsAcc.current >= 0.75) {
      setFps(Math.round(frames.current / fpsAcc.current));
      fpsAcc.current = 0;
      frames.current = 0;
    }
  }, -10);

  return null;
}

/** Key/rim lighting that travels with the car so shadows stay crisp and cheap. */
function LightingRig({ quality }: { quality: Quality }) {
  const rig = useRef<THREE.Group>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const keyTarget = useRef<THREE.Object3D>(null);
  const red = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const shadows = quality === "HIGH";

  useEffect(() => {
    if (key.current && keyTarget.current) key.current.target = keyTarget.current;
  }, []);

  useFrame(() => {
    const p = sim.position;
    if (rig.current) {
      // snap to a coarse grid to kill shadow shimmer while tracking the car
      rig.current.position.set(Math.round(p.x * 2) / 2, 0, Math.round(p.z * 2) / 2);
    }
    if (red.current) {
      red.current.position.set(p.x, 0.45 + p.y * 0.5, p.z);
      red.current.intensity = 3 + sim.thruster * 26 + sim.skid * 10;
    }
    if (rim.current) rim.current.intensity = 0.85 + sim.thruster * 0.5;
  });

  return (
    <>
      <hemisphereLight args={["#243149", "#08090c", 0.55]} />
      <ambientLight intensity={0.16} color="#8fa6c9" />
      <group ref={rig}>
        <object3D ref={keyTarget} />
        <directionalLight
          ref={key}
          position={[-16, 26, -12]}
          intensity={2.1}
          color="#ffe6d4"
          castShadow={shadows}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={90}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-bias={-0.0009}
          shadow-normalBias={0.022}
        />
        <directionalLight ref={rim} position={[14, 7, 18]} intensity={0.85} color="#5f8dff" />
        <directionalLight position={[6, 2.5, -20]} intensity={0.4} color="#ff5a6a" />
        <pointLight ref={red} intensity={3} distance={16} decay={2} color="#ff2f45" />
      </group>
    </>
  );
}

/** Procedural studio reflections — no HDR download, baked once. */
function StudioEnvironment({ quality }: { quality: Quality }) {
  return (
    <Environment resolution={quality === "LOW" ? 32 : quality === "MEDIUM" ? 64 : 128} frames={1}>
      <color attach="background" args={["#04050a"]} />
      <Lightformer form="rect" intensity={3.4} color="#fff1e2" position={[0, 9, -12]} scale={[18, 5, 1]} rotation={[-0.5, 0, 0]} />
      <Lightformer form="rect" intensity={1.5} color="#7fa8ff" position={[-12, 4, 2]} scale={[10, 6, 1]} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={1.1} color="#ff6a5a" position={[12, 3, 4]} scale={[10, 5, 1]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer form="ring" intensity={2.2} color="#ffd8c0" position={[0, 6, 14]} scale={[8, 8, 1]} />
      <Lightformer form="rect" intensity={0.5} color="#1a2030" position={[0, -6, 0]} scale={[24, 24, 1]} rotation={[Math.PI / 2, 0, 0]} />
    </Environment>
  );
}

/** Drops render resolution when the GPU can't keep up, restores it when it can. */
function PerformanceGuard({ targetDpr }: { targetDpr: [number, number] }) {
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef(0);
  const frames = useRef(0);
  const current = useRef(targetDpr[1]);

  useEffect(() => {
    current.current = targetDpr[1];
    setDpr(targetDpr[1]);
  }, [targetDpr, setDpr]);

  useFrame((_, dt) => {
    acc.current += dt;
    frames.current += 1;
    if (acc.current < 1.2) return;
    const fps = frames.current / acc.current;
    acc.current = 0;
    frames.current = 0;
    if (fps < 42 && current.current > targetDpr[0]) {
      current.current = Math.max(targetDpr[0], current.current - 0.25);
      setDpr(current.current);
    } else if (fps > 58 && current.current < targetDpr[1]) {
      current.current = Math.min(targetDpr[1], current.current + 0.25);
      setDpr(current.current);
    }
  });
  return null;
}

function SceneFallback() {
  return (
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff2f45" emissive="#5a0a12" />
    </mesh>
  );
}

export default function SimulatorScene({
  quality,
  frameloop,
  onReady,
}: {
  quality: Quality;
  frameloop: "always" | "never";
  onReady: () => void;
}) {
  const dprRange = useMemo<[number, number]>(
    () => (quality === "HIGH" ? [1, 2] : quality === "MEDIUM" ? [0.85, 1.5] : [0.7, 1]),
    [quality],
  );
  useEffect(() => {
    fx.setQualityScale(qualityEmitScale(quality));
  }, [quality]);

  return (
    <Canvas
      // remount on quality change so shadow maps / composer state stay clean
      key={quality}
      shadows={quality === "HIGH"}
      dpr={dprRange}
      frameloop={frameloop}
      performance={{ min: 0.5 }}
      gl={{
        antialias: quality === "LOW",
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      camera={{ position: [0, 3.2, 12], fov: 56, near: 0.08, far: 6000 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.06;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.background = new THREE.Color("#05060a");
        scene.fog = new THREE.Fog("#0a0c12", 90, 1500);
        onReady();
      }}
    >
      <SimDriver />
      <PerformanceGuard targetDpr={dprRange} />
      <LightingRig quality={quality} />

      <Suspense fallback={<SceneFallback />}>
        <StudioEnvironment quality={quality} />
        <Environment3D quality={quality} />
        <RoadsterModel quality={quality} />
        <ParticleLayer quality={quality} />
      </Suspense>

      <CameraRig />
      <AdaptiveDpr />

      {quality !== "LOW" && (
        <EffectComposer enableNormalPass={false} multisampling={quality === "HIGH" ? 2 : 0}>
          <Bloom
            intensity={quality === "HIGH" ? 0.95 : 0.6}
            luminanceThreshold={0.58}
            luminanceSmoothing={0.28}
            mipmapBlur
            radius={0.78}
          />
          <Vignette offset={0.24} darkness={0.86} eskil={false} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
