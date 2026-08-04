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

/**
 * 퀘스트·대화가 보는 좁은 창.
 *
 * characterView와 같은 이유로 memo가 필요하다 — Set과 클로저를 매번 새로
 * 만들기 때문에 셀렉터로 직접 넘기면 무한 렌더가 된다.
 */
export function useWorldView() {
  const character = useGame((s) => s.character);
  const inventory = useGame((s) => s.inventory);
  const visited = useGame((s) => s.visited);
  const questLog = useGame((s) => s.questLog);
  return useMemo(
    () => ({
      level: character.level,
      itemCount: (id: string) => inventory.reduce((n, x) => (x.itemId === id ? n + x.qty : n), 0),
      visited: new Set(visited),
      questsDone: new Set(
        Object.entries(questLog).filter(([, p]) => p.state === 'done').map(([id]) => id),
      ),
      questLog,
    }),
    [character.level, inventory, visited, questLog],
  );
}
