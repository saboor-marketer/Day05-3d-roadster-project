import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { fx } from "../sim/fx";
import type { ParticleField } from "../sim/particles";

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale * (340.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uHeat;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    if (vLife <= 0.001) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.01, d);
    float fade = smoothstep(0.0, 0.18, vLife) * pow(vLife, 0.55);
    vec3 col = vColor * (1.0 + uHeat * vLife * 2.2);
    gl_FragColor = vec4(col, a * fade * uOpacity);
  }
`;

function Field({
  field,
  additive,
  opacity,
  heat,
  renderOrder,
}: {
  field: ParticleField;
  additive: boolean;
  opacity: number;
  heat: number;
  renderOrder: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(field.colors, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(field.sizes, 1));
    g.setAttribute("aLife", new THREE.BufferAttribute(field.life, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
    return g;
  }, [field]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: { value: 1 },
          uOpacity: { value: opacity },
          uHeat: { value: heat },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [additive, opacity, heat],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ viewport }) => {
    const a = geometry.attributes;
    a.position.needsUpdate = true;
    (a.aColor as THREE.BufferAttribute).needsUpdate = true;
    (a.aSize as THREE.BufferAttribute).needsUpdate = true;
    (a.aLife as THREE.BufferAttribute).needsUpdate = true;
    material.uniforms.uScale.value = THREE.MathUtils.clamp(viewport.height / 8, 0.6, 2.4);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={renderOrder} />;
}

export default function ParticleLayer({ quality }: { quality: "LOW" | "MEDIUM" | "HIGH" }) {
  if (quality === "LOW") return null;
  return (
    <>
      <Field field={fx.smoke} additive={false} opacity={quality === "HIGH" ? 0.5 : 0.42} heat={0.15} renderOrder={6} />
      <Field field={fx.fire} additive opacity={0.95} heat={1.5} renderOrder={7} />
    </>
  );
}
