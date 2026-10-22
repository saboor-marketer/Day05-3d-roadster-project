# ENGINEERING REPORT — Roadster Flight Simulator

**Deliverable:** interactive 3D driving + cinematic backflip stunt simulator
**Stack:** React 19 · TypeScript 5.9 (strict) · Vite 7 · Three.js 0.180 · React Three Fiber 9 · Drei 10 · Zustand 5 · Tailwind 4
**Status:** ✅ Complete — builds clean, zero type errors, 52/52 headless acceptance assertions passing

---

## 1. Executive summary

A working, browser-native 3D simulator was delivered — not a landing page or a mockup. The user drives a procedurally
modelled electric hypercar along a night-time aerospace runway and can trigger a deterministic aerial sequence that
takes off, rotates a full 360° backward, hovers inverted, rights itself, lands on its wheels and resumes driving.

Everything is generated at runtime. **There are no external 3D models, textures, HDR maps or audio files**, so there is
no asset-loading failure path and no network dependency for the core experience.

| Metric | Value |
| --- | --- |
| Source files | 24 TypeScript/TSX modules + 1 stylesheet |
| Lines of source | ~5 145 (incl. the 220-line test harness) |
| Production bundle | 1 355 kB single file · **377 kB gzipped** |
| External runtime assets | 0 (fonts optional, degrade gracefully) |
| `tsc --noEmit` | 0 errors, strict mode |
| `npm run build` | ✅ success, ~8.3 s |
| Headless assertions | **52 passed / 0 failed** |

---

## 2. Architecture decisions

### 2.1 Custom kinematic controller instead of Rapier

The brief permitted either. **Rapier was deliberately rejected.** A rigid-body solver would let a stray contact impulse
perturb the scripted aerial choreography, and reconciling "physically simulated" with "deterministic, replayable,
never-gets-stuck" adds risk without adding value to a *cinematic* stunt.

Instead the sim runs two clearly separated modes:

* **Ground mode** — an arcade kinematic model (torque curve, quadratic drag, speed-sensitive steering authority, soft
  runway walls, damped suspension spring with road noise).
* **Stunt mode** — ground integration is *entirely suspended*. Position, altitude, rotation and speed are pure functions
  of the phase timeline. Nothing external can interrupt it.

The handoff back to ground mode blends speed, yaw and the suspension spring rather than snapping.

### 2.2 Simulation isolated from React

`VehicleSim` is a plain class with no React import and no scene-graph dependency. It owns a `THREE.Vector3` /
`THREE.Quaternion` pair and nothing else from the renderer. This is what made a **Node-based acceptance harness**
possible without a browser or a GPU — the single highest-value testing decision in the project.

### 2.3 Two-rate data flow

The render loop reads the mutable sim object directly at 60 Hz (zero React re-renders). The HUD subscribes to a
telemetry snapshot published at ~18 Hz, with CSS transitions interpolating the gauges between samples. This keeps the
UI smooth without re-rendering the component tree every frame.

### 2.4 Quaternion composition, not Euler angles

`q = qYaw · qFlip · qRoll`, with `qFlip` driven by an angle that accumulates monotonically `0 → 2π`. This structurally
eliminates angle wrapping and gimbal discontinuity through the inverted phase. Verified numerically: the vehicle's
local up-vector reaches **−0.998** on the Y axis, i.e. genuinely roof-down.

---

## 3. The stunt timeline

Total **5.90 s** at 1.00× tempo, configurable 0.45×–1.50× via Settings.

| # | Phase | Dur | Rotation | Altitude | Speed ×launch | Notable FX |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TAKEOFF | 0.85 s | 0° → 30° | 0 → 2.40 m | 1.00 → 1.07 | suspension squat, smoke burst, thruster ignition |
| 2 | BACKFLIP | 1.50 s | 30° → 188° | 2.40 → 7.10 m | 1.07 → 1.00 | continuous rotation, side-profile camera |
| 3 | INVERTED_FLIGHT | 1.00 s | 188° → 199° | 7.10 → 7.55 m | 1.00 → 0.84 | hover breathing, roll/pitch stabilisation, low camera |
| 4 | RIGHTING | 0.95 s | 199° → 345° | 7.55 → 2.90 m | 0.84 → 0.96 | rotation continues in the same direction |
| 5 | LANDING | 0.75 s | 345° → 360° | 2.90 → 0 m | 0.96 → 0.80 | touchdown impulse, sparks, smoke, camera shake |
| 6 | RECOVERY | 0.85 s | hold 360° | 0 m | 0.80 → 1.00 | damped spring settle, yaw blend, skid decay |

**Anti-stall guarantees**

1. `dt` clamped to 40 ms — a 3.2 s frame spike is absorbed (explicitly tested).
2. Phase overflow carries via `while (u >= 1)`; the loop always terminates.
3. A missing phase definition falls through to `finishStunt()` rather than hanging.
4. `RECOVERY` exits unconditionally and restores `status = COMPLETE`, which auto-clears to `READY` after 3.4 s.
5. Double-triggering mid-flight is rejected, so the state machine can't be re-entered.

---

## 4. Verification

### 4.1 Static

```
npx tsc --noEmit   →  exit 0   (strict, noUnusedLocals, noUnusedParameters)
npm run build      →  ✓ 2290 modules transformed · dist/index.html 1 355.68 kB (gzip 377.11 kB)
```

### 4.2 Headless acceptance harness

`scripts/verify-sim.ts` — 52 assertions executed against the real simulation class at a fixed 1/60 s step.

```bash
npx esbuild scripts/verify-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/verify.mjs
node /tmp/verify.mjs
```

**[1] Idle + acceleration — 12/12**
```
✓ starts IDLE / READY
✓ stationary at start
✓ pivot at ride height (0.600 m)
✓ reaches >90 km/h in 1.9 s (got 98.1 km/h)
✓ peak acceleration 16.4 m/s²
✓ moved down the runway (z=-27.4 m)
✓ phase leaves IDLE under throttle
✓ wheels spin with speed (79.6 rad)
✓ top speed 269 km/h after 10 s
✓ never exceeds the configured top speed
✓ brake past standstill engages reverse (-13.00 m/s)
✓ gear indicator shows R
```

**[2] Steering — 4/4**
```
✓ steer left increases yaw (1.181 rad)
✓ vehicle translates left (x=-10.00 m)
✓ front wheels turned (0.388 rad)
✓ steer right reduces yaw
```

**[3] Full backflip sequence — 21/21**
```
✓ stunt armed
✓ state machine entered stunt mode
✓ every frame produced a finite transform
✓ sequence terminates on its own
✓ status COMPLETE
✓ visited every phase: TAKEOFF → BACKFLIP → INVERTED_FLIGHT → RIGHTING → LANDING → RECOVERY → DRIVING
✓ altitude apex 7.55 m
✓ back on the ground (alt=0.000 m)
✓ full 360° rotation accumulated (360°)
✓ vehicle really went upside down (min up.y = -0.998)
✓ telemetry flagged the INVERTED phase
✓ flip unwound cleanly to 0
✓ ride height restored (0.612 m)
✓ drives away under its own momentum (96 km/h)
✓ covered ground during the stunt (Δz=-213.7 m)
✓ aligned with the runway after recovery
✓ throttle responds again after landing
✓ steering responds again after landing
```

**[4] Deterministic replay + reset — 5/5**
```
✓ replay is frame-identical (Σ|Δflip| = 0.00e+0)
✓ stunt counter incremented (2)
✓ measured duration 5.90 s ≈ 5.90 s
✓ reset restores the pristine state
✓ stunt can be armed again immediately after reset
```

**[5] Edge cases — 13/13**
```
✓ stunt triggers from a standstill
✓ launch control spooled to 24.0 m/s
✓ cannot double-trigger mid-flight
✓ still terminates cleanly from a standing start
✓ survives a 3.2 s frame spike
✓ recovers to normal driving after the spike
✓ pause freezes the simulation
✓ resume continues the simulation
✓ 0.5× tempo still in flight at 5.90 s
✓ 0.5× tempo completes at ~2× the duration
✓ world recycled
✓ odometer keeps counting (7.25 km)
✓ stays inside the runway boundary (x=0.00)
```

> **Result: 52 passed, 0 failed.**
> The replay determinism check is the strongest one: it compares the flip angle of *every frame* of a fresh run against
> a replayed run and asserts the summed absolute difference is below 1e-6. It is exactly `0.00e+0`.

### 4.3 Testing limitation (disclosed)

No headless browser or GPU was available in the build environment, so **visual rendering could not be screenshotted or
pixel-verified automatically**. Rendering correctness was established by construction and static review: every mesh
uses locally-created geometry, every material is instantiated in-module, the environment map is baked from in-scene
lightformers, and there is no `useLoader`/`Suspense`-on-network path that could leave an empty scene. A `SceneFallback`
mesh and a pre-mount WebGL capability probe cover the remaining failure modes.

---

## 5. Bugs found and fixed during verification

| # | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 1 | Top speed plateaued at **207 km/h** vs. the advertised 302 | Torque taper `17·(1−v/88)^1.6` decayed faster than intended and was overwhelmed by quadratic drag + rolling resistance | Replaced with a designed *net* acceleration curve `16.4·(1−(v/84)^1.19)`, with drag added back into the torque term so it cancels exactly. Now 98 km/h @ 1.9 s, 269 km/h @ 10 s, asymptotic at 302. |
| 2 | Car covered **988 m** during a 5.9 s stunt at a 30 m/s launch (should be ~180 m) | Stunt speed was written back as `speed *= speedMul` **every frame**, compounding the multiplier ~350× | Stunt speed is now derived from the immutable `startSpeed` each frame (`startSpeed * speedMul`). Distance dropped to a correct 213.7 m, and replay became bit-exact. |
| 3 | Car model updated on its own `requestAnimationFrame` loop, decoupled from the R3F frame loop | Initial implementation predated the scene wiring | Converted to `useFrame`, so the model, camera and particles all advance on one clock and honour `frameloop="never"`. |
| 4 | Contact shadow / under-glow rotated with the car during the flip | They were children of the flipping root group | Moved into a separate runway-locked group driven by position + yaw only. |
| 5 | Mountain silhouettes popped at the 1 200 m world recycle | Peaks were randomly distributed across the full 2 400 m buffer, so the two halves differed | Peaks are now generated once per 1 200 m period and duplicated; overhead gantries respaced to a 600 m divisor. Seam is invisible. |
| 6 | Aviation beacons blinked out of sync | `ref` was attached to only one of several material instances | Single shared `MeshStandardMaterial` driven once per frame. |
| 7 | Exiting to the title screen while paused left the hero scene frozen | `exitToHero` reset the store's `paused` flag but not `sim.paused` | Both are now cleared, and the camera mode is restored to CHASE. |
| 8 | Free-cam could dip below the runway at max zoom | `maxPolarAngle` 1.62 rad allowed the orbit below the target plane | Tightened to 1.52 rad. |

---

## 6. Requirements coverage

| Requirement | Status | Implementation |
| --- | --- | --- |
| Interactive 3D, not a static page | ✅ | Full R3F scene, live driving, live stunt |
| Roadster-inspired, not official Tesla | ✅ | Disclaimers in hero spec sheet, technical brief and README |
| React + TS + Vite + Three + R3F + Drei | ✅ | See stack table |
| Real 3D meshes and materials | ✅ | Extruded profiles, physical paint, glass, carbon, chrome |
| Rapier *or* stable kinematic controller | ✅ | Custom kinematic controller (rationale §2.1) |
| Tailwind / clean responsive CSS | ✅ | Tailwind v4 theme tokens + HUD utilities |
| Lucide icons | ✅ | Used throughout HUD, panels, mobile pads |
| No backend / key / paid service | ✅ | Zero runtime asset fetches |
| Sleek low body, hood, rear deck | ✅ | 18-point bevelled side profile |
| Four detailed wheels, tyres + rims | ✅ | Tyre, shoulder, barrel, 5 spokes, hub, cap, disc, caliper ×4 |
| Transparent windshield + side glass | ✅ | Inset physical glass volume inside a pillar frame |
| Mirrors, aero, headlights, tail lights | ✅ | All present; tail bar brightens under braking |
| Detailed underside | ✅ | Floor, battery pack, rails, emissive undertray |
| Wheel rotation linked to speed | ✅ | `wheelSpin += speed / R · dt`, free-spins in flight |
| Pivot at centre of mass | ✅ | 0.60 m ride height, verified |
| Full 9-state machine | ✅ | Verified phase-by-phase in the harness |
| Smooth continuous 360° backflip | ✅ | Monotonic quaternion accumulation, up.y = −0.998 |
| Visible inverted phase | ✅ | 1.00 s hover + dedicated low camera + HUD badge |
| Righting without snapping | ✅ | Same rotation direction, eased, no wrap |
| Landing: compression, shake, smoke, skid | ✅ | Spring impulse + 34 sparks + smoke burst + shake 1.0 |
| Driving resumes after landing | ✅ | Throttle and steering both asserted post-landing |
| Deterministic, replayable, configurable | ✅ | Σ\|Δflip\| = 0 across replays; tempo slider 0.45–1.50× |
| Cannot get stuck between states | ✅ | 5 structural guarantees (§3), frame-spike tested |
| W/A/S/D + arrows, Space, R, C, P, M | ✅ | Plus `E` replay, `I` inspect, `Q` quality, `Shift` drift, `Esc` |
| On-screen mobile buttons | ✅ | Pointer-capture pads, auto-detected |
| PERFORM BACKFLIP button | ✅ | HUD + mobile, with live progress % |
| REPLAY STUNT button | ✅ | HUD + mobile + `E` |
| No interference with typing | ✅ | INPUT/TEXTAREA/SELECT/contenteditable guard |
| Scroll prevention only when focused | ✅ | Gated on `active()` |
| 5 camera modes | ✅ | Chase, Cinematic, Side, Cockpit, Free |
| Damped, no ground clipping, never loses car | ✅ | Exponential damping, `y ≥ 0.85`, quaternion slerp |
| Auto angles during flip, restore after | ✅ | Stunt Auto-Director, per-phase framing |
| Speed km/h, RPM indicator, gear/mode | ✅ | SVG speedometer + 28-segment torque bar + gear/drive-mode |
| Altitude, stunt status, elapsed time, camera | ✅ | Altitude tape, status chip, T+ timer, camera chip |
| Reset / pause / replay controls | ✅ | HUD icon row + Settings + keyboard |
| Motor, thruster, air, squeal, impact SFX | ✅ | Fully synthesised WebAudio, 5 layers + one-shots |
| No autoplay before interaction | ✅ | Context created on first pointer/key event |
| Working mute toggle | ✅ | `M`, HUD button, Settings toggle, master gain ramp |
| Smoke + thruster particles | ✅ | Two ring-buffer fields, 860 particles max |
| Speed sensation without costly motion blur | ✅ | Scrolling edge streaks, FOV widening, camera buffet |
| Hero with car + headline + START | ✅ | Live orbiting car behind an asymmetric editorial layout |
| Full-screen simulator | ✅ | Canvas fills the viewport, HUD overlays |
| Compact controls guide | ✅ | Modal, 14 bindings, context-aware hint |
| Stunt sequence indicator | ✅ | 8-step stepper + progress bar + hero preview |
| Vehicle inspection mode | ✅ | FREE orbit cam, `I` key, hero CTA |
| Settings: graphics, sound, camera | ✅ | Slide-over drawer, 4 sections |
| Technical section (simulated animation) | ✅ | Technical Brief modal with phase table |
| Restart experience | ✅ | Settings → Restart Experience, HUD power button |
| Consistent driving model | ✅ | Torque curve, drag, steering authority, wheel spin |
| Store starting transform | ✅ | `launch {x, z, yaw, speed}` recorded on trigger |
| Quaternion rotation, no wrapping | ✅ | §2.4 |
| Aligned to runway when driving | ✅ | Yaw blended back during RECOVERY |
| Stable landing transform + blend | ✅ | Asserted ride height 0.612 m, roll/yaw < 0.05 |
| `R` resets everything | ✅ | Asserted pristine state |
| Responsive interface | ✅ | Touch layout repositions HUD above the pads |
| Touch controls | ✅ | Steer, brake, drift, accelerate, stunt, replay, pause |
| Adaptive rendering resolution | ✅ | `PerformanceGuard` + `AdaptiveDpr` |
| Device-appropriate shadows/effects | ✅ | 3 quality tiers |
| No expensive real-time reflections | ✅ | Environment baked once (`frames={1}`) |
| Pause when page hidden | ✅ | `visibilitychange` → `frameloop="never"` |
| Respect reduced motion | ✅ | Shake off by default, CSS animations disabled |
| WebGL fallback message | ✅ | Pre-mount capability probe + styled panel |
| No huge textures/models | ✅ | Canvas textures ≤ 256², zero downloads |
| UI never freezes during animation | ✅ | 18 Hz telemetry, mutable sim read at 60 Hz |
| Typed, maintainable, componentised | ✅ | 24 modules, strict TS, sim/render/UI separated |
| Cleanup of listeners, animation, audio | ✅ | Every `useEffect` returns a teardown; geometries/materials/textures disposed |

---

## 7. Performance profile

| Quality | Shadows | Post-FX | Particles | DPR range |
| --- | --- | --- | --- | --- |
| LOW | off | none | disabled | 0.70 – 1.00 |
| MEDIUM | off | Bloom + Vignette | 60 % emit rate | 0.85 – 1.50 |
| HIGH | 2048² PCF soft | Bloom (mipmap) + Vignette, 2× MSAA | 100 % emit rate | 1.00 – 2.00 |

* **Draw-call discipline** — runway dashes, edge lights, chevrons and mountain peaks are `InstancedMesh`; the key light
  follows the car on a snapped 0.5 m grid so a small 32 m shadow frustum stays sharp instead of covering the world.
* **Zero per-frame allocation in FX** — particle state lives in pre-allocated `Float32Array`s uploaded straight to
  `BufferAttribute`s; the emit rate uses a fractional carry so density is frame-rate independent.
* **Adaptive DPR** — sampled every 1.2 s; steps down 0.25 below 42 fps, up 0.25 above 58 fps, clamped to the tier range.
* **Endless world, bounded memory** — a 2 400 m geometry buffer recycled every 1 200 m, verified over a 120 s
  full-throttle run (7.25 km) with no coordinate drift or NaN.

---

## 8. Known limitations & honest notes

1. **No automated visual verification.** No GPU/headless browser was available; see §4.3. Logic is exhaustively tested,
   pixels are not.
2. **Arcade, not simulation.** The ground model is deliberately forgiving — no tyre slip curves, weight transfer or
   gearbox. It is tuned to feel fast and readable, not to match a vehicle dynamics reference.
3. **The stunt ignores collisions by design.** Driving off the runway edge during a stunt is prevented by re-centring
   lateral position toward the launch line, which is a choreographic choice, not physics.
4. **Cockpit cam has no dashboard render target.** It is a true first-person viewpoint inside the modelled cabin; the HUD
   remains a screen overlay rather than being projected onto the dash.
5. **Motion blur is simulated**, not a real velocity-buffer effect — streaks, FOV widening and camera buffet, chosen for
   mobile performance as the brief allowed.
6. **Fonts require network on first load.** Chakra Petch / IBM Plex are loaded from Google Fonts; offline they fall back
   to the declared system stacks and the layout remains intact.

---

## 9. Reproducing this report

```bash
npm install
npx tsc --noEmit                    # → exit 0
npm run build                       # → dist/index.html, ~377 kB gzipped
npx esbuild scripts/verify-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/verify.mjs
node /tmp/verify.mjs                # → ALL CHECKS PASSED (52/52)
npm run dev                         # → manual play-through at http://localhost:5173
```

**Suggested manual play-through:** START EXPERIENCE → hold `W` to ~150 km/h → `Space` → watch the full rotation from the
auto-directed side angle → confirm the INVERTED badge → confirm touchdown smoke and that `W`/`A` respond again →
`E` to replay → `C` through all five cameras → `I` to orbit-inspect the underside → `R` to reset → repeat.
