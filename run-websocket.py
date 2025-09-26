"""
Production-like WebSocket server using eventlet with proper monkey patching.
This ensures WebSocket works exactly like in production environment.
"""
import os

# CRITICAL: Apply monkey patching BEFORE importing any other modules
try:
    import eventlet
    eventlet.monkey_patch()
    print("[INFO] Eventlet monkey patching applied successfully")
except ImportError:
    print("[ERROR] eventlet not installed. Install with: pip install eventlet")
    exit(1)

import sys

def load_env():
    """Load environment variables from .env file"""
    env_path = os.path.join(os.getcwd(), '.env')
    if os.path.exists(env_path):
        print(f"[INFO] Loading environment from {env_path}")
        with open(env_path, 'r', encoding='utf-8') as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith('#'):
                    continue
                if '=' in ln:
                    k, v = ln.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())
    else:
        print("[WARN] .env file not found")

def main():
    # Load environment first
    load_env()
    
    sys.path.insert(0, os.getcwd())
    
    port = int(os.environ.get('PORT', 5000))
    host = '0.0.0.0'
    
    # Production-like settings
    os.environ['FLASK_ENV'] = 'production'
    os.environ['FLASK_DEBUG'] = '0'
    
    print(f"[INFO] Starting production WebSocket server")
    print(f"[INFO] Host: {host}, Port: {port}")
    print(f"[INFO] Environment: {os.environ.get('FLASK_ENV')}")
    print(f"[INFO] WebSockets: {os.environ.get('WEBSOCKETS_ENABLED')}")
    print(f"[INFO] Database: {os.environ.get('DATABASE_URL', 'not set')[:80]}...")
    
    try:
        # Import AFTER monkey patching is complete
        print("[INFO] Importing application...")
        from wsgi_eventlet import app
        
        print("[INFO] Application imported successfully")
        
        # Check if SocketIO is available
        try:
            from wsgi_eventlet import socketio
            if socketio:
                print("[INFO] SocketIO instance found - using socketio.run()")
                print(f"[INFO] Starting SocketIO server at http://{host}:{port}")
                print("[INFO] WebSocket endpoints will be available at /socket.io/")
                print("[INFO] Press Ctrl+C to stop")
                
                # Use SocketIO run method for proper WebSocket support
                socketio.run(
                    app, 
                    host=host, 
                    port=port, 
                    debug=False,
                    use_reloader=False,
                    log_output=True
                )
            else:
                raise ImportError("SocketIO not configured")
                
        except (ImportError, AttributeError):
            print("[INFO] SocketIO not available, falling back to eventlet WSGI")
            print(f"[INFO] Starting eventlet WSGI server at http://{host}:{port}")
            
            import eventlet.wsgi
            eventlet.wsgi.server(eventlet.listen((host, port)), app)
            
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped by user")
    except Exception as e:
        print(f"[ERROR] Failed to start server: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())