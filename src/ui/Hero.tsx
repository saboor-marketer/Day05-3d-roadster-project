import { useEffect, useState } from "react";
import { ArrowRight, Gauge, Orbit, Terminal, Volume2, VolumeX } from "lucide-react";
import { useApp } from "../sim/store";
import { sim } from "../sim/engine";

const SPECS: [string, string][] = [
  ["0—100 KM/H", "1.9 s"],
  ["TOP SPEED", "302 km/h"],
  ["STUNT ARC", "7.55 m"],
  ["ROTATION", "360° backward"],
  ["DRIVETRAIN", "tri-motor awd"],
  ["SURFACE", "dry asphalt · night"],
];

const PHASES = ["IDLE", "ACCEL", "TAKEOFF", "FLIP", "INVERT", "RIGHT", "LAND", "DRIVE"];

export default function Hero() {
  const start = useApp((s) => s.start);
  const setInspect = useApp((s) => s.setInspect);
  const setTech = useApp((s) => s.setTech);
  const muted = useApp((s) => s.muted);
  const toggleMute = useApp((s) => s.toggleMute);
  const fps = useApp((s) => s.fps);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeq((s) => (s + 1) % (PHASES.length + 2)), 620);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between overflow-hidden font-body text-bone">
      {/* ambient overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,rgba(0,0,0,0.15),rgba(4,4,7,0.86)_70%)]" />
      <div className="absolute inset-0 scan opacity-40" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-void via-void/80 to-transparent" />

      {/* ------------------------------------------------ top status bar */}
      <header className="pointer-events-auto relative flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-void/45 px-4 py-2 font-mono text-[10px] tracking-[0.22em] text-ash backdrop-blur-sm sm:px-7 sm:text-[11px]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 anim-flare rounded-full bg-flare" />
          <span className="text-bone">ROADSTER FLIGHT SIMULATOR</span>
          <span className="hidden sm:inline">/ BUILD 2.4.1</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden md:inline">NIGHT OPS · RUNWAY 09 · 1 200 M LOOP</span>
          <span className={fps > 50 ? "text-signal" : fps > 30 ? "text-ember" : "text-flare"}>{fps} FPS</span>
          <button
            onClick={toggleMute}
            className="flex items-center gap-1.5 border border-line px-2 py-1 text-ash transition hover:border-flare hover:text-bone"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <span className="hidden sm:inline">{muted ? "MUTED" : "AUDIO"}</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------ main editorial */}
      <div className="relative grid flex-1 items-end gap-8 px-4 pb-4 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:pb-0">
        <div className="max-w-2xl">
          <p className="anim-rise mb-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-flare sm:text-[11px]">
            <span className="h-px w-8 bg-flare" />
            CINEMATIC STUNT RIG · CONCEPT VEHICLE
          </p>
          <h1 className="font-display text-[13vw] leading-[0.82] font-bold tracking-[-0.02em] sm:text-[9vw] lg:text-[7.4vw]">
            <span className="anim-rise block text-bone" style={{ animationDelay: "60ms" }}>
              ZERO TO
            </span>
            <span
              className="anim-rise block text-transparent"
              style={{
                animationDelay: "140ms",
                WebkitTextStroke: "1.5px #ff2f45",
                textShadow: "0 0 42px rgba(255,47,69,0.35)",
              }}
            >
              INVERTED
            </span>
            <span className="anim-rise block text-bone" style={{ animationDelay: "220ms" }}>
              IN 3.3<span className="text-flare">.</span>3 SECONDS
            </span>
          </h1>

          <p
            className="anim-rise mt-5 max-w-xl text-sm leading-relaxed text-ash sm:text-base"
            style={{ animationDelay: "300ms" }}
          >
            A Roadster-inspired electric hypercar on a closed aerospace runway. Drive it, then launch a fully
            scripted backward flip — takeoff, 360° rotation, inverted hover, righting, touchdown and recovery.
            Every frame is deterministic and replayable.
          </p>

          <div className="anim-rise pointer-events-auto mt-7 flex flex-wrap items-center gap-3" style={{ animationDelay: "380ms" }}>
            <button
              onClick={start}
              className="group clip-notch relative flex items-center gap-3 overflow-hidden bg-flare px-7 py-4 font-display text-sm font-bold tracking-[0.16em] text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="absolute inset-0 -translate-x-full bg-white/25 transition-transform duration-500 group-hover:translate-x-0" />
              <Gauge size={18} className="relative" />
              <span className="relative">START EXPERIENCE</span>
              <ArrowRight size={18} className="relative transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => {
                start();
                setInspect(true);
              }}
              className="clip-notch flex items-center gap-2 border border-line bg-panel/70 px-5 py-4 font-display text-sm font-semibold tracking-[0.14em] text-bone backdrop-blur transition hover:border-flare/70 hover:bg-panel-2"
            >
              <Orbit size={16} className="text-flare" />
              INSPECT VEHICLE
            </button>
            <button
              onClick={() => setTech(true)}
              className="flex items-center gap-2 px-2 py-4 font-mono text-[11px] tracking-[0.2em] text-ash transition hover:text-bone"
            >
              <Terminal size={14} />
              TECHNICAL BRIEF
            </button>
          </div>

          {/* animated phase preview */}
          <div className="anim-rise mt-8 flex flex-wrap items-center gap-1.5 font-mono text-[9px] tracking-[0.18em]" style={{ animationDelay: "460ms" }}>
            {PHASES.map((p, i) => {
              const active = i === seq;
              const done = i < seq;
              return (
                <span
                  key={p}
                  className={`border px-2 py-1 transition-all duration-300 ${
                    active
                      ? "border-flare bg-flare/15 text-bone shadow-[0_0_18px_-4px_rgba(255,47,69,0.8)]"
                      : done
                        ? "border-white/12 bg-white/5 text-ash"
                        : "border-white/8 text-ash/50"
                  }`}
                >
                  {p}
                </span>
              );
            })}
          </div>
        </div>

        {/* spec sheet */}
        <aside
          className="anim-rise pointer-events-auto hidden w-[19rem] border border-white/8 bg-carbon/70 p-5 backdrop-blur-md lg:block"
          style={{ animationDelay: "520ms" }}
        >
          <div className="mb-4 flex items-baseline justify-between border-b border-white/10 pb-3">
            <h2 className="font-display text-sm font-bold tracking-[0.2em] text-bone">SPEC SHEET</h2>
            <span className="font-mono text-[9px] tracking-[0.2em] text-flare">CONCEPT</span>
          </div>
          <dl className="space-y-2.5">
            {SPECS.map(([k, v]) => (
              <div key={k} className="group flex items-baseline gap-2">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-ash">{k}</dt>
                <span className="h-px flex-1 translate-y-[-2px] bg-white/10 transition-colors group-hover:bg-flare/40" />
                <dd className="font-display text-sm font-semibold text-bone transition-colors group-hover:text-flare">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-ash/70">
            AERIAL MANOEUVRES ARE GAME ANIMATION, NOT VERIFIED VEHICLE PHYSICS. THIS PROJECT IS AN INDEPENDENT
            TRIBUTE AND IS NOT AFFILIATED WITH, OR ENDORSED BY, TESLA, INC.
          </p>
        </aside>
      </div>

      {/* ------------------------------------------------ bottom ticker */}
      <footer className="pointer-events-auto relative flex items-center gap-4 border-t border-white/8 bg-void/60 px-4 py-2.5 backdrop-blur-sm sm:px-7">
        <span className="clip-tag shrink-0 bg-flare px-3 py-1 font-display text-[10px] font-bold tracking-[0.2em] text-white">
          LIVE RIG
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="anim-ticker flex w-max gap-8 font-mono text-[10px] tracking-[0.2em] text-ash">
            {Array.from({ length: 2 }).map((_, dup) => (
              <span key={dup} className="flex gap-8">
                <span>KINEMATIC STUNT CONTROLLER · QUATERNION INTERPOLATION</span>
                <span className="text-flare">SPACE / BUTTON → BACKFLIP</span>
                <span>W A S D DRIVE · C CAMERA · P PAUSE · R RESET · M AUDIO</span>
                <span className="text-signal">PROCEDURAL GEOMETRY · NO EXTERNAL ASSETS</span>
                <span>WORLD RECYCLES EVERY 1 200 M</span>
              </span>
            ))}
          </div>
        </div>
        <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.2em] text-ash/70 sm:inline">
          SIM CLOCK {sim.simTime.toFixed(1).padStart(5, "0")}s
        </span>
      </footer>
    </div>
  );
}
