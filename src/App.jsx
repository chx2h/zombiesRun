import React, { useState, useEffect, useRef } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.jpg'; // 배경 이미지 임포트
import ManualPage from './ManualPage'; // ManualPage 컴포넌트 임포트
import FavoritesPage from './FavoritesPage'; // FavoritesPage 컴포넌트 임포트

function App() {
  const [view, setView] = useState('intro');
  const [reusedRoutePath, setReusedRoutePath] = useState(null);
  const [gameMode, setGameMode] = useState('survival'); // 'survival' 또는 'run'
  const wakeLockSentinelRef = useRef(null); // WakeLockSentinel 객체를 저장할 Ref
  const viewRef = useRef('intro');
  const isGameActiveRef = useRef(false);
  const triggerExitConfirmRef = useRef(null);

  // 화면 전환 및 브라우저 히스토리 관리
  const navigate = (newView) => {
    setView(newView);
    viewRef.current = newView;
    window.history.pushState({ view: newView }, '', `#${newView}`);
  };

  useEffect(() => {
    // 뒤로가기/앞으로가기 버튼 처리
    const handlePopState = (event) => {
      const newView = event.state?.view || 'intro';

      // ──────────────────────────────────────────────────────────────
      // ✨ [추가] 인트로(메인) 화면에서 뒤로가기 시 sub-page 역주행 전면 차단
      // ──────────────────────────────────────────────────────────────
      if (viewRef.current === 'intro') {
        // 현재 화면이 인트로인데 뒤로 가려고 하면, 
        // 히스토리 스택에 다시 인트로를 밀어 넣어 화면 이동을 물리적으로 무력화합니다.
        window.history.pushState({ view: 'intro' }, '', '#intro');
        return; // 더 이상 아래 view 업데이트 로직이 실행되지 않도록 리턴
      }

      setView(newView);
      viewRef.current = newView;
    };

    window.addEventListener('popstate', handlePopState);

    // 페이지 첫 로드 시 현재 해시값에 맞는 뷰를 보여주고, 없다면 #intro를 기본으로 설정
    const initialView = window.location.hash.substring(1) || 'intro';
    setView(initialView);
    viewRef.current = initialView;
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
          key={gameMode + (reusedRoutePath ? '-reused' : '')}
          gameMode={gameMode}
          initialRoutePath={reusedRoutePath}
          onExit={() => {
            setReusedRoutePath(null);
            navigate('intro');
          }}
          onSaveRecord={(record) => {
            const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
            savedRecords.push(record);
            localStorage.setItem('gameRecords', JSON.stringify(savedRecords));
          }}
          setIsGameActive={(active) => {
            isGameActiveRef.current = active;
          }}
          setTriggerExitConfirm={(trigger) => {
            triggerExitConfirmRef.current = trigger;
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

  if (view === 'favorites') {
    return (
      <FavoritesPage
        onBackToIntro={() => navigate('intro')}
        onReplayRecord={(record) => {
          setReusedRoutePath(record.routePath);
          setGameMode('run'); // 즐겨찾기 경로를 클릭하면 무조건 RUN 모드로 진행
          navigate('playing');
        }}
      />
    );
  }

  return (
    <div className="App intro-screen" style={{ backgroundImage: `url(${mainImg})` }}> {/* 배경 이미지 적용 */}
      <h1 className="intro-main-title">Zombies Run</h1>
      <div className="intro-content">
        <div className="intro-menu">
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('survival');
            navigate('playing');
          }}>SURVIVAL</button>
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('run');
            navigate('playing');
          }}>RUN</button>
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('record');
            navigate('playing');
          }}>경로 만들기</button>
          <button className="menu-btn start-button" onClick={() => navigate('manual')}>
            생존 설명서
          </button>
          <button className="menu-btn" onClick={() => navigate('favorites')}>
            즐겨찾기
          </button>
        </div>
        <div className="intro-warning-message">
          <p>※ 일반 도로에서 사용 시 횡단보도나 주위 사물에 주의하며 안전하게 이용해 주세요.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
