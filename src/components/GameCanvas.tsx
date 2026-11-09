import React, { useEffect, useRef } from "react";
import { ENEMIES } from "../game/enemies";
import { GameEngine } from "../game/engine";
import { TOWERS } from "../game/towers";

interface GameCanvasProps {
  engine: GameEngine;
  onTileClick: (gridX: number, gridY: number) => void;
  hoverGrid: { x: number; y: number } | null;
  setHoverGrid: (grid: { x: number; y: number } | null) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  engine,
  onTileClick,
  hoverGrid,
  setHoverGrid,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Update engine simulation
      engine.update(dt);

      // Render frame
      render(ctx, engine, time / 1000, hoverGrid);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [engine, hoverGrid]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const gridX = Math.floor(mouseX / engine.map.tileSize);
    const gridY = Math.floor(mouseY / engine.map.tileSize);

    if (gridX >= 0 && gridX < engine.map.cols && gridY >= 0 && gridY < engine.map.rows) {
      setHoverGrid({ x: gridX, y: gridY });
    } else {
      setHoverGrid(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverGrid(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const gridX = Math.floor(mouseX / engine.map.tileSize);
    const gridY = Math.floor(mouseY / engine.map.tileSize);

    onTileClick(gridX, gridY);
  };

  return (
    <div className="relative flex justify-center items-center select-none overflow-hidden rounded-lg shadow-2xl border-4 border-[#3e3428] bg-[#1a140d]">
      <canvas
        ref={canvasRef}
        width={engine.map.cols * engine.map.tileSize}
        height={engine.map.rows * engine.map.tileSize}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="cursor-crosshair max-w-full h-auto"
        style={{
          imageRendering: "pixelated",
          transform: engine.getScreenShake() > 0 ? `translate(${(Math.random() - 0.5) * engine.getScreenShake()}px, ${(Math.random() - 0.5) * engine.getScreenShake()}px)` : "none",
        }}
      />
    </div>
  );
};

// Main Canvas Render Routine
function render(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  time: number,
  hoverGrid: { x: number; y: number } | null,
) {
  const map = engine.map;
  const ts = map.tileSize;

  ctx.clearRect(0, 0, map.cols * ts, map.rows * ts);

  // 1. Draw Grid Tiles & Environment
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const tile = map.grid[r][c];
      const x = c * ts;
      const y = r * ts;

      if (tile === "grass") {
        // Classic OSRS lush grass
        ctx.fillStyle = (c + r) % 2 === 0 ? "#436a28" : "#3d6224";
        ctx.fillRect(x, y, ts, ts);

        // Grass blades detail
        ctx.fillStyle = "#4f7d30";
        ctx.fillRect(x + 8, y + 12, 2, 5);
        ctx.fillRect(x + 24, y + 30, 2, 4);
        ctx.fillRect(x + 36, y + 16, 2, 6);
      } else if (tile === "path") {
        // Dirt path
        ctx.fillStyle = (c + r) % 2 === 0 ? "#7b613e" : "#836843";
        ctx.fillRect(x, y, ts, ts);

        // Pebble details
        ctx.fillStyle = "#634d2f";
        ctx.fillRect(x + 10, y + 14, 3, 2);
        ctx.fillRect(x + 28, y + 26, 4, 3);
      } else if (tile === "water") {
        // River Lum with animated water ripples
        const wave = Math.sin(time * 3 + r * 0.8) * 4;
        ctx.fillStyle = "#1e40af";
        ctx.fillRect(x, y, ts, ts);

        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(x + 10 + wave, y + 16, ts - 20, 2);
        ctx.fillRect(x + 18 - wave, y + 34, ts - 24, 2);
      } else if (tile === "bridge") {
        // Wooden bridge planks over water
        ctx.fillStyle = "#1e40af";
        ctx.fillRect(x, y, ts, ts);

        ctx.fillStyle = "#5c4028";
        ctx.fillRect(x, y + 6, ts, ts - 12);

        // Planks
        ctx.strokeStyle = "#382414";
        ctx.lineWidth = 2;
        for (let p = 0; p < ts; p += 8) {
          ctx.beginPath();
          ctx.moveTo(x + p, y + 6);
          ctx.lineTo(x + p, y + ts - 6);
          ctx.stroke();
        }
      } else if (tile === "wall") {
        // Castle stone wall
        ctx.fillStyle = "#4b5563";
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ts, ts);

        // Brick lines
        ctx.beginPath();
        ctx.moveTo(x, y + ts / 2);
        ctx.lineTo(x + ts, y + ts / 2);
        ctx.moveTo(x + ts / 2, y);
        ctx.lineTo(x + ts / 2, y + ts / 2);
        ctx.stroke();
      } else if (tile === "castle_gate") {
        // Massive Lumbridge Castle Portcullis Gates
        ctx.fillStyle = "#374151";
        ctx.fillRect(x, y, ts, ts);

        // Heavy dark wood gate
        ctx.fillStyle = "#3b2210";
        ctx.fillRect(x + 6, y + 4, ts - 12, ts - 8);

        // Iron bars / grill
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + ts * 0.35, y + 4);
        ctx.lineTo(x + ts * 0.35, y + ts - 4);
        ctx.moveTo(x + ts * 0.65, y + 4);
        ctx.lineTo(x + ts * 0.65, y + ts - 4);
        ctx.stroke();
      }
    }
  }

  // 2. Hover & Placement Indicator
  if (hoverGrid) {
    const hx = hoverGrid.x * ts;
    const hy = hoverGrid.y * ts;
    const canPlace = engine.canPlaceTowerAt(hoverGrid.x, hoverGrid.y);

    if (engine.placingTowerType) {
      const def = TOWERS[engine.placingTowerType];
      const range = def.levels[0].range;

      // Range circle preview
      ctx.beginPath();
      ctx.arc(hx + ts * 0.5, hy + ts * 0.5, range, 0, Math.PI * 2);
      ctx.fillStyle = canPlace ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
      ctx.fill();
      ctx.strokeStyle = canPlace ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tile box
      ctx.fillStyle = canPlace ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
      ctx.fillRect(hx, hy, ts, ts);
      ctx.strokeStyle = canPlace ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, ts - 2, ts - 2);
    } else {
      // Normal tile highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx + 1, hy + 1, ts - 2, ts - 2);
    }
  }

  // 3. Draw Selected Tower Range & Target Line
  if (engine.selectedTowerId) {
    const selected = engine.towers.find((t) => t.id === engine.selectedTowerId);
    if (selected) {
      const config = TOWERS[selected.type].levels[selected.level - 1];

      ctx.beginPath();
      ctx.arc(selected.x, selected.y, config.range, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(234, 179, 8, 0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(234, 179, 8, 0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Line to current target
      if (selected.targetEnemyId) {
        const target = engine.enemies.find((e) => e.id === selected.targetEnemyId);
        if (target) {
          ctx.beginPath();
          ctx.moveTo(selected.x, selected.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  // 4. Draw Towers (Defenders)
  for (const tower of engine.towers) {
    const def = TOWERS[tower.type];
    const isSelected = tower.id === engine.selectedTowerId;

    ctx.save();
    ctx.translate(tower.x, tower.y);

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(0, 0, ts * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Base pedestal
    ctx.fillStyle = "#27272a";
    ctx.beginPath();
    ctx.arc(0, 2, ts * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tower Body / Character Avatar
    if (tower.type === "archer") {
      // Ranger in green tunic
      ctx.fillStyle = "#15803d";
      ctx.beginPath();
      ctx.arc(0, -2, 10, 0, Math.PI * 2);
      ctx.fill();

      // Hood / Robin hood hat
      ctx.fillStyle = "#166534";
      ctx.fillRect(-6, -10, 12, 6);

      // Rotating Bow & Arrow
      ctx.rotate(tower.rotation);
      ctx.strokeStyle = "#854d0e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(10, 0, 8, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    } else if (tower.type === "mage") {
      // Wizard in mystic robes
      ctx.fillStyle = "#1d4ed8";
      ctx.beginPath();
      ctx.arc(0, -2, 10, 0, Math.PI * 2);
      ctx.fill();

      // Wizard pointy hat
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.moveTo(-7, -4);
      ctx.lineTo(7, -4);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();

      // Magic glowing staff orb
      ctx.rotate(tower.rotation);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(14, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (tower.type === "warrior") {
      // Falador Knight in steel plate armor
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.arc(0, -2, 11, 0, Math.PI * 2);
      ctx.fill();

      // Helmet slit
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-5, -5, 10, 3);

      // Rotating blade
      ctx.rotate(tower.rotation);
      ctx.fillStyle = tower.level >= 4 ? "#dc2626" : "#cbd5e1"; // Red for Dragon Scimitar
      ctx.fillRect(8, -2, 14, 4);
    } else if (tower.type === "cannon") {
      // Dwarf Multicannon body
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(-10, -10, 20, 20);

      // Rotating twin cannon barrels
      ctx.rotate(tower.rotation);
      ctx.fillStyle = tower.level >= 5 ? "#eab308" : "#1f2937";
      ctx.fillRect(0, -4, 18, 8);
    } else if (tower.type === "altar") {
      // Prayer Altar with Holy Saradomin Star
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(-12, -10, 24, 20);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Level Badges (Roman Numerals I - V)
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const numerals = ["I", "II", "III", "IV", "V"];
    ctx.fillText(numerals[tower.level - 1] || "I", tower.x, tower.y + ts * 0.45);
  }

  // 5. Draw Enemies (Creeps)
  for (const enemy of engine.enemies) {
    const def = ENEMIES[enemy.type];

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    // Enemy Avatar Circle / Sprite
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, def.size, 0, Math.PI * 2);
    ctx.fill();

    // Dark border
    ctx.strokeStyle = def.isBoss ? "#eab308" : "#18181b";
    ctx.lineWidth = def.isBoss ? 3 : 2;
    ctx.stroke();

    // Inner detail (e.g. eyes / boss horns)
    if (def.isBoss) {
      // Dragon horns
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(-4, -10);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(10, -18);
      ctx.lineTo(4, -10);
      ctx.lineTo(12, -8);
      ctx.closePath();
      ctx.fill();
    }

    // Eyes
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-4, -4, 2, 3);
    ctx.fillRect(2, -4, 2, 3);

    // Frozen ice block overlay
    if (enemy.frozenTimer > 0) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
      ctx.fillRect(-def.size - 2, -def.size - 2, (def.size + 2) * 2, (def.size + 2) * 2);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.strokeRect(-def.size - 2, -def.size - 2, (def.size + 2) * 2, (def.size + 2) * 2);
    }

    // Burn effect flame particle
    if (enemy.burnTimer > 0) {
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.arc(0, -def.size - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Health Bar
    const barWidth = def.size * 2 + 6;
    const barHeight = 4;
    const barX = enemy.x - barWidth / 2;
    const barY = enemy.y - def.size - 8;
    const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);

    ctx.fillStyle = "#7f1d1d"; // Red background
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#22c55e"; // Green HP
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = "#09090b";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
  }

  // 6. Draw Projectiles
  for (const proj of engine.projectiles) {
    ctx.save();
    ctx.translate(proj.x, proj.y);

    if (proj.type === "arrow") {
      const angle = Math.atan2(proj.targetPos.y - proj.y, proj.targetPos.x - proj.x);
      ctx.rotate(angle);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(-8, -1.5, 16, 3);
      ctx.fillStyle = "#94a3b8"; // Arrowhead
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(13, 0);
      ctx.lineTo(8, 3);
      ctx.closePath();
      ctx.fill();
    } else if (proj.type === "firebolt") {
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.type === "ice") {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.type === "cannonball") {
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#71717a";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (proj.type === "slash") {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 10, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 7. Draw Particles
  for (const p of engine.particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // 8. Draw OSRS Floating Hitsplats and XP Drops
  ctx.textAlign = "center";
  for (const h of engine.hitsplats) {
    const alpha = Math.min(1.0, h.life / (h.maxLife * 0.3));
    ctx.globalAlpha = alpha;

    if (h.type === "damage") {
      // Classic OSRS Red Shield Damage Splat
      const splatSize = 10;
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(h.x, h.y, splatSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Damage Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(h.text, h.x, h.y + 4);
    } else if (h.type === "xp") {
      // Golden XP Drop / Level up text
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#000000"; // drop shadow
      ctx.fillText(h.text, h.x + 1, h.y + 1);
      ctx.fillStyle = "#facc15"; // gold
      ctx.fillText(h.text, h.x, h.y);
    }

    ctx.globalAlpha = 1.0;
  }
}
