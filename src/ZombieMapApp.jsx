import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import zombieSfx from './assets/dragon-studio-female-zombie-screams-324744.mp3';

const ZOMBIE_SPEED_BASE = 0.0000015; // 좀비 최대 속도 기준 하향 조정 (약 10m/s)

const ZombieMapApp = () => {
  const [userPosition, setUserPosition] = useState(null);
  const [zombiePosition, setZombiePosition] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [distance, setDistance] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const [countdown, setCountdown] = useState(0); // 카운트다운 상태 추가
  const [selectedZombieSpeed, setSelectedZombieSpeed] = useState(5); // 좀비 속도 조절 (1~10)
  const [selectedSpawnDelay, setSelectedSpawnDelay] = useState(10); // 좀비 생성 지연 상태 추가
  // 카카오맵 객체들을 참조하기 위한 Refs
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const zombieMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null); // 목적지 마커 Ref 추가
  const polylineRef = useRef(null);
  
  const requestRef = useRef();
  const pathIndexRef = useRef(0);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const userPosRef = useRef(null);
  const zombiePosRef = useRef(null);
  const spawnTimerRef = useRef(null); // 좀비 스폰 타이머 Ref 추가
  const animationIntervalRef = useRef(null); // 애니메이션 인터벌 Ref 추가

  // 카운트다운 Ticker 로직
  useEffect(() => {
    let timer;
    if (countdown > 0 && !isGameOver) {
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown, isGameOver]);

  // 클릭 핸들러의 stale closure 방지를 위한 Ref
  const onMapClickRef = useRef();
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [userPosition, isGameOver, selectedSpawnDelay]); // 지연 시간 의존성 추가

  // 1. 카카오맵 초기화
  useEffect(() => {
    const initMap = () => {
      console.log("카카오맵 초기화 시도 중...");
      const kakao = window.kakao;
      if (!kakao || !kakao.maps || !mapContainerRef.current) {
        console.warn("카카오 SDK 로드 전이거나 컨테이너를 찾을 수 없습니다.");
        return;
      }

      // 카카오맵 SDK가 완전히 준비된 후 실행되도록 보장
      kakao.maps.load(() => {
        console.log("kakao.maps.load 완료. 지도를 생성합니다.");
        const container = mapContainerRef.current;
        const options = {
          center: new kakao.maps.LatLng(37.56, 126.97),
          level: 3,
        };

        const map = new kakao.maps.Map(container, options);
        mapRef.current = map;

        kakao.maps.event.addListener(map, 'click', (mouseEvent) => {
          onMapClickRef.current?.(mouseEvent.latLng); // 최신 onMapClick 참조
        });

        setMapLoaded(true);
        console.log("카카오맵 렌더링 성공");
      });
    };

    // SDK가 로드된 후 실행되도록 약간의 지연을 주거나 즉시 실행
    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      console.log("카카오 SDK 스크립트 로드 대기 중...");
      const script = document.querySelector('script[src*="dapi.kakao.com"]');
      if (script) {
        script.addEventListener('load', initMap);
      }
    }
  }, []);

  // 2. 실시간 위치 추적
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        console.log("현재 위치 수신:", newPos);
        setUserPosition(newPos);
        userPosRef.current = newPos;
        
        if (mapRef.current && !zombiePosition) {
          mapRef.current.setCenter(new window.kakao.maps.LatLng(newPos.lat, newPos.lng));
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 3. 마커 및 경로 업데이트 부수 효과
  useEffect(() => { // 마커 업데이트 로직
    const kakao = window.kakao;
    if (!mapLoaded || !kakao || !kakao.maps) return;

    if (userPosition && mapRef.current) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(userPosition.lat, userPosition.lng),
          content: '<div style="font-size: 30px;">🏃</div>',
          map: mapRef.current
        });
      } else {
        userMarkerRef.current.setPosition(new kakao.maps.LatLng(userPosition.lat, userPosition.lng));
      }
    }
  }, [userPosition, mapLoaded, kakao]);

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
      console.error("오디오 로드 실패: src/assets 폴더에 효과음 파일이 있는지 확인하세요.", e);
    }
  }, []);

  const onMapClick = useCallback(async (latLng) => {
    const kakao = window.kakao;
    if (isGameOver || !userPosition || !kakao || !kakao.maps) return;
    
    initAudio();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume(); // 오디오 컨텍스트 재개
    }
    
    const dest = { lat: latLng.getLat(), lng: latLng.getLng() };

    let linePath = [];
    let chasePath = [];

    try {
      // 카카오 모빌리티 REST API 키 (환경 변수에서 불러오는 것을 권장)
      const REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY; // .env.local에 VITE_KAKAO_REST_API_KEY=YOUR_REST_API_KEY_HERE 추가
      if (!REST_API_KEY) {
        throw new Error("카카오 REST API 키가 설정되지 않았습니다.");
      }

      // 카카오 모빌리티 자동차 길찾기 API 호출 (도보 경로가 필요하면 API 문서 확인)
      // origin과 destination은 경도, 위도 순서로 전달해야 합니다. (apis-auto -> apis-navi 로 수정)
      const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${userPosition.lng},${userPosition.lat}&destination=${dest.lng},${dest.lat}&priority=RECOMMEND&car_type=1`;

      const response = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${REST_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`경로를 가져오는데 실패했습니다: ${response.status} - ${errorData.msg || '알 수 없는 오류'}`);
      }

      const data = await response.json();
      
      // API 응답 데이터에서 좌표(vertexes) 추출하여 경로 배열 생성
      data.routes[0].sections[0].roads.forEach((road) => { // routes[0].sections[0]은 첫 번째 경로의 첫 번째 구간
        road.vertexes.forEach((vertex, index) => {
          if (index % 2 === 0) { // 경도, 위도 순서이므로 짝수 인덱스가 경도, 홀수 인덱스가 위도
            linePath.push({
              lng: road.vertexes[index],
              lat: road.vertexes[index + 1],
            });
          }
        });
      });

      // 좀비가 나(현재 위치)에서 출발하여 목적지로 가도록 경로 설정 (반전 제거)
      chasePath = linePath;

    } catch (error) {
      console.error("길찾기 API 호출 중 오류:", error);
      // 실패 시 직선 경로로 Fallback
      chasePath = [{ ...userPosition }, { ...dest }]; // 나에게서 목적지로 직선 경로
    }

    // 데이터가 없는 경우를 대비한 안전 장치
    if (chasePath.length === 0) return;

    // 기존 타이머가 있다면 제거 (중복 실행 방지)
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    setCountdown(0); // 이전 카운트다운 초기화

    // 지연 시간 동안 이전 상태들 초기화 및 맵 요소 숨김
    setZombiePosition(null); 
    zombiePosRef.current = null;
    setRoutePath([]); // 애니메이션 루프 일시 중단
    if (zombieMarkerRef.current) zombieMarkerRef.current.setMap(null);
    if (polylineRef.current) polylineRef.current.setMap(null);

    // 목적지 마커 즉시 표시 (사용자 클릭 피드백)
    if (destinationMarkerRef.current) destinationMarkerRef.current.setMap(null);
    destinationMarkerRef.current = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(dest.lat, dest.lng),
      map: mapRef.current
    });

    // 1. 경로 설정 및 폴리라인 표시 (지연 없이 즉시 수행)
    setRoutePath(chasePath);
    polylineRef.current = new kakao.maps.Polyline({
      path: chasePath.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 5,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeStyle: 'solid'
    });
    polylineRef.current.setMap(mapRef.current);

    // 2. 설정된 지연 시간(초) 후에 좀비 마커만 생성하여 추격 시작
    setCountdown(selectedSpawnDelay); // 카운트다운 시작
    spawnTimerRef.current = setTimeout(() => {
      const startPos = chasePath[0];
      zombieMarkerRef.current = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(startPos.lat, startPos.lng),
        content: '<div style="font-size: 30px;">🧟</div>',
        map: mapRef.current
      });

      pathIndexRef.current = 0;
      setZombiePosition(startPos);
      zombiePosRef.current = startPos;
      setCountdown(0); // 좀비 출현 시 카운트다운 종료
      console.log(`${selectedSpawnDelay}초 후 좀비 출현!`);
    }, selectedSpawnDelay * 1000);

  }, [userPosition, isGameOver, initAudio, selectedSpawnDelay]); // selectedSpawnDelay 추가

  // 선택된 수치(1~10)에 따라 실제 좀비 속도 결정 (10일 때 BASE 속도)
  const currentZombieSpeed = useMemo(() => {
    return (Number(selectedZombieSpeed) / 10) * ZOMBIE_SPEED_BASE;
  }, [selectedZombieSpeed]);

  const animate = useCallback(() => {
    const kakao = window.kakao;
    if (isGameOver || routePath.length === 0 || !kakao || !kakao.maps) {
      return;
    }

    const prevPos = zombiePosRef.current || routePath[0];
    const target = routePath[pathIndexRef.current + 1];
    if (!prevPos || !target) { // prevPos가 null일 경우를 대비
      return;
    }

    if (!target) return;
    
    const dLat = target.lat - prevPos.lat;
    const dLng = target.lng - prevPos.lng;
    const len = Math.sqrt(dLat * dLat + dLng * dLng);

    let newPos;
    if (len < currentZombieSpeed) {
      pathIndexRef.current += 1;
      newPos = target;
    } else {
      newPos = { // currentZombieSpeed 사용
        lat: prevPos.lat + (dLat / len) * currentZombieSpeed,
        lng: prevPos.lng + (dLng / len) * currentZombieSpeed,
      };
    }

    const newLatLng = new kakao.maps.LatLng(newPos.lat, newPos.lng);
    setZombiePosition(newPos);
    zombiePosRef.current = newPos;
    if (zombieMarkerRef.current) zombieMarkerRef.current.setPosition(newLatLng);

    // --- 거리 계산 및 부수 효과 처리 ---
    if (userPosRef.current) {
      const line = new kakao.maps.Polyline({
        path: [new kakao.maps.LatLng(userPosRef.current.lat, userPosRef.current.lng), newLatLng]
      });
      const d = line.getLength(); // 카카오맵 Polyline 객체의 길이를 미터 단위로 반환
      setDistance(Math.round(d));

      if (gainNodeRef.current) {
        const vol = d >= 50 ? 0 : (50 - d) / 50;
        gainNodeRef.current.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.1);
      }

      if (d <= 5) {
        if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
        setIsGameOver(true);
        // 게임 오버 시 오디오 정지
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
        }
        return; // 루프 종료
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [routePath, isGameOver, currentZombieSpeed]);

  useEffect(() => {
    if (routePath.length > 0 && !isGameOver) {
      requestRef.current = requestAnimationFrame(animate);
      // 좀비가 움직이기 시작하면 지도를 좀비 위치로 이동
      if (zombiePosition && mapRef.current) {
        const kakao = window.kakao;
        if (kakao && kakao.maps) {
          mapRef.current.panTo(new kakao.maps.LatLng(zombiePosition.lat, zombiePosition.lng));
        }
      }
    } else if (isGameOver) {
      // 게임 오버 시 애니메이션 중단
      cancelAnimationFrame(requestRef.current);
      // 오디오도 완전히 중단
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
        gainNodeRef.current.gain.value = 0;
      }
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, routePath, isGameOver]);

  // 컴포넌트가 언마운트될 때만 좀비 생성 타이머를 정리합니다.
  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px 20px', borderRadius: '20px' }}>
        {isGameOver ? <h1 style={{ color: 'red' }}>CAUGHT!</h1> : `Distance: ${distance || 0}m`}
        <div style={{ marginTop: '10px' }}>
          <label htmlFor="zombie-speed-select" style={{ marginRight: '10px' }}>좀비 추격 속도 (1-10):</label>
          <select
            id="zombie-speed-select"
            value={selectedZombieSpeed}
            onChange={(e) => setSelectedZombieSpeed(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(speed => (
              <option key={speed} value={speed}>
                {speed} {speed === 5 ? '(보통)' : speed === 10 ? '(최대)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label htmlFor="zombie-spawn-delay-select" style={{ marginRight: '10px' }}>좀비 생성 지연:</label>
          <select
            id="zombie-spawn-delay-select"
            value={selectedSpawnDelay}
            onChange={(e) => setSelectedSpawnDelay(Number(e.target.value))}
          >
            <option value={0}>즉시</option>
            <option value={10}>10초 뒤</option>
            <option value={30}>30초 뒤</option>
            <option value={60}>60초 뒤</option>
          </select>
        </div>
      </div>

      {/* 화면 중앙 카운트다운 표시 */}
      {countdown > 0 && !isGameOver && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          fontSize: '150px',
          fontWeight: 'bold',
          color: 'rgba(255, 0, 0, 0.7)',
          textShadow: '0 0 30px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none' // 지도를 가려도 클릭이 방해받지 않도록 설정
        }}>
          {countdown}
        </div>
      )}

      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default ZombieMapApp;