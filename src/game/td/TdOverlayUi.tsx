import React from "react";
import { TdGameState } from "./LumbridgeTdGame";
import "./TdOverlayUi.css";

export interface TdOverlayUiProps {
    state: TdGameState;
    onStartWave: () => void;
}

export function TdOverlayUi({ state, onStartWave }: TdOverlayUiProps): JSX.Element {
    const isWaveRunning = state.waveActive;
    const gatePercent = Math.max(0, Math.min(100, (state.gateHp / state.maxGateHp) * 100));

    return (
        <div className="td-ui-container" dir="rtl">
            {/* Top Bar: Gate HP & Unlimited Coins */}
            <header className="td-top-bar">
                <div className="td-status-box">
                    <span className="td-title">🏰 שער לאמברידג׳</span>
                    <div className="td-hp-bar-bg">
                        <div
                            className="td-hp-bar-fill"
                            style={{
                                width: `${gatePercent}%`,
                                backgroundColor: gatePercent > 30 ? "#34d399" : "#ef4444",
                            }}
                        />
                    </div>
                    <span className="td-hp-text">{state.gateHp} / {state.maxGateHp} HP</span>
                </div>

                <div className="td-coins-badge">
                    <span className="td-coin-icon">🪙</span>
                    <span className="td-coin-amount">GP: ∞ (ללא הגבלה)</span>
                </div>

                <div className="td-wave-badge">
                    <span>גל {state.waveNumber}</span>
                </div>
            </header>

            {/* Bottom Panel: Defender Selection & Wave Start */}
            <footer className="td-bottom-panel">
                <div className="td-controls-row">
                    <div className="td-defender-card active">
                        <div className="td-defender-icon">🏹</div>
                        <div className="td-defender-details">
                            <span className="td-defender-name">קשת (Lumbridge Archer)</span>
                            <span className="td-defender-desc">מחסל גובלין במכה אחת (1-Hit Kill) | חינם</span>
                        </div>
                    </div>

                    <button
                        className={`td-wave-btn ${isWaveRunning ? "running" : ""}`}
                        onClick={onStartWave}
                        disabled={isWaveRunning}
                    >
                        {isWaveRunning
                            ? `גל בפעולה (${state.goblinsAlive} נותרו)`
                            : "⚔️ התחל משחק / גל"}
                    </button>
                </div>

                <div className="td-hint">
                    💡 <strong>הוראות:</strong> לחץ על שטחי הדשא שמסביב לשביל כדי להציב קשתים. השביל עצמו שמור לתנועת האויבים בלבד.
                </div>
            </footer>
        </div>
    );
}
