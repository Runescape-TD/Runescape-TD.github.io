import { mat4, vec4 } from "gl-matrix";
import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { ActorAnim, ActorModel, ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
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

// Solid dirt road waypoints right outside Lumbridge castle towards the gate
// Starting after the bridge on open ground to ensure goblins never clip under the bridge deck
export const LUMBRIDGE_PATH: Waypoint[] = [
    { x: 3240.5, y: 3226.0 }, // Solid road starting off bridge
    { x: 3238.0, y: 3224.5 }, // Road bending towards castle
    { x: 3235.5, y: 3221.5 }, // Road leading to gate
    { x: 3232.0, y: 3220.5 }, // Castle gate archway
    { x: 3228.0, y: 3220.0 }, // Courtyard
];

export interface TdGoblin {
    id: number;
    x: number;
    y: number;
    yaw: number;
    hp: number;
    maxHp: number;
    speed: number;
    waypointIndex: number;
    state: "walking" | "dying" | "dead";
    deathProgress: number;
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
    attackCooldown: number;
    shootAnimTimer: number;
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
    createdTime: number;
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
    // Ghost placement state
    isPlacingArcher: boolean;
    ghostTileX: number;
    ghostTileZ: number;
    isGhostValid: boolean;
    ghostScreenPos: { x: number; y: number; visible: boolean };
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
            arena,
        );

        const audio = new GameAudio();
        const soundsPromise = audio.load(workerPool, [469, 471, 472, 2707, 711, 713]);

        const actors = await renderer.getActorRenderer();
        const assets = new GameAssets(workerPool, renderer, actors);
        const spritesPromise = assets.loadSprites();

        await assets.loadBase();

        // Bake goblin
        const goblinDef = getEnemy("goblin");
        await assets.loadEnemies([goblinDef]);

        // Bake Archer with Shortbow and ranger leather armor
        const archerAppearance = createAppearance({
            [EquipSlot.HEAD]: 1169, // Coif
            [EquipSlot.TORSO]: 1129, // Leather body
            [EquipSlot.LEGS]: 1095, // Leather chaps
            [EquipSlot.HANDS]: 1063, // Leather vambraces
            [EquipSlot.WEAPON]: 841, // Shortbow
        });
        await assets.setPlayerAppearance(archerAppearance, 0, [426]);

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
    gold = Infinity;

    // Ghost Placement State
    isPlacingArcher = false;
    ghostTileX = 3236;
    ghostTileZ = 3224;
    ghostScreenPos = { x: 0, y: 0, visible: false };
    isDraggingGhost = false;

    private nextGoblinId = 1;
    private nextArcherId = 1;
    private nextArrowId = 1;
    private nextHitsplatId = 1;
    private clientTicks = 0;
    private lastInvViewProj = mat4.create();

    private boundOnPointerMove: (e: PointerEvent) => void;
    private boundOnPointerDown: (e: PointerEvent) => void;
    private boundOnPointerUp: (e: PointerEvent) => void;

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

        // Position camera to look directly at the Lumbridge road
        this.cameraRig.pitch = -380;
        this.cameraRig.yaw = 0;
        this.cameraRig.distance = 21;

        renderer.setPlane(grid.plane);
        renderer.setSmoothTerrain(false);
        renderer.setLighting(false);
        renderer.setBrightness(1.1);

        this.boundOnPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
        this.boundOnPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
        this.boundOnPointerUp = (e: PointerEvent) => this.handlePointerUp(e);

        const canvas = renderer.canvas;
        canvas.addEventListener("pointermove", this.boundOnPointerMove);
        canvas.addEventListener("pointerdown", this.boundOnPointerDown);
        window.addEventListener("pointerup", this.boundOnPointerUp);

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
            isPlacingArcher: this.isPlacingArcher,
            ghostTileX: this.ghostTileX,
            ghostTileZ: this.ghostTileZ,
            isGhostValid: this.canPlaceArcherAt(this.ghostTileX, this.ghostTileZ),
            ghostScreenPos: { ...this.ghostScreenPos },
        });
    }

    startWave(): void {
        if (this.waveActive) return;
        this.waveActive = true;
        this.goblinsToSpawn = 8;
        this.spawnTimer = 0;
        this.notifyState();
    }

    startPlacingArcher(): void {
        this.isPlacingArcher = true;
        // Default ghost position in center view
        this.ghostTileX = 3236;
        this.ghostTileZ = 3224;
        this.audio.play(2707, { volume: 0.25 });
        this.notifyState();
    }

    cancelPlacingArcher(): void {
        this.isPlacingArcher = false;
        this.isDraggingGhost = false;
        this.notifyState();
    }

    confirmPlacingArcher(): boolean {
        if (!this.canPlaceArcherAt(this.ghostTileX, this.ghostTileZ)) {
            return false;
        }

        this.archers.push({
            id: this.nextArcherId++,
            tileX: this.ghostTileX,
            tileZ: this.ghostTileZ,
            x: this.ghostTileX + 0.5,
            z: this.ghostTileZ + 0.5,
            yaw: 1024,
            range: 7.0,
            attackCooldown: 0.3,
            shootAnimTimer: 0,
        });

        this.isPlacingArcher = false;
        this.isDraggingGhost = false;
        this.audio.play(2707, { volume: 0.6 });
        this.notifyState();
        return true;
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
            speed: 1.5,
            waypointIndex: 1,
            state: "walking",
            deathProgress: 0,
            ticksAlive: 0,
        });
    }

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

    canPlaceArcherAt(tileX: number, tileZ: number): boolean {
        if (this.isTileOnPath(tileX, tileZ)) {
            return false;
        }
        if (this.archers.some((a) => a.tileX === tileX && a.tileZ === tileZ)) {
            return false;
        }
        if (tileX < 3225 || tileX > 3248 || tileZ < 3214 || tileZ > 3232) {
            return false;
        }
        return true;
    }

    private handlePointerDown(e: PointerEvent): void {
        if (!this.isPlacingArcher) return;
        this.isDraggingGhost = true;
        this.updateGhostFromPointer(e);
    }

    private handlePointerMove(e: PointerEvent): void {
        if (this.isPlacingArcher) {
            this.updateGhostFromPointer(e);
        }
    }

    private handlePointerUp(_e: PointerEvent): void {
        this.isDraggingGhost = false;
    }

    private updateGhostFromPointer(e: PointerEvent): void {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const tile = this.raycastGround(clientX, clientY);
        if (tile) {
            if (this.ghostTileX !== tile.tileX || this.ghostTileZ !== tile.tileZ) {
                this.ghostTileX = tile.tileX;
                this.ghostTileZ = tile.tileZ;
                this.notifyState();
            }
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

        const groundEstimateY = -0.65;
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

    update(deltaTimeMs: number, camera: Camera): void {
        const dt = Math.min(deltaTimeMs / 1000, 0.1);
        this.clientTicks += Math.round(dt * 50);

        // Fixed camera over Lumbridge path
        const targetX = 3236.5;
        const targetZ = 3223.5;
        const targetY = -this.grid.getHeight(targetX, targetZ) / 128;
        this.cameraRig.apply(camera, targetX, targetY, targetZ);

        // Wave Spawning
        if (this.waveActive && this.goblinsToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnGoblin();
                this.goblinsToSpawn--;
                this.spawnTimer = 1.5;
                this.notifyState();
            }
        }

        // Update Goblins
        for (let i = this.goblins.length - 1; i >= 0; i--) {
            const goblin = this.goblins[i];
            goblin.ticksAlive++;

            if (goblin.state === "dying") {
                goblin.deathProgress += dt * 1.6;
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
                    // Goblin reached castle courtyard
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
            if (archer.attackCooldown > 0) archer.attackCooldown -= dt;
            if (archer.shootAnimTimer > 0) archer.shootAnimTimer -= dt;

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
                const dx = target.x - archer.x;
                const dz = target.y - archer.z;
                archer.yaw = Math.round((Math.atan2(-dx, -dz) / (2 * Math.PI)) * 2048) & 2047;
                archer.targetGoblinId = target.id;

                if (archer.attackCooldown <= 0) {
                    archer.attackCooldown = 1.1;
                    archer.shootAnimTimer = 0.5;

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

                    this.audio.play(2707, { volume: 0.7 });
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
                target.hp = 0;
                target.state = "dying";
                target.deathProgress = 0;

                this.audio.play(471, { volume: 0.8 });

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

        const now = performance.now();
        this.hitsplats = this.hitsplats.filter((h) => now - h.createdTime < 1200);

        // Update ghost screen position for floating buttons
        if (this.isPlacingArcher) {
            const gh = -this.grid.getHeight(this.ghostTileX + 0.5, this.ghostTileZ + 0.5) / 128;
            this.overlay.project(this.ghostTileX + 0.5, gh, this.ghostTileZ + 0.5, this.screen);
            this.ghostScreenPos.x = this.screen.x;
            this.ghostScreenPos.y = this.screen.y;
            this.ghostScreenPos.visible = this.screen.visible;
        }
    }

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
                    scale: 1.5,
                });
            }
        }

        // Draw Placed Archers
        const playerBake = this.assets.getPlayerBake(0);
        const archerModel = playerBake?.model;

        if (archerModel) {
            const idleAnim = archerModel.getAnim(playerBake.stance.idle);
            const shootAnim = archerModel.getAnim(426);

            for (const archer of this.archers) {
                const height = -this.grid.getHeight(archer.x, archer.z) / 128;
                const isShooting = archer.shootAnimTimer > 0;
                const anim = isShooting && shootAnim ? shootAnim : idleAnim;
                const frame = anim.getFrame(this.clientTicks);

                actors.draw(archerModel, anim, frame, archer.x, height, archer.z, archer.yaw, {
                    scale: 1.0,
                });
            }

            // Draw Ghost Archer if placing
            if (this.isPlacingArcher) {
                const ghostX = this.ghostTileX + 0.5;
                const ghostZ = this.ghostTileZ + 0.5;
                const ghostH = -this.grid.getHeight(ghostX, ghostZ) / 128;
                const isValid = this.canPlaceArcherAt(this.ghostTileX, this.ghostTileZ);
                const tint = isValid ? 0x44ff66 : 0xff3333;
                const frame = idleAnim.getFrame(this.clientTicks);

                actors.draw(archerModel, idleAnim, frame, ghostX, ghostH, ghostZ, 1024, {
                    scale: 1.0,
                    tint,
                    alpha: 0.8,
                    flash: -0.4,
                });
            }
        }

        // Draw Arrows
        const arrowModel = this.assets.get("spot:10");
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
                    scale: 1.4,
                });
            }
        }
    }

    drawOverlay(camera: Camera): void {
        this.overlay.begin(camera);
        const ctx = this.overlay.ctx;
        const now = performance.now();

        // 1. Draw Range Circle around Ghost Archer
        if (this.isPlacingArcher) {
            const centerX = this.ghostTileX + 0.5;
            const centerZ = this.ghostTileZ + 0.5;
            const h = -this.grid.getHeight(centerX, centerZ) / 128;
            const p = this.overlay.project(centerX, h, centerZ, { x: 0, y: 0, visible: false });

            if (p.visible) {
                const edgeP = this.overlay.project(centerX + 7.0, h, centerZ, {
                    x: 0,
                    y: 0,
                    visible: false,
                });
                const radius = Math.abs(edgeP.x - p.x);
                const isValid = this.canPlaceArcherAt(this.ghostTileX, this.ghostTileZ);

                ctx.beginPath();
                ctx.ellipse(p.x, p.y, radius, radius * 0.7, 0, 0, Math.PI * 2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = isValid ? "rgba(68, 255, 102, 0.75)" : "rgba(255, 68, 68, 0.75)";
                ctx.setLineDash([8, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 2. Draw Hitsplats
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

        // 3. Draw Goblin Health Bars
        for (const goblin of this.goblins) {
            if (goblin.state !== "walking") continue;
            const h = -this.grid.getHeight(goblin.x, goblin.y) / 128 - 1.2;
            const p = this.overlay.project(goblin.x, h, goblin.y, this.screen);

            if (p.visible) {
                const barWidth = 32;
                const barHeight = 5;
                const left = p.x - barWidth / 2;
                const top = p.y - 12;

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
        const canvas = this.renderer.canvas;
        canvas.removeEventListener("pointermove", this.boundOnPointerMove);
        canvas.removeEventListener("pointerdown", this.boundOnPointerDown);
        window.removeEventListener("pointerup", this.boundOnPointerUp);
    }
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return Math.hypot(px - projX, py - projY);
}
