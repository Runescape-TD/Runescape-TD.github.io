import React from "react";
import "./RotateNotice.css";

export function RotateNotice(): JSX.Element {
    return (
        <div className="rotate-notice-overlay">
            <div className="rotate-notice-card">
                <div className="rotate-phone-anim">
                    <div className="rotate-phone-body">
                        <div className="rotate-phone-screen" />
                    </div>
                </div>
                <h3 className="rotate-title">Please Rotate Your Device</h3>
                <p className="rotate-desc">This game is designed to be played in landscape mode</p>
            </div>
        </div>
    );
}
