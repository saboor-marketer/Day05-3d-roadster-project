import { AlertTriangle, Keyboard, Play, Terminal, X } from "lucide-react";
import { STUNT_TIMELINE, STUNT_DURATION } from "../sim/VehicleSim";
import { useApp } from "../sim/store";
import { sim } from "../sim/engine";

/* --------------------------------------------------------------- toast */
export function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  const tone =
    toast.tone === "stunt"
      ? "border-flare/70 text-flare bg-flare/10"
      : toast.tone === "warn"
        ? "border-ember/70 text-ember bg-ember/10"
        : "border-white/20 text-bone bg-black/60";
  return (
    <div className="pointer-events-none absolute top-16 left-1/2 z-40 -translate-x-1/2 sm:top-20">
      <div
        key={toast.id}
        className={`anim-rise clip-notch border px-4 py-2 font-mono text-[10px] tracking-[0.24em] backdrop-blur-md ${tone}`}
      >
        {toast.text}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pause */
export function PauseOverlay() {
  const paused = useApp((s) => s.paused);
  const togglePaused = useApp((s) => s.togglePaused);
  const resetAll = useApp((s) => s.resetAll);
  if (!paused) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-void/70 backdrop-blur-[3px]">
      <div className="hud-panel clip-notch flex flex-col items-center gap-5 px-10 py-8 text-center">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 anim-flare rounded-full bg-ember" />
          <h2 className="font-display text-3xl font-bold tracking-[0.22em] text-bone">PAUSED</h2>
        </div>
        <p className="max-w-xs font-mono text-[10px] leading-relaxed tracking-[0.16em] text-ash">
          SIMULATION CLOCK HALTED · VEHICLE TRANSFORM FROZEN AT T+{sim.simTime.toFixed(2)}s
        </p>
        <div className="flex gap-2">
          <button
            onClick={togglePaused}
            className="clip-notch flex items-center gap-2 bg-flare px-6 py-3 font-display text-xs font-bold tracking-[0.18em] text-white transition hover:scale-[1.03] active:scale-95"
          >
            <Play size={15} /> RESUME
          </button>
          <button
            onClick={resetAll}
            className="clip-notch border border-line px-5 py-3 font-display text-xs font-semibold tracking-[0.18em] text-ash transition hover:border-flare/60 hover:text-bone"
          >
            RESET
          </button>
        </div>
        <span className="font-mono text-[9px] tracking-[0.2em] text-ash/60">PRESS P TO RESUME</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- shell */
function Modal({
  title,
  kicker,
  icon,
  onClose,
  children,
  wide,
}: {
  title: string;
  kicker: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-void/78 p-3 backdrop-blur-[3px] sm:p-6">
      <div
        className={`hud-panel clip-notch anim-rise flex max-h-[88vh] w-full flex-col ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
          <span className="text-flare">{icon}</span>
          <div className="flex-1">
            <p className="font-mono text-[9px] tracking-[0.26em] text-ash">{kicker}</p>
            <h2 className="font-display text-base font-bold tracking-[0.14em] text-bone">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center border border-line text-ash transition hover:border-flare hover:text-flare"
          >
            <X size={15} />
          </button>
        </header>
        <div className="slim-scroll overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ controls guide */
const KEYS: [string, string][] = [
  ["W / ↑", "Accelerate"],
  ["S / ↓", "Brake & reverse"],
  ["A / ←", "Steer left"],
  ["D / →", "Steer right"],
  ["SHIFT", "Handbrake drift"],
  ["SPACE", "Perform backflip"],
  ["E", "Replay last stunt"],
  ["C", "Cycle camera"],
  ["I", "Inspection orbit"],
  ["P", "Pause / resume"],
  ["R", "Reset vehicle & scene"],
  ["M", "Mute audio"],
  ["Q", "Cycle graphics quality"],
  ["ESC", "Close panels"],
];

export function ControlsGuide() {
  const show = useApp((s) => s.showGuide);
  const setShow = useApp((s) => s.setGuide);
  const isTouch = useApp((s) => s.isTouch);
  if (!show) return null;
  return (
    <Modal
      title="CONTROL GUIDE"
      kicker="INPUT MAP · DESKTOP + TOUCH"
      icon={<Keyboard size={16} />}
      onClose={() => setShow(false)}
    >
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {KEYS.map(([k, v]) => (
          <div key={k} className="group flex items-center gap-3 border-b border-white/6 py-1.5">
            <kbd className="min-w-[4.6rem] border border-line bg-black/50 px-2 py-1 text-center font-mono text-[10px] tracking-[0.1em] text-bone transition group-hover:border-flare/60 group-hover:text-flare">
              {k}
            </kbd>
            <span className="font-body text-xs text-ash">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 border border-white/8 bg-black/30 p-3">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ember" />
        <p className="font-mono text-[10px] leading-relaxed tracking-[0.1em] text-ash">
          {isTouch
            ? "TOUCH RIG ACTIVE — hold the on-screen pads to steer and drive. Tap BACKFLIP at any speed: launch control will spool the car up to stunt velocity automatically."
            : "Arrow keys and space are captured only while the simulator is on screen, so typing in any field never triggers the car. The stunt can be launched from a standstill — the rig auto-boosts to 24 m/s."}
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------- technical brief */
export function TechBrief() {
  const show = useApp((s) => s.showTech);
  const setShow = useApp((s) => s.setTech);
  if (!show) return null;
  return (
    <Modal
      wide
      title="TECHNICAL BRIEF"
      kicker="HOW THE RIG WORKS"
      icon={<Terminal size={16} />}
      onClose={() => setShow(false)}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-display text-sm font-bold tracking-[0.18em] text-flare">SIMULATED ANIMATION</h3>
          <p className="font-body text-xs leading-relaxed text-ash">
            The aerial manoeuvres in this simulator are <span className="text-bone">cinematic game animation</span>, not
            verified real-world physics. A production Roadster cannot perform a controlled backward flip on a runway. The
            vehicle is a <span className="text-bone">Roadster-inspired concept</span> built entirely from procedural
            geometry; this project is an independent technical demo and is not an official Tesla product.
          </p>
          <h3 className="pt-2 font-display text-sm font-bold tracking-[0.18em] text-flare">DETERMINISTIC SEQUENCE</h3>
          <p className="font-body text-xs leading-relaxed text-ash">
            The stunt is a monotonic timeline of {STUNT_TIMELINE.length} phases totalling{" "}
            <span className="font-mono text-bone">{STUNT_DURATION.toFixed(2)}s</span> at 1.00× tempo. Delta-time is
            clamped to 40 ms, overflow carries into the next phase, and the timeline always terminates — the vehicle
            cannot wedge between states. Replaying rewinds to the recorded launch transform, so every run is identical.
          </p>
          <table className="w-full border-collapse font-mono text-[10px]">
            <thead>
              <tr className="border-b border-white/12 text-left tracking-[0.16em] text-ash">
                <th className="py-1.5 font-medium">PHASE</th>
                <th className="py-1.5 font-medium">DUR</th>
                <th className="py-1.5 font-medium">ROTATION</th>
              </tr>
            </thead>
            <tbody>
              {STUNT_TIMELINE.map((p, i) => (
                <tr key={p.phase} className="border-b border-white/6 text-bone">
                  <td className="py-1.5 tracking-[0.12em]">{p.phase.replace("_", " ")}</td>
                  <td className="py-1.5 text-ash">{p.duration.toFixed(2)}s</td>
                  <td className="py-1.5 text-ash">
                    {["0 → 30°", "30 → 188°", "188 → 199°", "199 → 345°", "345 → 360°", "hold 360°"][i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-3">
          <h3 className="font-display text-sm font-bold tracking-[0.18em] text-flare">ROTATION MODEL</h3>
          <p className="font-body text-xs leading-relaxed text-ash">
            Orientation is composed as{" "}
            <span className="font-mono text-bone">q = qYaw · qFlip · qRoll</span>. The flip angle accumulates from 0 to
            2π about the vehicle's lateral axis, so there is no angle wrapping, no gimbal snap and no discontinuity
            through the inverted phase. The pivot sits at the centre of mass (0.60 m above the runway), which keeps the
            roof clear of the tarmac at the 7.55 m apex.
          </p>
          <h3 className="pt-2 font-display text-sm font-bold tracking-[0.18em] text-flare">GROUND MODEL</h3>
          <p className="font-body text-xs leading-relaxed text-ash">
            Normal driving uses a kinematic arcade model: a tapered torque curve (16.4 m/s² peak), quadratic aero drag,
            speed-sensitive steering authority, soft runway boundaries and a damped suspension spring with road noise.
            During the scripted sequence ground physics is suspended entirely so collisions can never interrupt the
            aerial choreography; the landing blends speed, yaw and suspension back into the driving model.
          </p>
          <h3 className="pt-2 font-display text-sm font-bold tracking-[0.18em] text-flare">RENDER + PERFORMANCE</h3>
          <ul className="space-y-1.5 font-body text-xs text-ash">
            {[
              "React 19 · TypeScript · Vite · React Three Fiber 9 · Drei",
              "Procedural car: extruded side profiles, bevelled aero, 5-spoke wheels",
              "Baked lightformer environment for paint reflections (no HDR download)",
              "CPU particle fields for tyre smoke, sparks and thruster exhaust",
              "World geometry recycles every 1 200 m for an endless runway",
              "Adaptive pixel ratio, quality tiers, tab-hidden render pause",
              "WebAudio synthesis only — motor, wind, thruster, squeal, impact",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 bg-flare" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
