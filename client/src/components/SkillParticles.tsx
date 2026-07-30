import { useMemo } from 'react';
import { ELEMENT_PALETTE, type Element } from '../lib/gameTypes';

/**
 * 속성별 스킬 입자 이펙트 (완성도 가이드 5.1절).
 *
 * 캔버스 파티클 시스템 대신 CSS 애니메이션으로 구현했다. 입자 수가 12개 내외로
 * 적고 수명이 0.5초라 DOM으로 충분하며, 캔버스를 겹치면 전투 UI의 레이아웃과
 * 스크롤 처리가 복잡해진다. GPU 합성만 쓰도록 transform/opacity만 애니메이션한다.
 */

interface Shape {
  /** 입자 모양 */
  cls: string;
  count: number;
  spread: number;
}

const ELEMENT_SHAPE: Record<Element, Shape> = {
  fire: { cls: 'rounded-full', count: 14, spread: 46 },
  water: { cls: 'rounded-full', count: 12, spread: 42 },
  earth: { cls: 'rounded-[2px]', count: 12, spread: 38 },
  wind: { cls: 'rounded-full', count: 14, spread: 52 },
  none: { cls: 'rounded-full', count: 8, spread: 34 },
};

export function SkillParticles({ element }: { element: Element }) {
  const palette = ELEMENT_PALETTE[element];
  const shape = ELEMENT_SHAPE[element];

  // 마운트 시 한 번만 흩뿌림 방향을 정한다
  const particles = useMemo(
    () =>
      Array.from({ length: shape.count }, (_, i) => {
        const angle = (i / shape.count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = shape.spread * (0.55 + Math.random() * 0.45);
        return {
          id: i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          size: 3 + Math.random() * 4,
          delay: Math.random() * 90,
          color: i % 3 === 0 ? palette.accent : i % 3 === 1 ? palette.sub : palette.main,
        };
      }),
    [shape.count, shape.spread, palette],
  );

  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {/* 중심 섬광 */}
      <span
        className="absolute rounded-full particle-burst"
        style={{ width: 46, height: 46, background: `radial-gradient(circle, ${palette.accent}, transparent 70%)` }}
      />
      {particles.map((p) => (
        <span
          key={p.id}
          className={`absolute particle-fly ${shape.cls}`}
          style={
            {
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
