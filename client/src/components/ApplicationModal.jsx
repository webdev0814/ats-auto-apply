import { useState, useEffect } from 'react';

export default function ApplicationModal({ app, roles, onClose, onRefresh }) {
  // Parse the stored JSON strings (since SQLite stores them as TEXT)
  const parseJson = (str, fallback) => {
    if (!str) return fallback;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch (e) { return fallback; }
  };

  const formSchema = parseJson(app.form_schema_json, []);
  const initialLlmAnswers = parseJson(app.llm_json_payload, {});
  const aiReviewerFeedback = parseJson(app.ai_reviewer_feedback, null);

  const [answers, setAnswers] = useState(initialLlmAnswers);
  const [selectedRole, setSelectedRole] = useState(app.role_id || '');
  const [coverLetter, setCoverLetter] = useState(app.cover_letter_text || '');
  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (fieldId, value) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleRetry = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/api/applications/${app.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_json_payload: answers,
          role_id: selectedRole === '' ? null : parseInt(selectedRole),
          cover_letter_text: coverLetter
        })
      });
      if (res.ok) {
        onRefresh();
        onClose();
      } else {
        alert('Failed to retry');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{app.target_company} Application Review</h2>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          {/* Left Column: AI Review & Form Fields */}
          <div className="modal-left">
            
            {/* Captcha Recovery Alert */}
            {app.status === 'REQUIRES_MANUAL_CAPTCHA' && (
              <div className="ai-review-card" style={{ borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)' }}>
                <h4 style={{ color: '#f97316' }}>⚠️ Captcha Blocked</h4>
                <p style={{ marginBottom: '1rem', color: '#fdba74', fontSize: '0.9rem' }}>
                    2Captcha failed or timed out. Please apply manually in a fresh browser session to rescue this job.
                </p>
                <a 
                  href={app.target_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="btn"
                  style={{ backgroundColor: '#f97316', color: 'white', display: 'block', textAlign: 'center', textDecoration: 'none' }}
                >
                  Apply Manually in Browser
                </a>
              </div>
            )}

            {/* AI Reviewer Alert */}
            {aiReviewerFeedback && aiReviewerFeedback.flags?.length > 0 && (
              <div className="ai-review-card">
                <h4>⚠️ AI Reviewer Flag</h4>
                <ul>
                  {aiReviewerFeedback.flags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="form-group" style={{ marginTop: '20px' }}>
              <h3>Generated Cover Letter</h3>
              <textarea 
                rows={10} 
                style={{ width: '100%', padding: '10px', backgroundColor: '#1e1e1e', color: 'white', border: '1px solid #333' }}
                value={coverLetter} 
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Leave blank to skip cover letter..."
              />
            </div>

            <div className="modal-actions">
              <label>Assigned Resume/Role Profile</label>
              <select 
                className="form-control" 
                value={selectedRole} 
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="">-- Unassigned (Fallback Base Resume) --</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>

            <hr style={{ borderColor: 'var(--panel-border)', margin: '1.5rem 0' }} />
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Extracted Custom Fields</h3>

            {formSchema.length === 0 ? (
              <p>No dynamic custom fields detected. (Standard fields handled automatically).</p>
            ) : (
              formSchema.map((field) => (
                <div key={field.id} className="form-group">
                  <label>{field.label}</label>
                  {field.type === 'dropdown' ? (
                    <select 
                      className="form-control" 
                      value={answers[field.id] || ''} 
                      onChange={e => handleInputChange(field.id, e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      {field.options?.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <textarea 
                      className="form-control" 
                      rows="3"
                      value={answers[field.id] || ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                    />
                  )}
                </div>
              ))
            )}

            <div style={{ marginTop: '2rem' }}>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%' }} 
                onClick={handleRetry}
                disabled={submitting}
              >
                {submitting ? 'Queuing...' : 'Save & Trigger Worker'}
              </button>
            </div>
          </div>

          {/* Right Column: Screenshots */}
          <div className="modal-right screenshots-container">
            {app.screenshot_before_path && (
              <div className="screenshot-card">
                <h4>Before Submit (DOM Extracted)</h4>
                <img src={`http://localhost:3001/screenshots/${app.screenshot_before_path}`} alt="Before" />
              </div>
            )}
            {app.screenshot_after_path && (
              <div className="screenshot-card">
                <h4>After Submit (Result)</h4>
                <img src={`http://localhost:3001/screenshots/${app.screenshot_after_path}`} alt="After" />
              </div>
            )}
            {!app.screenshot_before_path && !app.screenshot_after_path && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                No screenshots captured for this draft.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
