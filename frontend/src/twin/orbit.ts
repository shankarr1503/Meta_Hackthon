/** Drag-orbit camera math for the twin. Pure so it can be tested without WebGL. */

export interface OrbitState {
  /** Azimuth around the shaft, radians. */
  theta: number;
  /** Polar angle from +Y, radians; 0 looks straight down. */
  phi: number;
  /** Distance from the origin, scene units. */
  radius: number;
}

/** Keep the camera above the machine bed and at a usable distance. */
export function clampOrbit(o: OrbitState): OrbitState {
  return {
    theta: o.theta,
    phi: Math.min(Math.max(o.phi, 0.15), Math.PI / 2 + 0.35),
    radius: Math.min(Math.max(o.radius, 2.5), 9),
  };
}

/** Camera position on the orbit sphere, looking at the origin. */
export function orbitCameraPosition(
  theta: number,
  phi: number,
  radius: number,
): [number, number, number] {
  const sinPhi = Math.sin(phi);
  return [
    radius * sinPhi * Math.sin(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.cos(theta),
  ];
}
