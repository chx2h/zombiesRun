import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map, Polyline, CustomOverlayMap, Circle } from 'react-kakao-maps-sdk';
import zombieSfx from './assets/dragon-studio-female-zombie-screams-324744.mp3';
import { registerPlugin } from '@capacitor/core';

const WatchBridge = registerPlugin('WatchBridge');

const getZombieEmoji = (level) => {
  const emojis = [
    // 1단계: 건강한 인간 (Lv.1~5)
    "🧍", "🧍‍♂️", "🧍‍♀️", "🏃", "🏃‍♂️",
    // 2단계: 감염 의심 및 신체 발열 (Lv.6~12)
    "🥵", "😰", "😱", "🤒", "🤕", "😷", "🤢",
    // 3단계: 장기 괴사 및 생물학적 사망 (Lv.13~20)
    "🤮", "🥶", "💀", "☠️", "👻", "⚰️", "🧛", "🧛‍♂️",
    // 4단계: 이성 상실 및 언데드 좀비 각성 (Lv.21~30)
    "🧟", "🧟‍♂️", "🧟‍♀️", "🧟", "🧟‍♂️", "🧟‍♀️", "🧟", "🧟‍♂️", "🧟‍♀️", "🧟",
    // 5단계: 세포 분열 및 기괴한 변종 괴수화 (Lv.31~45)
    "😈", "👿", "👹", "👺", "👽", "👾", "🤖", "🔥", "☄️", "💥", "👿", "👹", "👺", "👿", "👹",
    // 6단계: 치명적인 방사능/전기 초월체 (Lv.46~49)
    "⚡", "☢️", "☣️", "🔥",
    // 7단계: 종말의 지배자 (Lv.50)
    "👑"
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

const ZombieMapApp = ({ gameMode, onExit, onSaveRecord, setIsGameActive, setTriggerExitConfirm, initialRoutePath, targetDistance = 0, setHandleHardwareBack }) => {
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
  const [isMapDragging, setIsMapDragging] = useState(false); // 지도를 드래그하는 중인지 여부
  const isFollowingUserRef = useRef(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false); // 종료 확인 팝업 상태
  const [showReconfirmPath, setShowReconfirmPath] = useState(false); // 경로 재설정 확인 팝업
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 즐겨찾기 목록 내 삭제 컨펌 상태
  const [pendingDeleteId, setPendingDeleteId] = useState(null); // 삭제 대기 중인 즐겨찾기 ID
  const [isFollowingZombie, setIsFollowingZombie] = useState(false); // 좀비 추적 모드 상태
  const isFollowingZombieRef = useRef(false);

  // --- 리워드형 부활(비상 구급 상자) 시스템 관련 상태 ---
  const [isGamePaused, setIsGamePaused] = useState(false);
  const isGamePausedRef = useRef(false);
  const [showReviveConfirm, setShowReviveConfirm] = useState(false);
  const [showAdPlayer, setShowAdPlayer] = useState(false);
  const [adCountdown, setAdCountdown] = useState(30);
  const [reviveUsed, setReviveUsed] = useState(false);
  const reviveUsedRef = useRef(false);
  const [reviveCountdown, setReviveCountdown] = useState(0);
  const reviveCountdownRef = useRef(0);
  useEffect(() => {
    reviveCountdownRef.current = reviveCountdown;
  }, [reviveCountdown]);

  const targetDistanceRef = useRef(targetDistance || 0);
  useEffect(() => {
    targetDistanceRef.current = targetDistance || 0;
  }, [targetDistance]);

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

  // --- 피트니스 실시간 통계 트래킹 상태 ---
  const [escapeCount, setEscapeCount] = useState(0);

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

  // --- 스마트워치(Wear OS) 동기화 송출 관련 정의 ---
  const prevUserPosRef = useRef(null);
  const prevUserPosTimeRef = useRef(0);
  const lastWatchSendTimeRef = useRef(0); // 💡 [추가] 마지막으로 시계에 보낸 시간을 기록할 Ref

  const sendTelemetryToWatch = (zombieDist, runDist, speed, status, vibrate, zombieLevel) => {
    try {
      const now = Date.now();

      if (status !== "dead" && status !== "clear" && (now - lastWatchSendTimeRef.current < 300)) {
        return; // 1초가 지나지 않았다면 시계로 전송하지 않고 함수를 종료(스킵)합니다.
      }
      lastWatchSendTimeRef.current = now; // 보낸 시간 업데이트

      // 프로토콜 규격: "zombieDist,runDist,speed,status,vibrate"
      const zDistStr = zombieDist !== null && zombieDist !== undefined ? Math.round(zombieDist).toString() : "-1";
      const rDistStr = runDist !== null && runDist !== undefined ? runDist.toFixed(2) : "0.00";
      const speedStr = speed !== null && speed !== undefined ? speed.toFixed(1) : "0.0";
      const statusStr = status || "clear";
      const vibStr = vibrate ? "1" : "0";

      // 💡 좀비 레벨(zombieProgress) 처리: 현재 레벨과 경험치를 모두 시계로 전송
      const currentZombieLevel = zombieProgress?.level ?? 1;
      const currentZombieExp = zombieProgress?.xp ?? 0;
      // 시계에서 레벨을 1자리 정수로 받도록 문자열로 변환
      const zLevelStr = currentZombieLevel.toString();

      // 프로토콜 규격: "zombieDist,runDist,speed,status,vibrate,zombieLevel,zombieExp"
      const payload = `${zDistStr},${rDistStr},${speedStr},${statusStr},${vibStr},${zLevelStr},${currentZombieExp}`;
      WatchBridge.sendWatchData({ data: payload })
        .then(() => console.log("스마트워치 데이터 동기화 성공:", payload))
        .catch((err) => console.warn("스마트워치 데이터 전송 실패:", err));
    } catch (e) {
      console.error("WatchBridge 호출 에러:", e);
    }
  };

  useEffect(() => {
    if (!userPosition) return;

    // 1. 좀비와의 거리 계산
    let zombieDistVal = -1;
    if (zombiePosition && !isGameOver) {
      zombieDistVal = Math.round(calculateDistance(userPosition.lat, userPosition.lng, zombiePosition.lat, zombiePosition.lng));
    }

    // 2. 누적 이동 거리 계산 (recordedPath 기반)
    let runDistVal = 0.00;
    if (recordedPath && recordedPath.length > 1) {
      let totalMeters = 0;
      for (let i = 0; i < recordedPath.length - 1; i++) {
        totalMeters += calculateDistance(recordedPath[i].lat, recordedPath[i].lng, recordedPath[i + 1].lat, recordedPath[i + 1].lng);
      }
      runDistVal = totalMeters / 1000;
    }

    // 3. 속도 계산
    let speedVal = 0.0;
    if (isDebugMode) {
      if (isUserMoving || moveIntervalRef.current) {
        speedVal = 12.5; // 가상 D-Pad 조작 속도
      }
    } else {
      if (prevUserPosRef.current) {
        const timeDiff = (Date.now() - prevUserPosTimeRef.current) / 1000;
        if (timeDiff > 0.5) {
          const distDiff = calculateDistance(prevUserPosRef.current.lat, prevUserPosRef.current.lng, userPosition.lat, userPosition.lng);
          const computedSpeed = (distDiff / timeDiff) * 3.6;
          speedVal = computedSpeed < 45 ? computedSpeed : 0.0;
        }
      }
      prevUserPosRef.current = userPosition;
      prevUserPosTimeRef.current = Date.now();
    }

    // 4. 게임 상태 문자열
    let statusStr = "ready";
    if (isGameOver) {
      statusStr = gameResult === 'win' ? "clear" : "dead";
    } else if (gameMode === 'survival') {
      statusStr = "survival";
    } else if (gameMode === 'run') {
      statusStr = "run";
    } else if (gameMode === 'record') {
      statusStr = "record";
    }

    // 5. 햅틱 진동 여부
    const isVibrateTrigger = (zombieDistVal > 0 && zombieDistVal <= 25);

    // 시계 전송 호출
    sendTelemetryToWatch(zombieDistVal, runDistVal, speedVal, statusStr, isVibrateTrigger, zombieProgress.level);

  }, [userPosition, zombiePosition, isGameOver, gameResult, gameMode, isUserMoving, isDebugMode, recordedPath, zombieProgress.level]);

  // --- 테스트용 이스터에그 및 가상 D-Pad 이동 로직 ---
  const debugTapCountRef = useRef(0);
  const moveIntervalRef = useRef(null);

  const handleDebugTap = () => {
    debugTapCountRef.current += 1;
    if (debugTapCountRef.current >= 5) {
      debugTapCountRef.current = 0;
      setIsDebugMode(prev => {
        const nextVal = !prev;
        isDebugModeRef.current = nextVal;
        try {
          Haptics.impact({ style: ImpactStyle.Medium });
        } catch (e) { }
        console.log("5회 연속 터치 이스터에그 작동: 테스트 모드 토글 ->", nextVal);
        return nextVal;
      });
    }
  };

  const startMovingUser = (direction) => {
    if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    setIsUserMoving(true);

    const moveStep = 0.00003;
    const moveStepLng = 0.000035;

    const tick = () => {
      const currentPos = userPosRef.current;
      if (!currentPos || isGameOver) return;

      let nextPos = { ...currentPos };
      if (direction === 'up') {
        nextPos.lat += moveStep;
      } else if (direction === 'down') {
        nextPos.lat -= moveStep;
      } else if (direction === 'left') {
        nextPos.lng -= moveStepLng;
      } else if (direction === 'right') {
        nextPos.lng += moveStepLng;
      }

      setUserPosition(nextPos);
      userPosRef.current = nextPos;

      // 기록 모드(record) 또는 서바이벌 모드(survival) 시 경로 누적
      if (isRecording || gameMode === 'survival') {
        const path = recordedPathRef.current;
        if (path.length > 0) {
          const lastPoint = path[path.length - 1];
          const dist = calculateDistance(lastPoint.lat, lastPoint.lng, nextPos.lat, nextPos.lng);
          if (dist >= 3) {
            const point = { lat: nextPos.lat, lng: nextPos.lng, time: Date.now() };
            setRecordedPath(prev => [...prev, point]);
            recordedPathRef.current = [...recordedPathRef.current, point];
          }
        } else {
          const point = { lat: nextPos.lat, lng: nextPos.lng, time: Date.now() };
          setRecordedPath([point]);
          recordedPathRef.current = [point];
        }
      }
    };

    tick();
    moveIntervalRef.current = setInterval(tick, 100);
  };

  const stopMovingUser = () => {
    setIsUserMoving(false);
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  };

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
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  // --- [확인 및 추가] 경로 요청 대기 상태 ---
  const [showRouteConfirm, setShowRouteConfirm] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null); // 클릭한 목적지 좌표 저장

  // 지도를 클릭했을 때 실행되는 함수
  const handleMapClick = (target, mouseEvent) => {
    console.log("handleMapClick 진입 완료!", { target, hasMouseEvent: !!mouseEvent });
    if (isGameOver) {
      console.log("handleMapClick 중단: 게임 오버 상태입니다.");
      return;
    }

    if (!mouseEvent) {
      console.error("handleMapClick 에러: mouseEvent가 존재하지 않습니다.");
      return;
    }

    const latLng = mouseEvent.latLng;
    if (!latLng) {
      console.error("handleMapClick 에러: latLng 좌표를 얻지 못했습니다.");
      return;
    }

    const coords = {
      lat: latLng.getLat(),
      lng: latLng.getLng()
    };
    console.log("목적지 좌표 임시 예약 완료:", coords);

    // 즉시 길찾기를 하지 않고, 좌표를 예약한 뒤 팝업을 띄웁니다.
    setPendingCoords(coords);
    setShowRouteConfirm(true);
    console.log("setShowRouteConfirm(true) 호출 완료, 팝업 출력 예정!");
  };




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

  // 안드로이드 하드웨어 백 버튼 처리용 핸들러 위임 등록
  useEffect(() => {
    const handleHardwareBack = () => {
      if (showSaveSuccess) {
        setShowSaveSuccess(false);
        return true;
      }
      if (showCancelConfirm) {
        setShowCancelConfirm(false);
        return true;
      }
      if (showSaveModal) {
        setShowSaveModal(false);
        return true;
      }
      if (showAdPlayer) {
        setShowAdPlayer(false);
        return true;
      }
      if (showReviveConfirm) {
        setShowReviveConfirm(false);
        return true;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        setPendingDeleteId(null);
        return true;
      }
      if (showReconfirmPath) {
        setShowReconfirmPath(false);
        setPendingDest(null);
        return true;
      }
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return true;
      }
      if (showRouteConfirm) {
        setShowRouteConfirm(false);
        setPendingCoords(null);
        return true;
      }
      if (showFavorites) {
        setShowFavorites(false);
        return true;
      }
      return false;
    };

    if (setHandleHardwareBack) {
      setHandleHardwareBack(handleHardwareBack);
    }
  }, [
    showSaveSuccess,
    showCancelConfirm,
    showSaveModal,
    showAdPlayer,
    showReviveConfirm,
    showDeleteConfirm,
    showReconfirmPath,
    showExitConfirm,
    showRouteConfirm,
    showFavorites,
    setHandleHardwareBack
  ]);

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

  // 피트니스 데이터 측정용 Refs
  const gameStartTimeRef = useRef(null);
  const wasInDangerRef = useRef(false);



  // 모바일 터치 및 클릭 프록시 콜백 Ref 선언 및 매 렌더링 시점 최신 값 바인딩
  const mapClickCallbackRef = useRef();
  mapClickCallbackRef.current = (mouseEvent) => {
    try {
      console.log("지도 네이티브 click 이벤트 감지됨!");
      if (isGameOver || gameMode === 'record' || gameMode === 'survival') {
        console.log("클릭 차단됨 - 게임오버/기록/서바이벌 중임", { isGameOver, gameMode });
        return;
      }
      const latLng = mouseEvent.latLng;
      if (!latLng) {
        console.error("클릭한 위치의 latLng 좌표를 가져오지 못했습니다.");
        return;
      }
      console.log(`클릭 좌표 접수: Lat=${latLng.getLat().toFixed(6)}, Lng=${latLng.getLng().toFixed(6)}`);

      if (routePath && routePath.length > 0) {
        console.log("경로가 이미 선택되어 있어 경로 재설정 확인창을 띄웁니다.");
        setPendingDest(latLng);
        setShowReconfirmPath(true);
      } else {
        console.log("신규 경로 수립 함수(handleMapClick)를 호출합니다.");
        handleMapClick(null, mouseEvent);
      }
    } catch (err) {
      console.error("mapClickCallbackRef 예외 발생!!!", err.message, err.stack);
    }
  };

  // "따라가기" 모드일 때 사용자 위치를 지도 중심에 동기화
  useEffect(() => {
    if (isFollowingUser && userPosition) {
      if (mapRef.current && window.kakao && window.kakao.maps) {
        const centerLatLng = new window.kakao.maps.LatLng(userPosition.lat, userPosition.lng);
        mapRef.current.setCenter(centerLatLng);
      } else {
        setMapCenter(userPosition);
      }
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
      if (mapRef.current && window.kakao && window.kakao.maps) {
        const centerLatLng = new window.kakao.maps.LatLng(zombiePosition.lat, zombiePosition.lng);
        mapRef.current.setCenter(centerLatLng);
      } else {
        setMapCenter(zombiePosition);
      }
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

  // --- 리워드형 부활 성공 핸들러 ---
  const handleReviveSuccess = () => {
    setReviveUsed(true);
    reviveUsedRef.current = true;

    const activePath = (gameMode === 'record' || gameMode === 'survival') ? recordedPathRef.current : routePathRef.current;
    const userPos = userPosRef.current;

    let isSpawnedOnPath = false;
    let targetSpawnIndex = 0;

    if (activePath.length > 0 && userPos) {
      // 1. 사용자 현재 인덱스로부터 역방향 누적 거리 계산으로 80m 뒤쪽 지점 탐색
      const userIndex = activePath.length - 1;
      let accumulatedDist = 0;
      let foundIndex = userIndex;

      for (let i = userIndex; i > 0; i--) {
        const dNode = calculateDistance(
          activePath[i].lat, activePath[i].lng,
          activePath[i - 1].lat, activePath[i - 1].lng
        );
        accumulatedDist += dNode;
        if (accumulatedDist >= 80) {
          foundIndex = i - 1;
          isSpawnedOnPath = true;
          break;
        }
      }

      // 2. 만약 80m 뒤쪽 지점을 찾았고, 직선거리도 최소 40m 이상 안전하게 떨어져 있는 경우
      if (isSpawnedOnPath) {
        const directDist = calculateDistance(userPos.lat, userPos.lng, activePath[foundIndex].lat, activePath[foundIndex].lng);
        if (directDist >= 40) {
          targetSpawnIndex = foundIndex;
        } else {
          isSpawnedOnPath = false;
        }
      }
    }

    if (isSpawnedOnPath && activePath[targetSpawnIndex]) {
      // 경로선 80m 후방 스폰 성공!
      const spawnNode = activePath[targetSpawnIndex];
      const safeZombiePos = { lat: spawnNode.lat, lng: spawnNode.lng };
      setZombiePosition(safeZombiePos);
      zombiePosRef.current = safeZombiePos;

      // 좀비가 스폰된 노드에서부터 밟고 가도록 타겟 인덱스 고정 동기화
      pathIndexRef.current = targetSpawnIndex;

      if (userPos) {
        distanceRef.current = calculateDistance(userPos.lat, userPos.lng, safeZombiePos.lat, safeZombiePos.lng);
        setDistance(distanceRef.current);
      }
      console.log("부활 완료! 경로선 80m 후방에 완벽 매칭 스폰 완료. 인덱스:", targetSpawnIndex);
    } else {
      // 3. 경로가 너무 짧아서 거리가 확보되지 않은 경우: 출발선(0번 노드)에 스폰하고 3초 대기 카운트다운 구동!
      const spawnNode = activePath[0] || userPos;
      if (spawnNode) {
        const startZombiePos = { lat: spawnNode.lat, lng: spawnNode.lng };
        setZombiePosition(startZombiePos);
        zombiePosRef.current = startZombiePos;
        pathIndexRef.current = 0;

        if (userPos) {
          distanceRef.current = calculateDistance(userPos.lat, userPos.lng, startZombiePos.lat, startZombiePos.lng);
          setDistance(distanceRef.current);
        }
      }
      setReviveCountdown(3);
      console.log("부활 완료! 경로가 너무 짧아 출발선 복귀 및 3초 대기 구동.");
    }

    setIsGamePaused(false);
    isGamePausedRef.current = false;

    try {
      Haptics.impact({ style: ImpactStyle.Light });
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 100);
      setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 200);
    } catch (e) {
      if (navigator.vibrate) {
        navigator.vibrate([30, 50, 30, 50, 30]);
      }
    }
  };

  // 부활 스폰 대기 카운트다운 타이머 이펙트
  useEffect(() => {
    let timer;
    if (reviveCountdown > 0) {
      timer = setTimeout(() => {
        setReviveCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [reviveCountdown]);

  // 모조 동영상 광고 타이머 이펙트
  useEffect(() => {
    let adInterval;
    if (showAdPlayer && adCountdown > 0) {
      adInterval = setInterval(() => {
        setAdCountdown(prev => prev - 1);
      }, 1000);
    } else if (showAdPlayer && adCountdown === 0) {
      setShowAdPlayer(false);
      handleReviveSuccess();
    }
    return () => clearInterval(adInterval);
  }, [showAdPlayer, adCountdown]);

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

      gameStartTimeRef.current = Date.now(); // 운동 시간 측정 시작
      setEscapeCount(0); // 따돌림 수 리셋
      wasInDangerRef.current = false;

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
          gameStartTimeRef.current = Date.now(); // 좀비 출현 시점 시간 기록 시작
          console.log("좀비출현 (복사된 경로)!");
        }, selectedSpawnDelay * 1000);
      } else {
        if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
        spawnTimerRef.current = null;
        setZombiePosition(null);
        zombiePosRef.current = null;
        setCountdown(0);
        setSelectedZombieSpeed(1);
        gameStartTimeRef.current = Date.now(); // 서바이벌 즉시 시간 측정 시작
      }
      setEscapeCount(0);
      wasInDangerRef.current = false;
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
      gameStartTimeRef.current = Date.now(); // 일반 목적지 길찾기 시점 시간 측정 시작
      setEscapeCount(0);
      wasInDangerRef.current = false;
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
    if (isGamePausedRef.current) {
      requestRef.current = requestAnimationFrame(() => animateRef.current && animateRef.current());
      return;
    }
    if (reviveCountdownRef.current > 0) {
      requestRef.current = requestAnimationFrame(() => animateRef.current && animateRef.current());
      return;
    }
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

    // 거리 계산 및 특수 효과
    if (userPosRef.current) {
      const d = calculateDistance(userPosRef.current.lat, userPosRef.current.lng, newPos.lat, newPos.lng);
      setDistance(d);
      distanceRef.current = d; // 펄스 루프에서 최신 거리 참조용

      // 실시간 좀비 따돌림 극복 감지 (15m 이내 인접 후 35m 밖으로 따돌림)
      if (d <= 15) {
        wasInDangerRef.current = true;
      } else if (d >= 35 && wasInDangerRef.current) {
        setEscapeCount(prev => prev + 1);
        wasInDangerRef.current = false;
        if (navigator.vibrate) navigator.vibrate(150); // 따돌림 성공 햅틱 알림
        console.log("좀비 따돌림 성공! 카운트업.");
      }

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

      // 잡힘 판정 (Survival 모드일 때만 5m 이내 종료 또는 부활권 확인)
      if (d <= 5 && gameMode === 'survival') {
        // 기존의 주기적인 펄스 진동 루프 해제 및 강제 진동 정지
        if (pulseIntervalRef.current) {
          clearTimeout(pulseIntervalRef.current);
          pulseIntervalRef.current = null;
        }
        try {
          Haptics.impact({ style: ImpactStyle.Heavy });
        } catch (e) { }
        if (navigator.vibrate) {
          navigator.vibrate(800); // 잡혔을 때 800ms 강한 단발 충격
        }

        if (!reviveUsedRef.current) {
          setIsGamePaused(true);
          isGamePausedRef.current = true;
          setShowReviveConfirm(true);
          return;
        } else {
          setIsGameOver(true);
          setGameResult('lose');
          if (audioCtxRef.current) {
            gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
            ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
          }
          return;
        }
      }

      // 서바이벌 모드 목표 거리 달성 확인 (성공 승리 조건)
      if (gameMode === 'survival' && targetDistanceRef.current > 0) {
        const path = recordedPathRef.current;
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
          total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
        }
        const totalKm = total / 1000;
        if (totalKm >= targetDistanceRef.current) {
          setIsGameOver(true);
          setGameResult('win');
          if (audioCtxRef.current) {
            gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
            ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
          }
          return;
        }
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
        duration: gameStartTimeRef.current ? Math.round((Date.now() - gameStartTimeRef.current) / 1000) : 0,
        escapeCount: escapeCount
      });
    }
  }, [isGameOver, gameResult, gameMode, routePath, recordedPath, onSaveRecord, selectedZombieSpeed, zombieProgress.level, escapeCount]);

  // 중간 종료 시 기록 저장
  const handleExitAndSave = () => {
    // gameMode가 'record'(경로 만들기) 일 때만 중간 종료 시 저장 허용
    if (gameMode === 'record' && onSaveRecord && !hasSavedRef.current) {
      hasSavedRef.current = true; // 중복 저장 차단 락 활성화
      const activePath = recordedPath;
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
        zombieSpeed: selectedZombieSpeed,
        result: '생성',
        routePath: activePath,
        duration: gameStartTimeRef.current ? Math.round((Date.now() - gameStartTimeRef.current) / 1000) : 0,
        escapeCount: 0
      });
    } else {
      // 서바이벌/런 모드는 이탈 시 기록 저장 차단
      hasSavedRef.current = true;
    }
    // 인트로 화면으로 이동
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
      if (navigator.vibrate) navigator.vibrate(0);
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
      height: '100%',
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
            border: '1px solid #ef4444',
            borderRadius: '20px',
            color: '#fff',
            padding: '6px 14px',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transition: 'all 0.2s'
          }}
        >
          테스트 종료
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
        style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        level={4} // 초기 줌 레벨을 4로 조정하여 좀 더 넓은 시야 제공
        onCreate={(map) => {
          mapRef.current = map;

          // 모바일 뷰포트 크기 꼬임으로 인한 상하단 1/3 영역 클릭 씹힘 카카오맵 고유 캔버스 갱신 버그 해결
          setTimeout(() => {
            if (map) {
              map.relayout();
            }
          }, 350);

          if (window.kakao && window.kakao.maps) {
            window.kakao.maps.event.addListener(map, 'click', (mouseEvent) => {
              if (mapClickCallbackRef.current) {
                mapClickCallbackRef.current(mouseEvent);
              }
            });
          }
        }}
        onDragStart={() => {
          setIsFollowingUser(false);
          setIsFollowingZombie(false);
          setIsMapDragging(true);
        }} // 드래그 시작 시 모든 추적 모드 해제 및 드래그 상태 활성화
        onDragEnd={(map) => {
          // 드래그가 완전히 멈췄을 때만 중심 좌표를 상태에 반영하여 렉 유발 및 터치 씹힘을 완전히 해소
          const center = map.getCenter();
          setMapCenter({ lat: center.getLat(), lng: center.getLng() });
          setIsMapDragging(false);
        }}
      >
        {userPosition && (
          <CustomOverlayMap position={userPosition} zIndex={1}>
            <div
              className={isUserMoving ? 'runner-active-dash' : ''}
              style={{ fontSize: '32px', userSelect: 'none' }}
            >
              {/* {isUserMoving ? (runnerFrame === 0 ? "🏃" : "🏃‍♀️") : "🏃"} */}
              🏃
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
      {/* 뒤로가기 버튼 (상단 좌측으로 이동) */}
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
          top: '20px',
          left: '20px',
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.95)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: 'pointer',
          color: '#ef4444',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2), 0 4px 15px rgba(0,0,0,0.6)'
        }}
      >
        이전
      </button>

      {/* 현재 위치로 이동 버튼 (화면 좌측 가운데 정렬) */}
      <button
        onClick={() => {
          const nextState = !isFollowingUser;
          setIsFollowingUser(nextState);
          if (nextState) {
            setIsFollowingZombie(false); // 사용자 추적 시 좀비 추적은 해제
            if (userPosition) {
              animatePanTo(userPosition.lat, userPosition.lng);
            } else {
              alert("사용자 위치 정보가 아직 없습니다. GPS 연결을 확인하세요.");
            }
          }
        }}
        style={{
          position: 'absolute',
          right: '20px',
          top: 'calc(50% - 105px)',
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: isFollowingUser ? '#ef4444' : 'rgba(0, 0, 0, 0.95)',
          color: isFollowingUser ? 'white' : '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2), 0 4px 15px rgba(0,0,0,0.6)',
          transition: 'all 0.2s',
          opacity: isFollowingUser ? 1 : 0.8
        }}
        title="사용자 위치 추적"
      >
        나
      </button>

      {/* 좀비 추적 ON/OFF 버튼 (화면 좌측 가운데 정렬) */}
      <button
        onClick={() => {
          const nextState = !isFollowingZombie;
          setIsFollowingZombie(nextState);
          if (nextState) {
            setIsFollowingUser(false); // 좀비 추적 시 사용자 추적은 해제
            if (zombiePosition) {
              animatePanTo(zombiePosition.lat, zombiePosition.lng);
            } else {
              alert("좀비가 아직 스폰되지 않았습니다. 추적이 시작되면 다시 시도해 주세요.");
            }
          }
        }}
        style={{
          position: 'absolute',
          right: '20px',
          top: 'calc(50% - 35px)',
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: isFollowingZombie ? '#ef4444' : 'rgba(0, 0, 0, 0.95)',
          color: isFollowingZombie ? 'white' : '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2), 0 4px 15px rgba(0,0,0,0.6)',
          transition: 'all 0.2s',
          opacity: isFollowingZombie ? 1 : 0.8
        }}
        title="좀비 위치 추적"
      >
        좀비
      </button>

      {/* 경로 시작점으로 이동 버튼 (화면 좌측 가운데 정렬) */}
      <button
        onClick={() => {
          const targetPath = routePath.length > 0 ? routePath : recordedPath;
          if (targetPath && targetPath.length > 0) {
            animatePanTo(targetPath[0].lat, targetPath[0].lng);
            setIsFollowingUser(false);
            setIsFollowingZombie(false);
          } else {
            alert("설정되거나 기록된 경로가 없습니다. 먼저 경로를 지정해 주세요.");
          }
        }}
        style={{
          position: 'absolute',
          right: '20px',
          top: 'calc(50% + 35px)',
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.95)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2), 0 4px 15px rgba(0,0,0,0.6)',
          transition: 'all 0.2s',
          opacity: 0.8
        }}
        title="경로 시작점으로 이동"
      >
        경로
      </button>


      {/* --- [수정] 상단 우측 경로 즐겨찾기 토글 버튼 (RED 테마 통일 및 위치 수정) --- */}
      <button
        onClick={() => {
          setShowFavorites(!showFavorites);
          triggerTickVibration();
        }}
        title={`경로 히스토리/즐겨찾기 목록 보기 (${favorites.length})`}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 99999,
          backgroundColor: showFavorites ? '#ef4444' : 'rgba(0, 0, 0, 0.95)',
          color: showFavorites ? '#ffffff' : '#ef4444',
          border: '2px solid #ef4444',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2), 0 4px 15px rgba(0,0,0,0.6)',
          transition: 'all 0.2s',
          padding: 0,
          outline: 'none'
        }}
      >
        기록
      </button>

      {/* --- [수정] 화면 정중앙으로 이동된 즐겨찾기 레이어 팝업 (모달 스타일) --- */}
      {showFavorites && (
        <div
          onClick={() => setShowFavorites(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // 뒷배경 오버레이 추가
            zIndex: 999999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.98)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '12px',
              width: '320px',
              maxHeight: '420px',
              overflowY: 'auto',
              boxShadow: '0 0 25px rgba(239, 68, 68, 0.45), 0 20px 40px rgba(0,0,0,0.95)',
              padding: '20px',
              color: 'white'
            }}
          >
            <h4 style={{
              margin: '0 0 16px 0',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '10px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: "'Black Han Sans', sans-serif"
            }}>
              <span>저장된 탐색 경로</span>
              <button
                onClick={() => setShowFavorites(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '2px',
                  lineHeight: '1'
                }}
              >
                &times;
              </button>
            </h4>

            {favorites.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '30px 0', lineHeight: '1.5' }}>
                아직 기록된 경로가 없습니다.<br />지도를 클릭하여 경로를 만들어보세요!
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...favorites].sort((a, b) => b.id - a.id).map((fav) => (
                  <li
                    key={fav.id}
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1, marginRight: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%',
                            backgroundColor: '#1e293b',
                            border: '1px solid #ef4444',
                            color: 'white',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      ) : (
                        <span
                          onClick={(e) => startEditing(e, fav)}
                          title="탭하여 이름 수정"
                          style={{
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: '#ffffff',
                            cursor: 'pointer',
                            display: 'inline-block'
                          }}
                        >
                          {fav.title}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {(() => {
                          let total = 0;
                          const path = fav.routePath || [];
                          for (let i = 0; i < path.length - 1; i++) {
                            total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
                          }
                          return (total / 1000).toFixed(1);
                        })()}km · {new Date(fav.id).toISOString().split('T')[0].replace(/-/g, '.')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          loadFavoriteRoute(fav);
                          setShowFavorites(false);
                          triggerTickVibration();
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          border: '1px solid #ef4444',
                          color: '#ef4444',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        불러오기
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFavorite(e, fav.id);
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#f43f5e',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '4px',
                        }}
                        title="삭제"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* --- [추가] 경로 탐색 최종 확인 레이어 팝업 --- */}
      {showRouteConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            backgroundColor: 'rgba(15, 23, 42, 0.98)',
            border: '3px solid #ef4444',          // 좀비 게임에 어울리는 경고 레드 테두리
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 0 35px rgba(239, 68, 68, 0.65), 0 10px 30px rgba(0,0,0,0.9)', // 강력한 네온 레드 글로우 효과
            color: 'white',
            zIndex: 99999999,                          // 지도 레이어보다 무조건 위에 얹음
          }}
        >
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

            {/* 수락 버튼 */}
            <button
              onClick={() => {
                if (pendingCoords) {
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
          </div>
        </div>
      )}

      {/* 상단 컨트롤 UI (HUD 디자인 적용) */}
      {gameMode === 'record' ? (
        <div className="hud-container">
          <div className="hud-header" onClick={handleDebugTap} style={{ cursor: 'pointer' }}>
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
        gameMode === 'run' && routePath.length === 0 ? (
          <div
            className="hud-container"
            style={{
              padding: isMapDragging ? '8px 16px' : '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMapDragging ? '0px' : '16px',
              top: 'auto',
              bottom: '20px',
              opacity: isMapDragging ? 0.65 : 0.98,
              transition: 'all 0.25s ease-in-out',
              pointerEvents: isMapDragging ? 'none' : 'auto'
            }}
          >
            {isMapDragging ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif", letterSpacing: '0.5px' }}>
                  지도를 탐색하고 있습니다...
                </span>
              </div>
            ) : (
              <>
                {/* 타이틀 및 저장된 경로 버튼 행 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', fontFamily: "'Black Han Sans', sans-serif" }}>경로를 지정하세요</span>
                  <button
                    onClick={() => {
                      setShowFavorites(true);
                      triggerTickVibration();
                    }}
                    style={{
                      backgroundColor: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      color: '#e2e8f0',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    저장된 경로
                  </button>
                </div>

                {/* 좀비 속도 조절 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>좀비 속도</span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'Share Tech Mono' }}>
                      {selectedZombieSpeed}/50 · <strong style={{ color: selectedZombieSpeed <= 12 ? '#10b981' : selectedZombieSpeed <= 25 ? '#f59e0b' : selectedZombieSpeed <= 39 ? '#f97316' : '#ef4444' }}>
                        {selectedZombieSpeed <= 12 ? '느긋' : selectedZombieSpeed <= 25 ? '보통' : selectedZombieSpeed <= 39 ? '빠름' : '광란'}
                      </strong>
                    </span>
                  </div>
                  <div className="onboarding-slider-wrapper" style={{ margin: 0 }}>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={selectedZombieSpeed}
                      onChange={(e) => {
                        setSelectedZombieSpeed(Number(e.target.value));
                        triggerTickVibration();
                      }}
                      className="onboarding-speed-slider"
                      style={{
                        width: '100%',
                        background: 'linear-gradient(to right, #ea580c, #ef4444)',
                        height: '6px',
                        borderRadius: '3px',
                        outline: 'none',
                        WebkitAppearance: 'none'
                      }}
                    />
                    <div className="onboarding-slider-captions" style={{ marginTop: '4px' }}>
                      <span>1 느긋</span>
                      <span>50 광란</span>
                    </div>
                  </div>
                </div>

                {/* 좀비 발생 시간 선택 가로 버튼 세트 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>좀비 발생 시간</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { label: '즉시', value: 0 },
                      { label: '10초', value: 10 },
                      { label: '30초', value: 30 },
                      { label: '60초', value: 60 }
                    ].map((item) => {
                      const isSelected = selectedSpawnDelay === item.value;
                      return (
                        <button
                          key={item.value}
                          onClick={() => {
                            setSelectedSpawnDelay(item.value);
                            triggerTickVibration();
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: isSelected ? '#ef4444' : 'rgba(30, 41, 59, 0.4)',
                            color: '#ffffff',
                            border: isSelected ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '8px',
                            padding: '10px 0',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 하단 메인 작전 경로 탐색 가이드 버튼 */}
                <button
                  style={{
                    width: '100%',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '15px',
                    fontFamily: "'Black Han Sans', sans-serif",
                    cursor: 'default',
                    boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                    opacity: 0.9,
                    marginTop: '4px'
                  }}
                >
                  작전 경로 탐색
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className="hud-container"
            style={{
              padding: isMapDragging ? '8px 16px' : '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMapDragging ? '0px' : '14px',
              top: 'auto',
              bottom: '20px',
              opacity: isMapDragging ? 0.65 : 0.98,
              transition: 'all 0.25s ease-in-out',
              pointerEvents: isMapDragging ? 'none' : 'auto'
            }}
          >
            {isMapDragging ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', fontSize: '13px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'Share Tech Mono' }}>
                {gameMode === 'run' ? (
                  routePath.length > 0 ? (
                    (() => {
                      const destination = routePath[routePath.length - 1];
                      const distUserToDest = userPosition ? calculateDistance(userPosition.lat, userPosition.lng, destination.lat, destination.lng) : '...';
                      const zPos = zombiePosition || routePath[0];
                      const distZombieToDest = calculateDistance(zPos.lat, zPos.lng, destination.lat, destination.lng);
                      return `나: ${distUserToDest}m | 좀비: ${distZombieToDest}m`;
                    })()
                  ) : (
                    "경로 설정 중..."
                  )
                ) : (
                  recordedPath.length > 0 ? (
                    `좀비와의 거리: ${distance !== null ? `${distance}m` : countdown} · Lv.${zombieProgress.level}`
                  ) : (
                    "탈출구 탐색 중..."
                  )
                )}
              </div>
            ) : (
              <>
                <div className="hud-header" onClick={handleDebugTap} style={{ cursor: 'pointer', margin: 0, paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div className="hud-mode-tag" style={{ color: '#ef4444', fontFamily: "'Black Han Sans', sans-serif" }}>MODE: {gameMode.toUpperCase()}</div>
                  <div className="hud-status-dot" style={{ backgroundColor: '#ef4444' }}></div>
                </div>

                <div className="hud-main-display" style={{ padding: '8px 0', border: 'none', background: 'none', boxShadow: 'none' }}>
                  {isGameOver ? (
                    <span style={{ color: gameResult === 'win' ? '#10b981' : '#ef4444', fontWeight: '900', fontSize: '1.1rem', fontFamily: "'Black Han Sans', sans-serif" }}>
                      {gameResult === 'win' ? '탈출 성공!' : (gameMode === 'run' ? '좀비가 먼저 도착함!' : '좀비에게 잡혔습니다!')}
                    </span>
                  ) : (
                    <div className="hud-distance-text" style={{ fontSize: '0.95rem', color: '#f1f5f9', fontWeight: 'bold' }}>
                      {gameMode === 'run' ? (
                        routePath.length > 0 ? (
                          (() => {
                            const destination = routePath[routePath.length - 1];
                            const distUserToDest = userPosition ? calculateDistance(userPosition.lat, userPosition.lng, destination.lat, destination.lng) : '...';
                            const zPos = zombiePosition || routePath[0];
                            const distZombieToDest = calculateDistance(zPos.lat, zPos.lng, destination.lat, destination.lng);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>나의 남은 거리</span>
                                  <span style={{ color: '#ef4444', fontFamily: 'Share Tech Mono', fontSize: '1.05rem' }}>{distUserToDest}m</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 'normal' }}>
                                  <span>좀비의 남은 거리</span>
                                  <span style={{ fontFamily: 'Share Tech Mono' }}>{distZombieToDest}m</span>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <span>경로를 지정하세요</span>
                        )
                      ) : (
                        recordedPath.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>좀비와의 거리</span>
                              <span style={{ color: '#ef4444', fontSize: '1.2rem', fontFamily: 'Share Tech Mono', fontWeight: '900' }}>
                                {distance !== null ? `${distance}m` : countdown}
                              </span>
                            </div>
                            {targetDistance > 0 && (() => {
                              let total = 0;
                              for (let i = 0; i < recordedPath.length - 1; i++) {
                                total += calculateDistance(recordedPath[i].lat, recordedPath[i].lng, recordedPath[i + 1].lat, recordedPath[i + 1].lng);
                              }
                              const runDistKm = total / 1000;
                              const remainingDist = Math.max(0, targetDistance - runDistKm);
                              const progressPercent = Math.min(100, (runDistKm / targetDistance) * 100);
                              return (
                                <>
                                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 'normal' }}>
                                    <span>목표: {targetDistance.toFixed(1)}km</span>
                                    <span>누적: {runDistKm.toFixed(2)}km (남음: {remainingDist.toFixed(2)}km)</span>
                                  </div>
                                  <div className="hud-progress-bar-container" style={{ height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                                    <div className="hud-progress-bar-fill" style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: '#ef4444', transition: 'width 0.3s ease' }} />
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span>탈출구 찾는 중...</span>
                        )
                      )}
                    </div>
                  )}
                </div>

                {gameMode === 'survival' ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
                    <span className="hud-label" style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>
                      좀비 레벨: <strong style={{ fontSize: '0.95rem', marginLeft: '4px' }}>Lv.{zombieProgress.level}</strong> (EXP: {zombieProgress.xp}/{getNextLevelXp(zombieProgress.level)})
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '8px', fontWeight: 'normal' }}>
                        (최고: Lv.{maxZombieLevel})
                      </span>
                    </span>
                  </div>
                ) : (
                  /* 좀비 속도 슬라이더 리뉴얼 */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>좀비 속도</span>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'Share Tech Mono' }}>
                        {selectedZombieSpeed}/50 · <strong style={{ color: selectedZombieSpeed <= 12 ? '#10b981' : selectedZombieSpeed <= 25 ? '#f59e0b' : selectedZombieSpeed <= 39 ? '#f97316' : '#ef4444' }}>
                          {selectedZombieSpeed <= 12 ? '느긋' : selectedZombieSpeed <= 25 ? '보통' : selectedZombieSpeed <= 39 ? '빠름' : '광란'}
                        </strong>
                      </span>
                    </div>
                    <div className="onboarding-slider-wrapper" style={{ margin: 0 }}>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        value={selectedZombieSpeed}
                        onChange={(e) => {
                          setSelectedZombieSpeed(Number(e.target.value));
                          triggerTickVibration();
                        }}
                        className="onboarding-speed-slider"
                        style={{
                          width: '100%',
                          background: 'linear-gradient(to right, #ea580c, #ef4444)',
                          height: '6px',
                          borderRadius: '3px',
                          outline: 'none',
                          WebkitAppearance: 'none'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 좀비 발생 시간 선택 버튼 세트 리뉴얼 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>좀비 발생 시간</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                      { label: '즉시', value: 0 },
                      { label: '10초', value: 10 },
                      { label: '30초', value: 30 },
                      { label: '60초', value: 60 }
                    ].map((item) => {
                      const isSelected = selectedSpawnDelay === item.value;
                      return (
                        <button
                          key={item.value}
                          onClick={() => {
                            setSelectedSpawnDelay(item.value);
                            triggerTickVibration();
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: isSelected ? '#ef4444' : 'rgba(30, 41, 59, 0.4)',
                            color: '#ffffff',
                            border: isSelected ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            padding: '8px 0',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {((gameMode !== 'survival' && routePath.length > 0)) && (
                  <button
                    onClick={() => {
                      handleResetZombie();
                      triggerTickVibration();
                    }}
                    className="hud-reset-btn"
                    style={{
                      margin: '4px 0 0 0',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '12px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
                      cursor: 'pointer',
                      letterSpacing: '0.5px'
                    }}
                  >
                    재추격 시작 (RESTART)
                  </button>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* 종료 확인 레이어 */}
      {showExitConfirm && (
        <div
          onClick={() => setShowExitConfirm(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}
          >
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
                onClick={() => setShowExitConfirm(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
              <button
                onClick={handleExitAndSave}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#f43f5e', color: 'white', border: 'none' }}
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 경로 재설정 확인 레이어 */}
      {showReconfirmPath && (
        <div
          onClick={() => {
            setShowReconfirmPath(false);
            setPendingDest(null);
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}
          >
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
                  setPendingDest(null);
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
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
            </div>
          </div>
        </div>
      )}

      {/* 즐겨찾기 개별 삭제 확인 레이어 */}
      {showDeleteConfirm && (
        <div
          onClick={() => {
            setShowDeleteConfirm(false);
            setPendingDeleteId(null);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}
          >
            <div className="hud-header">
              <div className="hud-mode-tag">DELETE</div>
              <div className="hud-status-dot" style={{ backgroundColor: '#ef4444' }}></div>
            </div>
            <div className="hud-main-display" style={{ padding: '10px 0' }}>
              <div className="hud-distance-text" style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                이 경로를<br />목록에서 삭제하시겠습니까?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setPendingDeleteId(null);
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
              <button
                onClick={() => {
                  setFavorites(prev => prev.filter(item => item.id !== pendingDeleteId));
                  setShowDeleteConfirm(false);
                  setPendingDeleteId(null);
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none' }}
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🏥 비상 구급 상자 (부활 확인) 레이어 */}
      {showReviveConfirm && (
        <div
          onClick={() => {
            setShowReviveConfirm(false);
            setIsGamePaused(false);
            isGamePausedRef.current = false;
            setTimeout(() => {
              setIsGameOver(true);
              setGameResult('lose');
              if (audioCtxRef.current) {
                gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
                ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
              }
            }, 100);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            /* backdropFilter: 'blur(5px)', */
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '310px', padding: '16px' }}
          >
            <div className="hud-header">
              <div className="hud-mode-tag" style={{ color: '#10b981' }}>AD RECOVERY</div>
              <div className="hud-status-dot" style={{ backgroundColor: '#10b981' }}></div>
            </div>
            <div className="hud-main-display" style={{ padding: '12px 0', border: 'none', background: 'none', boxShadow: 'none' }}>
              <div style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
                🚨 사망 직전 경보!
              </div>
              <div className="hud-distance-text" style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4', textAlign: 'center' }}>
                좀비에게 완전히 포위당했습니다.<br />
                <strong>비상 구급 상자(부활권)</strong>를 사용하여<br />
                현 위치에서 계속 생존하시겠습니까?<br />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(30초 동영상 광고 시청 완료 시 지급)</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                onClick={() => {
                  setShowReviveConfirm(false);
                  setIsGamePaused(false);
                  isGamePausedRef.current = false;
                  setTimeout(() => {
                    setIsGameOver(true);
                    setGameResult('lose');
                    if (audioCtxRef.current) {
                      gainNodeRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
                      ambientGainRef.current?.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
                    }
                  }, 100);
                }}
                className="hud-reset-btn"
                style={{ flex: 0.8, backgroundColor: '#ef4444', border: 'none' }}
              >
                포기하기 (사망)
              </button>
              <button
                onClick={() => {
                  setShowReviveConfirm(false);
                  setShowAdPlayer(true);
                  setAdCountdown(30);
                }}
                className="hud-reset-btn"
                style={{ flex: 1.2, backgroundColor: '#10b981', color: 'white', border: 'none', fontWeight: 'bold' }}
              >
                광고 보고 부활 💊
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📺 모조 광고 재생기 레이어 */}
      {showAdPlayer && (
        <div
          onClick={() => setShowAdPlayer(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: '#090d16',
            zIndex: 3000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            padding: '20px',
            boxSizing: 'border-box'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              border: '2px solid #38bdf8',
              borderRadius: '16px',
              padding: '24px',
              background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
              boxShadow: '0 0 30px rgba(56, 189, 248, 0.25)',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid #38bdf8',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#38bdf8',
              fontFamily: 'var(--mono)'
            }}>
              ⏳ 광고 보상 대기: {adCountdown}초
            </div>

            <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🎮</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#38bdf8', marginBottom: '8px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Zombie Apocalypse
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', margin: '0 0 20px 0', lineHeight: '1.4' }}>
              좀비 사태 발발! 나만의 기지를 구축하고 생존자 동료들을 모아 종말 세계에서 끝까지 살아남으세요!
            </p>

            <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{
                height: '100%',
                backgroundColor: '#38bdf8',
                boxShadow: '0 0 10px #38bdf8',
                width: `${((30 - adCountdown) / 30) * 100}%`,
                transition: 'width 1s linear'
              }} />
            </div>

            <button
              disabled
              style={{
                backgroundColor: '#334155',
                color: '#64748b',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'not-allowed'
              }}
            >
              시청을 완료하면 자동으로 부활합니다
            </button>
          </div>

          <div style={{ fontSize: '11px', color: '#475569', marginTop: '12px' }}>
            ※ 이 화면은 구급상자 리워드 지급을 위한 시뮬레이션용 광고 시청기입니다.
          </div>
        </div>
      )}

      {/* 부활 대기 카운트다운 알림 */}
      {reviveCountdown > 0 && (
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2500,
          textAlign: 'center',
          width: '90%',
          pointerEvents: 'none'
        }}>
          <div style={{
            fontSize: '0.9rem',
            fontWeight: 'bold',
            color: '#ef4444',
            textShadow: '0 0 10px rgba(239, 68, 68, 0.8)',
            marginBottom: '14px',
            backgroundColor: 'rgba(0, 0, 0, 0.82)',
            padding: '10px 18px',
            borderRadius: '8px',
            display: 'inline-block',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)'
          }}>
            ⚠️ 좀비가 출발선에 있습니다! 3초 후 출발합니다!
          </div>
          <div style={{
            fontSize: '7.5rem',
            fontWeight: '900',
            color: '#ef4444',
            textShadow: '0 0 30px rgba(239, 68, 68, 0.95)',
            fontFamily: 'var(--mono)'
          }}>
            {reviveCountdown}
          </div>
        </div>
      )}

      {/* 중앙 카운트다운 */}
      {countdown > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, fontSize: '120px', fontWeight: 'bold', color: 'rgba(255, 0, 0, 0.7)', pointerEvents: 'none' }}>
          {countdown}
        </div>
      )}

      {/* 🎮 테스트 모드 전용 가상 방향 패드 (D-Pad) */}
      {isDebugMode && (
        <div style={{
          position: 'absolute',
          bottom: '280px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '130px',
          height: '130px',
          zIndex: 1010,
          display: 'grid',
          gridTemplateRows: 'repeat(3, 1fr)',
          gridTemplateColumns: 'repeat(3, 1fr)',
          background: 'rgba(15, 23, 42, 0.72)',
          /* backdropFilter: 'blur(6px)', */
          border: '2px dashed #ef4444',
          borderRadius: '50%',
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.45)',
          padding: '8px',
          boxSizing: 'border-box'
        }}>
          <div />
          <button
            onTouchStart={() => startMovingUser('up')}
            onTouchEnd={stopMovingUser}
            onMouseDown={() => startMovingUser('up')}
            onMouseUp={stopMovingUser}
            onMouseLeave={stopMovingUser}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: '#f87171',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            ▲
          </button>
          <div />

          <button
            onTouchStart={() => startMovingUser('left')}
            onTouchEnd={stopMovingUser}
            onMouseDown={() => startMovingUser('left')}
            onMouseUp={stopMovingUser}
            onMouseLeave={stopMovingUser}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: '#f87171',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            ◀
          </button>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: '#ef4444',
            fontWeight: 'bold',
            userSelect: 'none'
          }}>
            T-PAD
          </div>
          <button
            onTouchStart={() => startMovingUser('right')}
            onTouchEnd={stopMovingUser}
            onMouseDown={() => startMovingUser('right')}
            onMouseUp={stopMovingUser}
            onMouseLeave={stopMovingUser}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: '#f87171',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            ▶
          </button>

          <div />
          <button
            onTouchStart={() => startMovingUser('down')}
            onTouchEnd={stopMovingUser}
            onMouseDown={() => startMovingUser('down')}
            onMouseUp={stopMovingUser}
            onMouseLeave={stopMovingUser}
            style={{
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '8px',
              color: '#f87171',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            ▼
          </button>
          <div />
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
        <div
          onClick={() => setShowSaveModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}
          >
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
                onClick={() => setShowSaveModal(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                취소
              </button>
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
            </div>
          </div>
        </div>
      )}

      {/* 경로 기록 취소 확인 모달 */}
      {showCancelConfirm && (
        <div
          onClick={() => setShowCancelConfirm(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}
          >
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
                onClick={() => setShowCancelConfirm(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
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
            </div>
          </div>
        </div>
      )}

      {/* 경로 저장 성공 모달 */}
      {showSaveSuccess && (
        <div
          onClick={() => {
            setShowSaveSuccess(false);
            onExit();
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="hud-container"
            style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}
          >
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