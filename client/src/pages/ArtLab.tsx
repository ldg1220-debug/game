import { useState } from 'react';
import { PetSprite3D, PET_BODIES, type PetPose } from '../components/PetSprite3D';
import { PetSprite } from '../components/PetSprite';
import { getShape, REGIONS } from '../lib/petData';
import { CORE_ELEMENTS, ELEMENT_LABEL, type CoreElement } from '../lib/gameTypes';

/**
 * 아트 랩 — 42종을 한 화면에서 검수하는 화면.
 *
 * 포즈·속성을 바꿔가며 실루엣이 종마다 갈리는지, 등급이 그림에서 읽히는지
 * 확인한다. 체형 계열과 특징을 함께 표기해, 어떤 파라미터가 지금 실루엣을
 * 만들고 있는지 바로 대조할 수 있게 했다.
 */

const KIND_LABEL: Record<string, string> = {
  quadruped: '네발',
  biped: '이족',
  bird: '조류',
  blob: '젤리',
  shelled: '등껍질',
  serpent: '뱀',
  golem: '원소체',
};

const ARCH_LABEL: Record<string, string> = {
  canine: '개과',
  feline: '고양이과',
  ursine: '곰과',
  caprine: '우제류',
  lagomorph: '토끼류',
  reptile: '파충류',
};

/** 실루엣을 눈에 띄게 바꾸는 특징만 뽑아 배지로 보여준다 */
function traits(id: number): string[] {
  const b = PET_BODIES[id];
  if (!b) return [];
  const out: string[] = [];
  if (b.wings) out.push(b.wings === 'membrane' ? '막날개' : '깃날개');
  if (b.crest) out.push(b.crest === 'flame' ? '화염볏' : b.crest === 'feather' ? '깃볏' : '지느러미볏');
  if (b.horns) out.push({ curved: '나선뿔', antler: '가지뿔', tusk: '엄니', crystal: '수정뿔', spike: '가시뿔' }[b.horns]!);
  if (b.plates) out.push('등판');
  if (b.armor) out.push('장갑');
  if (b.aura) out.push('오라');
  if (b.crown) out.push('관');
  if (b.trunk) out.push('긴코');
  if (b.fins) out.push('지느러미');
  if (b.mane) out.push('갈기');
  if (b.spikes) out.push('등가시');
  if (b.pattern && b.pattern !== 'none') out.push(b.pattern === 'spots' ? '반점' : '줄무늬');
  if (b.glow) out.push('발광');
  return out;
}

export default function ArtLab() {
  const [pose, setPose] = useState<PetPose>('idle');
  const [element, setElement] = useState<CoreElement>('fire');
  const [show2d, setShow2d] = useState(false);
  const [big, setBig] = useState(false);

  // ?ids=1-14 로 범위를 좁힐 수 있다. 42종을 한 화면에 띄우면 소프트웨어 GL에서 너무 느리다.
  const range = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ids') : null;
  const [lo, hi] = range ? range.split('-').map(Number) : [0, 999];
  const ids = Object.keys(PET_BODIES)
    .map(Number)
    .filter((id) => id >= lo && id <= (hi || lo))
    .sort((a, b) => a - b);

  const size = big ? 190 : 132;
  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-xs transition ${
      on ? 'bg-gold-500 text-ink-950 font-semibold' : 'panel hover:border-gold-500/40'
    }`;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-heading text-gold-400">아트 랩 · 3D 펫 {ids.length}종</h1>
        <p className="text-xs text-slate-400 leading-relaxed max-w-prose">
          외부 이미지 없이 코드로만 생성한 3D 펫입니다. 포즈와 속성을 바꿔 실루엣이 종마다
          갈리는지, 등급 차이가 그림에서 읽히는지 확인해 주세요.
        </p>
      </header>

      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">포즈</span>
          {(['idle', 'attack', 'hurt', 'faint', 'victory'] as PetPose[]).map((p) => (
            <button key={p} onClick={() => setPose(p)} className={chip(pose === p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">속성</span>
          {CORE_ELEMENTS.map((e) => (
            <button key={e} onClick={() => setElement(e)} className={chip(element === e)}>
              {ELEMENT_LABEL[e]}
            </button>
          ))}
          <span className="w-3" />
          <button onClick={() => setBig((v) => !v)} className={chip(big)}>
            크게
          </button>
          <button onClick={() => setShow2d((v) => !v)} className={chip(show2d)}>
            2D 비교
          </button>
        </div>
      </div>

      {REGIONS.map((region) => {
        const rows = ids.filter((id) => getShape(id).region === region.id);
        if (!rows.length) return null;
        return (
          <section key={region.id} className="space-y-2">
            <h2 className="text-sm font-heading text-slate-300 border-b border-white/10 pb-1">
              {region.name}
              <span className="text-[11px] text-slate-500 font-normal ml-2">Lv.{region.levelRange[0]}~{region.levelRange[1]}</span>
            </h2>
            <div className={`grid gap-2 ${big ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
              {rows.map((id) => {
                const shape = getShape(id);
                const body = PET_BODIES[id];
                const t = traits(id);
                return (
                  <div key={id} className="panel p-2 flex flex-col">
                    {/* 레퍼런스와 같은 조건에서 보려고 흰 바탕 위에 올린다 */}
                    <div className="flex items-center justify-center gap-1 grow rounded bg-white">
                      {show2d && <PetSprite shapeId={id} element={element} size={48} motion="idle" />}
                      <PetSprite3D shapeId={id} element={element} size={size} pose={pose} seed={id} />
                    </div>
                    <p className="text-[11px] text-center text-slate-200 mt-1">{shape.name}</p>
                    <p className="text-[9px] text-center text-slate-500">
                      {KIND_LABEL[body.kind]}
                      {body.archetype ? ` · ${ARCH_LABEL[body.archetype]}` : ''}
                      {shape.rarity === 'boss' ? ' · 보스' : shape.rarity === 'rare' ? ' · 희귀' : ''}
                    </p>
                    {t.length > 0 && (
                      <p className="text-[9px] text-center text-gold-300/70 mt-0.5 leading-tight">
                        {t.join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
