import React, { useState, useEffect, useRef } from 'react';

function ScraperDashboard({ searchProfile }) {
  const [logs, setLogs] = useState([]);
  const [boards, setBoards] = useState([]);
  const [scraperRunning, setScraperRunning] = useState(false);
  const endOfLogsRef = useRef(null);

  useEffect(() => {
    fetchLogsAndBoards();
    const interval = setInterval(fetchLogsAndBoards, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchLogsAndBoards = async () => {
    try {
      const [logsRes, boardsRes] = await Promise.all([
        fetch('http://localhost:3001/api/scraper/logs'),
        fetch('http://localhost:3001/api/scraper/boards')
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (boardsRes.ok) setBoards(await boardsRes.json());
    } catch (e) {
      console.error('Failed to fetch scraper data', e);
    }
  };

  const handleRunScraper = async () => {
    setScraperRunning(true);
    try {
      await fetch('http://localhost:3001/api/scraper/run', { method: 'POST' });
    } catch (e) {
      alert('Failed to trigger scraper.');
    } finally {
      setTimeout(() => setScraperRunning(false), 3000);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
      
      {/* Left Column: Config */}
      <div style={{ flex: 1 }}>
        <div className="glass-panel" style={{ marginBottom: '1rem' }}>
          <h3>Scraper Configuration</h3>
          {searchProfile ? (
            <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
              <li><strong>Search Term:</strong> {searchProfile.search_term}</li>
              <li><strong>Location:</strong> {searchProfile.location}</li>
              <li><strong>Remote Only:</strong> {searchProfile.is_remote ? 'Yes' : 'No'}</li>
              <li><strong>Deduplication:</strong> Strict 1-Job-Per-Company (Semantic Hashing)</li>
              <li><strong>Proxies:</strong> Enabled (Residential HTTP Proxies)</li>
            </ul>
          ) : (
            <p>No active search profile found.</p>
          )}
          <button 
            className="btn btn-primary" 
            onClick={handleRunScraper} 
            disabled={scraperRunning}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {scraperRunning ? 'Scraper Triggered...' : 'Force Run Scraper Now'}
          </button>
        </div>

        <div className="glass-panel" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <h3>Target Job Boards ({boards.filter(b => b.is_active).length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
            {boards.map(b => (
              <span key={b.id} style={{ 
                background: b.is_active ? 'rgba(0, 200, 100, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}>
                {b.board_token}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Live Terminal */}
      <div className="glass-panel" style={{ flex: 2, background: '#0a0a0a', border: '1px solid #333' }}>
        <h3 style={{ color: '#00ffcc', fontFamily: 'monospace', marginBottom: '1rem' }}>&gt;_ Live Scraper Output</h3>
        <div style={{
          height: '600px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          lineHeight: '1.5',
          color: '#ccc'
        }}>
          {logs.map(log => {
            let color = '#ccc';
            if (log.log_level === 'ERROR') color = '#ff6b6b';
            if (log.message.includes('Scrape Complete')) color = '#00ffcc';
            if (log.message.includes('Searching for')) color = '#ffd93d';
            
            return (
              <div key={log.id} style={{ marginBottom: '4px', color }}>
                <span style={{ color: '#666' }}>[{new Date(log.created_at).toLocaleTimeString()}]</span> {log.message}
              </div>
            );
          })}
          <div ref={endOfLogsRef} />
        </div>
      </div>

    </div>
  );
}

export default ScraperDashboard;
