import { mat4, vec3, vec4 } from "gl-matrix";
import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { ActorAnim, ActorModel, ActorRenderer, NO_TINT } from "../../mapviewer/webgl/actor/ActorRenderer";
import { RegionData, RegionDataInput } from "../../mapviewer/worker/RegionData";
import { RegionDataLoader } from "../../mapviewer/worker/RegionDataLoader";
import { EquipSlot, createAppearance } from "../../rs/model/player/PlayerModelLoader";
import { GameAssets, HITSPLAT_SPRITES, getEnemyModelKey } from "../client/GameAssets";
import { GameAudio } from "../client/GameAudio";
import { Overlay, ScreenPoint } from "../client/Overlay";
import { getEnemy } from "../content/enemies";
import { MAPS, getArenaRegion } from "../content/maps";
import { ArenaGrid } from "../core/world/ArenaGrid";
import { CameraRig } from "../render/CameraRig";
import { GameFrameHandler, GameWebGLRenderer } from "../render/GameWebGLRenderer";

export interface Waypoint {
    x: number;
    y: number;
}

// Dirt road waypoints from river Lum bridge to Lumbridge castle gate
export const LUMBRIDGE_PATH: Waypoint[] = [
    { x: 3245.0, y: 3226.5 }, // Bridge entry
    { x: 3241.0, y: 3226.0 }, // Road off bridge
    { x: 3238.0, y: 3224.0 }, // Curve towards castle
    { x: 3236.0, y: 3221.5 }, // Approaching castle gate
    { x: 3232.0, y: 3220.5 }, // Courtyard entrance / Castle gate
];

export interface TdGoblin {
    id: number;
    x: number;
    y: number; // ground coordinate (Z in 3D)
    yaw: number;
    hp: number;
    maxHp: number;
    speed: number;
    waypointIndex: number;
    state: "walking" | "dying" | "dead";
    deathProgress: number; // 0 to 1
    ticksAlive: number;
}

export interface TdArcher {
    id: number;
    tileX: number;
    tileZ: number;
    x: number;
    z: number;
    yaw: number;
    range: number;
    attackCooldown: number; // seconds
    shootAnimTimer: number; // seconds remaining in firing anim
    targetGoblinId?: number;
}

export interface TdArrow {
    id: number;
    startX: number;
    startY: number;
    startZ: number;
    x: number;
    y: number;
    z: number;
    targetGoblinId: number;
    speed: number;
}

export interface TdHitsplat {
    id: number;
    x: number;
    z: number;
    amount: number;
    createdTime: number; // ms
}

export interface TdGameState {
    waveNumber: number;
    waveActive: boolean;
    goblinsRemainingToSpawn: number;
    goblinsAlive: number;
    gateHp: number;
    maxGateHp: number;
    gold: number;
    archersCount: number;
    hoverTile?: { x: number; z: number; valid: boolean };
}

export class LumbridgeTdGame implements GameFrameHandler {
    static async create(
        mapViewer: MapViewer,
        renderer: GameWebGLRenderer,
        overlayCanvas: HTMLCanvasElement,
        onStateChange?: (state: TdGameState) => void,
    ): Promise<LumbridgeTdGame> {
        const lumbridgeMap = MAPS[0];
        const arena = getArenaRegion(lumbridgeMap);
        renderer.setPlayArea(
            arena.baseX,
            arena.baseY,
            arena.baseX + arena.sizeX,
            arena.baseY + arena.sizeY,
            { behind: 44, around: 30 },
        );

        const workerPool = mapViewer.workerPool;
        const regionPromise = workerPool.queueLoad<RegionDataInput, RegionData, RegionDataLoader>(
            new RegionDataLoader(),
            getArenaRegion(lumbridgeMap),
        );

        const audio = new GameAudio();
        // Load sounds: 469 (goblin attack), 471 (goblin death), 472 (goblin hit), 2707 (bow shot), 711, 713
        const soundsPromise = audio.load(workerPool, [469, 471, 472, 2707, 711, 713]);

        const actors = await renderer.getActorRenderer();
        const assets = new GameAssets(workerPool, renderer, actors);
        const spritesPromise = assets.loadSprites();

        await assets.loadBase();

        // Bake goblin
        const goblinDef = getEnemy("goblin");
        await assets.loadEnemies([goblinDef]);

        // Bake Archer appearance with shortbow
        const archerAppearance = createAppearance({
            [EquipSlot.HEAD]: 1169, // Coif
            [EquipSlot.TORSO]: 1129, // Leather body
            [EquipSlot.LEGS]: 1095, // Leather chaps
            [EquipSlot.HANDS]: 1063, // Leather vambraces
            [EquipSlot.WEAPON]: 841, // Shortbow
        });
        await assets.setPlayerAppearance(archerAppearance, 0, [426]); // 426 is shortbow attack

        const grid = new ArenaGrid(await regionPromise);
        await soundsPromise;
        await spritesPromise;

        return new LumbridgeTdGame(
            mapViewer,
            renderer,
            overlayCanvas,
            grid,
            assets,
            audio,
            onStateChange,
        );
    }

    readonly cameraRig = new CameraRig();
    readonly overlay: Overlay;
    private readonly screen: ScreenPoint = { x: 0, y: 0, visible: false };

    // Game Entities
    goblins: TdGoblin[] = [];
    archers: TdArcher[] = [];
    arrows: TdArrow[] = [];
    hitsplats: TdHitsplat[] = [];

    // Wave Management
    waveNumber = 1;
    waveActive = false;
    spawnTimer = 0;
    goblinsToSpawn = 0;
    gateHp = 100;
    maxGateHp = 100;
    gold = Infinity; // Unlimited GP per Vlad's request!

    // Mouse Interaction
    mouseClientX = 0;
    mouseClientY = 0;
    hoverTile?: { x: number; z: number; valid: boolean };

    private nextGoblinId = 1;
    private nextArcherId = 1;
    private nextArrowId = 1;
    private nextHitsplatId = 1;
    private clientTicks = 0;
    private lastInvViewProj = mat4.create();

    private boundOnMouseMove: (e: MouseEvent) => void;
    private boundOnClick: (e: MouseEvent) => void;

    constructor(
        readonly mapViewer: MapViewer,
        readonly renderer: GameWebGLRenderer,
        readonly overlayCanvas: HTMLCanvasElement,
        readonly grid: ArenaGrid,
        readonly assets: GameAssets,
        readonly audio: GameAudio,
        public onStateChange?: (state: TdGameState) => void,
    ) {
        this.overlay = new Overlay(overlayCanvas);

        // Position camera to look directly at the path from bridge to castle gate
        // Focus point: between bridge (3244, 3226) and gate (3233, 3220) -> (3238.5, 3223.5)
        this.cameraRig.pitch = -380;
        this.cameraRig.yaw = 0;
        this.cameraRig.distance = 21;

        renderer.setPlane(grid.plane);
        renderer.setSmoothTerrain(false);
        renderer.setLighting(false);
        renderer.setBrightness(1.1);

        this.boundOnMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
        this.boundOnClick = (e: MouseEvent) => this.handleClick(e);

        window.addEventListener("mousemove", this.boundOnMouseMove);
        renderer.canvas.addEventListener("click", this.boundOnClick);

        this.notifyState();
    }

    notifyState(): void {
        this.onStateChange?.({
            waveNumber: this.waveNumber,
            waveActive: this.waveActive,
            goblinsRemainingToSpawn: this.goblinsToSpawn,
            goblinsAlive: this.goblins.filter((g) => g.state !== "dead").length,
            gateHp: this.gateHp,
            maxGateHp: this.maxGateHp,
            gold: this.gold,
            archersCount: this.archers.length,
            hoverTile: this.hoverTile,
        });
    }

    startWave(): void {
        if (this.waveActive) return;
        this.waveActive = true;
        this.goblinsToSpawn = 10;
        this.spawnTimer = 0;
        this.notifyState();
    }

    private spawnGoblin(): void {
        const start = LUMBRIDGE_PATH[0];
        const next = LUMBRIDGE_PATH[1];
        const dx = next.x - start.x;
        const dy = next.y - start.y;
        const yaw = Math.round((Math.atan2(-dx, -dy) / (2 * Math.PI)) * 2048) & 2047;

        this.goblins.push({
            id: this.nextGoblinId++,
            x: start.x,
            y: start.y,
            yaw,
            hp: 9,
            maxHp: 9,
            speed: 1.6,
            waypointIndex: 1,
            state: "walking",
            deathProgress: 0,
            ticksAlive: 0,
        });
    }

    // Determine whether a tile is on the goblin path
    isTileOnPath(tileX: number, tileZ: number): boolean {
        const centerX = tileX + 0.5;
        const centerZ = tileZ + 0.5;

        for (let i = 0; i < LUMBRIDGE_PATH.length - 1; i++) {
            const p1 = LUMBRIDGE_PATH[i];
            const p2 = LUMBRIDGE_PATH[i + 1];
            const dist = distanceToSegment(centerX, centerZ, p1.x, p1.y, p2.x, p2.y);
            if (dist < 1.35) {
                return true;
            }
        }
        return false;
    }

    // Determine whether an archer can be placed on a tile
    canPlaceArcherAt(tileX: number, tileZ: number): boolean {
        // Path is forbidden for towers
        if (this.isTileOnPath(tileX, tileZ)) {
            return false;
        }

        // Cannot place on existing archer
        if (this.archers.some((a) => a.tileX === tileX && a.tileZ === tileZ)) {
            return false;
        }

        // Valid terrain within map bounds
        if (tileX < 3225 || tileX > 3252 || tileZ < 3212 || tileZ > 3235) {
            return false;
        }

        return true;
    }

    placeArcher(tileX: number, tileZ: number): boolean {
        if (!this.canPlaceArcherAt(tileX, tileZ)) {
            return false;
        }

        this.archers.push({
            id: this.nextArcherId++,
            tileX,
            tileZ,
            x: tileX + 0.5,
            z: tileZ + 0.5,
            yaw: 1024, // Face north initially
            range: 7.0,
            attackCooldown: 0.3,
            shootAnimTimer: 0,
        });

        this.audio.play(2707, { volume: 0.3 }); // Placement feedback sound
        this.notifyState();
        return true;
    }

    private handleMouseMove(e: MouseEvent): void {
        const rect = this.renderer.canvas.getBoundingClientRect();
        this.mouseClientX = e.clientX - rect.left;
        this.mouseClientY = e.clientY - rect.top;

        this.updateHoverTile();
    }

    private handleClick(e: MouseEvent): void {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const tile = this.raycastGround(clientX, clientY);
        if (tile) {
            this.placeArcher(tile.tileX, tile.tileZ);
        }
    }

    private updateHoverTile(): void {
        const tile = this.raycastGround(this.mouseClientX, this.mouseClientY);
        if (tile) {
            const valid = this.canPlaceArcherAt(tile.tileX, tile.tileZ);
            this.hoverTile = { x: tile.tileX, z: tile.tileZ, valid };
        } else {
            this.hoverTile = undefined;
        }
    }

    private raycastGround(clientX: number, clientY: number): { tileX: number; tileZ: number } | undefined {
        const width = this.renderer.canvas.clientWidth;
        const height = this.renderer.canvas.clientHeight;
        if (width <= 0 || height <= 0) return undefined;

        const ndcX = (clientX / width) * 2 - 1;
        const ndcY = 1 - (clientY / height) * 2;

        const camera = this.mapViewer.camera;
        if (!camera) return undefined;

        mat4.invert(this.lastInvViewProj, camera.viewProjMatrix);

        const nearVec = vec4.fromValues(ndcX, ndcY, -1, 1);
        vec4.transformMat4(nearVec, nearVec, this.lastInvViewProj);
        const nearX = nearVec[0] / nearVec[3];
        const nearY = nearVec[1] / nearVec[3];
        const nearZ = nearVec[2] / nearVec[3];

        const farVec = vec4.fromValues(ndcX, ndcY, 1, 1);
        vec4.transformMat4(farVec, farVec, this.lastInvViewProj);
        const farX = farVec[0] / farVec[3];
        const farY = farVec[1] / farVec[3];
        const farZ = farVec[2] / farVec[3];

        const dirX = farX - nearX;
        const dirY = farY - nearY;
        const dirZ = farZ - nearZ;

        // Ground in Lumbridge is around y = -0.5 to -1.0
        const groundEstimateY = -0.6;
        if (Math.abs(dirY) < 1e-6) return undefined;

        const t = (groundEstimateY - nearY) / dirY;
        if (t <= 0) return undefined;

        const hitX = nearX + dirX * t;
        const hitZ = nearZ + dirZ * t;

        return {
            tileX: Math.floor(hitX),
            tileZ: Math.floor(hitZ),
        };
    }

    // Game loop update called by GameWebGLRenderer each frame
    update(deltaTimeMs: number, camera: Camera): void {
        const dt = Math.min(deltaTimeMs / 1000, 0.1);
        this.clientTicks += Math.round(dt * 50);

        // Fixed camera over Lumbridge path
        const targetX = 3238.5;
        const targetZ = 3223.5;
        const targetY = -this.grid.getHeight(targetX, targetZ) / 128;
        this.cameraRig.apply(camera, targetX, targetY, targetZ);

        // Wave Spawning
        if (this.waveActive && this.goblinsToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnGoblin();
                this.goblinsToSpawn--;
                this.spawnTimer = 1.4; // 1.4 seconds between goblins
                this.notifyState();
            }
        }

        // Update Goblins
        for (let i = this.goblins.length - 1; i >= 0; i--) {
            const goblin = this.goblins[i];
            goblin.ticksAlive++;

            if (goblin.state === "dying") {
                goblin.deathProgress += dt * 1.5;
                if (goblin.deathProgress >= 1.0) {
                    goblin.state = "dead";
                    this.goblins.splice(i, 1);
                    this.notifyState();
                }
                continue;
            }

            if (goblin.state === "walking") {
                const targetWp = LUMBRIDGE_PATH[goblin.waypointIndex];
                if (!targetWp) {
                    // Goblin reached the castle gate!
                    this.gateHp = Math.max(0, this.gateHp - 10);
                    goblin.state = "dead";
                    this.goblins.splice(i, 1);
                    this.audio.play(469, { volume: 0.8 });
                    this.notifyState();
                    continue;
                }

                const dx = targetWp.x - goblin.x;
                const dy = targetWp.y - goblin.y;
                const dist = Math.hypot(dx, dy);
                const step = goblin.speed * dt;

                if (dist <= step) {
                    goblin.x = targetWp.x;
                    goblin.y = targetWp.y;
                    goblin.waypointIndex++;
                } else {
                    goblin.x += (dx / dist) * step;
                    goblin.y += (dy / dist) * step;
                    goblin.yaw = Math.round((Math.atan2(-dx, -dy) / (2 * Math.PI)) * 2048) & 2047;
                }
            }
        }

        // Check if wave finished
        if (this.waveActive && this.goblinsToSpawn === 0 && this.goblins.length === 0) {
            this.waveActive = false;
            this.waveNumber++;
            this.notifyState();
        }

        // Update Archers
        for (const archer of this.archers) {
            if (archer.attackCooldown > 0) {
                archer.attackCooldown -= dt;
            }
            if (archer.shootAnimTimer > 0) {
                archer.shootAnimTimer -= dt;
            }

            // Find nearest walking goblin in range
            let target: TdGoblin | undefined;
            let minDist = archer.range;

            for (const goblin of this.goblins) {
                if (goblin.state !== "walking") continue;
                const dist = Math.hypot(goblin.x - archer.x, goblin.y - archer.z);
                if (dist < minDist) {
                    minDist = dist;
                    target = goblin;
                }
            }

            if (target) {
                // Rotate archer to face target goblin
                const dx = target.x - archer.x;
                const dz = target.y - archer.z;
                archer.yaw = Math.round((Math.atan2(-dx, -dz) / (2 * Math.PI)) * 2048) & 2047;
                archer.targetGoblinId = target.id;

                // Fire arrow if ready
                if (archer.attackCooldown <= 0) {
                    archer.attackCooldown = 1.1; // attack speed
                    archer.shootAnimTimer = 0.5; // bow release animation duration

                    const archerGround = -this.grid.getHeight(archer.x, archer.z) / 128;
                    const arrowY = archerGround - 1.2;

                    this.arrows.push({
                        id: this.nextArrowId++,
                        startX: archer.x,
                        startY: arrowY,
                        startZ: archer.z,
                        x: archer.x,
                        y: arrowY,
                        z: archer.z,
                        targetGoblinId: target.id,
                        speed: 16.0,
                    });

                    this.audio.play(2707, { volume: 0.7 }); // Bow firing sound!
                }
            }
        }

        // Update Arrows
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const arrow = this.arrows[i];
            const target = this.goblins.find((g) => g.id === arrow.targetGoblinId);

            if (!target || target.state !== "walking") {
                this.arrows.splice(i, 1);
                continue;
            }

            const targetGround = -this.grid.getHeight(target.x, target.y) / 128;
            const targetHeight = targetGround - 0.7;

            const dx = target.x - arrow.x;
            const dy = targetHeight - arrow.y;
            const dz = target.y - arrow.z;
            const dist = Math.hypot(dx, dy, dz);
            const step = arrow.speed * dt;

            if (dist <= step || dist < 0.4) {
                // One-Hit Kill!
                target.hp = 0;
                target.state = "dying";
                target.deathProgress = 0;

                // Authentic goblin hit & death sound
                this.audio.play(471, { volume: 0.8 });

                // Red OSRS Hitsplat with 99 fatal damage
                this.hitsplats.push({
                    id: this.nextHitsplatId++,
                    x: target.x,
                    z: target.y,
                    amount: 99,
                    createdTime: performance.now(),
                });

                this.arrows.splice(i, 1);
                this.notifyState();
            } else {
                arrow.x += (dx / dist) * step;
                arrow.y += (dy / dist) * step;
                arrow.z += (dz / dist) * step;
            }
        }

        // Prune hitsplats older than 1.2 seconds
        const now = performance.now();
        this.hitsplats = this.hitsplats.filter((h) => now - h.createdTime < 1200);
    }

    // Render 3D Actors (Goblins, Archers, Projectiles)
    submitActors(actors: ActorRenderer, _camera: Camera): void {
        const goblinDef = getEnemy("goblin");
        const goblinModel = this.assets.get(getEnemyModelKey(goblinDef, 0));

        // Draw Goblins
        if (goblinModel) {
            for (const goblin of this.goblins) {
                let anim: ActorAnim;
                let frame = 0;

                if (goblin.state === "dying") {
                    anim = goblinModel.getAnim(goblinDef.deathSeq);
                    frame = Math.min(
                        Math.floor(goblin.deathProgress * anim.frameCount),
                        anim.frameCount - 1,
                    );
                } else {
                    anim = goblinModel.getAnim(goblinDef.walkSeq);
                    frame = anim.getFrame(goblin.ticksAlive);
                }

                const height = -this.grid.getHeight(goblin.x, goblin.y) / 128;
                actors.draw(goblinModel, anim, frame, goblin.x, height, goblin.y, goblin.yaw, {
                    scale: 1.2,
                });
            }
        }

        // Draw Archers
        const playerBake = this.assets.getPlayerBake(0);
        const archerModel = playerBake?.model;

        if (archerModel) {
            const idleAnim = archerModel.getAnim(playerBake.stance.idle);
            const shootAnim = archerModel.getAnim(426); // shortbow attack

            for (const archer of this.archers) {
                const height = -this.grid.getHeight(archer.x, archer.z) / 128;
                const isShooting = archer.shootAnimTimer > 0;
                const anim = isShooting && shootAnim ? shootAnim : idleAnim;
                const frame = anim.getFrame(this.clientTicks);

                actors.draw(archerModel, anim, frame, archer.x, height, archer.z, archer.yaw, {
                    scale: 1.0,
                });
            }
        }

        // Draw 3D Flying Arrows
        const arrowModel = this.assets.get("spot:10"); // Bronze arrow spotanim
        if (arrowModel) {
            const arrowAnim = arrowModel.anims[0];
            for (const arrow of this.arrows) {
                const target = this.goblins.find((g) => g.id === arrow.targetGoblinId);
                const yaw = target
                    ? Math.round(
                          (Math.atan2(-(target.x - arrow.x), -(target.y - arrow.z)) /
                              (2 * Math.PI)) *
                              2048,
                      ) & 2047
                    : 0;

                actors.draw(arrowModel, arrowAnim, 0, arrow.x, arrow.y, arrow.z, yaw, {
                    scale: 1.3,
                });
            }
        }
    }

    // 2D Overlay (Hitsplats, Health bars, Tile Hover Indicator)
    drawOverlay(camera: Camera): void {
        this.overlay.begin(camera);
        const ctx = this.overlay.ctx;
        const now = performance.now();

        // 1. Draw Hover Tile Cursor on Ground
        if (this.hoverTile) {
            const { x, z, valid } = this.hoverTile;
            const h = -this.grid.getHeight(x + 0.5, z + 0.5) / 128;

            const p0 = this.overlay.project(x, h, z, { x: 0, y: 0, visible: false });
            const p1 = this.overlay.project(x + 1, h, z, { x: 0, y: 0, visible: false });
            const p2 = this.overlay.project(x + 1, h, z + 1, { x: 0, y: 0, visible: false });
            const p3 = this.overlay.project(x, h, z + 1, { x: 0, y: 0, visible: false });

            if (p0.visible && p1.visible && p2.visible && p3.visible) {
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.closePath();

                ctx.lineWidth = 2.5;
                if (valid) {
                    ctx.fillStyle = "rgba(40, 220, 80, 0.35)";
                    ctx.strokeStyle = "#44ff66";
                } else {
                    ctx.fillStyle = "rgba(220, 40, 40, 0.4)";
                    ctx.strokeStyle = "#ff4444";
                }
                ctx.fill();
                ctx.stroke();
            }
        }

        // 2. Draw Archer Range Indicators on hover
        if (this.hoverTile?.valid) {
            const centerX = this.hoverTile.x + 0.5;
            const centerZ = this.hoverTile.z + 0.5;
            const h = -this.grid.getHeight(centerX, centerZ) / 128;
            const p = this.overlay.project(centerX, h, centerZ, { x: 0, y: 0, visible: false });

            if (p.visible) {
                ctx.beginPath();
                // Screen radius estimate
                const edgeP = this.overlay.project(centerX + 7.0, h, centerZ, {
                    x: 0,
                    y: 0,
                    visible: false,
                });
                const radius = Math.abs(edgeP.x - p.x);
                ctx.ellipse(p.x, p.y, radius, radius * 0.7, 0, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 3. Draw Red Hitsplats on Goblin Death
        const damageSprite = this.assets.getSprite(HITSPLAT_SPRITES.damage);
        for (const hitsplat of this.hitsplats) {
            const progress = (now - hitsplat.createdTime) / 1200;
            const h = -this.grid.getHeight(hitsplat.x, hitsplat.z) / 128 - 1.2 - progress * 0.4;
            const p = this.overlay.project(hitsplat.x, h, hitsplat.z, this.screen);

            if (p.visible) {
                const spriteW = (damageSprite?.width ?? 28) * 1.2;
                const spriteH = (damageSprite?.height ?? 26) * 1.2;

                if (damageSprite) {
                    ctx.drawImage(damageSprite, p.x - spriteW / 2, p.y - spriteH / 2, spriteW, spriteH);
                } else {
                    ctx.fillStyle = "#a81313";
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.font = "bold 15px 'OSRS Bold', Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#000000";
                ctx.fillText(String(hitsplat.amount), p.x + 1, p.y + 1);
                ctx.fillStyle = "#ffffff";
                ctx.fillText(String(hitsplat.amount), p.x, p.y);
            }
        }

        // 4. Draw Goblin Health Bars
        for (const goblin of this.goblins) {
            if (goblin.state !== "walking") continue;
            const h = -this.grid.getHeight(goblin.x, goblin.y) / 128 - 1.1;
            const p = this.overlay.project(goblin.x, h, goblin.y, this.screen);

            if (p.visible) {
                const barWidth = 32;
                const barHeight = 5;
                const left = p.x - barWidth / 2;
                const top = p.y - 10;

                ctx.fillStyle = "#000000";
                ctx.fillRect(left - 1, top - 1, barWidth + 2, barHeight + 2);

                ctx.fillStyle = "#a81313";
                ctx.fillRect(left, top, barWidth, barHeight);

                const fraction = Math.max(0, goblin.hp / goblin.maxHp);
                ctx.fillStyle = "#22bb22";
                ctx.fillRect(left, top, barWidth * fraction, barHeight);
            }
        }
    }

    dispose(): void {
        window.removeEventListener("mousemove", this.boundOnMouseMove);
        this.renderer.canvas.removeEventListener("click", this.boundOnClick);
    }
}

// Distance from point (px, py) to segment (x1, y1) -> (x2, y2)
function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(px - projX, py - projY);
}
