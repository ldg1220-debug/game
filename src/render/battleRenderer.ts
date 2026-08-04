/**
 * 전투 화면 렌더러.
 *
 * 필드 렌더러와 같은 규칙: 읽기만 한다. 입력은 ReplayState 하나뿐이고, 그건
 * BattleEvent 로그에서 접어 만든 값이다. 여기서 피해를 계산하거나 상태를
 * 바꾸는 일은 없다.
 */

import type { ReplayUnit } from '../game/replay';
import type { Element } from '../engine/types';

const ELEMENT_COLOR: Record<Element, string> = {
  earth: '#8a7a4a',
  water: '#4a7fb0',
  fire: '#c4553a',
  wind: '#5aa88a',
};

/** 개체를 캔버스에 그린다. 스프라이트가 없으므로 속성색 실루엣으로 구분한다. */
function drawUnit(g: CanvasRenderingContext2D, u: ReplayUnit, x: number, y: number, w: number, h: number, t: number): void {
  const color = ELEMENT_COLOR[u.element.primary];
  const sub = u.element.secondary ? ELEMENT_COLOR[u.element.secondary] : null;
  const bob = u.fainted ? 0 : Math.sin(t / 420 + x) * 2.5;
  const cy = y + bob;

  g.save();
  if (u.fainted) g.globalAlpha = u.captured ? 0.25 : 0.32;

  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x + w / 2, y + h - 3, w * 0.3, h * 0.05, 0, 0, Math.PI * 2);
  g.fill();

  // 몸통 — 캐릭터는 사각, 펫은 둥근 실루엣으로 갈라 놓는다
  g.fillStyle = u.kind === 'character' ? '#9a7048' : color;
  g.beginPath();
  if (u.kind === 'character') {
    g.roundRect(x + w * 0.28, cy + h * 0.32, w * 0.44, h * 0.5, 5);
  } else {
    g.ellipse(x + w / 2, cy + h * 0.58, w * 0.32, h * 0.26, 0, 0, Math.PI * 2);
  }
  g.fill();

  // 부속성은 아래쪽 띠로
  if (sub) {
    g.fillStyle = sub;
    g.globalAlpha *= 0.75;
    g.fillRect(x + w * 0.3, cy + h * 0.74, w * 0.4, 4);
    g.globalAlpha /= 0.75;
  }

  // 머리
  g.fillStyle = u.kind === 'character' ? '#e0b58e' : color;
  g.beginPath();
  g.arc(x + w / 2, cy + h * 0.26, w * 0.19, 0, Math.PI * 2);
  g.fill();

  // 눈 — 쓰러지면 감는다
  g.fillStyle = '#15121a';
  if (u.fainted) {
    for (const s of [-1, 1]) {
      g.fillRect(x + w / 2 + s * w * 0.09 - 3, cy + h * 0.26, 6, 2);
    }
  } else {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(x + w / 2 + s * w * 0.08, cy + h * 0.25, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 피격/회복 플래시
  if (u.flash) {
    g.globalAlpha = 0.45;
    g.fillStyle = u.flash === 'hit' ? '#ff5a44' : u.flash === 'heal' ? '#7fe07f' : '#ffffff';
    g.beginPath();
    g.ellipse(x + w / 2, cy + h * 0.48, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // HP 바
  const barW = w * 0.72;
  const barX = x + (w - barW) / 2;
  const barY = y + h + 4;
  const ratio = Math.max(0, u.hp / u.maxHp);
  g.fillStyle = '#0d0d16';
  g.fillRect(barX, barY, barW, 5);
  g.fillStyle = ratio > 0.5 ? '#6bbf6b' : ratio > 0.22 ? '#e0b552' : '#d2503f';
  g.fillRect(barX, barY, barW * ratio, 5);
  g.strokeStyle = '#38384d';
  g.lineWidth = 1;
  g.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 4);

  // 이름과 레벨
  g.fillStyle = u.fainted ? '#6b6a7a' : '#e6e4dd';
  g.font = '11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(`${u.name} L${u.level}`, x + w / 2, barY + 17);

  // 상태이상 표식
  if (u.ailments.length > 0) {
    g.fillStyle = '#d2a03f';
    g.font = '10px system-ui, sans-serif';
    g.fillText('●'.repeat(u.ailments.length), x + w / 2, y - 4);
  }
  if (u.captured) {
    g.fillStyle = '#e0b552';
    g.font = '10px system-ui, sans-serif';
    g.fillText('포획', x + w / 2, y - 4);
  }
}

/** 한쪽 진영을 전열/후열로 나눠 배치한다. */
function layout(units: ReplayUnit[], left: number, width: number, topFront: number, topBack: number) {
  const front = units.filter((u) => u.row === 'front');
  const back = units.filter((u) => u.row === 'back');
  const place = (rows: ReplayUnit[], top: number) =>
    rows.map((u, i) => ({
      u,
      x: left + (width / (rows.length + 1)) * (i + 1) - 43,
      y: top,
    }));
  return [...place(back, topBack), ...place(front, topFront)];
}

export function drawBattle(g: CanvasRenderingContext2D, units: readonly ReplayUnit[], indoor: boolean): void {
  const { width: W, height: H } = g.canvas;
  const t = performance.now();

  const sky = g.createLinearGradient(0, 0, 0, H);
  if (indoor) {
    sky.addColorStop(0, '#1a1622');
    sky.addColorStop(1, '#0d0b12');
  } else {
    sky.addColorStop(0, '#2b3a4a');
    sky.addColorStop(1, '#1a2430');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // 바닥선 — 전열과 후열이 다른 깊이에 있다는 걸 보여준다
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (const y of [H * 0.42, H * 0.62, H * 0.82]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  const enemies = units.filter((u) => u.side === 'enemy');
  const allies = units.filter((u) => u.side === 'ally');

  const cells = [
    ...layout(enemies, 0, W, H * 0.24, H * 0.05),
    ...layout(allies, 0, W, H * 0.66, H * 0.47),
  ];

  for (const { u, x, y } of cells) drawUnit(g, u, x, y, 86, 86, t);
}
