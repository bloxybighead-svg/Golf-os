// PGA TOUR benchmark: average strokes to complete the hole, by distance to the hole (yards) and lie.
//
// Source: Mark Broadie, "Assessing Golfer Performance on the PGA TOUR",
// Interfaces 42(2), 146-165 (2012), Appendix Table 9 -- "Average number of
// strokes to complete the hole for PGA TOUR golfers from various starting
// positions ... estimated using over eight million shots during 2003-2010."
// Working-paper PDF: https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
// Transcribed programmatically from the PDF text (not retyped by hand).
//
// Columns: [distance yd, tee, fairway, rough, sand, recovery]. Tee is only
// tabulated from 100 yd out (null closer in).
export type TableRow = readonly [number, number | null, number, number, number, number]

export const BROADIE_TABLE_9: readonly TableRow[] = [
  [10, null, 2.18, 2.34, 2.43, 3.45],
  [20, null, 2.40, 2.59, 2.53, 3.51],
  [30, null, 2.52, 2.70, 2.66, 3.57],
  [40, null, 2.60, 2.78, 2.82, 3.71],
  [50, null, 2.66, 2.87, 2.92, 3.79],
  [60, null, 2.70, 2.91, 3.15, 3.83],
  [70, null, 2.72, 2.93, 3.21, 3.84],
  [80, null, 2.75, 2.96, 3.24, 3.84],
  [90, null, 2.77, 2.99, 3.24, 3.82],
  [100, 2.92, 2.80, 3.02, 3.23, 3.80],
  [120, 2.99, 2.85, 3.08, 3.21, 3.78],
  [140, 2.97, 2.91, 3.15, 3.22, 3.80],
  [160, 2.99, 2.98, 3.23, 3.28, 3.81],
  [180, 3.05, 3.08, 3.31, 3.40, 3.82],
  [200, 3.12, 3.19, 3.42, 3.55, 3.87],
  [220, 3.17, 3.32, 3.53, 3.70, 3.92],
  [240, 3.25, 3.45, 3.64, 3.84, 3.97],
  [260, 3.45, 3.58, 3.74, 3.93, 4.03],
  [280, 3.65, 3.69, 3.83, 4.00, 4.10],
  [300, 3.71, 3.78, 3.90, 4.04, 4.20],
  [320, 3.79, 3.84, 3.95, 4.12, 4.31],
  [340, 3.86, 3.88, 4.02, 4.26, 4.44],
  [360, 3.92, 3.95, 4.11, 4.41, 4.56],
  [380, 3.96, 4.03, 4.21, 4.55, 4.66],
  [400, 3.99, 4.11, 4.30, 4.69, 4.75],
  [420, 4.02, 4.19, 4.40, 4.83, 4.84],
  [440, 4.08, 4.27, 4.49, 4.97, 4.94],
  [460, 4.17, 4.34, 4.58, 5.11, 5.03],
  [480, 4.28, 4.42, 4.68, 5.25, 5.13],
  [500, 4.41, 4.50, 4.77, 5.40, 5.22],
  [520, 4.54, 4.58, 4.87, 5.54, 5.32],
  [540, 4.65, 4.66, 4.96, 5.68, 5.41],
  [560, 4.74, 4.74, 5.06, 5.82, 5.51],
  [580, 4.79, 4.82, 5.15, 5.96, 5.60],
  [600, 4.82, 4.89, 5.25, 6.10, 5.70],
]

// Putting: average putts to hole out by distance in FEET.
// Source: Mark Broadie, "Putts Gained: Measuring Putting on the PGA TOUR",
// draft January 13, 2011, Figure 1 data table (ShotLink, PGA TOUR golfers).
// http://www.columbia.edu/~mnb2/broadie/Assets/putting_strokes_gained_20110113.pdf
export const BROADIE_PUTTS: readonly (readonly [number, number])[] = [
  [2, 1.01], [3, 1.05], [4, 1.14], [5, 1.24], [6, 1.34], [7, 1.43], [8, 1.5], [9, 1.56],
  [10, 1.61], [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21], [90, 2.36],
] as const
