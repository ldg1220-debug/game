import {
  ELEMENT_COLOR,
  ELEMENT_LABEL,
  STATUS_COLOR,
  STATUS_ICON,
  STATUS_LABEL,
  activeElements,
  type CoreElement,
  type Element,
  type ElementPoints,
  type StatusEffect,
} from '../lib/gameTypes';

export function ElementBadge({ element, small }: { element: Element; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-ink-950 ${
        small ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
      }`}
      style={{ backgroundColor: ELEMENT_COLOR[element] }}
      title={ELEMENT_LABEL[element]}
    >
      {ELEMENT_LABEL[element]}
    </span>
  );
}

/** 원소 배분을 "화9 수1" 형태의 칩으로 표시한다. */
export function ElementPointsBadge({
  points,
  small,
  max = 4,
}: {
  points: ElementPoints;
  small?: boolean;
  max?: number;
}) {
  const list = activeElements(points).slice(0, max);
  return (
    <span className="inline-flex items-center gap-0.5">
      {list.map((e: CoreElement) => (
        <span
          key={e}
          className={`inline-flex items-center rounded font-semibold text-ink-950 ${
            small ? 'text-[9px] px-1 h-4' : 'text-[11px] px-1.5 h-5'
          }`}
          style={{ backgroundColor: ELEMENT_COLOR[e] }}
          title={`${ELEMENT_LABEL[e]} ${points[e]}`}
        >
          {ELEMENT_LABEL[e]}
          {points[e]}
        </span>
      ))}
    </span>
  );
}

/** 원소 배분을 막대로 시각화 (펫 상세용) */
export function ElementPointsBar({ points }: { points: ElementPoints }) {
  const list = activeElements(points);
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-ink-700">
      {list.map((e) => (
        <div
          key={e}
          style={{ backgroundColor: ELEMENT_COLOR[e], width: `${points[e] * 10}%` }}
          title={`${ELEMENT_LABEL[e]} ${points[e]}`}
        />
      ))}
    </div>
  );
}

export function StatusBadge({ effect, small }: { effect: StatusEffect; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded font-semibold ${
        small ? 'text-[9px] px-1 h-4' : 'text-[11px] px-1.5 h-5'
      }`}
      style={{ backgroundColor: `${STATUS_COLOR[effect]}33`, color: STATUS_COLOR[effect] }}
      title={STATUS_LABEL[effect]}
    >
      {STATUS_ICON[effect]}
      {!small && STATUS_LABEL[effect]}
    </span>
  );
}
