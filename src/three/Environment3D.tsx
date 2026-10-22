import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { sim, } from "../sim/engine";
import { WORLD_PERIOD, worldOffsetFor } from "../sim/VehicleSim";
import { makeAsphaltTexture } from "./textures";
import type { Quality } from "../sim/types";

const SPAN = WORLD_PERIOD * 2; // 2400 m of world, recycled every 1200 m
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

function dashTexture() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 8, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.42, "rgba(255,255,255,0.95)");
  g.addColorStop(0.58, "rgba(255,255,255,0.95)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(2, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ sky */
function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color("#05060a") },
          uMid: { value: new THREE.Color("#0d1018") },
          uHorizon: { value: new THREE.Color("#2a1218") },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main(){
            vWorld = (modelMatrix * vec4(position,1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform float uTime;
          varying vec3 vWorld;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
          void main(){
            vec3 d = normalize(vWorld);
            float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
            vec3 col = mix(uHorizon, uMid, smoothstep(0.47,0.62,h));
            col = mix(col, uTop, smoothstep(0.6,0.95,h));
            // faint aurora band high up
            float band = smoothstep(0.72,0.9,h) * (1.0-smoothstep(0.9,1.0,h));
            col += vec3(0.05,0.09,0.11) * band * (0.6+0.4*sin(uTime*0.25 + d.x*3.0));
            // sparse stars
            vec2 g = floor(d.xz*260.0 + d.y*180.0);
            float s = hash(g);
            col += vec3(0.85,0.9,1.0) * step(0.9975, s) * smoothstep(0.55,0.9,h) * 0.9;
            gl_FragColor = vec4(col,1.0);
          }`,
      }),
    [],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[4200, 32, 20]} />
    </mesh>
  );
}

/* ------------------------------------------------------------- runway */
function Runway({ quality }: { quality: Quality }) {
  const group = useRef<THREE.Group>(null);
  const dashes = useRef<THREE.InstancedMesh>(null);
  const lightsL = useRef<THREE.InstancedMesh>(null);
  const lightsR = useRef<THREE.InstancedMesh>(null);
  const chevrons = useRef<THREE.InstancedMesh>(null);
  const streakL = useRef<THREE.Mesh>(null);
  const streakR = useRef<THREE.Mesh>(null);

  const asphalt = useMemo(() => {
    const t = makeAsphaltTexture();
    t.repeat.set(4, SPAN / 14);
    return t;
  }, []);
  const streakTex = useMemo(() => {
    const t = dashTexture();
    t.repeat.set(1, SPAN / 26);
    return t;
  }, []);

  useEffect(() => () => [asphalt, streakTex].forEach((t) => t.dispose()), [asphalt, streakTex]);

  const counts = useMemo(() => {
    const dashCount = Math.round(SPAN / 14);
    const lightCount = Math.round(SPAN / 26);
    const chevCount = Math.round(SPAN / 200) * 3;
    return { dashCount, lightCount, chevCount };
  }, []);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    for (let i = 0; i < counts.dashCount; i++) {
      d.position.set(0, 0.014, -SPAN / 2 + i * 14 + 7);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      dashes.current?.setMatrixAt(i, d.matrix);
    }
    if (dashes.current) dashes.current.instanceMatrix.needsUpdate = true;

    const half = Math.round(counts.lightCount / 2);
    for (let i = 0; i < counts.lightCount; i++) {
      const side = i < half ? -1 : 1;
      const idx = i % half;
      d.position.set(side * 10.8, 0.13, -SPAN / 2 + idx * 26 + 13);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      (side < 0 ? lightsL : lightsR)?.current?.setMatrixAt(idx, d.matrix);
    }
    if (lightsL.current) lightsL.current.instanceMatrix.needsUpdate = true;
    if (lightsR.current) lightsR.current.instanceMatrix.needsUpdate = true;

    const chevSets = Math.round(SPAN / 200);
    for (let s = 0; s < chevSets; s++) {
      for (let k = 0; k < 3; k++) {
        const i = s * 3 + k;
        const z = -SPAN / 2 + s * 200 + 60;
        d.position.set((k - 1) * 2.6, 0.015, z - Math.abs(k - 1) * 2.2);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        chevrons.current?.setMatrixAt(i, d.matrix);
      }
    }
    if (chevrons.current) chevrons.current.instanceMatrix.needsUpdate = true;
  }, [counts]);

  useFrame((_, dt) => {
    if (group.current) group.current.position.z = worldOffsetFor(sim.position.z);
    const v = Math.abs(sim.speed);
    const scroll = (v * dt) / 26;
    [streakL, streakR].forEach((r) => {
      const m = r.current;
      if (!m) return;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map!.offset.y += scroll;
      mat.opacity = THREE.MathUtils.clamp(v / 60, 0, 0.55);
      m.visible = mat.opacity > 0.02;
    });
  });

  return (
    <group ref={group}>
      {/* ground plane beyond the runway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow={quality !== "LOW"}>
        <planeGeometry args={[900, SPAN + 400]} />
        <meshStandardMaterial color="#08090c" roughness={1} metalness={0} />
      </mesh>

      {/* asphalt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={quality !== "LOW"}>
        <planeGeometry args={[21.6, SPAN]} />
        <meshStandardMaterial map={asphalt} color="#2b2d33" roughness={0.82} metalness={0.14} />
      </mesh>
      {/* shoulders */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 12.4, -0.02, 0]}>
          <planeGeometry args={[3.4, SPAN]} />
          <meshStandardMaterial color="#15171c" roughness={0.95} />
        </mesh>
      ))}

      {/* painted edges */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 10.1, 0.013, 0]}>
          <planeGeometry args={[0.28, SPAN]} />
          <meshStandardMaterial color="#c9ccd2" roughness={0.6} emissive="#20242c" emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* centre dashes */}
      <instancedMesh ref={dashes} args={[undefined, undefined, counts.dashCount]} frustumCulled={false}>
        <planeGeometry args={[0.3, 5.4]} />
        <meshStandardMaterial color="#dfe2e8" roughness={0.55} emissive="#2a2f38" emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </instancedMesh>

      {/* chevrons */}
      <instancedMesh ref={chevrons} args={[undefined, undefined, counts.chevCount]} frustumCulled={false}>
        <planeGeometry args={[1.9, 0.3]} />
        <meshStandardMaterial color="#c3c7ce" roughness={0.6} emissive="#252a33" emissiveIntensity={0.4} side={THREE.DoubleSide} />
      </instancedMesh>

      {/* edge lights: red port / white starboard */}
      <instancedMesh ref={lightsL} args={[undefined, undefined, Math.round(counts.lightCount / 2)]} frustumCulled={false}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color="#3a0509" emissive="#ff2f45" emissiveIntensity={3.2} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={lightsR} args={[undefined, undefined, Math.round(counts.lightCount / 2)]} frustumCulled={false}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color="#2a2d33" emissive="#ffe6c9" emissiveIntensity={2.6} roughness={0.4} />
      </instancedMesh>

      {/* speed streaks */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          ref={s < 0 ? streakL : streakR}
          position={[s * 10.62, 0.09, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <planeGeometry args={[0.34, SPAN]} />
          <meshBasicMaterial
            map={streakTex}
            color={s < 0 ? "#ff5a6a" : "#cfe4ff"}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ scenery */
function Scenery({ quality }: { quality: Quality }) {
  const group = useRef<THREE.Group>(null);
  const mountains = useRef<THREE.InstancedMesh>(null);

  // peaks are generated once per world period and duplicated, so the
  // 1200 m recycle is perfectly seamless
  const PEAKS = 22;
  const MOUNT_COUNT = PEAKS * 2;

  useLayoutEffect(() => {
    const r = rng(9137);
    const d = new THREE.Object3D();
    const spec: number[][] = [];
    for (let i = 0; i < PEAKS; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = (i / PEAKS) * WORLD_PERIOD + r() * 40;
      const dist = 300 + r() * 620;
      const h = 90 + r() * 280;
      const rad = 90 + r() * 150;
      spec.push([side * dist, h / 2 - 10, z, 0, r() * Math.PI, (r() - 0.5) * 0.12, rad, h, rad * (0.8 + r() * 0.5)]);
    }
    let idx = 0;
    for (let k = 0; k < 2; k++) {
      for (const s of spec) {
        d.position.set(s[0], s[1], s[2] - k * WORLD_PERIOD);
        d.rotation.set(s[3], s[4], s[5]);
        d.scale.set(s[6], s[7], s[8]);
        d.updateMatrix();
        mountains.current?.setMatrixAt(idx++, d.matrix);
      }
    }
    if (mountains.current) mountains.current.instanceMatrix.needsUpdate = true;
  }, []);

  const beaconMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a0509",
        emissive: new THREE.Color("#ff2f45"),
        emissiveIntensity: 1.4,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => beaconMat.dispose(), [beaconMat]);

  useFrame(() => {
    if (group.current) group.current.position.z = worldOffsetFor(sim.position.z);
    // synchronised aviation beacons across the whole facility
    beaconMat.emissiveIntensity = Math.sin(sim.simTime * 2.4) > 0.72 ? 4.6 : 0.3;
  });

  const towers = useMemo(() => {
    const out: { x: number; z: number; h: number; kind: number }[] = [];
    for (let p = 0; p < 2; p++) {
      const base = -SPAN / 2 + p * WORLD_PERIOD;
      out.push({ x: -34, z: base + 120, h: 26, kind: 0 });
      out.push({ x: 34, z: base + 420, h: 30, kind: 1 });
      out.push({ x: -40, z: base + 760, h: 24, kind: 0 });
      out.push({ x: 42, z: base + 1020, h: 28, kind: 1 });
    }
    return out;
  }, []);

  const hangars = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    for (let p = 0; p < 2; p++) {
      const base = -SPAN / 2 + p * WORLD_PERIOD;
      out.push({ x: -78, z: base + 240, w: 46, d: 70, h: 16 });
      out.push({ x: 82, z: base + 620, w: 54, d: 84, h: 20 });
      out.push({ x: -92, z: base + 940, w: 38, d: 52, h: 13 });
    }
    return out;
  }, []);

  return (
    <group ref={group}>
      <instancedMesh ref={mountains} args={[undefined, undefined, MOUNT_COUNT]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 5, 1]} />
        <meshStandardMaterial color="#0b0d12" roughness={1} metalness={0} flatShading />
      </instancedMesh>

      {/* flood-light towers */}
      {towers.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.h / 2, 0]}>
            <cylinderGeometry args={[0.42, 0.9, t.h, 6]} />
            <meshStandardMaterial color="#1a1d23" roughness={0.75} metalness={0.6} />
          </mesh>
          <mesh position={[0, t.h + 0.9, 0]} rotation={[0, t.x > 0 ? -Math.PI / 2.4 : Math.PI / 2.4, 0.35]}>
            <boxGeometry args={[5.4, 1.5, 0.4]} />
            <meshStandardMaterial color="#0e1014" roughness={0.6} metalness={0.7} />
          </mesh>
          <mesh position={[0, t.h + 0.86, 0]} rotation={[0, t.x > 0 ? -Math.PI / 2.4 : Math.PI / 2.4, 0.35]}>
            <planeGeometry args={[5, 1.1]} />
            <meshStandardMaterial color="#fff3dd" emissive="#fff0d6" emissiveIntensity={quality === "LOW" ? 1.4 : 2.6} toneMapped={false} />
          </mesh>
          <mesh position={[0, t.h + 2.2, 0]} material={beaconMat}>
            <sphereGeometry args={[0.34, 8, 8]} />
          </mesh>
        </group>
      ))}

      {/* hangars + aerospace facility blocks */}
      {hangars.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]}>
          <mesh position={[0, h.h / 2, 0]}>
            <boxGeometry args={[h.w, h.h, h.d]} />
            <meshStandardMaterial color="#101218" roughness={0.85} metalness={0.35} />
          </mesh>
          <mesh position={[0, h.h + 1.4, 0]}>
            <boxGeometry args={[h.w * 1.02, 2.6, h.d * 0.9]} />
            <meshStandardMaterial color="#0b0d11" roughness={0.9} metalness={0.3} />
          </mesh>
          {/* lit window band */}
          <mesh position={[h.x > 0 ? -h.w / 2 - 0.05 : h.w / 2 + 0.05, h.h * 0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[h.d * 0.8, 1.1]} />
            <meshStandardMaterial color="#1b2a33" emissive="#58e0c8" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
          <mesh position={[0, h.h + 3.4, 0]}>
            <cylinderGeometry args={[0.18, 0.24, 3.4, 5]} />
            <meshStandardMaterial color="#171a20" roughness={0.7} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* overhead distance gantries */}
      {[-1, 1].map((k) => (
        <group key={k} position={[0, 0, k * (WORLD_PERIOD / 2)]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 13.5, 5.4, 0]}>
              <boxGeometry args={[0.5, 11, 0.5]} />
              <meshStandardMaterial color="#15181e" roughness={0.7} metalness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 10.8, 0]}>
            <boxGeometry args={[27.6, 0.55, 0.6]} />
            <meshStandardMaterial color="#15181e" roughness={0.7} metalness={0.6} />
          </mesh>
          <mesh position={[0, 10.3, 0.32]}>
            <planeGeometry args={[26.6, 0.16]} />
            <meshStandardMaterial color="#2a0509" emissive="#ff2f45" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* radar dish */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 120, 0, s * 340]}>
          <mesh position={[0, 9, 0]}>
            <cylinderGeometry args={[0.6, 1.4, 18, 6]} />
            <meshStandardMaterial color="#12151a" roughness={0.8} metalness={0.5} />
          </mesh>
          <mesh position={[0, 19, 0]} rotation={[0.5, s > 0 ? 0.7 : -0.7, 0]}>
            <sphereGeometry args={[6.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.36]} />
            <meshStandardMaterial color="#191d24" roughness={0.55} metalness={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Environment3D({ quality }: { quality: Quality }) {
  return (
    <>
      <Sky />
      <Runway quality={quality} />
      <Scenery quality={quality} />
    </>
  );
}
