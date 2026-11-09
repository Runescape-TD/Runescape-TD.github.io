import { EnemyDef, EnemyType, WaveConfig } from "./types";

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  rat: {
    id: "rat",
    name: "Giant Rat",
    color: "#78716c",
    size: 14,
    maxHp: 45,
    speed: 75,
    rewardGp: 8,
    score: 15,
    magicResist: 0,
    armor: 0,
  },
  goblin: {
    id: "goblin",
    name: "Goblin",
    color: "#65a30d",
    size: 16,
    maxHp: 85,
    speed: 55,
    rewardGp: 12,
    score: 25,
    magicResist: 0.1,
    armor: 1,
  },
  highwayman: {
    id: "highwayman",
    name: "Highwayman",
    color: "#0284c7",
    size: 17,
    maxHp: 160,
    speed: 65,
    rewardGp: 20,
    score: 40,
    magicResist: 0.15,
    armor: 2,
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    color: "#e2e8f0",
    size: 16,
    maxHp: 240,
    speed: 50,
    rewardGp: 28,
    score: 55,
    magicResist: 0,
    armor: 5, // High physical armor resistance
  },
  zombie: {
    id: "zombie",
    name: "Zombie",
    color: "#059669",
    size: 18,
    maxHp: 450,
    speed: 38,
    rewardGp: 40,
    score: 75,
    magicResist: 0.2,
    armor: 3,
  },
  black_knight: {
    id: "black_knight",
    name: "Black Knight",
    color: "#1e293b",
    size: 19,
    maxHp: 850,
    speed: 46,
    rewardGp: 65,
    score: 120,
    magicResist: 0.25,
    armor: 8,
  },
  lesser_demon: {
    id: "lesser_demon",
    name: "Lesser Demon",
    color: "#b91c1c",
    size: 22,
    maxHp: 1600,
    speed: 42,
    rewardGp: 110,
    score: 220,
    magicResist: 0.45,
    armor: 6,
  },
  elvarg: {
    id: "elvarg",
    name: "Elvarg the Green Dragon",
    color: "#15803d",
    size: 32,
    maxHp: 5500,
    speed: 32,
    rewardGp: 500,
    score: 1000,
    magicResist: 0.35,
    armor: 12,
    isBoss: true,
  },
};

export const WAVES: WaveConfig[] = [
  // Early waves: Rats & Goblins
  {
    waveNumber: 1,
    groups: [{ type: "rat", count: 8, spawnInterval: 1.1 }],
    rewardGp: 50,
  },
  {
    waveNumber: 2,
    groups: [
      { type: "rat", count: 6, spawnInterval: 0.9 },
      { type: "goblin", count: 6, spawnInterval: 1.2 },
    ],
    rewardGp: 65,
  },
  {
    waveNumber: 3,
    groups: [{ type: "goblin", count: 12, spawnInterval: 0.85 }],
    rewardGp: 80,
  },
  {
    waveNumber: 4,
    groups: [
      { type: "goblin", count: 8, spawnInterval: 0.8 },
      { type: "highwayman", count: 5, spawnInterval: 1.4 },
    ],
    rewardGp: 100,
  },
  {
    waveNumber: 5,
    groups: [
      { type: "highwayman", count: 10, spawnInterval: 1.0 },
      { type: "skeleton", count: 4, spawnInterval: 1.5 },
    ],
    rewardGp: 120,
  },
  // Middle waves: Skeletons & Zombies
  {
    waveNumber: 6,
    groups: [{ type: "skeleton", count: 14, spawnInterval: 0.9 }],
    rewardGp: 140,
  },
  {
    waveNumber: 7,
    groups: [
      { type: "skeleton", count: 10, spawnInterval: 0.8 },
      { type: "zombie", count: 6, spawnInterval: 1.5 },
    ],
    rewardGp: 160,
  },
  {
    waveNumber: 8,
    groups: [
      { type: "rat", count: 18, spawnInterval: 0.4 }, // Swarm rush!
      { type: "zombie", count: 8, spawnInterval: 1.2 },
    ],
    rewardGp: 180,
  },
  {
    waveNumber: 9,
    groups: [
      { type: "zombie", count: 12, spawnInterval: 1.0 },
      { type: "black_knight", count: 3, spawnInterval: 2.2 },
    ],
    rewardGp: 200,
  },
  {
    waveNumber: 10,
    groups: [
      { type: "highwayman", count: 12, spawnInterval: 0.7 },
      { type: "black_knight", count: 6, spawnInterval: 1.6 },
    ],
    rewardGp: 240,
    bossWave: true,
  },
  // Higher waves: Black Knights & Lesser Demons
  {
    waveNumber: 11,
    groups: [
      { type: "skeleton", count: 16, spawnInterval: 0.6 },
      { type: "black_knight", count: 8, spawnInterval: 1.3 },
    ],
    rewardGp: 260,
  },
  {
    waveNumber: 12,
    groups: [
      { type: "black_knight", count: 12, spawnInterval: 1.0 },
      { type: "lesser_demon", count: 3, spawnInterval: 2.5 },
    ],
    rewardGp: 300,
  },
  {
    waveNumber: 13,
    groups: [
      { type: "zombie", count: 15, spawnInterval: 0.8 },
      { type: "lesser_demon", count: 6, spawnInterval: 2.0 },
    ],
    rewardGp: 340,
  },
  {
    waveNumber: 14,
    groups: [
      { type: "highwayman", count: 20, spawnInterval: 0.5 },
      { type: "lesser_demon", count: 8, spawnInterval: 1.8 },
    ],
    rewardGp: 380,
  },
  // Climax Boss Wave: Elvarg!
  {
    waveNumber: 15,
    groups: [
      { type: "black_knight", count: 10, spawnInterval: 1.0 },
      { type: "lesser_demon", count: 8, spawnInterval: 1.5 },
      { type: "elvarg", count: 1, spawnInterval: 4.0 },
    ],
    rewardGp: 600,
    bossWave: true,
  },
];
