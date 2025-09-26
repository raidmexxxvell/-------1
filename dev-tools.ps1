# Скрипт управления разработкой "Лига Обнинска"
param(
    [string]$command = "help"
)

function Show-Help {
    Write-Host "=== Инструменты разработки - Лига Обнинска ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Доступные команды:" -ForegroundColor Yellow
    Write-Host "  setup    - Настройка окружения (установка зависимостей)" -ForegroundColor Cyan
    Write-Host "  run      - Запуск WebSocket сервера для разработки" -ForegroundColor Cyan
    Write-Host "  build    - Компиляция TypeScript" -ForegroundColor Cyan
    Write-Host "  status   - Статус Git репозитория" -ForegroundColor Cyan
    Write-Host "  commit   - Быстрый коммит изменений" -ForegroundColor Cyan
    Write-Host "  backup   - Создание бекапа проекта" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Примеры использования:" -ForegroundColor Yellow
    Write-Host "  .\dev-tools.ps1 setup" -ForegroundColor Gray
    Write-Host "  .\dev-tools.ps1 run" -ForegroundColor Gray
    Write-Host "  .\dev-tools.ps1 commit" -ForegroundColor Gray
}

function Setup-Environment {
    Write-Host "🔧 Настройка окружения разработки..." -ForegroundColor Green
    
    # Создание виртуального окружения Python
    if (-not (Test-Path ".venv")) {
        Write-Host "📦 Создание Python venv..." -ForegroundColor Yellow
        python -m venv .venv
    }
    
    # Активация и установка зависимостей
    Write-Host "📦 Установка Python зависимостей..." -ForegroundColor Yellow
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    
    # Установка Node.js зависимостей
    if (Test-Path "package.json") {
        Write-Host "📦 Установка Node.js зависимостей..." -ForegroundColor Yellow
        npm install
    }
    
    Write-Host "✅ Окружение настроено!" -ForegroundColor Green
}

function Start-Development {
    Write-Host "🚀 Запуск сервера разработки..." -ForegroundColor Green
    
    # Проверка активации venv
    .\.venv\Scripts\Activate.ps1
    
    # Запуск WebSocket сервера
    python .\run-websocket.py
}

function Build-TypeScript {
    Write-Host "🔨 Компиляция TypeScript..." -ForegroundColor Green
    npm run build
    Write-Host "✅ TypeScript скомпилирован!" -ForegroundColor Green
}

function Show-GitStatus {
    Write-Host "📊 Статус Git репозитория:" -ForegroundColor Green
    git status --short
    Write-Host ""
    Write-Host "📝 Последние коммиты:" -ForegroundColor Green
    git log --oneline -5
}

function Quick-Commit {
    Write-Host "💾 Быстрый коммит изменений..." -ForegroundColor Green
    
    # Показать статус
    git status --short
    
    # Запросить сообщение коммита
    $message = Read-Host "Введите сообщение коммита (или Enter для авто-сообщения)"
    
    if ([string]::IsNullOrWhiteSpace($message)) {
        $message = "🔄 Обновление: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    
    # Добавить и закоммитить
    git add .
    git commit -m $message
    
    Write-Host "✅ Коммит создан!" -ForegroundColor Green
}

function Create-Backup {
    $backupName = "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"
    $backupPath = "..\$backupName"
    
    Write-Host "💾 Создание бекапа: $backupName" -ForegroundColor Green
    
    # Исключаем временные папки из бекапа
    $excludeFolders = @('.git', '__pycache__', 'node_modules', '.venv')
    
    # PowerShell команда для создания архива (без исключенных папок)
    Compress-Archive -Path * -DestinationPath $backupPath -Force
    
    Write-Host "✅ Бекап создан: $backupPath" -ForegroundColor Green
}

# Обработка команд
switch ($command.ToLower()) {
    "setup" { Setup-Environment }
    "run" { Start-Development }
    "build" { Build-TypeScript }
    "status" { Show-GitStatus }
    "commit" { Quick-Commit }
    "backup" { Create-Backup }
    "help" { Show-Help }
    default { 
        Write-Host "❌ Неизвестная команда: $command" -ForegroundColor Red
        Show-Help 
    }
}