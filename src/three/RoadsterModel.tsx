import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { sim } from "../sim/engine";
import { CAR } from "../sim/specs";
import { clamp, damp } from "../sim/types";
import { makeCarbonTexture, makeBlobTexture, makeGlowTexture } from "./textures";

const RIDE = CAR.rideHeight;

/** Build a bevelled solid of revolution-free "slab" from a 2D side profile. */
function useProfile(
  pts: [number, number][],
  depth: number,
  opts?: { bevel?: number; hole?: [number, number][]; curve?: number },
) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    if (opts?.hole) {
      const hole = new THREE.Path();
      hole.moveTo(opts.hole[0][0], opts.hole[0][1]);
      for (let i = 1; i < opts.hole.length; i++) hole.lineTo(opts.hole[i][0], opts.hole[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    const b = opts?.bevel ?? 0.06;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: b * 0.85,
      bevelSize: b,
      bevelOffset: 0,
      bevelSegments: 3,
      curveSegments: opts?.curve ?? 4,
      steps: 1,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2); // profile +X (nose) -> world -Z (forward)
    g.translate(0, -RIDE, 0);
    g.computeVertexNormals();
    return g;
  }, [pts, depth, opts]);
}

const BODY_PROFILE: [number, number][] = [
  [-2.3, 0.3],
  [-2.3, 0.6],
  [-2.2, 0.71],
  [-1.78, 0.77],
  [-1.28, 0.81],
  [-0.6, 0.83],
  [0.1, 0.84],
  [0.62, 0.81],
  [1.1, 0.73],
  [1.7, 0.63],
  [2.16, 0.53],
  [2.32, 0.41],
  [2.3, 0.25],
  [2.05, 0.16],
  [1.2, 0.12],
  [-0.3, 0.11],
  [-1.7, 0.13],
  [-2.22, 0.2],
];

const CABIN_OUTER: [number, number][] = [
  [-1.18, 0.74],
  [-1.04, 0.92],
  [-0.68, 1.06],
  [-0.18, 1.12],
  [0.26, 1.09],
  [0.6, 0.95],
  [0.79, 0.78],
  [0.56, 0.765],
  [-0.95, 0.755],
];

const CABIN_INNER: [number, number][] = [
  [-1.0, 0.79],
  [-0.9, 0.92],
  [-0.6, 1.01],
  [-0.18, 1.055],
  [0.22, 1.03],
  [0.5, 0.91],
  [0.63, 0.8],
  [0.44, 0.79],
  [-0.86, 0.785],
];

const ROOF_PROFILE: [number, number][] = [
  [-0.74, 1.0],
  [-0.3, 1.1],
  [0.14, 1.075],
  [0.36, 0.99],
  [0.2, 0.975],
  [-0.26, 1.03],
  [-0.66, 0.955],
];

function Wheel({
  axleZ,
  side,
  front,
  spinRef,
  steerRef,
  materials,
}: {
  axleZ: number;
  side: 1 | -1;
  front: boolean;
  spinRef: (el: THREE.Group | null) => void;
  steerRef?: (el: THREE.Group | null) => void;
  materials: ReturnType<typeof useWheelMaterials>;
}) {
  const x = CAR.track * side;
  const y = CAR.wheelCenterY;
  const spin = (
    <group ref={spinRef}>
      {/* tyre */}
      <mesh geometry={materials.tyreGeo} material={materials.rubber} castShadow />
      {/* tread shoulder */}
      <mesh geometry={materials.shoulderGeo} material={materials.rubber} />
      {/* rim barrel */}
      <mesh geometry={materials.rimGeo} material={materials.rim} />
      {/* 5-spoke aero face */}
      {materials.spokes.map((g, i) => (
        <mesh key={i} geometry={g} material={materials.rim} position={[side * 0.13, 0, 0]} />
      ))}
      <mesh geometry={materials.hubGeo} material={materials.chrome} />
      <mesh geometry={materials.capGeo} material={materials.emissiveRed} position={[side * 0.165, 0, 0]} />
      {/* brake disc */}
      <mesh geometry={materials.discGeo} material={materials.steel} position={[side * 0.06, 0, 0]} />
    </group>
  );

  return (
    <group position={[x, y, axleZ]}>
      {front ? (
        <group ref={steerRef}>
          {spin}
          <mesh geometry={materials.caliperGeo} material={materials.caliper} position={[side * 0.07, 0.16, 0]} />
        </group>
      ) : (
        <>
          {spin}
          <mesh geometry={materials.caliperGeo} material={materials.caliper} position={[side * 0.07, 0.16, 0]} />
        </>
      )}
    </group>
  );
}

function useWheelMaterials() {
  return useMemo(() => {
    const R = CAR.wheelRadius;
    const W = CAR.wheelWidth;
    const cyl = (rt: number, rb: number, h: number, seg = 26, open = false) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
      g.rotateZ(Math.PI / 2); // axis along X
      return g;
    };
    const tyreGeo = cyl(R, R, W, 30);
    const shoulderGeo = cyl(R * 1.005, R * 1.005, W * 0.55, 30);
    const rimGeo = cyl(R * 0.7, R * 0.7, W * 1.01, 24, true);
    const hubGeo = cyl(R * 0.2, R * 0.2, W * 0.9, 14);
    const capGeo = cyl(R * 0.09, R * 0.09, 0.02, 12);
    const discGeo = cyl(R * 0.62, R * 0.62, 0.022, 22);
    const caliperGeo = new THREE.BoxGeometry(0.055, 0.15, 0.1);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.035, R * 0.62, 0.075);
      g.translate(0, R * 0.36, 0);
      g.rotateX((i / 5) * Math.PI * 2);
      spokes.push(g);
    }

    const rubber = new THREE.MeshStandardMaterial({ color: "#14151a", roughness: 0.92, metalness: 0.04 });
    const rim = new THREE.MeshStandardMaterial({ color: "#2a2d34", roughness: 0.34, metalness: 0.92 });
    const chrome = new THREE.MeshStandardMaterial({ color: "#c9ccd4", roughness: 0.18, metalness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: "#5b5f68", roughness: 0.42, metalness: 0.95 });
    const caliper = new THREE.MeshStandardMaterial({ color: "#c2131f", roughness: 0.36, metalness: 0.5 });
    const emissiveRed = new THREE.MeshStandardMaterial({
      color: "#1a0305",
      emissive: new THREE.Color("#ff2f45"),
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });

    return { tyreGeo, shoulderGeo, rimGeo, hubGeo, capGeo, discGeo, caliperGeo, spokes, rubber, rim, chrome, steel, caliper, emissiveRed };
  }, []);
}

export default function RoadsterModel({ quality }: { quality: "LOW" | "MEDIUM" | "HIGH" }) {
  const root = useRef<THREE.Group>(null);
  const chassis = useRef<THREE.Group>(null);
  const wing = useRef<THREE.Group>(null);
  const wheelSpin = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const wheelSteer = useRef<(THREE.Group | null)[]>([null, null]);
  const underGlow = useRef<THREE.Mesh>(null);
  const flameL = useRef<THREE.Mesh>(null);
  const flameR = useRef<THREE.Mesh>(null);
  const shadowBlob = useRef<THREE.Mesh>(null);
  const groundFx = useRef<THREE.Group>(null);

  const bodyGeo = useProfile(BODY_PROFILE, 1.66, { bevel: 0.055 });
  const cabinFrameGeo = useProfile(CABIN_OUTER, 1.42, { bevel: 0.03, hole: CABIN_INNER });
  const glassGeo = useProfile(CABIN_INNER, 1.34, { bevel: 0.02 });
  const roofGeo = useProfile(ROOF_PROFILE, 0.98, { bevel: 0.025 });

  const wheelMats = useWheelMaterials();

  const textures = useMemo(() => {
    const carbon = makeCarbonTexture();
    carbon.repeat.set(6, 6);
    const blob = makeBlobTexture("rgba(0,0,0,0.9)");
    const glow = makeGlowTexture("rgba(255,255,255,1)", "rgba(255,120,60,0)");
    return { carbon, blob, glow };
  }, []);

  const mats = useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#9d0d1a"),
      metalness: 0.86,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
      sheen: 0.35,
      sheenColor: new THREE.Color("#ff6a5a"),
    });
    const paintDark = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#5c0710"),
      metalness: 0.8,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.2,
    });
    const carbon = new THREE.MeshStandardMaterial({
      map: textures.carbon,
      color: "#6d7076",
      roughness: 0.42,
      metalness: 0.55,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0a0d12"),
      metalness: 0.2,
      roughness: 0.06,
      transparent: true,
      opacity: 0.42,
      envMapIntensity: 2.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const chrome = new THREE.MeshStandardMaterial({ color: "#b9bdc6", roughness: 0.16, metalness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: "#0b0c0f", roughness: 0.7, metalness: 0.25 });
    const interior = new THREE.MeshStandardMaterial({ color: "#16171c", roughness: 0.85, metalness: 0.05 });
    const head = new THREE.MeshStandardMaterial({
      color: "#eaf3ff",
      emissive: new THREE.Color("#dceaff"),
      emissiveIntensity: 3.4,
      roughness: 0.2,
    });
    const tail = new THREE.MeshStandardMaterial({
      color: "#2a0206",
      emissive: new THREE.Color("#ff1a2c"),
      emissiveIntensity: 1.6,
      roughness: 0.3,
    });
    const under = new THREE.MeshStandardMaterial({
      color: "#160204",
      emissive: new THREE.Color("#ff2f45"),
      emissiveIntensity: 0.9,
      roughness: 0.5,
    });
    return { paint, paintDark, carbon, glass, chrome, dark, interior, head, tail, under };
  }, [textures.carbon]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
      (Object.values(wheelMats) as unknown[]).forEach((v) => {
        if (v instanceof THREE.Material || v instanceof THREE.BufferGeometry) v.dispose();
      });
      [
        wheelMats.tyreGeo,
        wheelMats.shoulderGeo,
        wheelMats.rimGeo,
        wheelMats.hubGeo,
        wheelMats.capGeo,
        wheelMats.discGeo,
        wheelMats.caliperGeo,
        ...wheelMats.spokes,
        bodyGeo,
        cabinFrameGeo,
        glassGeo,
        roofGeo,
        textures.carbon,
        textures.blob,
        textures.glow,
      ].forEach((g) => g.dispose());
    };
  }, [mats, wheelMats, bodyGeo, cabinFrameGeo, glassGeo, roofGeo, textures]);

  useFrame((_, delta) => {
    {
      const dt = Math.min(delta, 0.05);
      const s = sim;
      const r = root.current;
      if (!r) return;
      r.position.set(s.position.x, RIDE + s.altitude, s.position.z);
      r.quaternion.copy(s.quaternion);

      if (chassis.current) chassis.current.position.y = s.suspension;
      const wheelLift = s.suspension * 0.42;
      for (let i = 0; i < 4; i++) {
        const g = wheelSpin.current[i];
        if (g) {
          g.rotation.x = -s.wheelSpin;
          g.position.y = wheelLift;
        }
      }
      for (let i = 0; i < 2; i++) {
        const g = wheelSteer.current[i];
        if (g) g.rotation.y = s.steerAngle;
      }

      // active rear wing
      const deploy = clamp(Math.max(Math.abs(s.speed) / 34, s.inStunt ? 1 : 0, s.thruster), 0, 1);
      if (wing.current) {
        wing.current.position.y = -RIDE + 0.86 + deploy * 0.14;
        wing.current.rotation.x = -0.06 + deploy * 0.3;
      }

      // lights
      const braking = s.input.brake && s.speed > 0.2;
      mats.tail.emissiveIntensity = THREE.MathUtils.lerp(
        mats.tail.emissiveIntensity,
        braking ? 5.5 : 1.5 + Math.sin(s.simTime * 2) * 0.12,
        damp(12, dt),
      );
      mats.head.emissiveIntensity = 3.2 + Math.sin(s.simTime * 9) * 0.06 + s.thruster * 1.4;
      mats.under.emissiveIntensity = 0.7 + s.thruster * 3.2 + clamp(s.altitude * 0.16, 0, 1.4);

      // thruster flames
      const f = s.thruster;
      const sc = 0.25 + f * 1.5 + Math.sin(s.simTime * 40) * 0.06 * f;
      [flameL, flameR].forEach((m) => {
        const mesh = m.current;
        if (!mesh) return;
        mesh.scale.set(0.5 + f * 0.6, 0.5 + f * 0.6, Math.max(sc, 0.001));
        mesh.visible = f > 0.04;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = clamp(f * 0.85, 0, 0.9);
      });

      // contact shadow + under-glow pool stay glued to the runway
      if (groundFx.current) {
        groundFx.current.position.set(s.position.x, 0, s.position.z);
        groundFx.current.rotation.y = s.yaw;
      }
      if (underGlow.current) {
        const m = underGlow.current;
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = clamp(0.5 - s.altitude * 0.05, 0, 0.6) * (0.45 + s.thruster * 0.9);
        m.scale.setScalar(1 + s.altitude * 0.05);
        m.visible = mat.opacity > 0.01;
      }
      if (shadowBlob.current) {
        const m = shadowBlob.current;
        const k = clamp(1 - s.altitude * 0.085, 0, 1);
        m.scale.setScalar(1 + s.altitude * 0.1);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * k * k;
        m.visible = k > 0.02;
      }
    }
  });

  const arch = useMemo(() => {
    const g = new THREE.TorusGeometry(CAR.wheelRadius + 0.075, 0.085, 8, 22, Math.PI);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const liner = useMemo(() => {
    const g = new THREE.CylinderGeometry(CAR.wheelRadius + 0.06, CAR.wheelRadius + 0.06, 0.32, 20, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);

  return (
    <>
      {/* runway-locked contact shadow + under-glow pool (never flips with the car) */}
      <group ref={groundFx}>
        <mesh ref={shadowBlob} position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[3.1, 5.4]} />
          <meshBasicMaterial map={textures.blob} transparent depthWrite={false} opacity={0.55} />
        </mesh>
        <mesh ref={underGlow} position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <planeGeometry args={[2.8, 5]} />
          <meshBasicMaterial
            map={textures.glow}
            color="#ff2f45"
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      <group ref={root}>
      <group ref={chassis}>
        {/* ---------------- body ---------------- */}
        <mesh geometry={bodyGeo} material={mats.paint} castShadow={quality !== "LOW"} receiveShadow={quality === "HIGH"} />
        {/* ---------------- greenhouse ---------------- */}
        <mesh geometry={cabinFrameGeo} material={mats.paintDark} castShadow={quality !== "LOW"} />
        <mesh geometry={glassGeo} material={mats.glass} renderOrder={4} />
        <mesh geometry={roofGeo} material={mats.paint} castShadow={quality !== "LOW"} />

        {/* rear buttresses */}
        {[-1, 1].map((s) => (
          <RoundedBox
            key={s}
            args={[0.2, 0.1, 0.72]}
            radius={0.04}
            smoothness={3}
            position={[s * 0.42, 0.24, 0.78]}
            rotation={[0.42, 0, 0]}
            material={mats.paint}
            castShadow={quality !== "LOW"}
          />
        ))}

        {/* ---------------- interior ---------------- */}
        <group>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.36, -0.02, 0.02]}>
              <RoundedBox args={[0.44, 0.08, 0.46]} radius={0.03} smoothness={3} position={[0, -0.16, 0]} material={mats.interior} />
              <RoundedBox args={[0.44, 0.5, 0.1]} radius={0.04} smoothness={3} position={[0, 0.1, 0.22]} rotation={[-0.22, 0, 0]} material={mats.interior} />
              <RoundedBox args={[0.18, 0.16, 0.09]} radius={0.04} smoothness={3} position={[0, 0.42, 0.28]} material={mats.interior} />
            </group>
          ))}
          <RoundedBox args={[1.24, 0.1, 0.3]} radius={0.04} smoothness={3} position={[0, -0.06, -0.42]} material={mats.interior} />
          {/* steering wheel */}
          <group position={[-0.36, 0.08, -0.34]} rotation={[0.5, 0, 0]}>
            <mesh material={mats.interior}>
              <torusGeometry args={[0.15, 0.022, 8, 22]} />
            </mesh>
            <mesh material={mats.carbon} rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.03, 0.26, 0.02]} />
            </mesh>
          </group>
        </group>

        {/* ---------------- aero: splitter, skirts, diffuser ---------------- */}
        <RoundedBox args={[1.9, 0.045, 0.4]} radius={0.018} smoothness={3} position={[0, -RIDE + 0.13, -2.16]} rotation={[0.12, 0, 0]} material={mats.carbon} />
        <RoundedBox args={[1.74, 0.05, 0.16]} radius={0.02} smoothness={2} position={[0, -RIDE + 0.2, -2.36]} rotation={[0.5, 0, 0]} material={mats.carbon} />
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.09, 0.13, 1.7]} radius={0.03} smoothness={3} position={[s * 0.83, -RIDE + 0.2, 0.05]} material={mats.carbon} />
        ))}
        <RoundedBox args={[1.62, 0.2, 0.52]} radius={0.05} smoothness={3} position={[0, -RIDE + 0.17, 2.1]} material={mats.carbon} />
        {[-0.6, -0.3, 0, 0.3, 0.6].map((x) => (
          <mesh key={x} position={[x, -RIDE + 0.18, 2.22]} material={mats.dark}>
            <boxGeometry args={[0.028, 0.19, 0.34]} />
          </mesh>
        ))}

        {/* ---------------- underside (visible while inverted) ---------------- */}
        <mesh position={[0, -RIDE + 0.1, 0.1]} material={mats.dark}>
          <boxGeometry args={[1.62, 0.05, 3.9]} />
        </mesh>
        <mesh position={[0, -RIDE + 0.16, 0.15]} material={mats.carbon}>
          <boxGeometry args={[1.16, 0.09, 2.1]} />
        </mesh>
        {[-0.52, 0.52].map((x) => (
          <mesh key={x} position={[x, -RIDE + 0.05, 0.1]} material={mats.chrome}>
            <boxGeometry args={[0.06, 0.06, 2.6]} />
          </mesh>
        ))}
        <mesh position={[0, -RIDE + 0.03, 0.2]} material={mats.under}>
          <boxGeometry args={[1.0, 0.02, 2.4]} />
        </mesh>

        {/* ---------------- intakes & vents ---------------- */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * 0.82, -RIDE + 0.36, -0.92]} material={mats.dark}>
              <boxGeometry args={[0.1, 0.16, 0.6]} />
            </mesh>
            <mesh position={[s * 0.8, -RIDE + 0.4, 1.06]} rotation={[0, 0, s * 0.1]} material={mats.dark}>
              <boxGeometry args={[0.14, 0.22, 0.78]} />
            </mesh>
            <mesh position={[s * 0.34, -RIDE + 0.72, -1.5]} rotation={[0.1, 0, 0]} material={mats.dark}>
              <boxGeometry args={[0.3, 0.02, 0.34]} />
            </mesh>
          </group>
        ))}

        {/* ---------------- mirrors ---------------- */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.8, -RIDE + 0.86, -0.86]}>
            <mesh position={[s * 0.08, -0.03, 0.05]} rotation={[0, 0, s * 0.5]} material={mats.dark}>
              <boxGeometry args={[0.14, 0.03, 0.03]} />
            </mesh>
            <RoundedBox args={[0.09, 0.07, 0.2]} radius={0.03} smoothness={3} position={[s * 0.19, -0.02, 0.02]} rotation={[0, s * 0.25, 0]} material={mats.paint} />
            <mesh position={[s * 0.235, -0.02, 0.02]} rotation={[0, s * Math.PI * 0.5, 0]} material={mats.chrome}>
              <planeGeometry args={[0.16, 0.055]} />
            </mesh>
          </group>
        ))}

        {/* ---------------- lighting ---------------- */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.56, -RIDE + 0.52, -2.22]} rotation={[0.2, s * 0.16, 0]}>
            <mesh material={mats.head}>
              <boxGeometry args={[0.34, 0.055, 0.1]} />
            </mesh>
            <mesh position={[0, -0.055, 0.01]} material={mats.head}>
              <boxGeometry args={[0.24, 0.018, 0.08]} />
            </mesh>
            <mesh position={[0, 0, -0.05]} material={mats.dark}>
              <boxGeometry args={[0.4, 0.13, 0.06]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -RIDE + 0.42, 2.29]} material={mats.tail}>
          <boxGeometry args={[1.44, 0.05, 0.05]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.62, -RIDE + 0.55, 2.28]} material={mats.tail}>
            <boxGeometry args={[0.16, 0.05, 0.05]} />
          </mesh>
        ))}

        {/* ---------------- active rear wing ---------------- */}
        <group ref={wing} position={[0, -RIDE + 0.86, 1.98]}>
          <RoundedBox args={[1.34, 0.035, 0.3]} radius={0.015} smoothness={3} material={mats.carbon} castShadow={quality !== "LOW"} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.6, -0.03, 0.02]} material={mats.dark}>
              <boxGeometry args={[0.03, 0.14, 0.2]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.67, 0.02, 0]} rotation={[0, 0, s * 0.1]} material={mats.paintDark}>
              <boxGeometry args={[0.02, 0.09, 0.3]} />
            </mesh>
          ))}
        </group>

        {/* ---------------- wheel arches ---------------- */}
        {[
          [CAR.axleFrontZ, 1],
          [CAR.axleFrontZ, -1],
          [CAR.axleRearZ, 1],
          [CAR.axleRearZ, -1],
        ].map(([z, s], i) => (
          <group key={i} position={[CAR.track * (s as number), CAR.wheelCenterY, z as number]}>
            <mesh geometry={arch} material={mats.paint} position={[(s as number) * 0.02, 0, 0]} scale={[0.42, 1, 1]} />
            <mesh geometry={liner} material={mats.dark} rotation={[0, 0, Math.PI]} />
          </group>
        ))}
      </group>

      {/* ---------------- wheels ---------------- */}
      <Wheel axleZ={CAR.axleFrontZ} side={1} front spinRef={(e) => (wheelSpin.current[0] = e)} steerRef={(e) => (wheelSteer.current[0] = e)} materials={wheelMats} />
      <Wheel axleZ={CAR.axleFrontZ} side={-1} front spinRef={(e) => (wheelSpin.current[1] = e)} steerRef={(e) => (wheelSteer.current[1] = e)} materials={wheelMats} />
      <Wheel axleZ={CAR.axleRearZ} side={1} front={false} spinRef={(e) => (wheelSpin.current[2] = e)} materials={wheelMats} />
      <Wheel axleZ={CAR.axleRearZ} side={-1} front={false} spinRef={(e) => (wheelSpin.current[3] = e)} materials={wheelMats} />

      {/* ---------------- thruster plumes ---------------- */}
      {CAR.nozzles.map((n, i) => (
        <mesh
          key={i}
          ref={i === 0 ? flameL : flameR}
          position={[n.x, n.y, n.z + 0.5]}
          rotation={[Math.PI / 2, 0, 0]}
          visible={false}
        >
          <coneGeometry args={[0.16, 1.4, 14, 1, true]} />
          <meshBasicMaterial
            color="#ff8a3d"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      </group>
    </>
  );
}
