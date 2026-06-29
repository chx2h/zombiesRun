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
    // 모의 훈련 시뮬레이터 슬라이더 등의 터치는 스와이프 탭 이동에서 제외
    if (e.target.closest('.simulator-section') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const swipeThreshold = 60; // 스와이프 감지를 위한 최소 임계값 (px)

    const tabs = ['survival', 'run', 'record', 'gear'];
    const currentIndex = tabs.indexOf(activeTab);

    if (deltaX > swipeThreshold) {
      // 오른쪽에서 왼쪽으로 스와이프 -> 다음 탭으로
      const nextIndex = Math.min(tabs.length - 1, currentIndex + 1);
      setActiveTab(tabs[nextIndex]);
    } else if (deltaX < -swipeThreshold) {
      // 왼쪽에서 오른쪽으로 스와이프 -> 이전 탭으로
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
  }, []); // 빈 배열로 한 번만 실행

  // 실시간 거리 값을 루프 내에서 참조하기 위한 Ref
  const demoDistanceRef = useRef(demoDistance);
  useEffect(() => {
    demoDistanceRef.current = demoDistance;
  }, [demoDistance]);

  // 데모 사운드 켜기/끄기 토글
  const toggleAudioDemo = () => {
    if (!isAudioRunning) {
      startSyntheticZombieSound();
      setIsAudioRunning(true);
    } else {
      stopSyntheticZombieSound();
      setIsAudioRunning(false);
    }
  };

  // Web Audio API로 가상의 좀비 소리 및 심장박동 음향 합성 (외부 파일 없이 작동 가능)
  const startSyntheticZombieSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      // 1. 음산한 분위기 저주파 배경 노이즈 생성
      const ambGain = ctx.createGain();
      const ambOsc = ctx.createOscillator();
      ambOsc.type = 'sawtooth';
      ambOsc.frequency.setValueAtTime(45, ctx.currentTime); // 아주 낮은 저음좀비 신음 느낌

      // 저주파 필터로 웅웅거리게 조절
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, ctx.currentTime);

      ambOsc.connect(filter);
      filter.connect(ambGain);
      ambGain.connect(ctx.destination);

      ambOsc.start();
      ambientOscRef.current = ambOsc;
      ambientGainRef.current = ambGain;

      // 2. 심장박동(쿵쾅) 효과를 주기 위한 반복 루프 설정
      const beatGain = ctx.createGain();
      beatGain.connect(ctx.destination);
      heartbeatGainRef.current = beatGain;

      setIsVibrating(true);

      const triggerHeartbeat = () => {
        const now = ctx.currentTime;
        const currentDist = demoDistanceRef.current;

        // 심장 소리 합성 (비활성화)
        /*
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0, now);
        // 거리가 가까울수록 심박 소리가 강해짐
        const rawVol = currentDist >= 50 ? 0 : (50 - currentDist) / 50;
        oscGain.gain.linearRampToValueAtTime(Math.min(1.2, Math.pow(rawVol, 2) * 1.5 * 0.8), now + 0.05); // 최대 1.2
        oscGain.gain.linearRampToValueAtTime(0, now + 0.3);

        osc.connect(oscGain);
        oscGain.connect(beatGain);
        osc.start();
        osc.stop(now + 0.35);
        */

        // 안드로이드 기기이고 진동 패턴 조건일 때 진동 발생
        if (navigator.vibrate) {
          if (currentDist <= 10) {
            navigator.vibrate([200, 100, 200]); // 좀 더 강한 진동 패턴
          } else if (currentDist <= 25) {
            navigator.vibrate(100); // 인지 가능한 수준의 진동
          }
        }
      };

      // 거리 변동에 따른 펄스 템포 조절 루프 시작
      const runPulse = () => {
        triggerHeartbeat();
        // 거리가 가까울수록 템포(속도)가 빨라짐
        const baseInterval = 1200; // 50m 이상일 때 1.2초마다 뜀
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

  // 슬라이더 거리가 변경될 때 오디오 게인(볼륨) 및 연출 실시간 동적 매핑
  useEffect(() => {
    if (isAudioRunning && ambientGainRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      // 거리가 가까워질수록 저음 노이즈 볼륨 커짐 (50m 기준, 제곱 비례)
      const rawVol = demoDistance >= 50 ? 0 : (50 - demoDistance) / 50;
      const targetVolume = Math.max(0, Math.min(0.5, Math.pow(rawVol, 2) * 1.5));
      ambientGainRef.current.gain.linearRampToValueAtTime(targetVolume, now + 0.1);
    }
  }, [demoDistance, isAudioRunning]);

  // 컴포넌트 언마운트 시 사운드 해제
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
    >
      {/* 백그라운드 연출 격자 필터 */}
      <div className="grid-overlay"></div>

      {/* 상단 장식 헤더 */}
      <div className="manual-header">
        <div className="status-indicator">
          <span className="dot-ping"></span>
          <p className="system-tag">Apocalypse Survival Guide</p>
        </div>
        <div className="version-tag">SYS.VER 2.5_KOR</div>
      </div>

      {/* 중앙 메인 컨텐츠 영역 */}
      <div className="manual-main-content">
        {/* 타이틀 및 긴장감 유도 문구 */}
        <div className="title-section">
          <h1 className="manual-main-title">
            ZOMBIES RUN : 생존 매뉴얼
          </h1>
          <p className="manual-subtitle">
            스마트폰 너머로 숨죽여 덮쳐오는 생존의 현장을 지휘하세요.
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="tab-nav">
          <button
            onClick={() => setActiveTab('survival')}
            className={`tab-btn ${activeTab === 'survival' ? 'active-survival' : ''}`}
          >
            <span>🧟<br />SURVIVAL<br />모드</span>
          </button>
          <button
            onClick={() => setActiveTab('run')}
            className={`tab-btn ${activeTab === 'run' ? 'active-run' : ''}`}
          >
            <span>🏃<br />RUN<br />모드</span>
          </button>
          <button
            onClick={() => setActiveTab('record')}
            className={`tab-btn ${activeTab === 'record' ? 'active-record' : ''}`}
          >
            <span>🗺️<br />경로<br />만들기</span>
          </button>
          <button
            onClick={() => setActiveTab('gear')}
            className={`tab-btn ${activeTab === 'gear' ? 'active-gear' : ''}`}
          >
            <span>📡<br />전술<br />피드백</span>
          </button>
        </div>

        {/* 컨텐츠 박스 */}
        <div className="manual-content-box">

          {/* TAB 1: SURVIVAL MODE */}
          {activeTab === 'survival' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-amber">01</div>
                <div>
                  <h3 className="text-amber">SURVIVAL: 실시간 추격</h3>
                  <p className="pane-desc">직접 밟은 궤적을 쫓아오는 좀비로부터 생존하세요.</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-card">
                  <h4 className="text-amber">이동 궤적 추적</h4>
                  <p>미리 그려진 경로 없이, <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>사용자가 실제 걸어간 붉은 라인</span>을 따라 좀비가 소환되어 뒤쫓습니다.</p>
                </div>
                <div className="info-card">
                  <h4 className="text-amber">경로 어시스트</h4>
                  <p>즐겨찾기 버튼을 눌러 미리 생성해 둔 경로를 <span style={{ color: '#10b981', fontWeight: 'bold' }}>초록색 가이드선</span>으로 띄워 참고하며 생존할 수 있습니다.</p>
                </div>
              </div>

              <div className="advice-box border-amber">
                <p><strong className="text-amber">TIP:</strong> 좀비가 사용자 <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>5m 이내</span>로 도달하면 사망하므로 좀비를 지그재그로 따돌리며 탈출구를 찾으세요.</p>
              </div>
            </div>
          )}

          {/* TAB 2: RUN MODE */}
          {activeTab === 'run' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-rose">02</div>
                <div>
                  <h3 className="text-rose">RUN: 도보 탈출</h3>
                  <p className="pane-desc">좀비보다 빠르게 목적지에 도착하세요.</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-card">
                  <h4 className="text-rose">작전 설정</h4>
                  <p>지도 클릭 시 생성되는 <span style={{ color: '#4ade80', fontWeight: 'bold' }}>최적의 도보 경로</span>를 따라 탈출합니다.</p>
                </div>
                <div className="info-card">
                  <h4 className="text-rose">탈출 규칙</h4>
                  <p>좀비가 출발점에서 시작해 최적 경로를 따라 추격합니다. 좀비보다 <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>먼저 목적지(15m 이내)</span>에 도착해야 합니다.</p>
                </div>
              </div>

              <div className="advice-box border-rose">
                <p><strong className="text-rose">TIP:</strong> 좀비가 내 뒤를 쫓아오며, 먼저 목적지에 다다르면 사망하므로 한 발 앞서 도망치세요.</p>
              </div>
            </div>
          )}

          {/* TAB 3: RECORD MODE */}
          {activeTab === 'record' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number" style={{ color: '#10b981' }}>03</div>
                <div>
                  <h3 style={{ color: '#10b981' }}>RECORD: 경로 제작</h3>
                  <p className="pane-desc">나만의 안전한 도보 탈출 경로를 개척하고 기록합니다.</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-card" style={{ borderColor: '#10b981' }}>
                  <h4 style={{ color: '#10b981' }}>GPS 실시간 기록</h4>
                  <p>GPS 신호를 실시간 수집하여 지도에 표시합니다. 최소 3미터 이상 이동 시 포인트가 누적되어 기록을 완성합니다.</p>
                </div>
                <div className="info-card" style={{ borderColor: '#10b981' }}>
                  <h4 style={{ color: '#10b981' }}>즐겨찾기 보관</h4>
                  <p>기록이 완료되면 이름을 지어 <span style={{ color: '#10b981', fontWeight: 'bold' }}>즐겨찾기</span>에 저장합니다. 저장된 경로는 언제든 RUN 모드로 플레이 가능합니다.</p>
                </div>
              </div>

              <div className="advice-box" style={{ borderColor: '#10b981' }}>
                <p><strong style={{ color: '#10b981' }}>TIP:</strong> 기록 화면 HUD의 조작기를 이용하면 기록 중에도 실시간으로 좀비 속도 및 출현 대기시간을 조절할 수 있습니다.</p>
              </div>
            </div>
          )}

          {/* TAB 4: GEAR GUIDE */}
          {activeTab === 'gear' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-cyan">04</div>
                <div>
                  <h3 className="text-cyan">SENSOR: 다차원 피드백</h3>
                  <p className="pane-desc">청각, 촉각, 시각 정보를 이용해 좀비의 근접을 본능적으로 감지합니다.</p>
                </div>
              </div>

              <div className="info-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="info-card border-cyan">
                  <h4>📢 포효 사운드 & 비주얼 경고</h4>
                  <p>50m 이내로 들어오면 소리가 증폭되며, <strong>25m 이내 근접 시 화면 테두리가 붉은색으로 번쩍</strong>이며 경고합니다.</p>
                </div>
                <div className="info-card border-cyan">
                  <h4>📳 햅틱 감지 & 뷰 컨트롤</h4>
                  <p><strong>25m 이내 약한 진동, 10m 이내 강렬한 더블 진동</strong>이 발생합니다. 우측 하단의 🏃, 🧟, 🚩 버튼으로 손쉽게 시점을 고정할 수 있습니다.</p>
                </div>
              </div>

              <div className="compatibility-footer">
                <p>
                  <span>✓ Audio: 전체 기기 지원</span><br />
                  <span>✓ Vibration: 안드로이드 OS 전용</span>
                </p>
              </div>
            </div>
          )}

          {/* 하단 시뮬레이터 */}
          <div className="simulator-section">
            <div className="simulator-panel">
              <div className="simulator-header">
                <div className="simulator-info">
                  <span className="sim-badge">Tactical Simulator</span>
                  <h4>피드백 모의 훈련</h4>
                </div>
                <button
                  onClick={toggleAudioDemo}
                  className={`sim-toggle-btn ${isAudioRunning ? 'running' : ''}`}
                >
                  {isAudioRunning ? '🔈 센서 비활성화' : '🔊 좀비 탐지 센서 작동'}
                </button>
              </div>

              <div className="sim-controls">
                <div className="sim-slider-wrapper">
                  <div className="slider-labels">
                    <span>패닉 (0m)</span>
                    <span className="current-dist">{demoDistance}m</span>
                    <span>안전</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={demoDistance}
                    onChange={(e) => setDemoDistance(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />
                </div>

                <div className="sim-display">
                  <div className="display-inner">
                    <span className="display-label">Sensory Feedback</span>
                    <div className="display-value">
                      {demoDistance <= 5 ? (
                        <span className="val-critical">🧟 GAME OVER</span>
                      ) : demoDistance <= 15 ? (
                        <span className="val-danger">☠️ 극강 경고</span>
                      ) : demoDistance <= 35 ? (
                        <span className="val-warning">⚠ 감지됨</span>
                      ) : (
                        <span className="val-safe">✓ 안전</span>
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
      <div className="manual-footer">
        <button
          onClick={() => {
            stopSyntheticZombieSound();
            onBackToIntro();
          }}
          className="back-btn-main"
        >
          훈련 종료, 전장 진입 ➔
        </button>
      </div>
    </div>
  );
}