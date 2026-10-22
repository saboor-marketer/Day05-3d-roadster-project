import { memo } from "react";
import {
  Camera,
  Crosshair,
  Keyboard,
  Maximize2,
  Pause,
  Play,
  Power,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { sim } from "../sim/engine";
import { audio } from "../sim/audio";
import { useApp, CAMERA_MODES } from "../sim/store";
import type { Telemetry } from "../sim/types";

const STEPS: { key: string; label: string; phases: string[] }[] = [
  { key: "idle", label: "IDLE", phases: ["IDLE"] },
  { key: "accel", label: "ACCEL", phases: ["ACCELERATING"] },
  { key: "drive", label: "DRIVE", phases: ["DRIVING"] },
  { key: "takeoff", label: "TAKEOFF", phases: ["TAKEOFF"] },
  { key: "flip", label: "BACKFLIP", phases: ["BACKFLIP"] },
  { key: "invert", label: "INVERTED", phases: ["INVERTED_FLIGHT"] },
  { key: "right", label: "RIGHTING", phases: ["RIGHTING"] },
  { key: "land", label: "LANDING", phases: ["LANDING", "RECOVERY"] },
];

const statusTone = (s: Telemetry["status"]) =>
  s === "COMPLETE"
    ? "text-signal border-signal/50 bg-signal/10"
    : s === "READY"
      ? "text-ash border-line bg-white/5"
      : "text-flare border-flare/60 bg-flare/12";

/* ------------------------------------------------------------- gauges */
function Speedometer({ t }: { t: Telemetry }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const ARC = C * 0.75;
  const frac = Math.min(t.speedKmh / 320, 1);
  const ticks = Array.from({ length: 25 }, (_, i) => i);
  const needleAngle = 135 + frac * 270;

  return (
    <div className="relative h-[9.5rem] w-[9.5rem]">
      <svg viewBox="0 0 140 140" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="spdArc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e8e9ec" />
            <stop offset="55%" stopColor="#ff8a3d" />
            <stop offset="100%" stopColor="#ff2f45" />
          </linearGradient>
        </defs>
        <circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="7"
          strokeDasharray={`${ARC} ${C}`}
          strokeLinecap="butt"
          transform="rotate(135 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke="url(#spdArc)"
          strokeWidth="7"
          strokeDasharray={`${Math.max(frac * ARC, 0.01)} ${C}`}
          strokeLinecap="butt"
          transform="rotate(135 70 70)"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,47,69,0.55))", transition: "stroke-dasharray 90ms linear" }}
        />
        {ticks.map((i) => {
          const a = ((135 + (i / 24) * 270) * Math.PI) / 180;
          const major = i % 4 === 0;
          const r1 = major ? 42 : 45;
          const r2 = 48;
          const lit = i / 24 <= frac;
          return (
            <line
              key={i}
              x1={70 + Math.cos(a) * r1}
              y1={70 + Math.sin(a) * r1}
              x2={70 + Math.cos(a) * r2}
              y2={70 + Math.sin(a) * r2}
              stroke={lit ? (major ? "#ff2f45" : "rgba(255,255,255,0.75)") : "rgba(255,255,255,0.16)"}
              strokeWidth={major ? 1.8 : 1}
            />
          );
        })}
        <g transform={`rotate(${needleAngle} 70 70)`} style={{ transition: "transform 90ms linear" }}>
          <line x1="70" y1="70" x2="70" y2="26" stroke="#ff2f45" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="70" cy="70" r="3.4" fill="#ff2f45" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-6">
        <span className="font-mono text-[2.1rem] leading-none font-semibold text-bone tabular-nums">
          {Math.round(t.speedKmh)}
        </span>
        <span className="mt-1 font-mono text-[9px] tracking-[0.28em] text-ash">KM/H</span>
      </div>
    </div>
  );
}

function RpmBar({ t }: { t: Telemetry }) {
  const segs = 28;
  const lit = t.rpm * segs;
  return (
    <div className="w-[9.5rem]">
      <div className="mb-1 flex items-center justify-between font-mono text-[9px] tracking-[0.2em] text-ash">
        <span>TORQUE</span>
        <span className={t.rpm > 0.92 ? "text-flare" : ""}>{Math.round(t.rpm * 100)}%</span>
      </div>
      <div className="flex h-3 gap-[2px]">
        {Array.from({ length: segs }, (_, i) => {
          const on = i < lit;
          const hot = i > segs - 6;
          const mid = i > segs - 12;
          return (
            <span
              key={i}
              className="flex-1 transition-all duration-75"
              style={{
                background: on ? (hot ? "#ff2f45" : mid ? "#ff8a3d" : "#e8e9ec") : "rgba(255,255,255,0.09)",
                boxShadow: on && hot ? "0 0 8px rgba(255,47,69,0.8)" : undefined,
                transform: on && t.rpm > 0.9 ? "scaleY(1.25)" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function AltitudeTape({ t }: { t: Telemetry }) {
  const frac = Math.min(t.altitude / 9, 1);
  return (
    <div className="flex items-stretch gap-2">
      <div className="relative h-24 w-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-flare-deep to-flare"
          style={{ height: `${frac * 100}%`, transition: "height 80ms linear" }}
        />
        <div className="absolute inset-0 flex flex-col justify-between py-1">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="h-px w-full bg-black/40" />
          ))}
        </div>
      </div>
      <div className="flex flex-col justify-between font-mono text-[9px] tracking-[0.16em] text-ash">
        <span className="text-bone">ALT</span>
        <span className={`text-base font-semibold tabular-nums ${t.airborne ? "text-flare" : "text-bone"}`}>
          {t.altitude.toFixed(2)}
        </span>
        <span>M AGL</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- chips */
function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border border-white/8 bg-black/35 px-2.5 py-1.5">
      <span className="font-mono text-[8px] tracking-[0.22em] text-ash">{label}</span>
      <span className={`font-display text-[13px] font-semibold leading-none ${tone ?? "text-bone"}`}>{value}</span>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`pointer-events-auto flex h-9 w-9 items-center justify-center border transition-all duration-200 active:scale-90 ${
        active
          ? "border-flare/70 bg-flare/15 text-flare"
          : danger
            ? "border-line bg-black/40 text-ash hover:border-flare/60 hover:text-flare"
            : "border-line bg-black/40 text-ash hover:border-white/30 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- HUD */
function GameHUDInner() {
  const t = useApp((s) => s.telemetry);
  const paused = useApp((s) => s.paused);
  const muted = useApp((s) => s.muted);
  const cameraMode = useApp((s) => s.cameraMode);
  const isTouch = useApp((s) => s.isTouch);
  const notify = useApp((s) => s.notify);
  const togglePaused = useApp((s) => s.togglePaused);
  const toggleMute = useApp((s) => s.toggleMute);
  const cycleCamera = useApp((s) => s.cycleCamera);
  const setCameraMode = useApp((s) => s.setCameraMode);
  const resetAll = useApp((s) => s.resetAll);
  const setSettings = useApp((s) => s.setSettings);
  const setGuide = useApp((s) => s.setGuide);
  const exitToHero = useApp((s) => s.exitToHero);

  const doStunt = () => {
    audio.uiClick();
    if (paused) return notify("RESUME THE SIMULATION FIRST", "warn");
    if (sim.inStunt) return notify("STUNT IN PROGRESS", "warn");
    if (sim.triggerStunt()) notify("BACKFLIP SEQUENCE ARMED", "stunt");
  };
  const doReplay = () => {
    audio.uiClick();
    if (sim.inStunt) return;
    sim.replayStunt();
    notify("REPLAYING LAST STUNT", "stunt");
  };

  const activeStep = STEPS.findIndex((s) => s.phases.includes(t.phase));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-body text-bone select-none">
      {/* -------------------------------------------------- top left */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 sm:top-4 sm:left-5">
        <div className="hud-panel clip-notch pointer-events-auto flex items-center gap-3 px-3 py-2">
          <span className={`clip-tag border px-2.5 py-1 font-display text-[11px] font-bold tracking-[0.18em] ${statusTone(t.status)}`}>
            {t.status}
          </span>
          <div className="flex flex-col">
            <span className="font-mono text-[9px] tracking-[0.2em] text-ash">PHASE · {t.phase.replace("_", " ")}</span>
            <span className="font-mono text-[10px] tracking-[0.14em] text-bone">
              STUNT T+{t.stuntTime.toFixed(2)}s
              {t.lastStuntDuration > 0 && <span className="text-ash"> · LAST {t.lastStuntDuration.toFixed(2)}s</span>}
            </span>
          </div>
          <div className="hidden h-8 w-px bg-white/10 sm:block" />
          <div className="hidden w-40 sm:block">
            <div className="mb-1 flex justify-between font-mono text-[8px] tracking-[0.2em] text-ash">
              <span>SEQUENCE</span>
              <span>{Math.round(t.stuntProgress * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-white/8">
              <div
                className="h-full bg-flare transition-[width] duration-100 ease-linear"
                style={{ width: `${t.inStunt ? t.stuntProgress * 100 : t.status === "COMPLETE" ? 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* phase stepper */}
        <div className="hud-panel hidden items-center gap-1 px-3 py-2 lg:flex">
          {STEPS.map((s, i) => {
            const state = i === activeStep ? "active" : i < activeStep ? "done" : "todo";
            return (
              <div key={s.key} className="flex items-center gap-1">
                <span
                  className={`px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] transition-all duration-300 ${
                    state === "active"
                      ? "bg-flare text-white shadow-[0_0_16px_-2px_rgba(255,47,69,0.9)]"
                      : state === "done"
                        ? "bg-white/10 text-ash"
                        : "text-ash/40"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-2 bg-white/15" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------- top right */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 sm:top-4 sm:right-5">
        <div className="hud-panel flex items-center gap-2 px-3 py-2">
          <Camera size={14} className="text-flare" />
          <span className="font-mono text-[9px] tracking-[0.2em] text-ash">CAM</span>
          <span className="font-display text-[12px] font-bold tracking-[0.14em] text-bone">{cameraMode}</span>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <div className="pointer-events-auto flex gap-1">
            {CAMERA_MODES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  audio.uiClick();
                  setCameraMode(m);
                }}
                className={`px-1.5 py-1 font-mono text-[8px] tracking-[0.12em] transition ${
                  m === cameraMode ? "bg-flare text-white" : "bg-white/6 text-ash hover:bg-white/12 hover:text-bone"
                }`}
              >
                {m.slice(0, 4)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5">
          <IconButton label={paused ? "Resume (P)" : "Pause (P)"} onClick={togglePaused} active={paused}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
          <IconButton label="Reset (R)" onClick={resetAll} danger>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label={muted ? "Unmute (M)" : "Mute (M)"} onClick={toggleMute} active={!muted}>
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </IconButton>
          <IconButton label="Controls (G)" onClick={() => setGuide(true)}>
            <Keyboard size={15} />
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettings(true)}>
            <Settings2 size={15} />
          </IconButton>
          <IconButton label="Exit to title" onClick={exitToHero} danger>
            <Power size={15} />
          </IconButton>
        </div>
      </div>

      {/* ------------------------------------------------ bottom left */}
      <div
        className={`absolute left-3 flex items-end gap-3 sm:left-5 ${
          isTouch ? "bottom-[8.6rem]" : "bottom-3 sm:bottom-5"
        }`}
      >
        <div className="hud-panel clip-notch flex flex-col items-center gap-2 p-3">
          <Speedometer t={t} />
          <RpmBar t={t} />
          <div className="flex w-full items-center justify-between gap-2 pt-1">
            <span className="font-display text-lg leading-none font-bold text-bone">{t.gear}</span>
            <span className={`font-mono text-[9px] tracking-[0.2em] ${t.driveMode === "STUNT" ? "text-flare" : "text-ash"}`}>
              {t.driveMode}
            </span>
            <span className={`font-mono text-[9px] tracking-[0.2em] ${t.airborne ? "text-flare" : "text-ash"}`}>
              {t.airborne ? "AIRBORNE" : "GROUND"}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ bottom right */}
      <div className="absolute right-3 bottom-3 hidden flex-col items-end gap-2 sm:right-5 sm:bottom-5 md:flex">
        <div className="hud-panel clip-notch flex items-center gap-4 p-3">
          <AltitudeTape t={t} />
          <div className="h-24 w-px bg-white/10" />
          <div className="grid grid-cols-2 gap-1.5">
            <Chip label="G-FORCE" value={`${t.gForce.toFixed(2)}g`} tone={t.gForce > 2 ? "text-flare" : "text-bone"} />
            <Chip label="ROTATION" value={`${Math.round(t.flipDegrees)}°`} tone={t.inverted ? "text-flare" : "text-bone"} />
            <Chip label="DISTANCE" value={`${(t.distance / 1000).toFixed(2)}km`} />
            <Chip label="STUNTS" value={`${t.stuntCount}`} />
          </div>
        </div>
        {t.inverted && (
          <div className="anim-rise flex items-center gap-2 border border-flare/60 bg-flare/15 px-3 py-1.5 font-display text-[11px] font-bold tracking-[0.22em] text-flare">
            <Crosshair size={13} /> INVERTED · ROOF DOWN
          </div>
        )}
      </div>

      {/* --------------------------------------------- centre actions */}
      <div
        className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 ${
          isTouch ? "bottom-[6.5rem]" : "bottom-4"
        }`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={doStunt}
            disabled={t.inStunt}
            className={`clip-notch group relative flex items-center gap-2.5 overflow-hidden px-6 py-3.5 font-display text-[13px] font-bold tracking-[0.18em] transition-all duration-200 ${
              t.inStunt
                ? "cursor-not-allowed border border-flare/40 bg-flare/10 text-flare/70"
                : "bg-flare text-white hover:scale-[1.03] active:scale-95"
            }`}
          >
            {!t.inStunt && <span className="absolute inset-0 -translate-x-full bg-white/25 transition-transform duration-500 group-hover:translate-x-0" />}
            <SlidersHorizontal size={16} className="relative" />
            <span className="relative">{t.inStunt ? `STUNT RUNNING ${Math.round(t.stuntProgress * 100)}%` : "PERFORM BACKFLIP"}</span>
            <kbd className="relative hidden border border-white/30 px-1 font-mono text-[9px] sm:inline">SPACE</kbd>
          </button>
          <button
            onClick={doReplay}
            disabled={t.inStunt}
            className="clip-notch flex items-center gap-2 border border-line bg-panel/80 px-4 py-3.5 font-display text-[12px] font-semibold tracking-[0.16em] text-bone backdrop-blur transition hover:border-flare/70 hover:bg-panel-2 disabled:opacity-40"
          >
            <RotateCcw size={15} className="text-flare" />
            REPLAY STUNT
            <kbd className="hidden border border-white/15 px-1 font-mono text-[9px] text-ash sm:inline">E</kbd>
          </button>
          <button
            onClick={cycleCamera}
            className="clip-notch flex items-center gap-2 border border-line bg-panel/80 px-4 py-3.5 font-display text-[12px] font-semibold tracking-[0.16em] text-bone backdrop-blur transition hover:border-white/40"
          >
            <Maximize2 size={15} className="text-ash" />
            CAMERA
          </button>
        </div>
      </div>
    </div>
  );
}

export const GameHUD = memo(GameHUDInner);
export default GameHUD;
