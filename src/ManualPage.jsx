import React, { useState, useEffect, useRef } from 'react';

export default function ManualPage({ onBackToIntro }) {
  const [activeTab, setActiveTab] = useState('survival'); // 'survival' | 'run' | 'record' | 'gear'
  const [demoDistance, setDemoDistance] = useState(35); // 0m ~ 60m
  const [isAudioRunning, setIsAudioRunning] = useState(true); // 기본 활성화
  const [isVibrating, setIsVibrating] = useState(false);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX; // 초기화
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (e.target.closest('.simulator-section') || e.target.closest('input') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const swipeThreshold = 60;

    const tabs = ['survival', 'run', 'record', 'gear'];
    const currentIndex = tabs.indexOf(activeTab);

    if (deltaX > swipeThreshold) {
      const nextIndex = Math.min(tabs.length - 1, currentIndex + 1);
      setActiveTab(tabs[nextIndex]);
    } else if (deltaX < -swipeThreshold) {
      const prevIndex = Math.max(0, currentIndex - 1);
      setActiveTab(tabs[prevIndex]);
    }
  };

  // Web Audio API를 위한 Ref
  const audioCtxRef = useRef(null);
  const heartbeatOscRef = useRef(null);
  const heartbeatGainRef = useRef(null);
  const ambientOscRef = useRef(null);
  const ambientGainRef = useRef(null);
  const intervalRef = useRef(null);

  // 컴포넌트 마운트 시 오디오 데모 자동 시작
  useEffect(() => {
    if (isAudioRunning) {
      startSyntheticZombieSound();
    }
  }, []);

  const demoDistanceRef = useRef(demoDistance);
  useEffect(() => {
    demoDistanceRef.current = demoDistance;
  }, [demoDistance]);

  const toggleAudioDemo = () => {
    if (!isAudioRunning) {
      startSyntheticZombieSound();
      setIsAudioRunning(true);
    } else {
      stopSyntheticZombieSound();
      setIsAudioRunning(false);
    }
  };

  const startSyntheticZombieSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const ambGain = ctx.createGain();
      const ambOsc = ctx.createOscillator();
      ambOsc.type = 'sawtooth';
      ambOsc.frequency.setValueAtTime(45, ctx.currentTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, ctx.currentTime);

      ambOsc.connect(filter);
      filter.connect(ambGain);
      ambGain.connect(ctx.destination);

      ambOsc.start();
      ambientOscRef.current = ambOsc;
      ambientGainRef.current = ambGain;

      const beatGain = ctx.createGain();
      beatGain.connect(ctx.destination);
      heartbeatGainRef.current = beatGain;

      setIsVibrating(true);

      const triggerHeartbeat = () => {
        const currentDist = demoDistanceRef.current;
        if (navigator.vibrate) {
          if (currentDist <= 10) {
            navigator.vibrate([200, 100, 200]);
          } else if (currentDist <= 25) {
            navigator.vibrate(100);
          }
        }
      };

      const runPulse = () => {
        triggerHeartbeat();
        const baseInterval = 1200;
        const factor = Math.max(0.1, demoDistanceRef.current / 50);
        const nextTime = baseInterval * factor;

        intervalRef.current = setTimeout(runPulse, nextTime);
      };

      runPulse();
    } catch (e) {
      console.error("Audio Context 실패:", e);
    }
  };

  const stopSyntheticZombieSound = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }
    if (ambientOscRef.current) {
      try { ambientOscRef.current.stop(); } catch (e) { }
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) { }
      audioCtxRef.current = null;
    }
    setIsAudioRunning(false);
    setIsVibrating(false);
  };

  useEffect(() => {
    if (isAudioRunning && ambientGainRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      const rawVol = demoDistance >= 50 ? 0 : (50 - demoDistance) / 50;
      const targetVolume = Math.max(0, Math.min(0.5, Math.pow(rawVol, 2) * 1.5));
      ambientGainRef.current.gain.linearRampToValueAtTime(targetVolume, now + 0.1);
    }
  }, [demoDistance, isAudioRunning]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) { }
      }
    };
  }, []);

  return (
    <div
      className="manual-page-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ background: '#020617', color: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <div className="grid-overlay" style={{ pointerEvents: 'none' }}></div>

      {/* 상단 시스템 헤더 */}
      <div className="manual-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(239, 68, 68, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="dot-ping" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
          <p className="system-tag" style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#ef4444', fontWeight: 'bold' }}>Tactical Guide</p>
        </div>
        <div className="version-tag" style={{ fontSize: '10px', color: '#64748b', fontFamily: 'Share Tech Mono' }}>SYS.VER 3.0</div>
      </div>

      {/* 메인 콘텐츠 바디 */}
      <div className="manual-main-content" style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h1 className="manual-main-title" style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0', fontFamily: "'Black Han Sans', sans-serif", letterSpacing: '0.5px', color: '#ffffff' }}>
            생존 지침서
          </h1>
          <p className="manual-subtitle" style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
            좀비 아포칼립스 상황에서 실시간으로 대처하기 위한 핵심 전술 수칙입니다.
          </p>
        </div>

        {/* 심플 탭 네비게이션 */}
        <div className="tab-nav" style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(0, 0, 0, 0.4)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {[
            { id: 'survival', label: '무한생존' },
            { id: 'run', label: '지정탈출' },
            { id: 'record', label: '경로개척' },
            { id: 'gear', label: '감지센서' }
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: '6px',
                  backgroundColor: isSelected ? '#ef4444' : 'transparent',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 탭 본문 내용 영역 (배경 이미지를 걷어내고 심플하고 세련된 다크 테마 적용) */}
        <div 
          className="manual-content-box"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)'
          }}
        >
          {/* TAB 1: SURVIVAL */}
          {activeTab === 'survival' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.15)', paddingBottom: '10px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif" }}>무한 생존 수칙</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>목적지 없이 움직인 발자취를 추격해오는 좀비로부터 생존하십시오.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1' }}>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>발자국 추적 메커니즘</strong>
                  사용자가 이동하며 남긴 고유의 궤적 라인을 좀비가 그대로 뒤쫓아옵니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>성장 및 가속 조건</strong>
                  30m 이상 좀비를 따돌릴 경우 좀비가 성장하며 추격 속도가 점진적으로 가속됩니다. 30m 이내로 들어와야 가속도가 초기화됩니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>비상 구급 상자</strong>
                  사망 시 30초의 광고 시청을 완료하면 안전거리 밖으로 좀비를 철수시키고 즉시 1회 부활합니다.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RUN */}
          {activeTab === 'run' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.15)', paddingBottom: '10px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif" }}>지정 탈출 수칙</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>설정한 목적지에 좀비보다 먼저 도달하여 탈출구로 진입하십시오.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1' }}>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>목적지 지정</strong>
                  지도 화면을 터치하여 도착 지점을 설정하면 해당 거점까지의 경로가 실시간 활성화됩니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>동시 출발 승부</strong>
                  좀비는 경로의 시작점에서 스폰되어 목표 지점으로 동일하게 이동합니다. 좀비보다 먼저 15m 지점 안쪽으로 통과해야 승리합니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>조정 가능한 난이도</strong>
                  시작 전 좀비의 기동 속도를 1부터 50레벨 범위 내에서 자유롭게 조정하여 훈련 강도를 세팅할 수 있습니다.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RECORD */}
          {activeTab === 'record' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.15)', paddingBottom: '10px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif" }}>경로 개척 수칙</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>도심 속 자주 달리는 본인의 기동 코스를 기록해 탈출로로 활용하십시오.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1' }}>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>GPS 경로 매핑</strong>
                  기록을 활성화한 채로 이동하면, 3m 단위로 좌표가 축적되어 독창적인 작전 경로로 기록됩니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>작전 경로 보관소 저장</strong>
                  완성된 경로는 고유 네이밍을 지정해 즐겨찾기에 등록할 수 있으며, 차후 탈출 훈련 모드에서 즉시 활성화할 수 있습니다.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GEAR */}
          {activeTab === 'gear' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.15)', paddingBottom: '10px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif" }}>감지 센서 피드백</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>청각과 촉각 피드백을 통해 보이지 않는 좀비의 근접을 기민하게 파악하십시오.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: '1.5', color: '#cbd5e1' }}>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>소음 경보 시스템</strong>
                  좀비가 50m 반경 내로 접근하면 고유의 괴성 사운드가 커지기 시작합니다.
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>위험 감지 햅틱</strong>
                  좀비가 25m 이내로 진입 시 약한 햅틱 진동이, 10m 이내 극도로 근접했을 때는 더블 임팩트 진동이 울립니다. (안드로이드 전용)
                </div>
                <div style={{ paddingLeft: '12px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>화면 테두리 섬광</strong>
                  25m 위험 구역에 진입하면 디스플레이 전면 가장자리에 붉은색 경고 섬광 효과가 작동해 즉각적인 인지를 돕습니다.
                </div>
              </div>
            </div>
          )}

          {/* 모의 훈련 패널 (이모지 및 조잡한 보더 칼라 정리, 시크한 테마 적용) */}
          <div className="simulator-section" style={{ borderTop: '1px solid rgba(239, 68, 68, 0.25)', marginTop: '8px', paddingTop: '16px' }}>
            <div className="simulator-panel" style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="simulator-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div className="simulator-info">
                  <span className="sim-badge" style={{ display: 'inline-block', fontSize: '9px', textTransform: 'uppercase', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', marginBottom: '3px' }}>Simulator</span>
                  <h4 style={{ margin: 0, fontSize: '13px', color: '#ffffff', fontWeight: 'bold' }}>피드백 모의 훈련</h4>
                </div>
                <button
                  onClick={toggleAudioDemo}
                  className={`sim-toggle-btn ${isAudioRunning ? 'running' : ''}`}
                  style={{
                    backgroundColor: isAudioRunning ? '#ef4444' : 'rgba(255,255,255,0.05)',
                    color: isAudioRunning ? '#ffffff' : '#94a3b8',
                    border: isAudioRunning ? 'none' : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {isAudioRunning ? '센서 비활성화' : '좀비 탐지 센서 작동'}
                </button>
              </div>

              <div className="sim-controls" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="sim-slider-wrapper">
                  <div className="slider-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontFamily: 'Share Tech Mono' }}>
                    <span>패닉 (0m)</span>
                    <span className="current-dist" style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '13px' }}>{demoDistance}m</span>
                    <span>안전 구역 (60m)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={demoDistance}
                    onChange={(e) => setDemoDistance(Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(to right, #ea580c, #ef4444)',
                      height: '6px',
                      borderRadius: '3px',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>

                <div className="sim-display" style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <div className="display-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="display-label" style={{ fontSize: '11px', color: '#64748b' }}>피드백 시그널</span>
                    <div className="display-value" style={{ fontFamily: 'Share Tech Mono', fontWeight: 'bold', fontSize: '13px' }}>
                      {demoDistance <= 5 ? (
                        <span style={{ color: '#ef4444' }}>위험: 추격 사망</span>
                      ) : demoDistance <= 15 ? (
                        <span style={{ color: '#f97316' }}>위험: 경보 수준 최고</span>
                      ) : demoDistance <= 35 ? (
                        <span style={{ color: '#facc15' }}>주의: 개체 감지됨</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>정상: 탐지 영역 밖</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 시작하기 전용 메인 액션 버튼 */}
      <div className="manual-footer" style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <button
          onClick={() => {
            stopSyntheticZombieSound();
            onBackToIntro();
          }}
          className="back-btn-main"
          style={{
            width: '100%',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '14px',
            fontSize: '15px',
            fontFamily: "'Black Han Sans', sans-serif",
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.35)',
            letterSpacing: '0.5px',
            textAlign: 'center'
          }}
        >
          훈련 종료, 메인으로 이동
        </button>
      </div>
    </div>
  );
}