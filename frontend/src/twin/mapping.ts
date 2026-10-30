/**
 * Measurement → 3D twin mapping. The twin only shows motion the measurements support:
 * spin follows RPM (slowed down, true RPM labelled), whirl orbit size follows measured 1x
 * (exaggerated by a stated factor), a strong 2x turns the orbit into a figure-eight,
 * broadband above the sensor floor adds seeded jitter, bearing tint follows temperature
 * rise and an arrow shows load. Pure functions so they can be tested without WebGL.
 */

/** Displayed spin is this many times slower than the real shaft. */
export const SPIN_SLOWDOWN = 20;
/** Scene units per µm of measured vibration. */
export const ORBIT_UNITS_PER_UM = 0.004;
/** The 3.2-unit shaft is drawn as a 0.8 m rotor, so one scene unit is 0.25 m. */
export const METRES_PER_SCENE_UNIT = 0.25;
/** How much larger the whirl is drawn than the measured vibration (1 µm shown as 1 mm). */
export const ORBIT_EXAGGERATION = Math.round((ORBIT_UNITS_PER_UM * METRES_PER_SCENE_UNIT) / 1e-6);
export const MAX_ORBIT_UNITS = 0.45;
/** Broadband below this (µm RMS) is sensor noise and adds no jitter. */
export const SENSOR_FLOOR_UM = 2.0;
export const HOT_RISE_C = 40;
export const MAX_LOAD_N = 5000;

export interface TwinReading {
  rpm: number;
  load_n: number;
  /** null when only the alarm's overall level is known. */
  measured: {
    amp_1x_um: number;
    amp_2x_um: number;
    broadband_um: number;
    temp_rise_c: number;
  } | null;
}

export interface TwinState {
  spinRevPerSec: number;
  orbit1x: number;
  orbit2x: number;
  jitter: number;
  figureEight: boolean;
  bearingColor: string;
  loadArrowLength: number;
  measured: boolean;
}

export function spinRevPerSec(rpm: number): number {
  return Math.max(0, rpm) / 60 / SPIN_SLOWDOWN;
}

export function orbitUnits(amplitudeUm: number): number {
  return Math.min(Math.max(0, amplitudeUm) * ORBIT_UNITS_PER_UM, MAX_ORBIT_UNITS);
}

export function jitterUnits(broadbandUm: number): number {
  return orbitUnits(Math.max(0, broadbandUm - SENSOR_FLOOR_UM));
}

/** A strong 2x (at least as large as 1x, and above the noise floor) makes a figure-eight. */
export function isFigureEight(amp1xUm: number, amp2xUm: number): boolean {
  return amp2xUm >= amp1xUm && amp2xUm > SENSOR_FLOOR_UM;
}

function channel(from: number, to: number, t: number): string {
  return Math.round(from + (to - from) * t)
    .toString(16)
    .padStart(2, "0");
}

/** Cool slate at no rise → red at HOT_RISE_C or above. */
export function bearingColor(tempRiseC: number): string {
  const t = Math.min(Math.max(tempRiseC / HOT_RISE_C, 0), 1);
  return `#${channel(0x64, 0xdc, t)}${channel(0x74, 0x26, t)}${channel(0x8b, 0x26, t)}`;
}

/** Arrow length in scene units; 0 hides the arrow. */
export function loadArrowLength(loadN: number): number {
  return Math.min(Math.max(loadN, 0) / MAX_LOAD_N, 1) * 0.9;
}

/**
 * Shaft centre at shaft angle `theta`. A pure 1x whirl is a circle; a pure 2x traces a
 * 1:2 figure-eight; mixtures blend the two.
 */
export function orbitPoint(theta: number, r1: number, r2: number): [number, number] {
  return [r1 * Math.cos(theta) + r2 * Math.sin(theta), r1 * Math.sin(theta) + r2 * Math.sin(2 * theta)];
}

/** Deterministic pseudo-random number in [-1, 1) for a seed and frame (mulberry32). */
export function seededNoise(seed: number, frame: number): number {
  let a = (seed * 0x9e3779b1 + frame * 0x85ebca6b) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

export function twinState(reading: TwinReading): TwinState {
  const m = reading.measured;
  return {
    spinRevPerSec: spinRevPerSec(reading.rpm),
    orbit1x: m ? orbitUnits(m.amp_1x_um) : 0,
    orbit2x: m ? orbitUnits(m.amp_2x_um) : 0,
    jitter: m ? jitterUnits(m.broadband_um) : 0,
    figureEight: m ? isFigureEight(m.amp_1x_um, m.amp_2x_um) : false,
    bearingColor: bearingColor(m ? m.temp_rise_c : 0),
    loadArrowLength: loadArrowLength(reading.load_n),
    measured: m !== null,
  };
}
