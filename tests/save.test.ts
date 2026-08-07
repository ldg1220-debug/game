import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, describeSave, loadSave, saveFileName, serializeSave, type SaveFile } from '../src/game/save';
import { useGame } from '../src/game/store';

/**
 * 세이브 테스트.
 *
 * 세이브가 지켜야 할 것은 셋이다.
 *   1. 왕복해도 상태가 그대로다
 *   2. 옛 버전을 올려서 읽는다
 *   3. **깨진 세이브가 게임을 깨뜨리지 않는다** — 실패는 이유로 돌아온다
 *
 * 셋째가 제일 중요하다. 남의 파일을 올리거나 손으로 고쳐 망가뜨리는 건 흔한
 * 일이고, 그때 예외가 튀면 화면이 통째로 하얘진다.
 */

function currentSave(): SaveFile {
  return useGame.getState().exportSave();
}

describe('세이브 왕복', () => {
  it('내보낸 걸 다시 읽으면 그대로다', () => {
    const save = currentSave();
    const r = loadSave(serializeSave(save));
    expect(r.error).toBeUndefined();
    expect(r.save).toEqual(save);
  });

  it('버전과 저장 시각이 들어간다', () => {
    const save = currentSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.savedAt).toBeGreaterThan(0);
  });

  it('일시적인 것은 담지 않는다', () => {
    // 상점·대화·전투는 세이브에 없다. 담으면 로드 직후 참조가 끊긴 화면에서 시작한다.
    const save = currentSave() as unknown as Record<string, unknown>;
    for (const key of ['shop', 'talking', 'pending', 'resolved', 'screen', 'messages']) {
      expect(save[key], key).toBeUndefined();
    }
  });

  it('스토어에 되돌려 넣으면 상태가 복원된다', () => {
    const before = currentSave();

    // 상태를 바꿔놓고
    useGame.setState({ stones: 999999, visited: ['village', 'meadow', 'marsh'] });
    expect(useGame.getState().stones).toBe(999999);

    // 옛 세이브를 불러오면 되돌아온다
    const ok = useGame.getState().importSave(serializeSave(before));
    expect(ok).toBe(true);
    expect(useGame.getState().stones).toBe(before.stones);
    expect(useGame.getState().visited).toEqual(before.visited);
    expect(useGame.getState().screen).toBe('field');
  });

  it('불러오면 화면이 반드시 필드다', () => {
    useGame.setState({ screen: 'shop' });
    useGame.getState().importSave(serializeSave(currentSave()));
    expect(useGame.getState().screen).toBe('field');
    expect(useGame.getState().shop).toBeNull();
    expect(useGame.getState().talking).toBeNull();
  });

  it('파일 이름에 날짜가 들어간다', () => {
    const name = saveFileName({ ...currentSave(), savedAt: new Date(2026, 7, 4, 9, 30).getTime() });
    expect(name).toBe('stoneage-20260804-0930.json');
  });

  it('요약이 사람이 읽을 수 있는 문장이다', () => {
    expect(describeSave(currentSave())).toMatch(/Lv\.\d+ · 펫 \d+ · 도감 \d+ · 의뢰 \d+ · [\d,]+ 스톤/);
  });
});

describe('마이그레이션', () => {
  /** Phase 4 시절의 세이브. 캐릭터가 stats를 들고 있었고 소지품이 없었다. */
  function v1Save(): Record<string, unknown> {
    return {
      version: 1,
      savedAt: 1700000000000,
      player: { mapId: 'meadow', tile: { x: 5, y: 5 }, target: null, progress: 0, facing: 'down', steps: 42 },
      character: {
        name: '탐험가',
        level: 9,
        exp: 100,
        charm: 12,
        stats: { hp: 300, atk: 40, def: 30, spd: 32 },
        hp: 250,
        skills: ['strike', 'gore'],
        spirits: ['stoneSkin'],
      },
      party: [
        {
          uid: 'p1',
          speciesId: 'emberfox',
          nickname: null,
          level: 9,
          exp: 0,
          growth: { hp: 3.5, atk: 1.0, def: 0.9, spd: 1.0 },
          currentStats: { hp: 70, atk: 19, def: 17, spd: 19 },
          loyalty: 70,
          skills: ['strike'],
          capturedAt: 0,
          seedUsed: 1,
        },
      ],
      box: [],
      danger: { gauge: 0.3, grace: 0 },
      rngState: 12345,
      tick: 7,
    };
  }

  it('v1 세이브를 현재 버전으로 올려 읽는다', () => {
    const r = loadSave(JSON.stringify(v1Save()));
    expect(r.error).toBeUndefined();
    expect(r.migratedFrom).toBe(1);
    expect(r.save!.version).toBe(SAVE_VERSION);
  });

  it('stats가 baseStats로 옮겨진다', () => {
    const r = loadSave(JSON.stringify(v1Save()));
    expect(r.save!.character.baseStats).toEqual({ hp: 300, atk: 40, def: 30, spd: 32 });
    expect((r.save!.character as unknown as Record<string, unknown>)['stats']).toBeUndefined();
    // 정령은 이제 장비에 깃든다. 캐릭터가 직접 들고 있던 건 버린다.
    expect((r.save!.character as unknown as Record<string, unknown>)['spirits']).toBeUndefined();
  });

  it('없던 필드는 빈 값으로 채워진다', () => {
    const r = loadSave(JSON.stringify(v1Save()));
    expect(r.save!.inventory).toEqual([]);
    expect(r.save!.equipment).toEqual({ weapon: null, armor: null, accessory: null });
    expect(r.save!.stones).toBe(0);
    expect(r.save!.questLog).toEqual({});
    expect(r.save!.dex).toEqual({ seen: [], caught: [] });
    // 방문 기록이 없으면 최소한 지금 있는 맵은 방문한 것으로 본다
    expect(r.save!.visited).toEqual(['meadow']);
  });

  it('원래 있던 값은 그대로 살아남는다', () => {
    const r = loadSave(JSON.stringify(v1Save()));
    expect(r.save!.player.steps).toBe(42);
    expect(r.save!.rngState).toBe(12345);
    expect(r.save!.party[0]!.uid).toBe('p1');
    expect(r.save!.character.level).toBe(9);
  });

  it('올린 세이브를 스토어가 실제로 받아들인다', () => {
    const ok = useGame.getState().importSave(JSON.stringify(v1Save()));
    expect(ok).toBe(true);
    expect(useGame.getState().character.level).toBe(9);
    expect(useGame.getState().player.mapId).toBe('meadow');
    expect(useGame.getState().stones).toBe(0);
  });

  it('현재 버전 세이브는 마이그레이션 표시가 없다', () => {
    expect(loadSave(serializeSave(currentSave())).migratedFrom).toBeUndefined();
  });
});

describe('깨진 세이브', () => {
  const cases: [string, string, string][] = [
    ['JSON이 아니면', '이건 그냥 글자다', 'notJson'],
    ['배열이면', '[1,2,3]', 'notSave'],
    ['버전이 없으면', '{"character":{}}', 'notSave'],
    ['버전이 숫자가 아니면', '{"version":"둘"}', 'notSave'],
    ['버전이 0이면', '{"version":0}', 'notSave'],
    ['더 새로운 버전이면', `{"version":${SAVE_VERSION + 1}}`, 'tooNew'],
  ];

  for (const [name, text, error] of cases) {
    it(`${name} 이유를 돌려준다`, () => {
      const r = loadSave(text);
      expect(r.save).toBeNull();
      expect(r.error).toBe(error);
      expect(r.message).toBeTruthy();
    });
  }

  it('내용이 손상되면 어디가 잘못됐는지 알려준다', () => {
    const bad = { ...currentSave(), stones: -5 };
    const r = loadSave(JSON.stringify(bad));
    expect(r.error).toBe('invalid');
    expect(r.message).toContain('stones');
  });

  it('필드가 통째로 빠져도 던지지 않는다', () => {
    const save = currentSave() as unknown as Record<string, unknown>;
    for (const key of Object.keys(save)) {
      const partial = { ...save };
      delete partial[key];
      expect(() => loadSave(JSON.stringify(partial)), key).not.toThrow();
    }
  });

  it('깨진 세이브를 불러도 상태가 그대로다', () => {
    // savedAt은 부를 때마다 달라지므로 비교에서 뺀다
    const snapshot = () => {
      const { savedAt: _savedAt, ...rest } = useGame.getState().exportSave();
      return JSON.stringify(rest);
    };
    const before = snapshot();
    const ok = useGame.getState().importSave('망가진 파일');
    expect(ok).toBe(false);
    expect(snapshot()).toBe(before);
    // 실패 이유는 화면에 남는다
    expect(useGame.getState().messages.at(-1)).toContain('세이브 파일이 아니다');
  });
});
