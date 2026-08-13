import type { SeatingTableSeed } from '../services/seating';
import type { VenueObjectType } from '../services/venueObjects';
import type { SeatingTableLayout } from '../services/seating';

// Derived from the venue's FINAL, produced seating sketch ("Ronit Farm
// 26-08-26-Seating Plan.pdf", dated Aug. 12 2026 - produced by Ariella Tayar
// Luxury Event Production / Kristina Shusterman Space Designer). This
// supersedes the earlier draft dinner-plan sketch (340 seats, 14 tables) -
// the venue confirmed 21 numbered tables seating exactly 388 people, plus a
// bar, a control station, and restrooms. Table numbers below match the
// sketch's own numbering (01-21) exactly, so Gil can cross-reference against
// the printed plan the venue/production company will bring on the day.
//
// The sketch's own legend gives three table types, and Gil specifically
// asked for the actual shapes (not just circles/ellipses) to be represented:
// - 6 long curved/scalloped booth tables seating 32 each (07, 08, 09, 13,
//   14, 21) -> rendered as the 'curved' shape (a thick crescent/arc band -
//   see FreeformTableShape in SeatingFloorPlan.tsx), since these are really
//   a continuous curved row of chairs bent around a shared curve, not a
//   single round table.
// - 4 teardrop/petal-shaped tables seating 16 each (04, 10, 12, 18) ->
//   rendered as the 'teardrop' shape (a real petal/drop outline).
// - 11 small round tables seating 12 each (01, 02, 03, 05, 06, 11, 15, 16,
//   17, 19, 20) -> a plain circle ('round').
// 6x32 + 4x16 + 11x12 = 192 + 64 + 132 = 388, matching the sketch's stated
// total exactly.
//
// Positions below are a best-effort grid that follows the same
// left-to-right, top-to-bottom layout and clustering the sketch shows (two
// mirrored curved-booth pairs with the teardrop/round tables nested between
// them, a top row and bottom row of round tables, and the bar positioned
// between the two standalone booths 07/21 on the right) - NOT a pixel-exact
// trace of the CAD drawing, and the `rotation` on each teardrop/curved table
// is my best-effort read of which way it faces in the sketch, not a
// guaranteed exact match - Gil can nudge any table's rotation with the
// "Rotate 90°" button, or drag/resize it, once it's on the canvas.
const ROUND = 'round' as const;
const RECT = 'rect' as const;
const TEARDROP = 'teardrop' as const;
const CURVED = 'curved' as const;

// Square, so rotating 90 degrees never looks squashed (see the rotation
// comment on SeatingTableLayout in services/seating.ts).
const TEARDROP_SIZE = { width: 140, height: 140 };
const CURVED_SIZE = { width: 250, height: 120 };
const CIRCLE_SIZE = { width: 100, height: 100 };

export const RONIT_FARM_FINAL_TABLES: SeatingTableSeed[] = [
  // Top row
  { name: 'שולחן 01', seatCount: 12, layout: { x: 20, y: 20, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 02', seatCount: 12, layout: { x: 150, y: 20, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 03', seatCount: 12, layout: { x: 280, y: 20, ...CIRCLE_SIZE, shape: ROUND } },
  // Point faces down into the room (rounded bulb against the back wall).
  { name: 'שולחן 04', seatCount: 16, layout: { x: 410, y: 20, ...TEARDROP_SIZE, shape: TEARDROP, rotation: 180 } },
  { name: 'שולחן 05', seatCount: 12, layout: { x: 580, y: 20, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 06', seatCount: 12, layout: { x: 710, y: 20, ...CIRCLE_SIZE, shape: ROUND } },
  // Upper curved-booth pair - both open downward, toward the nested row
  // beneath them.
  { name: 'שולחן 09', seatCount: 32, layout: { x: 280, y: 180, ...CURVED_SIZE, shape: CURVED, rotation: 0 } },
  { name: 'שולחן 08', seatCount: 32, layout: { x: 560, y: 180, ...CURVED_SIZE, shape: CURVED, rotation: 0 } },
  // Nested middle row, between the two curved-booth pairs - the two
  // teardrops point inward toward the round table between them.
  { name: 'שולחן 10', seatCount: 16, layout: { x: 300, y: 330, ...TEARDROP_SIZE, shape: TEARDROP, rotation: 90 } },
  { name: 'שולחן 11', seatCount: 12, layout: { x: 490, y: 350, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 12', seatCount: 16, layout: { x: 620, y: 330, ...TEARDROP_SIZE, shape: TEARDROP, rotation: 270 } },
  // Lower curved-booth pair - both open upward, toward the nested row above.
  { name: 'שולחן 14', seatCount: 32, layout: { x: 280, y: 520, ...CURVED_SIZE, shape: CURVED, rotation: 180 } },
  { name: 'שולחן 13', seatCount: 32, layout: { x: 560, y: 520, ...CURVED_SIZE, shape: CURVED, rotation: 180 } },
  // Bottom row
  { name: 'שולחן 15', seatCount: 12, layout: { x: 20, y: 700, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 16', seatCount: 12, layout: { x: 150, y: 700, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 17', seatCount: 12, layout: { x: 280, y: 700, ...CIRCLE_SIZE, shape: ROUND } },
  // Point faces up into the room (mirrors table 04 across the hall).
  { name: 'שולחן 18', seatCount: 16, layout: { x: 410, y: 700, ...TEARDROP_SIZE, shape: TEARDROP, rotation: 0 } },
  { name: 'שולחן 19', seatCount: 12, layout: { x: 580, y: 700, ...CIRCLE_SIZE, shape: ROUND } },
  { name: 'שולחן 20', seatCount: 12, layout: { x: 710, y: 700, ...CIRCLE_SIZE, shape: ROUND } },
  // Standalone 32-seat booths flanking the bar, right side - 07 opens down
  // toward the bar, 21 opens up toward it.
  { name: 'שולחן 07', seatCount: 32, layout: { x: 950, y: 180, ...CURVED_SIZE, shape: CURVED, rotation: 0 } },
  { name: 'שולחן 21', seatCount: 32, layout: { x: 950, y: 620, ...CURVED_SIZE, shape: CURVED, rotation: 180 } },
];

export interface VenueObjectSeed {
  type: VenueObjectType;
  label: string;
  layout: SeatingTableLayout;
}

// The bar sits right of the two standalone 32-seat booths (07 above, 21
// below), vertically centered between them, matching the sketch. The
// control station (production/AV booth) sits near table 07 at the top
// right; the restrooms are called out near the bottom-left of the hall.
export const RONIT_FARM_FINAL_OBJECTS: VenueObjectSeed[] = [
  { type: 'bar', label: 'בר', layout: { x: 950, y: 340, width: 220, height: 220, shape: ROUND } },
  { type: 'custom', label: 'עמדת הפקה', layout: { x: 950, y: 40, width: 140, height: 70, shape: RECT } },
  { type: 'custom', label: 'שירותים', layout: { x: 20, y: 820, width: 110, height: 70, shape: RECT } },
];
