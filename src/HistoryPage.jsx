import React, { useState, useEffect } from 'react';

const HistoryPage = ({ onBackToIntro }) => {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    const savedRecords = JSON.parse(localStorage.getItem('gameRecords') || '[]');
    // 최신 기록이 위로 오도록 정렬
    savedRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    setRecords(savedRecords);
  }, []);

  const getResultStyle = (result) => {
    if (result === '탈출') return { color: '#ef4444', fontWeight: 'bold' };
    if (result === '사망') return { color: '#3b82f6', fontWeight: 'bold' };
    return {};
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
          SURVIVAL RECORDS
        </h1>
        <p className="manual-subtitle">
          치열했던 생존의 흔적을 확인하세요.
        </p>
      </div>

      <div className="history-list-container">
        {records.length === 0 ? (
          <p className="no-records-message">아직 게임 기록이 없습니다.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>날짜/시간</th>
                <th>모드</th>
                <th>거리</th>
                <th>좀비 속도</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={index}>
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
                    <span className={`mode-badge ${record.mode}`}>
                      {record.mode.toUpperCase()}
                    </span>
                  </td>
                  <td>{record.distance}</td>
                  <td>{record.zombieSpeed}/50</td>
                  <td style={getResultStyle(record.result)}>
                    {record.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button onClick={onBackToIntro} className="back-btn-main" style={{ marginTop: '1.5rem' }}>
        돌아가기
      </button>
    </div>
  );
};

export default HistoryPage;