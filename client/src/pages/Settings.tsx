import { useState } from 'react';
import { useGame } from '../contexts/GameContext';

export default function Settings() {
  const { state, resetGame } = useGame();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">설정</h1>

      <div className="panel p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">테이머 이름</span>
          <span>{state.player.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">보유 골드</span>
          <span>{state.player.gold.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">포켓덱스 수집</span>
          <span>{state.pokedex.filter((e) => e.caught).length} / {state.pokedex.length}</span>
        </div>
      </div>

      <div className="panel p-4 space-y-3">
        <p className="text-sm text-slate-300">게임 데이터</p>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full py-2.5 rounded-lg bg-red-900/50 text-sm hover:bg-red-900/70"
          >
            게임 데이터 초기화
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-400">정말로 초기화하시겠습니까? 모든 진행 상황이 사라집니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  resetGame();
                  setConfirming(false);
                }}
                className="flex-1 py-2 rounded-lg bg-red-700 text-sm"
              >
                초기화
              </button>
              <button onClick={() => setConfirming(false)} className="flex-1 py-2 rounded-lg panel text-sm">
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-slate-600">Stone Age Chronicles - Phase 1 MVP</p>
    </div>
  );
}
