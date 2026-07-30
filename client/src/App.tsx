import { Route, Switch } from 'wouter';
import { GameProvider } from './contexts/GameContext';
import { EncounterProvider } from './contexts/EncounterContext';
import { BottomNav } from './components/BottomNav';
import Home from './pages/Home';
import ExploreScreen from './pages/ExploreScreen';
import BattleScreen from './pages/BattleScreen';
import PetManagement from './pages/PetManagement';
import Pokedex from './pages/Pokedex';
import PvP from './pages/PvP';
import Settings from './pages/Settings';

function App() {
  return (
    <GameProvider>
      <EncounterProvider>
        <div className="min-h-screen flex flex-col">
          <main className="flex-1 pb-2">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/explore" component={ExploreScreen} />
              <Route path="/battle" component={BattleScreen} />
              <Route path="/pets" component={PetManagement} />
              <Route path="/pokedex" component={Pokedex} />
              <Route path="/pvp" component={PvP} />
              <Route path="/settings" component={Settings} />
              <Route>
                <div className="p-8 text-center text-slate-400">페이지를 찾을 수 없습니다.</div>
              </Route>
            </Switch>
          </main>
          <BottomNav />
        </div>
      </EncounterProvider>
    </GameProvider>
  );
}

export default App;
