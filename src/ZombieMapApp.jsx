import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map, Polyline, CustomOverlayMap, Circle } from 'react-kakao-maps-sdk';
import zombieSfx from './assets/dragon-studio-female-zombie-screams-324744.mp3';

// 좀비 최대 속도 기준 (보행자 경로의 정밀도를 고려해 밸런싱)
const ZOMBIE_SPEED_BASE = 0.000002; // 기본 속도를 더 낮춰서 1일 때 훨씬 느리게

/**
 * 두 좌표 간 거리 계산 (하버사인 공식)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // 지구 반지름 (m)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const ZombieMapApp = ({ gameMode, onExit }) => {
  // 상태 관리
  const [userPosition, setUserPosition] = useState(null);
  const [zombiePosition, setZombiePosition] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [distance, setDistance] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState(null); // 'win' 또는 'lose'
  const [countdown, setCountdown] = useState(0);
  const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.978 }); // 지도의 현재 중심 좌표 (서울 시청)
  const [isFollowingUser, setIsFollowingUser] = useState(true); // 사용자를 따라갈지 여부
  const [showExitConfirm, setShowExitConfirm] = useState(false); // 종료 확인 팝업 상태
  const [showReconfirmPath, setShowReconfirmPath] = useState(false); // 경로 재설정 확인 팝업
  const [isFollowingZombie, setIsFollowingZombie] = useState(false); // 좀비 추적 모드 상태
  const [pendingDest, setPendingDest] = useState(null); // 대기 중인 목적지

  // 설정 상태
  const [selectedZombieSpeed, setSelectedZombieSpeed] = useState(() => {
    const saved = localStorage.getItem(`${gameMode}_zombieSpeed`);
    return saved !== null ? Number(saved) : 1;
  });
  const [selectedSpawnDelay, setSelectedSpawnDelay] = useState(() => {
    const saved = localStorage.getItem(`${gameMode}_spawnDelay`);
    return saved !== null ? Number(saved) : 10;
  });

  // 설정값이 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem(`${gameMode}_zombieSpeed`, selectedZombieSpeed);
  }, [selectedZombieSpeed, gameMode]);

  useEffect(() => {
    localStorage.setItem(`${gameMode}_spawnDelay`, selectedSpawnDelay);
  }, [selectedSpawnDelay, gameMode]);

  // API 키 설정 (Vite는 import.meta.env를 사용합니다)
  const TMAP_API_KEY = import.meta.env.VITE_TMAP_API_KEY;

  // 애니메이션 및 오디오 제어용 Refs
  const mapRef = useRef(null); // mapRef 선언
  const requestRef = useRef();
  const pathIndexRef = useRef(0);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const userPosRef = useRef(null);
  const zombiePosRef = useRef(null);
  const spawnTimerRef = useRef(null);

  // "따라가기" 모드일 때 사용자 위치를 지도 중심에 동기화
  useEffect(() => {
    if (isFollowingUser && userPosition) {
      setMapCenter(userPosition);
    }
  }, [userPosition, isFollowingUser]);

  // "좀비 따라가기" 모드일 때 좀비 위치를 지도 중심에 동기화
  useEffect(() => {
    if (isFollowingZombie && zombiePosition) {
      setMapCenter(zombiePosition);
    }
  }, [zombiePosition, isFollowingZombie]);

  // 카운트다운 타이머
  useEffect(() => {
    let timer;
    if (countdown > 0 && !isGameOver) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown, isGameOver]);

  // 실시간 위치 추적
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPosition(newPos);
        userPosRef.current = newPos;
        console.log("현재 위치 수신:", newPos);
      }, (err) => console.error("위치 추적 실패:", err),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 오디오 시스템 초기화
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(ctx.destination);

    try {
      const response = await fetch(zombieSfx);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(gainNode);
      source.start();
      audioCtxRef.current = ctx;
      gainNodeRef.current = gainNode;
    } catch (e) {
      console.error("오디오 로드 실패", e);
    }
  }, []);

  /**
   * 지도 클릭 시 Tmap 경로 생성 및 좀비 출현 예약
   * 실제 경로 탐색을 수행하는 함수
   */
  const startPathFinding = useCallback(async (latLng) => {
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume(); // 오디오 컨텍스트 재개
    
    const dest = { lat: latLng.getLat(), lng: latLng.getLng() };
    let chasePath = [];

    console.log("경로 탐색 시작 (TMAP Key 확인):", TMAP_API_KEY ? TMAP_API_KEY.substring(0, 5) + "..." : "Key 없음");

    try {
      if (!TMAP_API_KEY) {
        console.error("TMAP_API_KEY가 정의되지 않았습니다. .env.local 파일과 변수명을 확인하세요.");
        throw new Error("Missing API Key");
      }

      const response = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'appKey': TMAP_API_KEY
        },
        body: JSON.stringify({
          startX: userPosition.lng,
          startY: userPosition.lat,
          endX: dest.lng,
          endY: dest.lat,
          startName: "출발지",
          endName: "목적지"
        })
      });

      if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(`Tmap API 응답 에러 (${response.status}): ${errorDetail}`);
      }
      const data = await response.json();
      
      // Tmap GeoJSON 좌표 [lng, lat] -> {lat, lng} 변환
      data.features.forEach((feature) => {
        const geometry = feature.geometry;
        if (geometry.type === "LineString") {
          geometry.coordinates.forEach((coord) => {
            chasePath.push({ lat: coord[1], lng: coord[0] });
          });
        } else if (geometry.type === "Point") {
          chasePath.push({ lat: geometry.coordinates[1], lng: geometry.coordinates[0] });
        }
      });

      // 중복 좌표 제거
      chasePath = chasePath.filter((v, i, a) => a.findIndex(t => t.lat === v.lat && t.lng === v.lng) === i);

    } catch (error) {
      console.error("경로 검색 실패, 직선 경로로 대체:", error);
      chasePath = [{ ...userPosition }, { ...dest }];
    }

    if (chasePath.length === 0) return;

    // 초기화 및 타이머 설정
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    setZombiePosition(null);
    zombiePosRef.current = null;
    setRoutePath(chasePath);
    setCountdown(selectedSpawnDelay);

    // 지연 시간 후 좀비 생성
    spawnTimerRef.current = setTimeout(() => {
      const startPos = chasePath[0];
      pathIndexRef.current = 0;
      setZombiePosition(startPos);
      zombiePosRef.current = startPos;
      setCountdown(0);
      console.log("좀비 출현!"); // 좀비 출현 로그
    }, selectedSpawnDelay * 1000);

  }, [userPosition, initAudio, selectedSpawnDelay, TMAP_API_KEY]);

  /**
   * 지도 클릭 시 확인 창을 띄우거나 경로 탐색 시작
   */
  const onMapClick = useCallback((latLng) => {
    if (isGameOver || !userPosition) return;
    
    if (routePath.length > 0) {
      setPendingDest(latLng);
      setShowReconfirmPath(true);
    } else {
      startPathFinding(latLng);
    }
  }, [isGameOver, userPosition, routePath.length, startPathFinding]);

  /**
   * 좀비를 다시 처음 위치로 되돌리는 초기화 함수
   */
  const handleResetZombie = useCallback(() => {
    if (routePath.length === 0) return;
    
    // 스폰 타이머가 진행 중이라면 취소하고 즉시 생성 모드로 전환
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
    setCountdown(0);

    pathIndexRef.current = 0;
    const startPos = routePath[0];
    setZombiePosition(startPos);
    zombiePosRef.current = startPos;
    setIsGameOver(false);
    setGameResult(null);
    setDistance(null);
  }, [routePath]);

  const currentZombieSpeed = useMemo(() => (Number(selectedZombieSpeed) / 50) * ZOMBIE_SPEED_BASE, [selectedZombieSpeed]);

  /**
   * 프레임별 애니메이션 루프
   */
  const animate = useCallback(() => {
    if (isGameOver || routePath.length === 0) return;

    // 좀비가 아직 생성되지 않았으면 루프만 유지
    const prevPos = zombiePosRef.current;
    if (!prevPos) { // 좀비 생성 전 대기 루프
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const target = routePath[pathIndexRef.current + 1];
    if (!target) {
      // 좀비가 목적지에 도달했을 때 (잡힌 것과 동일하게 처리)
      if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
      setIsGameOver(true);
      setGameResult('lose');
      if (gainNodeRef.current) gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
      return;
    }

    const dLat = target.lat - prevPos.lat;
    const dLng = target.lng - prevPos.lng;
    const len = Math.sqrt(dLat * dLat + dLng * dLng);

    let newPos;
    if (len < currentZombieSpeed) {
      pathIndexRef.current += 1;
      newPos = target;
    } else {
      newPos = {
        lat: prevPos.lat + (dLat / len) * currentZombieSpeed,
        lng: prevPos.lng + (dLng / len) * currentZombieSpeed,
      };
    }

    setZombiePosition(newPos);
    zombiePosRef.current = newPos;

    // 거리 계산 및 특수 효과
    if (userPosRef.current) {
      const d = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, newPos.lat, newPos.lng);
      setDistance(d);

      // 오디오 볼륨 제어 (50m 이내)
      if (gainNodeRef.current && audioCtxRef.current) {
        // 50m 이내부터 소리가 들리고, 거리에 따라 비선형적으로(제곱) 볼륨이 커지도록 수정
        const rawVol = d >= 50 ? 0 : (50 - d) / 50;
        const vol = Math.pow(rawVol, 2) * 1.5; // 제곱으로 볼륨을 키우고, 최대 볼륨을 1.5배로 설정
        gainNodeRef.current.gain.setTargetAtTime(Math.min(1.5, vol), audioCtxRef.current.currentTime, 0.1);
      }

      // 진동 피드백 (25m 이내)
      if (navigator.vibrate) {
        if (d <= 10) {
          // 10m 이내: 위험! 강한 진동
          navigator.vibrate(200);
        } else if (d <= 25) {
          // 25m 이내: 경고. 짧은 진동
          navigator.vibrate(50);
        }
      }

      // 잡힘 판정 (Survival 모드일 때만 5m 이내 종료)
      if (d <= 5 && gameMode === 'survival') {
        if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
        setIsGameOver(true);
        setGameResult('lose');
        if (gainNodeRef.current) gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
        return;
      }

      // 사용자가 목적지에 도달했는지 확인 (RUN 모드 승리 조건)
      const destination = routePath[routePath.length - 1];
      const distToFinish = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, destination.lat, destination.lng);
      if (distToFinish <= 15) { // 15미터 이내 도착 시 승리
        setIsGameOver(true);
        setGameResult('win');
        if (gainNodeRef.current) gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
        return;
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [routePath, isGameOver, currentZombieSpeed, gameMode]);

  useEffect(() => {
    if (routePath.length > 0 && !isGameOver) {
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, routePath, isGameOver]);

  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100dvh', position: 'relative' }}>
      {/* 현재 위치 로딩 중 표시 */}
      {!userPosition && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px 40px',
          borderRadius: '15px',
          textAlign: 'center',
          fontWeight: 'bold',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
        }}>
          현재 위치를 찾는 중입니다...
        </div>
      )}
      <Map
        center={mapCenter}
        style={{ width: "100%", height: "100%" }}
        level={4} // 초기 줌 레벨을 4로 조정하여 좀 더 넓은 시야 제공
        onCreate={(map) => (mapRef.current = map)}
        onDragStart={() => {
          setIsFollowingUser(false);
          setIsFollowingZombie(false);
        }} // 드래그 시작 시 모든 추적 모드 해제
        onCenterChanged={(map) => {
          // 지도가 움직이면 현재 중심 좌표를 상태에 반영 (스냅백 방지)
          const center = map.getCenter();
          setMapCenter({ lat: center.getLat(), lng: center.getLng() });
        }}
        onClick={(_t, mouseEvent) => onMapClick(mouseEvent.latLng)} // 카카오맵의 latLng 객체를 직접 전달
      >
        {userPosition && (
          <CustomOverlayMap position={userPosition} zIndex={1}>
            <div style={{ fontSize: '30px' }}>🏃</div>
          </CustomOverlayMap>
        )}
        {zombiePosition && (
          <CustomOverlayMap position={zombiePosition}>
            <div style={{ fontSize: '30px' }}>🧟</div>
          </CustomOverlayMap>
        )}
        <Polyline
          // 좀비 추격 경로
          path={routePath}
          strokeWeight={5}
          strokeColor={"#FF0000"}
          strokeOpacity={0.8}
          strokeStyle={"solid"}
        />
        {userPosition && (
          <Circle
            center={userPosition}
            radius={5} // 5미터 반경
            strokeWeight={1}
            strokeColor={'#0000FF'}
            strokeOpacity={0.5}
            strokeStyle={'solid'}
            fillColor={'#0000FF'}
            fillOpacity={0.1} // 연하게 표시
          />
        )}
      </Map>

      {/* 홈 버튼 */}
      {/* 뒤로가기 버튼 */}
      <button
        onClick={() => {
          if (routePath.length > 0 && !isGameOver) {
            setShowExitConfirm(true);
          } else {
            onExit();
          }
        }}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(30, 41, 59, 0.8)',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          cursor: 'pointer',
          color: 'white',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
        }}
      >
        🔙
      </button>

      {/* 좀비 추적 ON/OFF 버튼 */}
      {routePath.length > 0 && !isGameOver && (
        <button
          onClick={() => {
            const nextState = !isFollowingZombie;
            setIsFollowingZombie(nextState);
            if (nextState) {
              setIsFollowingUser(false); // 좀비 추적 시 사용자 추적은 해제
            }
          }}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            zIndex: 10,
            background: isFollowingZombie ? '#f43f5e' : 'rgba(15, 23, 42, 0.85)',
            color: 'white',
            border: isFollowingZombie ? '2px solid #f43f5e' : '1px solid rgba(30, 41, 59, 0.8)',
            borderRadius: '50%',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
            opacity: isFollowingZombie ? 1 : 0.6
          }}
        >
          🧟
        </button>
      )}

      {/* 현재 위치로 이동 버튼 */}
      {userPosition && (
        <button
          onClick={() => {
            const nextState = !isFollowingUser;
            setIsFollowingUser(nextState);
            if (nextState) {
              setIsFollowingZombie(false); // 사용자 추적 시 좀비 추적은 해제
            }
          }}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px', // 버튼 위치를 우측 하단으로 변경
            zIndex: 10,
            background: isFollowingUser ? '#f43f5e' : 'rgba(15, 23, 42, 0.85)',
            color: 'white',
            border: isFollowingUser ? '2px solid #f43f5e' : '1px solid rgba(30, 41, 59, 0.8)',
            borderRadius: '50%',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
            opacity: isFollowingUser ? 1 : 0.6
          }}
        >
          🏃
        </button>
      )}

      {/* 상단 컨트롤 UI (HUD 디자인 적용) */}
      <div className="hud-container">
        <div className="hud-header">
          <div className="hud-mode-tag">MODE: {gameMode.toUpperCase()}</div>
          <div className="hud-status-dot"></div>
        </div>

        <div className="hud-main-display">
          {isGameOver ? (
            <span style={{ color: gameResult === 'win' ? '#44ff44' : '#ef4444', fontWeight: '900', fontSize: '1rem' }}>
              {gameResult === 'win' ? '탈출 성공!' : (gameMode === 'run' ? '좀비가 먼저 도착함!' : '잡혔습니다!')}
            </span>
          ) : (
            <div className="hud-distance-text">
              {gameMode === 'run' ? ( // RUN 모드일 때
                routePath.length > 0 ? ( // 경로가 설정되었으면 목적지까지의 거리 표시
                  (() => {
                    const destination = routePath[routePath.length - 1];
                    const distUserToDest = userPosition ? calculateDistance(userPosition.lat, userPosition.lng, destination.lat, destination.lng) : '...';
                    const zPos = zombiePosition || routePath[0];
                    const distZombieToDest = calculateDistance(zPos.lat, zPos.lng, destination.lat, destination.lng);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div>나의 목적지까지: {distUserToDest}m</div>
                        <div>좀비의 목적지까지: {distZombieToDest}m</div>
                      </div>
                    );
                  })()
                ) : ( // 경로가 설정되지 않았으면 안내 문구
                  <span>지도를 클릭하세요</span>
                )
              ) : ( // SURVIVAL 모드일 때
                routePath.length > 0 ? ( // 경로가 설정되었으면 좀비와의 거리 표시
                  <span>
                    좀비와의 거리: {distance !== null ? `${distance}m` : countdown}
                  </span>
                ) : (
                  <span>지도를 클릭하세요</span>
                )
              )}
            </div>
          )}
        </div>
        
        <div className="hud-control-row">
          <label className="hud-label">좀비 속도 ({selectedZombieSpeed}/50)</label>
          <input type="range" min="1" max="50" value={selectedZombieSpeed} onChange={(e) => setSelectedZombieSpeed(Number(e.target.value))} style={{ flexGrow: 1, accentColor: '#f43f5e' }} />
        </div>
        
        <div className="hud-control-row">
          <label className="hud-label">좀비 발생 시간</label>
          <select className="hud-select" value={selectedSpawnDelay} onChange={(e) => setSelectedSpawnDelay(Number(e.target.value))}>
            <option value={0}>즉시</option>
            <option value={10}>10초</option>
            <option value={30}>30초</option>
            <option value={60}>60초</option>
          </select>
        </div>

        {routePath.length > 0 && (
          <button onClick={handleResetZombie} className="hud-reset-btn">
            RESTART PURSUIT
          </button>
        )}
      </div>

      {/* 종료 확인 레이어 */}
      {showExitConfirm && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="hud-header">
              <div className="hud-mode-tag">WARNING</div>
              <div className="hud-status-dot"></div>
            </div>
            <div className="hud-main-display">
              <div className="hud-distance-text" style={{ fontSize: '1.1rem' }}>
                게임을 종료하고<br/>메인 화면으로 나갈까요?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={onExit}
                className="hud-reset-btn" 
                style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
              >
                YES
              </button>
              <button 
                onClick={() => setShowExitConfirm(false)}
                className="hud-reset-btn" 
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 경로 재설정 확인 레이어 */}
      {showReconfirmPath && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="hud-header">
              <div className="hud-mode-tag">RECONFIRM</div>
              <div className="hud-status-dot"></div>
            </div>
            <div className="hud-main-display">
              <div className="hud-distance-text" style={{ fontSize: '1.1rem' }}>
                경로가 이미 존재합니다.<br/>다시 설정 하시겠습니까?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={() => {
                  setShowReconfirmPath(false);
                  if (pendingDest) startPathFinding(pendingDest);
                  setPendingDest(null);
                }}
                className="hud-reset-btn" 
                style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
              >
                YES
              </button>
              <button 
                onClick={() => {
                  setShowReconfirmPath(false);
                  setPendingDest(null);
                }}
                className="hud-reset-btn" 
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 중앙 카운트다운 */}
      {countdown > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, fontSize: '120px', fontWeight: 'bold', color: 'rgba(255, 0, 0, 0.7)', pointerEvents: 'none' }}>
          {countdown}
        </div>
      )}

      {/* 잡혔을 때 피 효과 */}
      {isGameOver && <div className="blood-screen" />}
    </div>
  );
};

export default ZombieMapApp;