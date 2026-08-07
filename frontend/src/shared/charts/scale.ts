/**
 * Pure scale/tick functions for the SVG chart primitives (ADR-3: cero
 * dependencias de charting; escalas y ejes propios, testeables sin DOM).
 */

/**
 * Builds a linear interpolation function mapping `domain` → `range`.
 * Handles the degenerate case (`domainMin === domainMax`) by returning the
 * range minimum instead of dividing by zero.
 */
export function linearScale(domain: [number, number], range: [number, number]): (value: number) => number {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  const domainSpan = domainMax - domainMin;

  return (value: number): number => {
    if (domainSpan === 0) return rangeMin;
    const ratio = (value - domainMin) / domainSpan;
    return rangeMin + ratio * (rangeMax - rangeMin);
  };
}

/**
 * Generates `count` evenly-spaced ticks between `min` and `max`, inclusive.
 * Flat data (`min === max`) collapses to a single tick to avoid NaN/Infinity.
 */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const safeCount = Math.max(2, count);
  const step = (max - min) / (safeCount - 1);
  return Array.from({ length: safeCount }, (_, i) => min + step * i);
}
