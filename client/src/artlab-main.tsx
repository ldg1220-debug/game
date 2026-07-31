import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ArtLab from './pages/ArtLab';

/**
 * 아트 랩 단독 진입점.
 *
 * 게임 전체를 띄우지 않고 이 화면만 빌드해, 한 장짜리 HTML로 말아서
 * 어디서나 열어볼 수 있게 한다. 게임 컨텍스트를 쓰지 않으므로 Provider가
 * 필요 없다.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArtLab />
  </StrictMode>,
);
