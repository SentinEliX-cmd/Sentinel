# SENTINEL — Context-Aware CCTV Surveillance System

An intelligent, web-based surveillance platform with real-time GPU-accelerated object detection, context-aware anomaly alerting, and comprehensive forensic audit logging. Designed for urban neighbourhood surveillance with role-based access control and advanced rule configuration.

**Author**: Eli Kipkorir 
---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Setup Instructions](#setup-instructions)
- [Usage Guide](#usage-guide)
- [API Endpoints](#api-endpoints)
- [Security Features](#security-features)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Overview

SENTINEL is a comprehensive surveillance management system that combines cutting-edge computer vision (YOLO11) with intelligent rule-based alerting. The system processes real-time video feeds from IP cameras, detects objects of interest, applies context-aware rules, and alerts operators to anomalies.

### Core Capabilities:
- **Real-time Detection**: GPU-accelerated YOLO11 inference at <15ms per frame
- **Object Tracking**: Persistent identification of persons, vehicles, and suspicious items
- **Context-Aware Rules**: Temporal, spatial, and behavioral rule engines
- **Multi-Camera Support**: Manage multiple simultaneous camera feeds
- **Forensic Audit Trail**: Complete system event logging and alert history
- **Role-Based Access**: Admin, Security, and Operator user roles with granular permissions
- **Secure Authentication**: Password hashing, rate limiting, and session timeout enforcement

---

## Key Features

### Detection & Tracking
- **YOLO11 Neural Network**: Real-time detection of 80 object classes
- **Tracked Classes**: Person, car, motorcycle, bus, truck, backpack, suitcase, and more
- **Configurable Frame Skip**: Balance detection accuracy vs. processing speed
- **JPEG Compression**: Adjustable image quality for bandwidth optimization

### Rule Engine
- **Temporal Rules**: Time-of-day sensitivity (e.g., different alert thresholds for night operations)
- **Spatial Rules**: Zone-based geofencing and area restrictions
- **Behavioral Rules**: Loitering detection, duration thresholds, motion patterns

### Dashboard Features
- **Live Video Stream**: Real-time feed with overlaid detection bboxes
- **FPS Monitoring**: Frame rate and inference speed metrics
- **Alert Status Indicator**: Visual indicators for active/inactive alerts
- **Responsive Design**: Mobile-friendly interface

### Alert Management
- **Custom Rule Configuration**: Create, update, delete alert rules via web UI
- **Alert History**: Complete forensic record with timestamps and details
- **Export Functionality**: Download alerts and logs for external analysis
- **Real-time Notifications**: Instant alerts to dashboard (based on configured rules)

### Security & Compliance
- **Session Management**: 30-minute auto-logout with last-activity tracking
- **Rate Limiting**: Brute-force protection on login endpoints
- **Security Headers**: Prevention of clickjacking, MIME sniffing, and XSS attacks
- **Secure Password Storage**: Werkzeug password hashing (not plaintext)
- **System Audit Logging**: All user actions and system events logged to database

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    SURVEILLANCE PIPELINE                      │
└──────────────────────────────────────────────────────────────┘

[IP Cameras / Webcam Feeds] (RTSP/HTTP)
        │
        ▼ (via OpenCV)
┌──────────────────────────────┐
│   YOLO11 Detection Engine    │
│   (GPU Inference)            │
│   • <15ms per frame          │
│   • 80 object classes        │
│   • Bounding boxes + scores  │
└──────────────────────────────┘
        │
        ▼ (JSON detection data)
┌──────────────────────────────┐
│   Context Rule Engine        │
│   ├── Temporal Analysis      │
│   ├── Spatial Analysis       │
│   └── Behavioral Analysis    │
└──────────────────────────────┘
        │
        ▼ (qualified alerts)
┌──────────────────────────────────────────────┐
│           SQLite Database                    │
│   ├── Users & Roles                          │
│   ├── Camera Configurations                  │
│   ├── Alert Rules                            │
│   ├── Detection History                      │
│   ├── Alert History                          │
│   └── System Audit Logs                      │
└──────────────────────────────────────────────┘
        │
        ├───────────────────────────────────┬────────────────┐
        ▼                                   ▼                ▼
┌──────────────────┐          ┌──────────────────┐  ┌──────────────┐
│  Flask Backend   │          │ Web Dashboard    │  │ REST API     │
│  • Routes        │  ◄───►  │ • Live feed      │  │ • JSON       │
│  • API Handlers  │   AJAX  │ • Rules config   │  │ • Endpoints  │
│  • Auth Logic    │          │ • Alert history  │  │ • Data       │
└──────────────────┘          └──────────────────┘  └──────────────┘
```

### Component Details:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Video Input** | OpenCV + RTSP/HTTP | Stream IP cameras or webcams |
| **Detection** | YOLO11 + PyTorch + CUDA | Real-time object recognition |
| **Backend** | Flask 2.x + SQLite3 | Web server, API, session management |
| **Frontend** | HTML5/CSS3 + JavaScript | Responsive web interface |
| **Database** | SQLite | Persistent storage (no external DB needed) |
| **Security** | Werkzeug + Flask-Limiter | Password hashing, rate limiting |

---

## Project Structure

```
sentinel-clean/
├── backend_new.py              # Main Flask application (primary)
├── backend.py                  # Deprecated/legacy Flask app
├── yolo_engine.py              # YOLO11 detection + video processing
├── apply_clean_database.py     # Database initialization script
├── fix_rule.py                 # Utility for alert rule management
├── requirements.txt            # Python dependencies
├── yolo11n.pt                  # YOLO11 Nano model weights (~27MB)
├── README.md                   # This file
│
├── data/
│   ├── database_schema.sql     # Full schema definition with sample data
│   ├── database_clean.sql      # Minimal schema (no sample data)
│   └── sentinel.db             # SQLite database (auto-created on init)
│
├── templates/                  # Jinja2 HTML templates
│   ├── login.html              # Secure login page with CSRF protection
│   ├── dashboard.html          # Main live surveillance dashboard
│   ├── alert_config.html       # Alert rule CRUD interface
│   └── alert_history.html      # Forensic alert browsing & export
│
├── static/
│   ├── css/
│   │   ├── login.css           # Login page styling
│   │   ├── sentinel-theme.css  # Global theme & variables
│   │   ├── dashboard.css       # Dashboard layout & components
│   │   ├── alert-config.css    # Alert config form styles
│   │   └── alert-history.css   # Alert history table styles
│   │
│   └── js/
│       ├── login.js            # Form validation & auth logic
│       ├── dashboard.js        # Real-time video updates, stats
│       ├── alert-config.js     # Rule CRUD with form handling
│       └── alert-history.js    # Table filtering & CSV export
│
├── Images/                     # Image assets for alerts/documentation
│   └── sentinel-alerts-*.csv   # Exported alert history
│
└── DEMO/                       # Demo materials (if any)
```

### File Descriptions:

**Python Files:**
- **backend_new.py**: Primary Flask application with routes, API endpoints, authentication, session management, and security configuration. This is the entry point for running the system.
- **yolo_engine.py**: YOLO11 integration module handling video stream processing, frame capture, object detection, and frame buffering for the dashboard.
- **apply_clean_database.py**: Database initialization utility that creates the schema and default users without sample data.
- **fix_rule.py**: Utility script for managing alert rules outside the web interface.

**Templates:**
- All templates use Jinja2 templating with Bootstrap styling for responsive, mobile-friendly interfaces.
- Session-based authentication ensures only logged-in users access protected pages.

**Static Assets:**
- Modular CSS architecture with a global theme file and component-specific stylesheets.
- JavaScript files handle client-side logic, form validation, real-time updates via AJAX, and data export.

---

## Requirements

### Hardware
- **CPU**: Intel i5/i7 or AMD Ryzen 5/7+
- **RAM**: 8GB minimum (16GB recommended for smooth operation)
- **GPU**: NVIDIA CUDA-compatible GPU (RTX 3050 or better recommended for <15ms inference)
  - For CPU-only: Inference will be slower (~200-500ms per frame)
- **Storage**: 5GB minimum (for database, logs, and model weights)

### Software
- **Python**: 3.10 or later
- **Operating System**: Windows, Linux, or macOS
- **Camera**: IP camera with RTSP support OR webcam

### Python Dependencies
Install all dependencies from `requirements.txt`:

```bash
pip install -r requirements.txt
```

**Main packages:**
- `flask` - Web framework
- `flask-limiter` - Rate limiting for brute-force protection
- `werkzeug` - Secure password hashing
- `ultralytics` - YOLO11 framework
- `opencv-python` - Video processing
- `torch` / `torch-cuda` - Deep learning backend (GPU support)

---

## Setup Instructions

### Step 1: Clone/Download the Repository

```bash
cd path/to/sentinel-clean
```

### Step 2: Create a Virtual Environment (Recommended)

```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

**For GPU Support (NVIDIA CUDA):**
If you have an NVIDIA GPU, install the CUDA-enabled PyTorch for faster inference:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Step 4: Initialize the Database

```bash
python apply_clean_database.py
```

**Prompts:**
- Asks to delete existing database (if it exists)
- Creates `data/sentinel.db` with schema and default users
- No sample data is added (starts clean)

**Output:**
```
============================================================
  CLEAN DATABASE SETUP
============================================================

Creating clean database: data/sentinel.db
Created users table
Created cameras table
Created alert_rules table
Created detections table
Created alerts table
Created system_logs table

Inserted default users (admin, security, operator)
Database ready!
```

### Step 5: Configure Camera Source (Optional)

Edit `yolo_engine.py` line ~10:

```python
CAMERA_SOURCE = "http://192.168.100.3:8080/video"  # ← Replace with your IP camera URL
```

**Common camera formats:**
- IP Camera: `http://192.168.1.100:8080/video`
- RTSP Stream: `rtsp://192.168.1.100:554/stream`
- USB Webcam: `0` (integer for device index)

### Step 6: Run the Application

```bash
python backend_new.py
```

**Expected output:**
```
 * Running on http://127.0.0.1:5000
 * Debug mode: on
Press CTRL+C to quit
```

### Step 7: Access the Dashboard

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## Usage Guide

### 1. Login

Default credentials (WARNING: **Change in production!**):

| Username   | Password    | Role      | Permissions |
|------------|-------------|-----------|-------------|
| admin      | admin123    | Admin     | Full system access |
| security   | secure456   | Security  | Rules, alerts, history |
| operator   | ops789      | Operator  | View-only dashboard |

**Session behavior:**
- Sessions auto-logout after 30 minutes of inactivity
- Passwords are hashed using Werkzeug's secure hashing (PBKDF2)
- Rate limiting (5 failed attempts) triggers temporary lockout

### 2. Dashboard

**Features available on the dashboard:**
- **Live Video Feed**: Real-time camera stream with YOLO11 detection bboxes
- **FPS Meter**: Current frame rate and inference speed (ms/frame)
- **Detection Counter**: Count of detected objects by class
- **Alert Status**: Shows active/inactive alert rules
- **Stats Panel**: Summary of today's detections and alerts

**Keyboard Shortcuts:**
- `R` - Refresh video feed
- `P` - Pause/resume detection

### 3. Alert Rules Configuration

Navigate to **Rules** tab:
- **View Rules**: List all configured alert rules
- **Add Rule**: Create new rule with:
  - Rule name & description
  - Trigger condition (object class, confidence threshold)
  - Temporal constraints (time windows)
  - Spatial constraints (zones)
  - Action (log, email, webhook)
- **Edit Rule**: Update existing rules
- **Delete Rule**: Remove rules (soft-delete, keeps history)

**Example rule:**
```
Name: "Night-time Person Detection"
Trigger: Person detected with confidence > 80%
Temporal: 18:00 - 06:00 (active during night)
Spatial: Main entrance zone
Action: Log + Email notification
```

### 4. Alert History

Navigate to **History** tab:
- **Browse Alerts**: Paginated table of all past alerts
- **Filter Options**:
  - Date range
  - Alert type / rule name
  - Severity level
- **Export**: Download
 as CSV for external analysis
- **View Details**: Click an alert to see:
  - Triggered detection bbox image
  - Exact timestamp
  - Triggering rule
  - User actions (acknowledged by operator)

### 5. User Management (Admin Only)

Navigate to **Users** tab:
- **Add User**: Create new user account with role assignment
- **Edit User**: Change password, role, permissions
- **Deactivate User**: Disable account (keep history intact)
- **View Login Log**: Audit who accessed the system and when

---

## API Endpoints

All endpoints require user authentication via session cookie. Returns JSON responses.

### Authentication

**POST `/api/login`**
- Request: `{username, password}`
- Response: `{success: bool, message: string}`

**GET `/api/logout`**
- Response: Clears session, redirects to login

### Dashboard Data

**GET `/api/video-feed`**
- Returns: Current JPEG frame + detection metadata
- Response: `{frame: base64, detections: [{class, confidence, bbox}], fps: int}`

**GET `/api/stats`**
- Returns: Today's detection summary
- Response: `{total_detections: int, people: int, vehicles: int, alerts_triggered: int}`

### Alert Rules

**GET `/api/rules`**
- Returns: All alert rules
- Response: `[{id, name, condition, temporal, spatial, enabled}]`

**POST `/api/rules`**
- Request: Rule configuration object
- Response: `{id, created_at, message}`

**PUT `/api/rules/<id>`**
- Request: Updated rule object
- Response: `{success: bool, message}`

**DELETE `/api/rules/<id>`**
- Response: Soft-delete (marks deleted but keeps history)

### Alert History

**GET `/api/alerts`**
- Query parameters: `?start_date=2025-01-01&end_date=2025-01-31&rule_id=5`
- Returns: Matching alerts with pagination
- Response: `{total: int, page: int, alerts: [...]}`

**GET `/api/alerts/<id>`**
- Returns: Detailed alert with snapshot image
- Response: `{id, rule_id, timestamp, image: base64, details}`

**POST `/api/alerts/<id>/acknowledge`**
- Marks alert as reviewed by operator
- Response: `{acknowledged_at, acknowledged_by}`

---

## Security Features

### Authentication & Authorization
- [x] **Secure Password Storage**: Werkzeug PBKDF2 with salt
- [x] **Session Management**: Flask sessions with 30-minute timeout
- [x] **Role-Based Access Control**: Admin/Security/Operator levels
- [x] **Rate Limiting**: 5 failed login attempts trigger temporary lockout

### HTTP Security
- [x] **Security Headers**:
  - `X-Frame-Options: DENY` - Prevent clickjacking
  - `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
  - `X-XSS-Protection: 1; mode=block` - Enable XSS filter
  - `Cache-Control: no-store, no-cache` - Prevent caching sensitive data
  - `Referrer-Policy: strict-origin-when-cross-origin`

### Database Security
- [x] **Parameterized Queries**: All queries use placeholders to prevent SQL injection
- [x] **Audit Logging**: All user actions recorded in `system_logs` table
- [x] **Data Retention**: Completed alerts kept for forensic analysis

### API Security
- [x] **Session-based Auth**: Every API request validated against session cookie
- [x] **IP Tracking**: System logs record client IP for each action
- [x] **Error Handling**: Generic error messages (no database schema leakage)

---

## Configuration

### yolo_engine.py

```python
# Line 10 - Camera source (RTSP or HTTP)
CAMERA_SOURCE = "http://192.168.100.3:8080/video"

# Line 14 - Database path
DB_PATH = 'data/sentinel.db'

# Line 15 - YOLO model path
MODEL_PATH = 'yolo11n.pt'

# Line 18-19 - Performance tuning
FRAME_SKIP = 4              # Skip every Nth frame (higher = faster)
JPEG_QUALITY = 60           # Image compression (50-70 recommended)

# Line 22 - Tracked object classes
TRACKED_CLASSES = {
    0:  'person',
    2:  'car',
    3:  'motorcycle',
    ...
}
```

### backend_new.py

```python
# Line 17 - Session timeout (minutes)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)

# Line 25 - Database path
DB_PATH = 'data/sentinel.db'
```

### Performance Tuning

**For faster inference (lower accuracy):**
```python
FRAME_SKIP = 8              # Process every 8th frame
JPEG_QUALITY = 40           # Lower compression
```

**For better accuracy (slower inference):**
```python
FRAME_SKIP = 1              # Process every frame
JPEG_QUALITY = 85           # Higher quality
```

---

## Troubleshooting

### Issue: "No module named 'flask'"

**Solution**: Install dependencies
```bash
pip install -r requirements.txt
```

### Issue: YOLO11 model not found

**Solution**: Ensure `yolo11n.pt` exists in project root. Download if missing:
```bash
from ultralytics import YOLO
YOLO('yolo11n.pt')  # Auto-downloads on first run
```

### Issue: Camera connection timeout

**Solution**: Verify camera URL and network connectivity
```bash
# Test URL directly
curl http://192.168.100.3:8080/video

# Or ping the IP
ping 192.168.100.3
```

**Edit `yolo_engine.py`:**
```python
CAMERA_SOURCE = "0"  # Try default webcam instead
```

### Issue: GPU not detected (slow inference)

**Solution**: Install CUDA-enabled PyTorch
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

Verify GPU:
```python
import torch
print(torch.cuda.is_available())  # Should return True
```

### Issue: Database locked error

**Solution**: Close other connections to `data/sentinel.db`:
```bash
# Windows: Kill Python processes
taskkill /IM python.exe /F

# Linux/macOS: Kill Python processes
pkill -f python
```

Restart the application.

### Issue: Session timeout too aggressive

**Solution**: Adjust in `backend_new.py`:
```python
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=120)  # 2 hours
```

### Issue: Login page styling broken

**Solution**: Clear browser cache or hard-refresh
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (macOS)
```

---

## Deployment Checklist

Before deploying to production:

- [ ] Change all default passwords (`admin123`, `secure456`, `ops789`)
- [ ] Set Flask `DEBUG = False` in `backend_new.py`
- [ ] Generate a strong random `secret_key`
- [ ] Configure email credentials if email alerts are enabled
- [ ] Set up HTTPS/SSL certificates
- [ ] Test database backups and recovery procedures
- [ ] Configure firewall rules (allow port 5000 from trusted networks only)
- [ ] Set up system logging and monitoring
- [ ] Test all alert rules before live deployment
- [ ] Document camera IP addresses and RTSP URLs

---

## License & Attribution

**Author**: Eli  Kipkorir  
**Academic Use Only**: This project is provided for educational purposes. Modify and redistribute as needed for coursework.

---

## Support & Contributions

For issues, questions, or improvements:
1. Review the [Troubleshooting](#troubleshooting) section
2. Check console output for error messages
3. Review `data/sentinel.db` system_logs table for audit trail
4. Contact your instructor or project supervisor

---

## Technical References

- **YOLO11**: https://github.com/ultralytics/ultralytics
- **Flask**: https://flask.palletsprojects.com/
- **SQLite**: https://www.sqlite.org/
- **OpenCV**: https://opencv.org/

---

**Last Updated**: April 2025  
**Status**: Production Ready (v1.0)  
**Test Coverage**: Manual testing complete, unit tests pending
                                │
                                ▼
                        [Alert History / Audit Log]
```

---

## Context-Aware Detection Logic

The system does not alert on every detection. Each YOLO detection passes through
three context filters before an alert is generated:

1. **Temporal** — Is this detection occurring during a sensitive time window?
   e.g. person detected at 02:14 carries higher weight than at 14:00

2. **Spatial** — Is the detected object in a restricted zone?
   e.g. back entrance vs main entrance have different risk profiles

3. **Behavioural** — Has the object exceeded duration thresholds?
   e.g. person stationary >2 minutes triggers loitering rule

Only detections that satisfy the active rule conditions generate database alerts.

---

## Key Features

- **Real-time YOLO11 inference** with CUDA GPU acceleration
- **Context-aware rule engine** — temporal, spatial, and behavioural filtering
- **Role-based access control** — admin, security, operator tiers
- **Forensic audit trail** — every alert, acknowledgment and login logged
- **Alert acknowledgment workflow** — with operator attribution and timestamp
- **CSV export** of alert history for reporting
- **Configurable detection rules** — created and managed through the dashboard UI
- **Privacy-preserving design** — configurable retention, audit logging

---

This project addresses the gap between passive CCTV recording and
active, intelligent threat detection in urban neighbourhood surveillance.
The context-awareness layer distinguishes this system from conventional
motion-detection approaches by applying temporal, spatial, and behavioural
reasoning before escalating any alert.
