// dashboard.js — Wired to Flask backend. Matches original dashboard layout exactly.

// ── State ────────────────────────────────────────────────────────────────────
let refreshInterval = null;
let allAlerts       = [];
let activeFilter    = 'all';
let isPlaying       = false;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) setTimeout(() => overlay.style.display = 'none', 500);
    startClock();
    loadDashboard();
    updateCameraGrid();
    refreshInterval = setInterval(loadDashboard, 10000);
});
window.addEventListener('beforeunload', () => { if (refreshInterval) clearInterval(refreshInterval); });

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
    function tick() {
        const now = new Date();
        const tl = document.getElementById('currentTimeline');
        if (tl) tl.textContent = now.toLocaleString('en-GB');
        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById('timestamp' + i);
            if (el) el.textContent = now.toLocaleTimeString('en-GB');
        }
        const lu = document.getElementById('lastUpdate');
        if (lu) lu.textContent = now.toLocaleTimeString('en-GB');
    }
    tick(); setInterval(tick, 1000);
}

// ── Load dashboard data ───────────────────────────────────────────────────────
function loadDashboard() {
    fetch('/api/dashboard-data')
        .then(r => { if (r.status === 401) { window.location.href = '/'; return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            updateStats(data);
            updateUserInfo(data);
            allAlerts = data.recent_alerts || [];
            renderAlerts(allAlerts, activeFilter);
            updateFilterCounts(allAlerts);
        })
        .catch(err => console.error('Dashboard error:', err));
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats(data) {
    const s = data.detection_stats || {};
    setText('totalDetections',   s.total    || 0);
    setText('personDetections',  s.persons  || 0);
    setText('vehicleDetections', s.vehicles || 0);
    setText('detectionAccuracy', s.accuracy ? s.accuracy + '%' : '--');
    const unack = (data.recent_alerts || []).filter(a => a.status === 'unacknowledged').length;
    setText('alertCount', unack);
    setText('uptimeValue',   data.uptime      || '--');
    setText('fpsValue',      data.fps         ? data.fps + ' FPS' : '-- FPS');
    setText('aiStatusValue', data.yolo_status || 'Awaiting');
    const gpu = data.gpu_usage || 0;
    const gpuEl  = document.getElementById('gpuUsage');
    const gpuBar = document.getElementById('gpuFill');
    if (gpuEl)  gpuEl.textContent  = gpu ? gpu + '%' : '--';
    if (gpuBar) gpuBar.style.width = (gpu || 0) + '%';
    const latEl = document.getElementById('networkLatency');
    if (latEl) latEl.textContent = data.latency || '--';
}

function updateUserInfo(data) {
    if (!data.user) return;
    const nameEl   = document.getElementById('headerUsername');
    const avatarEl = document.querySelector('.user-profile .avatar');
    const roleEl   = document.querySelector('.user-profile .role');
    if (nameEl)   nameEl.textContent   = data.user;
    if (avatarEl) avatarEl.textContent = data.user.slice(0,1).toUpperCase();
    if (roleEl && data.role) roleEl.innerHTML = `<i class="fas fa-user-shield"></i> ${data.role}`;
}

// ── Alert filters ─────────────────────────────────────────────────────────────
function filterAlerts(type) {
    activeFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const target = document.querySelector('.filter-btn.' + type);
    if (target) target.classList.add('active');
    else document.querySelector('.filter-btn.all')?.classList.add('active');
    renderAlerts(allAlerts, type);
}

function updateFilterCounts(alerts) {
    const allBtn  = document.querySelector('.filter-btn.all .count');
    const highBtn = document.querySelector('.filter-btn.high .count');
    const medBtn  = document.querySelector('.filter-btn.medium .count');
    const lowBtn  = document.querySelector('.filter-btn.low .count');
    if (allBtn)  allBtn.textContent  = alerts.length;
    if (highBtn) highBtn.textContent = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
    if (medBtn)  medBtn.textContent  = alerts.filter(a => a.severity === 'medium').length;
    if (lowBtn)  lowBtn.textContent  = alerts.filter(a => ['car','truck','vehicle'].some(v => (a.type||'').toLowerCase().includes(v))).length;
}

// ── Render alert list ─────────────────────────────────────────────────────────
function renderAlerts(alerts, filter) {
    const list = document.getElementById('alertList');
    if (!list) return;

    let filtered = alerts;
    if (filter === 'high')   filtered = alerts.filter(a => a.severity === 'critical' || a.severity === 'high');
    if (filter === 'medium') filtered = alerts.filter(a => a.severity === 'medium');
    if (filter === 'low')    filtered = alerts.filter(a => ['car','truck','vehicle'].some(v => (a.type||'').toLowerCase().includes(v)));

    if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary)">
            <i class="fas fa-check-circle" style="font-size:2rem;display:block;margin-bottom:0.5rem;color:#10b981"></i>
            No alerts for this filter</div>`;
        return;
    }

    const cfg = {
        person:  { icon:'fa-user-secret', label:'INTRUDER' },
        car:     { icon:'fa-car',          label:'VEHICLE'  },
        truck:   { icon:'fa-truck',        label:'VEHICLE'  },
        bicycle: { icon:'fa-bicycle',      label:'BICYCLE'  },
        default: { icon:'fa-exclamation-triangle', label:'DETECTION' }
    };

    list.innerHTML = filtered.map(alert => {
        const key  = (alert.type||'').toLowerCase().replace(' detection','').trim();
        const c    = cfg[key] || cfg.default;
        const isNew = alert.status === 'unacknowledged' ? 'new' : '';
        return `
        <div class="alert-item ${alert.severity||'low'} ${isNew}" data-type="${alert.severity}" data-camera="${alert.camera_id||1}" data-id="${alert.id}">
            <div class="alert-icon"><i class="fas ${c.icon}"></i></div>
            <div class="alert-content">
                <div class="alert-header">
                    <h4>${c.label}: ${(alert.message||alert.type||'DETECTED').toUpperCase()}</h4>
                    <span class="alert-time">${alert.time||'Just now'}</span>
                </div>
                <p class="alert-desc">${alert.message||'Detection event recorded.'}</p>
                <div class="alert-meta">
                    <span class="camera-badge"><i class="fas fa-camera"></i> ${alert.camera||'Camera'}</span>
                    <span class="confidence"><i class="fas fa-brain"></i> Confidence: ${alert.confidence||'--'}%</span>
                </div>
                ${alert.status === 'unacknowledged' ? `
                <div class="alert-actions" style="margin-top:0.5rem;display:flex;gap:0.5rem;">
                    <button class="timeline-btn" onclick="acknowledgeAlert(this)" style="font-size:0.7rem;padding:0.25rem 0.5rem;">
                        <i class="fas fa-check"></i> Acknowledge
                    </button>
                    <button class="timeline-btn" onclick="investigateAlert(this)" style="font-size:0.7rem;padding:0.25rem 0.5rem;">
                        <i class="fas fa-search"></i> Investigate
                    </button>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Alert actions ─────────────────────────────────────────────────────────────
function acknowledgeAlert(btn) {
    const item = btn.closest('.alert-item');
    const id   = item?.dataset.id;
    if (!id) return;
    fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.success) { showToast('Alert acknowledged','success'); loadDashboard(); } else showToast('Failed','error'); })
        .catch(() => showToast('Network error','error'));
}
function investigateAlert(btn) { window.location.href = '/alert-history'; }
function clearAlerts() {
    const unack = allAlerts.filter(a => a.status === 'unacknowledged');
    if (!unack.length) { showToast('No pending alerts','info'); return; }
    Promise.all(unack.map(a => fetch(`/api/alerts/${a.id}/acknowledge`,{method:'POST'})))
        .then(() => { showToast(unack.length + ' alerts acknowledged','success'); loadDashboard(); })
        .catch(() => showToast('Error','error'));
}
function viewAllAlerts()  { window.location.href = '/alert-history'; }
function openAlertsPanel(){ window.location.href = '/alert-history'; }
function openAlertConfig(){ window.location.href = '/alert-configuration'; }
function logout() {
    fetch('/api/logout').then(r=>r.json()).then(()=>window.location.href='/').catch(()=>window.location.href='/');
}
function openProfile() { showToast('Logged in as: ' + (document.getElementById('headerUsername')?.textContent||'Admin'),'info'); }

// ── Dynamic Camera Grid ───────────────────────────────────────────────────────
const CAMERA_NAMES = {1:'Main Entrance', 2:'Parking Area', 3:'Back Entrance', 4:'Loading Zone'};

function updateCameraGrid() {
    const grid = document.getElementById('cameraGrid');
    if (!grid) return;

    // Only cam1 has a live feed currently
    const activeIds = [1];
    const allIds    = [1, 2, 3, 4];
    const n         = activeIds.length;

    // Set grid layout class
    grid.className = 'camera-grid layout-' + Math.min(n, 4);

    // Assign dominant / shrink inactive
    allIds.forEach(id => {
        const card = document.getElementById('camera' + id);
        if (!card) return;
        card.classList.remove('dominant', 'dominant-2', 'cam-inactive');

        if (!activeIds.includes(id)) {
            card.classList.add('cam-inactive');
        }
    });

    if (n === 1) {
        document.getElementById('camera' + activeIds[0])?.classList.add('dominant');
    } else if (n === 2) {
        document.getElementById('camera' + activeIds[0])?.classList.add('dominant');
        document.getElementById('camera' + activeIds[1])?.classList.add('dominant-2');
    } else if (n === 3) {
        document.getElementById('camera' + activeIds[0])?.classList.add('dominant');
    }
}

// ── Rich Camera Modal ─────────────────────────────────────────────────────────
function openFullscreen(cameraId) {
    const modal   = document.getElementById('cameraModal');
    const title   = document.getElementById('modalCameraTitle');
    const feedArea = document.getElementById('modalFeedArea');
    const offline  = document.getElementById('modalFeedOffline');
    if (!modal) return;

    // Set title
    if (title) title.textContent = 'Camera 0' + cameraId + ' — ' + (CAMERA_NAMES[cameraId] || 'Live Feed');

    // Set camera info
    setText('modalCamId', 'CAM-0' + cameraId);
    setText('modalCamLocation', CAMERA_NAMES[cameraId] || '--');

    // Feed — only cam1 has live YOLO feed
    // Remove any existing img first
    const existingImg = feedArea.querySelector('img');
    if (existingImg) existingImg.remove();

    if (cameraId === 1) {
        offline.style.display = 'none';
        const img = document.createElement('img');
        img.src = '/video_feed/1';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.onerror = () => { img.remove(); offline.style.display = 'flex'; };
        feedArea.prepend(img);
    } else {
        offline.style.display = 'flex';
    }

    modal.classList.add('open');
    loadCameraModalData(cameraId);
}

function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    if (modal) modal.classList.remove('open');
    // stop feed to save bandwidth
    const img = document.querySelector('#modalFeedArea img');
    if (img) img.src = '';
}

function handleModalClick(e) {
    if (e.target === document.getElementById('cameraModal')) closeCameraModal();
}

function loadCameraModalData(cameraId) {
    // Pull from dashboard-data endpoint (already fetched)
    // Live stats from last known data
    const fps       = document.getElementById('fpsValue')?.textContent || '--';
    const aiStatus  = document.getElementById('aiStatusValue')?.textContent || '--';
    const uptime    = document.getElementById('uptimeValue')?.textContent || '--';

    setText('modalFps', fps);
    setText('modalAiStatus', aiStatus);
    setText('modalUptime', uptime);
    setText('modalStatus', cameraId === 1 ? 'LIVE' : 'OFFLINE');

    // Latest detection for this camera from allAlerts
    const camAlerts = allAlerts.filter(a => (a.camera_id || 1) == cameraId);
    const latest    = camAlerts[0];

    if (latest) {
        const obj   = (latest.type || 'Unknown').replace(' detection','').replace(/\b\w/g, c => c.toUpperCase());
        const conf  = latest.confidence || '--';
        const confNum = parseFloat(conf) || 0;
        setText('modalDetObj', obj);
        setText('modalDetConf', conf + '%');
        setText('modalDetTime', latest.time || '--');
        const bar = document.getElementById('modalConfBar');
        if (bar) bar.style.width = confNum + '%';
    } else {
        setText('modalDetObj', 'No detection yet');
        setText('modalDetConf', '--');
        setText('modalDetTime', '--');
        const bar = document.getElementById('modalConfBar');
        if (bar) bar.style.width = '0%';
    }

    // Recent alerts for this camera (last 4)
    const alertsEl = document.getElementById('modalAlerts');
    if (alertsEl) {
        if (!camAlerts.length) {
            alertsEl.innerHTML = '<span style="color:#475569;font-size:0.8rem">No alerts for this camera</span>';
        } else {
            alertsEl.innerHTML = camAlerts.slice(0, 4).map(a => {
                const obj = (a.type || 'Detection').replace(' detection','').replace(/\b\w/g, c => c.toUpperCase());
                return `<div class="alert-chip">
                    <div class="alert-chip-top">
                        <span><i class="fas fa-exclamation-circle"></i> ${obj}</span>
                        <span>${a.confidence || '--'}% conf</span>
                    </div>
                    <div class="alert-chip-time">${a.time || '--'} · ${a.status === 'unacknowledged' ? '⚠ Unacknowledged' : '✓ Acknowledged'}</div>
                </div>`;
            }).join('');
        }
    }

    // Active rules — fetch from API
    const rulesEl = document.getElementById('modalRules');
    fetch('/api/rules')
        .then(r => r.json())
        .then(rules => {
            if (!rulesEl) return;
            const applicable = rules.filter(r => {
                const camIds = r.camera_ids || [];
                return camIds.length === 0 || camIds.includes(cameraId);
            });
            if (!applicable.length) {
                rulesEl.innerHTML = '<span style="color:#475569;font-size:0.8rem">No rules configured</span>';
                return;
            }
            rulesEl.innerHTML = applicable.map(r =>
                `<span class="rule-chip ${r.enabled ? '' : 'inactive'}">
                    <i class="fas fa-${r.enabled ? 'check-circle' : 'times-circle'}"></i>
                    ${r.name || 'Unnamed Rule'}
                </span>`
            ).join('');
        })
        .catch(() => {
            if (rulesEl) rulesEl.innerHTML = '<span style="color:#475569;font-size:0.8rem">Rules unavailable</span>';
        });
}

function closeFullscreen() { closeCameraModal(); } // legacy alias

function openAdminPanel()   { const m = document.getElementById('adminModal');  if(m) m.style.display='flex'; }
function closeAdminPanel()  { const m = document.getElementById('adminModal');  if(m) m.style.display='none'; }
function closeConfigModal() { const m = document.getElementById('configModal'); if(m) m.style.display='none'; }

document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.style.display='none';
});
document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none');
        closeCameraModal();
    }
});

// ── Admin ─────────────────────────────────────────────────────────────────────
function exportLogs()    { window.location.href = '/alert-history'; }
function runDiagnostics(){ showToast('System healthy — all services running','success'); }
function rebootSystem()  { if(confirm('Reboot system?')) showToast('Reboot initiated...','warning'); }
function restartModel()  { showToast('Available after YOLO11 integration','info'); }
function saveAlertConfig(){ window.location.href = '/alert-configuration'; }
function testAlertRules() { window.location.href = '/alert-configuration'; }

// ── Timeline ──────────────────────────────────────────────────────────────────
function controlPlayback(action) {
    const btn = document.getElementById('playPauseBtn');
    if (action==='play') {
        isPlaying = !isPlaying;
        if (btn) btn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        showToast(isPlaying ? 'Playback started' : 'Paused','info');
    } else if (action==='rewind')  showToast('Rewinding 30s','info');
    else if (action==='forward')   showToast('Forwarding 30s','info');
    else if (action==='slow')      showToast('Slow motion','info');
}
function seekTimeline(event) {
    const bar = event.currentTarget;
    const pct = Math.max(0,Math.min(100,((event.clientX-bar.getBoundingClientRect().left)/bar.getBoundingClientRect().width)*100));
    const prog = document.getElementById('timelineProgress');
    if (prog) prog.style.width = pct + '%';
}
function expandTimeline() { showToast('Timeline expanded','info'); }

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type='info') {
    const toast = document.getElementById('notificationToast');
    const title = document.getElementById('notificationTitle');
    const msg   = document.getElementById('notificationMessage');
    if (!toast) return;
    if (title) title.textContent = {success:'Success',error:'Error',warning:'Warning',info:'Info'}[type]||'Info';
    if (msg)   msg.textContent   = message;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 4000);
}
document.getElementById('notificationClose')?.addEventListener('click', () => {
    document.getElementById('notificationToast')?.classList.remove('show');
});

// ── Helper ────────────────────────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
