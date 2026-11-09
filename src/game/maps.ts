import { MapConfig, MapTileType } from "./types";

const TILE_SIZE = 48;
const COLS = 20;
const ROWS = 13;

// Helper to generate a 20x13 grid with path, river, and castle walls
function createLumbridgeGrid(): MapTileType[][] {
  const grid: MapTileType[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: MapTileType[] = [];
    for (let c = 0; c < COLS; c++) {
      // River Lum on column 5
      if (c === 5) {
        row.push("water");
      }
      // Castle walls on right side (column 18 and 19)
      else if (c >= 18 && (r < 5 || r > 7)) {
        row.push("wall");
      }
      // Castle Gate
      else if (c === 18 && r >= 5 && r <= 7) {
        row.push("castle_gate");
      } else {
        row.push("grass");
      }
    }
    grid.push(row);
  }

  // Winding path layout:
  // Starts at (0, 3) -> moves east across bridge to (8, 3)
  // Turns south to (8, 9)
  // Turns east to (14, 9)
  // Turns north to (14, 6)
  // Turns east straight into castle gate at (18, 6)

  // Segment 1: row 3, cols 0 to 8
  for (let c = 0; c <= 8; c++) {
    grid[3][c] = c === 5 ? "bridge" : "path";
  }

  // Segment 2: col 8, rows 3 to 9
  for (let r = 3; r <= 9; r++) {
    grid[r][8] = "path";
  }

  // Segment 3: row 9, cols 8 to 14
  for (let c = 8; c <= 14; c++) {
    grid[9][c] = "path";
  }

  // Segment 4: col 14, rows 6 to 9
  for (let r = 6; r <= 9; r++) {
    grid[r][14] = "path";
  }

  // Segment 5: row 6, cols 14 to 18
  for (let c = 14; c <= 18; c++) {
    if (grid[6][c] !== "castle_gate") {
      grid[6][c] = "path";
    }
  }

  return grid;
}

export const LUMBRIDGE_MAP: MapConfig = {
  id: "lumbridge",
  name: "Lumbridge Castle Grounds",
  description:
    "Defend the courtyard of Duke Horacio from invading goblins and highwaymen marching toward the castle gates!",
  cols: COLS,
  rows: ROWS,
  tileSize: TILE_SIZE,
  grid: createLumbridgeGrid(),
  startPoint: { x: 0 * TILE_SIZE, y: 3.5 * TILE_SIZE },
  endPoint: { x: 18.5 * TILE_SIZE, y: 6.5 * TILE_SIZE },
  pathWaypoints: [
    { x: -20, y: 3.5 * TILE_SIZE },
    { x: 8.5 * TILE_SIZE, y: 3.5 * TILE_SIZE },
    { x: 8.5 * TILE_SIZE, y: 9.5 * TILE_SIZE },
    { x: 14.5 * TILE_SIZE, y: 9.5 * TILE_SIZE },
    { x: 14.5 * TILE_SIZE, y: 6.5 * TILE_SIZE },
    { x: 18.5 * TILE_SIZE, y: 6.5 * TILE_SIZE },
  ],
};
