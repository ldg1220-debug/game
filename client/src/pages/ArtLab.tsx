import { useState } from 'react';
import { PetSprite3D, PET_BODIES, type PetPose } from '../components/PetSprite3D';
import { PetSprite } from '../components/PetSprite';
import { getShape } from '../lib/petData';
import { CORE_ELEMENTS, ELEMENT_LABEL, type CoreElement } from '../lib/gameTypes';

/** 아트 품질 비교용 프로토타입 화면 (2D SVG vs 3D 절차적 생성) */
export default function ArtLab() {
  const [pose, setPose] = useState<PetPose>('idle');
  const [element, setElement] = useState<CoreElement>('fire');
  const [show2d, setShow2d] = useState(false);
  // ?ids=1-14 로 범위를 좁힐 수 있다. 42종을 한 화면에 띄우면 소프트웨어 GL에서 너무 느리다.
  const range = new URLSearchParams(location.search).get('ids');
  const [lo, hi] = range ? range.split('-').map(Number) : [0, 999];
  const ids = Object.keys(PET_BODIES)
    .map(Number)
    .filter((id) => id >= lo && id <= (hi || lo))
    .sort((a, b) => a - b);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">아트 랩 · 3D 펫 {ids.length}종</h1>
      <div className="flex gap-1.5 flex-wrap">
        {(['idle', 'attack', 'hurt', 'faint', 'victory'] as PetPose[]).map((p) => (
          <button key={p} onClick={() => setPose(p)}
            className={`px-2.5 py-1 rounded text-xs ${pose === p ? 'bg-gold-500 text-ink-950' : 'panel'}`}>{p}</button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {CORE_ELEMENTS.map((e) => (
          <button key={e} onClick={() => setElement(e)}
            className={`px-3 py-1 rounded text-xs ${element === e ? 'bg-gold-500 text-ink-950' : 'panel'}`}>{ELEMENT_LABEL[e]}</button>
        ))}
        <button onClick={() => setShow2d((v) => !v)}
          className={`px-3 py-1 rounded text-xs ${show2d ? 'bg-gold-500 text-ink-950' : 'panel'}`}>2D 비교</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ids.map((id) => (
          <div key={id} className="panel p-1.5">
            <div className="flex items-center justify-center gap-1">
              {show2d && <PetSprite shapeId={id} element={element} size={48} motion="idle" />}
              <PetSprite3D shapeId={id} element={element} size={130} pose={pose} />
            </div>
            <p className="text-[10px] text-center text-slate-300 mt-0.5">{getShape(id).name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
