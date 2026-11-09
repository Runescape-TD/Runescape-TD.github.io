import React from "react";
import { DefenderType, TdGameState } from "./LumbridgeTdGame";
import "./TdOverlayUi.css";

export interface TdOverlayUiProps {
    state: TdGameState;
    onStartWave: () => void;
    onSelectDefender: (type: DefenderType) => void;
    onConfirmPlacement: () => void;
    onCancelPlacement: () => void;
    onSellSelected: () => void;
    onDeselect: () => void;
}

export function TdOverlayUi({
    state,
    onStartWave,
    onSelectDefender,
    onConfirmPlacement,
    onCancelPlacement,
    onSellSelected,
    onDeselect,
}: TdOverlayUiProps): JSX.Element {
    const isWaveRunning = state.waveActive;
    const gatePercent = Math.max(0, Math.min(100, (state.gateHp / state.maxGateHp) * 100));

    // Floating confirm/cancel buttons position directly under ghost defender
    const hasGhostPos = state.isPlacing && state.ghostScreenPos.visible;
    const ghostLeft = hasGhostPos ? state.ghostScreenPos.x : 200;
    const ghostTop = hasGhostPos ? state.ghostScreenPos.y + 25 : 200;

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

            {/* Bottom Bar: Compact corner buttons for Archer, Wizard and Wave */}
            <footer className="td-bottom-bar">
                <div className="td-defenders-dock">
                    {/* Archer Recruit Card */}
                    <button
                        className={`td-btn-recruit ${state.isPlacing && state.placingType === "archer" ? "active" : ""}`}
                        onClick={() => onSelectDefender("archer")}
                        title="Deploy 3D Archer"
                    >
                        <span className="td-recruit-icon">🏹</span>
                        <div className="td-recruit-info">
                            <span className="td-recruit-title">Archer</span>
                            <span className="td-recruit-sub">Physical | Free</span>
                        </div>
                    </button>

                    {/* Wizard Recruit Card */}
                    <button
                        className={`td-btn-recruit ${state.isPlacing && state.placingType === "wizard" ? "active" : ""}`}
                        onClick={() => onSelectDefender("wizard")}
                        title="Deploy 3D Wizard"
                    >
                        <span className="td-recruit-icon">🧙</span>
                        <div className="td-recruit-info">
                            <span className="td-recruit-title">Wizard</span>
                            <span className="td-recruit-sub">Magic Strike | Free</span>
                        </div>
                    </button>
                </div>

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

            {/* Floating Action Buttons directly under Ghost during placement */}
            {state.isPlacing && hasGhostPos && (
                <div
                    id="td-ghost-actions"
                    className="td-ghost-actions"
                    style={{
                        left: `${Math.round(ghostLeft)}px`,
                        top: `${Math.round(ghostTop)}px`,
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
                        title={state.isGhostValid ? "Confirm placement" : "Cannot place on path or water"}
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

            {/* Selected Defender Sell Action */}
            {state.selectedDefenderId !== undefined && state.selectedDefenderPos?.visible && (
                <div
                    id="td-selected-actions"
                    className="td-selected-actions"
                    style={{
                        left: `${Math.round(state.selectedDefenderPos.x)}px`,
                        top: `${Math.round(state.selectedDefenderPos.y + 20)}px`,
                    }}
                >
                    <button
                        className="td-sell-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSellSelected();
                        }}
                        title="Sell Defender"
                    >
                        <span className="td-sell-icon">💰</span>
                        <span>Sell</span>
                    </button>
                    <button
                        className="td-ghost-btn cancel td-deselect-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeselect();
                        }}
                        title="Deselect"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
