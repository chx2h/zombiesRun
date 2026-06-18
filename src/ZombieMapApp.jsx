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

const ZombieMapApp = () => {
  // 상태 관리
  const [userPosition, setUserPosition] = useState(null);
  const [zombiePosition, setZombiePosition] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [distance, setDistance] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [mapCenter, setMapCenter] = useState({ lat: 37.5665, lng: 126.978 }); // 지도의 현재 중심 좌표 (서울 시청)
  const [isFollowingUser, setIsFollowingUser] = useState(true); // 사용자를 따라갈지 여부

  // 설정 상태
  const [selectedZombieSpeed, setSelectedZombieSpeed] = useState(1); // 1~10
  const [selectedSpawnDelay, setSelectedSpawnDelay] = useState(10); // 초 단위

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
   */
  const onMapClick = useCallback(async (latLng) => {
    if (isGameOver || !userPosition) return;
    
    if (routePath.length > 0) {
      const reconfirm = window.confirm("경로가 이미 존재합니다. 다시 설정 하시겠습니까?");
      if (!reconfirm) return;
    }

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

  }, [userPosition, isGameOver, initAudio, selectedSpawnDelay, TMAP_API_KEY, routePath]);

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
    setDistance(null);
  }, [routePath]);

  const currentZombieSpeed = useMemo(() => (Number(selectedZombieSpeed) / 10) * ZOMBIE_SPEED_BASE, [selectedZombieSpeed]);

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
    if (!target) return; // 목적지 도달 시 정지

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
        const vol = d >= 50 ? 0 : (50 - d) / 50;
        gainNodeRef.current.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.1);
      }

      // 잡힘 판정 (5m 이내)
      if (d <= 5) {
        if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
        setIsGameOver(true);
        if (gainNodeRef.current) gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
        return;
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [routePath, isGameOver, currentZombieSpeed]);

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
      <Map
        center={mapCenter}
        style={{ width: "100%", height: "100%" }}
        level={3}
        onCreate={(map) => (mapRef.current = map)}
        onDragStart={() => setIsFollowingUser(false)} // 드래그 시작 즉시 고정 해제
        onCenterChanged={(map) => {
          // 지도가 움직이면 현재 중심 좌표를 상태에 반영 (스냅백 방지)
          const center = map.getCenter();
          setMapCenter({ lat: center.getLat(), lng: center.getLng() });
        }}
        onClick={(_t, mouseEvent) => onMapClick(mouseEvent.latLng)} // 카카오맵의 latLng 객체를 직접 전달
      >
        {userPosition && (
          <CustomOverlayMap position={userPosition}>
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

      {/* 현재 위치로 이동 버튼 */}
      {userPosition && !isFollowingUser && (
        <button
          onClick={() => setIsFollowingUser(true)}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px', // 버튼 위치를 우측 하단으로 변경
            zIndex: 10,
            padding: '10px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: '24px'
          }}
        >
          📍
        </button>
      )}

      {/* 상단 컨트롤 UI */}
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '15px 25px', borderRadius: '25px', textAlign: 'center', minWidth: '280px' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
          {isGameOver ? <span style={{ color: 'red' }}>잡혔습니다!</span> : `좀비와의 거리: ${distance !== null ? `${distance}m` : '지도를 클릭하세요'}`}
        </div>
        
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>좀비 속도 ({selectedZombieSpeed})</label>
          <input type="range" min="1" max="10" value={selectedZombieSpeed} onChange={(e) => setSelectedZombieSpeed(Number(e.target.value))} style={{ flexGrow: 1 }} />
        </div>
        
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px' }}>좀비 발생 시간</label>
          <select value={selectedSpawnDelay} onChange={(e) => setSelectedSpawnDelay(Number(e.target.value))} style={{ background: '#333', color: 'white', border: 'none', borderRadius: '5px' }}>
            <option value={0}>즉시</option>
            <option value={10}>10초</option>
            <option value={30}>30초</option>
            <option value={60}>60초</option>
          </select>
        </div>

        {routePath.length > 0 && (
          <button 
            onClick={handleResetZombie}
            style={{ 
              marginTop: '15px', 
              padding: '8px 20px', 
              borderRadius: '15px', 
              border: 'none', 
              backgroundColor: '#555', 
              color: 'white', 
              cursor: 'pointer', 
              fontSize: '13px', 
              fontWeight: 'bold' 
            }}
          >
            추격 재시작 (위치 초기화)
          </button>
        )}
      </div>

      {/* 중앙 카운트다운 */}
      {countdown > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, fontSize: '120px', fontWeight: 'bold', color: 'rgba(255, 0, 0, 0.7)', pointerEvents: 'none' }}>
          {countdown}
        </div>
      )}
    </div>
  );
};

export default ZombieMapApp;
