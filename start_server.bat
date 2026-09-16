@echo off
chcp 65001 > nul
title KGLVS - PHAN HE BOC TACH BAO CAO DIEU HANH
echo =========================================================================
echo   HE THONG BOC TACH BAO CAO HANH CHINH THONG MINH (KGLVS AI ENGINE)
echo =========================================================================
echo.
echo [1/2] Dang kiem tra va khoi dong may chu API Fastify tren cong 3001...
start cmd /k "npx tsx src/server.ts"

timeout /t 3 /nobreak > nul

:: Kiem tra cong dang lang nghe de mo dung trinh duyet
set TARGET_PORT=3001
netstat -ano | findstr ":3002" | findstr "LISTENING" > nul
if %errorlevel% equ 0 (
    set TARGET_PORT=3002
)

echo [2/2] Dang mo trinh duyet Web Portal va Swagger API Docs tren cong %TARGET_PORT%...
start http://localhost:%TARGET_PORT%
start http://localhost:%TARGET_PORT%/docs

echo.
echo =========================================================================
echo   KHOI DONG THANH CONG!
echo   - Web Portal Lanh Dao: http://localhost:%TARGET_PORT%
echo   - Swagger API Docs:    http://localhost:%TARGET_PORT%/docs
echo =========================================================================
echo.
pause
