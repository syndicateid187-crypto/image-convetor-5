@echo off
echo Starting SmartConverter Pro (Unified Mode)...

:: Check for build folder
if not exist client\dist (
    echo Frontend build not found! Building now...
    cd client && npm run build && cd ..
)

echo Launching Unified Server on http://localhost:5000...
cd server && npm start

pause
