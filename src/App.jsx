import React, { useState } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.png'; // 배경 이미지 임포트

function App() {
  const [view, setView] = useState('intro');

  if (view === 'playing') {
    return (
      <div className="App">
        <ZombieMapApp />
      </div>
    );
  }

  return (
    <div className="App intro-screen" style={{ backgroundImage: `url(${mainImg})` }}> {/* 배경 이미지 적용 */}
      <div className="intro-content">
        <div className="intro-title-area">
          <h1 className="intro-title">Zombies Run</h1>
        </div>
        <div className="intro-warning-message"> {/* 경고 문구 위치 변경 */}
          <p>※ 일반 도로에서 사용 시 횡단보도나 주위 사물을 주의하며 안전하게 이용해 주세요.</p>
        </div>
        <div className="intro-menu">
          <button className="menu-btn" onClick={() => setView('playing')}>START</button>
          <button className="menu-btn">설정</button>
        </div>
      </div>
    </div>
  );
}

export default App;
