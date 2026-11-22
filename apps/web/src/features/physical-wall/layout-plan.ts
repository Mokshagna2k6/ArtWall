/**
 * Wall layout planning (F01).
 *
 * Pure arithmetic, deliberately kept out of the server action so it can be
 * tested and previewed without touching a database: the admin screen shows the
 * same numbers before committing that the action will produce after.
 *
 * The model is a simple uniform grid with an equal gap between every frame and
 * at the wall's edges. For N frames across a run there are N+1 gaps (one on
 * each outer edge plus N-1 between), which is where the arithmetic below comes
 * from. This intentionally does not attempt a salon hang or mixed sizes — a
 * uniform grid is what the slot model (rowIndex/colIndex) can represent, and
 * pretending otherwise would produce a plan the editor could not open.
 */

export interface LayoutPlanInput {
  wallWidthCm: number;
  wallHeightCm: number;
  slotWidthCm: number;
  slotHeightCm: number;
  gapCm: number;
}

export interface LayoutPlan {
  rowCount: number;
  colCount: number;
  slotCount: number;
  /** Total width/height the frames plus their gaps actually occupy. */
  usedWidthCm: number;
  usedHeightCm: number;
  /** What is left over — the margin the hang can be centred within. */
  leftoverWidthCm: number;
  leftoverHeightCm: number;
  /** Why nothing fits, when it doesn't. Null on a usable plan. */
  problem: string | null;
}

/** Hard ceiling, matching gridResizeSchema so a plan is always openable. */
export const MAX_ROWS = 20;
export const MAX_COLS = 20;

/**
 * How many frames of `itemCm` fit across `availableCm` with `gapCm` on every
 * side and between.
 *
 * Solving `n*item + (n+1)*gap <= available` for n.
 */
function fitAcross(availableCm: number, itemCm: number, gapCm: number): number {
  if (itemCm <= 0) return 0;
  const count = Math.floor((availableCm - gapCm) / (itemCm + gapCm));
  return Math.max(0, count);
}

/**
 * Plan a uniform grid for a measured wall.
 *
 * Returns a `problem` rather than throwing: this runs on every keystroke of
 * the preview, where "nothing fits yet" is a normal state and an exception
 * would be noise.
 */
export function planLayout(input: LayoutPlanInput): LayoutPlan {
  const { wallWidthCm, wallHeightCm, slotWidthCm, slotHeightCm, gapCm } = input;

  const empty = (problem: string): LayoutPlan => ({
    rowCount: 0,
    colCount: 0,
    slotCount: 0,
    usedWidthCm: 0,
    usedHeightCm: 0,
    leftoverWidthCm: wallWidthCm,
    leftoverHeightCm: wallHeightCm,
    problem,
  });

  if (slotWidthCm <= 0 || slotHeightCm <= 0) {
    return empty("That size class has no dimensions.");
  }

  const rawCols = fitAcross(wallWidthCm, slotWidthCm, gapCm);
  const rawRows = fitAcross(wallHeightCm, slotHeightCm, gapCm);

  if (rawCols === 0 || rawRows === 0) {
    return empty(
      `A ${slotWidthCm}×${slotHeightCm}cm frame does not fit on a ` +
        `${wallWidthCm}×${wallHeightCm}cm wall with a ${gapCm}cm gap. ` +
        "Use a smaller size class or a narrower gap."
    );
  }

  // Clamp rather than refuse: a very large wall is a real wall, and 20x20 is
  // the editor's limit, not a measurement error. The caller is told.
  const colCount = Math.min(rawCols, MAX_COLS);
  const rowCount = Math.min(rawRows, MAX_ROWS);

  const usedWidthCm = colCount * slotWidthCm + (colCount + 1) * gapCm;
  const usedHeightCm = rowCount * slotHeightCm + (rowCount + 1) * gapCm;

  return {
    rowCount,
    colCount,
    slotCount: rowCount * colCount,
    usedWidthCm,
    usedHeightCm,
    leftoverWidthCm: wallWidthCm - usedWidthCm,
    leftoverHeightCm: wallHeightCm - usedHeightCm,
    problem:
      rawCols > MAX_COLS || rawRows > MAX_ROWS
        ? `This wall fits ${rawCols}×${rawRows}, more than the ${MAX_COLS}×${MAX_ROWS} ` +
          "a single layout holds. Generating the largest layout that fits — " +
          "split the wall into sections for the rest."
        : null,
  };
}

/** Spreadsheet-style label: row 0 col 0 is "A1", row 1 col 2 is "B3". */
export function slotLabel(rowIndex: number, colIndex: number): string {
  return `${String.fromCharCode(65 + rowIndex)}${colIndex + 1}`;
}
