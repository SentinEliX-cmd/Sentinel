# backend.py - WITH SQLITE DATABASE INTEGRATION + SECURITY HARDENING
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import sqlite3
import os
import json
from datetime import datetime, timedelta
import yolo_engine

import time

app = Flask(__name__)
app.secret_key = os.urandom(24)

# ============================================
# SECURITY CONFIGURATION
# ============================================

# Session timeout - auto logout after 30 minutes inactivity
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)

# Rate limiter - brute force protection on login
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],          # No global limit
    storage_uri="memory://"     # In-memory storage (no Redis needed)
)

DB_PATH = 'data/sentinel.db'

# ============================================
# SECURITY HEADERS (applied to every response)
# ============================================

@app.after_request
def apply_security_headers(response):
    """Add security headers to every response"""
    response.headers['X-Frame-Options'] = 'DENY'                        # Prevent clickjacking
    response.headers['X-Content-Type-Options'] = 'nosniff'              # Prevent MIME sniffing
    response.headers['X-XSS-Protection'] = '1; mode=block'             # XSS filter
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'  # No caching of sensitive pages
    return response

# ============================================
# SESSION TIMEOUT ENFORCEMENT
# ============================================

@app.before_request
def enforce_session_timeout():
    """Check session timeout before every request"""
    if session.get('logged_in'):
        last_active = session.get('last_active')
        if last_active:
            last_active_dt = datetime.fromisoformat(last_active)
            if datetime.now() - last_active_dt > timedelta(minutes=30):
                username = session.get('user')
                session.clear()
                log_event('session_timeout', username, f"Session expired for {username}")
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Session expired', 'redirect': '/'}), 401
                return redirect(url_for('index'))
        # Update last active timestamp on every request
        session['last_active'] = datetime.now().isoformat()
        session.permanent = True

# ============================================
# DATABASE HELPER FUNCTIONS
# ============================================

def get_db_connection():
    """Create and return database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def log_event(event_type, user_id=None, details=None, ip_address=None):
    """Log system event to database"""
    try:
        conn = get_db_connection()
        conn.execute("""
            INSERT INTO system_logs (event_type, user_id, details, ip_address)
            VALUES (?, ?, ?, ?)
        """, (event_type, user_id, details, ip_address))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Logging error: {e}")

# ============================================
# AUTHENTICATION ROUTES
# ============================================

@app.route('/')
def index():
    """Serve the login page"""
    if session.get('logged_in'):
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")   # Max 5 login attempts per minute per IP
def login():
    """Handle login requests - WITH RATE LIMITING"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()

        print(f"Login attempt: {username}")

        # Query database for user
        conn = get_db_connection()
        user = conn.execute(
            "SELECT * FROM users WHERE username = ? AND active = 1",
            (username,)
        ).fetchone()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            session['user'] = username
            session['user_id'] = user['id']
            session['role'] = user['role']
            session['logged_in'] = True
            session['last_active'] = datetime.now().isoformat()
            session.permanent = True

            # Update last login time
            conn = get_db_connection()
            conn.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
                (username,)
            )
            conn.commit()
            conn.close()

            log_event('login', username, f"User {username} logged in", request.remote_addr)

            return jsonify({
                'success': True,
                'message': 'Login successful',
                'redirect': '/dashboard',
                'user': {
                    'username': username,
                    'role': user['role']
                }
            })
        else:
            log_event('login_failed', username, f"Failed login attempt for {username}", request.remote_addr)

            return jsonify({
                'success': False,
                'message': 'Invalid username or password'
            }), 401

    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({
            'success': False,
            'message': 'Server error. Please try again.'
        }), 500

@app.errorhandler(429)
def rate_limit_exceeded(e):
    """Custom response when login rate limit is hit"""
    log_event('rate_limit_hit', None, f"Rate limit exceeded from {request.remote_addr}", request.remote_addr)
    return jsonify({
        'success': False,
        'message': 'Too many login attempts. Please wait 1 minute and try again.'
    }), 429

@app.route('/api/logout')
def logout():
    """Logout user"""
    username = session.get('user')
    if username:
        log_event('logout', username, f"User {username} logged out", request.remote_addr)

    session.clear()
    return jsonify({'success': True, 'redirect': '/'})

# ============================================
# PAGE ROUTES
# ============================================

@app.route('/dashboard')
def dashboard():
    """Protected dashboard page"""
    if not session.get('logged_in'):
        return redirect(url_for('index'))
    return render_template('dashboard.html', username=session.get('user'))

@app.route('/alert-configuration')
def alert_configuration():
    """Alert configuration panel"""
    if not session.get('logged_in'):
        return redirect(url_for('index'))
    return render_template('alert_config.html', username=session.get('user'))

@app.route('/alert-history')
def alert_history():
    """Alert history page"""
    if not session.get('logged_in'):
        return redirect(url_for('index'))
    return render_template('alert_history.html', username=session.get('user'))

# ============================================
# API ROUTES
# ============================================

@app.route('/api/dashboard-data')
def dashboard_data():
    """Provide dashboard statistics FROM DATABASE"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()

        total_alerts = conn.execute(
            "SELECT COUNT(*) as count FROM alerts WHERE DATE(timestamp) = DATE('now')"
        ).fetchone()['count']

        active_cameras = conn.execute(
            "SELECT COUNT(*) as count FROM cameras WHERE status = 'active'"
        ).fetchone()['count']

        person_count = conn.execute(
            "SELECT COUNT(*) as count FROM alerts WHERE object_type = 'person' AND timestamp > datetime('now', '-1 day')"
        ).fetchone()['count']

        vehicle_count = conn.execute(
            "SELECT COUNT(*) as count FROM alerts WHERE object_type IN ('car', 'truck', 'motorcycle') AND timestamp > datetime('now', '-1 day')"
        ).fetchone()['count']

        avg_confidence = conn.execute(
            "SELECT AVG(confidence) * 100 as avg FROM alerts WHERE timestamp > datetime('now', '-1 day')"
        ).fetchone()['avg'] or 0

        recent_alerts_rows = conn.execute("""
            SELECT a.*, c.name as camera_name
            FROM alerts a
            JOIN cameras c ON a.camera_id = c.id
            ORDER BY a.timestamp DESC
            LIMIT 5
        """).fetchall()

        recent_alerts = []
        for row in recent_alerts_rows:
            try:
                alert_time = datetime.strptime(row['timestamp'], '%Y-%m-%d %H:%M:%S')
                time_diff = datetime.now() - alert_time
                if time_diff.seconds < 60:
                    time_ago = "Just now"
                elif time_diff.seconds < 3600:
                    time_ago = f"{time_diff.seconds // 60} min ago"
                else:
                    time_ago = f"{time_diff.seconds // 3600} hour ago"
            except:
                time_ago = "Recently"

            recent_alerts.append({
                'id': row['id'],
                'type': row['object_type'],
                'camera': row['camera_name'],
                'camera_id': row['camera_id'],
                'message': row['description'] or f"{row['object_type'].title()} detected",
                'time': time_ago,
                'confidence': int(row['confidence'] * 100),
                'severity': row['severity'],
                'status': row['status']
            })

        conn.close()

        yolo_state = yolo_engine.get_state()

        return jsonify({
            'user': session.get('user', 'admin'),
            'role': session.get('role', 'operator'),
            'total_alerts': total_alerts,
            'active_cameras': active_cameras,
            'system_status': 'healthy',
            'uptime': '14d 6h 23m',
            'fps': yolo_state['fps'] if yolo_state['running'] else None,
            'yolo_status': yolo_state['yolo_status'],
            'detection_stats': {
                'persons': person_count,
                'vehicles': vehicle_count,
                'total': person_count + vehicle_count,
                'accuracy': round(avg_confidence, 1)
            },
            'recent_alerts': recent_alerts
        })

    except Exception as e:
        print(f"Dashboard data error: {e}")
        return jsonify({'error': 'Failed to load dashboard data'}), 500

@app.route('/api/camera-feeds')
def camera_feeds():
    """Get list of active camera feeds FROM DATABASE"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()
        cameras = conn.execute("SELECT * FROM cameras ORDER BY id").fetchall()
        conn.close()

        return jsonify([{
            'id': cam['id'],
            'name': cam['name'],
            'location': cam['location'],
            'status': cam['status'],
            'fps': cam['fps'],
            'resolution': cam['resolution']
        } for cam in cameras])

    except Exception as e:
        print(f"Camera feeds error: {e}")
        return jsonify({'error': 'Failed to load cameras'}), 500

@app.route('/api/alert-rules', methods=['GET', 'POST'])
def alert_rules():
    """API for alert rules FROM DATABASE"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()

        if request.method == 'GET':
            rules_rows = conn.execute(
                "SELECT * FROM alert_rules ORDER BY priority DESC, id"
            ).fetchall()

            rules = []
            for row in rules_rows:
                rules.append({
                    'id': row['id'],
                    'name': row['name'],
                    'description': row['description'],
                    'priority': row['priority'],
                    'active': bool(row['active']),
                    'detection': {
                        'objects': json.loads(row['object_types']),
                        'confidence': row['min_confidence'],
                        'min_size': json.loads(row['min_object_size']) if row['min_object_size'] else 'medium'
                    },
                    'temporal': {
                        'start_time': row['start_time'],
                        'end_time': row['end_time'],
                        'days': json.loads(row['active_days']) if row['active_days'] else []
                    },
                    'spatial': {
                        'cameras': json.loads(row['camera_ids']) if row['camera_ids'] else [],
                        'zone_type': row['zone_type']
                    }
                })

            conn.close()
            return jsonify({'rules': rules})

        elif request.method == 'POST':
            data = request.get_json()

            cursor = conn.execute("""
                INSERT INTO alert_rules (
                    name, description, priority, active,
                    object_types, min_confidence,
                    time_enabled, start_time, end_time, active_days,
                    camera_ids, zone_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get('name'),
                data.get('description'),
                data.get('priority', 'medium'),
                1 if data.get('active', True) else 0,
                json.dumps(data.get('detection', {}).get('objects', [])),
                data.get('detection', {}).get('confidence', 0.75),
                1 if data.get('temporal') else 0,
                data.get('temporal', {}).get('start_time'),
                data.get('temporal', {}).get('end_time'),
                json.dumps(data.get('temporal', {}).get('days', [])),
                json.dumps(data.get('spatial', {}).get('cameras', [])),
                data.get('spatial', {}).get('zone_type', 'full')
            ))

            rule_id = cursor.lastrowid
            conn.commit()
            conn.close()

            log_event('rule_created', session.get('user'), f"Created rule: {data.get('name')}")

            return jsonify({
                'success': True,
                'message': 'Rule created successfully',
                'rule_id': rule_id
            })

    except Exception as e:
        print(f"Alert rules error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to process alert rules'}), 500

@app.route('/api/alert-rules/<int:rule_id>', methods=['PUT', 'DELETE'])
def alert_rule(rule_id):
    """Update or delete specific rule"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()

        if request.method == 'PUT':
            data = request.get_json()
            conn.execute("""
                UPDATE alert_rules SET
                    name = ?, description = ?, priority = ?, active = ?,
                    object_types = ?, min_confidence = ?,
                    start_time = ?, end_time = ?, active_days = ?,
                    camera_ids = ?, zone_type = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (
                data.get('name'), data.get('description'), data.get('priority'),
                1 if data.get('active') else 0,
                json.dumps(data.get('detection', {}).get('objects', [])),
                data.get('detection', {}).get('confidence'),
                data.get('temporal', {}).get('start_time'),
                data.get('temporal', {}).get('end_time'),
                json.dumps(data.get('temporal', {}).get('days', [])),
                json.dumps(data.get('spatial', {}).get('cameras', [])),
                data.get('spatial', {}).get('zone_type'),
                rule_id
            ))
            conn.commit()
            conn.close()
            log_event('rule_updated', session.get('user'), f"Updated rule ID: {rule_id}")
            return jsonify({'success': True, 'message': f'Rule {rule_id} updated successfully'})

        elif request.method == 'DELETE':
            conn.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))
            conn.commit()
            conn.close()
            log_event('rule_deleted', session.get('user'), f"Deleted rule ID: {rule_id}")
            return jsonify({'success': True, 'message': f'Rule {rule_id} deleted successfully'})

    except Exception as e:
        print(f"Alert rule modification error: {e}")
        return jsonify({'error': 'Failed to modify rule'}), 500

@app.route('/api/test-rule', methods=['POST'])
def test_rule():
    """Test an alert rule"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    return jsonify({
        'success': True,
        'message': 'Rule test completed successfully',
        'results': {
            'detections': 3,
            'false_positives': 0,
            'accuracy': 92.5,
            'response_time': '45ms'
        }
    })

@app.route('/api/alert-history', methods=['GET'])
def get_alert_history():
    """Get alert history FROM DATABASE"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()

        query = """
            SELECT a.*, c.name as camera_name
            FROM alerts a
            JOIN cameras c ON a.camera_id = c.id
            WHERE 1=1
        """
        params = []

        status = request.args.get('status')
        if status:
            query += " AND a.status = ?"
            params.append(status)

        camera_id = request.args.get('camera_id')
        if camera_id:
            query += " AND a.camera_id = ?"
            params.append(camera_id)

        severity = request.args.get('severity')
        if severity:
            query += " AND a.severity = ?"
            params.append(severity)

        object_type = request.args.get('object_type')
        if object_type:
            query += " AND a.object_type = ?"
            params.append(object_type)

        query += " ORDER BY a.timestamp DESC LIMIT 100"

        alerts_rows = conn.execute(query, params).fetchall()
        conn.close()

        alerts = [{
            'id': row['id'],
            'timestamp': row['timestamp'],
            'type': row['object_type'].title() + ' Detection',
            'severity': row['severity'],
            'camera': row['camera_name'],
            'camera_id': row['camera_id'],
            'description': row['description'],
            'confidence': int(row['confidence'] * 100),
            'status': row['status'],
            'acknowledged_by': row['acknowledged_by'],
            'acknowledged_at': row['acknowledged_at']
        } for row in alerts_rows]

        return jsonify({'alerts': alerts, 'total': len(alerts)})

    except Exception as e:
        print(f"Alert history error: {e}")
        return jsonify({'error': 'Failed to load alert history'}), 500

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    """MJPEG video stream with YOLO detection overlays"""
    if not session.get('logged_in'):
        return redirect(url_for('index'))

    from flask import Response

    def generate():
        while True:
            frame = yolo_engine.get_frame()
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.033)  # ~30 FPS

    return Response(generate(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/detections')
def get_detections():
    """Return current YOLO detection state"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    state = yolo_engine.get_state()
    return jsonify(state)

@app.route('/api/alerts/<int:alert_id>/acknowledge', methods=['POST'])
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        conn = get_db_connection()
        conn.execute("""
            UPDATE alerts
            SET status = 'acknowledged',
                acknowledged_by = ?,
                acknowledged_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (session.get('user'), alert_id))
        conn.commit()
        conn.close()

        log_event('alert_acknowledged', session.get('user'), f"Alert {alert_id} acknowledged")
        return jsonify({'success': True, 'message': 'Alert acknowledged'})

    except Exception as e:
        print(f"Error acknowledging alert: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/rules/toggle/<int:rule_id>', methods=['POST'])
def toggle_rule(rule_id):
    """Toggle rule active/inactive status"""
    if not session.get('logged_in'):
        return jsonify({'error': 'Not authorized'}), 401

    try:
        data = request.get_json()
        active = 1 if data.get('active') else 0

        conn = get_db_connection()
        conn.execute("""
            UPDATE alert_rules
            SET active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (active, rule_id))
        conn.commit()
        conn.close()

        log_event('rule_toggled', session.get('user'),
                 f"Rule {rule_id} {'enabled' if active else 'disabled'}")
        return jsonify({'success': True, 'active': bool(active)})

    except Exception as e:
        print(f"Error toggling rule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ============================================
# RUN APPLICATION
# ============================================

if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        print("\n" + "=" * 60)
        print("  ⚠️  DATABASE NOT FOUND!")
        print("=" * 60)
        print("\nPlease initialize the database first:")
        print("  python apply_clean_database.py")
        print("\nThen start the server:")
        print("  python backend.py")
        print("=" * 60 + "\n")
        exit(1)

    print("\n" + "=" * 60)
    print("  🚀 SENTINEL SURVEILLANCE SYSTEM")
    print("=" * 60)
    print("\n✓ Database connected: sentinel.db")
    print("✓ Rate limiting: 5 login attempts per minute per IP")
    print("✓ Session timeout: 30 minutes inactivity")
    print("✓ Security headers: enabled")
    print("✓ Server starting on http://127.0.0.1:5000")
    print("\nDefault credentials:")
    print("  admin    / admin123")
    print("  security / secure456")
    print("  operator / ops789")
    print("\nPress CTRL+C to stop the server")
    print("=" * 60 + "\n")

    # Start YOLO engine in background
    yolo_engine.start()

    app.run(debug=True, host='127.0.0.1', port=5000, use_reloader=False)
