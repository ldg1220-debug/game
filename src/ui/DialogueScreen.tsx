import { visibleChoices } from '../game/dialogue';
import { objectiveProgress, objectiveTarget, objectiveText, questsFor, type QuestState } from '../game/quests';
import { getSpecies } from '../game/party';
import { getMap } from '../game/maps';
import { ITEMS } from '../game/inventory';
import { useGame } from '../game/store';
import { useWorldView } from './useCharacterView';

/**
 * 대화 화면.
 *
 * 선택지는 조건을 만족하는 것만 보인다 — 못 고르는 선택지를 회색으로 늘어놓으면
 * 화면만 복잡해지고, 무엇을 해야 하는지는 오히려 흐려진다.
 *
 * 이 NPC가 가진 퀘스트의 진행도를 함께 띄운다. 목표를 다시 보려고 대화를
 * 처음부터 되짚는 동선을 없애려는 것이다.
 */

const STATE_LABEL: Partial<Record<QuestState, string>> = {
  active: '진행 중',
  ready: '보고 가능',
  done: '완료',
};

/** 아이템·종·맵 id를 사람이 읽는 이름으로. 목표 문구가 id를 그대로 뱉지 않게 한다. */
function nameOf(id: string): string {
  if (ITEMS[id]) return ITEMS[id].name;
  try {
    return getSpecies(id).name;
  } catch {
    /* 종이 아니면 맵일 수 있다 */
  }
  try {
    return getMap(id).name;
  } catch {
    return id;
  }
}

export function DialogueScreen() {
  const talking = useGame((s) => s.talking);
  const questLog = useGame((s) => s.questLog);
  const world = useWorldView();
  const choose = useGame((s) => s.chooseDialogue);
  const advance = useGame((s) => s.advanceDialogue);

  if (!talking) return null;
  const { npc, node } = talking;
  const choices = visibleChoices(node, world);
  const tracked = questsFor(questLog, npc.id).filter((q) => q.state === 'active' || q.state === 'ready');

  return (
    <div className="overlay">
      <div className="card" style={{ width: 'min(640px, 94%)', textAlign: 'left' }}>
        <h2 style={{ margin: 0 }}>{npc.name}</h2>
        <p style={{ margin: '8px 0 0', lineHeight: 1.7 }}>{node.text}</p>

        {tracked.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            {tracked.map(({ quest, state, counts }) => (
              <div key={quest.id} style={{ marginBottom: 6 }}>
                <div className="small">
                  <strong>{quest.name}</strong>
                  <span className="tiny muted"> · {STATE_LABEL[state]}</span>
                </div>
                {quest.objectives.map((o, i) => {
                  const now = objectiveProgress(o, counts[i] ?? 0, world);
                  const target = objectiveTarget(o);
                  return (
                    <div key={i} className="tiny" style={{ color: now >= target ? 'var(--ok)' : 'var(--muted)' }}>
                      {now >= target ? '✓' : '·'} {objectiveText(o, nameOf)} ({now}/{target})
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {choices.length > 0 ? (
            choices.map((c, i) => (
              <button key={i} style={{ textAlign: 'left' }} onClick={() => choose(i)}>
                {c.text}
              </button>
            ))
          ) : (
            <button onClick={advance}>{node.next ? '계속' : '대화 마치기'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
