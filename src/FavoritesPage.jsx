import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Map, Polyline, Circle } from 'react-kakao-maps-sdk';

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

const FavoritesPage = ({ onBackToIntro, onReplayRecord }) => {
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' | 'history' | 'stats'
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // --- 달력용 상태 ---
  const [currentDate, setCurrentDate] = useState(new Date()); // 달력 기준 연/월
  const [selectedDateRecords, setSelectedDateRecords] = useState([]); // 선택 날짜의 상세 기록
  const [selectedDateStr, setSelectedDateStr] = useState(''); // 선택된 날짜 레이블
  const [showDetailModal, setShowDetailModal] = useState(false); // 상세 기록 레이어 활성화

  // --- 지도 미리보기 상태 ---
  const [previewPath, setPreviewPath] = useState(null);
  const [showMapPreview, setShowMapPreview] = useState(false);

  // --- 공용 커스텀 컨펌 모달 상태 ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: () => { }
  });

  // 로컬 스토리지 데이터 로드
  const loadData = () => {
    const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
    setFavorites(savedFavs);

    const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
    // 최근 기록이 위로 가도록 정렬
    const sorted = savedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistory(sorted);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 즐겨찾기 경로 총 거리 계산
  const getRouteDistance = (path) => {
    if (!path || path.length < 2) return '0m';
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    }
    if (total >= 1000) {
      return (total / 1000).toFixed(2) + 'km';
    }
    return total + 'm';
  };

  // 최고 서바이벌 기록 검출
  const bestSurvivalRecord = useMemo(() => {
    const survivals = history.filter(rec => rec.mode === 'survival' && rec.zombieSpeed);
    if (survivals.length === 0) return null;
    // 좀비 속도(레벨)가 가장 높고, 같은 레벨이면 최근에 달성한 것 우선
    return [...survivals].sort((a, b) => {
      const speedA = Number(a.zombieSpeed) || 0;
      const speedB = Number(b.zombieSpeed) || 0;
      if (speedB !== speedA) return speedB - speedA;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })[0];
  }, [history]);

  // 특정 최고 기록 날짜 달력 연/월 동기화 및 즉시 조회
  const handleSelectBestRecordDate = (dateString) => {
    const date = new Date(dateString);
    setCurrentDate(date); // 달력을 해당 월로 이동

    // 이 날짜의 기록을 로드해서 상세 창 켜기
    const dateStr = getLocalDateStr(date);
    const dayRecords = history.filter(rec => getLocalDateStr(rec.date) === dateStr);
    if (dayRecords.length > 0) {
      handleDateClick(date, dayRecords);
    }
  };

  // --- 피트니스 정밀 통계 지표 산출 ---
  const statistics = useMemo(() => {
    let totalDistance = 0;
    let totalDuration = 0; // 초 단위
    let totalEscapes = 0;
    let maxLevel = 0;
    let maxDistance = 0;
    let maxDuration = 0; // 초 단위
    let survivalCount = 0;
    let deathCount = 0;

    history.forEach(rec => {
      // 1. 누적 거리
      const dist = parseFloat(rec.distance) || 0;
      totalDistance += dist;
      if (dist > maxDistance) maxDistance = dist;

      // 2. 누적 시간
      const dur = Number(rec.duration) || 0;
      totalDuration += dur;
      if (dur > maxDuration) maxDuration = dur;

      // 3. 누적 좀비 따돌림
      totalEscapes += Number(rec.escapeCount) || 0;

      // 4. 최고 레벨 (서바이벌 모드 한정)
      if (rec.mode === 'survival') {
        const lvl = Number(rec.zombieSpeed) || 1;
        if (lvl > maxLevel) maxLevel = lvl;
      }

      // 5. 탈출/사망 집계
      if (rec.result === '탈출') survivalCount++;
      if (rec.result === '사망') deathCount++;
    });

    // 칼로리 소모 계산: 누적 거리(km) * 70kg * 1.03
    const totalCalories = Math.round(totalDistance * 70 * 1.03);

    return {
      totalDistance: totalDistance.toFixed(2),
      totalDuration,
      totalCalories,
      totalEscapes,
      maxLevel,
      maxDistance: maxDistance.toFixed(2),
      maxDuration,
      survivalCount,
      deathCount
    };
  }, [history]);

  const startEditing = (e, fav) => {
    e.stopPropagation();
    setEditingId(fav.id);
    setEditingTitle(fav.title);
  };

  const saveTitle = (id) => {
    const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
    const updated = savedFavs.map(item =>
      item.id === id ? { ...item, title: editingTitle.trim() || item.title } : item
    );
    localStorage.setItem('zombie_route_favorites', JSON.stringify(updated));
    setEditingId(null);
    loadData();
  };

  // 즐겨찾기 경로 삭제
  const handleDeleteFavorite = (e, id) => {
    e.stopPropagation();
    setConfirmConfig({
      title: 'DELETE ROUTE',
      message: '이 즐겨찾기 경로를\n삭제하시겠습니까?',
      onConfirm: () => {
        const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
        const updatedFavs = savedFavs.filter(fav => fav.id !== id);
        localStorage.setItem('zombie_route_favorites', JSON.stringify(updatedFavs));
        loadData();
      }
    });
    setShowConfirmModal(true);
  };

  // 플레이 이력 삭제
  const handleDeleteHistory = (e, dateString) => {
    e.stopPropagation();
    setConfirmConfig({
      title: 'DELETE RECORD',
      message: '이 게임 기록을\n삭제하시겠습니까?',
      onConfirm: () => {
        const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
        const updatedRecords = savedRecords.filter(rec => rec.date !== dateString);
        localStorage.setItem('gameRecords', JSON.stringify(updatedRecords));

        // 상태 즉시 동기화
        const updatedSorted = updatedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistory(updatedSorted);

        // 모달 내 리스트 갱신
        const recordDate = new Date(dateString);
        const searchDateStr = getLocalDateStr(recordDate);
        const filtered = updatedSorted.filter(rec => getLocalDateStr(rec.date) === searchDateStr);
        setSelectedDateRecords(filtered);
        if (filtered.length === 0) {
          setShowDetailModal(false); // 해당 날짜 기록이 모두 지워지면 레이어 닫기
        }
      }
    });
    setShowConfirmModal(true);
  };

  // --- 달력 알고리즘 ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const getLocalDateStr = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(year, month, i));
  }

  const getRecordsForDate = (date) => {
    if (!date) return [];
    const dateStr = getLocalDateStr(date);
    return history.filter(rec => getLocalDateStr(rec.date) === dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // --- 터치 스와이프 상태 ---
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (showDetailModal) return;

    const deltaX = touchStartX.current - touchEndX.current;
    const swipeThreshold = 60;

    if (deltaX > swipeThreshold) {
      handleNextMonth();
    } else if (deltaX < -swipeThreshold) {
      handlePrevMonth();
    }
  };

  const handleDateClick = (date, records) => {
    if (!date || records.length === 0) return;
    setSelectedDateRecords(records);
    setSelectedDateStr(`${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, '0')}월 ${String(date.getDate()).padStart(2, '0')}일`);
    setShowDetailModal(true);
  };

  return (
    <div className="history-page-container">
      {/* 상단 장식 헤더 */}
      <div className="manual-header">
        <div className="status-indicator">
          <span className="dot-ping"></span>
          <p className="system-tag">Apocalypse Survival Guide</p>
        </div>
        <div className="version-tag">SYS.VER 2.5_KOR</div>
      </div>

      {/* 타이틀 및 부제 */}
      <div className="title-section" style={{ marginBottom: '1.5rem' }}>
        <h1 className="manual-main-title">
          ZOMBIES ARCHIVE : 기록 보관소
        </h1>
        <p className="manual-subtitle">
          저장된 즐겨찾기 경로와 그동안의 생존 전투 기록을 열람합니다.
        </p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="tab-nav" style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`tab-btn ${activeTab === 'favorites' ? 'active-run' : ''}`}
          style={{ padding: '10px' }}
        >
          <span>⭐ 경로 </span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`tab-btn ${activeTab === 'history' ? 'active-survival' : ''}`}
          style={{ padding: '10px' }}
        >
          <span>📜 생존 기록</span>
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`tab-btn ${activeTab === 'stats' ? 'active-stats' : ''}`}
          style={{ padding: '10px' }}
        >
          <span>📊 생존 통계</span>
        </button>
      </div>

      {/* 컨텐츠 컨테이너 */}
      <div className="history-list-container history-content-animated" style={{ display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'favorites' && (
          /* 즐겨찾기 목록 */
          favorites.length === 0 ? (
            <p className="no-records-message">
              아직 생성해서 저장한 즐겨찾기 경로가 없습니다.<br />
              '경로 만들기'에서 나만의 생존 경로를 등록해보세요!
            </p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>등록 시간</th>
                  <th>경로 이름</th>
                  <th>총 거리</th>
                  <th>포인트 수</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {favorites.map((fav) => (
                  <tr
                    key={fav.id}
                    onClick={() => {
                      if (fav.routePath && fav.routePath.length > 0) {
                        if (onReplayRecord) {
                          onReplayRecord({ routePath: fav.routePath, mode: 'run' });
                        }
                      } else {
                        alert("이 경로의 좌표 정보가 올바르지 않습니다.");
                      }
                    }}
                    className="history-row"
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      {new Date(fav.id).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
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
                            backgroundColor: '#1e293b',
                            border: '1px solid #4ade80',
                            color: 'white',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '13px',
                            width: '100%',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      ) : (
                        <span
                          onClick={(e) => startEditing(e, fav)}
                          title="클릭하여 이름 수정"
                          style={{
                            fontWeight: 'bold',
                            color: '#f8fafc',
                            borderBottom: '1px dashed #64748b',
                            cursor: 'pointer',
                            paddingBottom: '2px'
                          }}
                        >
                          {fav.title}
                        </span>
                      )}
                    </td>
                    <td>{getRouteDistance(fav.routePath)}</td>
                    <td>{fav.routePath.length}개</td>
                    <td>
                      <button
                        onClick={(e) => handleDeleteFavorite(e, fav.id)}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid rgba(239, 68, 68, 0.5)',
                          borderRadius: '4px',
                          color: '#ef4444',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.4)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'history' && (
          /* 게임 플레이 기록 달력 */
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '500px', margin: '0 auto' }}
          >
            {/* 달력 헤더 (월 변경) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', padding: '0 8px' }}>
              <button
                onClick={handlePrevMonth}
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  color: 'white',
                  borderRadius: '6px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ◀
              </button>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#ef4444', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>
                {year} . {String(month + 1).padStart(2, '0')}
              </h3>
              <button
                onClick={handleNextMonth}
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  color: 'white',
                  borderRadius: '6px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ▶
              </button>
            </div>

            {/* 달력 본문 */}
            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}>
              {/* 요일 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: '#94a3b8', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '8px' }}>
                <span style={{ color: '#ef4444' }}>일</span>
                <span>월</span>
                <span>화</span>
                <span>수</span>
                <span>목</span>
                <span>금</span>
                <span style={{ color: '#60a5fa' }}>토</span>
              </div>

              {/* 날짜 격자 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                {days.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;

                  const records = getRecordsForDate(day);
                  const isToday = getLocalDateStr(new Date()) === getLocalDateStr(day);
                  const hasRecords = records.length > 0;

                  // 해당 일 요일 판단 (일요일: 0, 토요일: 6)
                  const dayOfWeek = day.getDay();
                  let color = '#f8fafc';
                  if (dayOfWeek === 0) color = '#ef4444'; // 일요일 빨강
                  else if (dayOfWeek === 6) color = '#60a5fa'; // 토요일 파랑

                  // 기록 타입 분석 (탈출 포함 시 초록 점, 사망만 있으면 빨간 점, 생성만 있으면 파란 점)
                  const hasWin = records.some(r => r.result === '탈출');
                  const hasLose = records.some(r => r.result === '사망');
                  const hasRecordMode = records.some(r => r.result === '생성');

                  let dotColor = '#cbd5e1';
                  if (hasWin) dotColor = '#4ade80'; // 초록
                  else if (hasLose) dotColor = '#ef4444'; // 빨강
                  else if (hasRecordMode) dotColor = '#2563eb'; // 파랑

                  const isBestRecordDate = bestSurvivalRecord && getLocalDateStr(bestSurvivalRecord.date) === getLocalDateStr(day);

                  return (
                    <div
                      key={`day-${day.getDate()}`}
                      onClick={() => handleDateClick(day, records)}
                      style={{
                        height: '48px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 0',
                        borderRadius: '8px',
                        cursor: hasRecords ? 'pointer' : 'default',
                        backgroundColor: isToday ? 'rgba(239, 68, 68, 0.15)' : (isBestRecordDate ? 'rgba(234, 179, 8, 0.12)' : 'transparent'),
                        border: isToday ? '1px solid rgba(239, 68, 68, 0.4)' : (isBestRecordDate ? '1.5px solid #eab308' : (hasRecords ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent')),
                        boxShadow: isBestRecordDate ? '0 0 8px rgba(234, 179, 8, 0.3)' : 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (hasRecords) e.currentTarget.style.backgroundColor = isBestRecordDate ? 'rgba(234, 179, 8, 0.25)' : 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isToday ? 'rgba(239, 68, 68, 0.15)' : (isBestRecordDate ? 'rgba(234, 179, 8, 0.12)' : 'transparent');
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: isBestRecordDate ? '#fef08a' : color }}>
                        {isBestRecordDate ? `👑${day.getDate()}` : day.getDate()}
                      </span>
                      {hasRecords && (
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ width: '6px', height: '6px', backgroundColor: dotColor, borderRadius: '50%', display: 'inline-block' }} />
                          <span style={{ fontSize: '9px', color: '#94a3b8', transform: 'scale(0.85)' }}>{records.length}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 역대 최고 생존 기록 요약 배너 */}
            {bestSurvivalRecord && (
              <div
                onClick={() => handleSelectBestRecordDate(bestSurvivalRecord.date)}
                style={{
                  marginTop: '15px',
                  marginLeft: '8px',
                  marginRight: '8px',
                  backgroundColor: 'rgba(234, 179, 8, 0.1)',
                  border: '1.5px solid #eab308',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(234, 179, 8, 0.2)',
                  transition: 'transform 0.2s, background-color 0.2s, box-shadow 0.2s',
                  color: '#fef08a'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.01)';
                  e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.18)';
                  e.currentTarget.style.boxShadow = '0 0 18px rgba(234, 179, 8, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.1)';
                  e.currentTarget.style.boxShadow = '0 0 12px rgba(234, 179, 8, 0.2)';
                }}
              >
                <strong style={{ color: '#eab308', display: 'block', fontSize: '0.9rem', marginBottom: '3px' }}>
                  👑 역대 최고 생존 기록 달성일
                </strong>
                <span style={{ fontSize: '0.8rem' }}>
                  {new Date(bestSurvivalRecord.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} (Lv.{bestSurvivalRecord.zombieSpeed})
                </span>
                <span style={{ display: 'block', fontSize: '0.7rem', color: '#a1a1aa', marginTop: '4px' }}>
                  ※ 클릭 시 해당 날짜의 일지를 즉시 조회합니다.
                </span>
              </div>
            )}
          </div>
        )}

        {/* --- 생존 통계 탭 뷰 --- */}
        {activeTab === 'stats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
            {/* 누적 지표 요약 대시보드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px'
            }}>
              {/* 카드 1: 누적 거리 */}
              <div className="stats-card">
                <span className="stats-card-icon">🏃‍♂️</span>
                <span className="stats-card-label">누적 달린 거리</span>
                <span className="stats-card-value">{statistics.totalDistance}<small> km</small></span>
              </div>
              {/* 카드 2: 소모 칼로리 */}
              <div className="stats-card">
                <span className="stats-card-icon">🔥</span>
                <span className="stats-card-label">누적 소모 칼로리</span>
                <span className="stats-card-value">{statistics.totalCalories}<small> kcal</small></span>
              </div>
              {/* 카드 3: 생존 시간 */}
              <div className="stats-card">
                <span className="stats-card-icon">⏱️</span>
                <span className="stats-card-label">누적 생존 시간</span>
                <span className="stats-card-value">
                  {(() => {
                    const hours = Math.floor(statistics.totalDuration / 3600);
                    const minutes = Math.floor((statistics.totalDuration % 3600) / 60);
                    if (hours > 0) {
                      return `${hours}시간 ${minutes}분`;
                    }
                    return `${minutes}분 ${statistics.totalDuration % 60}초`;
                  })()}
                </span>
              </div>
              {/* 카드 4: 따돌린 좀비 */}
              <div className="stats-card">
                <span className="stats-card-icon">🧟</span>
                <span className="stats-card-label">따돌린 좀비 수</span>
                <span className="stats-card-value">{statistics.totalEscapes}<small> 마리</small></span>
              </div>
            </div>

            {/* 성장 곡선 그래프 카드 */}
            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(74, 222, 128, 0.2)',
              borderRadius: '12px',
              padding: '16px 12px 8px 12px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#4ade80', fontFamily: 'var(--mono)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                📈 서바이벌 도달 최고 레벨 성장 추이 (최근 10회)
              </h4>
              <SurvivalChart historyData={history} />
            </div>

            {/* 명예의 전당 (Personal Best) */}
            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.5)'
            }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#eab308', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👑 PERSONAL BEST : 명예의 전당
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>최고 돌파 좀비 레벨</span>
                  <span style={{ fontWeight: 'bold', color: '#fef08a' }}>Lv.{statistics.maxLevel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>1회 최장 탈출 거리</span>
                  <span style={{ fontWeight: 'bold', color: '#fef08a' }}>{statistics.maxDistance} km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>1회 최장 생존 시간</span>
                  <span style={{ fontWeight: 'bold', color: '#fef08a' }}>
                    {(() => {
                      const h = Math.floor(statistics.maxDuration / 3600);
                      const m = Math.floor((statistics.maxDuration % 3600) / 60);
                      const s = statistics.maxDuration % 60;
                      if (h > 0) return `${h}시간 ${m}분 ${s}초`;
                      if (m > 0) return `${m}분 ${s}초`;
                      return `${s}초`;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- 경로 상세 지도 팝업 (미리보기 모달) --- */}
      {showMapPreview && previewPath && (
        <div
          onClick={() => setShowMapPreview(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1010,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.98)',
              border: '2px solid #ef4444',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 0 25px rgba(239, 68, 68, 0.3)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* 팝업 헤더 */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🗺️ 경로 매핑 미리보기
              </h3>
              <button
                onClick={() => setShowMapPreview(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: '1'
                }}
              >
                ✕
              </button>
            </div>

            {/* 팝업 맵 미리보기 */}
            <div style={{ width: '100%', height: '300px', backgroundColor: '#1e293b' }}>
              <Map
                center={previewPath[0]}
                style={{ width: '100%', height: '100%' }}
                level={4}
              >
                <Polyline
                  path={previewPath}
                  strokeWeight={5}
                  strokeColor="#4ade80"
                  strokeOpacity={0.8}
                  strokeStyle="solid"
                />
                <Circle
                  center={previewPath[0]}
                  radius={10}
                  strokeWeight={2}
                  strokeColor="#4ade80"
                  strokeOpacity={0.8}
                  fillColor="#4ade80"
                  fillOpacity={0.6}
                />
                {previewPath.length > 1 && (
                  <Circle
                    center={previewPath[previewPath.length - 1]}
                    radius={10}
                    strokeWeight={2}
                    strokeColor="#ef4444"
                    strokeOpacity={0.8}
                    fillColor="#ef4444"
                    fillOpacity={0.6}
                  />
                )}
              </Map>
            </div>

            {/* 안내 문구 */}
            <div style={{
              padding: '10px 16px',
              backgroundColor: 'rgba(30, 41, 59, 0.3)',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              textAlign: 'center',
              fontSize: '11px',
              color: '#94a3b8'
            }}>
              🟢 출발지 / 🔴 도착지 경로 매핑 미리보기
            </div>

            {/* 액션 버튼 */}
            <div style={{
              display: 'flex',
              gap: '10px',
              padding: '12px 16px 16px 16px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                onClick={() => {
                  if (onReplayRecord) {
                    onReplayRecord({ routePath: previewPath, mode: 'run' });
                    setShowMapPreview(false);
                  }
                }}
                className="hud-reset-btn"
                style={{
                  flex: 1,
                  backgroundColor: '#4ade80',
                  color: '#0f172a',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  padding: '10px 0',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                🏁 이 경로로 재도전 (RUN)
              </button>
              <button
                onClick={() => {
                  if (onReplayRecord) {
                    onReplayRecord({ routePath: previewPath, mode: 'survival' });
                    setShowMapPreview(false);
                  }
                }}
                className="hud-reset-btn"
                style={{
                  flex: 1,
                  backgroundColor: '#f43f5e',
                  color: 'white',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  padding: '10px 0',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                🏃‍♂️ 서바이벌 가이드선 사용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 날짜별 상세 기록 레이어 (모달 팝업) --- */}
      {showDetailModal && (
        <div
          onClick={() => setShowDetailModal(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.98)',
              border: '2px solid #ef4444',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '420px',
              maxHeight: '80vh',
              boxShadow: '0 0 25px rgba(239, 68, 68, 0.3)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📅 {selectedDateStr} 생존 일지
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                  lineHeight: '1'
                }}
              >
                ✕
              </button>
            </div>

            {/* 모달 바디 (리스트) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 20px 20px' }}>
              {selectedDateRecords.map((rec, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '10px',
                    position: 'relative'
                  }}
                >
                  {/* 삭제 버튼 */}
                  <button
                    onClick={(e) => handleDeleteHistory(e, rec.date)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '11px',
                      opacity: '0.7',
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                  >
                    삭제
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      backgroundColor: rec.result === '탈출' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: rec.result === '탈출' ? '#4ade80' : '#ef4444',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'var(--mono)'
                    }}>
                      {rec.result}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--mono)' }}>
                      {new Date(rec.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>게임 모드</span>
                      <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>{rec.mode}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>이동 거리</span>
                      <span style={{ fontWeight: 'bold', fontFamily: 'var(--mono)' }}>{rec.distance}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>최종 속도/레벨</span>
                      <span style={{ fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                        {rec.mode === 'survival' ? `Lv.${rec.zombieSpeed}` : `${rec.zombieSpeed} 레벨`}
                      </span>
                    </div>
                    {/* 피트니스 추가 정보 노출 (새 데이터 있을 시) */}
                    {(rec.duration || rec.escapeCount) && (
                      <>
                        {rec.duration && (
                          <div>
                            <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>생존 시간</span>
                            <span style={{ fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                              {Math.floor(rec.duration / 60)}분 {rec.duration % 60}초
                            </span>
                          </div>
                        )}
                        {rec.escapeCount !== undefined && (
                          <div>
                            <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>따돌린 좀비</span>
                            <span style={{ fontWeight: 'bold', fontFamily: 'var(--mono)' }}>{rec.escapeCount}마리</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 경로 보기 클릭 버튼 */}
                  {rec.routePath && rec.routePath.length > 0 && (
                    <button
                      onClick={() => {
                        setPreviewPath(rec.routePath);
                        setShowMapPreview(true);
                      }}
                      style={{
                        marginTop: '12px',
                        width: '100%',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: 'white',
                        padding: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                    >
                      🗺️ 지도 경로 매핑 확인하기
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button onClick={onBackToIntro} className="back-btn-main history-content-animated" style={{ marginTop: '1.5rem', animationDelay: '0.2s' }}>
        돌아가기
      </button>

      {/* --- 공용 커스텀 컨펌 모달 --- */}
      {showConfirmModal && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div className="hud-container" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none', width: '90%', maxWidth: '300px' }}>
            <div className="hud-header">
              <div className="hud-mode-tag" style={{ color: '#ef4444' }}>{confirmConfig.title}</div>
              <div className="hud-status-dot" style={{ backgroundColor: '#ef4444' }}></div>
            </div>
            <div className="hud-main-display" style={{ padding: '10px 0' }}>
              <div className="hud-distance-text" style={{ fontSize: '1rem', color: '#f1f5f9', whiteSpace: 'pre-wrap' }}>
                {confirmConfig.message}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => {
                  confirmConfig.onConfirm();
                  setShowConfirmModal(false);
                }}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none' }}
              >
                YES
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="hud-reset-btn"
                style={{ flex: 1, backgroundColor: '#334155', border: 'none' }}
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 📈 꺾은선 네온 그래프 Canvas 드로잉 컴포넌트
 */
const SurvivalChart = ({ historyData }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 모바일 기기 고해상도 대응
    const dpr = window.devicePixelRatio || 1;
    const width = 300;
    const height = 160;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // 서바이벌 모드 데이터만 추출 및 정렬 (최근 10회)
    const chartData = [...historyData]
      .filter(rec => rec.mode === 'survival' && rec.zombieSpeed)
      .reverse()
      .slice(-10);

    ctx.clearRect(0, 0, width, height);

    const padding = { top: 20, right: 15, bottom: 25, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 1. 격자 및 라벨 렌더링
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y축 텍스트
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const lvlLabel = Math.round(100 - i * 25);
      ctx.fillText(`Lv.${lvlLabel === 0 ? 1 : lvlLabel}`, padding.left - 6, y);
    }

    if (chartData.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('서바이벌 기록이 여기에 표출됩니다.', width / 2, height / 2);
      return;
    }

    // 2. 포인트 좌표 맵핑
    const points = chartData.map((d, index) => {
      const x = padding.left + (chartData.length === 1 ? chartWidth / 2 : (chartWidth / (chartData.length - 1)) * index);
      const lvlVal = Number(d.zombieSpeed) || 1;
      const y = padding.top + chartHeight - (chartHeight * (lvlVal - 1)) / 99;
      return { x, y, date: new Date(d.date), level: lvlVal };
    });

    // 3. 네온 라인 그리기
    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';

    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // 섀도우 해제

    // 4. 그라데이션 면적 채우기
    if (points.length > 0) {
      ctx.beginPath();
      const grad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      grad.addColorStop(0, 'rgba(74, 222, 128, 0.2)');
      grad.addColorStop(1, 'rgba(74, 222, 128, 0.0)');
      ctx.fillStyle = grad;
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
      ctx.lineTo(points[0].x, height - padding.bottom);
      ctx.closePath();
      ctx.fill();
    }

    // 5. 도트 드로잉 및 X축 일자 텍스트
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 수치 표출
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.level}`, p.x, p.y - 8);

      // 날짜
      ctx.fillStyle = '#64748b';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const dateStr = `${p.date.getMonth() + 1}/${p.date.getDate()}`;
      ctx.fillText(dateStr, p.x, height - padding.bottom + 6);
    });

  }, [historyData]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default FavoritesPage;
