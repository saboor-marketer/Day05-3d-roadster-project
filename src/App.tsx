import { useEffect, useState } from "react";
import { AlertTriangle, Cpu, Loader2 } from "lucide-react";
import SimulatorScene from "./three/SimulatorScene";
import { sim } from "./sim/engine";
import { audio } from "./sim/audio";
import { attachKeyboard } from "./sim/input";
import { useApp } from "./sim/store";
import Hero from "./ui/Hero";
import GameHUD from "./ui/GameHUD";
import MobileControls from "./ui/MobileControls";
import SettingsPanel from "./ui/SettingsPanel";
import { ControlsGuide, PauseOverlay, TechBrief, Toast } from "./ui/Panels";

function BootScreen() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-void">
      <div className="flex w-full max-w-md flex-col gap-4 px-8">
        <div className="flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-flare" />
          <span className="font-display text-sm font-bold tracking-[0.24em] text-bone">SPOOLING RENDER RIG</span>
        </div>
        <div className="h-1 w-full overflow-hidden bg-white/10">
          <div className="anim-sweep h-full w-1/3 bg-flare" />
        </div>
        <div className="space-y-1 font-mono text-[10px] tracking-[0.16em] text-ash">
          <p>› BUILDING PROCEDURAL ROADSTER GEOMETRY</p>
          <p>› BAKING LIGHTFORMER ENVIRONMENT</p>
          <p>› ARMING KINEMATIC STUNT CONTROLLER</p>
        </div>
      </div>
    </div>
  );
}

function NoWebGL() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-void p-6">
      <div className="hud-panel clip-notch max-w-lg p-7">
        <div className="mb-3 flex items-center gap-2 text-ember">
          <AlertTriangle size={17} />
          <span className="font-mono text-[10px] tracking-[0.24em]">RENDERER UNAVAILABLE</span>
        </div>
        <h1 className="mb-3 font-display text-2xl font-bold tracking-[0.06em] text-bone">
          WebGL could not be started in this browser.
        </h1>
        <p className="font-body text-sm leading-relaxed text-ash">
          The Roadster Flight Simulator needs hardware-accelerated WebGL to render the 3D runway, the vehicle and the
          stunt sequence. Enable hardware acceleration or open the page in a recent desktop or mobile browser, then
          reload.
        </p>
        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 font-mono text-[10px] tracking-[0.16em] text-ash/70">
          <Cpu size={13} className="text-flare" />
          NO ASSETS WERE LEFT BROKEN — THIS IS THE GRACEFUL FALLBACK PATH.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useApp((s) => s.screen);
  const webgl = useApp((s) => s.webgl);
  const ready = useApp((s) => s.ready);
  const setReady = useApp((s) => s.setReady);
  const quality = useApp((s) => s.quality);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  /* ---------------------------------------------------------- input */
  useEffect(() => {
    const g = () => useApp.getState();
    return attachKeyboard(sim, {
      onStunt: () => {
        audio.uiClick();
        if (sim.inStunt) return;
        if (sim.triggerStunt()) g().notify("BACKFLIP SEQUENCE ARMED", "stunt");
      },
      onReplay: () => {
        if (sim.inStunt) return;
        sim.replayStunt();
        g().notify("REPLAYING LAST STUNT", "stunt");
      },
      onReset: () => g().resetAll(),
      onCamera: () => g().cycleCamera(),
      onPause: () => g().togglePaused(),
      onMute: () => g().toggleMute(),
      onInspect: () => g().setInspect(!g().inspect),
      onQuality: () => g().cycleQuality(),
      onEscape: () => {
        const s = g();
        if (s.showSettings || s.showGuide || s.showTech) {
          s.setSettings(false);
          s.setGuide(false);
          s.setTech(false);
        } else if (s.screen === "sim") {
          s.togglePaused();
        }
      },
      active: () => {
        const s = g();
        return s.screen === "sim" && !s.showSettings && !s.showGuide && !s.showTech;
      },
    });
  }, []);

  /* --------------------------------------------- audio unlock (gesture) */
  useEffect(() => {
    const unlock = () => {
      void audio.init();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* -------------------------------------------------- tab visibility */
  useEffect(() => {
    const onVis = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!webgl) return <NoWebGL />;

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <SimulatorScene quality={quality} frameloop={frameloop} onReady={() => setReady(true)} />

      {screen === "hero" ? (
        <Hero />
      ) : (
        <>
          <GameHUD />
          <MobileControls />
        </>
      )}

      <Toast />
      {screen === "sim" && <PauseOverlay />}
      <ControlsGuide />
      <TechBrief />
      <SettingsPanel />

      {/* film grain over everything */}
      <div className="grain pointer-events-none absolute inset-0 z-[45] opacity-40 mix-blend-overlay" />

      {!ready && <BootScreen />}
    </div>
  );
}
