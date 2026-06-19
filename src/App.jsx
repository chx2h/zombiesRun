import React, { useState, useEffect, useRef } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.png'; // 배경 이미지 임포트
import ManualPage from './ManualPage'; // ManualPage 컴포넌트 임포트
import HistoryPage from './HistoryPage'; // HistoryPage 컴포넌트 임포트

function App() {
  const [view, setView] = useState('intro');
  const [gameMode, setGameMode] = useState('survival'); // 'survival' 또는 'run'
  const wakeLockSentinelRef = useRef(null); // WakeLockSentinel 객체를 저장할 Ref
  const [showExitAppConfirm, setShowExitAppConfirm] = useState(false); // 앱 종료 확인 모달 상태

  // 화면 전환 및 브라우저 히스토리 관리
  const navigate = (newView) => {
    setView(newView);
    window.history.pushState({ view: newView }, '', `#${newView}`);
  };

  useEffect(() => {
    // 뒤로가기/앞으로가기 버튼 처리
    const handlePopState = (event) => {
      // 인트로 화면에서 뒤로가기를 시도하면, 커스텀 종료 확인창을 띄웁니다.
      if (view === 'intro' && event.state === null) {
        setShowExitAppConfirm(true);
        // URL이 변경되는 것을 막기 위해 다시 intro 상태를 push합니다.
        window.history.pushState({ view: 'intro' }, '', '#intro');
        return;
      }

      const newView = event.state?.view || 'intro';
      setView(newView);
    };

    window.addEventListener('popstate', handlePopState);

    // 페이지 첫 로드 시 현재 해시값에 맞는 뷰를 보여주고, 없다면 #intro를 기본으로 설정
    const initialView = window.location.hash.substring(1) || 'intro';
    setView(initialView);
    window.history.replaceState({ view: initialView }, '', `#${initialView}`);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Wake Lock 요청 함수
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinelRef.current = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock is active!');
        // Wake Lock이 시스템에 의해 해제될 경우를 대비한 이벤트 리스너
        wakeLockSentinelRef.current.addEventListener('release', () => {
          console.log('Screen Wake Lock was released by the system.');
          // 필요하다면 여기서 다시 Wake Lock을 요청할 수 있지만, visibilitychange가 대부분의 경우를 처리합니다.
        });
      } catch (err) {
        console.error(`Wake Lock API 에러: ${err.name}, ${err.message}`);
      }
    } else {
      console.warn('Wake Lock API를 지원하지 않는 브라우저입니다.');
    }
  };

  // Wake Lock 해제 함수
  const releaseWakeLock = () => {
    if (wakeLockSentinelRef.current) {
      wakeLockSentinelRef.current.release();
      wakeLockSentinelRef.current = null;
      console.log('Screen Wake Lock이 수동으로 해제되었습니다.');
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && view === 'playing') {
        requestWakeLock(); // 페이지가 다시 보이면 Wake Lock 재요청
      } else if (wakeLockSentinelRef.current) {
        releaseWakeLock(); // 페이지가 숨겨지면 Wake Lock 해제
      }
    };

    if (view === 'playing') {
      requestWakeLock(); // 게임 시작 시 Wake Lock 요청
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock(); // 게임 종료 또는 인트로 화면 시 Wake Lock 해제
    }

    // 컴포넌트 언마운트 또는 view 변경 시 클린업
    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [view]); // view 상태가 변경될 때마다 useEffect 재실행

  if (view === 'playing') {
    return (
      <div className="App">
        <ZombieMapApp 
          key={gameMode} 
          gameMode={gameMode} 
          onExit={() => navigate('intro')}
          onSaveRecord={(record) => {
            const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
            savedRecords.push(record);
            localStorage.setItem('gameRecords', JSON.stringify(savedRecords));
          }}
        />
      </div>
    );
  }

  if (view === 'manual') {
    return (
      <ManualPage onBackToIntro={() => navigate('intro')} />
    );
  }

  if (view === 'history') {
    return (
      <HistoryPage onBackToIntro={() => navigate('intro')} />
    );
  }

  return (
    <div className="App intro-screen" style={{ backgroundImage: `url(${mainImg})` }}> {/* 배경 이미지 적용 */}
      <div className="intro-content">
        <div className="intro-menu">
          <button className="menu-btn start-button" onClick={() => {
            setGameMode('run');
            navigate('playing');
          }}>RUN</button>
          <button className="menu-btn start-button" onClick={() => {
            setGameMode('survival');
            navigate('playing');
          }}>SURVIVAL</button>
          <button className="menu-btn start-button" onClick={() => navigate('manual')}>
            TRAINING
          </button>
          <button className="menu-btn" onClick={() => navigate('history')}>
            기록
          </button>
        </div>
        <div className="intro-warning-message">
          <p>※ 일반 도로에서 사용 시 횡단보도나 주위 사물에 주의하며 안전하게 이용해 주세요.</p>
        </div>

        {/* 앱 종료 확인 레이어 */}
        {showExitAppConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
              <div className="hud-header">
                <div className="hud-mode-tag">EXIT APP</div>
                <div className="hud-status-dot"></div>
              </div>
              <div className="hud-main-display">
                <div className="hud-distance-text" style={{ fontSize: '1.1rem' }}>
                  앱을 종료하시겠습니까?
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={() => window.history.back()} // 실제 뒤로가기 실행
                  className="hud-reset-btn" 
                  style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
                >
                  YES
                </button>
                <button 
                  onClick={() => setShowExitAppConfirm(false)}
                  className="hud-reset-btn" 
                  style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
                >
                  NO
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
