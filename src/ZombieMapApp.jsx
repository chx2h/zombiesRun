import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map, Polyline, CustomOverlayMap, Circle } from 'react-kakao-maps-sdk';
import zombieSfx from './assets/dragon-studio-female-zombie-screams-324744.mp3';

// 레벨 1부터 50까지의 좀비 이모지를 반환하는 헬퍼 함수
const getZombieEmoji = (level) => {
  const emojis = [
    "🦠", "🐛", "🐌", "🍄", "💀", "👻", "👽", "🎃", "🦇", "🐺",  // 1 ~ 10
    "🐗", "🕷️", "🦂", "🐍", "🦎", "🐊", "🐅", "🐆", "🦍", "🧟‍♀️", // 11 ~ 20
    "🧟‍♂️", "🧟", "🧟‍♀️", "🧟‍♂️", "🧛‍♀️", "🧛‍♂️", "🧛", "🧙‍♀️", "🧙‍♂️", "🧙", // 21 ~ 30
    "👹", "👺", "👾", "🤖", "🦖", "🦕", "🐉", "🐊", "👹", "👺", // 31 ~ 40
    "⚡", "🔥", "❄️", "☠️", "👿", "🌋", "☣️", "🌀", "👹", "👑" // 41 ~ 50
  ];

  const idx = Math.min(Math.max(1, Number(level)), 50) - 1;
  return emojis[idx] || "🧟";
};

// 좀비 최대 속도 기준 (보행자 경로의 정밀도를 고려해 밸런싱)
const ZOMBIE_SPEED_BASE = 0.0000033; // 기본 속도를 대폭 상향 (기존 50레벨 속도가 신규 30레벨 수준이 되도록 조정)

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

const ZombieMapApp = ({ gameMode, onExit, onSaveRecord, setIsGameActive, setTriggerExitConfirm, initialRoutePath }) => {
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
  const isFollowingUserRef = useRef(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false); // 종료 확인 팝업 상태
  const [showReconfirmPath, setShowReconfirmPath] = useState(false); // 경로 재설정 확인 팝업
  const [isFollowingZombie, setIsFollowingZombie] = useState(false); // 좀비 추적 모드 상태
  const isFollowingZombieRef = useRef(false);

  useEffect(() => {
    isFollowingUserRef.current = isFollowingUser;
  }, [isFollowingUser]);

  useEffect(() => {
    isFollowingZombieRef.current = isFollowingZombie;
  }, [isFollowingZombie]);

  const [pendingDest, setPendingDest] = useState(null); // 대기 중인 목적지
  const [dangerLevel, setDangerLevel] = useState(0); // 0: 안전, 1: 경고(25m), 2: 위험(10m)

  // --- 경로 기록 전용 상태 ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPath, setRecordedPath] = useState([]);
  const recordedPathRef = useRef([]);
  const routePathRef = useRef([]);

  useEffect(() => {
    recordedPathRef.current = recordedPath;
  }, [recordedPath]);

  useEffect(() => {
    routePathRef.current = routePath;
  }, [routePath]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [customRouteTitle, setCustomRouteTitle] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // 설정 상태
  const [selectedZombieSpeed, setSelectedZombieSpeed] = useState(() => {
    const saved = localStorage.getItem(`${gameMode}_zombieSpeed`);
    return saved !== null ? Number(saved) : 1;
  });

  // --- 좀비 실시간 레벨업 및 난이도 조절 시스템 ---
  const [zombieProgress, setZombieProgress] = useState({ level: 1, xp: 0 });
  const [isLevelUpFlashing, setIsLevelUpFlashing] = useState(false);

  // --- 유저 달리기 애니메이션 전용 상태 ---
  const [isUserMoving, setIsUserMoving] = useState(false);
  const [runnerFrame, setRunnerFrame] = useState(0);
  const userMoveTimerRef = useRef(null);

  // 테스트 모드 (개발자 및 실내 테스트용 사용자 위치 키보드 제어 상태)
  const [isDebugMode, setIsDebugMode] = useState(false);
  const isDebugModeRef = useRef(false);

  useEffect(() => {
    isDebugModeRef.current = isDebugMode;
    // 테스트 모드가 켜졌는데 현재 유저 위치가 없는 경우 기본 가상 좌표(서울 시청)를 즉시 설정하여 브라우저 GPS 차단 상황 대응
    if (isDebugMode && !userPosRef.current) {
      const defaultMockPos = { lat: 37.5665, lng: 126.978 };
      setUserPosition(defaultMockPos);
      userPosRef.current = defaultMockPos;
      setMapCenter(defaultMockPos);
      isFirstPositionFoundRef.current = true;
      console.log("테스트 모드 활성화로 인한 기본 가상 위치 설정:", defaultMockPos);
    }
  }, [isDebugMode]);

  // 지수 스케일 요구 경험치 계산 함수 (고레벨일수록 더 많은 경험치 필요)
  const getNextLevelXp = useCallback((currentLevel) => {
    return Math.round(30 + Math.pow(currentLevel, 1.3) * 1.5);
  }, []);

  // 레벨업 특수 효과 및 진동 발생 함수 (오디오 포효 제거, 강력 진동 추가)
  const triggerZombieLevelUpEffect = useCallback(() => {
    // 1. 시각 효과 플래싱 온 (500ms 후 복구)
    setIsLevelUpFlashing(true);
    setTimeout(() => {
      setIsLevelUpFlashing(false);
    }, 500);

    // 2. 강한 진동 효과 트리거 (오디오 울음소리는 완전히 제거)
    if ("vibrate" in navigator) {
      navigator.vibrate([600, 200, 600]); // 강하고 묵직한 2단 진동
    }
  }, []);

  // 경험치 획득 및 연쇄 레벨업 핸들러 (최대 100레벨까지 제한 완화)
  const gainZombieXp = useCallback((amount) => {
    setZombieProgress((prev) => {
      if (prev.level >= 100) return prev;

      let newXp = prev.xp + amount;
      let currentLevel = prev.level;
      let didLevelUp = false;

      while (newXp >= getNextLevelXp(currentLevel) && currentLevel < 100) {
        newXp -= getNextLevelXp(currentLevel);
        currentLevel += 1;
        didLevelUp = true;
      }

      if (didLevelUp) {
        // 레벨업 특수 효과 연출
        triggerZombieLevelUpEffect();
      }
      return { level: currentLevel, xp: newXp };
    });
  }, [getNextLevelXp, triggerZombieLevelUpEffect]);
  const [selectedSpawnDelay, setSelectedSpawnDelay] = useState(() => {
    const saved = localStorage.getItem(`${gameMode}_spawnDelay`);
    return saved !== null ? Number(saved) : 10;
  });

  // --- [추가] 경로 즐겨찾기 및 히스토리 관리 상태 ---
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('zombie_route_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [showFavorites, setShowFavorites] = useState(false); // 리스트 표시 여부
  const [editingId, setEditingId] = useState(null);          // 현재 수정 중인 경로 ID
  const [editingTitle, setEditingTitle] = useState('');      // 수정 중인 제목 텍스트

  // 즐겨찾기 목록이 변경될 때마다 로컬 스토리지에 자동 저장
  useEffect(() => {
    localStorage.setItem('zombie_route_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // 즐겨찾기 경로를 클릭했을 때 해당 경로를 지도에 뿌리고 게임을 재시작하는 함수
  const loadFavoriteRoute = (fav) => {
    if (!fav.routePath || fav.routePath.length === 0) return;

    // 게임 상태 초기화 및 새로운 경로 주입
    setIsGameOver(false);
    setGameResult(null);
    setDangerLevel(0);
    setRoutePath(fav.routePath);
    setMapCenter(fav.routePath[0]);

    // 좀비 스폰 타이머 재설정 (기존 타이머 클리어)
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    setZombiePosition(null);
    zombiePosRef.current = null;
    setCountdown(selectedSpawnDelay);

    // 지정된 딜레이 후 좀비 출현
    if (gameMode !== 'survival') {
      spawnTimerRef.current = setTimeout(() => {
        const startPos = fav.routePath[0];
        pathIndexRef.current = 0;
        setZombiePosition(startPos);
        zombiePosRef.current = startPos;
        setCountdown(0);
        console.log("즐겨찾기 경로로 좀비 출현!");
      }, selectedSpawnDelay * 1000);
    }

    setShowFavorites(false); // 리스트 창 닫기
  };

  // 제목 클릭 시 수정 모드로 전환하는 함수
  const startEditing = (e, fav) => {
    e.stopPropagation(); // 부모 항목의 '경로 로드 클릭 이벤트' 전파 방지
    setEditingId(fav.id);
    setEditingTitle(fav.title);
  };

  // 변경된 제목을 저장하는 함수
  const saveTitle = (id) => {
    setFavorites(prev => prev.map(item =>
      item.id === id ? { ...item, title: editingTitle.trim() || item.title } : item
    ));
    setEditingId(null);
  };

  // 즐겨찾기 삭제 함수 (선택 사항)
  const deleteFavorite = (e, id) => {
    e.stopPropagation(); // 경로 로드 전파 방지
    if (window.confirm("이 경로를 목록에서 삭제하시겠습니까?")) {
      setFavorites(prev => prev.filter(item => item.id !== id));
    }
  };

  // --- [확인 및 추가] 경로 요청 대기 상태 ---
  const [showRouteConfirm, setShowRouteConfirm] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null); // 클릭한 목적지 좌표 저장

  // 지도를 클릭했을 때 실행되는 함수
  const handleMapClick = (target, mouseEvent) => {
    // 게임 오버 상태거나 이미 다른 연산 중일 때의 예외 처리가 있다면 유지
    if (isGameOver) return;

    const latLng = mouseEvent.latLng;
    const coords = {
      lat: latLng.getLat(),
      lng: latLng.getLng()
    };

    // 즉시 길찾기를 하지 않고, 좌표를 예약한 뒤 팝업을 띄웁니다.
    setPendingCoords(coords);
    setShowRouteConfirm(true);
  };


  // --- [수정] 생성된 경로를 최신순으로 '지금까지 했던 경로 리스트'에 자동 등록 ---
  useEffect(() => {
    if (gameMode === 'record') return; // 기록 모드일 때는 자동 추가 방지
    if (routePath && routePath.length > 0) {
      setFavorites(prev => {
        // 완전히 동일한 출발지/목적지를 가진 경로가 이미 있는지 체크
        const isDuplicate = prev.some(fav =>
          fav.routePath.length === routePath.length &&
          fav.routePath[0]?.lat === routePath[0]?.lat &&
          fav.routePath[0]?.lng === routePath[0]?.lng &&
          fav.routePath[routePath.length - 1]?.lat === routePath[routePath.length - 1]?.lat &&
          fav.routePath[routePath.length - 1]?.lng === routePath[routePath.length - 1]?.lng
        );

        if (isDuplicate) return prev; // 이미 있다면 추가하지 않음

        // 현재 시간을 포함한 기본 제목 생성 (예: 경로 1 (6/22 15:30))
        const now = new Date();
        const defaultTitle = `경로 ${prev.length + 1} (${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')})`;

        // [변경 포인트] 최신 경로를 배열의 가장 앞에 배치하고, 기존 목록(...prev)을 뒤로 보냅니다.
        return [
          {
            id: Date.now(),
            title: defaultTitle,
            routePath: routePath,
            isCustom: false // 일반 조회 경로 플래그 추가
          },
          ...prev
        ];
      });
    }
  }, [routePath, gameMode]);

  // 설정값이 변경될 때마다 localStorage에 저장 (서바이벌 모드는 제외)
  useEffect(() => {
    if (gameMode === 'survival') return;
    localStorage.setItem(`${gameMode}_zombieSpeed`, selectedZombieSpeed);
  }, [selectedZombieSpeed, gameMode]);

  // 서바이벌 모드 시작 시 속도(레벨) 1로 고정 초기화 및 저장상태 리셋
  useEffect(() => {
    hasSavedRef.current = false; // 새 게임 모드 로드 시 저장 상태 초기화
    setZombieProgress({ level: 1, xp: 0 }); // 새 게임 모드 로드 시 레벨 및 경험치 초기화
    if (gameMode === 'survival') {
      setSelectedZombieSpeed(1);
    }
  }, [gameMode]);

  useEffect(() => {
    localStorage.setItem(`${gameMode}_spawnDelay`, selectedSpawnDelay);
  }, [selectedSpawnDelay, gameMode]);

  // API 키 설정 (Vite는 import.meta.env를 사용합니다)
  const TMAP_API_KEY = import.meta.env.VITE_TMAP_API_KEY;

  // 애니메이션 및 오디오 제어용 Refs
  const mapRef = useRef(null); // mapRef 선언
  const isFirstPositionFoundRef = useRef(false);
  const hasSavedRef = useRef(false);
  const lastUserPosForExpRef = useRef(null);
  const accumulatedUserDistanceRef = useRef(0);
  const decodedZombieBufferRef = useRef(null);

  // 지도를 지정 좌표로 스와이프하듯이 부드럽게 이동시키는 함수 (Lerp 애니메이션)
  const animatePanTo = (targetLat, targetLng, duration = 800) => {
    if (!mapRef.current || !window.kakao || !window.kakao.maps) {
      setMapCenter({ lat: targetLat, lng: targetLng });
      return;
    }

    const center = mapRef.current.getCenter();
    const startLat = center.getLat();
    const startLng = center.getLng();
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutCubic 이징
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const nextLat = startLat + (targetLat - startLat) * easeProgress;
      const nextLng = startLng + (targetLng - startLng) * easeProgress;

      try {
        const newLatLng = new window.kakao.maps.LatLng(nextLat, nextLng);
        mapRef.current.setCenter(newLatLng);
      } catch (e) {
        console.error("animatePanTo setCenter error:", e);
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setMapCenter({ lat: targetLat, lng: targetLng });
      }
    };

    requestAnimationFrame(step);
  };
  const requestRef = useRef();
  const pathIndexRef = useRef(0);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const heartbeatGainRef = useRef(null); // 심장박동용 Gain
  const ambientGainRef = useRef(null); // 배경노이즈용 Gain
  const pulseIntervalRef = useRef(null); // 심장박동 인터벌
  const userPosRef = useRef(null);
  const zombiePosRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const distanceRef = useRef(null); // 심장박동 펄스 루프에서 최신 거리값을 참조하기 위한 ref
  const vibrationTimerRef = useRef(null); // 진동 간격 제어용 타이머
  const speedIncreaseFrameCountRef = useRef(0); // 서바이벌 모드 실시간 가속용 프레임 카운터

  // "따라가기" 모드일 때 사용자 위치를 지도 중심에 동기화
  useEffect(() => {
    if (isFollowingUser && userPosition) {
      setMapCenter(userPosition);
    }
  }, [userPosition, isFollowingUser]);

  // 실시간 사용자 경로 기록 로직 (gameMode가 record이고 기록 중일 때, 또는 survival 모드일 때 작동)
  useEffect(() => {
    if (((gameMode === 'record' && isRecording) || gameMode === 'survival') && userPosition) {
      setRecordedPath(prev => {
        if (prev.length === 0) {
          return [userPosition];
        }
        const lastPos = prev[prev.length - 1];
        const dist = calculateDistance(lastPos.lat, lastPos.lng, userPosition.lat, userPosition.lng);
        // GPS 신호 튐으로 인한 미세 진동 차단 (최소 3미터 이상 이동 시 기록)
        if (dist >= 3) {
          console.log(`경로 추가: ${dist}m 이동`, userPosition);
          return [...prev, userPosition];
        }
        return prev;
      });
    }
  }, [userPosition, isRecording, gameMode]);



  // "좀비 따라가기" 모드일 때 좀비 위치를 지도 중심에 동기화
  useEffect(() => {
    if (isFollowingZombie && zombiePosition) {
      setMapCenter(zombiePosition);
    }
  }, [zombiePosition, isFollowingZombie]);

  // 유저 실시간 움직임 판단 이펙트 (애니메이션 구동용)
  useEffect(() => {
    if (!userPosition) return;
    setIsUserMoving(true);
    if (userMoveTimerRef.current) clearTimeout(userMoveTimerRef.current);
    userMoveTimerRef.current = setTimeout(() => {
      setIsUserMoving(false);
    }, 2000); // 2초 동안 위치 갱신이 없으면 정지 상태로 간주
  }, [userPosition]);

  // 유저 질주 모션 프레임 교차 이펙트
  useEffect(() => {
    if (!isUserMoving || isGameOver) {
      setRunnerFrame(0);
      return;
    }
    const timer = setInterval(() => {
      setRunnerFrame(prev => (prev === 0 ? 1 : 0));
    }, 180); // 180ms 주기로 이모지 프레임 교환
    return () => clearInterval(timer);
  }, [isUserMoving, isGameOver]);

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
        if (isDebugModeRef.current) return;
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPosition(newPos);
        userPosRef.current = newPos;

        // 최초 1회 현재 위치를 찾았을 때 부드럽게 스와이프하며 이동
        if (!isFirstPositionFoundRef.current) {
          isFirstPositionFoundRef.current = true;
          setTimeout(() => {
            if (mapRef.current) {
              animatePanTo(newPos.lat, newPos.lng);
            } else {
              setMapCenter(newPos);
            }
          }, 200);
        }

        console.log("현재 위치 수신:", newPos);
      }, (err) => console.error("위치 추적 실패:", err),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 개발 및 테스트용 키보드(방향키/WASD) 사용자 위치 제어 훅
  useEffect(() => {
    const handleKeyDown = (e) => {
      // [히든 단축키] Ctrl + Shift + D 입력 시 테스트 모드 활성화/비활성화 토글
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        setIsDebugMode(prev => {
          const nextVal = !prev;
          isDebugModeRef.current = nextVal;
          console.log("히든 단축키로 테스트 모드 상태 변경:", nextVal);
          return nextVal;
        });
        return;
      }

      if (!isDebugModeRef.current || isGameOver || !userPosRef.current) return;

      const moveStep = 0.00002; // 약 2.2미터
      const moveStepLng = 0.000025; // 동서 방향 경도 보정값

      let newLat = userPosRef.current.lat;
      let newLng = userPosRef.current.lng;
      let moved = false;

      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          newLat += moveStep;
          moved = true;
          break;
        case 's':
        case 'arrowdown':
          newLat -= moveStep;
          moved = true;
          break;
        case 'a':
        case 'arrowleft':
          newLng -= moveStepLng;
          moved = true;
          break;
        case 'd':
        case 'arrowright':
          newLng += moveStepLng;
          moved = true;
          break;
        default:
          break;
      }

      if (moved) {
        e.preventDefault(); // 스크롤 차단
        const nextPos = { lat: newLat, lng: newLng };
        setUserPosition(nextPos);
        userPosRef.current = nextPos;
        setMapCenter(nextPos); // 맵 중심 동기화
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameOver]);

  // 유저 이동 시 5m마다 좀비 경험치 획득 처리 (거리 비례) - 비활성화 (주석 처리)
  /*
  useEffect(() => {
    if (gameMode !== 'survival' || isGameOver || !userPosition) {
      lastUserPosForExpRef.current = null;
      return;
    }

    if (lastUserPosForExpRef.current) {
      const dist = calculateDistance(
        lastUserPosForExpRef.current.lat,
        lastUserPosForExpRef.current.lng,
        userPosition.lat,
        userPosition.lng
      );
      if (dist > 0) {
        accumulatedUserDistanceRef.current += dist;
        if (accumulatedUserDistanceRef.current >= 5) {
          const expEarned = Math.floor(accumulatedUserDistanceRef.current / 5) * 2; // 기존 5m당 1 XP에서 2배로 상향
          accumulatedUserDistanceRef.current %= 5;
          gainZombieXp(expEarned);
        }
      }
    }
    lastUserPosForExpRef.current = userPosition;
  }, [userPosition, gameMode, isGameOver, gainZombieXp]);
  */

  // 컴포넌트 언마운트 시 오디오 및 타이머 정리
  useEffect(() => {
    return () => {
      if (pulseIntervalRef.current) clearTimeout(pulseIntervalRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(e => console.error("AudioContext close error:", e));
    };
  }, []);

  // 게임이 활성 상태인지 부모 컴포넌트에 알림
  const isGameActive = ((gameMode === 'record' || gameMode === 'survival') ? recordedPath.length > 0 : routePath.length > 0) && !isGameOver;
  useEffect(() => {
    if (setIsGameActive) {
      setIsGameActive(isGameActive);
    }
  }, [isGameActive, setIsGameActive]);

  // 뒤로가기 시 팝업을 띄우는 함수를 부모 컴포넌트에 노출
  useEffect(() => {
    if (setTriggerExitConfirm) {
      setTriggerExitConfirm(() => {
        setShowExitConfirm(true);
      });
    }
    return () => {
      if (setTriggerExitConfirm) {
        setTriggerExitConfirm(null);
      }
    };
  }, [setTriggerExitConfirm]);

  // 오디오 시스템 초기화
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime); // 초기 볼륨 0
    gainNode.connect(ctx.destination);
    gainNodeRef.current = gainNode;

    try {
      // 1. 좀비 비명 소리 로드 및 설정
      const response = await fetch(zombieSfx);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      decodedZombieBufferRef.current = audioBuffer;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(gainNodeRef.current);
      source.start();
    } catch (e) {
      console.error("좀비 비명 오디오 로드 실패", e);
    }

    // 2. 음산한 배경 노이즈 생성
    const ambGain = ctx.createGain();
    ambGain.gain.setValueAtTime(0, ctx.currentTime); // 초기 볼륨 0
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
    ambientGainRef.current = ambGain;

    // 3. 심장박동 효과 설정
    const beatGain = ctx.createGain();
    beatGain.gain.setValueAtTime(0, ctx.currentTime); // 초기 볼륨 0
    beatGain.connect(ctx.destination);
    heartbeatGainRef.current = beatGain;

    audioCtxRef.current = ctx;
  }, []);

  // 경로 기록 모드 또는 서바이벌 모드일 때 첫 궤적이 형성되면(길이 2) 좀비 스폰 타이머 작동
  useEffect(() => {
    if (((gameMode === 'record' && isRecording) || gameMode === 'survival') && recordedPath.length === 2) {
      // 오디오 활성화
      initAudio();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();

      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      setCountdown(selectedSpawnDelay);

      spawnTimerRef.current = setTimeout(() => {
        const startPos = recordedPath[0];
        pathIndexRef.current = 0;
        setZombiePosition(startPos);
        zombiePosRef.current = startPos;
        setCountdown(0);
        console.log(`좀비 출현 (${gameMode} 모드)!`);
      }, selectedSpawnDelay * 1000);
    }
  }, [recordedPath.length, gameMode, isRecording, selectedSpawnDelay, initAudio]);

  // 재사용 경로(initialRoutePath)가 주어지면 초기 경로로 설정
  useEffect(() => {
    if (initialRoutePath && initialRoutePath.length > 0) {
      setRoutePath(initialRoutePath);
      setMapCenter(initialRoutePath[0]);

      // 새 게임 모드 실행 시 상태 전면 초기화
      setZombieProgress({ level: 1, xp: 0 });
      setRecordedPath([]);
      setIsGameOver(false);
      setGameResult(null);
      setDistance(null);
      hasSavedRef.current = false;
      accumulatedUserDistanceRef.current = 0;
      lastUserPosForExpRef.current = null;

      if (gameMode !== 'survival') {
        if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
        setZombiePosition(null);
        zombiePosRef.current = null;
        setCountdown(selectedSpawnDelay);

        spawnTimerRef.current = setTimeout(() => {
          const startPos = initialRoutePath[0];
          pathIndexRef.current = 0;
          setZombiePosition(startPos);
          zombiePosRef.current = startPos;
          setCountdown(0);
          console.log("좀비출현 (복사된 경로)!");
        }, selectedSpawnDelay * 1000);
      } else {
        if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
        setZombiePosition(null);
        zombiePosRef.current = null;
        setCountdown(0);
        setSelectedZombieSpeed(1);
      }
    }
  }, [initialRoutePath, selectedSpawnDelay, gameMode]);

  // 첫 사용자 상호작용 시 오디오 시작/재개 처리
  useEffect(() => {
    const resumeAudio = () => {
      initAudio();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);
    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
    };
  }, [initAudio]);

  /**
   * 지도 클릭 시 Tmap 경로 생성 및 좀비 출현 예약
   * 실제 경로 탐색을 수행하는 함수
   */
  const startPathFinding = useCallback(async (latLng) => {
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume(); // 오디오 컨텍스트 재개

    // [수정] 카카오 객체(.getLat())와 일반 {lat, lng} 객체를 모두 지원하도록 방어 코드를 작성합니다.
    const targetLat = typeof latLng.getLat === 'function' ? latLng.getLat() : latLng.lat;
    const targetLng = typeof latLng.getLng === 'function' ? latLng.getLng() : latLng.lng;
    const dest = { lat: targetLat, lng: targetLng };
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
    hasSavedRef.current = false; // 저장 상태 리셋
    setZombieProgress({ level: 1, xp: 0 }); // 레벨 및 경험치 초기화
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();

    // 스폰 타이머가 진행 중이라면 취소하고 즉시 생성 모드로 전환
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
    setCountdown(0);

    pathIndexRef.current = 0;
    lastUserPosForExpRef.current = null;
    accumulatedUserDistanceRef.current = 0;
    if (gameMode === 'survival') {
      setSelectedZombieSpeed(1);
    }
    setIsGameOver(false);
    setGameResult(null);
    setDistance(null);

    const activePath = (gameMode === 'record' || gameMode === 'survival') ? recordedPath : routePath;
    if (activePath && activePath.length > 0) {
      const startPos = activePath[0];
      setZombiePosition(startPos);
      zombiePosRef.current = startPos;
    } else {
      setZombiePosition(null);
      zombiePosRef.current = null;
    }
  }, [routePath, recordedPath, gameMode, initAudio]);

  const currentZombieSpeed = useMemo(() => {
    const speedLevel = Number(selectedZombieSpeed);
    if (gameMode === 'survival') {
      // 서바이벌 모드 전용 속도 밸런싱
      // 달리기 시작 시 거리가 너무 벌어지지 않도록 Lv.1 시작 속도를 시속 8.3km/h 수준(초속 약 2.3m)으로 상향
      const baseSurvivalSpeed = 0.00000035; 
      // 기존 최고속도가 30레벨 속도 수준이 되도록 레벨당 증가폭을 1.38%로 설정 (만렙인 100레벨에서는 무척 빠르게 추격)
      return baseSurvivalSpeed * (1 + (zombieProgress.level - 1) * 0.0138);
    }
    return (speedLevel / 50) * ZOMBIE_SPEED_BASE;
  }, [selectedZombieSpeed, zombieProgress.level, gameMode]);

  const maxZombieLevel = useMemo(() => {
    try {
      const records = JSON.parse(localStorage.getItem('gameRecords') || '[]');
      const survivalRecords = records.filter(rec => rec.mode === 'survival');
      if (survivalRecords.length === 0) return 1;
      const speeds = survivalRecords.map(rec => Number(rec.zombieSpeed || 0));
      return Math.max(...speeds, 1);
    } catch (e) {
      return 1;
    }
  }, [gameResult, isGameOver]);

  /**
   * 프레임별 애니메이션 루프
   */
  const animateRef = useRef(null);
  useEffect(() => {
    animateRef.current = animate;
  });

  const animate = useCallback(() => {
    const activePath = (gameMode === 'record' || gameMode === 'survival') ? recordedPathRef.current : routePathRef.current;
    if (isGameOver || activePath.length === 0) return;

    // 서바이벌 모드 실시간 가속 (30m 이상 벌어질 때 시간 비례 경험치 획득, 레벨 제한 100)
    if (gameMode === 'survival' && !isGameOver && zombiePosRef.current && userPosRef.current) {
      const d = distanceRef.current;
      if (d !== null && d >= 30 && zombieProgress.level < 100) {
        speedIncreaseFrameCountRef.current += 1;
        if (speedIncreaseFrameCountRef.current >= 60) {
          speedIncreaseFrameCountRef.current = 0;
          gainZombieXp(2); // 시간 비례 경험치 획득 (1초당 1 XP에서 2배인 2 XP로 상향)
        }
      } else {
        speedIncreaseFrameCountRef.current = 0;
        setZombieProgress(prev => ({ ...prev, xp: 0 }));
      }
    }

    // 좀비가 아직 생성되지 않았으면 루프만 유지
    const prevPos = zombiePosRef.current;
    if (!prevPos) { // 좀비 생성 전 대기 루프
      // 좀비가 아직 소환되지 않았으므로 비명 소리 및 배경 노이즈 볼륨을 0으로 강제 설정
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
      }
      if (ambientGainRef.current && audioCtxRef.current) {
        ambientGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
      }
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const target = activePath[pathIndexRef.current + 1];
    if (!target) {
      if (gameMode === 'record' || gameMode === 'survival') {
        // 기록/서바이벌 모드에서는 좀비가 현재 궤적 끝에 도달하면 다음 경로 수집 시까지 대기
        requestRef.current = requestAnimationFrame(animate);
        return;
      }
      // 좀비가 목적지에 도달했을 때 (잡힌 것과 동일하게 처리)
      if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
      setIsGameOver(true);
      setGameResult('lose');
      if (gainNodeRef.current) gainNodeRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
      return;
    }

    // --- 끈질긴 추격을 위한 러버밴딩(Rubber-banding) 제어 로직 적용 ---
    let rubberBandingMultiplier = 1.0;
    if (distanceRef.current !== null) {
      const d = distanceRef.current;
      if (d >= 50) {
        rubberBandingMultiplier = 2.0; // 50m 이상 멀어지면 빠르게 추격하기 위해 2.0배 가속
      } else if (d >= 30) {
        rubberBandingMultiplier = 1.4; // 30m ~ 50m 구간 1.4배 가속
      } else if (d >= 15) {
        rubberBandingMultiplier = 1.0; // 15m ~ 30m 기본 추격 페이스
      } else if (d >= 5) {
        // 5m ~ 15m 구간에서는 잡히기 직전의 긴장감 연출을 위해 선형 보간하여 서서히 감속 (0.75 ~ 1.0배)
        rubberBandingMultiplier = 0.75 + ((d - 5) / 10) * 0.25;
      } else {
        rubberBandingMultiplier = 0.75;
      }
    }
    const finalSpeed = currentZombieSpeed * rubberBandingMultiplier;

    const dLat = target.lat - prevPos.lat;
    const dLng = target.lng - prevPos.lng;
    const len = Math.sqrt(dLat * dLat + dLng * dLng);

    let newPos;
    if (len < finalSpeed) {
      pathIndexRef.current += 1;
      newPos = target;
    } else {
      newPos = {
        lat: prevPos.lat + (dLat / len) * finalSpeed,
        lng: prevPos.lng + (dLng / len) * finalSpeed,
      };
    }

    setZombiePosition(newPos);
    zombiePosRef.current = newPos;

    // 좀비 따라가기 카메라 고정
    if (isFollowingZombieRef.current) {
      setMapCenter(newPos);
    }

    // 거리 계산 및 특수 효과
    if (userPosRef.current) {
      const d = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, newPos.lat, newPos.lng);
      setDistance(d);
      distanceRef.current = d; // 펄스 루프에서 최신 거리 참조용

      // 위험 레벨 갱신 (화면 번쩍임 효과 제어)
      if (d <= 10) {
        setDangerLevel(2); // 극도 위험
      } else if (d <= 25) {
        setDangerLevel(1); // 경고
      } else {
        setDangerLevel(0); // 안전
      }

      // 오디오 볼륨 제어 (50m 이내)
      if (gainNodeRef.current && audioCtxRef.current) {
        const rawVol = d >= 50 ? 0 : (50 - d) / 50;
        const zombieVol = Math.pow(rawVol, 2) * 1.5;
        const ambientVol = Math.max(0, Math.min(0.5, Math.pow(rawVol, 2) * 1.5));

        // 좀비 비명 소리 볼륨 조절
        gainNodeRef.current.gain.setTargetAtTime(Math.min(1.5, zombieVol), audioCtxRef.current.currentTime, 0.1);
        // 배경 노이즈 볼륨 조절
        if (ambientGainRef.current) ambientGainRef.current.gain.setTargetAtTime(ambientVol, audioCtxRef.current.currentTime, 0.1);
      }

      // 심장 박동 소리 + 거리 기반 진동 패턴 (ManualPage 시뮬레이터와 동일한 방식)
      if (heartbeatGainRef.current && audioCtxRef.current) {
        if (!pulseIntervalRef.current) { // 인터벌이 없을 때만 새로 시작
          const runPulse = () => {
            const currentDist = distanceRef.current; // ref로 최신 거리값 참조
            if (currentDist === null || currentDist >= 50) {
              pulseIntervalRef.current = setTimeout(runPulse, 1200); // 멀리 있을 땐 1.2초 간격
              return;
            }

            // 심장 박동 사운드 생성 (비활성화)
            /*
            const now = audioCtxRef.current.currentTime;
            const osc = audioCtxRef.current.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(60, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
            const oscGain = audioCtxRef.current.createGain();
            const rawVol = (50 - currentDist) / 50;
            oscGain.gain.setValueAtTime(0, now);
            oscGain.gain.linearRampToValueAtTime(Math.min(1.2, Math.pow(rawVol, 2) * 1.5 * 0.8), now + 0.05);
            oscGain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.connect(oscGain);
            oscGain.connect(heartbeatGainRef.current);
            osc.start(now);
            osc.stop(now + 0.35);
            */

            // 거리 기반 진동 패턴 (심장박동과 동기화)
            if (navigator.vibrate) {
              if (currentDist <= 10) {
                navigator.vibrate([200, 100, 200]); // 극도 위험: 강한 더블 진동 패턴
              } else if (currentDist <= 25) {
                navigator.vibrate(100); // 경고: 인지 가능한 진동
              }
            }

            // 거리가 가까울수록 펄스 간격이 짧아짐
            const factor = Math.max(0.1, currentDist / 50);
            pulseIntervalRef.current = setTimeout(runPulse, 1200 * factor);
          };
          runPulse();
        }
      }

      // 잡힘 판정 (Survival 모드일 때만 5m 이내 종료)
      if (d <= 5 && gameMode === 'survival') {
        if ("vibrate" in navigator) navigator.vibrate([1000, 500, 1000]);
        setIsGameOver(true);
        setGameResult('lose');
        if (audioCtxRef.current) {
          gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
          ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
        }
        return;
      }

      // 사용자가 목적지에 도달했는지 확인 (RUN 모드 승리 조건)
      if (gameMode === 'run' && routePath && routePath.length > 0) {
        const destination = routePath[routePath.length - 1];
        const distToFinish = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, destination.lat, destination.lng);
        if (distToFinish <= 15) { // 15미터 이내 도착 시 승리
          setIsGameOver(true);
          setGameResult('win');
          if (audioCtxRef.current) {
            gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
            ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
          }
          return;
        }
      }
    }

    requestRef.current = requestAnimationFrame(() => animateRef.current && animateRef.current());
  }, [isGameOver, currentZombieSpeed, gameMode]);

  // 게임 종료 시 기록 저장
  useEffect(() => {
    if (isGameOver && onSaveRecord && !hasSavedRef.current) {
      hasSavedRef.current = true; // 중복 저장 차단 락 활성화
      let result = '-';
      if (gameResult === 'win') result = '탈출';
      if (gameResult === 'lose') result = '사망';

      const activePath = (gameMode === 'record' || gameMode === 'survival') ? recordedPath : routePath;
      let totalDistanceStr = '-';
      if (activePath.length > 0) {
        let dist = 0;
        for (let i = 0; i < activePath.length - 1; i++) {
          dist += calculateDistance(activePath[i].lat, activePath[i].lng, activePath[i + 1].lat, activePath[i + 1].lng);
        }
        totalDistanceStr = (dist / 1000).toFixed(2) + 'km';
      }

      onSaveRecord({
        date: new Date().toISOString(),
        mode: gameMode,
        distance: totalDistanceStr,
        zombieSpeed: gameMode === 'survival' ? zombieProgress.level : selectedZombieSpeed,
        result: result,
        routePath: activePath,
      });
    }
  }, [isGameOver, gameResult, gameMode, routePath, recordedPath, onSaveRecord, selectedZombieSpeed, zombieProgress.level]);

  // 중간 종료 시 기록 저장
  const handleExitAndSave = () => {
    if (onSaveRecord && !hasSavedRef.current) {
      hasSavedRef.current = true; // 중복 저장 차단 락 활성화
      const activePath = (gameMode === 'record' || gameMode === 'survival') ? recordedPath : routePath;
      let totalDistanceStr = '-';
      if (activePath.length > 0) {
        let dist = 0;
        for (let i = 0; i < activePath.length - 1; i++) {
          dist += calculateDistance(activePath[i].lat, activePath[i].lng, activePath[i + 1].lat, activePath[i + 1].lng);
        }
        totalDistanceStr = (dist / 1000).toFixed(2) + 'km';
      }

      onSaveRecord({
        date: new Date().toISOString(),
        mode: gameMode,
        distance: totalDistanceStr,
        zombieSpeed: gameMode === 'survival' ? zombieProgress.level : selectedZombieSpeed,
        result: '-', // 중간 종료는 '-'로 표시
        routePath: activePath,
      });
    }
    // 기록 저장 후 인트로 화면으로 이동
    onExit();
  };

  useEffect(() => {
    const activePathLength = (gameMode === 'record' || gameMode === 'survival') ? recordedPath.length : routePath.length;
    if (activePathLength > 0 && !isGameOver) {
      requestRef.current = requestAnimationFrame(() => animateRef.current && animateRef.current());
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, routePath.length, recordedPath.length, isGameOver, gameMode]);

  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (pulseIntervalRef.current) clearTimeout(pulseIntervalRef.current);
    };
  }, []);

  // 브라우저/탭 종료 또는 새로고침 시 확인 창
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // 게임 진행 중에만 종료 확인 창을 띄웁니다.
      const isActive = (gameMode === 'record' || gameMode === 'survival') ? recordedPath.length > 0 : routePath.length > 0;
      if (isActive && !isGameOver) {
        e.preventDefault();
        // 대부분의 최신 브라우저에서는 사용자 정의 메시지를 무시하지만, 호환성을 위해 설정합니다.
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [routePath.length, isGameOver]); // 게임 진행 상태가 바뀔 때마다 리스너를 재평가

  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      position: 'relative',
      boxShadow: isLevelUpFlashing ? 'inset 0 0 50px rgba(239, 68, 68, 0.95)' : 'none',
      transition: 'box-shadow 0.15s ease-in-out',
      overflow: 'hidden'
    }}>
      {/* 테스트 모드 토글 버튼 (활성화 상태에서만 취소용으로 화면 우측 상단 노출) */}
      {isDebugMode && (
        <button
          onClick={() => setIsDebugMode(false)}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 1010,
            backgroundColor: '#ef4444',
            border: '1.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            padding: '6px 10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transition: 'all 0.2s'
          }}
        >
          🛠️ 테스트 모드 OFF
        </button>
      )}

      {/* 테스트 모드 가이드 가시화 */}
      {isDebugMode && (
        <div style={{
          position: 'absolute',
          top: '55px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1009,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #ef4444',
          borderRadius: '20px',
          color: '#fca5a5',
          padding: '6px 14px',
          fontSize: '0.7rem',
          fontWeight: 'bold',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
          textAlign: 'center'
        }}>
          🎮 방향키 / WASD 키로 사용자 위치 조작 가능
        </div>
      )}
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
        isPanto={true} // 중심좌표 변경 시 부드럽게 이동(PanTo)하도록 설정
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
        onClick={(_t, mouseEvent) => {
          if (isGameOver || gameMode === 'record' || gameMode === 'survival') return; // 게임 오버 상태이거나 경로 기록/서바이벌 모드일 때는 클릭 무시

          // [조건 체크] 이미 선택된 경로(routePath)가 존재하는지 확인
          if (routePath && routePath.length > 0) {
            // [수정] 자바스크립트 객체로 변환하지 않고, 카카오 고유의 latLng 객체 원본을 그대로 전달합니다.
            setPendingDest(mouseEvent.latLng);

            setShowReconfirmPath(true); // 경로 재확인 레이어 팝업 켜기
          } else {
            // 2. 처음 경로를 탐색하는 상태라면 ➔ 팝업 없이 바로 경로 찾기 실행
            // 기존에 쓰시던 함수명이 onMapClick 이라면 아래 그대로 두시면 되고,
            // 별도로 handleMapClick 함수를 만드셨다면 handleMapClick(mouseEvent.latLng) 으로 바꿔주세요!
            handleMapClick(_t, mouseEvent);
          }
        }} // 카카오맵의 latLng 객체를 직접 전달
      >
        {userPosition && (
          <CustomOverlayMap position={userPosition} zIndex={1}>
            <div 
              className={isUserMoving ? 'runner-active-dash' : ''} 
              style={{ fontSize: '32px', userSelect: 'none' }}
            >
              {isUserMoving ? (runnerFrame === 0 ? "🏃" : "🏃‍♀️") : "🏃"}
            </div>
          </CustomOverlayMap>
        )}
        {zombiePosition && (
          <CustomOverlayMap position={zombiePosition}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div 
                className={!isGameOver ? 'zombie-active-chase' : ''} 
                style={{ fontSize: '32px', userSelect: 'none' }}
              >
                {getZombieEmoji(zombieProgress.level)}
              </div>
              {gameMode === 'survival' && (
                <div style={{
                  marginTop: '1px',
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(244, 63, 94, 0.5)',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  width: '40px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
                }}>
                  {/* EXP 게이지 바 */}
                  <div style={{
                    width: '100%',
                    height: '3px',
                    backgroundColor: '#1e293b',
                    borderRadius: '1.5px',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: `${Math.min(100, (zombieProgress.xp / getNextLevelXp(zombieProgress.level)) * 100)}%`,
                      height: '100%',
                      backgroundColor: '#f43f5e',
                      transition: 'width 0.2s'
                    }} />
                  </div>
                </div>
              )}
            </div>
          </CustomOverlayMap>
        )}
        {/* 가이드 경로 (RUN 모드의 목표 경로 또는 서바이벌 모드에서 즐겨찾기로 불러온 가이드 경로) */}
        {routePath && routePath.length > 0 && (
          <Polyline
            key={`guide-path-${routePath.length}`}
            path={routePath}
            strokeWeight={5}
            strokeColor={gameMode === 'survival' ? "#10b981" : "#FF0000"} // 서바이벌 가이드는 초록색, RUN 모드는 빨간색
            strokeOpacity={gameMode === 'survival' ? 0.5 : 0.8}
            strokeStyle={"solid"}
          />
        )}
        {/* 실제 도보 기록 경로 (기록 모드 또는 서바이벌 모드의 이동 궤적) */}
        {(gameMode === 'record' || gameMode === 'survival') && recordedPath && recordedPath.length > 0 && (
          <Polyline
            key={`live-path-${recordedPath.length}`}
            path={recordedPath}
            strokeWeight={5}
            strokeColor={"#FF0000"} // 좀비가 쫓아오는 빨간 실시간 경로
            strokeOpacity={0.8}
            strokeStyle={"solid"}
          />
        )}
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
      {/* 뒤로가기 버튼 (하단 좌측으로 이동) */}
      <button
        onClick={() => {
          const isActive = (gameMode === 'record' || gameMode === 'survival') ? recordedPath.length > 0 : routePath.length > 0;
          if (isActive && !isGameOver) {
            setShowExitConfirm(true);
          } else {
            onExit();
          }
        }}
        style={{
          position: 'absolute',
          bottom: '20px',
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

      {/* 현재 위치로 이동 버튼 */}
      {userPosition && (
        <button
          onClick={() => {
            const nextState = !isFollowingUser;
            setIsFollowingUser(nextState);
            if (nextState) {
              setIsFollowingZombie(false); // 사용자 추적 시 좀비 추적은 해제
              if (userPosition) {
                animatePanTo(userPosition.lat, userPosition.lng);
              }
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

      {/* 좀비 추적 ON/OFF 버튼 */}
      {((gameMode === 'record' || gameMode === 'survival') ? recordedPath.length > 0 : routePath.length > 0) && !isGameOver && (
        <button
          onClick={() => {
            const nextState = !isFollowingZombie;
            setIsFollowingZombie(nextState);
            if (nextState) {
              setIsFollowingUser(false); // 좀비 추적 시 사용자 추적은 해제
              if (zombiePosition) {
                animatePanTo(zombiePosition.lat, zombiePosition.lng);
              }
            }
          }}
          style={{
            position: 'absolute',
            bottom: '95px', // 사용자 추적 버튼 위에 배치 (20px + 60px + 15px)
            right: '20px',  // 우측으로 배치 변경
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
          {getZombieEmoji(selectedZombieSpeed)}
        </button>
      )}

      {/* 경로 시작점으로 이동 버튼 */}
      {((routePath && routePath.length > 0) || (recordedPath && recordedPath.length > 0)) && (
        <button
          onClick={() => {
            const targetPath = routePath.length > 0 ? routePath : recordedPath;
            if (targetPath && targetPath.length > 0) {
              animatePanTo(targetPath[0].lat, targetPath[0].lng);
              setIsFollowingUser(false);
              setIsFollowingZombie(false);
            }
          }}
          style={{
            position: 'absolute',
            bottom: '170px', // 좀비 추적 버튼 위에 배치 (95px + 60px + 15px)
            right: '20px',
            zIndex: 10,
            background: 'rgba(15, 23, 42, 0.85)',
            color: 'white',
            border: '1px solid rgba(30, 41, 59, 0.8)',
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
            opacity: 0.8
          }}
          title="경로 시작점으로 이동"
        >
          🚩
        </button>
      )}


      {/* --- [수정] 하단 좌측 (뒤로가기 버튼 위) 경로 즐겨찾기 토글 버튼 --- */}
      <div style={{ position: 'absolute', bottom: '95px', left: '20px', zIndex: 30 }}>
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          title={`경로 히스토리/즐겨찾기 목록 보기 (${favorites.length})`}
          style={{
            backgroundColor: showFavorites ? '#4ade80' : 'rgba(30, 41, 59, 0.9)',
            color: showFavorites ? '#0f172a' : '#4ade80',

            // 즐겨찾기만의 정체성을 위해 테두리 색상은 연두색(#4ade80) 유지
            border: '2px solid #4ade80',
            borderRadius: '50%',

            // 뒤로가기 버튼과 동일하게 외부 버튼 크기를 60px로 조정
            width: '60px',
            height: '60px',

            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            transition: 'all 0.2s',
            padding: 0,
            outline: 'none',
          }}
        >
          {/* 북마크 리스트 SVG 아이콘 */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
            <line x1="9" y1="10" x2="15" y2="10"></line>
            <line x1="9" y1="14" x2="13" y2="14"></line>
          </svg>
        </button>
      </div>

      {/* --- [수정] 화면 정중앙으로 이동된 즐겨찾기 레이어 팝업 (모달 스타일) --- */}
      {showFavorites && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50, // HUD나 다른 이펙트보다 확실하게 위에 오도록 zIndex를 높게 설정
          backgroundColor: 'rgba(15, 23, 42, 0.98)', // 중앙 팝업 집중도를 위해 살짝 더 어둡고 불투명하게 조정
          border: '2px solid #334155',
          borderRadius: '12px',
          width: '320px', // 화면 중앙 레이아웃에 맞춰 가로폭을 살짝 늘림
          maxHeight: '420px',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
          padding: '16px',
          color: 'white'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            borderBottom: '1px solid #334155',
            paddingBottom: '8px',
            fontSize: '15px',
            color: '#cbd5e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span>📋 저장된 탐색 경로</span>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal' }}>이름 클릭 시 수정 가능</span>
            </span>
            {/* 팝업 닫기 버튼 추가 */}
            <button
              onClick={() => setShowFavorites(false)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px',
                lineHeight: '1'
              }}
              title="닫기"
            >
              ✕
            </button>
          </h4>

          {favorites.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '30px 0', lineHeight: '1.5' }}>
              아직 기록된 경로가 없습니다.<br />지도를 클릭하여 경로를 만들어보세요!
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 🔍 favorites 앞에 [...favorites].sort(...) 를 추가하여 ID(시간)가 큰 순서대로 정렬합니다. */}
              {[...favorites].sort((a, b) => b.id - a.id).map((fav) => (
                <li
                  key={fav.id}
                  onClick={() => loadFavoriteRoute(fav)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.8)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)'}
                >
                  <div style={{ flex: 1, marginRight: '8px', display: 'flex', flexDirection: 'column' }}>
                    {editingId === fav.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => saveTitle(fav.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTitle(fav.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()} // 인풋 클릭 시 경로 로드 방지
                        style={{
                          width: '100%',
                          backgroundColor: '#1e293b',
                          border: '1px solid #4ade80',
                          color: 'white',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          onClick={(e) => startEditing(e, fav)}
                          title="클릭하여 이름 수정"
                          style={{
                            fontSize: '13px',
                            fontWeight: 'bold',
                            color: '#f8fafc',
                            borderBottom: '1px dashed #64748b',
                            paddingBottom: '1px',
                            alignSelf: 'flex-start'
                          }}
                        >
                          {fav.title}
                        </span>
                        {fav.isCustom ? (
                          <span style={{ fontSize: '9px', backgroundColor: '#2563eb', color: 'white', padding: '1px 4px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>직접 기록</span>
                        ) : (
                          <span style={{ fontSize: '9px', backgroundColor: '#334155', color: '#94a3b8', padding: '1px 4px', borderRadius: '4px', fontWeight: 'normal', whiteSpace: 'nowrap' }}>조회 경로</span>
                        )}
                      </div>
                    )}
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      📍 웨이포인트: {fav.routePath.length}개 포인트
                    </span>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={(e) => deleteFavorite(e, fav.id)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px',
                    }}
                    title="삭제"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- [추가] 경로 탐색 최종 확인 레이어 팝업 --- */}
      {showRouteConfirm && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', // 뒷배경을 어둡게 가림
          backdropFilter: 'blur(4px)',           // 지도 화면 살짝 블러 처리
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 60,                             // 모든 HUD 및 즐겨찾기보다 위에 위치
        }}>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.98)',
            border: '2px solid #ef4444',          // 좀비 게임에 어울리는 경고 레드 테두리
            borderRadius: '12px',
            padding: '24px',
            width: '300px',
            textAlign: 'center',
            boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)', // 네온 레드 글로우 효과
            color: 'white',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* 팝업 헤더 */}
            <h3 style={{
              margin: '0 0 14px 0',
              color: '#ff3366',
              fontSize: '18px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              🚨 작전 경로 탐색
            </h3>

            {/* 팝업 본문 */}
            <p style={{ fontSize: '14px', color: '#cbd5e1', margin: '0 0 24px 0', lineHeight: '1.6' }}>
              선택하신 지점으로 <span style={{ color: '#4ade80', fontWeight: 'bold' }}>도보 탈출 경로</span>를<br />
              분석하시겠습니까?
              <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                (확인 시 좀비 추격 시뮬레이션이 재시작됩니다)
              </span>
            </p>

            {/* 팝업 버튼 영역 */}
            <div style={{ display: 'flex', gap: '12px' }}>
              {/* 수락 버튼 */}
              <button
                onClick={() => {
                  if (pendingCoords) {
                    // 원래 구현되어 있던 Tmap 길찾기 핵심 함수를 호출합니다.
                    // (만약 기존 함수명이 다르면 startPathFinding 대신 해당 함수명을 적어주세요)
                    startPathFinding(pendingCoords);
                  }
                  setShowRouteConfirm(false);
                  setPendingCoords(null);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#4ade80', // 안정적인 연두색 서바이벌 컬러
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(74, 222, 128, 0.2)',
                  transition: 'transform 0.1s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                확인 (RUN)
              </button>

              {/* 거절 버튼 */}
              <button
                onClick={() => {
                  setShowRouteConfirm(false);
                  setPendingCoords(null); // 예약된 좌표 취소
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#334155',
                  color: '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 컨트롤 UI (HUD 디자인 적용) */}
      {gameMode === 'record' ? (
        <div className="hud-container">
          <div className="hud-header">
            <div className="hud-mode-tag">MODE: RECORD</div>
            <div className="hud-status-dot" style={{ backgroundColor: isRecording ? '#ef4444' : '#64748b', animation: isRecording ? 'ping 1.5s infinite' : 'none' }}></div>
          </div>

          <div className="hud-main-display">
            <div className="hud-distance-text">
              {isRecording ? '🚶 실시간 경로 기록 중...' : (recordedPath.length > 0 ? '⏸ 기록 일시정지됨' : '⏱ 기록 시작 대기 중')}
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px', fontWeight: 'normal' }}>
                <span>포인트 수집: {recordedPath.length}개</span>
                <span>총 거리: {(() => {
                  let total = 0;
                  for (let i = 0; i < recordedPath.length - 1; i++) {
                    total += calculateDistance(recordedPath[i].lat, recordedPath[i].lng, recordedPath[i + 1].lat, recordedPath[i + 1].lng);
                  }
                  return total;
                })()}m</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => setIsRecording(!isRecording)}
              className="hud-reset-btn"
              style={{
                backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                color: isRecording ? '#ef4444' : '#4ade80',
                borderColor: isRecording ? 'rgba(239, 68, 68, 0.4)' : 'rgba(74, 222, 128, 0.4)',
                margin: 0
              }}
            >
              {isRecording ? '기록 일시정지' : (recordedPath.length > 0 ? '기록 다시 시작' : '기록 시작')}
            </button>

            {recordedPath.length > 0 && (
              <button
                onClick={() => {
                  setIsRecording(false);
                  setCustomRouteTitle(`기록 경로 (${new Date().getMonth() + 1}/${new Date().getDate()} ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')})`);
                  setShowSaveModal(true);
                }}
                className="hud-reset-btn"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  borderColor: 'rgba(59, 130, 246, 0.4)',
                  margin: 0
                }}
              >
                기록 완료 & 저장
              </button>
            )}

            <button
              onClick={() => {
                setShowCancelConfirm(true);
              }}
              className="hud-reset-btn"
              style={{
                backgroundColor: 'rgba(100, 116, 139, 0.15)',
                color: '#94a3b8',
                borderColor: 'rgba(100, 116, 139, 0.4)',
                margin: 0
              }}
            >
              취소
            </button>

            {/* 좀비 속도 조절 및 시간 설정 (경로 만들기 시 좀비 추격을 위해 추가) */}
            <div className="hud-control-row" style={{ marginTop: '8px' }}>
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
          </div>
        </div>
      ) : (
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
                    <span>경로를 지정하세요</span>
                  )
                ) : ( // SURVIVAL 모드일 때
                  recordedPath.length > 0 ? ( // 경로가 설정되었으면 좀비와의 거리 표시
                    <span>
                      좀비와의 거리: {distance !== null ? `${distance}m` : countdown}
                    </span>
                  ) : (
                    <span>탈출구 찾는 중...</span>
                  )
                )}
              </div>
            )}
          </div>

          {gameMode === 'survival' ? (
            <>
              <div className="hud-control-row" style={{ justifyContent: 'center', padding: '4px 0' }}>
                <span className="hud-label" style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                  🧟 좀비 레벨: <strong style={{ fontSize: '0.95rem', marginLeft: '4px' }}>Lv.{zombieProgress.level}</strong> (EXP: {zombieProgress.xp}/{getNextLevelXp(zombieProgress.level)})
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '8px' }}>
                    (최고: Lv.{maxZombieLevel})
                  </span>
                </span>
              </div>
              {/*
                <span className="hud-label" style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                  🧟 좀비 레벨: <strong style={{ fontSize: '0.95rem', marginLeft: '4px' }}>Lv.{zombieLevel}</strong> (EXP: {zombieXp}/{getNextLevelXp(zombieLevel)})
            </div>
              */}
            </>
          ) : (
            /* 다른 모드는 기존 슬라이더 유지 */
            <div className="hud-control-row">
              <label className="hud-label">좀비 속도 ({selectedZombieSpeed}/50)</label>
              <input
                type="range"
                min="1"
                max="50"
                value={selectedZombieSpeed}
                onChange={(e) => setSelectedZombieSpeed(Number(e.target.value))}
                style={{ flexGrow: 1, accentColor: '#f43f5e' }}
              />
            </div>
          )}

          <div className="hud-control-row">
            <label className="hud-label">좀비 발생 시간</label>
            <select className="hud-select" value={selectedSpawnDelay} onChange={(e) => setSelectedSpawnDelay(Number(e.target.value))}>
              <option value={0}>즉시</option>
              <option value={10}>10초</option>
              <option value={30}>30초</option>
              <option value={60}>60초</option>
            </select>
          </div>

          {//((gameMode === 'survival' && recordedPath.length > 0) || (gameMode !== 'survival' && routePath.length > 0)) && (
            ((gameMode !== 'survival' && routePath.length > 0)) && (
              <button onClick={handleResetZombie} className="hud-reset-btn">
                RESTART PURSUIT
              </button>
            )}
        </div>
      )}

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
                게임을 종료하고<br />메인 화면으로 나갈까요?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={handleExitAndSave}
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
                해당 경로로<br />변경 하시겠습니까?
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

      {/* 위험 경고 빨간 화면 번쩍임 효과 (25m 이내) */}
      {!isGameOver && dangerLevel > 0 && (
        <div className={dangerLevel >= 2 ? 'danger-flash-critical' : 'danger-flash-warning'} />
      )}

      {/* 잡혔을 때 피 효과 / 탈출 성공 시 파란 화면 효과 */}
      {isGameOver && (
        <div className={gameResult === 'win' ? 'escape-screen' : 'blood-screen'} />
      )}

      {/* 경로 저장 확인 모달 */}
      {showSaveModal && (
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
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}>
            <div className="hud-header">
              <div className="hud-mode-tag">SAVE ROUTE</div>
              <div className="hud-status-dot"></div>
            </div>
            <div className="hud-main-display" style={{ textAlign: 'left', padding: '10px 0' }}>
              <label style={{ fontSize: '13px', color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>저장할 경로 이름</label>
              <input
                type="text"
                value={customRouteTitle}
                onChange={(e) => setCustomRouteTitle(e.target.value)}
                placeholder="경로 이름을 입력하세요"
                style={{
                  width: '100%',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  color: 'white',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  const finalTitle = customRouteTitle.trim() || `기록 경로 (${new Date().toLocaleDateString()})`;
                  const newFav = {
                    id: Date.now(),
                    title: finalTitle,
                    routePath: recordedPath,
                    isCustom: true // 직접 제작 경로 플래그 설정
                  };

                  // 비동기 상태 업데이트 지연 및 언마운트로 인한 유실 방지를 위해 로컬 스토리지 즉시 동기 쓰기 진행
                  const saved = localStorage.getItem('zombie_route_favorites');
                  const currentFavs = saved ? JSON.parse(saved) : [];
                  const updatedFavs = [newFav, ...currentFavs];
                  localStorage.setItem('zombie_route_favorites', JSON.stringify(updatedFavs));

                  setFavorites(updatedFavs);

                  // 게임 기록(History)에도 저장 연동
                  if (onSaveRecord) {
                    let totalDistance = 0;
                    for (let i = 0; i < recordedPath.length - 1; i++) {
                      totalDistance += calculateDistance(recordedPath[i].lat, recordedPath[i].lng, recordedPath[i + 1].lat, recordedPath[i + 1].lng);
                    }
                    const formattedDistance = (totalDistance / 1000).toFixed(2) + 'km';

                    onSaveRecord({
                      date: new Date().toISOString(),
                      mode: 'record',
                      distance: formattedDistance,
                      zombieSpeed: selectedZombieSpeed,
                      result: '생성',
                      routePath: recordedPath
                    });
                  }

                  setShowSaveModal(false);

                  // [수정] 시스템 얼럿 대신 성공 모달 띄우기
                  setShowSaveSuccess(true);
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
              >
                저장
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 경로 기록 취소 확인 모달 */}
      {showCancelConfirm && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}>
            <div className="hud-header">
              <div className="hud-mode-tag">CANCEL RECORD</div>
              <div className="hud-status-dot" style={{ backgroundColor: '#f43f5e' }}></div>
            </div>
            <div className="hud-main-display" style={{ padding: '10px 0' }}>
              <div className="hud-distance-text" style={{ fontSize: '1rem', lineHeight: '1.5' }}>
                경로 기록을 취소하고<br />메인 화면으로 나갈까요?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowCancelConfirm(false);
                  onExit();
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
              >
                YES
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 경로 저장 성공 모달 */}
      {showSaveSuccess && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}>
            <div className="hud-header">
              <div className="hud-mode-tag">SUCCESS</div>
              <div className="hud-status-dot" style={{ backgroundColor: '#4ade80' }}></div>
            </div>
            <div className="hud-main-display" style={{ padding: '10px 0' }}>
              <div className="hud-distance-text" style={{ fontSize: '1rem', color: '#4ade80', lineHeight: '1.5' }}>
                경로가 성공적으로<br />저장되었습니다!
                <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '6px', fontWeight: 'normal' }}>
                  즐겨찾기 목록에서 확인하실 수 있습니다.
                </span>
              </div>
            </div>
            <div style={{ marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowSaveSuccess(false);
                  onExit();
                }}
                className="hud-reset-btn"
                style={{ width: '100%', backgroundColor: '#4ade80', color: '#0f172a', border: 'none', fontWeight: 'bold' }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZombieMapApp;