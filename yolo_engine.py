# yolo_engine.py - YOLO11 Integration for Sentinel Surveillance System

import cv2
import json
import sqlite3
import threading
import time
import torch
from datetime import datetime
from ultralytics import YOLO

# ============================================
# CONFIGURATION
# ============================================

EMAIL_SENDER   = ""
EMAIL_PASSWORD = ""
EMAIL_RECEIVER = ""

CAMERA_SOURCE = "http://192.168.100.3:8080/video"  # ← update when IP changes

DB_PATH    = 'data/sentinel.db'
MODEL_PATH = 'yolo11n.pt'

# Performance settings - ADD THESE
FRAME_SKIP = 4  # Process every 4th frame for inference (higher = faster but less responsive)
JPEG_QUALITY = 60  # Lower = smaller frames, faster transmission (50-70 recommended)

TRACKED_CLASSES = {
    0:  'person',
    2:  'car',
    3:  'motorcycle',
    5:  'bus',
    7:  'truck',
    24: 'backpack',
    28: 'suitcase',
}

# ============================================
# SHARED STATE
# ============================================

engine_state = {
    'running':     False,
    'fps':         0,
    'frame':       None,
    'detections':  [],
    'yolo_status': 'Awaiting',
    'frame_count': 0,
    'error':       None,
    'last_detections': [],  # NEW: Cache detections to draw on every frame
}

_state_lock = threading.Lock()

# ============================================
# DATABASE HELPERS
# ============================================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_active_rules():
    try:
        conn = get_db()
        rows = conn.execute("SELECT * FROM alert_rules WHERE active = 1").fetchall()
        conn.close()
        rules = []
        for row in rows:
            rules.append({
                'id':           row['id'],
                'name':         row['name'],
                'priority':     row['priority'],
                'objects':      json.loads(row['object_types']),
                'confidence':   row['min_confidence'],
                'time_enabled': row['time_enabled'],
                'start_time':   row['start_time'],
                'end_time':     row['end_time'],
                'camera_ids':   json.loads(row['camera_ids']) if row['camera_ids'] else [],
            })
        return rules
    except Exception as e:
        print(f"[YOLO] Rule load error: {e}")
        return []

# NEW: Preprocess rules for faster lookup
def preprocess_rules(rules):
    """Convert rules into a lookup dictionary for faster matching"""
    rule_map = {}
    for rule in rules:
        for obj in rule['objects']:
            obj_lower = obj.lower()
            if obj_lower not in rule_map:
                rule_map[obj_lower] = []
            rule_map[obj_lower].append(rule)
    return rule_map

def rule_matches(rule, obj_type, confidence, camera_id=1):
    rule_objects = [o.lower() for o in rule['objects']]
    if obj_type.lower() not in rule_objects:
        return False

    rule_conf = rule['confidence']
    if rule_conf > 1.0:
        rule_conf = rule_conf / 100.0
    if confidence < rule_conf:
        return False

    if rule['camera_ids']:
        if camera_id not in rule['camera_ids'] and str(camera_id) not in [str(c) for c in rule['camera_ids']]:
            return False

    if rule['time_enabled'] and rule['start_time'] and rule['end_time']:
        now   = datetime.now().strftime('%H:%M')
        start = rule['start_time']
        end   = rule['end_time']
        if start <= end:
            if not (start <= now <= end):
                return False
        else:
            if end <= now <= start:
                return False

    return True

_last_alert_time = {}
_alert_time_lock = threading.Lock()

def send_email_alert(rule, obj_type, confidence, camera_id=1):
    """Fire-and-forget async email — does not block YOLO"""
    def worker():
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        try:
            msg = MIMEMultipart()
            msg['From']    = EMAIL_SENDER
            msg['To']      = EMAIL_RECEIVER
            msg['Subject'] = f"🚨 Sentinel Alert: {obj_type.title()} Detected — {rule['name']}"
            body = f"""
SENTINEL SURVEILLANCE SYSTEM — SECURITY ALERT

Rule Triggered : {rule['name']}
Object Detected: {obj_type.title()}
Confidence     : {confidence:.0%}
Camera         : Camera 0{camera_id}
Priority       : {rule['priority'].upper()}
Time           : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} EAT

http://127.0.0.1:5000
            """
            msg.attach(MIMEText(body, 'plain'))
            server = smtplib.SMTP('smtp.gmail.com', 587, timeout=10)
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, EMAIL_RECEIVER, msg.as_string())
            server.quit()
            print(f"[EMAIL] ✓ Alert email sent for {obj_type}")
        except Exception as e:
            print(f"[EMAIL] ✗ Failed: {e}")
    # Use daemon=False to ensure email completes before program exit
    thread = threading.Thread(target=worker, daemon=False)
    thread.start()

def write_alert(rule, obj_type, confidence, camera_id=1):
    cooldown_key = f"{rule['id']}_{obj_type}_{camera_id}"
    now = time.time()
    
    with _alert_time_lock:
        if cooldown_key in _last_alert_time:
            if now - _last_alert_time[cooldown_key] < 15:  # 15-second cooldown per rule/object/camera
                return
        _last_alert_time[cooldown_key] = now

    severity = {'critical':'critical','high':'high','medium':'medium','low':'low'}.get(rule['priority'], 'medium')
    try:
        conn = get_db()
        conn.execute("""
            INSERT INTO alerts (
                camera_id, rule_id, object_type, confidence,
                severity, description, status, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, 'unacknowledged', datetime('now', '+3 hours'))
        """, (
            camera_id, rule['id'], obj_type, round(confidence, 3), severity,
            f"{obj_type.title()} detected — rule '{rule['name']}' triggered"
        ))
        conn.commit()
        conn.close()
        print(f"[YOLO] ⚠ Alert: {obj_type} ({confidence:.0%}) → rule '{rule['name']}'")
        send_email_alert(rule, obj_type, confidence, camera_id)
    except Exception as e:
        print(f"[YOLO] Alert write error: {e}")

# ============================================
# YOLO ENGINE - OPTIMIZED VERSION
# ============================================

def run_engine():
    global engine_state

    # Check GPU availability
    if torch.cuda.is_available():
        print(f"[YOLO] ✅ GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        print("[YOLO] ⚠️ GPU not available, using CPU (performance will be limited)")

    print(f"[YOLO] Loading model: {MODEL_PATH}")
    try:
        model = YOLO(MODEL_PATH)
        
        # Force GPU if available
        if torch.cuda.is_available():
            model.to('cuda')
            print(f"[YOLO] Model loaded on GPU")
        else:
            print("[YOLO] Model loaded on CPU")
            
    except Exception as e:
        with _state_lock:
            engine_state['yolo_status'] = 'Error'
            engine_state['error'] = str(e)
        print(f"[YOLO] ❌ Model loading error: {e}")
        return

    print(f"[YOLO] Connecting to: {CAMERA_SOURCE}")
    cap = cv2.VideoCapture(CAMERA_SOURCE)
    
    # Optimize capture settings
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer
    cap.set(cv2.CAP_PROP_FPS, 30)  # Request higher FPS

    if not cap.isOpened():
        with _state_lock:
            engine_state['yolo_status'] = 'Error'
            engine_state['error'] = f"Cannot open stream: {CAMERA_SOURCE}"
        print(f"[YOLO] ❌ Cannot open stream: {CAMERA_SOURCE}")
        return

    print("[YOLO] ✅ Stream connected — inference starting")
    with _state_lock:
        engine_state['running']     = True
        engine_state['yolo_status'] = 'Running'

    # Performance tracking
    fps_counter = 0
    fps_timer = time.time()
    frame_counter = 0
    
    # Rule management
    rules = []
    rule_map = {}  # NEW: Preprocessed rules for faster lookup
    rules_timer = 0
    
    # Frame skipping for YOLO
    frame_skip = 0

    while engine_state['running']:
        ret, frame = cap.read()
        if not ret:
            print("[YOLO] Stream lost — retrying in 2s")
            time.sleep(2)
            cap.release()
            cap = cv2.VideoCapture(CAMERA_SOURCE)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue

        frame_counter += 1
        
        # Frame skipping: serve frame but only run YOLO every 4th frame
        frame_skip += 1
        if frame_skip % 4 != 0:
            # Still encode and serve the frame, just skip YOLO
            # But draw cached detections from last YOLO inference
            draw_frame = frame.copy()
            
            # Draw cached detections on this frame
            with _state_lock:
                cached_detections = engine_state['last_detections']
            
            for det in cached_detections:
                x1, y1, x2, y2 = det['bbox']
                obj_type = det['type']
                confidence = det['confidence'] / 100.0
                
                # Draw bounding box
                color = (0, 0, 255) if obj_type == 'person' else (0, 165, 255)
                cv2.rectangle(draw_frame, (x1, y1), (x2, y2), color, 3)
                label = f"{obj_type} {confidence:.0%}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(draw_frame, (x1, y1 - th - 10), (x1 + tw + 4, y1), color, -1)
                cv2.putText(draw_frame, label, (x1 + 2, y1 - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
            
            # Add timestamp
            ts = datetime.now().strftime('%Y-%m-%d  %H:%M:%S')
            cv2.putText(draw_frame, ts, (10, draw_frame.shape[0] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
            
            _, jpeg = cv2.imencode('.jpg', draw_frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            with _state_lock:
                engine_state['frame'] = jpeg.tobytes()
            continue
        
        # Refresh rules periodically
        if time.time() - rules_timer > 30:
            rules = load_active_rules()
            rule_map = preprocess_rules(rules)  # NEW: Preprocess rules
            rules_timer = time.time()

        # YOLO runs here on every 4th frame only
        process_frame = True
        
        detections = []
        
        if process_frame:
            # Run inference
            results = model(frame, verbose=False, conf=0.45)[0]

            # Process detections
            for box in results.boxes:
                cls_id = int(box.cls[0])
                obj_type = TRACKED_CLASSES.get(cls_id)
                if not obj_type:
                    continue

                confidence = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                h, w = frame.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)

                detection = {
                    'type': obj_type,
                    'confidence': round(confidence * 100, 1),
                    'bbox': [x1, y1, x2, y2]
                }
                detections.append(detection)

                # Draw bounding box
                color = (0, 0, 255) if obj_type == 'person' else (0, 165, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
                label = f"{obj_type} {confidence:.0%}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 4, y1), color, -1)
                cv2.putText(frame, label, (x1 + 2, y1 - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

                # NEW: Fast rule checking using preprocessed map
                matching_rules = rule_map.get(obj_type.lower(), [])
                for rule in matching_rules:
                    if rule_matches(rule, obj_type, confidence):
                        # NEW: Run alert in background thread
                        threading.Thread(
                            target=write_alert,
                            args=(rule, obj_type, confidence),
                            daemon=True
                        ).start()

        # Add timestamp
        ts = datetime.now().strftime('%Y-%m-%d  %H:%M:%S')
        cv2.putText(frame, ts, (10, frame.shape[0] - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        # NEW: Compress frame with lower quality for faster transmission
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])

        # Update FPS counter
        fps_counter += 1
        if time.time() - fps_timer >= 1.0:
            with _state_lock:
                engine_state['fps'] = fps_counter
                engine_state['frame'] = jpeg.tobytes()
                engine_state['detections'] = detections
                engine_state['last_detections'] = detections  # Cache for frame skipping
                engine_state['frame_count'] += fps_counter
            fps_counter = 0
            fps_timer = time.time()
        else:
            with _state_lock:
                engine_state['frame'] = jpeg.tobytes()
                engine_state['detections'] = detections
                engine_state['last_detections'] = detections  # Cache for frame skipping

    # Cleanup
    cap.release()
    print("[YOLO] Engine stopped")

# ============================================
# PUBLIC API (unchanged)
# ============================================

_engine_thread = None

def start():
    global _engine_thread
    if _engine_thread and _engine_thread.is_alive():
        print("[YOLO] Already running")
        return
    
    # Print performance settings
    print(f"[YOLO] Performance: frame_skip={FRAME_SKIP}, jpeg_quality={JPEG_QUALITY}")
    
    _engine_thread = threading.Thread(target=run_engine, daemon=True)
    _engine_thread.start()
    print("[YOLO] Engine thread started")

def stop():
    with _state_lock:
        engine_state['running'] = False

def get_frame():
    with _state_lock:
        return engine_state['frame']

def get_state():
    with _state_lock:
        return {
            'running': engine_state['running'],
            'fps': engine_state['fps'],
            'detections': engine_state['detections'],
            'yolo_status': engine_state['yolo_status'],
            'error': engine_state['error'],
        }

# NEW: Utility function to adjust performance on the fly
def set_performance(frame_skip=None, jpeg_quality=None):
    """Update performance settings dynamically"""
    global FRAME_SKIP, JPEG_QUALITY
    if frame_skip is not None:
        FRAME_SKIP = max(1, frame_skip)
        print(f"[YOLO] Frame skip set to: {FRAME_SKIP}")
    if jpeg_quality is not None:
        JPEG_QUALITY = max(10, min(95, jpeg_quality))
        print(f"[YOLO] JPEG quality set to: {JPEG_QUALITY}")