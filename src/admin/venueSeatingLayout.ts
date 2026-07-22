import type { SeatingTableSeed } from '../services/seating';

// Derived from the venue's own floor plan ("Ronit Farm 26-08-26-General
// Dinner Plan.pdf", dated July 13 2026 - a draft, not final): 14 round dinner
// tables sized 32/16/10 seats, which sum to exactly the sketch's stated
// headcount of 340. Positions below are a best-effort grid that follows the
// same left-to-right, top-to-bottom order the tables appear in the sketch -
// NOT a pixel-exact trace of the CAD drawing (that data isn't available from
// a flattened PDF). The two small semicircular lounge/sofa clusters shown
// near the dance floor in the sketch are deliberately left out - Gil said
// those will likely be cut since they conflict with the side screens.
//
// The sketch's 32-seat groupings are drawn as long merged/oval clusters
// (several small round tables pushed together under one continuous curved
// row of chairs), not single round tables - so those are given a wide
// width-vs-height ratio here (an unequal round box renders as an ellipse,
// not a circle) to read visually closer to the sketch instead of as plain
// circles. The 16-seat groupings get a milder oval; the 10-seat ones are
// simple standalone rounds in the sketch, so those stay circular.
//
// Sized so every table fits comfortably in the canvas's left ~85%, leaving
// the far right open the way the sketch does for the dance floor/bar/DJ area
// (which isn't seating, so it isn't represented here). Gil can drag, resize,
// or delete any of these afterward once the stage placement and the sofa
// question are finalized.
const ROUND = 'round' as const;

const OVAL_32 = { width: 260, height: 150 };
const OVAL_16 = { width: 170, height: 120 };
const ROUND_10 = { width: 110, height: 110 };

export const RONIT_FARM_DINNER_TABLES: SeatingTableSeed[] = [
  { name: 'שולחן 1', seatCount: 32, layout: { x: 40, y: 40, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 2', seatCount: 32, layout: { x: 340, y: 40, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 3', seatCount: 32, layout: { x: 640, y: 40, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 4', seatCount: 32, layout: { x: 940, y: 40, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 5', seatCount: 16, layout: { x: 40, y: 240, ...OVAL_16, shape: ROUND } },
  { name: 'שולחן 6', seatCount: 16, layout: { x: 340, y: 240, ...OVAL_16, shape: ROUND } },
  { name: 'שולחן 7', seatCount: 32, layout: { x: 640, y: 240, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 8', seatCount: 10, layout: { x: 940, y: 240, ...ROUND_10, shape: ROUND } },
  { name: 'שולחן 9', seatCount: 16, layout: { x: 40, y: 440, ...OVAL_16, shape: ROUND } },
  { name: 'שולחן 10', seatCount: 32, layout: { x: 340, y: 440, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 11', seatCount: 16, layout: { x: 640, y: 440, ...OVAL_16, shape: ROUND } },
  { name: 'שולחן 12', seatCount: 32, layout: { x: 940, y: 440, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 13', seatCount: 32, layout: { x: 40, y: 640, ...OVAL_32, shape: ROUND } },
  { name: 'שולחן 14', seatCount: 10, layout: { x: 340, y: 640, ...ROUND_10, shape: ROUND } },
];
