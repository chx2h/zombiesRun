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

  useEffect(() => {
    const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
    // 사용자가 직접 생성한 경로(isCustom: true)만 필터링
    const customFavs = savedFavs.filter(fav => fav.isCustom === true);
    // 최신 등록 순으로 정렬
    customFavs.sort((a, b) => b.id - a.id);
    setFavorites(customFavs);
  }, []);

  const getRouteDistance = (path) => {
    if (!path || path.length < 2) return '0.00km';
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      total += calculateDistance(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
    }
    return (total / 1000).toFixed(2) + 'km';
  };

  const handleDelete = (e, id) => {
    e.stopPropagation(); // 행 클릭 이벤트 전파 방지
    if (window.confirm("이 즐겨찾기 경로를 삭제하시겠습니까?")) {
      const savedFavs = JSON.parse(localStorage.getItem('zombie_route_favorites') || '[]');
      const updatedFavs = savedFavs.filter(fav => fav.id !== id);
      localStorage.setItem('zombie_route_favorites', JSON.stringify(updatedFavs));
      setFavorites(updatedFavs.filter(fav => fav.isCustom === true).sort((a, b) => b.id - a.id));
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
          ROUTE FAVORITES
        </h1>
        <p className="manual-subtitle">
          직접 생성한 작전 경로 목록입니다. 클릭 시 RUN 모드로 시작합니다.
        </p>
      </div>

      <div className="history-list-container history-content-animated">
        {favorites.length === 0 ? (
          <p className="no-records-message">아직 생성해서 저장한 즐겨찾기 경로가 없습니다.<br />'경로 만들기'에서 나만의 생존 경로를 등록해보세요!</p>
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
                        // 생성한 경로 클릭 시 RUN 모드로 플레이 진행할 수 있도록 객체 전달
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
                      onClick={(e) => handleDelete(e, fav.id)}
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
        )}
      </div>

      <button onClick={onBackToIntro} className="back-btn-main history-content-animated" style={{ marginTop: '1.5rem', animationDelay: '0.2s' }}>
        돌아가기
      </button>
    </div>
  );
};

export default FavoritesPage;
