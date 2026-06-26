import React, { useState, useEffect, useRef } from 'react';

export default function ManualPage({ onBackToIntro }) {
  const [activeTab, setActiveTab] = useState('run'); // 'run' | 'survival' | 'gear'
  const [demoDistance, setDemoDistance] = useState(35); // 0m ~ 60m
  const [isAudioRunning, setIsAudioRunning] = useState(true); // 기본 활성화
  const [isVibrating, setIsVibrating] = useState(false);

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
    <div className="manual-page-container">
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
            ZOMBIES RUN : TRAINING
          </h1>
          <p className="manual-subtitle">
            스마트폰 너머로 숨죽여 덮쳐오는 생존의 현장을 지휘하세요.
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="tab-nav">
          <button
            onClick={() => setActiveTab('run')}
            className={`tab-btn ${activeTab === 'run' ? 'active-run' : ''}`}
          >
            <span>🏃 RUN 모드</span>
          </button>
          <button
            onClick={() => setActiveTab('survival')}
            className={`tab-btn ${activeTab === 'survival' ? 'active-survival' : ''}`}
          >
            <span>🧟 SURVIVAL 모드</span>
          </button>
          <button
            onClick={() => setActiveTab('gear')}
            className={`tab-btn ${activeTab === 'gear' ? 'active-gear' : ''}`}
          >
            <span>📡 전술 장비</span>
          </button>
        </div>

        {/* 컨텐츠 박스 */}
        <div className="manual-content-box">

          {/* TAB 1: RUN MODE */}
          {activeTab === 'run' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-rose">01</div>
                <div>
                  <h3 className="text-rose">RUN: 선착순 탈출</h3>
                  <p className="pane-desc">좀비보다 빠르게 목적지에 도착하세요.</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-card">
                  <h4 className="text-rose">핵심 룰</h4>
                  <p>클릭 시 생성되는 <span className="highlight-green">최적 경로</span>를 따라 나와 좀비가 동시에 질주합니다.</p>
                </div>
                <div className="info-card">
                  <h4 className="text-rose">승리 및 패배</h4>
                  <p>좀비와 부딪혀도 안전하지만, 좀비보다 <span className="highlight-red">먼저 도착</span>해야 승리합니다.</p>
                </div>
              </div>

              <div className="advice-box border-rose">
                <p><strong className="text-rose">TIP:</strong> 목적지와의 거리를 확인하며 좀비보다 먼저 도착해서 승리를 쟁취하세요</p>
              </div>
            </div>
          )}

          {/* TAB 2: SURVIVAL MODE */}
          {activeTab === 'survival' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-amber">02</div>
                <div>
                  <h3 className="text-amber">SURVIVAL: 무한 생존</h3>
                  <p className="pane-desc">잡히지 않고 최대한 오래 버티세요.</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-card">
                  <h4 className="text-amber">무자비한 추적</h4>
                  <p>좀비가 나의 흔적을 밟으며 끝까지 추격합니다. 거리가 벌어져도 추격은 멈추지 않습니다.</p>
                </div>
                <div className="info-card">
                  <h4 className="text-amber">생존 한계선</h4>
                  <p>좀비와 <span className="highlight-red">5m 이내</span>로 가까워지면 즉시 <span className="highlight-red">GAME OVER</span> 됩니다.</p>
                </div>
              </div>

              <div className="advice-box border-amber">
                <p><strong className="text-amber">TIP:</strong> HUD의 '좀비와의 거리'를 확인하며 지그재그로 유인하세요.</p>
              </div>
            </div>
          )}

          {/* TAB 3: GEAR GUIDE (Web API) */}
          {activeTab === 'gear' && (
            <div className="tab-pane-content">
              <div className="pane-header">
                <div className="pane-number text-cyan">03</div>
                <div>
                  <h3 className="text-cyan">SENSOR: 전술 피드백</h3>
                  <p className="pane-desc">소리와 진동으로 좀비의 접근을 감지합니다.</p>
                </div>
              </div>

              <div className="info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div className="info-card border-cyan">
                  <h4>📢 입체 사운드</h4>
                  <p>음악과 동시 사용 가능. <strong>가까울수록 좀비 포효가 증폭</strong>됩니다.</p>
                </div>
                <div className="info-card border-cyan">
                  <h4>🎯 추적 시스템</h4>
                  <p>좌측 하단(🧟)과 우측 하단(🏃) 버튼으로 좀비 또는 나를 화면 중앙에 고정할 수 있습니다.</p>
                </div>
                <div className="info-card border-cyan">
                  <h4>📳 햅틱 레이더</h4>
                  <p><strong>20m 주기적 진동, 5m 연속 진동</strong>으로 거리감을 전달합니다.</p>
                </div>
              </div>

              <div className="compatibility-footer">
                <p>
                  <span>✓ Audio: 공통 지원</span>
                  <span>✓ Vibration: 안드로이드</span>
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