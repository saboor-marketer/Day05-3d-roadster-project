import { create } from "zustand";
import { sim } from "./engine";
import type { CameraMode, Quality, Telemetry } from "./types";

export const CAMERA_MODES: CameraMode[] = ["CHASE", "CINEMATIC", "SIDE", "COCKPIT", "FREE"];

const detectWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "stunt" | "warn";
}

interface AppState {
  screen: "hero" | "sim";
  ready: boolean;
  webgl: boolean;
  reducedMotion: boolean;
  isTouch: boolean;

  quality: Quality;
  muted: boolean;
  volume: number;
  paused: boolean;
  cameraMode: CameraMode;
  /** let the director pick angles while a stunt runs */
  autoCam: boolean;
  cameraShake: boolean;
  showSettings: boolean;
  showGuide: boolean;
  showTech: boolean;
  /** orbit-only vehicle inspection */
  inspect: boolean;
  fps: number;
  toast: Toast | null;
  telemetry: Telemetry;

  start: () => void;
  exitToHero: () => void;
  setReady: (v: boolean) => void;
  setQuality: (q: Quality) => void;
  cycleQuality: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setPaused: (v: boolean) => void;
  togglePaused: () => void;
  setCameraMode: (m: CameraMode) => void;
  cycleCamera: () => void;
  setAutoCam: (v: boolean) => void;
  setCameraShake: (v: boolean) => void;
  setSettings: (v: boolean) => void;
  setGuide: (v: boolean) => void;
  setTech: (v: boolean) => void;
  setInspect: (v: boolean) => void;
  setFps: (v: number) => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
  pushTelemetry: (t: Telemetry) => void;
  resetAll: () => void;
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useApp = create<AppState>((set, get) => ({
  screen: "hero",
  ready: false,
  webgl: typeof window === "undefined" ? true : detectWebGL(),
  reducedMotion: prefersReducedMotion(),
  isTouch:
    typeof window === "undefined"
      ? false
      : (window.matchMedia?.("(pointer: coarse)").matches ?? false) || window.innerWidth < 900,

  quality: "HIGH",
  muted: false,
  volume: 0.7,
  paused: false,
  cameraMode: "CHASE",
  autoCam: true,
  cameraShake: !prefersReducedMotion(),
  showSettings: false,
  showGuide: false,
  showTech: false,
  inspect: false,
  fps: 60,
  toast: null,
  telemetry: sim.telemetry(),

  start: () => set({ screen: "sim", showGuide: false }),
  exitToHero: () => {
    sim.reset(true);
    sim.paused = false;
    set({ screen: "hero", paused: false, showSettings: false, showTech: false, inspect: false, cameraMode: "CHASE" });
  },
  setReady: (v) => set({ ready: v }),
  setQuality: (q) => set({ quality: q }),
  cycleQuality: () => {
    const order: Quality[] = ["LOW", "MEDIUM", "HIGH"];
    const next = order[(order.indexOf(get().quality) + 1) % order.length];
    set({ quality: next });
    get().notify(`GRAPHICS · ${next}`);
  },
  toggleMute: () => {
    const muted = !get().muted;
    set({ muted });
    get().notify(muted ? "AUDIO MUTED" : "AUDIO ON", "info");
  },
  setVolume: (v) => set({ volume: v }),
  setPaused: (v) => set({ paused: v }),
  togglePaused: () => {
    const paused = !get().paused;
    sim.paused = paused;
    set({ paused });
    get().notify(paused ? "SIMULATION PAUSED" : "SIMULATION LIVE", "warn");
  },
  setCameraMode: (m) => {
    const inspect = m === "FREE";
    set({ cameraMode: m, inspect });
    get().notify(`CAMERA · ${m}`);
  },
  cycleCamera: () => {
    const i = CAMERA_MODES.indexOf(get().cameraMode);
    get().setCameraMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  },
  setAutoCam: (v) => set({ autoCam: v }),
  setCameraShake: (v) => set({ cameraShake: v }),
  setSettings: (v) => set({ showSettings: v }),
  setGuide: (v) => set({ showGuide: v }),
  setTech: (v) => set({ showTech: v }),
  setInspect: (v) => {
    set({ inspect: v, cameraMode: v ? "FREE" : "CHASE" });
    get().notify(v ? "INSPECTION MODE · ORBIT" : "INSPECTION OFF");
  },
  setFps: (v) => set({ fps: v }),
  notify: (text, tone = "info") => {
    toastId += 1;
    const id = toastId;
    set({ toast: { id, text, tone } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2200);
  },
  pushTelemetry: (t) => set({ telemetry: t }),
  resetAll: () => {
    sim.reset();
    set({ paused: false, cameraMode: "CHASE", inspect: false, showSettings: false, showTech: false, showGuide: false });
    sim.paused = false;
    get().notify("VEHICLE & SCENE RESET");
  },
}));
