import React from "react";
import { Trophy, Skull, RotateCcw } from "lucide-react";

interface GameOverModalProps {
  isVictory: boolean;
  score: number;
  wavesCleared: number;
  towersBuilt: number;
  onRestart: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isVictory,
  score,
  wavesCleared,
  towersBuilt,
  onRestart,
}) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#241c14] border-4 border-[#5a422d] rounded-2xl max-w-sm w-full p-6 text-center text-[#f3e5c8] shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex justify-center mb-4">
          {isVictory ? (
            <div className="p-4 bg-yellow-950/80 rounded-full border-2 border-yellow-500 shadow-lg text-yellow-400">
              <Trophy className="w-12 h-12 animate-bounce" />
            </div>
          ) : (
            <div className="p-4 bg-red-950/80 rounded-full border-2 border-red-600 shadow-lg text-red-500">
              <Skull className="w-12 h-12" />
            </div>
          )}
        </div>

        <h2 className="text-2xl font-extrabold mb-1">
          {isVictory ? (
            <span className="text-yellow-400">VICTORY ACHIEVED!</span>
          ) : (
            <span className="text-red-500">CASTLE GATES BREACHED</span>
          )}
        </h2>

        <p className="text-xs text-[#b8a284] mb-6">
          {isVictory
            ? "Congratulations! You have protected the Realm and defeated Elvarg!"
            : "The hordes broke through the courtyard gates. Lumbridge has fallen."}
        </p>

        {/* Stats Summary */}
        <div className="bg-[#18120d] p-4 rounded-xl border border-[#3e3020] mb-6 space-y-2 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-[#8c785f]">Total Score:</span>
            <span className="font-bold text-yellow-400">{score.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8c785f]">Waves Cleared:</span>
            <span className="font-bold text-white">{wavesCleared}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8c785f]">Defenders Deployed:</span>
            <span className="font-bold text-white">{towersBuilt}</span>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="w-full flex items-center justify-center space-x-2 space-x-reverse py-3.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-extrabold text-base rounded-xl shadow-lg border-2 border-yellow-300 cursor-pointer transition-transform active:scale-95"
        >
          <RotateCcw className="w-5 h-5" />
          <span>PLAY AGAIN</span>
        </button>
      </div>
    </div>
  );
};
