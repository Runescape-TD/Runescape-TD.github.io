import { useEffect, useRef, useState } from "react";
import WebFont from "webfontloader";

import { RendererCanvas } from "../components/renderer/RendererCanvas";
import { RotateNotice } from "../components/RotateNotice";
import { OsrsLoadingBar } from "../components/rs/loading/OsrsLoadingBar";
import { fetchCacheList, loadCacheFiles } from "../mapviewer/Caches";
import { MapViewer } from "../mapviewer/MapViewer";
import { WEBGL } from "../mapviewer/MapViewerRenderers";
import { RenderDataWorkerPool } from "../mapviewer/worker/RenderDataWorkerPool";
import { DownloadProgress } from "../rs/cache/CacheFiles";
import { formatBytes } from "../util/BytesUtil";
import { isCoarsePointer } from "../util/DeviceUtil";
import "./GameApp.css";
import {
    GAME_CACHE_NAME,
    deleteOtherGameCaches,
    findGameCache,
    getCacheMismatch,
    shouldReloadForCache,
} from "./cache";
import { MAPS } from "./content/maps";
import { GameWebGLRenderer } from "./render/GameWebGLRenderer";
import { iconCache } from "./ui/ItemIcon";
import { LumbridgeTdGame, TdGameState } from "./td/LumbridgeTdGame";
import { TdOverlayUi } from "./td/TdOverlayUi";

WebFont.load({
    custom: {
        families: ["OSRS Bold", "OSRS Small"],
    },
});

// Single worker on mobile to prevent memory pressure and timeout
const workerPool = RenderDataWorkerPool.create(isCoarsePointer ? 1 : 4);

if (import.meta.hot) {
    import.meta.hot.on("vite:beforeUpdate", () => window.location.reload());
}

const RENDER_DISTANCE = 72;

type Loaded = {
    mapViewer: MapViewer;
    renderer: GameWebGLRenderer;
};

async function loadViewer(
    signal: AbortSignal,
    onProgress: (progress: DownloadProgress) => void,
): Promise<Loaded> {
    if (!window.crossOriginIsolated) {
        throw new Error(
            "This page has to be served with the headers Cross-Origin-Opener-Policy: same-origin " +
                "and Cross-Origin-Embedder-Policy: require-corp (see Hosting in the README).",
        );
    }
    const cacheList = await fetchCacheList(__BUILD_ID__);
    if (!cacheList) {
        throw new Error("Failed to load the cache list (caches/caches.json).");
    }
    const cacheInfo = findGameCache(cacheList.caches);
    if (!cacheInfo) {
        throw new Error(`Cache ${GAME_CACHE_NAME} is missing.`);
    }
    const mismatch = getCacheMismatch(cacheInfo, __BUILD_ID__);
    if (shouldReloadForCache(mismatch)) {
        window.location.reload();
        return new Promise<never>(() => {});
    }
    if (mismatch) {
        throw new Error(mismatch);
    }
    const cache = await loadCacheFiles(cacheInfo, signal, onProgress);
    deleteOtherGameCaches(cacheInfo.name).catch(console.error);
    const mapImageCache = await caches.open("map-images");

    let renderer!: GameWebGLRenderer;
    const mapViewer = new MapViewer(
        workerPool,
        cacheList,
        [],
        [],
        mapImageCache,
        WEBGL,
        cache,
        (mapViewer) => {
            mapViewer.camera.pos[0] = MAPS[0].spawn.x;
            mapViewer.camera.pos[2] = MAPS[0].spawn.y;
            mapViewer.renderDistance = RENDER_DISTANCE;
            renderer = new GameWebGLRenderer(mapViewer);
            return renderer;
        },
    );
    iconCache.setWorkerPool(workerPool);
    return { mapViewer, renderer };
}

export function GameApp(): JSX.Element {
    const [loadingText, setLoadingText] = useState("Loading cache...");
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [loaded, setLoaded] = useState<Loaded>();
    const [tdGame, setTdGame] = useState<LumbridgeTdGame>();
    const [tdState, setTdState] = useState<TdGameState>();
    const overlayRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const abortController = new AbortController();
        loadViewer(abortController.signal, (progress: DownloadProgress) => {
            const doing = progress.saving ? "Saving" : "Downloading";
            setLoadingText(`${doing} cache (${formatBytes(progress.total)})`);
            setLoadingProgress(((progress.current / progress.total) * 100) | 0);
        })
            .then((loaded) => {
                setLoadingText("Loading Lumbridge 3D...");
                setLoadingProgress(95);
                setLoaded(loaded);
            })
            .catch((e) => {
                console.error(e);
                setErrorMessage(e instanceof Error ? e.message : String(e));
            });
        return () => abortController.abort();
    }, []);

    // Force canvas and layout stabilization on initial landscape load and orientation change
    useEffect(() => {
        const triggerResize = () => {
            window.dispatchEvent(new Event("resize"));
        };
        window.addEventListener("resize", triggerResize);
        window.addEventListener("orientationchange", triggerResize);
        const t1 = setTimeout(triggerResize, 100);
        const t2 = setTimeout(triggerResize, 400);
        const t3 = setTimeout(triggerResize, 1000);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            window.removeEventListener("resize", triggerResize);
            window.removeEventListener("orientationchange", triggerResize);
        };
    }, []);

    useEffect(() => {
        if (!loaded || !overlayRef.current) return;

        let disposed = false;
        let gameInstance: LumbridgeTdGame | undefined;

        setLoadingText("Preparing Lumbridge TD...");
        setLoadingProgress(98);

        LumbridgeTdGame.create(
            loaded.mapViewer,
            loaded.renderer,
            overlayRef.current,
            (state) => setTdState({ ...state }),
        )
            .then((game) => {
                if (disposed) {
                    game.dispose();
                    return;
                }
                gameInstance = game;
                loaded.renderer.game = game;
                setTdGame(game);
                setTdState({
                    waveNumber: game.waveNumber,
                    waveActive: game.waveActive,
                    goblinsRemainingToSpawn: game.goblinsToSpawn,
                    goblinsAlive: 0,
                    gateHp: game.gateHp,
                    maxGateHp: game.maxGateHp,
                    gold: game.gold,
                    defendersCount: 0,
                    isPlacing: false,
                    placingType: "archer",
                    ghostTileX: game.ghostTileX,
                    ghostTileZ: game.ghostTileZ,
                    isGhostValid: true,
                    ghostScreenPos: { x: 0, y: 0, visible: false },
                });
                setLoadingText("");
            })
            .catch((e) => {
                console.error("Failed to start Lumbridge TD:", e);
                setErrorMessage(e instanceof Error ? e.message : String(e));
            });

        return () => {
            disposed = true;
            gameInstance?.dispose();
        };
    }, [loaded]);

    return (
        <div className="game-root">
            {/* Show rotate notice on phone portrait */}
            <RotateNotice />

            {loaded && <RendererCanvas renderer={loaded.renderer} />}
            <canvas className="game-overlay" ref={overlayRef} />

            {loadingText && !errorMessage && (
                <div className="game-loading-overlay">
                    <OsrsLoadingBar text={loadingText} progress={loadingProgress} />
                </div>
            )}

            {errorMessage && (
                <div className="game-status content-text" style={{ zIndex: 100 }}>
                    {errorMessage}
                </div>
            )}

            {tdGame && tdState && (
                <TdOverlayUi
                    state={tdState}
                    onStartWave={() => tdGame.startWave()}
                    onSelectDefender={(type) => tdGame.startPlacing(type)}
                    onConfirmPlacement={() => tdGame.confirmPlacing()}
                    onCancelPlacement={() => tdGame.cancelPlacing()}
                    onSellSelected={() => tdGame.sellSelectedDefender()}
                    onDeselect={() => tdGame.deselectDefender()}
                />
            )}
        </div>
    );
}
