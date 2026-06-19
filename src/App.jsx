import React, { useState, useEffect, useRef } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.png'; // 배경 이미지 임포트
import ManualPage from './ManualPage'; // ManualPage 컴포넌트 임포트
import HistoryPage from './HistoryPage'; // HistoryPage 컴포넌트 임포트

function App() {
  const [view, setView] = useState('intro');
  const [gameMode, setGameMode] = useState('survival'); // 'survival' 또는 'run'
  const wakeLockSentinelRef = useRef(null); // WakeLockSentinel 객체를 저장할 Ref

  // 화면 전환 및 브라우저 히스토리 관리
  const navigate = (newView) => {
    setView(newView);
    window.history.pushState({ view: newView }, '', `#${newView}`);
  };

  useEffect(() => {
    // 뒤로가기/앞으로가기 버튼 처리
    const handlePopState = (event) => {
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

  // 인트로 화면에서 브라우저/탭 종료 또는 새로고침 시 확인 창
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // 인트로 화면에 있을 때만 종료 확인 창을 띄웁니다.
      if (view === 'intro') {
        e.preventDefault();
        e.returnValue = ''; // 대부분의 최신 브라우저에서는 사용자 정의 메시지를 무시합니다.
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [view]); // view가 변경될 때마다 리스너를 재평가

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
      </div>
    </div>
  );
}

export default App;
