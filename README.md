# SENTINEL — Context-Aware CCTV Surveillance System

A web-based intelligent surveillance dashboard with real-time object detection,
context-aware anomaly alerting, and forensic audit logging for urban neighbourhood surveillance.

**By Eli Martin Kipkorir | DCF-01-0171/2025 | Zetech University**

---

## Project Structure

```
surveillance-dashboard/
├── backend.py                  # Flask application (routes, API, sessions)
├── requirements.txt            # Python dependencies
├── apply_clean_database.py     # Database initialisation script
├── README.md                   # This file
├── data/
│   ├── database_schema.sql     # Full schema with sample data
│   ├── database_clean.sql      # Clean schema (no sample data)
│   └── sentinel.db             # SQLite database (generated on init)
├── templates/
│   ├── login.html              # Secure login page
│   ├── dashboard.html          # Main surveillance dashboard
│   ├── alert_config.html       # Alert rule configuration
│   └── alert_history.html      # Forensic alert history
└── static/
    ├── css/
    │   ├── login.css           # Login page styles
    │   ├── dashboard.css       # Dashboard styles
    │   ├── alert-config.css    # Alert config styles
    │   └── alert-history.css   # Alert history styles
    └── js/
        ├── login.js            # Login authentication logic
        ├── dashboard.js        # Dashboard real-time updates
        ├── alert-config.js     # Rule management (CRUD)
        └── alert-history.js    # History filtering and export
```

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

> Requires Python 3.10+ and CUDA-compatible GPU for YOLO11 inference (NVIDIA RTX 3050 recommended minimum).

### 2. Initialise the Database

```bash
python apply_clean_database.py
```

This creates `data/sentinel.db` with:
- 3 default user accounts
- 4 camera configurations
- No sample alerts or rules (system starts clean)

### 3. Run the Application

```bash
python backend.py
```

Server starts at: `http://127.0.0.1:5000`

---

## Default Login Credentials

| Username   | Password    | Role      |
|------------|-------------|-----------|
| admin      | admin123    | Admin     |
| security   | secure456   | Security  |
| operator   | ops789      | Operator  |

> Change all default passwords before any real-world deployment.

---

## System Architecture

```
[IP Cameras / Webcam]
        │
        ▼ RTSP / OpenCV
[YOLO11 Detection Engine]  ← GPU inference (RTX 3050, <15ms/frame)
        │
        ▼ Detections
[Context Engine]
  ├── Temporal rules  (time-of-day sensitivity)
  ├── Spatial rules   (zone-based geofencing)
  └── Behavioural     (loitering, duration thresholds)
        │
        ▼ Qualified alerts
[SQLite Database]  ←→  [Flask Backend]  ←→  [Web Dashboard]
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

## Academic Context

**Programme:** Diploma in Cyber Security and Forensics  
**Institution:** Zetech University  
**Year:** 2025/2026  
**Supervisor:** [Supervisor Name]

This project addresses the gap between passive CCTV recording and
active, intelligent threat detection in urban neighbourhood surveillance.
The context-awareness layer distinguishes this system from conventional
motion-detection approaches by applying temporal, spatial, and behavioural
reasoning before escalating any alert.
