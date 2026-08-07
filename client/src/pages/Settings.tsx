import { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { audio } from '../lib/audio';

export default function Settings() {
  const { state, resetGame } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [muted, setMuted] = useState(audio.muted);
  const [volume, setVolume] = useState(audio.volume);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 page-enter">
      <h1 className="text-lg font-heading text-gold-400">설정</h1>

      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="mute" className="text-sm">
            소리
          </label>
          <button
            id="mute"
            role="switch"
            aria-checked={!muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              audio.setMuted(next);
              if (!next) audio.click();
            }}
            className={`px-3 py-1.5 rounded-md text-xs btn-press ${
              muted ? 'panel text-slate-400' : 'bg-emerald-600 text-white'
            }`}
          >
            {muted ? '꺼짐' : '켜짐'}
          </button>
        </div>
        <div>
          <label htmlFor="volume" className="text-xs text-slate-400 flex justify-between">
            <span>음량</span>
            <span>{Math.round(volume * 100)}%</span>
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            disabled={muted}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setVolume(v);
              audio.setVolume(v);
            }}
            className="w-full mt-1 accent-gold-400 disabled:opacity-40"
          />
        </div>
      </div>

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
          <span>
            {state.pokedex.filter((e) => e.caught).length} / {state.pokedex.length}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">개방한 지역</span>
          <span>{state.unlockedRegionIds.length}곳</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">보유 진화석</span>
          <span>{state.evolutionStones}개</span>
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
