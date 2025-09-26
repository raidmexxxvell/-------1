"""
Simplified production runner that avoids database connection during import.
"""
import os
import sys

# Load .env manually  
env_path = os.path.join(os.getcwd(), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for ln in f:
            ln = ln.strip()
            if not ln or ln.startswith('#'):
                continue
            if '=' in ln:
                k, v = ln.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

def main():
    sys.path.insert(0, os.getcwd())
    
    port = int(os.environ.get('PORT', 5000))
    
    # Set production-like environment
    os.environ['FLASK_ENV'] = 'production' 
    os.environ['FLASK_DEBUG'] = '0'
    
    print(f"[INFO] Starting simplified server on port {port}")
    print(f"[INFO] Environment: {os.environ.get('FLASK_ENV', 'unknown')}")
    print(f"[INFO] Database URL: {os.environ.get('DATABASE_URL', 'not set')[:50]}...")
    
    try:
        # Try simple Flask dev server first
        print("[INFO] Attempting to import Flask app...")
        from app import app
        
        print("[INFO] App imported successfully!")
        print(f"[INFO] Starting Flask development server on port {port}")
        print(f"[INFO] Open http://localhost:{port} in your browser")
        
        app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
        
    except Exception as e:
        print(f"[ERROR] Failed to start server: {e}")
        print("\n[DEBUG] Full error details:")
        import traceback
        traceback.print_exc()
        
        print(f"\n[INFO] Database connection issue detected.")
        print(f"[INFO] Current DATABASE_URL: {os.environ.get('DATABASE_URL', 'not set')}")
        print(f"[INFO] Try using SQLite for local testing: sqlite:///data/dev.db")

if __name__ == '__main__':
    main()