#!/usr/bin/env python3
"""
Apply clean database schema
Run this to reset database with NO sample data
"""

import sqlite3
from werkzeug.security import generate_password_hash
import os

DB_PATH = 'data/sentinel.db'

def clean_database():
    print("\n" + "=" * 60)
    print("  CLEAN DATABASE SETUP")
    print("=" * 60)
    
    if os.path.exists(DB_PATH):
        response = input(f"\n⚠️  Delete existing {DB_PATH}? (y/n): ").strip().lower()
        if response != 'y':
            print("❌ Cancelled")
            return False
        os.remove(DB_PATH)
        print(f"✓ Deleted old database")
    
    print(f"\n📁 Creating clean database: {DB_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Execute schema
    print("📝 Creating tables...")
    with open('data/database_clean.sql', 'r') as f:
        schema = f.read()
    cursor.executescript(schema)
    
    # Hash passwords for real users
    print("🔐 Setting up user passwords...")
    users = [
        (1, 'admin', generate_password_hash('admin123')),
        (2, 'security', generate_password_hash('secure456')),
        (3, 'operator', generate_password_hash('ops789'))
    ]
    
    cursor.execute("DELETE FROM users")
    cursor.executemany("""
        INSERT OR REPLACE INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
    """, users)
    
    conn.commit()
    
    # Verify
    print("\n✅ Database created successfully!")
    print(f"   Users: {cursor.execute('SELECT COUNT(*) FROM users').fetchone()[0]}")
    print(f"   Cameras: {cursor.execute('SELECT COUNT(*) FROM cameras').fetchone()[0]}")
    print(f"   Rules: {cursor.execute('SELECT COUNT(*) FROM alert_rules').fetchone()[0]}")
    print(f"   Alerts: {cursor.execute('SELECT COUNT(*) FROM alerts').fetchone()[0]}")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("✓ CLEAN DATABASE READY!")
    print("=" * 60)
    print("\nLogin credentials:")
    print("  admin / admin123")
    print("  security / secure456") 
    print("  operator / ops789")
    print("\nSystem is EMPTY - ready for real usage!")
    print("=" * 60 + "\n")
    
    return True

if __name__ == '__main__':
    try:
        clean_database()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
