import React, { useState, useEffect } from 'react';

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

  const getRouteDistance = (path) => {
    if (!path || path.length < 2) return '0.00km';
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    }
    return (total / 1000).toFixed(2) + 'km';
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
      loadData();
    }
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
          <span>⭐ 즐겨찾기 경로</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`tab-btn ${activeTab === 'history' ? 'active-survival' : ''}`}
          style={{ padding: '10px' }}
        >
          <span>📜 게임 플레이 기록</span>
        </button>
      </div>

      {/* 컨텐츠 컨테이너 */}
      <div className="history-list-container history-content-animated">
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
                      <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>
                        {fav.title}
                      </span>
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
          /* 게임 플레이 기록 목록 */
          history.length === 0 ? (
            <p className="no-records-message">
              아직 플레이한 생존 기록이 없습니다.<br />
              전장에 뛰어들어 좀비를 피해 생존 기록을 남겨보세요!
            </p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>플레이 시간</th>
                  <th>게임 모드</th>
                  <th>이동 거리</th>
                  <th>좀비 속도</th>
                  <th>결과</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => {
                  const hasPath = record.routePath && record.routePath.length > 0;
                  return (
                    <tr 
                      key={record.date || index}
                      onClick={() => {
                        if (hasPath) {
                          if (onReplayRecord) {
                            onReplayRecord({ routePath: record.routePath, mode: 'run' });
                          }
                        } else {
                          alert("해당 기록에는 이동 경로 좌표 데이터가 포함되어 있지 않아 재시작이 불가능합니다.");
                        }
                      }}
                      className="history-row"
                      style={{ cursor: hasPath ? 'pointer' : 'not-allowed', opacity: hasPath ? 1 : 0.65 }}
                      title={hasPath ? '클릭 시 해당 경로로 재도전 (RUN 모드)' : '경로 데이터가 없음'}
                    >
                      <td>
                        {new Date(record.date).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span className={`mode-badge ${record.mode || 'run'}`}>
                          {record.mode ? record.mode.toUpperCase() : 'RUN'}
                        </span>
                      </td>
                      <td>{record.distance || '-'}</td>
                      <td>{record.zombieSpeed ? `Lv.${record.zombieSpeed}` : '-'}</td>
                      <td style={{ 
                        fontWeight: 'bold', 
                        color: record.result === '탈출' ? '#4ade80' : (record.result === '사망' ? '#ef4444' : '#94a3b8') 
                      }}>
                        {record.result || '-'}
                      </td>
                      <td>
                        <button 
                          onClick={(e) => handleDeleteHistory(e, record.date)}
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
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      <button onClick={onBackToIntro} className="back-btn-main history-content-animated" style={{ marginTop: '1.5rem', animationDelay: '0.2s' }}>
        돌아가기
      </button>
    </div>
  );
};

export default FavoritesPage;
