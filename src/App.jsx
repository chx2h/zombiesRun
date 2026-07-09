import React, { useState, useEffect, useRef } from 'react';
import ZombieMapApp from './ZombieMapApp';
import mainImg from './assets/main.jpg'; // 배경 이미지 임포트
import btnSurvivalBg from './assets/btn_survival_bg.png';
import btnRunBg from './assets/btn_run_bg.png';
import btnRecordBg from './assets/btn_record_bg.png';
import btnManualBg from './assets/btn_manual_bg.png';
import btnFavoritesBg from './assets/btn_favorites_bg.png';
import ManualPage from './ManualPage'; // ManualPage 컴포넌트 임포트
import FavoritesPage from './FavoritesPage'; // FavoritesPage 컴포넌트 임포트
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App as CapApp } from '@capacitor/app';

// 다이얼 돌릴 때 미세 햅틱 피드백 제공 함수
const triggerTickVibration = async () => {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }
};

const WheelColumn = ({ label, currentVal, onChangeVal }) => {
  const listRef = useRef(null);
  const itemHeight = 36;

  // 모멘텀/관성 물리 속성 refs
  const startY = useRef(0);
  const startOffset = useRef(0);
  // 1️⃣ 초기 마운트 오프셋 계산 공식 반전
  const currentOffset = useRef(-(9 - currentVal) * itemHeight);

  const lastY = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);
  const animationFrameRef = useRef(null);
  const isUserInteracting = useRef(false);

  useEffect(() => {
    if (!isUserInteracting.current) {
      // 2️⃣ 리액트 상태 변경 시 오프셋 계산 공식 반전
      currentOffset.current = -(9 - currentVal) * itemHeight;
      if (listRef.current) {
        listRef.current.style.transition = 'transform 0.15s cubic-bezier(0.1, 0.8, 0.25, 1)';
        listRef.current.style.transform = `translateY(${currentOffset.current}px)`;
      }
    }
  }, [currentVal]);

  const handleTouchStart = (e) => {
    isUserInteracting.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    startY.current = e.touches[0].clientY;
    startOffset.current = currentOffset.current;
    lastY.current = e.touches[0].clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const clientY = e.touches[0].clientY;
    const now = Date.now();
    const deltaY = clientY - startY.current;

    const rawOffset = startOffset.current + deltaY;
    const maxOffset = 0;
    const minOffset = -9 * itemHeight;
    const limitedOffset = Math.min(maxOffset, Math.max(minOffset, rawOffset));

    currentOffset.current = limitedOffset;

    if (listRef.current) {
      listRef.current.style.transform = `translateY(${limitedOffset}px)`;
      listRef.current.style.transition = 'none';
    }

    const timeDiff = now - lastTime.current;
    if (timeDiff > 0) {
      velocity.current = (clientY - lastY.current) / timeDiff;
      lastY.current = clientY;
      lastTime.current = now;
    }

    // 3️⃣ 드래그 이동 중 스크롤 인덱스를 실제 값(9 - index)으로 반전
    const currentIdx = Math.round(Math.abs(limitedOffset) / itemHeight);
    const calculatedVal = 9 - currentIdx;
    if (calculatedVal !== currentVal && calculatedVal >= 0 && calculatedVal <= 9) {
      onChangeVal(calculatedVal);
      triggerTickVibration();
    }
  };

  const handleTouchEnd = () => {
    let speed = velocity.current * 1.3;
    const maxOffset = 0;
    const minOffset = -9 * itemHeight;

    if (Math.abs(speed) > 0.15) {
      let lastTickIdx = Math.round(Math.abs(currentOffset.current) / itemHeight);

      const runMomentum = () => {
        speed *= 0.98;
        const nextOffset = currentOffset.current + speed * 16.7;

        if (nextOffset > maxOffset || nextOffset < minOffset) {
          speed = 0;
        }

        const boundedOffset = Math.min(maxOffset, Math.max(minOffset, nextOffset));
        currentOffset.current = boundedOffset;

        if (listRef.current) {
          listRef.current.style.transform = `translateY(${boundedOffset}px)`;
          listRef.current.style.transition = 'none';
        }

        const currentIdx = Math.round(Math.abs(boundedOffset) / itemHeight);
        if (currentIdx !== lastTickIdx && currentIdx >= 0 && currentIdx <= 9) {
          // 4️⃣ 관성 스크롤 중 호출되는 인덱스를 값으로 반전
          onChangeVal(9 - currentIdx);
          triggerTickVibration();
          lastTickIdx = currentIdx;
        }

        if (Math.abs(speed) > 0.01) {
          animationFrameRef.current = requestAnimationFrame(runMomentum);
        } else {
          snapToNearest();
        }
      };

      animationFrameRef.current = requestAnimationFrame(runMomentum);
    } else {
      snapToNearest();
    }
  };

  const snapToNearest = () => {
    const targetIdx = Math.round(Math.abs(currentOffset.current) / itemHeight);
    const snappedIdx = Math.min(9, Math.max(0, targetIdx));
    currentOffset.current = -snappedIdx * itemHeight;

    isUserInteracting.current = false;
    // 5️⃣ 최종 자석 안착 시 인덱스를 값으로 반전
    onChangeVal(9 - snappedIdx);
    triggerTickVibration();

    if (listRef.current) {
      listRef.current.style.transition = 'transform 0.2s cubic-bezier(0.1, 0.8, 0.25, 1)';
      listRef.current.style.transform = `translateY(${currentOffset.current}px)`;
    }
  };

  const handleMouseWheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1;
    const nextIdx = currentVal + direction;
    if (nextIdx >= 0 && nextIdx <= 9) {
      onChangeVal(nextIdx);
      triggerTickVibration();
    }
  };

  const handleItemClick = (idx) => {
    if (idx !== currentVal) {
      onChangeVal(idx);
      triggerTickVibration();
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 6️⃣ 다이얼 숫자를 거꾸로 [9, 8, 7 ... 0] 생성
  const digits = Array.from({ length: 10 }, (_, i) => 9 - i);

  return (
    <div
      className="dial-column-box"
      onWheel={handleMouseWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="dial-wheel-mask" />
      <div className="dial-wheel-center-line" />
      <div ref={listRef} className="dial-wheel-list">
        {digits.map((num) => (
          <div
            key={num}
            className={`dial-item ${num === currentVal ? 'active' : ''}`}
            onClick={() => handleItemClick(num)}
          >
            {num}
          </div>
        ))}
      </div>
      <div className="dial-column-label">{label}</div>
    </div>
  );
};
/**
 * 🎛️ 서바이벌 모드 목표 거리 세부 설정용 다이얼(Wheel) 피커 컴포넌트
 */
const SurvivalDialPicker = ({ value, onChange }) => {
  const valStr = value.toFixed(1).padStart(4, '0'); // "12.5" -> "12.5"
  const tens = parseInt(valStr[0], 10);
  const ones = parseInt(valStr[1], 10);
  const tenths = parseInt(valStr[3], 10);

  const handleWheelChange = (type, val) => {
    let nextTens = tens;
    let nextOnes = ones;
    let nextTenths = tenths;

    if (type === 'tens') nextTens = val;
    if (type === 'ones') nextOnes = val;
    if (type === 'tenths') nextTenths = val;

    const nextVal = nextTens * 10 + nextOnes + nextTenths * 0.1;
    onChange(parseFloat(nextVal.toFixed(1)));
  };

  return (
    <div className="dial-picker-wrapper">
      <div className="dial-picker-title">
        <span>🏃 Target Survival Distance</span>
      </div>

      <div className="dial-picker-container">
        <WheelColumn label="10km" currentVal={tens} onChangeVal={(v) => handleWheelChange('tens', v)} />
        <WheelColumn label="1km" currentVal={ones} onChangeVal={(v) => handleWheelChange('ones', v)} />
        <span className="dial-dot">.</span>
        <WheelColumn label="0.1km" currentVal={tenths} onChangeVal={(v) => handleWheelChange('tenths', v)} />
        <span className="dial-km-unit">km</span>
      </div>

      <div className="dial-result-badge">
        {value === 0.0 ? "무제한 생존 버티기 (∞)" : `목표 달성 조건: ${value.toFixed(1)} km 완주`}
      </div>
    </div>
  );
};

function App() {
  // --- [신규 추가] 최초 접속 사용자 가이드 온보딩 상태 ---
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedZombieSpeed, setSelectedZombieSpeed] = useState(14); // 기획안의 기본값인 14로 초기값 세팅

  const closeOnboarding = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    localStorage.setItem('survival_zombieSpeed', selectedZombieSpeed.toString());
    localStorage.setItem('run_zombieSpeed', selectedZombieSpeed.toString());
    setShowOnboarding(false);
  };
  const [view, setView] = useState('intro');
  const [showWebSplash, setShowWebSplash] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const [reusedRoutePath, setReusedRoutePath] = useState(null);
  const [gameMode, setGameMode] = useState('survival'); // 'survival' 또는 'run'
  const [isReplay, setIsReplay] = useState(false); // 재플레이 판 플래그
  const wakeLockSentinelRef = useRef(null); // WakeLockSentinel 객체를 저장할 Ref
  const viewRef = useRef('intro');
  const isGameActiveRef = useRef(false);
  const triggerExitConfirmRef = useRef(null);
  const handleHardwareBackRef = useRef(null);

  // --- 스플래시 타이머 셋업 ---
  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setSplashFadeOut(true);
    }, 2800);

    const removeTimer = setTimeout(() => {
      setShowWebSplash(false);
    }, 3700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // --- 최초 접속 시 온보딩 노출 여부 판단 ---
  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeen) {
      setShowOnboarding(true);
    }
  }, []);

  // --- 목표 거리 & 다이얼 셋업 상태 ---
  const [targetDistance, setTargetDistance] = useState(0.0); // 목표 달리기 거리 (km)
  const [showSurvivalSetup, setShowSurvivalSetup] = useState(false); // 서바이벌 셋업 레이어 유무
  const [showAppExitConfirm, setShowAppExitConfirm] = useState(false); // 앱 종료 확인 팝업 유무
  const showAppExitConfirmRef = useRef(false);
  const showSurvivalSetupRef = useRef(false);
  const showOnboardingRef = useRef(false);

  useEffect(() => {
    showAppExitConfirmRef.current = showAppExitConfirm;
  }, [showAppExitConfirm]);

  useEffect(() => {
    showSurvivalSetupRef.current = showSurvivalSetup;
  }, [showSurvivalSetup]);

  useEffect(() => {
    showOnboardingRef.current = showOnboarding;
  }, [showOnboarding]);

  // 화면 전환 및 브라우저 히스토리 관리
  const navigate = (newView) => {
    handleHardwareBackRef.current = null; // 뷰 전환 시 뒤로가기 위임 초기화
    setView(newView);
    viewRef.current = newView;
    window.history.pushState({ view: newView }, '', `#${newView}`);
  };

  const setHandleHardwareBack = (handler) => {
    handleHardwareBackRef.current = handler;
  };

  useEffect(() => {
    // 뒤로가기/앞으로가기 버튼 처리
    const handlePopState = (event) => {
      const newView = event.state?.view || 'intro';

      // 인트로(메인) 화면에서 뒤로가기 시 sub-page 역주행 전면 차단
      if (viewRef.current === 'intro') {
        window.history.pushState({ view: 'intro' }, '', '#intro');
        return;
      }

      // 게임 중(playing) 물리 뒤로가기 시 맵 내부 🔙 버튼과 동일 작동 유도
      if (viewRef.current === 'playing' && isGameActiveRef.current && triggerExitConfirmRef.current) {
        window.history.pushState({ view: 'playing' }, '', '#playing');
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

    // 안드로이드 하드웨어 뒤로가기 버튼 리스너 연동
    const backButtonListener = CapApp.addListener('backButton', () => {
      const currentView = viewRef.current;
      console.log("안드로이드 하드웨어 뒤로가기 감지. 현재 뷰:", currentView);

      // 온보딩이 켜져 있을 때는 localStorage 저장 안 하고 온보딩창만 닫음
      if (showOnboardingRef.current) {
        setShowOnboarding(false);
        return;
      }

      // 하위 컴포넌트(ZombieMapApp, FavoritesPage)에서 뒤로가기 이벤트를 소비했을 때 우선 리턴
      if (handleHardwareBackRef.current) {
        const handled = handleHardwareBackRef.current();
        if (handled) return;
      }

      if (currentView === 'intro') {
        if (showSurvivalSetupRef.current) {
          setShowSurvivalSetup(false);
        } else if (showAppExitConfirmRef.current) {
          setShowAppExitConfirm(false);
        } else {
          setShowAppExitConfirm(true);
        }
      } else if (currentView === 'playing') {
        // 게임 중(playing)일 때는 맵 내부 종료 컨펌 팝업 트리거
        if (isGameActiveRef.current && triggerExitConfirmRef.current) {
          triggerExitConfirmRef.current();
        } else {
          setReusedRoutePath(null);
          setIsReplay(false);
          navigate('intro');
        }
      } else if (currentView === 'manual' || currentView === 'favorites') {
        // 서브 페이지(생존 매뉴얼, 기록 보관소)에서는 메인 인트로 화면으로 원복
        navigate('intro');
      }
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      backButtonListener.then((listener) => listener.remove());
    };
  }, []);

  // Wake Lock 요청 함수
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinelRef.current = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock is active!');
        wakeLockSentinelRef.current.addEventListener('release', () => {
          console.log('Screen Wake Lock was released by the system.');
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
        requestWakeLock();
      } else if (wakeLockSentinelRef.current) {
        releaseWakeLock();
      }
    };

    if (view === 'playing') {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [view]);

  return (
    <div className="mobile-app-frame">
      {/* 🎬 영화 같은 웹 인트로 스플래시 화면 */}
      {showWebSplash && (
        <div className={`app-splash-screen ${splashFadeOut ? 'fade-out' : ''}`}>
          <div className="splash-logo-container">
            <div className="splash-zombie-icon">☣</div>
            <h1 className="splash-title">Zombies Run</h1>
            <p className="splash-subtitle">Survival Tracker</p>
          </div>
          <div className="splash-loader-wrapper">
            <div className="splash-loader-bar">
              <div className="splash-loader-fill"></div>
            </div>
            <span className="splash-status-text">SCANNING FOR INFECTIONS...</span>
          </div>
        </div>
      )}

      {view === 'playing' && (
        <div className="App" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
          <ZombieMapApp
            key={gameMode + (reusedRoutePath ? '-reused' : '') + (isReplay ? '-replay' : '')}
            gameMode={gameMode}
            initialRoutePath={reusedRoutePath}
            targetDistance={gameMode === 'survival' ? targetDistance : 0}
            onExit={() => {
              setReusedRoutePath(null);
              setIsReplay(false);
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
            setHandleHardwareBack={setHandleHardwareBack}
          />
        </div>
      )}

      {view === 'manual' && (
        <ManualPage onBackToIntro={() => navigate('intro')} />
      )}

      {view === 'favorites' && (
        <FavoritesPage
          onBackToIntro={() => navigate('intro')}
          onReplayRecord={(recordData) => {
            setReusedRoutePath(recordData.routePath);
            setGameMode(recordData.mode || 'run');
            setIsReplay(true);
            navigate('playing');
          }}
          setHandleHardwareBack={setHandleHardwareBack}
        />
      )}

      {view === 'intro' && (
        <div className="App intro-screen zoom-in-effect" style={{ backgroundImage: `url(${mainImg})`, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <h1 className="intro-main-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            Zombies Run
            <span
              onClick={(e) => {
                e.stopPropagation();
                setShowOnboarding(true);
                triggerTickVibration();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setShowOnboarding(true);
                triggerTickVibration();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1.5px solid #ef4444',
                fontSize: '16px',
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.45)',
                animation: 'onboardingCompassBlink 2.5s infinite alternate',
                userSelect: 'none',
                pointerEvents: 'auto',
                zIndex: 99999
              }}
            >
              🧭
            </span>
          </h1>
          <div className="intro-content">
            <div className="intro-menu">
              <button
                className="menu-btn start-button menu-btn-survival"
                style={{ backgroundImage: `url(${btnSurvivalBg})` }}
                onClick={() => {
                  setReusedRoutePath(null);
                  setGameMode('survival');
                  setIsReplay(false);
                  setTargetDistance(0.0); // 초기화
                  setShowSurvivalSetup(true); // 다이얼 셋업 모달 켜기
                }}
              >
                SURVIVAL
              </button>
              <button
                className="menu-btn start-button menu-btn-run"
                style={{ backgroundImage: `url(${btnRunBg})` }}
                onClick={() => {
                  setReusedRoutePath(null);
                  setGameMode('run');
                  setIsReplay(false);
                  navigate('playing');
                }}
              >
                RUN
              </button>
              <button
                className="menu-btn start-button menu-btn-record"
                style={{ backgroundImage: `url(${btnRecordBg})` }}
                onClick={() => {
                  setReusedRoutePath(null);
                  setGameMode('record');
                  setIsReplay(false);
                  navigate('playing');
                }}
              >
                코스 만들기
              </button>
              <button
                className="menu-btn start-button menu-btn-manual"
                style={{ backgroundImage: `url(${btnManualBg})` }}
                onClick={() => navigate('manual')}
              >
                생존 매뉴얼
              </button>
              <button
                className="menu-btn menu-btn-favorites"
                style={{ backgroundImage: `url(${btnFavoritesBg})` }}
                onClick={() => navigate('favorites')}
              >
                기록 보관소
              </button>
            </div>
            <div className="intro-warning-message">
              <p>※ 일반 도로에서 사용 시 횡단보도나 주위 사물에 주의하며 안전하게 이용해 주세요.</p>
            </div>

            {/* 🎛️ 서바이벌 목표 설정 다이얼 팝업 모달 */}
            {showSurvivalSetup && (
              <div
                className="app-modal-overlay"
                onClick={() => setShowSurvivalSetup(false)}
              >
                <div
                  className="app-modal-container app-modal-size-survival"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="hud-header">
                    <div className="hud-mode-tag" style={{ color: '#f43f5e' }}>SURVIVAL SETTING</div>
                    <div className="hud-status-dot" style={{ backgroundColor: '#f43f5e' }}></div>
                  </div>

                  <div style={{ margin: '12px 0' }}>
                    <SurvivalDialPicker value={targetDistance} onChange={setTargetDistance} />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button
                      onClick={() => {
                        setShowSurvivalSetup(false);
                      }}
                      className="hud-reset-btn"
                      style={{ flex: 0.8, backgroundColor: '#334155', border: 'none' }}
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        setShowSurvivalSetup(false);
                        navigate('playing');
                      }}
                      className="hud-reset-btn"
                      style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none', fontWeight: 'bold' }}
                    >
                      질주 시작
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 🎛️ 앱 종료 확인 팝업 모달 */}
            {showAppExitConfirm && (
              <div
                className="app-modal-overlay"
                onClick={() => setShowAppExitConfirm(false)}
              >
                <div
                  className="app-modal-container app-modal-size-exit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="hud-header">
                    <div className="hud-mode-tag" style={{ color: '#ef4444' }}>EXIT APP</div>
                    <div className="hud-status-dot" style={{ backgroundColor: '#ef4444' }}></div>
                  </div>

                  <div className="hud-main-display" style={{ padding: '12px 0', border: 'none', background: 'none', boxShadow: 'none' }}>
                    <div className="hud-distance-text" style={{ fontSize: '0.95rem', color: '#f1f5f9', lineHeight: '1.4' }}>
                      탈출을 잠시 중단하고<br />구역을 완전히 이탈하시겠습니까?
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button
                      onClick={() => {
                        setShowAppExitConfirm(false);
                      }}
                      className="hud-reset-btn"
                      style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
                    >
                      취소 (NO)
                    </button>
                    <button
                      onClick={() => {
                        CapApp.exitApp();
                      }}
                      className="hud-reset-btn"
                      style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold' }}
                    >
                      종료 (YES)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 🧭 최초 접속 사용자 가이드 온보딩 화면 */}
      {showOnboarding && (
        <div className="onboarding-overlay" onClick={closeOnboarding}>
          <div className="onboarding-container" onClick={(e) => e.stopPropagation()}>
            {/* 상단 헤더 */}
            <div className="onboarding-header">
              <span className="onboarding-guide-tag">● SURVIVAL GUIDE</span>
              <button className="onboarding-skip-btn" onClick={closeOnboarding}>
                건너뛰기 &times;
              </button>
            </div>

            {/* 메인 카피 */}
            <div className="onboarding-title-section">
              <div className="onboarding-sub-title">ZOMBIES, RUN</div>
              <h2 className="onboarding-main-title">달리지 않으면<br />죽는다</h2>
              <p className="onboarding-desc-text">
                <strong style={{ color: '#ffffff' }}>좀비는 당신의 실제 발자국을 따라옵니다.</strong><br />
              </p>
            </div>

            {/* 01 - 핵심 규칙 */}
            <div className="onboarding-section">
              <div className="onboarding-sec-label">01 - 핵심 규칙</div>
              <div className="onboarding-sec-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <h4 className="onboarding-sec-title">5m 안에 잡히면 <span className="text-highlight-red">사망</span></h4>
                  <p className="onboarding-sec-desc">
                    30m 밖으로 벌리면 좀비가 <strong style={{ color: '#ff4d4d' }}>레벨업</strong>합니다.<br />
                    골목으로 꺾어 따돌리세요.
                  </p>
                </div>
                {/* 우측 좀비 추격 미니 일러스트 SVG */}
                <div className="onboarding-svg-wrapper">
                  <svg width="85" height="70" viewBox="0 0 85 70" fill="none">
                    <path d="M12,60 Q25,50 20,32 T60,28 T70,8" stroke="#ef4444" strokeWidth="2.5" strokeDasharray="5,4" strokeLinecap="round" />
                    <circle cx="12" cy="60" r="5.5" fill="#ef4444" />
                    <circle cx="17" cy="58" r="3.5" fill="#ef4444" opacity="0.7" />
                    <circle cx="11" cy="53" r="3" fill="#ef4444" opacity="0.5" />
                    <circle cx="70" cy="8" r="6" fill="#ffffff" />
                    <circle cx="70" cy="8" r="10" stroke="#ffffff" strokeWidth="1" opacity="0.4" className="onboarding-pulse-ring" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 02 - 게임 모드 */}
            <div className="onboarding-section">
              <div className="onboarding-sec-label">02 - 게임 모드</div>
              <div className="onboarding-mode-list">
                <div className="onboarding-mode-row">
                  <div className="onboarding-mode-name">SURVIVAL</div>
                  <div className="onboarding-mode-info">
                    <h5 className="onboarding-mode-title">무한 추격 생존</h5>
                    <p className="onboarding-mode-desc">내 발자취를 쫓는 좀비를 최대한 오래 따돌리기</p>
                  </div>
                </div>
                <div className="onboarding-mode-row">
                  <div className="onboarding-mode-name">RUN</div>
                  <div className="onboarding-mode-info">
                    <h5 className="onboarding-mode-title">목적지 레이스</h5>
                    <p className="onboarding-mode-desc">지도에 목적지를 찍고 좀비보다 먼저 도착하면 승리</p>
                  </div>
                </div>
                <div className="onboarding-mode-row">
                  <div className="onboarding-mode-name">RECORD</div>
                  <div className="onboarding-mode-info">
                    <h5 className="onboarding-mode-title">나만의 탈출로</h5>
                    <p className="onboarding-mode-desc">직접 걸어 코스를 저장하고 두 모드에 불러 쓰기</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 03 - 감각 경고 */}
            <div className="onboarding-section">
              <div className="onboarding-sec-label">03 - 감각 경고</div>
              <div className="onboarding-alert-grid">
                <div className="onboarding-alert-col">
                  <div className="onboarding-alert-dist dist-orange">50m</div>
                  <div className="onboarding-alert-text">포효 사운드</div>
                </div>
                <div className="onboarding-alert-col">
                  <div className="onboarding-alert-dist dist-red">25m</div>
                  <div className="onboarding-alert-text">화면 붉은 경고</div>
                </div>
                <div className="onboarding-alert-col">
                  <div className="onboarding-alert-dist dist-critical">10m</div>
                  <div className="onboarding-alert-text">강한 진동</div>
                </div>
              </div>
            </div>

            {/* 04 - 좀비 속도 조절 */}
            <div className="onboarding-section">
              <div className="onboarding-sec-label" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>04 - 좀비 속도</span>
                <span className="onboarding-speed-badge">
                  {selectedZombieSpeed}/50 · <strong className="speed-text-highlight" style={{
                    color: selectedZombieSpeed <= 12 ? '#10b981' : selectedZombieSpeed <= 25 ? '#f59e0b' : selectedZombieSpeed <= 39 ? '#f97316' : '#ef4444'
                  }}>
                    {getSpeedLabel(selectedZombieSpeed)}
                  </strong>
                </span>
              </div>
              <div className="onboarding-slider-wrapper">
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={selectedZombieSpeed}
                  onChange={(e) => {
                    setSelectedZombieSpeed(parseInt(e.target.value));
                    triggerTickVibration();
                  }}
                  className="onboarding-speed-slider"
                />
                <div className="onboarding-slider-captions">
                  <span>1 느긋</span>
                  <span>50 광란</span>
                </div>
              </div>
            </div>

            {/* 살아남기 시작 버튼 */}
            <button className="onboarding-start-btn" onClick={closeOnboarding}>
              살아남기 &nbsp;▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const getSpeedLabel = (speed) => {
  if (speed <= 12) return '느긋';
  if (speed <= 25) return '보통';
  if (speed <= 39) return '빠름';
  return '광란';
};

export default App;
