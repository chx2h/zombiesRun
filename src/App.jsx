import React, { useState, useEffect, useRef } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.jpg'; // 배경 이미지 임포트
import ManualPage from './ManualPage'; // ManualPage 컴포넌트 임포트
import FavoritesPage from './FavoritesPage'; // FavoritesPage 컴포넌트 임포트

function App() {
  const [view, setView] = useState('intro');
  const [reusedRoutePath, setReusedRoutePath] = useState(null);
  const [gameMode, setGameMode] = useState('survival'); // 'survival' 또는 'run'
  const [isReplay, setIsReplay] = useState(false); // 재플레이 판 플래그
  const wakeLockSentinelRef = useRef(null); // WakeLockSentinel 객체를 저장할 Ref
  const viewRef = useRef('intro');
  const isGameActiveRef = useRef(false);
  const triggerExitConfirmRef = useRef(null);

  const [geoPermissionState, setGeoPermissionState] = useState('granted'); // 'granted' | 'prompt' | 'denied'

  const checkPermission = () => {
    if (!navigator.geolocation) {
      setGeoPermissionState('denied');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((permissionStatus) => {
          setGeoPermissionState(permissionStatus.state);
          permissionStatus.onchange = () => {
            setGeoPermissionState(permissionStatus.state);
          };
        })
        .catch(() => {
          navigator.geolocation.getCurrentPosition(
            () => setGeoPermissionState('granted'),
            (err) => {
              if (err.code === err.PERMISSION_DENIED) {
                setGeoPermissionState('denied');
              } else {
                setGeoPermissionState('prompt');
              }
            },
            { timeout: 2000 }
          );
        });
    } else {
      navigator.geolocation.getCurrentPosition(
        () => setGeoPermissionState('granted'),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGeoPermissionState('denied');
          } else {
            setGeoPermissionState('prompt');
          }
        },
        { timeout: 2000 }
      );
    }
  };

  useEffect(() => {
    if (view === 'intro') {
      checkPermission();
    }
  }, [view]);

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

      // ──────────────────────────────────────────────────────────────
      // 🧟 [추가] 게임 중(playing) 물리 뒤로가기 시 맵 내부 🔙 버튼과 동일 작동 유도
      // ──────────────────────────────────────────────────────────────
      if (viewRef.current === 'playing' && isGameActiveRef.current && triggerExitConfirmRef.current) {
        // 뒤로 간 히스토리를 다시 playing 상태로 복원하여 오동작 방지
        window.history.pushState({ view: 'playing' }, '', '#playing');
        // 좀비 앱의 종료 확인 팝업 트리거 작동
        triggerExitConfirmRef.current();
        return;
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
          key={gameMode + (reusedRoutePath ? '-reused' : '') + (isReplay ? '-replay' : '')}
          gameMode={gameMode}
          initialRoutePath={reusedRoutePath}
          onExit={() => {
            setReusedRoutePath(null);
            setIsReplay(false);
            navigate('intro');
          }}
          onSaveRecord={(record) => {
            if (isReplay) {
              console.log("재플레이 세션이므로 기록을 누적하지 않습니다.");
              return;
            }
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
        onReplayRecord={(recordData) => {
          setReusedRoutePath(recordData.routePath);
          setGameMode(recordData.mode || 'run'); // 전달받은 모드(run 또는 survival)로 진행
          setIsReplay(true); // 리플레이 모드 활성화
          navigate('playing');
        }}
      />
    );
  }

  return (
    <div className="App intro-screen" style={{ backgroundImage: `url(${mainImg})` }}> {/* 배경 이미지 적용 */}
      <h1 className="intro-main-title">Zombies Run</h1>
      <div className="intro-content">
        {geoPermissionState !== 'granted' && (
          <div style={{
            margin: '0 auto 1.2rem auto',
            maxWidth: '340px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1.5px solid #ef4444',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            textAlign: 'center',
            fontSize: '12px',
            lineHeight: '1.5',
            boxSizing: 'border-box'
          }}>
            <strong style={{ color: '#ef4444', display: 'block', fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ 위치 권한 비활성화 상태
            </strong>
            실시간 GPS 추격 및 경로 매핑을 위해 기기의 <strong>위치 정보(GPS) 권한 허용이 필수</strong>입니다. 상단 브라우저 설정에서 권한을 허용해 주세요.
            <button 
              onClick={() => {
                navigator.geolocation.getCurrentPosition(
                  () => {
                    setGeoPermissionState('granted');
                    alert("위치 정보 권한이 성공적으로 허용되었습니다!");
                  },
                  (err) => {
                    alert("위치 권한을 다시 거부했거나 획득하지 못했습니다. 브라우저 설정 앱에서 직접 변경하셔야 합니다.");
                  }
                );
              }}
              style={{
                marginTop: '8px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            >
              위치 권한 다시 확인하기 / 요청하기
            </button>
          </div>
        )}
        <div className={`intro-menu ${geoPermissionState !== 'granted' ? 'has-warning' : ''}`}>
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('survival');
            setIsReplay(false);
            navigate('playing');
          }}>SURVIVAL</button>
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('run');
            setIsReplay(false);
            navigate('playing');
          }}>RUN</button>
          <button className="menu-btn start-button" onClick={() => {
            setReusedRoutePath(null);
            setGameMode('record');
            setIsReplay(false);
            navigate('playing');
          }}>경로 만들기</button>
          <button className="menu-btn start-button" onClick={() => navigate('manual')}>
            생존 매뉴얼
          </button>
          <button className="menu-btn" onClick={() => navigate('favorites')}>
            기록 보관소
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
