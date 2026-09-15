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

echo [2/2] Dang mo trinh duyet Web Portal va Swagger API Docs...
start http://localhost:3001
start http://localhost:3001/docs

echo.
echo =========================================================================
echo   KHOI DONG THANH CONG!
echo   - Web Portal Lanh Dao: http://localhost:3001
echo   - Swagger API Docs:    http://localhost:3001/docs
echo =========================================================================
echo.
pause
