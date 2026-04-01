import sqlite3
conn = sqlite3.connect('data/sentinel.db')
conn.execute("UPDATE alert_rules SET camera_ids='[]' WHERE id=3")
conn.commit()
conn.close()
print('Done')