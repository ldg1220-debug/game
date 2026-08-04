import { useMemo } from 'react';
import { characterView, useGame } from '../game/store';

/**
 * 장비까지 반영한 캐릭터 파생값.
 *
 * characterView는 매번 새 객체를 돌려주므로 셀렉터로 직접 넘기면 참조 비교가
 * 항상 실패해 무한 렌더 루프가 된다(실제로 한 번 밟았다). 스토어에서는 참조가
 * 안정된 조각만 꺼내고, 계산은 여기서 memo로 한 번만 한다.
 */
export function useCharacterView() {
  const character = useGame((s) => s.character);
  const equipment = useGame((s) => s.equipment);
  const inventory = useGame((s) => s.inventory);
  return useMemo(
    () => characterView(character, equipment, inventory),
    [character, equipment, inventory],
  );
}
