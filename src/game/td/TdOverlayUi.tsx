import React from "react";
import { TdGameState } from "./LumbridgeTdGame";
import "./TdOverlayUi.css";

export interface TdOverlayUiProps {
    state: TdGameState;
    onStartWave: () => void;
    onSelectArcher: () => void;
    onConfirmPlacement: () => void;
    onCancelPlacement: () => void;
}

export function TdOverlayUi({
    state,
    onStartWave,
    onSelectArcher,
    onConfirmPlacement,
    onCancelPlacement,
}: TdOverlayUiProps): JSX.Element {
    const isWaveRunning = state.waveActive;
    const gatePercent = Math.max(0, Math.min(100, (state.gateHp / state.maxGateHp) * 100));

    // Convert canvas internal pixels to CSS pixels for DOM positioning
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const hasValidScreenPos = state.ghostScreenPos && state.ghostScreenPos.visible;
    const ghostLeft = hasValidScreenPos
        ? state.ghostScreenPos.x / dpr
        : typeof window !== "undefined"
          ? window.innerWidth / 2
          : 200;
    const ghostTop = hasValidScreenPos
        ? state.ghostScreenPos.y / dpr + 20
        : typeof window !== "undefined"
          ? window.innerHeight / 2 + 30
          : 200;

    return (
        <div className="td-ui-container" dir="ltr">
            {/* Top Bar: Minimalist Badges in corners */}
            <header className="td-top-bar">
                {/* Gate HP Badge */}
                <div className="td-badge td-gate-badge">
                    <span className="td-badge-icon">🏰</span>
                    <div className="td-hp-bar">
                        <div
                            className="td-hp-fill"
                            style={{
                                width: `${gatePercent}%`,
                                backgroundColor: gatePercent > 30 ? "#22c55e" : "#ef4444",
                            }}
                        />
                    </div>
                    <span className="td-badge-text">{state.gateHp} HP</span>
                </div>

                {/* Coins Badge */}
                <div className="td-badge td-gold-badge">
                    <span className="td-badge-icon">🪙</span>
                    <span className="td-badge-text">GP: ∞</span>
                </div>

                {/* Wave Badge */}
                <div className="td-badge td-wave-badge">
                    <span className="td-badge-text">
                        {isWaveRunning ? `Wave ${state.waveNumber} (${state.goblinsAlive})` : `Wave ${state.waveNumber}`}
                    </span>
                </div>
            </header>

            {/* Bottom Bar: Compact corner buttons */}
            <footer className="td-bottom-bar">
                {/* Archer Recruit Pill (Bottom Left) */}
                <button
                    className={`td-btn-recruit ${state.isPlacingArcher ? "active" : ""}`}
                    onClick={onSelectArcher}
                    title="Click to place Archer on grass"
                >
                    <span className="td-recruit-icon">🏹</span>
                    <div className="td-recruit-info">
                        <span className="td-recruit-title">Archer</span>
                        <span className="td-recruit-sub">1-Hit Kill | Free</span>
                    </div>
                </button>

                {/* Start Wave Pill (Bottom Right) */}
                <button
                    className={`td-btn-wave ${isWaveRunning ? "disabled" : ""}`}
                    onClick={onStartWave}
                    disabled={isWaveRunning}
                >
                    <span className="td-wave-icon">⚔️</span>
                    <span>{isWaveRunning ? "Wave in Progress..." : "Start Wave"}</span>
                </button>
            </footer>

            {/* Floating Action Buttons directly under Ghost Archer during placement */}
            {state.isPlacingArcher && (
                <div
                    className="td-ghost-actions"
                    style={{
                        left: `${ghostLeft}px`,
                        top: `${ghostTop}px`,
                    }}
                >
                    {/* Confirm Button */}
                    <button
                        className={`td-ghost-btn confirm ${state.isGhostValid ? "" : "disabled"}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (state.isGhostValid) onConfirmPlacement();
                        }}
                        disabled={!state.isGhostValid}
                        title={state.isGhostValid ? "Confirm placement" : "Cannot place here"}
                    >
                        ✓
                    </button>

                    {/* Cancel Button */}
                    <button
                        className="td-ghost-btn cancel"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancelPlacement();
                        }}
                        title="Cancel placement"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
