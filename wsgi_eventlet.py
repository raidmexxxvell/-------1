"""
WSGI entrypoint with eventlet monkey-patching for proper WebSocket support.
This version uses eventlet instead of gevent for better WebSocket compatibility.
"""

# Apply eventlet monkey patch as early as possible
try:
    import eventlet
    eventlet.monkey_patch()
except Exception:
    # Fallback if eventlet is not available
    pass

from app import app

# Try to import socketio if available
try:
    from app import socketio
except ImportError:
    socketio = None

# Entrypoint for eventlet-based servers
# Use: gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 wsgi_eventlet:app
# Or for SocketIO: python run-websocket.py

# Provide explicit socketio app reference if needed
socketio_app = socketio if socketio else app
application = app