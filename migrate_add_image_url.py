"""
Migration: Add image_url column to ss_platform_posts table
"""
import sqlite3

def migrate():
    conn = sqlite3.connect('agent_mesh.sqlite')
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(ss_platform_posts)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'image_url' not in columns:
            print("Adding image_url column to ss_platform_posts...")
            cursor.execute("ALTER TABLE ss_platform_posts ADD COLUMN image_url TEXT")
            conn.commit()
            print("✓ Column added successfully!")
        else:
            print("✓ Column image_url already exists")
            
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
