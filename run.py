"""Local runner for the Liga Obninsk Flask app.

Loads `.env` file (if present) and starts the Flask app on configured PORT.
This helper prefers the SocketIO server when available, otherwise falls back to Flask's builtin server.
"""
import os
import sys
from importlib import import_module

try:
    # optional: load environment from .env if python-dotenv is installed
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # fallback: try to read .env manually
    env_path = os.path.join(os.getcwd(), '.env')
    if os.path.exists(env_path):
        print('[INFO] Found .env but python-dotenv is not installed; loading manually')
        with open(env_path, 'r', encoding='utf-8') as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith('#'):
                    continue
                if '=' in ln:
                    k, v = ln.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())


def main():
    # Ensure project root is on path
    sys.path.insert(0, os.getcwd())

    port = int(os.environ.get('PORT', 5000))
    env = os.environ.get('FLASK_ENV', 'development')

    print(f"[INFO] Starting app (env={env}) on port {port}")

    try:
        # Import app module; socketio instance may be defined in app or wsgi
        app_mod = import_module('app')
        app = getattr(app_mod, 'app', None)
        # Try to find socketio in the app module
        socketio = getattr(app_mod, 'socketio', None)
    except Exception as e:
        # Try importing names from wsgi if direct import fails
        try:
            mod = import_module('wsgi')
            app = getattr(mod, 'app', None) or getattr(mod, 'application', None)
            socketio = getattr(mod, 'socketio', None)
        except Exception as e2:
            print(f"[ERROR] Failed to import application: {e} / {e2}")
            raise

    # If app has an attribute websocket_manager or WEBSOCKETS_ENABLED env var, prefer SocketIO if available
    use_socketio = False
    try:
        if os.environ.get('WEBSOCKETS_ENABLED', '').lower() in ('1', 'true', 'yes'):
            use_socketio = True
        elif getattr(app, 'config', None) and app.config.get('websocket_manager'):
            use_socketio = True
    except Exception:
        use_socketio = False

    if use_socketio and socketio is not None:
        # Prefer running via socketio.run
        try:
            print('[INFO] Running via Flask-SocketIO (development)')
            socketio.run(app, host='0.0.0.0', port=port, debug=bool(app.config.get('FLASK_DEBUG')))
            return
        except Exception as e:
            print(f"[WARN] socketio.run failed: {e} — falling back to engine detection")

    # If socketio instance missing but WEBSOCKETS_ENABLED set, try to run with eventlet/gevent if installed
    if use_socketio and socketio is None:
        # Try eventlet
        try:
            import eventlet
            import eventlet.wsgi
            print('[INFO] No socketio instance found; running via eventlet WSGI server')
            eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app)
            return
        except Exception:
            pass

        # Try gevent
        try:
            from gevent.pywsgi import WSGIServer
            print('[INFO] No socketio instance found; running via gevent WSGI server')
            http_server = WSGIServer(('0.0.0.0', port), app)
            http_server.serve_forever()
            return
        except Exception:
            pass

    # Fallback: regular Flask run
    print('[INFO] Running Flask development server (not for production)')
    app.run(host='0.0.0.0', port=port, debug=bool(app.config.get('FLASK_DEBUG')))


if __name__ == '__main__':
    main()
