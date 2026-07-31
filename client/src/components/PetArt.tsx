import { useEffect, useState } from 'react';
import { PetSprite3D, type PetPose } from './PetSprite3D';
import type { CoreElement } from '../lib/gameTypes';

/**
 * 펫 아트 — 이미지가 있으면 이미지, 없으면 절차적 렌더링.
 *
 * 이 저장소에는 이미지 생성 도구가 없어서 스프라이트를 코드로 그려 왔다.
 * 하지만 원본 화풍은 그린 그림이지 실시간 3D가 아니다. 그래서 외부에서
 * 만든 스프라이트를 받을 자리를 열어 둔다.
 *
 * public/pets/{id}.png 가 있으면 그걸 쓰고, 없으면 기존 3D 렌더러로
 * 떨어진다. 한 종씩 넣어가며 교체할 수 있고, 코드를 고칠 필요가 없다.
 *
 * 픽셀 아트가 뭉개지지 않도록 image-rendering: pixelated로 확대한다.
 */

/** 이미 확인한 경로는 다시 요청하지 않는다 */
const known = new Map<number, boolean>();

function useSpriteFile(shapeId: number): boolean | null {
  const [has, setHas] = useState<boolean | null>(() => known.get(shapeId) ?? null);

  useEffect(() => {
    if (known.has(shapeId)) {
      setHas(known.get(shapeId)!);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      known.set(shapeId, true);
      if (alive) setHas(true);
    };
    img.onerror = () => {
      known.set(shapeId, false);
      if (alive) setHas(false);
    };
    img.src = `${import.meta.env.BASE_URL}pets/${shapeId}.png`;
    return () => {
      alive = false;
    };
  }, [shapeId]);

  return has;
}

export function PetArt({
  shapeId,
  element,
  size = 96,
  pose = 'idle',
  seed = 1,
  flipped = false,
  animated = true,
  className,
}: {
  shapeId: number;
  element: CoreElement;
  size?: number;
  pose?: PetPose;
  seed?: number;
  flipped?: boolean;
  animated?: boolean;
  className?: string;
}) {
  const has = useSpriteFile(shapeId);

  if (has) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}pets/${shapeId}.png`}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        className={className}
        style={{
          width: size,
          height: size,
          imageRendering: 'pixelated',
          transform: flipped ? 'scaleX(-1)' : undefined,
          // 포즈는 CSS 모션으로 흉내낸다. 스프라이트 시트가 들어오면 여기를 프레임 전환으로 바꾼다.
          animation:
            pose === 'attack' ? 'pet-attack 0.4s ease-out' :
            pose === 'hurt' ? 'pet-hurt 0.3s ease-out' :
            pose === 'faint' ? 'pet-faint 0.6s forwards' :
            pose === 'victory' ? 'pet-victory 1s ease-in-out infinite' :
            undefined,
        }}
      />
    );
  }

  // 아직 확인 중이면 자리를 잡아 둬서 레이아웃이 튀지 않게 한다
  if (has === null) return <div style={{ width: size, height: size }} className={className} aria-hidden="true" />;

  return (
    <PetSprite3D
      shapeId={shapeId}
      element={element}
      size={size}
      pose={pose}
      seed={seed}
      flipped={flipped}
      animated={animated}
      className={className}
    />
  );
}
