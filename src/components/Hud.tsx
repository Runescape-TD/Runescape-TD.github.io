import React from "react";
import { Coins, Heart, Play, FastForward, Volume2, VolumeX, ShieldAlert } from "lucide-react";
import { GameEngine } from "../game/engine";
import { WAVES } from "../game/enemies";
import { sound } from "../game/audio";

interface HudProps {
  engine: GameEngine;
  onStartWave: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  speed: number;
  onSetSpeed: (speed: number) => void;
}

export const Hud: React.FC<HudProps> = ({
  engine,
  onStartWave,
  isMuted,
  onToggleMute,
  speed,
  onSetSpeed,
}) => {
  const hpRatio = Math.max(0, engine.castleHp / engine.maxCastleHp);
  const totalWaves = WAVES.length;
  const currentWave = Math.min(engine.waveIndex + 1, totalWaves);

  return (
    <div className="w-full max-w-5xl bg-[#2b241c] border-4 border-[#4d3d2c] rounded-t-xl px-5 py-3 flex flex-wrap items-center justify-between shadow-2xl text-[#f3e5c8]">
      {/* Left: Castle Gate HP & GP Coins */}
      <div className="flex items-center space-x-6 space-x-reverse">
        {/* Castle Gate HP */}
        <div className="flex items-center space-x-2 space-x-reverse bg-[#1c1712] px-3 py-1.5 rounded-lg border border-[#3e3428]">
          <Heart className="w-5 h-5 text-red-500 fill-red-500 animate-pulse" />
          <div className="flex flex-col">
            <div className="text-xs font-bold text-[#b8a082]">Castle Gate HP</div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <div className="w-28 h-3.5 bg-[#421d1d] rounded-full overflow-hidden border border-[#582626]">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-green-500 transition-all duration-200"
                  style={{ width: `${hpRatio * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold font-mono">
                {engine.castleHp}/{engine.maxCastleHp}
              </span>
            </div>
          </div>
        </div>

        {/* Gold GP */}
        <div className="flex items-center space-x-2 space-x-reverse bg-[#1c1712] px-4 py-2 rounded-lg border border-[#eab308]/40 shadow-inner">
          <Coins className="w-6 h-6 text-yellow-400 fill-yellow-400" />
          <div className="flex flex-col">
            <span className="text-xs text-[#a39276] font-semibold">Coins (GP)</span>
            <span className="text-lg font-bold text-yellow-400 font-mono tracking-wider">
              {engine.gp.toLocaleString()} GP
            </span>
          </div>
        </div>
      </div>

      {/* Center: Wave Progress & Next Wave Button */}
      <div className="flex items-center space-x-4 space-x-reverse my-1">
        <div className="text-center px-3 py-1 bg-[#1a140d] rounded-lg border border-[#3e3428]">
          <div className="text-xs text-[#9d896e]">Wave</div>
          <div className="text-base font-bold text-[#fef08a] font-mono">
            {currentWave} <span className="text-[#84735c]">/ {totalWaves}</span>
          </div>
        </div>

        {!engine.waveInProgress ? (
          <button
            onClick={onStartWave}
            disabled={engine.waveIndex >= totalWaves}
            className="flex items-center space-x-2 space-x-reverse bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 active:scale-95 text-black font-extrabold px-5 py-2.5 rounded-lg shadow-lg border-2 border-yellow-300 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-black" />
            <span>START WAVE</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 space-x-reverse bg-[#3b2d18] text-yellow-300 px-4 py-2 rounded-lg border border-yellow-600 font-bold animate-pulse">
            <ShieldAlert className="w-5 h-5" />
            <span>Wave in progress...</span>
          </div>
        )}
      </div>

      {/* Right: Speed Controls & Mute */}
      <div className="flex items-center space-x-3 space-x-reverse">
        {/* Speed Controls */}
        <div className="flex bg-[#1a140d] rounded-lg p-1 border border-[#3e3428]">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-colors ${
                speed === s
                  ? "bg-yellow-600 text-black shadow"
                  : "text-[#bfae95] hover:text-white"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Mute Toggle */}
        <button
          onClick={onToggleMute}
          className="p-2 bg-[#1a140d] hover:bg-[#2b2114] text-[#d4c3a7] hover:text-white rounded-lg border border-[#3e3428] cursor-pointer"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
