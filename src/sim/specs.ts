import * as THREE from "three";
import { RIDE_HEIGHT, WHEEL_RADIUS } from "./VehicleSim";

/** Shared hard-points so the 3D model, camera rig and FX all agree on dimensions. */
export const CAR = {
  length: 4.62,
  width: 2.04,
  height: 1.13,
  /** CoM height above the runway, wheels sit below this pivot. */
  rideHeight: RIDE_HEIGHT,
  wheelRadius: WHEEL_RADIUS,
  wheelWidth: 0.3,
  axleFrontZ: -1.36,
  axleRearZ: 1.3,
  track: 0.87,
  /** wheel-centre offsets in vehicle local space */
  wheelCenterY: -RIDE_HEIGHT + WHEEL_RADIUS,
  /** tyre contact patches (used for smoke / skid marks) */
  contacts: [
    new THREE.Vector3(0.87, -RIDE_HEIGHT, -1.36),
    new THREE.Vector3(-0.87, -RIDE_HEIGHT, -1.36),
    new THREE.Vector3(0.87, -RIDE_HEIGHT, 1.3),
    new THREE.Vector3(-0.87, -RIDE_HEIGHT, 1.3),
  ],
  /** rear thruster nozzles, local space */
  nozzles: [new THREE.Vector3(0.44, -0.24, 2.16), new THREE.Vector3(-0.44, -0.24, 2.16)],
  /** cockpit camera anchor */
  cockpit: new THREE.Vector3(-0.36, 0.34, -0.1),
  /** chase camera anchor */
  chaseFocus: new THREE.Vector3(0, 0.15, 0),
} as const;

export const isWheelContactOnGround = (worldY: number) => worldY < 0.35;
