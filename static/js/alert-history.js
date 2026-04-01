// alert-history.js — Fully wired to Flask backend

// ── State ────────────────────────────────────────────────────────────────────
let currentFilters = {};
let allAlerts      = [];

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadCameras();
    loadAlertHistory();
    wireSidebarFilters();
});

// ── User info ────────────────────────────────────────────────────────────────
function loadUserInfo() {
    fetch('/api/dashboard-data')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('navUserAvatar');
            if (el && data.user) el.textContent = data.user.toUpperCase().slice(0, 2);
        })
        .catch(() => {});
}

// ── Load cameras into filter dropdowns ───────────────────────────────────────
function loadCameras() {
    fetch('/api/camera-feeds')
        .then(r => r.json())
        .then(cameras => {
            // Populate filter select
            const sel = document.getElementById('filter-camera');
            if (sel) {
                cameras.forEach(cam => {
                    const opt = document.createElement('option');
                    opt.value = cam.id;
                    opt.textContent = cam.name;
                    sel.appendChild(opt);
                });
            }

            // Populate sidebar camera links
            const container = document.getElementById('camera-filter-links');
            if (container) {
                cameras.forEach(cam => {
                    const a = document.createElement('a');
                    a.href = '#';
                    a.className = 'sidebar-link cam-filter';
                    a.dataset.camera = cam.id;
                    a.innerHTML = `<i class="fas fa-camera"></i> ${cam.name.split(' - ')[1] || cam.name}`;
                    a.addEventListener('click', e => {
                        e.preventDefault();
                        document.querySelectorAll('.cam-filter').forEach(l => l.classList.remove('active'));
                        a.classList.add('active');
                        currentFilters.camera_id = cam.id;
                        loadAlertHistory();
                    });
                    container.appendChild(a);
                });
            }
        })
        .catch(err => console.error('Failed to load cameras:', err));
}

// ── Wire sidebar status filters ───────────────────────────────────────────────
function wireSidebarFilters() {
    document.querySelectorAll('.filter-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.filter-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const status = link.dataset.status;
            if (status) {
                currentFilters.status = status;
                document.getElementById('filter-status').value = status;
            } else {
                delete currentFilters.status;
                document.getElementById('filter-status').value = '';
            }
            loadAlertHistory();
        });
    });
}

// ── Load alert history from API ───────────────────────────────────────────────
function loadAlertHistory(filters = currentFilters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });

    const tbody = document.getElementById('alert-history-table');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    fetch(`/api/alert-history?${params}`)
        .then(r => r.json())
        .then(data => {
            allAlerts = data.alerts || [];
            renderTable(allAlerts);
            updateCounts(data);
        })
        .catch(err => {
            console.error('Failed to load history:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fas fa-exclamation-triangle"></i> Failed to load alerts. Is the server running?</td></tr>';
        });
}

// ── Render table rows ─────────────────────────────────────────────────────────
function renderTable(alerts) {
    const tbody = document.getElementById('alert-history-table');
    if (!tbody) return;

    if (!alerts || alerts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i class="fas fa-check-circle" style="color:#10b981;font-size:2rem;display:block;margin-bottom:8px"></i>
                    No alerts found for the selected filters.
                </td>
            </tr>`;
        return;
    }

    const sevColor = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#10b981' };

    tbody.innerHTML = alerts.map(alert => `
        <tr data-id="${alert.id}">
            <td class="time-cell">${formatTime(alert.timestamp)}</td>
            <td>
                <span class="object-badge object-${alert.type.toLowerCase().includes('person') ? 'person' : 'vehicle'}">
                    ${alert.type}
                </span>
            </td>
            <td>
                <span class="severity-badge" style="background:${sevColor[alert.severity] || '#64748b'}20;color:${sevColor[alert.severity] || '#64748b'};border:1px solid ${sevColor[alert.severity] || '#64748b'}40;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">
                    ${alert.severity}
                </span>
            </td>
            <td class="camera-cell">${alert.camera || '—'}</td>
            <td class="rule-cell">${alert.description || '—'}</td>
            <td class="confidence-cell">${alert.confidence}%</td>
            <td>
                <span class="status-badge status-${alert.status}">
                    ${alert.status === 'acknowledged' ? '<i class="fas fa-check"></i> Acknowledged' : '<i class="fas fa-clock"></i> Pending'}
                </span>
            </td>
            <td class="actions-cell">
                ${alert.status === 'unacknowledged'
                    ? `<button class="btn-sm btn-ack" onclick="acknowledgeAlert(${alert.id})">
                           <i class="fas fa-check"></i> Acknowledge
                       </button>`
                    : `<span class="ack-info">
                           ${alert.acknowledged_by || ''}
                           <br><small>${formatTime(alert.acknowledged_at)}</small>
                       </span>`
                }
            </td>
        </tr>
    `).join('');

    document.getElementById('results-count').textContent =
        `Showing ${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`;
}

// ── Update sidebar counts ─────────────────────────────────────────────────────
function updateCounts(data) {
    const alerts = data.alerts || [];
    document.getElementById('count-all').textContent  = alerts.length;
    document.getElementById('count-unack').textContent = alerts.filter(a => a.status === 'unacknowledged').length;
    document.getElementById('count-ack').textContent   = alerts.filter(a => a.status === 'acknowledged').length;
}

// ── Apply dropdown filters ────────────────────────────────────────────────────
function applyFilters() {
    currentFilters = {};
    const type     = document.getElementById('filter-type')?.value;
    const severity = document.getElementById('filter-severity')?.value;
    const camera   = document.getElementById('filter-camera')?.value;
    const status   = document.getElementById('filter-status')?.value;

    if (type)     currentFilters.object_type = type;
    if (severity) currentFilters.severity    = severity;
    if (camera)   currentFilters.camera_id   = camera;
    if (status)   currentFilters.status      = status;

    loadAlertHistory(currentFilters);
}

function clearFilters() {
    currentFilters = {};
    ['filter-type','filter-severity','filter-camera','filter-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('.filter-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.filter-link[data-status=""]')?.classList.add('active');
    loadAlertHistory({});
}

function refreshHistory() {
    loadAlertHistory(currentFilters);
}

// ── Acknowledge alert ─────────────────────────────────────────────────────────
function acknowledgeAlert(alertId) {
    fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showNotification('Alert acknowledged', 'success');
                loadAlertHistory(currentFilters);
            } else {
                showNotification('Failed to acknowledge', 'error');
            }
        })
        .catch(() => showNotification('Network error', 'error'));
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportAlerts() {
    if (!allAlerts.length) {
        showNotification('No alerts to export', 'info');
        return;
    }
    const headers = ['ID','Timestamp','Type','Severity','Camera','Description','Confidence','Status','Acknowledged By','Acknowledged At'];
    const rows = allAlerts.map(a => [
        a.id, a.timestamp, a.type, a.severity, a.camera,
        `"${(a.description||'').replace(/"/g,'""')}"`,
        a.confidence, a.status, a.acknowledged_by||'', a.acknowledged_at||''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `sentinel-alerts-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showNotification('CSV exported', 'success');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts) {
    if (!ts) return '—';
    try {
        const d = new Date(ts);
        return d.toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch { return ts; }
}

function showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.textContent = message;
    el.style.cssText = `
        position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;
        font-weight:500;z-index:9999;opacity:0;transform:translateY(-10px);
        transition:all 0.3s ease;
        background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#3b82f6'};
        color:white;box-shadow:0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity='1'; el.style.transform='translateY(0)'; }, 50);
    setTimeout(() => {
        el.style.opacity='0';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}
