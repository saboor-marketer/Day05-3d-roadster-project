import type { VehicleSim } from "./VehicleSim";

export interface InputHandlers {
  onStunt: () => void;
  onReplay: () => void;
  onReset: () => void;
  onCamera: () => void;
  onPause: () => void;
  onMute: () => void;
  onInspect: () => void;
  onQuality: () => void;
  onEscape: () => void;
  active: () => boolean;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const isTyping = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return TYPING.has(el.tagName) || el.isContentEditable;
};

/**
 * Keyboard binding layer. Never touches React state directly — it mutates the
 * simulation input flags and fires intent callbacks, so it works identically
 * for desktop keys and on-screen touch buttons.
 */
export function attachKeyboard(sim: VehicleSim, h: InputHandlers): () => void {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (e.repeat) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      return;
    }
    const active = h.active();
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        sim.input.throttle = true;
        break;
      case "KeyS":
      case "ArrowDown":
        sim.input.brake = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        sim.input.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        sim.input.right = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        sim.input.handbrake = true;
        break;
      case "Space":
        if (active) h.onStunt();
        break;
      case "KeyE":
        if (active) h.onReplay();
        break;
      case "KeyR":
        if (active) h.onReset();
        break;
      case "KeyC":
        if (active) h.onCamera();
        break;
      case "KeyP":
        if (active) h.onPause();
        break;
      case "KeyM":
        h.onMute();
        break;
      case "KeyI":
        if (active) h.onInspect();
        break;
      case "KeyQ":
        if (active) h.onQuality();
        break;
      case "Escape":
        h.onEscape();
        break;
      default:
        return;
    }
    // swallow browser scrolling only while the simulator owns the page
    if (active && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.key)) e.preventDefault();
  };

  const up = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        sim.input.throttle = false;
        break;
      case "KeyS":
      case "ArrowDown":
        sim.input.brake = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        sim.input.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        sim.input.right = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        sim.input.handbrake = false;
        break;
      default:
        break;
    }
  };

  const clear = () => {
    sim.input.throttle = false;
    sim.input.brake = false;
    sim.input.left = false;
    sim.input.right = false;
    sim.input.handbrake = false;
  };

  window.addEventListener("keydown", down, { passive: false });
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
  };
}

/** Press-and-hold semantics for the on-screen touch buttons. */
export function bindHold(el: HTMLElement, onDown: () => void, onUp: () => void) {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    el.dataset.held = "1";
    onDown();
  };
  const up = (e: PointerEvent) => {
    e.preventDefault();
    delete el.dataset.held;
    onUp();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("pointerleave", up);
  };
}
