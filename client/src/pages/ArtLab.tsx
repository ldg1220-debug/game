import { useState } from 'react';
import { PetSprite3D, PET_BODIES, type PetPose } from '../components/PetSprite3D';
import { PetSprite } from '../components/PetSprite';
import { getShape } from '../lib/petData';
import { CORE_ELEMENTS, ELEMENT_LABEL, type CoreElement } from '../lib/gameTypes';

/** 아트 품질 비교용 프로토타입 화면 (2D SVG vs 3D 절차적 생성) */
export default function ArtLab() {
  const [pose, setPose] = useState<PetPose>('idle');
  const [element, setElement] = useState<CoreElement>('fire');
  const ids = Object.keys(PET_BODIES).map(Number);

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">아트 비교 (2D ↔ 3D)</h1>
      <div className="flex gap-1.5 flex-wrap">
        {(['idle', 'attack', 'hurt', 'faint', 'victory'] as PetPose[]).map((p) => (
          <button key={p} onClick={() => setPose(p)}
            className={`px-2.5 py-1 rounded text-xs ${pose === p ? 'bg-gold-500 text-ink-950' : 'panel'}`}>{p}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {CORE_ELEMENTS.map((e) => (
          <button key={e} onClick={() => setElement(e)}
            className={`px-3 py-1 rounded text-xs ${element === e ? 'bg-gold-500 text-ink-950' : 'panel'}`}>{ELEMENT_LABEL[e]}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3">
        {ids.map((id) => (
          <div key={id} className="panel p-2">
            <p className="text-[11px] text-center mb-1">{getShape(id).name}</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <PetSprite shapeId={id} element={element} size={64} motion="idle" />
                <p className="text-[9px] text-slate-500">2D SVG</p>
              </div>
              <div className="text-center">
                <PetSprite3D shapeId={id} element={element} size={150} pose={pose} />
                <p className="text-[9px] text-gold-300">3D 절차적</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
