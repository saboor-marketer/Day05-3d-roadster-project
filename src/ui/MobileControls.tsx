import { useCallback } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Zap, Flame, Anchor } from "lucide-react";
import { sim } from "../sim/engine";
import { audio } from "../sim/audio";
import { useApp } from "../sim/store";

type HoldProps = {
  onDown: () => void;
  onUp: () => void;
};

function HoldButton({
  children,
  label,
  className = "",
  onDown,
  onUp,
}: HoldProps & { children: React.ReactNode; label: string; className?: string }) {
  const release = useCallback(() => onUp(), [onUp]);
  return (
    <button
      aria-label={label}
      className={`pointer-events-auto no-select flex flex-col items-center justify-center gap-0.5 border border-white/10 bg-carbon/80 font-mono text-[9px] tracking-[0.16em] text-ash backdrop-blur-md transition-all duration-100 active:scale-95 active:border-flare active:bg-flare/20 active:text-bone ${className}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function MobileControls() {
  const isTouch = useApp((s) => s.isTouch);
  const paused = useApp((s) => s.paused);
  const togglePaused = useApp((s) => s.togglePaused);
  const notify = useApp((s) => s.notify);
  const inStunt = useApp((s) => s.telemetry.inStunt);

  const stunt = useCallback(() => {
    audio.uiClick();
    if (sim.inStunt) return;
    if (sim.triggerStunt()) notify("BACKFLIP SEQUENCE ARMED", "stunt");
  }, [notify]);

  const replay = useCallback(() => {
    audio.uiClick();
    if (sim.inStunt) return;
    sim.replayStunt();
    notify("REPLAYING LAST STUNT", "stunt");
  }, [notify]);

  if (!isTouch) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2 pb-2">
      <div className="flex items-end justify-between gap-2">
        {/* steering */}
        <div className="flex gap-2">
          <HoldButton
            label="Steer left"
            className="h-[4.6rem] w-[4.6rem] rounded-l-2xl"
            onDown={() => (sim.input.left = true)}
            onUp={() => (sim.input.left = false)}
          >
            <ChevronLeft size={26} className="text-bone" />
            <span>LEFT</span>
          </HoldButton>
          <HoldButton
            label="Steer right"
            className="h-[4.6rem] w-[4.6rem] rounded-r-2xl"
            onDown={() => (sim.input.right = true)}
            onUp={() => (sim.input.right = false)}
          >
            <ChevronRight size={26} className="text-bone" />
            <span>RIGHT</span>
          </HoldButton>
        </div>

        {/* stunt cluster */}
        <div className="flex flex-col items-center gap-2 pb-1">
          <button
            onClick={stunt}
            disabled={inStunt}
            className="clip-notch pointer-events-auto flex items-center gap-2 bg-flare px-5 py-3 font-display text-[12px] font-bold tracking-[0.16em] text-white shadow-[0_0_28px_-6px_rgba(255,47,69,0.9)] transition active:scale-95 disabled:opacity-50"
            style={{ touchAction: "none" }}
          >
            <Zap size={15} />
            BACKFLIP
          </button>
          <div className="flex gap-2">
            <button
              onClick={replay}
              disabled={inStunt}
              className="pointer-events-auto flex items-center gap-1 border border-line bg-carbon/80 px-3 py-2 font-mono text-[9px] tracking-[0.14em] text-ash backdrop-blur active:scale-95 active:text-bone disabled:opacity-40"
              style={{ touchAction: "none" }}
            >
              <RotateCcw size={12} /> REPLAY
            </button>
            <button
              onClick={togglePaused}
              className="pointer-events-auto flex items-center gap-1 border border-line bg-carbon/80 px-3 py-2 font-mono text-[9px] tracking-[0.14em] text-ash backdrop-blur active:scale-95 active:text-bone"
              style={{ touchAction: "none" }}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? "RESUME" : "PAUSE"}
            </button>
          </div>
        </div>

        {/* pedals */}
        <div className="flex gap-2">
          <HoldButton
            label="Drift brake"
            className="h-[4.6rem] w-[3.2rem]"
            onDown={() => (sim.input.handbrake = true)}
            onUp={() => (sim.input.handbrake = false)}
          >
            <Anchor size={20} className="text-ember" />
            <span>DRIFT</span>
          </HoldButton>
          <HoldButton
            label="Brake / reverse"
            className="h-[4.6rem] w-[4rem]"
            onDown={() => (sim.input.brake = true)}
            onUp={() => (sim.input.brake = false)}
          >
            <span className="font-display text-lg leading-none text-bone">−</span>
            <span>BRAKE</span>
          </HoldButton>
          <HoldButton
            label="Accelerate"
            className="h-[4.6rem] w-[4.6rem] rounded-r-2xl border-flare/40 bg-flare/12"
            onDown={() => (sim.input.throttle = true)}
            onUp={() => (sim.input.throttle = false)}
          >
            <Flame size={22} className="text-flare" />
            <span className="text-bone">DRIVE</span>
          </HoldButton>
        </div>
      </div>
    </div>
  );
}
