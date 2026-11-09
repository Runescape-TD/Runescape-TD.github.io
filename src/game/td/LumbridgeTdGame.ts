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

// Full authentic path: starts on the east bank of River Lum, crosses the bridge,
// reaches the T-junction, turns south down the road, and enters through the castle gate
export const LUMBRIDGE_PATH: Waypoint[] = [
    { x: 3252.0, y: 3228.0 }, // East river bank (entering bridge)
    { x: 3246.0, y: 3228.0 }, // Middle of stone bridge
    { x: 3241.0, y: 3228.0 }, // Coming off bridge (west side)
    { x: 3236.5, y: 3228.0 }, // T-junction on dirt road
    { x: 3236.0, y: 3223.5 }, // Road heading south past castle tower
    { x: 3234.0, y: 3221.5 }, // Turn towards castle entrance
    { x: 3230.5, y: 3221.0 }, // Through castle gate archway
    { x: 3225.5, y: 3220.5 }, // Inside castle courtyard
];

export type DefenderType = "archer" | "wizard";

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

export interface TdDefender {
    id: number;
    type: DefenderType;
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

export interface TdProjectile {
    id: number;
    kind: "arrow" | "fireball";
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
    defendersCount: number;
    // Placement state
    isPlacing: boolean;
    placingType: DefenderType;
    ghostTileX: number;
    ghostTileZ: number;
    isGhostValid: boolean;
    ghostScreenPos: { x: number; y: number; visible: boolean };
    // Selected placed defender
    selectedDefenderId?: number;
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
            { behind: 50, around: 40 },
        );

        const workerPool = mapViewer.workerPool;
        const regionPromise = workerPool.queueLoad<RegionDataInput, RegionData, RegionDataLoader>(
            new RegionDataLoader(),
            arena,
        );

        const audio = new GameAudio();
        // 469 (goblin attack), 471 (goblin death), 472 (goblin hit), 2707 (bow shot), 160 (fire strike cast), 161 (impact)
        const soundsPromise = audio.load(workerPool, [469, 471, 472, 2707, 160, 161, 711, 713]);

        const actors = await renderer.getActorRenderer();
        const assets = new GameAssets(workerPool, renderer, actors);
        const spritesPromise = assets.loadSprites();

        await assets.loadBase();

        // Bake goblin
        const goblinDef = getEnemy("goblin");
        await assets.loadEnemies([goblinDef]);

        // Slot 0: Archer (Shortbow + Leather gear)
        const archerAppearance = createAppearance({
            [EquipSlot.HEAD]: 1169, // Coif
            [EquipSlot.TORSO]: 1129, // Leather body
            [EquipSlot.LEGS]: 1095, // Leather chaps
            [EquipSlot.HANDS]: 1063, // Leather vambraces
            [EquipSlot.WEAPON]: 841, // Shortbow
        });
        await assets.setPlayerAppearance(archerAppearance, 0, [426]);

        // Slot 1: Wizard (Wizard hat + Blue/black robe + Staff of fire)
        const wizardAppearance = createAppearance({
            [EquipSlot.HEAD]: 1017, // Wizard hat
            [EquipSlot.TORSO]: 577, // Wizard robe top
            [EquipSlot.LEGS]: 1011, // Robe bottoms
            [EquipSlot.CAPE]: 1021, // Cape
            [EquipSlot.WEAPON]: 1387, // Staff of fire
        });
        await assets.setPlayerAppearance(wizardAppearance, 1, [711]);

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
    private readonly screenHelper: ScreenPoint = { x: 0, y: 0, visible: false };
    private readonly tempVec = vec4.create();

    // Game Entities
    goblins: TdGoblin[] = [];
    defenders: TdDefender[] = [];
    projectiles: TdProjectile[] = [];
    hitsplats: TdHitsplat[] = [];

    // Wave Management
    waveNumber = 1;
    waveActive = false;
    spawnTimer = 0;
    goblinsToSpawn = 0;
    gateHp = 100;
    maxGateHp = 100;
    gold = Infinity;

    // Placement State
    isPlacing = false;
    placingType: DefenderType = "archer";
    ghostTileX = 3237;
    ghostTileZ = 3225;
    ghostScreenPos = { x: 0, y: 0, visible: false };
    selectedDefenderId?: number;

    private nextGoblinId = 1;
    private nextDefenderId = 1;
    private nextProjectileId = 1;
    private nextHitsplatId = 1;
    private clientTicks = 0;
    private lastInvViewProj = mat4.create();

    private boundOnPointerMove: (e: PointerEvent) => void;
    private boundOnPointerDown: (e: PointerEvent) => void;

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

        // Zoomed out camera with steeper bird's-eye pitch to view full battlefield comfortably
        this.cameraRig.pitch = -490;
        this.cameraRig.yaw = 0;
        this.cameraRig.distance = 38;

        renderer.setPlane(grid.plane);
        renderer.setSmoothTerrain(false);
        renderer.setLighting(false);
        renderer.setBrightness(1.1);

        this.boundOnPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
        this.boundOnPointerDown = (e: PointerEvent) => this.handlePointerDown(e);

        const canvas = renderer.canvas;
        canvas.addEventListener("pointermove", this.boundOnPointerMove);
        canvas.addEventListener("pointerdown", this.boundOnPointerDown);

        this.updateGhostScreenPos();
        this.notifyState();
    }

    ground(x: number, z: number): number {
        return this.grid.getHeight(x, z) / 128;
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
            defendersCount: this.defenders.length,
            isPlacing: this.isPlacing,
            placingType: this.placingType,
            ghostTileX: this.ghostTileX,
            ghostTileZ: this.ghostTileZ,
            isGhostValid: this.canPlaceDefenderAt(this.ghostTileX, this.ghostTileZ),
            ghostScreenPos: { ...this.ghostScreenPos },
            selectedDefenderId: this.selectedDefenderId,
        });
    }

    startWave(): void {
        if (this.waveActive) return;
        this.waveActive = true;
        this.goblinsToSpawn = 10;
        this.spawnTimer = 0;
        this.notifyState();
    }

    startPlacing(type: DefenderType): void {
        this.isPlacing = true;
        this.placingType = type;
        this.selectedDefenderId = undefined;

        // Position in the center of the camera view
        const centerTile = this.raycastGround(
            this.renderer.canvas.clientWidth / 2,
            this.renderer.canvas.clientHeight / 2,
        );
        if (centerTile && centerTile.tileX >= 3224 && centerTile.tileX <= 3252) {
            this.ghostTileX = centerTile.tileX;
            this.ghostTileZ = centerTile.tileZ;
        } else {
            this.ghostTileX = 3237;
            this.ghostTileZ = 3225;
        }

        this.audio.play(type === "archer" ? 2707 : 160, { volume: 0.25 });
        this.updateGhostScreenPos();
        this.notifyState();
    }

    cancelPlacing(): void {
        this.isPlacing = false;
        this.notifyState();
    }

    confirmPlacing(): boolean {
        if (!this.canPlaceDefenderAt(this.ghostTileX, this.ghostTileZ)) {
            return false;
        }

        const isArcher = this.placingType === "archer";
        this.defenders.push({
            id: this.nextDefenderId++,
            type: this.placingType,
            tileX: this.ghostTileX,
            tileZ: this.ghostTileZ,
            x: this.ghostTileX + 0.5,
            z: this.ghostTileZ + 0.5,
            yaw: 1024,
            range: isArcher ? 7.0 : 6.5,
            attackCooldown: 0.3,
            shootAnimTimer: 0,
        });

        this.isPlacing = false;
        this.audio.play(isArcher ? 2707 : 160, { volume: 0.6 });
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

    canPlaceDefenderAt(tileX: number, tileZ: number): boolean {
        if (this.isTileOnPath(tileX, tileZ)) {
            return false;
        }
        // Prevent placing inside River Lum water (except path across bridge)
        if (tileX >= 3242 && tileX <= 3248) {
            return false;
        }
        if (this.defenders.some((d) => d.tileX === tileX && d.tileZ === tileZ)) {
            return false;
        }
        if (tileX < 3224 || tileX > 3252 || tileZ < 3214 || tileZ > 3236) {
            return false;
        }
        return true;
    }

    private handlePointerDown(e: PointerEvent): void {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const tile = this.raycastGround(clientX, clientY);

        if (this.isPlacing) {
            if (tile) {
                this.ghostTileX = tile.tileX;
                this.ghostTileZ = tile.tileZ;
                this.updateGhostScreenPos();
                this.notifyState();
            }
        } else {
            // Check if user tapped an existing defender to select it and see range
            if (tile) {
                const clickedDefender = this.defenders.find(
                    (d) => Math.hypot(d.x - (tile.tileX + 0.5), d.z - (tile.tileZ + 0.5)) < 1.3,
                );
                this.selectedDefenderId = clickedDefender ? clickedDefender.id : undefined;
                this.notifyState();
            }
        }
    }

    private handlePointerMove(e: PointerEvent): void {
        if (!this.isPlacing) return;
        if (e.buttons > 0 || e.pointerType === "touch") {
            const rect = this.renderer.canvas.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;
            const tile = this.raycastGround(clientX, clientY);
            if (tile) {
                if (this.ghostTileX !== tile.tileX || this.ghostTileZ !== tile.tileZ) {
                    this.ghostTileX = tile.tileX;
                    this.ghostTileZ = tile.tileZ;
                    this.updateGhostScreenPos();
                    this.notifyState();
                }
            }
        }
    }

    updateGhostScreenPos(camera?: Camera): void {
        const cam = camera ?? this.mapViewer.camera;
        if (!cam) return;

        const wx = this.ghostTileX + 0.5;
        const wz = this.ghostTileZ + 0.5;
        const wy = this.ground(wx, wz);

        vec4.set(this.tempVec, wx, wy, wz, 1);
        vec4.transformMat4(this.tempVec, this.tempVec, cam.viewProjMatrix);
        const w = this.tempVec[3];

        if (w <= 0) {
            this.ghostScreenPos.visible = false;
            return;
        }

        const rect = this.renderer.canvas.getBoundingClientRect();
        const ndcX = this.tempVec[0] / w;
        const ndcY = this.tempVec[1] / w;

        this.ghostScreenPos.x = rect.left + ((ndcX + 1) / 2) * rect.width;
        this.ghostScreenPos.y = rect.top + ((1 - ndcY) / 2) * rect.height;
        this.ghostScreenPos.visible = true;

        // Directly sync DOM floating buttons element if mounted for zero-lag tracking
        const el = document.getElementById("td-ghost-actions");
        if (el) {
            el.style.left = `${Math.round(this.ghostScreenPos.x)}px`;
            el.style.top = `${Math.round(this.ghostScreenPos.y + 20)}px`;
            el.style.display = this.ghostScreenPos.visible ? "flex" : "none";
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

        const groundY = this.ground(3237.0, 3224.0);
        if (Math.abs(dirY) < 1e-6) return undefined;

        const t = (groundY - nearY) / dirY;
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

        // Zoomed-out high-angle view over Lumbridge
        const targetX = 3238.0;
        const targetZ = 3226.0;
        const targetY = this.ground(targetX, targetZ);
        this.cameraRig.apply(camera, targetX, targetY, targetZ);

        // Wave Spawning
        if (this.waveActive && this.goblinsToSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnGoblin();
                this.goblinsToSpawn--;
                this.spawnTimer = 1.4;
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

        // Update Defenders (Archers and Wizards)
        for (const defender of this.defenders) {
            if (defender.attackCooldown > 0) defender.attackCooldown -= dt;
            if (defender.shootAnimTimer > 0) defender.shootAnimTimer -= dt;

            let target: TdGoblin | undefined;
            let minDist = defender.range;

            for (const goblin of this.goblins) {
                if (goblin.state !== "walking") continue;
                const dist = Math.hypot(goblin.x - defender.x, goblin.y - defender.z);
                if (dist < minDist) {
                    minDist = dist;
                    target = goblin;
                }
            }

            if (target) {
                const dx = target.x - defender.x;
                const dz = target.y - defender.z;
                defender.yaw = Math.round((Math.atan2(-dx, -dz) / (2 * Math.PI)) * 2048) & 2047;
                defender.targetGoblinId = target.id;

                if (defender.attackCooldown <= 0) {
                    const isArcher = defender.type === "archer";
                    defender.attackCooldown = isArcher ? 1.1 : 1.3;
                    defender.shootAnimTimer = 0.5;

                    const spawnY = this.ground(defender.x, defender.z) - 1.2;

                    this.projectiles.push({
                        id: this.nextProjectileId++,
                        kind: isArcher ? "arrow" : "fireball",
                        startX: defender.x,
                        startY: spawnY,
                        startZ: defender.z,
                        x: defender.x,
                        y: spawnY,
                        z: defender.z,
                        targetGoblinId: target.id,
                        speed: isArcher ? 16.0 : 12.0,
                    });

                    this.audio.play(isArcher ? 2707 : 160, { volume: 0.7 });
                }
            }
        }

        // Update Projectiles (Arrows and Fireballs)
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const target = this.goblins.find((g) => g.id === proj.targetGoblinId);

            if (!target || target.state !== "walking") {
                this.projectiles.splice(i, 1);
                continue;
            }

            const targetHeight = this.ground(target.x, target.y) - 0.7;
            const dx = target.x - proj.x;
            const dy = targetHeight - proj.y;
            const dz = target.y - proj.z;
            const dist = Math.hypot(dx, dy, dz);
            const step = proj.speed * dt;

            if (dist <= step || dist < 0.4) {
                target.hp = 0;
                target.state = "dying";
                target.deathProgress = 0;

                this.audio.play(proj.kind === "arrow" ? 471 : 161, { volume: 0.8 });

                this.hitsplats.push({
                    id: this.nextHitsplatId++,
                    x: target.x,
                    z: target.y,
                    amount: 99,
                    createdTime: performance.now(),
                });

                this.projectiles.splice(i, 1);
                this.notifyState();
            } else {
                proj.x += (dx / dist) * step;
                proj.y += (dy / dist) * step;
                proj.z += (dz / dist) * step;
            }
        }

        const now = performance.now();
        this.hitsplats = this.hitsplats.filter((h) => now - h.createdTime < 1200);

        // Update ghost screen position
        if (this.isPlacing) {
            this.updateGhostScreenPos(camera);
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

                const height = this.ground(goblin.x, goblin.y);
                actors.draw(goblinModel, anim, frame, goblin.x, height, goblin.y, goblin.yaw, {
                    scale: 1.5,
                });
            }
        }

        // Draw Placed Defenders (Archers and Wizards)
        const archerBake = this.assets.getPlayerBake(0);
        const wizardBake = this.assets.getPlayerBake(1);

        for (const defender of this.defenders) {
            const isArcher = defender.type === "archer";
            const bake = isArcher ? archerBake : wizardBake;
            const model = bake?.model;

            if (model) {
                const idleAnim = model.getAnim(bake.stance.idle);
                const attackAnim = model.getAnim(isArcher ? 426 : 711);
                const isShooting = defender.shootAnimTimer > 0;
                const anim = isShooting && attackAnim ? attackAnim : idleAnim;
                const frame = anim.getFrame(this.clientTicks);
                const height = this.ground(defender.x, defender.z);

                actors.draw(model, anim, frame, defender.x, height, defender.z, defender.yaw, {
                    scale: 1.0,
                });
            }
        }

        // Draw Ghost Defender if placing
        if (this.isPlacing) {
            const isArcher = this.placingType === "archer";
            const bake = isArcher ? archerBake : wizardBake;
            const model = bake?.model;

            if (model) {
                const idleAnim = model.getAnim(bake.stance.idle);
                const ghostX = this.ghostTileX + 0.5;
                const ghostZ = this.ghostTileZ + 0.5;
                const ghostH = this.ground(ghostX, ghostZ);
                const isValid = this.canPlaceDefenderAt(this.ghostTileX, this.ghostTileZ);
                const tint = isValid ? 0x44ff66 : 0xff3333;
                const frame = idleAnim.getFrame(this.clientTicks);

                actors.draw(model, idleAnim, frame, ghostX, ghostH, ghostZ, 1024, {
                    scale: 1.0,
                    tint,
                    alpha: 0.8,
                    flash: -0.4,
                });
            }
        }

        // Draw Projectiles
        const arrowModel = this.assets.get("spot:10");
        const fireModel = this.assets.get("spot:100");

        for (const proj of this.projectiles) {
            const model = proj.kind === "arrow" ? arrowModel : fireModel;
            if (model) {
                const anim = model.anims[0];
                const target = this.goblins.find((g) => g.id === proj.targetGoblinId);
                const yaw = target
                    ? Math.round(
                          (Math.atan2(-(target.x - proj.x), -(target.y - proj.z)) /
                              (2 * Math.PI)) *
                              2048,
                      ) & 2047
                    : 0;

                actors.draw(model, anim, 0, proj.x, proj.y, proj.z, yaw, {
                    scale: proj.kind === "arrow" ? 1.4 : 1.8,
                });
            }
        }
    }

    drawOverlay(camera: Camera): void {
        this.overlay.begin(camera);
        const ctx = this.overlay.ctx;
        const now = performance.now();

        // 1. Draw Range Circle for Selected Placed Defender
        if (this.selectedDefenderId !== undefined) {
            const selected = this.defenders.find((d) => d.id === this.selectedDefenderId);
            if (selected) {
                this.drawPreciseRangeCircle(selected.x, selected.z, selected.range, "rgba(255, 204, 0, 0.85)");
            }
        }

        // 2. Draw Range Circle around Ghost Defender during placement
        if (this.isPlacing) {
            const range = this.placingType === "archer" ? 7.0 : 6.5;
            const isValid = this.canPlaceDefenderAt(this.ghostTileX, this.ghostTileZ);
            const color = isValid ? "rgba(68, 255, 102, 0.85)" : "rgba(255, 68, 68, 0.85)";
            this.drawPreciseRangeCircle(this.ghostTileX + 0.5, this.ghostTileZ + 0.5, range, color);
        }

        // 3. Draw Hitsplats
        const damageSprite = this.assets.getSprite(HITSPLAT_SPRITES.damage);
        for (const hitsplat of this.hitsplats) {
            const progress = (now - hitsplat.createdTime) / 1200;
            const h = this.ground(hitsplat.x, hitsplat.z) - 1.2 - progress * 0.4;
            const p = this.overlay.project(hitsplat.x, h, hitsplat.z, this.screenHelper);

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
            const h = this.ground(goblin.x, goblin.y) - 1.2;
            const p = this.overlay.project(goblin.x, h, goblin.y, this.screenHelper);

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

    // Mathematically precise range circle in 3D world space projected to screen
    private drawPreciseRangeCircle(centerX: number, centerZ: number, range: number, color: string): void {
        const ctx = this.overlay.ctx;
        ctx.beginPath();
        const segments = 36;
        let first = true;

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const wx = centerX + range * Math.cos(angle);
            const wz = centerZ + range * Math.sin(angle);
            const wy = this.ground(wx, wz);
            const p = this.overlay.project(wx, wy, wz, this.screenHelper);

            if (p.visible) {
                if (first) {
                    ctx.moveTo(p.x, p.y);
                    first = false;
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }
        }

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    dispose(): void {
        const canvas = this.renderer.canvas;
        canvas.removeEventListener("pointermove", this.boundOnPointerMove);
        canvas.removeEventListener("pointerdown", this.boundOnPointerDown);
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
