# Production-like local startup script
# Запускает приложение через gunicorn с eventlet worker (как в продакшене)

param(
    [int]$Port = 5000,
    [int]$Workers = 1
)

Write-Host "[INFO] Starting production-like server on port $Port with $Workers worker(s)"
Write-Host "[INFO] Using eventlet worker for WebSocket support"

$venvPath = Join-Path $PSScriptRoot '.venv'
if (-not (Test-Path $venvPath)) {
    Write-Host "[ERROR] Virtual environment not found at $venvPath"
    Write-Host "[INFO] Run .\start-local.ps1 first to create the environment"
    exit 1
}

Write-Host "[INFO] Activating virtual environment"
. "$venvPath\Scripts\Activate.ps1"

# Проверяем что gunicorn и eventlet установлены
try {
    & python -c "import gunicorn, eventlet" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Import failed"
    }
} catch {
    Write-Host "[WARN] Installing missing dependencies..."
    pip install gunicorn eventlet
}

# Устанавливаем переменные для продакшна
$env:FLASK_ENV = "production"
$env:FLASK_DEBUG = "0"

# Запускаем через gunicorn с eventlet worker
Write-Host "[INFO] Starting gunicorn server..."
Write-Host "[INFO] Access the app at: http://localhost:$Port"
Write-Host "[INFO] To stop the server, press Ctrl+C"

gunicorn -k eventlet -w $Workers -b "0.0.0.0:$Port" --timeout 120 --keep-alive 2 wsgi:app