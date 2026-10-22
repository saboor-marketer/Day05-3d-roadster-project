import * as THREE from "three";

const canvas2d = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};

export function makeCarbonTexture(size = 128): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(size, size);
  const cell = size / 8;
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const flip = (x + y) % 2 === 0;
      const g = ctx.createLinearGradient(
        x * cell,
        y * cell,
        flip ? x * cell + cell : x * cell,
        flip ? y * cell : y * cell + cell,
      );
      g.addColorStop(0, "#23252a");
      g.addColorStop(0.45, "#121316");
      g.addColorStop(0.55, "#1b1d22");
      g.addColorStop(1, "#08090b");
      ctx.fillStyle = g;
      ctx.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeAsphaltTexture(size = 256): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(size, size);
  ctx.fillStyle = "#121317";
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n + 2;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.lineWidth = Math.random() * 1.4;
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeGlowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)"): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeStreakTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(256, 16);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 16);
  const v = ctx.createLinearGradient(0, 0, 0, 16);
  v.addColorStop(0, "rgba(0,0,0,1)");
  v.addColorStop(0.5, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 256, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft blob used as a fake contact shadow / under-glow. */
export function makeBlobTexture(color = "rgba(0,0,0,0.85)"): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
