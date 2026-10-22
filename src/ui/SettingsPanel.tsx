import { useEffect } from "react";
import { Activity, Camera, Home, RotateCcw, Settings2, SlidersHorizontal, Volume2, X } from "lucide-react";
import { audio } from "../sim/audio";
import { fx } from "../sim/fx";
import { sim } from "../sim/engine";
import { useApp, CAMERA_MODES } from "../sim/store";
import type { Quality } from "../sim/types";

const QUALITIES: { id: Quality; label: string; note: string }[] = [
  { id: "LOW", label: "LOW", note: "no bloom · no shadows · thin FX" },
  { id: "MEDIUM", label: "MEDIUM", note: "bloom + vignette · half FX" },
  { id: "HIGH", label: "HIGH", note: "shadows · full FX · 2× dpr" },
];

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border border-white/8 bg-black/30 px-3 py-2.5 transition hover:border-white/20"
    >
      <span className="font-mono text-[10px] tracking-[0.16em] text-ash">{label}</span>
      <span
        className={`relative h-4 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-flare" : "bg-white/12"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all duration-200 ${
            on ? "left-[1.4rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/8 pb-4">
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[11px] font-bold tracking-[0.22em] text-bone">
        <span className="text-flare">{icon}</span>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function SettingsPanel() {
  const open = useApp((s) => s.showSettings);
  const setOpen = useApp((s) => s.setSettings);
  const quality = useApp((s) => s.quality);
  const setQuality = useApp((s) => s.setQuality);
  const muted = useApp((s) => s.muted);
  const toggleMute = useApp((s) => s.toggleMute);
  const volume = useApp((s) => s.volume);
  const setVolume = useApp((s) => s.setVolume);
  const cameraMode = useApp((s) => s.cameraMode);
  const setCameraMode = useApp((s) => s.setCameraMode);
  const autoCam = useApp((s) => s.autoCam);
  const setAutoCam = useApp((s) => s.setAutoCam);
  const cameraShake = useApp((s) => s.cameraShake);
  const setCameraShake = useApp((s) => s.setCameraShake);
  const resetAll = useApp((s) => s.resetAll);
  const exitToHero = useApp((s) => s.exitToHero);
  const notify = useApp((s) => s.notify);
  const fps = useApp((s) => s.fps);
  const reducedMotion = useApp((s) => s.reducedMotion);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setVolume(volume);
  }, [volume]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex justify-end bg-void/60 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <aside
        className="slim-scroll hud-panel anim-rise flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-white/10 px-5 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3">
          <Settings2 size={16} className="text-flare" />
          <div className="flex-1">
            <p className="font-mono text-[9px] tracking-[0.26em] text-ash">RIG CONFIGURATION</p>
            <h2 className="font-display text-base font-bold tracking-[0.14em] text-bone">SETTINGS</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center border border-line text-ash transition hover:border-flare hover:text-flare"
          >
            <X size={15} />
          </button>
        </header>

        <Section title="GRAPHICS" icon={<Activity size={13} />}>
          <div className="grid grid-cols-3 gap-1.5">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  setQuality(q.id);
                  notify(`GRAPHICS · ${q.id}`);
                }}
                className={`clip-notch border px-2 py-2 font-display text-[11px] font-bold tracking-[0.14em] transition ${
                  quality === q.id
                    ? "border-flare bg-flare/15 text-flare"
                    : "border-line bg-black/30 text-ash hover:border-white/25 hover:text-bone"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-ash/70">
            {QUALITIES.find((q) => q.id === quality)?.note.toUpperCase()} · CHANGING TIER REBUILDS THE RENDERER.
          </p>
          <div className="flex items-center justify-between border border-white/8 bg-black/30 px-3 py-2 font-mono text-[10px] tracking-[0.14em]">
            <span className="text-ash">FRAME RATE</span>
            <span className={fps > 50 ? "text-signal" : fps > 30 ? "text-ember" : "text-flare"}>{fps} FPS</span>
          </div>
          <div className="flex items-center justify-between border border-white/8 bg-black/30 px-3 py-2 font-mono text-[10px] tracking-[0.14em]">
            <span className="text-ash">LIVE PARTICLES</span>
            <span className="text-bone">{fx.smoke.alive + fx.fire.alive}</span>
          </div>
        </Section>

        <Section title="AUDIO" icon={<Volume2 size={13} />}>
          <Toggle on={!muted} onClick={toggleMute} label={muted ? "SOUND OFF" : "SOUND ON"} />
          <div className="border border-white/8 bg-black/30 px-3 py-2.5">
            <div className="mb-2 flex justify-between font-mono text-[10px] tracking-[0.16em] text-ash">
              <span>MASTER VOLUME</span>
              <span className="text-bone">{Math.round(volume * 100)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full accent-[#ff2f45]"
              aria-label="Master volume"
            />
          </div>
          <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-ash/70">
            SYNTHESISED IN-BROWSER · STARTS SILENT UNTIL YOU INTERACT.
          </p>
        </Section>

        <Section title="CAMERA BEHAVIOUR" icon={<Camera size={13} />}>
          <div className="grid grid-cols-5 gap-1">
            {CAMERA_MODES.map((m) => (
              <button
                key={m}
                onClick={() => setCameraMode(m)}
                className={`border px-1 py-2 font-mono text-[8px] tracking-[0.1em] transition ${
                  cameraMode === m ? "border-flare bg-flare/15 text-flare" : "border-line bg-black/30 text-ash hover:text-bone"
                }`}
              >
                {m.slice(0, 4)}
              </button>
            ))}
          </div>
          <Toggle on={autoCam} onClick={() => setAutoCam(!autoCam)} label="STUNT AUTO-DIRECTOR" />
          <Toggle on={cameraShake} onClick={() => setCameraShake(!cameraShake)} label="CAMERA SHAKE" />
        </Section>

        <Section title="SIMULATION" icon={<SlidersHorizontal size={13} />}>
          <div className="border border-white/8 bg-black/30 px-3 py-2.5">
            <div className="mb-2 flex justify-between font-mono text-[10px] tracking-[0.16em] text-ash">
              <span>STUNT TEMPO</span>
              <span className="text-bone">{sim.stuntSpeed.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.45}
              max={1.5}
              step={0.05}
              defaultValue={sim.stuntSpeed}
              onChange={(e) => {
                sim.stuntSpeed = parseFloat(e.target.value);
                notify(`STUNT TEMPO ${sim.stuntSpeed.toFixed(2)}×`);
              }}
              className="w-full accent-[#ff2f45]"
              aria-label="Stunt tempo"
            />
          </div>
          <button
            onClick={resetAll}
            className="flex w-full items-center justify-center gap-2 border border-line bg-black/30 px-3 py-2.5 font-display text-[11px] font-semibold tracking-[0.16em] text-bone transition hover:border-flare/60 hover:text-flare"
          >
            <RotateCcw size={13} /> RESET VEHICLE &amp; SCENE
          </button>
          <button
            onClick={() => {
              setOpen(false);
              exitToHero();
            }}
            className="flex w-full items-center justify-center gap-2 border border-flare/50 bg-flare/10 px-3 py-2.5 font-display text-[11px] font-semibold tracking-[0.16em] text-flare transition hover:bg-flare hover:text-white"
          >
            <Home size={13} /> RESTART EXPERIENCE
          </button>
        </Section>

        <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-ash/60">
          {reducedMotion
            ? "REDUCED-MOTION PREFERENCE DETECTED — SHAKE AND AMBIENT ANIMATION ARE SUPPRESSED BY DEFAULT."
            : "RESPECTS prefers-reduced-motion. RENDERING PAUSES WHEN THE TAB IS HIDDEN."}
        </p>
      </aside>
    </div>
  );
}
