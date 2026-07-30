import type { Element } from '../lib/gameTypes';
import { ELEMENT_COLOR, ELEMENT_LABEL } from '../lib/gameTypes';

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
