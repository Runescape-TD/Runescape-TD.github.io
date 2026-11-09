import React, { useState, useEffect, useCallback, useMemo } from "react";
import { GameEngine } from "./game/engine";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import { TowerPanel } from "./components/TowerPanel";
import { TowerInspectModal } from "./components/TowerInspectModal";
import { GameOverModal } from "./components/GameOverModal";
import { TargetPriority, TowerType } from "./game/types";
import { sound } from "./game/audio";
import { Shield, Sparkles } from "lucide-react";

export function App() {
  const engine = useMemo(() => new GameEngine(), []);
  const [, setTick] = useState(0);

  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [speed, setSpeed] = useState(engine.gameSpeed);

  // Force re-render state on game ticks
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "1") {
        engine.placingTowerType = engine.placingTowerType === "archer" ? null : "archer";
        engine.selectedTowerId = null;
      } else if (e.key === "2") {
        engine.placingTowerType = engine.placingTowerType === "mage" ? null : "mage";
        engine.selectedTowerId = null;
      } else if (e.key === "3") {
        engine.placingTowerType = engine.placingTowerType === "warrior" ? null : "warrior";
        engine.selectedTowerId = null;
      } else if (e.key === "4") {
        engine.placingTowerType = engine.placingTowerType === "cannon" ? null : "cannon";
        engine.selectedTowerId = null;
      } else if (e.key === "5") {
        engine.placingTowerType = engine.placingTowerType === "altar" ? null : "altar";
        engine.selectedTowerId = null;
      } else if (e.key === "Escape") {
        engine.placingTowerType = null;
        engine.selectedTowerId = null;
      } else if (e.key === " " && !engine.waveInProgress) {
        e.preventDefault();
        engine.startNextWave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [engine]);

  // Handle Canvas Tile Click
  const handleTileClick = useCallback(
    (gridX: number, gridY: number) => {
      if (engine.placingTowerType) {
        engine.placeTower(engine.placingTowerType, gridX, gridY);
      } else {
        // Check if clicked an existing tower to inspect it
        const clickedTower = engine.towers.find(
          (t) => t.gridX === gridX && t.gridY === gridY,
        );
        engine.selectedTowerId = clickedTower ? clickedTower.id : null;
      }
    },
    [engine],
  );

  const selectedTower = engine.towers.find((t) => t.id === engine.selectedTowerId) || null;

  return (
    <div className="min-h-screen bg-[#120e0a] text-[#f3e5c8] flex flex-col items-center justify-center p-3 select-none">
      {/* Game Header */}
      <header className="mb-2 text-center flex flex-col items-center">
        <div className="flex items-center space-x-2 space-x-reverse">
          <Shield className="w-7 h-7 text-yellow-400 fill-yellow-400" />
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-600 tracking-wider">
            RuneScape-TD
          </h1>
          <Sparkles className="w-5 h-5 text-yellow-300 animate-spin" />
        </div>
        <div className="text-xs text-[#a18c72] font-semibold mt-0.5">
          Chapter 1: The Siege of Lumbridge Courtyard
        </div>
      </header>

      {/* Main Game Frame */}
      <div className="w-full max-w-5xl flex flex-col items-center shadow-2xl">
        {/* HUD Top Bar */}
        <Hud
          engine={engine}
          onStartWave={() => engine.startNextWave()}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(sound.toggleMute())}
          speed={speed}
          onSetSpeed={(s) => {
            engine.gameSpeed = s;
            setSpeed(s);
          }}
        />

        {/* 60 FPS Canvas Game Board */}
        <GameCanvas
          engine={engine}
          onTileClick={handleTileClick}
          hoverGrid={hoverGrid}
          setHoverGrid={setHoverGrid}
        />

        {/* Bottom Tower Shop Panel */}
        <TowerPanel
          currentGp={engine.gp}
          placingTowerType={engine.placingTowerType}
          onSelectTowerToPlace={(type) => {
            engine.placingTowerType = type;
            if (type) engine.selectedTowerId = null;
          }}
        />
      </div>

      {/* Tower Inspect & Upgrade Modal */}
      <TowerInspectModal
        tower={selectedTower}
        currentGp={engine.gp}
        onClose={() => {
          engine.selectedTowerId = null;
        }}
        onUpgrade={(id) => engine.upgradeTower(id)}
        onSell={(id) => engine.sellTower(id)}
        onSetPriority={(id, p) => engine.setTargetPriority(id, p)}
      />

      {/* Victory or Defeat Modal */}
      {(engine.isGameOver || engine.isVictory) && (
        <GameOverModal
          isVictory={engine.isVictory}
          score={engine.score}
          wavesCleared={engine.waveIndex}
          towersBuilt={engine.towers.length}
          onRestart={() => engine.reset()}
        />
      )}
    </div>
  );
}

export default App;
