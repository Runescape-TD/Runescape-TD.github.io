export type Point = {
  x: number;
  y: number;
};

export type TargetPriority = "first" | "last" | "strongest" | "closest";

export type TowerType = "archer" | "mage" | "warrior" | "cannon" | "altar";

export type TowerLevelConfig = {
  level: number;
  name: string;
  weaponName: string;
  cost: number;
  damage: number;
  range: number; // in pixels
  attackCooldown: number; // in seconds
  projectileSpeed: number;
  projectileType: "arrow" | "firebolt" | "cannonball" | "slash" | "ice";
  aoeRadius?: number;
  slowDuration?: number;
  slowFactor?: number;
  burnDuration?: number;
  burnDamage?: number;
  description: string;
};

export type TowerDef = {
  id: TowerType;
  name: string;
  role: string;
  color: string;
  baseCost: number;
  levels: TowerLevelConfig[];
};

export type TowerInstance = {
  id: string;
  type: TowerType;
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  level: number;
  cooldownRemaining: number;
  rotation: number;
  totalDamage: number;
  kills: number;
  targetPriority: TargetPriority;
  targetEnemyId?: string;
};

export type EnemyType =
  | "rat"
  | "goblin"
  | "highwayman"
  | "skeleton"
  | "zombie"
  | "lesser_demon"
  | "black_knight"
  | "elvarg";

export type EnemyDef = {
  id: EnemyType;
  name: string;
  color: string;
  size: number;
  maxHp: number;
  speed: number; // pixels per second
  rewardGp: number;
  score: number;
  magicResist: number; // 0 - 1
  armor: number; // damage reduction
  isBoss?: boolean;
};

export type EnemyInstance = {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  pathIndex: number;
  distanceTraveled: number;
  slowTimer: number;
  slowFactor: number;
  burnTimer: number;
  burnDps: number;
  frozenTimer: number;
};

export type Projectile = {
  id: string;
  x: number;
  y: number;
  targetEnemyId: string;
  targetPos: Point;
  speed: number;
  damage: number;
  type: "arrow" | "firebolt" | "cannonball" | "slash" | "ice";
  aoeRadius?: number;
  slowDuration?: number;
  slowFactor?: number;
  burnDuration?: number;
  burnDamage?: number;
  sourceTowerId: string;
};

export type Particle = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type Hitsplat = {
  id: string;
  x: number;
  y: number;
  text: string;
  type: "damage" | "miss" | "xp";
  life: number;
  maxLife: number;
};

export type MapTileType = "grass" | "path" | "water" | "wall" | "bridge" | "castle_gate";

export type MapConfig = {
  id: string;
  name: string;
  description: string;
  cols: number;
  rows: number;
  tileSize: number;
  grid: MapTileType[][];
  pathWaypoints: Point[]; // pixel centers of waypoints
  startPoint: Point;
  endPoint: Point;
};

export type WaveEnemyGroup = {
  type: EnemyType;
  count: number;
  spawnInterval: number; // seconds between each spawn in group
};

export type WaveConfig = {
  waveNumber: number;
  groups: WaveEnemyGroup[];
  rewardGp: number;
  bossWave?: boolean;
};
