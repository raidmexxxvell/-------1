"""
Configuration module for Liga Obninska
Manages application settings and environment variables
"""
import os
import secrets
from typing import Dict, Any

class Config:
    """Application configuration class"""
    
    # Database settings
    DATABASE_URL = os.environ.get('DATABASE_URL', '')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Google Sheets settings
    GOOGLE_CREDENTIALS_B64 = os.environ.get('GOOGLE_CREDENTIALS_B64', '')
    SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID', '')
    # SHEETS_MODE:
    #   - 'disabled' : completely disable any Sheets usage
    #   - 'admin_import_only' : allow only admin import of schedule via dashboard (default)
    #   - 'enabled' : full Sheets support (legacy behaviour)
    SHEETS_MODE = os.environ.get('SHEETS_MODE', 'admin_import_only')
    
    # Telegram settings
    BOT_TOKEN = os.environ.get('BOT_TOKEN', '')
    ADMIN_USER_ID = os.environ.get('ADMIN_USER_ID', '')
    
    # Betting settings
    BET_MIN_STAKE = int(os.environ.get('BET_MIN_STAKE', '10'))
    BET_MAX_STAKE = int(os.environ.get('BET_MAX_STAKE', '5000'))
    BET_DAILY_MAX_STAKE = int(os.environ.get('BET_DAILY_MAX_STAKE', '50000'))
    BET_MARGIN = float(os.environ.get('BET_MARGIN', '0.06'))
    BET_LOCK_AHEAD_MINUTES = int(os.environ.get('BET_LOCK_AHEAD_MINUTES', '5'))
    BET_MATCH_DURATION_MINUTES = int(os.environ.get('BET_MATCH_DURATION_MINUTES', '120'))
    
    # Application settings
    FLASK_DEBUG = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    PORT = int(os.environ.get('PORT', '5000'))
    # Realtime/WebSocket feature flags
    WEBSOCKETS_ENABLED = os.environ.get('WEBSOCKETS_ENABLED', '').lower() in ('1', 'true', 'yes')
    WS_TOPIC_SUBSCRIPTIONS_ENABLED = os.environ.get('WS_TOPIC_SUBSCRIPTIONS_ENABLED', '').lower() in ('1', 'true', 'yes')
    
    # Отладка WebSocket конфигурации
    print(f"[Config Debug] WEBSOCKETS_ENABLED env: '{os.environ.get('WEBSOCKETS_ENABLED', 'NOT_SET')}'")
    print(f"[Config Debug] WEBSOCKETS_ENABLED parsed: {WEBSOCKETS_ENABLED}")
    print(f"[Config Debug] WS_TOPIC_SUBSCRIPTIONS_ENABLED env: '{os.environ.get('WS_TOPIC_SUBSCRIPTIONS_ENABLED', 'NOT_SET')}'")
    print(f"[Config Debug] WS_TOPIC_SUBSCRIPTIONS_ENABLED parsed: {WS_TOPIC_SUBSCRIPTIONS_ENABLED}")
    
    # Cache settings
    REDIS_URL = os.environ.get('REDIS_URL', '')
    CACHE_DEFAULT_TIMEOUT = int(os.environ.get('CACHE_DEFAULT_TIMEOUT', '300'))
    
    # Security settings (Phase 3)
    SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_urlsafe(32))
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = 3600
    
    # Rate limiting settings
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', 'memory://')
    RATELIMIT_DEFAULT = "100 per hour"
    
    # Session settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Content Security Policy
    CSP_DEFAULT_SRC = "'self'"
    CSP_SCRIPT_SRC = "'self' 'unsafe-inline' https://telegram.org"
    CSP_STYLE_SRC = "'self' 'unsafe-inline'"

    # Ops/health protection
    METRICS_SECRET = os.environ.get('METRICS_SECRET', '')

    # Matches system feature flags & tuning
    MATCHES_MANUAL_EDIT_ENABLED = os.environ.get('MATCHES_MANUAL_EDIT_ENABLED', '1').lower() in ('1','true','yes')
    MATCHES_BULK_IMPORT_ENABLED = os.environ.get('MATCHES_BULK_IMPORT_ENABLED', '').lower() in ('1','true','yes')
    MATCHES_IMPORT_COOLDOWN_MIN = int(os.environ.get('MATCHES_IMPORT_COOLDOWN_MIN', '10'))
    MATCH_CONFLICT_WINDOW_MIN = int(os.environ.get('MATCH_CONFLICT_WINDOW_MIN', '90'))
    MATCH_TIME_SHIFT_TOLERANCE_MIN = int(os.environ.get('MATCH_TIME_SHIFT_TOLERANCE_MIN', '15'))
    DEFAULT_TZ = os.environ.get('DEFAULT_TZ', 'Europe/Moscow')
    
    @classmethod
    def validate(cls) -> tuple[bool, list[str]]:
        """Validates required configuration"""
        required_vars = [
            'DATABASE_URL'
        ]
        
        missing = []
        for var in required_vars:
            if not getattr(cls, var, None):
                missing.append(var)

        # If Sheets are enabled for any use, require credentials
        try:
            mode = getattr(cls, 'SHEETS_MODE', os.environ.get('SHEETS_MODE', 'admin_import_only'))
        except Exception:
            mode = 'admin_import_only'
        if mode != 'disabled':
            if not (getattr(cls, 'GOOGLE_CREDENTIALS_B64', '') or getattr(cls, 'SPREADSHEET_ID', '')):
                missing.append('GOOGLE_CREDENTIALS_B64 or SPREADSHEET_ID')
        
        return len(missing) == 0, missing
    
    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Returns configuration as dictionary"""
        config_vars = {}
        for key in dir(cls):
            if not key.startswith('_') and key.isupper():
                config_vars[key] = getattr(cls, key)
        return config_vars

class DevelopmentConfig(Config):
    """Development configuration"""
    FLASK_DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    FLASK_DEBUG = False

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DATABASE_URL = os.environ.get('TEST_DATABASE_URL', 'sqlite:///test.db')

# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config(config_name: str = None) -> Config:
    """Get configuration class based on environment"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config_map.get(config_name, DevelopmentConfig)
