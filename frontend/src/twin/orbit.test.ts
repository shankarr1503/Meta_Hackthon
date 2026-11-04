import { describe, expect, it } from "vitest";

import { clampOrbit, orbitCameraPosition } from "./orbit";

describe("orbitCameraPosition", () => {
  it("places the camera on a sphere around the origin", () => {
    const [x, y, z] = orbitCameraPosition(0, Math.PI / 2, 4);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(4);
    const [x2, , z2] = orbitCameraPosition(Math.PI / 2, Math.PI / 2, 4);
    expect(x2).toBeCloseTo(4);
    expect(z2).toBeCloseTo(0);
  });

  it("keeps the distance equal to the radius", () => {
    const [x, y, z] = orbitCameraPosition(0.7, 1.1, 5);
    expect(Math.hypot(x, y, z)).toBeCloseTo(5);
  });
});

describe("clampOrbit", () => {
  it("keeps the camera above the bed and at a usable distance", () => {
    expect(clampOrbit({ theta: 0, phi: -1, radius: 99 })).toEqual({
      theta: 0,
      phi: 0.15,
      radius: 9,
    });
    expect(clampOrbit({ theta: 0, phi: 3, radius: 1 })).toEqual({
      theta: 0,
      phi: Math.PI / 2 + 0.35,
      radius: 2.5,
    });
  });
});
