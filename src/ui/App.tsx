import { getSpecies } from '../game/party';
import { STANCE_HINT, STANCE_LABEL, type Stance } from '../game/stances';
import { useGame } from '../game/store';
import { loyaltyTier } from '../engine/loyalty';
import { growthScore } from '../engine/types';
import { BattleScreen } from './BattleScreen';
import { FieldScreen } from './FieldScreen';

const STANCES: Stance[] = ['aggressive', 'capture', 'defensive', 'flee'];

const TIER_LABEL = {
  devoted: '헌신적',
  steady: '안정적',
  restless: '불안정',
  hostile: '적대적',
  leaving: '떠나려 한다',
} as const;

function PartyBar() {
  const party = useGame((s) => s.party);
  const character = useGame((s) => s.character);

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="unit">
          <div className="name">
            <span>{character.name}</span>
            <span className="muted">L{character.level}</span>
          </div>
          <div className={`hpbar ${character.hp / character.stats.hp < 0.25 ? 'crit' : character.hp / character.stats.hp < 0.5 ? 'low' : ''}`} style={{ marginTop: 5 }}>
            <i style={{ width: `${(character.hp / character.stats.hp) * 100}%` }} />
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            매력 {character.charm} · 정령 {character.spirits.length}
          </div>
        </div>

        {party.map((p) => {
          const sp = getSpecies(p.speciesId);
          const tier = loyaltyTier(p.loyalty);
          return (
            <div className="unit" key={p.uid}>
              <div className="name">
                <span>{p.nickname ?? sp.name}</span>
                <span className="muted">L{p.level}</span>
              </div>
              <div className="hpbar" style={{ marginTop: 5 }}>
                <i style={{ width: '100%' }} />
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                성장률 {growthScore(p.growth).toFixed(2)} · 충성 {p.loyalty}
                <span style={{ color: tier === 'restless' || tier === 'hostile' || tier === 'leaving' ? 'var(--danger)' : undefined }}>
                  {' '}
                  {TIER_LABEL[tier]}
                </span>
              </div>
            </div>
          );
        })}

        {party.length === 0 && <span className="muted small">동료가 없다.</span>}
      </div>
    </div>
  );
}

function StancePrompt() {
  const pending = useGame((s) => s.pending);
  const chooseStance = useGame((s) => s.chooseStance);
  if (!pending) return null;

  const levels = pending.enemies.map((e) => e.level);
  return (
    <div className="overlay">
      <div className="card">
        <h2>{pending.zone.name}</h2>
        <p className="small muted" style={{ margin: '2px 0 0' }}>
          {pending.enemies.map((e) => e.name).join(', ')} · Lv.{Math.min(...levels)}~{Math.max(...levels)}
        </p>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          전투는 고른 태세대로 끝까지 진행된다. 결과는 로그로 재생된다.
        </p>
        <div className="stances">
          {STANCES.map((s) => (
            <button key={s} onClick={() => chooseStance(s)}>
              <b>{STANCE_LABEL[s]}</b>
              <span>{STANCE_HINT[s]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useGame((s) => s.screen);

  return (
    <div className="app">
      <div className="title">STONEAGE — REBUILD</div>

      <div style={{ position: 'relative' }}>
        {screen === 'battle' ? <BattleScreen /> : <FieldScreen />}
        {screen === 'stance' && <StancePrompt />}
      </div>

      <PartyBar />
    </div>
  );
}
