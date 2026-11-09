import React from "react";
import { TOWERS } from "../game/towers";
import { TowerType } from "../game/types";
import { Crosshair, Sparkles, Swords, Bomb, ShieldCheck } from "lucide-react";

interface TowerPanelProps {
  currentGp: number;
  placingTowerType: TowerType | null;
  onSelectTowerToPlace: (type: TowerType | null) => void;
}

export const TowerPanel: React.FC<TowerPanelProps> = ({
  currentGp,
  placingTowerType,
  onSelectTowerToPlace,
}) => {
  const towerList: { type: TowerType; icon: React.ReactNode; shortcut: string }[] = [
    { type: "archer", icon: <Crosshair className="w-5 h-5" />, shortcut: "1" },
    { type: "mage", icon: <Sparkles className="w-5 h-5" />, shortcut: "2" },
    { type: "warrior", icon: <Swords className="w-5 h-5" />, shortcut: "3" },
    { type: "cannon", icon: <Bomb className="w-5 h-5" />, shortcut: "4" },
    { type: "altar", icon: <ShieldCheck className="w-5 h-5" />, shortcut: "5" },
  ];

  return (
    <div className="w-full max-w-5xl bg-[#2b241c] border-4 border-[#4d3d2c] rounded-b-xl p-4 shadow-2xl text-[#f3e5c8]">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-3 px-2">
        <div className="text-sm font-bold text-[#bfae95]">
          Recruit Defenders (Click to build, or press key 1 - 5):
        </div>
        {placingTowerType && (
          <button
            onClick={() => onSelectTowerToPlace(null)}
            className="text-xs bg-red-950 text-red-300 hover:bg-red-900 border border-red-700 px-3 py-1 rounded cursor-pointer"
          >
            Cancel Placement (ESC)
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {towerList.map(({ type, icon, shortcut }) => {
          const def = TOWERS[type];
          const baseLvl = def.levels[0];
          const isSelected = placingTowerType === type;
          const canAfford = currentGp >= def.baseCost;

          return (
            <div
              key={type}
              onClick={() => {
                if (isSelected) {
                  onSelectTowerToPlace(null);
                } else if (canAfford) {
                  onSelectTowerToPlace(type);
                }
              }}
              className={`relative flex flex-col p-3 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? "bg-[#3f311c] border-yellow-400 shadow-lg scale-102 ring-2 ring-yellow-400/50"
                  : canAfford
                  ? "bg-[#1f1913] border-[#4d3d2c] hover:border-[#85653e] hover:bg-[#282017]"
                  : "bg-[#18130e] border-[#33281c] opacity-55 cursor-not-allowed"
              }`}
            >
              {/* Hotkey Badge */}
              <div className="absolute top-2 right-2 text-[10px] font-mono bg-black/60 px-1.5 py-0.5 rounded text-[#a8977e]">
                [{shortcut}]
              </div>

              {/* Tower Header */}
              <div className="flex items-center space-x-2 space-x-reverse mb-1">
                <div
                  className="p-1.5 rounded-lg text-white"
                  style={{ backgroundColor: def.color }}
                >
                  {icon}
                </div>
                <div className="font-bold text-sm text-[#fef08a] truncate">{def.name}</div>
              </div>

              {/* Cost & Role */}
              <div className="text-xs font-bold text-yellow-400 font-mono mb-1">
                {def.baseCost} GP
              </div>

              <div className="text-[11px] text-[#a19077] line-clamp-2 leading-tight">
                {baseLvl.description}
              </div>

              {/* Base Stats */}
              <div className="mt-2 pt-2 border-t border-[#3a2e20] flex justify-between text-[10px] text-[#b09e86]">
                <span>Dmg: {baseLvl.damage}</span>
                <span>Rng: {baseLvl.range}px</span>
                <span>Spd: {baseLvl.attackCooldown}s</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
