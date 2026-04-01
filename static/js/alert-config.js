// alert-config.js — Fully wired to Flask backend

// ── State ────────────────────────────────────────────────────────────────────
let editingRuleId = null;
let allRules      = [];
let pendingDeleteId = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadCamerasIntoForm();
    loadRules();
    wireLogout();
});

// ── User info ─────────────────────────────────────────────────────────────────
function loadUserInfo() {
    fetch('/api/dashboard-data')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('headerUsername');
            if (el && data.user) el.textContent = data.user.toUpperCase();
        })
        .catch(() => {});
}

// ── Logout ────────────────────────────────────────────────────────────────────
function wireLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

function logout() {
    fetch('/api/logout')
        .then(r => r.json())
        .then(() => window.location.href = '/')
        .catch(() => window.location.href = '/');
}

// ── Load cameras into form checkboxes ────────────────────────────────────────
function loadCamerasIntoForm() {
    fetch('/api/camera-feeds')
        .then(r => r.json())
        .then(cameras => {
            const container = document.getElementById('cameraCheckboxes');
            if (!container) return;
            container.innerHTML = cameras.map(cam => `
                <label class="camera-check">
                    <input type="checkbox" value="${cam.id}" checked>
                    <span class="checkmark"></span>
                    <i class="fas fa-camera"></i> ${cam.name}
                </label>
            `).join('');
        })
        .catch(() => {
            const container = document.getElementById('cameraCheckboxes');
            if (container) container.innerHTML = '<span style="color:#ef4444">Failed to load cameras</span>';
        });
}

// ── Load rules from backend ───────────────────────────────────────────────────
function loadRules() {
    fetch('/api/alert-rules')
        .then(r => r.json())
        .then(data => {
            allRules = data.rules || [];
            renderRules(allRules);
        })
        .catch(err => {
            console.error('Failed to load rules:', err);
            document.getElementById('rules-list').innerHTML =
                '<div class="rules-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i> Failed to load rules.</div>';
        });
}

// ── Render rules list ─────────────────────────────────────────────────────────
function renderRules(rules) {
    const container = document.getElementById('rules-list');
    const countEl   = document.getElementById('rules-count');
    if (!container) return;

    if (countEl) countEl.textContent = `${rules.length} rule${rules.length !== 1 ? 's' : ''}`;

    if (!rules.length) {
        container.innerHTML = `
            <div class="rules-empty">
                <i class="fas fa-shield-alt" style="font-size:2rem;color:#334155;display:block;margin-bottom:10px"></i>
                No rules configured yet.<br>
                <small style="color:#64748b">Create your first rule using the form on the left.</small>
            </div>`;
        return;
    }

    const priorityColor = { critical:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#10b981' };

    container.innerHTML = rules.map(rule => `
        <div class="rule-card priority-${rule.priority}" data-rule-id="${rule.id}">
            <div class="rule-header">
                <div class="rule-title-row">
                    <span class="rule-priority-dot" style="background:${priorityColor[rule.priority]||'#64748b'}"></span>
                    <span class="rule-title">${rule.name}</span>
                </div>
                <label class="toggle-switch" title="${rule.active ? 'Disable rule' : 'Enable rule'}">
                    <input type="checkbox" ${rule.active ? 'checked' : ''}
                           onchange="toggleRule(${rule.id}, this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div class="rule-body">
                <p class="rule-description">${rule.description || 'No description provided.'}</p>
                <div class="rule-tags">
                    <span class="rule-tag tag-priority" style="border-color:${priorityColor[rule.priority]||'#64748b'};color:${priorityColor[rule.priority]||'#64748b'}">
                        ${rule.priority.toUpperCase()}
                    </span>
                    <span class="rule-tag">
                        <i class="fas fa-crosshairs"></i>
                        ${(rule.detection?.objects || []).join(', ') || 'Any'}
                    </span>
                    <span class="rule-tag">
                        <i class="fas fa-chart-line"></i>
                        ${Math.round((rule.detection?.confidence || 0.75) * 100)}% confidence
                    </span>
                    ${rule.temporal?.start_time ? `
                    <span class="rule-tag">
                        <i class="fas fa-clock"></i>
                        ${rule.temporal.start_time} – ${rule.temporal.end_time}
                    </span>` : ''}
                </div>
            </div>

            <div class="rule-actions">
                <button class="rule-btn btn-edit" onclick="editRule(${rule.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="rule-btn btn-delete" onclick="confirmDelete(${rule.id})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
}

// ── Filter rules list (search) ────────────────────────────────────────────────
function filterRulesList(query) {
    if (!query) { renderRules(allRules); return; }
    const q = query.toLowerCase();
    renderRules(allRules.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.description||'').toLowerCase().includes(q) ||
        r.priority.toLowerCase().includes(q)
    ));
}

// ── Save / Update rule ────────────────────────────────────────────────────────
function saveRule() {
    const name = document.getElementById('ruleName')?.value?.trim();
    if (!name) {
        showNotification('Rule name is required', 'error');
        document.getElementById('ruleName')?.focus();
        return;
    }

    const objects = [];
    if (document.getElementById('detectPerson')?.checked) objects.push('person');
    if (document.getElementById('detectVehicle')?.checked) objects.push('car');
    if (document.getElementById('detectBike')?.checked)   objects.push('bicycle');
    if (document.getElementById('detectBag')?.checked)    objects.push('bag');

    if (!objects.length) {
        showNotification('Select at least one object type to detect', 'error');
        return;
    }

    const days = Array.from(document.querySelectorAll('.days-selector input:checked'))
                      .map(cb => cb.value);

    const selectedCams = Array.from(document.querySelectorAll('#cameraCheckboxes input:checked'))
                              .map(cb => parseInt(cb.value));

    const payload = {
        name,
        description: document.getElementById('ruleDescription')?.value?.trim() || '',
        priority:    document.getElementById('rulePriority')?.value || 'medium',
        active:      document.getElementById('ruleActive')?.checked ?? true,
        detection: {
            objects,
            confidence: parseInt(document.getElementById('confidenceThreshold')?.value || 75) / 100,
        },
        temporal: {
            start_time: document.getElementById('startTime')?.value || '18:00',
            end_time:   document.getElementById('endTime')?.value   || '06:00',
            days,
        },
        spatial: {
            cameras:   selectedCams,
            zone_type: document.querySelector('input[name="zoneType"]:checked')?.value || 'full',
        }
    };

    const isEditing = editingRuleId !== null;
    const url    = isEditing ? `/api/alert-rules/${editingRuleId}` : '/api/alert-rules';
    const method = isEditing ? 'PUT' : 'POST';

    const btn = document.getElementById('saveRuleBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        if (data.success || data.rule_id) {
            showNotification(isEditing ? 'Rule updated!' : 'Rule created!', 'success');
            resetForm();
            loadRules();
        } else {
            showNotification(data.error || 'Failed to save rule', 'error');
        }
    })
    .catch(() => showNotification('Network error — is the server running?', 'error'))
    .finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Rule'; }
    });
}

// ── Edit rule — load data into form ──────────────────────────────────────────
function editRule(ruleId) {
    const rule = allRules.find(r => r.id === ruleId);
    if (!rule) return;

    editingRuleId = ruleId;

    document.getElementById('ruleName').value        = rule.name;
    document.getElementById('ruleDescription').value = rule.description || '';
    document.getElementById('rulePriority').value    = rule.priority;
    document.getElementById('ruleActive').checked    = rule.active;

    const conf = Math.round((rule.detection?.confidence || 0.75) * 100);
    document.getElementById('confidenceThreshold').value = conf;
    document.getElementById('confidenceValue').textContent = conf + '%';

    document.getElementById('startTime').value = rule.temporal?.start_time || '18:00';
    document.getElementById('endTime').value   = rule.temporal?.end_time   || '06:00';

    // Object checkboxes
    const objects = rule.detection?.objects || [];
    document.getElementById('detectPerson').checked  = objects.includes('person');
    document.getElementById('detectVehicle').checked = objects.includes('car');
    document.getElementById('detectBike').checked    = objects.includes('bicycle');
    document.getElementById('detectBag').checked     = objects.includes('bag');

    // Days
    const days = rule.temporal?.days || [];
    document.querySelectorAll('.days-selector input').forEach(cb => {
        cb.checked = days.includes(cb.value);
    });

    // Camera checkboxes
    const cams = rule.spatial?.cameras || [];
    document.querySelectorAll('#cameraCheckboxes input').forEach(cb => {
        cb.checked = cams.includes(parseInt(cb.value));
    });

    // Zone type
    const zone = rule.spatial?.zone_type || 'full';
    const zoneInput = document.querySelector(`input[name="zoneType"][value="${zone}"]`);
    if (zoneInput) zoneInput.checked = true;

    // Update save button to show editing state
    const btn = document.getElementById('saveRuleBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Update Rule';

    // Scroll to form
    document.querySelector('.rule-creation-panel')?.scrollIntoView({ behavior: 'smooth' });
    showNotification(`Editing: ${rule.name}`, 'info');
}

// ── Toggle rule active/inactive ───────────────────────────────────────────────
function toggleRule(ruleId, active) {
    fetch(`/api/rules/toggle/${ruleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showNotification(`Rule ${active ? 'enabled' : 'disabled'}`, 'success');
            // Update local state without full reload
            const rule = allRules.find(r => r.id === ruleId);
            if (rule) rule.active = active;
        } else {
            showNotification('Failed to toggle rule', 'error');
            loadRules(); // reload to reset toggle state
        }
    })
    .catch(() => {
        showNotification('Network error', 'error');
        loadRules();
    });
}

// ── Delete rule ───────────────────────────────────────────────────────────────
function confirmDelete(ruleId) {
    pendingDeleteId = ruleId;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'flex';

    document.getElementById('confirmDeleteBtn').onclick = () => {
        deleteRule(ruleId);
        closeDeleteModal();
    };
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
    pendingDeleteId = null;
}

function deleteRule(ruleId) {
    fetch(`/api/alert-rules/${ruleId}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showNotification('Rule deleted', 'success');
                if (editingRuleId === ruleId) resetForm();
                loadRules();
            } else {
                showNotification('Failed to delete rule', 'error');
            }
        })
        .catch(() => showNotification('Network error', 'error'));
}

// ── Reset form ────────────────────────────────────────────────────────────────
function resetForm() {
    editingRuleId = null;

    document.getElementById('ruleName').value        = '';
    document.getElementById('ruleDescription').value = '';
    document.getElementById('rulePriority').value    = 'medium';
    document.getElementById('ruleActive').checked    = true;
    document.getElementById('confidenceThreshold').value = 75;
    document.getElementById('confidenceValue').textContent = '75%';
    document.getElementById('startTime').value = '18:00';
    document.getElementById('endTime').value   = '06:00';
    document.getElementById('loiterDuration').value = 120;
    document.getElementById('loiterValue').textContent = '120s';

    document.getElementById('detectPerson').checked  = true;
    document.getElementById('detectVehicle').checked = false;
    document.getElementById('detectBike').checked    = false;
    document.getElementById('detectBag').checked     = false;

    document.querySelectorAll('.days-selector input').forEach((cb, i) => {
        cb.checked = i < 5; // Mon–Fri
    });

    document.querySelectorAll('#cameraCheckboxes input').forEach(cb => {
        cb.checked = true;
    });

    document.querySelector('input[name="zoneType"][value="full"]').checked = true;

    const btn = document.getElementById('saveRuleBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Save Rule';
}

// ── Notification ──────────────────────────────────────────────────────────────
function showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.style.cssText = `
        position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;
        font-weight:500;z-index:9999;opacity:0;transform:translateY(-10px);
        transition:all 0.3s ease;font-family:inherit;font-size:14px;
        background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#3b82f6'};
        color:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);
    `;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 50);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}
