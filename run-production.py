"""
Production-like runner using eventlet directly (Windows-compatible).
This mimics production behavior without gunicorn's Unix-specific dependencies.
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
    
    print(f"[INFO] Starting production-like server on port {port}")
    print(f"[INFO] Environment: {os.environ.get('FLASK_ENV', 'unknown')}")
    print(f"[INFO] Debug mode: {os.environ.get('FLASK_DEBUG', 'unknown')}")
    print(f"[INFO] WebSockets: {os.environ.get('WEBSOCKETS_ENABLED', 'unknown')}")
    
    try:
        # Import with early gevent patching like in wsgi.py
        import eventlet
        eventlet.monkey_patch()
        
        from wsgi import app
        
        print(f"[INFO] Using eventlet WSGI server (production-like)")
        print(f"[INFO] Server starting at http://0.0.0.0:{port}")
        print(f"[INFO] Press Ctrl+C to stop")
        
        # Run with eventlet
        import eventlet.wsgi
        eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app)
        
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped by user")
    except Exception as e:
        print(f"[ERROR] Failed to start server: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()