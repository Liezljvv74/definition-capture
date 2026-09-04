@echo off
setlocal
title Definition Capture

cd /d "%~dp0"

rem The port is fixed on purpose. The glossary lives in the browser's
rem localStorage, which is keyed to the exact origin (http://localhost:3001).
rem Starting on any other port would open the app with an empty list.
set PORT=3001
set URL=http://localhost:%PORT%

rem Already running? Just open the browser, rather than letting a second
rem `next dev` fall back to another port and show an empty glossary.
powershell -NoProfile -Command "try{(New-Object Net.Sockets.TcpClient).Connect('localhost',%PORT%);exit 0}catch{exit 1}" >nul 2>&1
if not errorlevel 1 (
  echo Definition Capture is already running.
  start "" "%URL%"
  exit /b 0
)

if not exist "node_modules\" (
  echo Installing dependencies. This only happens once...
  call npm install || goto :failed
)

rem Wait for the server to accept connections, then open the browser. Detached,
rem so the dev server below keeps this window.
start "" /min powershell -NoProfile -Command "$n=0; while($n -lt 75){ try{(New-Object Net.Sockets.TcpClient).Connect('localhost',%PORT%); Start-Process '%URL%'; break }catch{ Start-Sleep -Milliseconds 400; $n++ } }"

echo.
echo    Definition Capture  -^>  %URL%
echo    Keep this window open. Press Ctrl+C or close it to stop the server.
echo.

call npm run dev
goto :eof

:failed
echo.
echo    Could not install dependencies. Is Node.js installed?
pause
exit /b 1
