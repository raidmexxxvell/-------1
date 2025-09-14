"""
WSGI entrypoint with early gevent monkey-patching.
Patching must happen before importing any module that may import socket/ssl/urllib3.
"""

# Apply gevent monkey patch as early as possible to avoid SSL/urllib3 recursion issues
try:
	from gevent import monkey  # type: ignore
	monkey.patch_all()
except Exception:
	# Safe no-op if gevent is not available (e.g., sync worker fallback)
	pass

from app import app, socketio

# Gunicorn entrypoint
# Use: gunicorn -k eventlet -w 1 -b 0.0.0.0:10000 wsgi:app (HTTP)
# Or for SocketIO: gunicorn -k eventlet -w 1 -b 0.0.0.0:10000 wsgi:socketio_app

# Provide explicit socketio app reference if needed
socketio_app = app  # compatibility alias

# Some platforms look for 'application' by default
application = app