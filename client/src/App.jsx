import { useState, useEffect } from 'react'
import './index.css'
import ApplicationModal from './components/ApplicationModal'
import ScraperDashboard from './components/ScraperDashboard'

function App() {
  const [activeTab, setActiveTab] = useState('applications')
  const [applications, setApplications] = useState([])
  const [roles, setRoles] = useState([])
  const [telemetry, setTelemetry] = useState({ status_counts: [], ats_counts: [] })
  const [searchProfile, setSearchProfile] = useState(null)
  const [selectedApp, setSelectedApp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scraperRunning, setScraperRunning] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchData(true)
    const interval = setInterval(() => {
      fetchData(false)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [appsRes, rolesRes, telRes, profRes] = await Promise.all([
        fetch('http://localhost:3001/api/applications'),
        fetch('http://localhost:3001/api/roles'),
        fetch('http://localhost:3001/api/telemetry'),
        fetch('http://localhost:3001/api/search_profiles')
      ])
      if (appsRes.ok) setApplications(await appsRes.json())
      if (rolesRes.ok) setRoles(await rolesRes.json())
      if (telRes.ok) setTelemetry(await telRes.json())
      if (profRes.ok) {
        const profiles = await profRes.json();
        if (profiles.length > 0) setSearchProfile(profiles[0]);
      }
    } catch (err) {
      console.error("Failed to fetch data", err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleApproveAll = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/applications/approve-all', { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      fetchData(); // Refresh queue to see updated status
    } catch (e) {
      alert('Failed to approve applications.');
    }
  }

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Antigravity ATS Console</h1>
        <div>
          <button className="btn btn-outline" onClick={fetchData} style={{ marginRight: '1rem' }}>Refresh</button>
          <button className="btn btn-success" onClick={handleApproveAll}>Approve All Reviews</button>
        </div>
      </header>

      {/* Telemetry Dashboard */}
      <div className="telemetry-dashboard" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div className="glass-panel" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <h3>Total Ingested</h3>
          <h2>{telemetry.total || applications.length}</h2>
        </div>
        <div className="glass-panel" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <h3>Pending Action</h3>
          <h2>{telemetry.pending || 0}</h2>
        </div>
        <div className="glass-panel" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <h3>Bypassed (Workday/Taleo)</h3>
          <h2>{telemetry.bypassed || 0}</h2>
        </div>
        <div className="glass-panel" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <h3 style={{ color: '#ff6b6b' }}>Manual Captcha Blocked</h3>
          <h2>{telemetry.manual_captcha || 0}</h2>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button 
          className={`btn ${activeTab === 'applications' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('applications')}
        >
          Job Queue ({applications.length})
        </button>
        <button 
          className={`btn ${activeTab === 'scraper' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('scraper')}
        >
          Scraper Console & Logs
        </button>
      </div>

      {activeTab === 'applications' ? (
        <div className="glass-panel">
          {loading ? (
          <p>Loading applications...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Company</th>
                <th>Role Context</th>
                <th>
                  Status
                  <select 
                    style={{ marginLeft: '10px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '2px 5px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="NEW">NEW</option>
                    <option value="PROCESSING_INGESTION">PROCESSING_INGESTION</option>
                    <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="FAILED">FAILED</option>
                    <option value="FAILED_INGESTION">FAILED_INGESTION</option>
                    <option value="REQUIRES_MANUAL_CAPTCHA">REQUIRES_MANUAL_CAPTCHA</option>
                    <option value="SKIPPED_UNSUPPORTED_ATS">SKIPPED_UNSUPPORTED_ATS</option>
                  </select>
                </th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 ? (
                <tr><td colSpan="5" style={{textAlign:'center'}}>No applications found.</td></tr>
              ) : applications.filter(app => statusFilter ? app.status === statusFilter : true).map(app => {
                const role = roles.find(r => r.id === app.role_id);
                return (
                  <tr key={app.id} onClick={() => setSelectedApp(app)}>
                    <td>#{app.id}</td>
                    <td><strong>{app.target_company}</strong></td>
                    <td>{role ? role.title : 'Unassigned'}</td>
                    <td>
                      <span className={`status-badge status-${app.status?.toLowerCase() || 'pending'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td>{new Date(app.created_at).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      ) : (
        <ScraperDashboard searchProfile={searchProfile} />
      )}

      {selectedApp && (
        <ApplicationModal 
          app={selectedApp} 
          roles={roles}
          onClose={() => setSelectedApp(null)}
          onRefresh={fetchData}
        />
      )}
    </div>
  )
}

export default App
