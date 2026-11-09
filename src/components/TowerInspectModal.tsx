import React from "react";
import { TOWERS } from "../game/towers";
import { TargetPriority, TowerInstance } from "../game/types";
import { ArrowUpCircle, DollarSign, X, Shield, Crosshair } from "lucide-react";

interface TowerInspectModalProps {
  tower: TowerInstance | null;
  currentGp: number;
  onClose: () => void;
  onUpgrade: (towerId: string) => void;
  onSell: (towerId: string) => void;
  onSetPriority: (towerId: string, priority: TargetPriority) => void;
}

export const TowerInspectModal: React.FC<TowerInspectModalProps> = ({
  tower,
  currentGp,
  onClose,
  onUpgrade,
  onSell,
  onSetPriority,
}) => {
  if (!tower) return null;

  const def = TOWERS[tower.type];
  const currentConfig = def.levels[tower.level - 1];
  const isMaxLevel = tower.level >= def.levels.length;
  const nextConfig = !isMaxLevel ? def.levels[tower.level] : null;

  const canAffordUpgrade = nextConfig ? currentGp >= nextConfig.cost : false;

  // Calculate sell refund
  let invested = def.baseCost;
  for (let l = 1; l < tower.level; l++) {
    invested += def.levels[l].cost;
  }
  const refundGp = Math.floor(invested * 0.7);

  const priorities: { id: TargetPriority; label: string }[] = [
    { id: "first", label: "First" },
    { id: "last", label: "Last" },
    { id: "strongest", label: "Strongest" },
    { id: "closest", label: "Closest" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#241c14] border-4 border-[#523e2b] rounded-2xl max-w-md w-full p-6 shadow-2xl text-[#f3e5c8] relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#a39077] hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 space-x-reverse mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow"
            style={{ backgroundColor: def.color }}
          >
            {tower.level}
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-[#fef08a]">{currentConfig.name}</h3>
            <div className="text-xs text-[#a39276]">{def.name} • Level {tower.level}</div>
          </div>
        </div>

        {/* Current Weapon & Description */}
        <div className="bg-[#18120d] p-3 rounded-xl border border-[#3e3020] mb-4 text-xs">
          <div className="font-bold text-[#facc15] mb-1">
            Weapon: {currentConfig.weaponName}
          </div>
          <div className="text-[#bfab8e] leading-relaxed">{currentConfig.description}</div>
        </div>

        {/* Combat Stats Grid */}
        <div className="grid grid-cols-3 gap-2 bg-[#1b150f] p-3 rounded-xl border border-[#3e3020] mb-4 text-center text-xs">
          <div>
            <div className="text-[#8c785f]">Damage</div>
            <div className="text-base font-bold text-white font-mono">{currentConfig.damage}</div>
          </div>
          <div>
            <div className="text-[#8c785f]">Range</div>
            <div className="text-base font-bold text-white font-mono">{currentConfig.range}px</div>
          </div>
          <div>
            <div className="text-[#8c785f]">Cooldown</div>
            <div className="text-base font-bold text-white font-mono">
              {currentConfig.attackCooldown}s
            </div>
          </div>
        </div>

        {/* Lifetime Performance Stats */}
        <div className="flex justify-around bg-[#18120d] p-2.5 rounded-xl border border-[#3a2c1d] mb-4 text-xs font-mono">
          <div>
            Kills: <span className="font-bold text-green-400">{tower.kills}</span>
          </div>
          <div>
            Total Damage:{" "}
            <span className="font-bold text-amber-400">
              {tower.totalDamage.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Targeting Priority Selector */}
        {tower.type !== "altar" && (
          <div className="mb-5">
            <div className="text-xs font-bold text-[#a69276] mb-2 flex items-center space-x-1 space-x-reverse">
              <Crosshair className="w-3.5 h-3.5 text-yellow-400" />
              <span>Target Priority:</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {priorities.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSetPriority(tower.id, p.id)}
                  className={`text-xs py-1.5 px-2 rounded-lg font-bold border transition-all cursor-pointer ${
                    tower.targetPriority === p.id
                      ? "bg-yellow-600 text-black border-yellow-300 shadow"
                      : "bg-[#18120d] text-[#a39276] border-[#3e3020] hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons: Upgrade & Sell */}
        <div className="flex space-x-3 space-x-reverse pt-2 border-t border-[#3e3020]">
          {!isMaxLevel && nextConfig ? (
            <button
              onClick={() => onUpgrade(tower.id)}
              disabled={!canAffordUpgrade}
              className={`flex-1 flex items-center justify-center space-x-2 space-x-reverse py-3 px-4 rounded-xl font-bold text-sm shadow-lg transition-all cursor-pointer ${
                canAffordUpgrade
                  ? "bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black border-2 border-yellow-300"
                  : "bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
              }`}
            >
              <ArrowUpCircle className="w-5 h-5" />
              <span>Upgrade ({nextConfig.cost} GP)</span>
            </button>
          ) : (
            <div className="flex-1 py-3 text-center font-bold text-amber-400 bg-[#1c150e] rounded-xl border border-amber-600/40 text-sm">
              MAX LEVEL REACHED
            </div>
          )}

          <button
            onClick={() => onSell(tower.id)}
            className="flex items-center justify-center space-x-1.5 space-x-reverse py-3 px-4 bg-red-950 hover:bg-red-900 border-2 border-red-800 text-red-200 rounded-xl font-bold text-xs cursor-pointer transition-colors"
          >
            <DollarSign className="w-4 h-4" />
            <span>Sell ({refundGp} GP)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
