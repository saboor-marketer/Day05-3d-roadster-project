# ROADSTER FLIGHT SIMULATOR

**An interactive 3D electric-hypercar driving & cinematic backflip stunt simulator that runs entirely in the browser.**

Drive a Roadster-inspired concept car down a night-time aerospace test runway, then launch a fully scripted
aerial sequence: takeoff → continuous 360° backward flip → inverted hover → righting → touchdown → recovery → driving.
Every run is deterministic and frame-for-frame replayable.

> ### ⚠️ Disclaimer
> The aerial manoeuvres are **cinematic game animation, not verified real-world physics**. A production Roadster
> cannot perform a controlled backward flip on a runway. The vehicle is a **Roadster-inspired concept** built from
> procedural geometry. This project is an independent technical demo and is **not affiliated with, endorsed by, or an
> official product of Tesla, Inc.**

---

## Quick start

```bash
npm install       # install dependencies
npm run dev       # start the Vite dev server (http://localhost:5173)
npm run build     # production build -> dist/index.html (single self-contained file)
npm run preview   # serve the production build locally
```

**No backend, no API keys, no login, no paid services.** No 3D models, HDR maps, textures or audio files are
downloaded at runtime — the car, the runway, the reflections and all sound effects are generated procedurally in the
browser. The only network request is the Google Fonts stylesheet, which degrades gracefully to system fonts offline.

### Verify the stunt logic without a browser

```bash
npx esbuild scripts/verify-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/verify.mjs
node /tmp/verify.mjs
```

This runs 52 headless assertions against the simulation core (acceleration curve, steering, the full state machine,
quaternion continuity, deterministic replay, reset, pause, slow-motion tempo and frame-spike resilience).
See [`REPORT.md`](./REPORT.md) for the full results.

---

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake, then reverse |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Shift` | Handbrake drift (smoke + sparks) |
| `Space` | **Perform backflip** |
| `E` | **Replay last stunt** |
| `C` | Cycle camera (Chase → Cinematic → Side → Cockpit → Free) |
| `I` | Toggle inspection orbit |
| `P` | Pause / resume |
| `R` | Reset vehicle & scene |
| `M` | Mute / unmute |
| `Q` | Cycle graphics quality |
| `Esc` | Close panels, else pause |

**Touch devices** get on-screen pads automatically (detected via `pointer: coarse`): steer left/right, brake,
drift, accelerate, plus dedicated **BACKFLIP**, **REPLAY** and **PAUSE** buttons.

Input never interferes with typing — `INPUT`, `TEXTAREA`, `SELECT` and `contenteditable` targets are ignored, and
arrow-key/space scrolling is only prevented while the simulator actually owns the screen.

**The stunt can be launched from a standstill.** Launch control auto-spools the car to 24 m/s so the choreography is
always spectacular, and the dedicated `PERFORM BACKFLIP` button is always available on the ground.

---

## The stunt sequence

A strictly monotonic timeline of six phases, **5.90 s** at 1.00× tempo (adjustable 0.45×–1.50× in Settings).

| # | Phase | Duration | Backward rotation | Altitude |
| --- | --- | --- | --- | --- |
| 1 | `TAKEOFF` | 0.85 s | 0° → 30° | 0 → 2.40 m |
| 2 | `BACKFLIP` | 1.50 s | 30° → 188° | 2.40 → 7.10 m |
| 3 | `INVERTED_FLIGHT` | 1.00 s | 188° → 199° | 7.10 → 7.55 m |
| 4 | `RIGHTING` | 0.95 s | 199° → 345° | 7.55 → 2.90 m |
| 5 | `LANDING` | 0.75 s | 345° → 360° | 2.90 → 0 m |
| 6 | `RECOVERY` | 0.85 s | hold 360° | 0 m |

Full state machine:
`IDLE → ACCELERATING → DRIVING → TAKEOFF → BACKFLIP → INVERTED_FLIGHT → RIGHTING → LANDING → RECOVERY → DRIVING`

### Why the rotation never snaps

Orientation is composed as **`q = qYaw · qFlip · qRoll`**. The flip angle accumulates monotonically from `0` to `2π`
about the vehicle's lateral axis — there is no angle wrapping, no Euler gimbal flip and no discontinuity through the
inverted phase. The pivot sits at the **centre of mass, 0.60 m above the runway**, which keeps the roof clear of the
tarmac at the 7.55 m apex. On completion the flip is unwound to exactly `0` (mathematically the same orientation), so
the next stunt starts from a clean transform.

### Why it can't get stuck

* Delta time is clamped to 40 ms, so a tab-switch spike can never teleport the timeline.
* Phase overflow **carries** into the next phase (`while (u >= 1)`), and the loop always terminates.
* Ground physics is fully suspended during the sequence, so no collision can interrupt the choreography.
* `RECOVERY` blends speed, yaw and the suspension spring back into the driving model and then unconditionally exits.
* `REPLAY` rewinds to the recorded launch transform (position, yaw, speed) before re-arming, so run *N* is identical to run 1.

---

## Camera system

| Mode | Behaviour |
| --- | --- |
| **CHASE** | Damped follow behind and above, FOV widens with speed |
| **CINEMATIC** | Cuts between low rear-quarter, side, front-low and aerial framing |
| **SIDE** | Locked lateral profile — the clearest view of the full 360° |
| **COCKPIT** | Inside the cabin, inherits the vehicle quaternion so the world spins through the flip |
| **FREE** | OrbitControls inspection rig that tracks the moving car |

When **Stunt Auto-Director** is on (default), the rig takes over during a stunt and picks per-phase angles that keep the
whole rotation readable — a clean side profile for the flip, a low upward angle for the inverted hover — then hands
control back to your chosen mode after touchdown. All motion is exponentially damped, ground-clamped (`y ≥ 0.85 m`,
except cockpit) and quaternion-slerped.

---

## Architecture

Simulation logic is completely separated from rendering and UI. The sim is a plain TypeScript class with **no React
and no Three.js scene dependency**, which is what makes it unit-testable in Node.

```
src/
├── App.tsx                     Screen router, keyboard wiring, audio unlock, tab-visibility pause
├── index.css                   Tailwind v4 theme tokens, HUD panel utilities, keyframes
│
├── sim/                        ── PURE LOGIC (no React) ──
│   ├── types.ts                SimPhase / StuntStatus / CameraMode / Telemetry + easing helpers
│   ├── VehicleSim.ts           Driving model + deterministic stunt state machine + telemetry
│   ├── engine.ts               Singleton sim instance shared by render loop, HUD and FX
│   ├── specs.ts                Shared vehicle hard-points (axles, contact patches, nozzles, cockpit)
│   ├── particles.ts            Ring-buffer CPU particle field (typed arrays, zero per-frame alloc)
│   ├── fx.ts                   EffectsManager — tyre smoke, sparks, thruster plumes, shake, flash
│   ├── audio.ts                WebAudio synthesis: motor, whine, wind, thruster, squeal, impact
│   ├── input.ts                Keyboard binding + press-and-hold helper for touch pads
│   └── store.ts                Zustand UI store (settings, camera, panels, ~18 Hz telemetry mirror)
│
├── three/                      ── RENDER LAYER ──
│   ├── SimulatorScene.tsx      Canvas, lighting rig, baked env, sim driver, adaptive DPR, post-FX
│   ├── RoadsterModel.tsx       Procedural hypercar: extruded profiles, 4 wheels, glass, interior, aero
│   ├── Environment3D.tsx       Sky shader, recycled runway, flood towers, hangars, radar, mountains
│   ├── CameraRig.tsx           5 camera modes + automatic stunt director + hero orbit
│   ├── ParticleLayer.tsx       GPU point sprites fed directly from the particle typed arrays
│   └── textures.ts             Canvas-generated carbon fibre, asphalt, glow, streak, shadow blob
│
└── ui/                         ── INTERFACE ──
    ├── Hero.tsx                Opening screen over the live 3D scene, animated phase preview
    ├── GameHUD.tsx             Speedometer, torque bar, altitude tape, phase stepper, stunt buttons
    ├── MobileControls.tsx      Touch pads with pointer-capture hold semantics
    ├── SettingsPanel.tsx       Graphics tier, audio, camera behaviour, stunt tempo, restart
    └── Panels.tsx              Toasts, pause overlay, controls guide, technical brief

scripts/
└── verify-sim.ts               52-assertion headless acceptance harness (runs in Node)
```

### Data flow

```
keyboard / touch ──▶ sim.input ──▶ VehicleSim.update(dt)
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
              drainEvents()       telemetry()         position / quaternion
                     │                  │                  │
                     ▼                  ▼                  ▼
              audio + fx.handleEvent   HUD (18 Hz)    RoadsterModel / CameraRig (60 Hz)
```

The render loop reads the mutable sim directly every frame (no React re-render), while the HUD subscribes to a
throttled telemetry snapshot at ~18 Hz. Gauges stay smooth via CSS transitions without thrashing React.

---

## The car

Built entirely from procedural geometry — no GLTF, no external assets.

* **Body** — a bevelled `ExtrudeGeometry` swept from a hand-authored 18-point side profile, giving a sculpted hood,
  cabin line, rear deck and ducktail.
* **Greenhouse** — a second extruded profile with an inner hole forms the A-pillars and roof rails; the inset volume
  is tinted `MeshPhysicalMaterial` glass. A separate roof panel and rear buttresses complete the silhouette.
* **Paint** — metallic candy red, `clearcoat: 1`, `clearcoatRoughness: 0.05`, with sheen and a baked lightformer
  environment for reflections.
* **Wheels** — four assemblies, each with tyre, tread shoulder, rim barrel, five aero spokes, chrome hub, emissive
  centre cap, brake disc and red caliper. Front wheels steer; all four spin at `speed / wheelRadius`.
* **Underside** — flat floor, carbon battery pack, chrome rails and an emissive undertray, so the car still reads
  correctly while inverted.
* **Details** — carbon splitter, skirts, finned diffuser, side intakes, hood vents, mirrors with reflective faces,
  LED headlight bars, full-width tail light bar (brightens under braking), active rear wing that deploys with speed.
* **Interior** — two seats with headrests, dashboard and a steering wheel, visible through the glass and from cockpit cam.

Suspension compression is applied to the chassis only, with the wheels tracking the ground at reduced amplitude, so
takeoff squat and landing compression read correctly.

---

## Performance & accessibility

* **Quality tiers** — `LOW` (no shadows/bloom/particles), `MEDIUM` (bloom + half FX), `HIGH` (2048² shadows, full FX, 2× DPR).
* **Adaptive resolution** — a `PerformanceGuard` samples FPS each 1.2 s and steps the device pixel ratio down below
  42 fps, back up above 58 fps, within the tier's range.
* **Endless runway, finite memory** — all world geometry lives in a 2 400 m buffer that recycles every 1 200 m.
  Peaks and structures are generated once per period and duplicated, so the seam is invisible.
* **Cheap shadows** — a single directional key light follows the car on a snapped grid; a soft contact blob plus an
  additive under-glow pool handle ground contact without extra shadow casters.
* **No expensive real-time reflections** — the environment map is baked once from lightformers (`frames={1}`).
* **Tab hidden → rendering stops** (`frameloop="never"`), and the sim's clamped `dt` prevents a jump on return.
* **`prefers-reduced-motion`** — camera shake defaults off and CSS ambient animations are disabled.
* **WebGL fallback** — capability is probed before mounting; if unavailable a clear, styled message is shown instead
  of a blank canvas.
* **Audio is gesture-gated** — the `AudioContext` is only created on the first pointer/key event. Nothing autoplays.

---

## Tech stack

| | |
| --- | --- |
| Framework | React 19 · TypeScript 5.9 (strict) |
| Build | Vite 7 · `vite-plugin-singlefile` |
| 3D | Three.js 0.180 · React Three Fiber 9 · Drei 10 |
| Post-FX | `@react-three/postprocessing` (Bloom, Vignette) |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Audio | Web Audio API (fully synthesised) |
| Physics | Custom kinematic stunt controller — chosen over Rapier so collisions can never interrupt the scripted aerial sequence |

Type is **Chakra Petch** (display) paired with **IBM Plex Sans** (body) and **IBM Plex Mono** (telemetry).

---

## License / attribution

Original code and procedural assets. "Tesla" and "Roadster" are trademarks of Tesla, Inc., referenced here only to
describe the design inspiration for this unofficial concept demo.
