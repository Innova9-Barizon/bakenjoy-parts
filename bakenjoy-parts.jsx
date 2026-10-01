import React, { useState, useEffect } from 'react';

// --- Bake n Joy shared AIS session (SSO across /bakenjoy-* apps) ---
const BNJ_AUTH_COOKIE = 'bakenjoy_ais_auth';
const BNJ_AUTH_TTL_MIN = 30;
const BNJ_DEVICE = 'ChatJDE';
const BNJ_LEGACY_COOKIE_NAMES = [
  'jde_bnjhome_token', 'jde_bnjhome_username', 'jde_bnjhome_env',
  'jde_bnjwolist_token', 'jde_bnjwolist_username', 'jde_bnjwolist_env',
  'jde_bnjcreatewo_token', 'jde_bnjcreatewo_username', 'jde_bnjcreatewo_env',
  'jde_bnjparts_token', 'jde_bnjparts_username', 'jde_bnjparts_env',
  'jde_bnjfield_token', 'jde_bnjfield_username', 'jde_bnjfield_env',
  'jde_bnjassetbom_token', 'jde_bnjassetbom_username', 'jde_bnjassetbom_env',
  'jde_bnjpmsched_token', 'jde_bnjpmsched_username', 'jde_bnjpmsched_env',
];
const setCookie = (name, value, minutes = BNJ_AUTH_TTL_MIN) => {
  const expires = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
  const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
};
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return null;
};
const deleteCookie = (name) => {
  const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secure}`;
};
const clearLegacyBnjCookies = () => { BNJ_LEGACY_COOKIE_NAMES.forEach(deleteCookie); };
const clearBnjAuth = () => { deleteCookie(BNJ_AUTH_COOKIE); clearLegacyBnjCookies(); };
const writeBnjAuth = ({ token, username, env, addressNumber, deviceName }) => {
  const expiresAt = Date.now() + BNJ_AUTH_TTL_MIN * 60 * 1000;
  const payload = {
    token: String(token || ''),
    username: String(username || ''),
    env: String(env || 'DV'),
    addressNumber: addressNumber ? String(addressNumber) : '',
    deviceName: deviceName || BNJ_DEVICE,
    expiresAt,
  };
  if (!payload.token || !payload.username) return;
  setCookie(BNJ_AUTH_COOKIE, JSON.stringify(payload), BNJ_AUTH_TTL_MIN);
  clearLegacyBnjCookies();
};
const readBnjAuth = () => {
  const raw = getCookie(BNJ_AUTH_COOKIE);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !data.token || !data.username) return null;
    if (data.expiresAt && Date.now() > Number(data.expiresAt)) { clearBnjAuth(); return null; }
    return data;
  } catch (e) { return null; }
};
const refreshBnjAuth = (session) => {
  if (!session || !session.token || !session.username) return;
  writeBnjAuth(session);
};

const LOGO_URL = 'https://chatjdevibe.innova9.io/vibe/images/Logo_thin.png';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const trimDisplay = (v) => String(v ?? '').trim();
const displayOrDash = (v) => trimDisplay(v) || '—';
const parseAisError = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === 'string' && data.trim()) return data.trim();
  const msg = data.jde__simpleMessage || data.message || data.exception || data.error;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
};

export default function BakeNJoyParts() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState('DV');
  const [query, setQuery] = useState('filter');
  const [items, setItems] = useState([]);
  const [branchPlant, setBranchPlant] = useState('M30');
  const [selectedItem, setSelectedItem] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [message, setMessage] = useState(null);

  const ENVIRONMENTS = {
    DV: { label: 'DV', description: 'Development', aisBaseUrl: 'https://studio.chatjde.ai/jderest/v2', orchBaseUrl: 'https://studio.chatjde.ai/jderest/v3/orchestrator', jdeEnv: 'JDV920', color: '#2563eb' },
    PD: { label: 'PD', description: 'Production', aisBaseUrl: 'http://10.9.4.139:8002/jderest/v2', orchBaseUrl: 'http://10.9.4.139:8002/jderest/v3/orchestrator', jdeEnv: 'JPD920', color: '#dc2626' },
  };
  const envConfig = ENVIRONMENTS[selectedEnv];
  const ENV_PREF = 'bakenjoy_env_pref';
  const clearSession = (msg) => { setIsLoggedIn(false); setToken(null); clearBnjAuth(); if (msg) setSessionExpiredMessage(msg); };
  const refreshCookieTTL = (t, u) => { refreshBnjAuth({ token: t, username: u, env: selectedEnv, deviceName: BNJ_DEVICE }); };
  const handleApiError = (r) => { if ([444,401,403].includes(r.status)) { clearSession('Your session has expired. Please sign in again.'); return true; } return false; };

  useEffect(() => { document.title = 'Bake n Joy — Part Lookup'; }, []);
  useEffect(() => {
    const pref = getCookie(ENV_PREF);
    if (pref && ENVIRONMENTS[pref]) setSelectedEnv(pref);
    const sess = readBnjAuth();
    if (sess) {
      if (sess.env && ENVIRONMENTS[sess.env]) setSelectedEnv(sess.env);
      setToken(sess.token);
      setUsername(sess.username);
      setIsLoggedIn(true);
    }
    setValidatingToken(false);
  }, []);

  const orchFetch = async (name, body) => {
    const response = await fetch(`${envConfig.orchBaseUrl}/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'jde-AIS-Auth': token },
      body: JSON.stringify({ deviceName: 'ChatJDE', ...body }),
    });
    if (!response.ok) { if (handleApiError(response)) return null; const d = await response.json().catch(() => null); throw new Error(parseAisError(d, `Failed (${response.status})`)); }
    const data = await response.json(); refreshCookieTTL(token, username); return data;
  };

  const searchItems = async () => {
    setLoading(true); setError(null); setMessage(null); setAvailability([]); setSelectedItem(null);
    try {
      const data = await orchFetch('itemSearch', { itemDescription: trimDisplay(query) });
      if (!data) return;
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setMessage(`${rows.length} item(s) for “${trimDisplay(query)}”`);
    } catch (err) { setError(err.message); setItems([]); }
    finally { setLoading(false); }
  };

  const loadAvailability = async (item) => {
    setSelectedItem(item); setLoading(true); setError(null);
    try {
      const data = await orchFetch('itemAvailability', { itemNumber: trimDisplay(item.itemNumber), branchPlant: trimDisplay(branchPlant) });
      if (!data) return;
      const rows = Array.isArray(data.itemAvailability) ? data.itemAvailability : [];
      setAvailability(rows);
      setMessage(`Availability for ${item.itemNumber} @ ${branchPlant}: ${rows.length} location(s)`);
    } catch (err) { setError(err.message); setAvailability([]); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault(); if (loginLoading) return;
    setLoginLoading(true); setError(null); setSessionExpiredMessage(null);
    try {
      const response = await fetch(`${envConfig.aisBaseUrl}/tokenrequest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceName: 'ChatJDE', username, environment: envConfig.jdeEnv, password }) });
      if (!response.ok) throw new Error('Invalid credentials. Please try again.');
      const data = await response.json();
      const newToken = data.userInfo?.token || data.token || null;
      if (!newToken) throw new Error('Authentication failed. No token received.');
      const an8 = data.userInfo?.addressNumber || data.addressNumber || '';
      writeBnjAuth({ token: newToken, username, env: selectedEnv, addressNumber: an8, deviceName: BNJ_DEVICE });
      setToken(newToken); setIsLoggedIn(true);
    } catch (err) { setError(err.message || 'Login failed.'); }
    finally { setLoginLoading(false); }
  };
  const handleLogout = async () => {
    if (token) { try { await fetch(`${envConfig.aisBaseUrl}/tokenrequest/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); } catch {} }
    clearSession(); setUsername(''); setPassword('');
  };

  const inputStyle = { padding: '12px 16px', fontSize: 16, color: '#111827', border: '1px solid #d1d5db', borderRadius: 8, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 14, fontWeight: 500, color: '#1f2937', marginBottom: 6, display: 'block' };

  if (validatingToken) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>Loading…</div>;
  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1e3a8a,#3b82f6,#60a5fa)', padding: 20, fontFamily: FONT }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <img src={LOGO_URL} alt="Innova9" style={{ display: 'block', height: 56, margin: '0 auto 12px', objectFit: 'contain' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>Bake n Joy — Part Lookup</h1>
            <p style={{ margin: 0, color: '#4b5563', fontSize: 14 }}>JD Edwards EnterpriseOne</p>
          </div>
          {sessionExpiredMessage && <div style={{ padding: 12, background: '#fffbeb', borderRadius: 8, color: '#92400e', marginBottom: 12 }}>{sessionExpiredMessage}</div>}
          {error && <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, color: '#dc2626', marginBottom: 12 }}>{error}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(ENVIRONMENTS).map(([key, env]) => (
                <button key={key} type="button" onClick={() => { setSelectedEnv(key); setCookie(ENV_PREF, key, 43200); }}
                  style={{ flex: 1, padding: 12, borderRadius: 8, border: `2px solid ${selectedEnv === key ? env.color : '#e5e7eb'}`, background: selectedEnv === key ? `${env.color}10` : '#fff', cursor: 'pointer', fontWeight: 700, color: selectedEnv === key ? env.color : '#1f2937' }}>{env.label}</button>
              ))}
            </div>
            <div><label style={labelStyle}>Username</label><input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
            <div><label style={labelStyle}>Password</label><input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button type="submit" disabled={loginLoading} style={{ padding: 14, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>{loginLoading ? 'Signing in…' : 'Sign In'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: FONT }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <img src={LOGO_URL} alt="Innova9" style={{ height: 32 }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Bake n Joy — Part Lookup</h1>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${envConfig.color}40`, color: envConfig.color, background: `${envConfig.color}15` }}>{envConfig.label}</span>
          <a href="https://chatjdevibe.innova9.io/bakenjoy-home" style={{ fontSize: 13, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>← Home</a>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>{username}</span>
          <button type="button" onClick={() => handleLogout()} style={{ padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>
      {error && <div style={{ padding: 12, background: '#fef2f2', color: '#dc2626' }}>{error}</div>}
      {message && !error && <div style={{ padding: 12, background: '#f0fdf4', color: '#15803d' }}>{message}</div>}
      <main style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Search parts</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}><label style={labelStyle}>Description contains</label><input style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchItems(); }} /></div>
            <div style={{ flex: '0 1 120px' }}><label style={labelStyle}>Branch</label><input style={inputStyle} value={branchPlant} onChange={(e) => setBranchPlant(e.target.value)} /></div>
            <button type="button" disabled={loading} onClick={() => searchItems()} style={{ padding: '10px 18px', background: '#db2777', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>{loading ? 'Searching…' : 'Search'}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Items ({items.length})</h2>
            {items.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Search to list items.</div> : (
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {items.map((it, idx) => (
                  <button key={idx} type="button" onClick={() => loadAvailability(it)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, marginBottom: 8, borderRadius: 8, border: selectedItem?.itemNumber === it.itemNumber ? '2px solid #db2777' : '1px solid #e5e7eb', background: selectedItem?.itemNumber === it.itemNumber ? '#fdf2f8' : '#fff', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{displayOrDash(it.itemNumber)}</div>
                    <div style={{ fontSize: 13, color: '#4b5563' }}>{displayOrDash(it.description)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Availability {selectedItem ? `· ${selectedItem.itemNumber}` : ''}</h2>
            {!selectedItem ? <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Select an item.</div> : availability.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No availability rows.</div> : (
              <div style={{ maxHeight: 520, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {availability.map((r, i) => {
                  const loc = displayOrDash(r.location);
                  const br = displayOrDash(r.branchPlant);
                  const metrics = [
                    { key: 'onHand', label: 'On hand', value: displayOrDash(r.onHand), color: '#1d4ed8', bg: '#eff6ff',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27,6.96 12,12.01 20.73,6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> },
                    { key: 'committed', label: 'Committed', value: displayOrDash(r.committed), color: '#b45309', bg: '#fffbeb',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="9" y1="15" x2="15" y2="15" /></svg> },
                    { key: 'available', label: 'Available', value: displayOrDash(r.available), color: '#15803d', bg: '#f0fdf4',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg> },
                    { key: 'onWO', label: 'On WO', value: displayOrDash(r.onWO), color: '#7c3aed', bg: '#f5f3ff',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
                    { key: 'onPO', label: 'On PO', value: displayOrDash(r.onPO), color: '#be185d', bg: '#fdf2f8',
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="1" y="3" width="15" height="13" /><polygon points="16,8 20,8 23,11 23,16 16,16 16,8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg> },
                  ];
                  return (
                    <div key={i} style={{ border: '1px solid #d1d5db', borderRadius: 12, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                      <div style={{ padding: '12px 14px', background: '#111827', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.2 }}>Location {loc}</div>
                        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 999 }}>Branch {br}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, padding: 12 }}>
                        {metrics.map((m) => (
                          <div key={m.key} style={{ background: m.bg, border: `1px solid ${m.color}33`, borderRadius: 10, padding: '12px 10px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: m.color, marginBottom: 6 }}>
                              <span style={{ display: 'inline-flex', color: m.color }}>{m.icon}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>{m.label}</span>
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
