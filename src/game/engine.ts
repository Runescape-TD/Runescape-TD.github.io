import { sound } from "./audio";
import { ENEMIES, WAVES } from "./enemies";
import { LUMBRIDGE_MAP } from "./maps";
import { TOWERS } from "./towers";
import {
  EnemyInstance,
  Hitsplat,
  MapConfig,
  Particle,
  Point,
  Projectile,
  TargetPriority,
  TowerInstance,
  TowerType,
  WaveConfig,
} from "./types";

export class GameEngine {
  public map: MapConfig = LUMBRIDGE_MAP;
  public gp: number = 220; // Starting Gold Coins (GP)
  public castleHp: number = 100;
  public maxCastleHp: number = 100;
  public score: number = 0;
  public waveIndex: number = 0;
  public waveInProgress: boolean = false;
  public autoStartWaves: boolean = false;
  public gameSpeed: number = 1; // 1, 2, or 3
  public isGameOver: boolean = false;
  public isVictory: boolean = false;

  public towers: TowerInstance[] = [];
  public enemies: EnemyInstance[] = [];
  public projectiles: Projectile[] = [];
  public particles: Particle[] = [];
  public hitsplats: Hitsplat[] = [];

  public selectedTowerId: string | null = null;
  public placingTowerType: TowerType | null = null;

  // Wave spawning internals
  private waveQueue: { type: any; spawnTime: number }[] = [];
  private waveTimer: number = 0;
  private shakeTimer: number = 0;

  constructor() {
    this.reset();
  }

  public reset() {
    this.gp = 250;
    this.castleHp = 100;
    this.score = 0;
    this.waveIndex = 0;
    this.waveInProgress = false;
    this.isGameOver = false;
    this.isVictory = false;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.hitsplats = [];
    this.selectedTowerId = null;
    this.placingTowerType = null;
    this.waveQueue = [];
    this.waveTimer = 0;
  }

  public getScreenShake(): number {
    return this.shakeTimer > 0 ? this.shakeTimer * 6 : 0;
  }

  public canPlaceTowerAt(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= this.map.cols || gridY < 0 || gridY >= this.map.rows) {
      return false;
    }
    const tile = this.map.grid[gridY][gridX];
    if (tile !== "grass") {
      return false;
    }
    // Check if another tower is already here
    return !this.towers.some((t) => t.gridX === gridX && t.gridY === gridY);
  }

  public placeTower(type: TowerType, gridX: number, gridY: number): boolean {
    const def = TOWERS[type];
    const cost = def.baseCost;

    if (this.gp < cost) return false;
    if (!this.canPlaceTowerAt(gridX, gridY)) return false;

    this.gp -= cost;
    sound.playLevelUp();

    const tileSize = this.map.tileSize;
    const newTower: TowerInstance = {
      id: "tower_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      type,
      gridX,
      gridY,
      x: (gridX + 0.5) * tileSize,
      y: (gridY + 0.5) * tileSize,
      level: 1,
      cooldownRemaining: 0,
      rotation: 0,
      totalDamage: 0,
      kills: 0,
      targetPriority: "first",
    };

    this.towers.push(newTower);
    this.placingTowerType = null;
    this.selectedTowerId = newTower.id;

    // Spawn place particles
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      this.particles.push({
        id: "p_" + Math.random(),
        x: newTower.x,
        y: newTower.y,
        vx: Math.cos(angle) * 60,
        vy: Math.sin(angle) * 60,
        life: 0.35,
        maxLife: 0.35,
        color: def.color,
        size: 3,
      });
    }

    return true;
  }

  public upgradeTower(towerId: string): boolean {
    const tower = this.towers.find((t) => t.id === towerId);
    if (!tower) return false;

    const def = TOWERS[tower.type];
    if (tower.level >= def.levels.length) return false;

    const nextConfig = def.levels[tower.level]; // index matches next level
    if (this.gp < nextConfig.cost) return false;

    this.gp -= nextConfig.cost;
    tower.level++;
    sound.playLevelUp();

    // Floating Level Up text
    this.hitsplats.push({
      id: "xp_" + Math.random(),
      x: tower.x,
      y: tower.y - 20,
      text: "LEVEL UP!",
      type: "xp",
      life: 1.0,
      maxLife: 1.0,
    });

    return true;
  }

  public sellTower(towerId: string): boolean {
    const index = this.towers.findIndex((t) => t.id === towerId);
    if (index === -1) return false;

    const tower = this.towers[index];
    const def = TOWERS[tower.type];

    // Calculate total invested cost
    let invested = def.baseCost;
    for (let l = 1; l < tower.level; l++) {
      invested += def.levels[l].cost;
    }
    const refund = Math.floor(invested * 0.7);

    this.gp += refund;
    sound.playCoin();
    this.towers.splice(index, 1);
    if (this.selectedTowerId === towerId) {
      this.selectedTowerId = null;
    }

    return true;
  }

  public setTargetPriority(towerId: string, priority: TargetPriority) {
    const tower = this.towers.find((t) => t.id === towerId);
    if (tower) {
      tower.targetPriority = priority;
    }
  }

  public startNextWave(): boolean {
    if (this.waveInProgress || this.isGameOver) return false;
    if (this.waveIndex >= WAVES.length) return false;

    const wave = WAVES[this.waveIndex];
    this.waveInProgress = true;
    this.waveTimer = 0;
    this.waveQueue = [];

    let currentOffset = 0;
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        this.waveQueue.push({
          type: group.type,
          spawnTime: currentOffset,
        });
        currentOffset += group.spawnInterval;
      }
    }

    sound.playHit();
    return true;
  }

  public update(rawDt: number) {
    if (this.isGameOver || this.isVictory) return;

    // Apply game speed (1x, 2x, 3x)
    const dt = Math.min(rawDt, 0.1) * this.gameSpeed;

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    // 1. Spawning wave enemies
    if (this.waveInProgress) {
      this.waveTimer += dt;

      // Spawn pending
      for (let i = this.waveQueue.length - 1; i >= 0; i--) {
        const item = this.waveQueue[i];
        if (this.waveTimer >= item.spawnTime) {
          this.spawnEnemy(item.type);
          this.waveQueue.splice(i, 1);
        }
      }

      // Check if wave is cleared
      if (this.waveQueue.length === 0 && this.enemies.length === 0) {
        this.waveInProgress = false;
        const currentWaveConfig = WAVES[this.waveIndex];
        this.gp += currentWaveConfig.rewardGp;
        sound.playCoin();

        this.hitsplats.push({
          id: "wave_clear_" + Math.random(),
          x: this.map.cols * this.map.tileSize * 0.5,
          y: this.map.rows * this.map.tileSize * 0.4,
          text: `WAVE ${this.waveIndex + 1} CLEARED! +${currentWaveConfig.rewardGp} GP`,
          type: "xp",
          life: 1.8,
          maxLife: 1.8,
        });

        this.waveIndex++;
        if (this.waveIndex >= WAVES.length) {
          this.isVictory = true;
        } else if (this.autoStartWaves) {
          this.startNextWave();
        }
      }
    }

    // 2. Update Enemies along path
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Handle slow timer
      let currentSpeed = enemy.speed;
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt;
        currentSpeed *= enemy.slowFactor;
      }
      if (enemy.frozenTimer > 0) {
        enemy.frozenTimer -= dt;
        currentSpeed = 0;
      }

      // Handle burn DoT
      if (enemy.burnTimer > 0) {
        enemy.burnTimer -= dt;
        enemy.hp -= enemy.burnDps * dt;
        if (enemy.hp <= 0) {
          this.killEnemy(enemy, "Burn damage");
          this.enemies.splice(i, 1);
          continue;
        }
      }

      // Move toward next waypoint
      const waypoints = this.map.pathWaypoints;
      if (enemy.pathIndex < waypoints.length) {
        const targetWp = waypoints[enemy.pathIndex];
        const dx = targetWp.x - enemy.x;
        const dy = targetWp.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const moveDist = currentSpeed * dt;
        if (dist <= moveDist) {
          enemy.x = targetWp.x;
          enemy.y = targetWp.y;
          enemy.pathIndex++;
        } else {
          enemy.x += (dx / dist) * moveDist;
          enemy.y += (dy / dist) * moveDist;
        }
        enemy.distanceTraveled += moveDist;
      } else {
        // Enemy reached Castle Gate!
        this.castleHp = Math.max(0, this.castleHp - (ENEMIES[enemy.type].isBoss ? 25 : 5));
        this.shakeTimer = 0.4;
        sound.playGateHit();

        this.hitsplats.push({
          id: "breach_" + Math.random(),
          x: enemy.x,
          y: enemy.y - 15,
          text: "-5 HP",
          type: "damage",
          life: 0.9,
          maxLife: 0.9,
        });

        this.enemies.splice(i, 1);

        if (this.castleHp <= 0) {
          this.isGameOver = true;
        }
      }
    }

    // 3. Update Towers & Target Selection
    // Calculate altar buffs first
    const altarBuffs = new Map<string, { dmgMult: number; spdMult: number }>();
    for (const altar of this.towers) {
      if (altar.type !== "altar") continue;
      const altarRange = TOWERS.altar.levels[altar.level - 1].range;
      for (const t of this.towers) {
        if (t.id === altar.id) continue;
        const dist = Math.hypot(t.x - altar.x, t.y - altar.y);
        if (dist <= altarRange) {
          const current = altarBuffs.get(t.id) || { dmgMult: 1.0, spdMult: 1.0 };
          const bonus = 0.15 + altar.level * 0.08;
          current.dmgMult += bonus;
          current.spdMult += bonus * 0.8;
          altarBuffs.set(t.id, current);
        }
      }
    }

    for (const tower of this.towers) {
      if (tower.type === "altar") continue; // Altars don't attack directly

      const def = TOWERS[tower.type];
      const config = def.levels[tower.level - 1];

      const buffs = altarBuffs.get(tower.id) || { dmgMult: 1.0, spdMult: 1.0 };
      const effectiveCooldown = config.attackCooldown / buffs.spdMult;

      if (tower.cooldownRemaining > 0) {
        tower.cooldownRemaining -= dt;
      }

      // Find targets in range
      const inRangeEnemies = this.enemies.filter(
        (e) => Math.hypot(e.x - tower.x, e.y - tower.y) <= config.range,
      );

      if (inRangeEnemies.length === 0) {
        tower.targetEnemyId = undefined;
        continue;
      }

      // Pick target based on priority
      let target = inRangeEnemies[0];
      if (tower.targetPriority === "first") {
        target = inRangeEnemies.reduce((prev, curr) =>
          curr.distanceTraveled > prev.distanceTraveled ? curr : prev,
        );
      } else if (tower.targetPriority === "last") {
        target = inRangeEnemies.reduce((prev, curr) =>
          curr.distanceTraveled < prev.distanceTraveled ? curr : prev,
        );
      } else if (tower.targetPriority === "strongest") {
        target = inRangeEnemies.reduce((prev, curr) => (curr.hp > prev.hp ? curr : prev));
      } else if (tower.targetPriority === "closest") {
        target = inRangeEnemies.reduce((prev, curr) =>
          Math.hypot(curr.x - tower.x, curr.y - tower.y) <
          Math.hypot(prev.x - tower.x, prev.y - tower.y)
            ? curr
            : prev,
        );
      }

      tower.targetEnemyId = target.id;
      // Rotate tower toward target
      tower.rotation = Math.atan2(target.y - tower.y, target.x - tower.x);

      // Fire weapon if cooldown is ready!
      if (tower.cooldownRemaining <= 0) {
        tower.cooldownRemaining = effectiveCooldown;
        const effectiveDamage = Math.round(config.damage * buffs.dmgMult);

        this.fireProjectile(tower, config, target, effectiveDamage);
      }
    }

    // 4. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const targetEnemy = this.enemies.find((e) => e.id === proj.targetEnemyId);

      // If target died or vanished, home to last target pos
      const destX = targetEnemy ? targetEnemy.x : proj.targetPos.x;
      const destY = targetEnemy ? targetEnemy.y : proj.targetPos.y;

      const dx = destX - proj.x;
      const dy = destY - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = proj.speed * dt;

      if (dist <= step || (dist < 15 && !targetEnemy)) {
        // Projectile hit!
        this.handleProjectileHit(proj, destX, destY, targetEnemy);
        this.projectiles.splice(i, 1);
      } else {
        proj.x += (dx / dist) * step;
        proj.y += (dy / dist) * step;
        proj.targetPos = { x: destX, y: destY };
      }
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    // 6. Update Hitsplats (OSRS damage and XP drops)
    for (let i = this.hitsplats.length - 1; i >= 0; i--) {
      const h = this.hitsplats[i];
      h.life -= dt;
      h.y -= 25 * dt; // float upwards
      if (h.life <= 0) {
        this.hitsplats.splice(i, 1);
      }
    }
  }

  private spawnEnemy(type: any) {
    const def = ENEMIES[type as keyof typeof ENEMIES];
    const waypoints = this.map.pathWaypoints;

    this.enemies.push({
      id: "enemy_" + Math.random(),
      type,
      x: waypoints[0].x,
      y: waypoints[0].y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      speed: def.speed,
      pathIndex: 1,
      distanceTraveled: 0,
      slowTimer: 0,
      slowFactor: 1,
      burnTimer: 0,
      burnDps: 0,
      frozenTimer: 0,
    });
  }

  private fireProjectile(tower: TowerInstance, config: any, target: EnemyInstance, damage: number) {
    // Play sound based on weapon type
    if (config.projectileType === "arrow") {
      sound.playArrow();
    } else if (config.projectileType === "firebolt") {
      sound.playMagicCast();
    } else if (config.projectileType === "ice") {
      sound.playIceFreeze();
    } else if (config.projectileType === "cannonball") {
      sound.playCannon();
    } else if (config.projectileType === "slash") {
      sound.playSlash();
    }

    this.projectiles.push({
      id: "proj_" + Math.random(),
      x: tower.x,
      y: tower.y,
      targetEnemyId: target.id,
      targetPos: { x: target.x, y: target.y },
      speed: config.projectileSpeed,
      damage,
      type: config.projectileType,
      aoeRadius: config.aoeRadius,
      slowDuration: config.slowDuration,
      slowFactor: config.slowFactor,
      burnDuration: config.burnDuration,
      burnDamage: config.burnDamage,
      sourceTowerId: tower.id,
    });
  }

  private handleProjectileHit(
    proj: Projectile,
    hitX: number,
    hitY: number,
    primaryTarget?: EnemyInstance,
  ) {
    const sourceTower = this.towers.find((t) => t.id === proj.sourceTowerId);

    // If AoE radius exists (Cannon, Ice Barrage, Cleave)
    if (proj.aoeRadius && proj.aoeRadius > 0) {
      for (const enemy of this.enemies) {
        const dist = Math.hypot(enemy.x - hitX, enemy.y - hitY);
        if (dist <= proj.aoeRadius) {
          this.applyDamageToEnemy(enemy, proj.damage, proj, sourceTower);
        }
      }
      // AoE explosion particles
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 80 + 30;
        this.particles.push({
          id: "p_" + Math.random(),
          x: hitX,
          y: hitY,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.35,
          maxLife: 0.35,
          color: proj.type === "ice" ? "#38bdf8" : "#f97316",
          size: 3.5,
        });
      }
    } else if (primaryTarget) {
      this.applyDamageToEnemy(primaryTarget, proj.damage, proj, sourceTower);
    }
  }

  private applyDamageToEnemy(
    enemy: EnemyInstance,
    rawDamage: number,
    proj: Projectile,
    sourceTower?: TowerInstance,
  ) {
    const enemyDef = ENEMIES[enemy.type];

    // Armor & Resistance calculation
    let finalDamage = rawDamage;
    if (proj.type === "firebolt" || proj.type === "ice") {
      finalDamage = Math.max(1, Math.round(rawDamage * (1 - enemyDef.magicResist)));
    } else {
      finalDamage = Math.max(1, rawDamage - enemyDef.armor);
    }

    enemy.hp -= finalDamage;

    if (sourceTower) {
      sourceTower.totalDamage += finalDamage;
    }

    // Floating OSRS Damage Hitsplat
    this.hitsplats.push({
      id: "hit_" + Math.random(),
      x: enemy.x + (Math.random() * 16 - 8),
      y: enemy.y - 12,
      text: finalDamage.toString(),
      type: "damage",
      life: 0.7,
      maxLife: 0.7,
    });

    // XP Drop floating
    this.hitsplats.push({
      id: "xp_" + Math.random(),
      x: enemy.x + 12,
      y: enemy.y - 25,
      text: `+${Math.round(finalDamage * 1.5)} XP`,
      type: "xp",
      life: 0.8,
      maxLife: 0.8,
    });

    // Apply Debuffs (Slow / Burn / Freeze)
    if (proj.slowDuration && proj.slowFactor) {
      enemy.slowTimer = Math.max(enemy.slowTimer, proj.slowDuration);
      enemy.slowFactor = proj.slowFactor;
      if (proj.type === "ice" && proj.slowFactor <= 0.3) {
        enemy.frozenTimer = 1.5; // Frozen in ice!
      }
    }
    if (proj.burnDuration && proj.burnDamage) {
      enemy.burnTimer = proj.burnDuration;
      enemy.burnDps = proj.burnDamage;
    }

    // Check if enemy died
    if (enemy.hp <= 0) {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) {
        this.enemies.splice(idx, 1);
        this.killEnemy(enemy, "Killed by " + (sourceTower ? sourceTower.type : "Tower"));
        if (sourceTower) {
          sourceTower.kills++;
        }
      }
    }
  }

  private killEnemy(enemy: EnemyInstance, _reason: string) {
    const def = ENEMIES[enemy.type];
    this.gp += def.rewardGp;
    this.score += def.score;

    sound.playCoin();

    // Floating Coin reward
    this.hitsplats.push({
      id: "coin_" + Math.random(),
      x: enemy.x,
      y: enemy.y - 20,
      text: `+${def.rewardGp} GP`,
      type: "xp",
      life: 1.0,
      maxLife: 1.0,
    });

    // Death burst particles
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        id: "death_p_" + Math.random(),
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 50,
        life: 0.4,
        maxLife: 0.4,
        color: def.color,
        size: 3,
      });
    }
  }
}
