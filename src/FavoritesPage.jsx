import React, { useState, useEffect, useRef, useMemo } from 'react';

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
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' | 'history'
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // --- 달력용 상태 ---
  const [currentDate, setCurrentDate] = useState(new Date()); // 달력 기준 연/월
  const [selectedDateRecords, setSelectedDateRecords] = useState([]); // 선택 날짜의 상세 기록
  const [selectedDateStr, setSelectedDateStr] = useState(''); // 선택된 날짜 레이블
  const [showDetailModal, setShowDetailModal] = useState(false); // 상세 기록 레이어 활성화

  const loadData = () => {
    // 1. 즐겨찾기 로드
    const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
    const customFavs = savedFavs.filter(fav => fav.isCustom === true);
    customFavs.sort((a, b) => b.id - a.id);
    setFavorites(customFavs);

    // 2. 플레이 이력 로드
    const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
    savedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistory(savedRecords);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 역대 최고 생존 기록(가장 높은 좀비 레벨) 산출
  const bestSurvivalRecord = useMemo(() => {
    const survivalRecords = history.filter(rec => rec.mode === 'survival' && rec.zombieSpeed);
    if (survivalRecords.length === 0) return null;
    let best = survivalRecords[0];
    for (let i = 1; i < survivalRecords.length; i++) {
      if (Number(survivalRecords[i].zombieSpeed) > Number(best.zombieSpeed)) {
        best = survivalRecords[i];
      } else if (Number(survivalRecords[i].zombieSpeed) === Number(best.zombieSpeed)) {
        if (new Date(survivalRecords[i].date) > new Date(best.date)) {
          best = survivalRecords[i];
        }
      }
    }
    return best;
  }, [history]);

  // 최고 기록일 클릭 시 해당 날짜로 캘린더 이동 및 모달 표출
  const handleSelectBestRecordDate = (dateInput) => {
    if (!dateInput) return;
    const targetDate = new Date(dateInput);
    
    // 해당 연/월로 캘린더 이동
    setCurrentDate(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    
    // 데이터 로드 및 모달 팝업
    const searchDateStr = getLocalDateStr(targetDate);
    const filtered = history.filter(rec => getLocalDateStr(rec.date) === searchDateStr);
    
    setSelectedDateRecords(filtered);
    setSelectedDateStr(`${targetDate.getFullYear()}년 ${String(targetDate.getMonth() + 1).padStart(2, '0')}월 ${String(targetDate.getDate()).padStart(2, '0')}일`);
    setShowDetailModal(true);
  };

  const getRouteDistance = (path) => {
    if (!path || path.length < 2) return '0.00km';
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    }
    return (total / 1000).toFixed(2) + 'km';
  };

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
    if (window.confirm("이 즐겨찾기 경로를 삭제하시겠습니까?")) {
      const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
      const updatedFavs = savedFavs.filter(fav => fav.id !== id);
      localStorage.setItem('zombie_route_favorites', JSON.stringify(updatedFavs));
      loadData();
    }
  };

  // 플레이 이력 삭제
  const handleDeleteHistory = (e, dateString) => {
    e.stopPropagation();
    if (window.confirm("이 게임 기록을 삭제하시겠습니까?")) {
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
          <span>⭐ 경로 생성</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`tab-btn ${activeTab === 'history' ? 'active-survival' : ''}`}
          style={{ padding: '10px' }}
        >
          <span>📜 생존 기록</span>
        </button>
      </div>

      {/* 컨텐츠 컨테이너 */}
      <div className="history-list-container history-content-animated" style={{ display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'favorites' ? (
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
        ) : (
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
                          <span style={{ fontSize: '9px', color: '#94a3b8', scale: '0.85' }}>{records.length}</span>
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
      </div>

      {/* --- 날짜별 상세 기록 레이어 (모달 팝업) --- */}
      {showDetailModal && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
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
          }}>
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
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                ※ 경로를 터치하면 해당 코스로 복습 훈련(RUN 모드)을 시작 합니다.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedDateRecords.map((record, index) => {
                  const hasPath = record.routePath && record.routePath.length > 0;
                  return (
                    <div
                      key={record.date || index}
                      onClick={() => {
                        if (hasPath) {
                          setShowDetailModal(false);
                          if (onReplayRecord) {
                            onReplayRecord({ routePath: record.routePath, mode: 'run' });
                          }
                        } else {
                          alert("해당 기록에는 이동 경로 좌표 데이터가 포함되어 있지 않아 재시작이 불가능합니다.");
                        }
                      }}
                      style={{
                        backgroundColor: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        padding: '12px',
                        cursor: hasPath ? 'pointer' : 'not-allowed',
                        opacity: hasPath ? 1 : 0.7,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (hasPath) e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.8)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`mode-badge ${record.mode || 'run'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                            {record.mode ? record.mode.toUpperCase() : 'RUN'}
                          </span>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {new Date(record.date).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 'bold' }}>
                          거리: {record.distance || '-'} | 좀비: {record.zombieSpeed ? `Lv.${record.zombieSpeed}` : '-'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          fontWeight: 'bold',
                          fontSize: '14px',
                          color: record.result === '탈출' ? '#4ade80' : (record.result === '사망' ? '#ef4444' : '#94a3b8')
                        }}>
                          {record.result || '-'}
                        </span>
                        <button
                          onClick={(e) => handleDeleteHistory(e, record.date)}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '16px',
                            padding: '4px'
                          }}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <button onClick={onBackToIntro} className="back-btn-main history-content-animated" style={{ marginTop: '1.5rem', animationDelay: '0.2s' }}>
        돌아가기
      </button>
    </div>
  );
};

export default FavoritesPage;
