@echo off
set /p repo_url="GitHub Repository URL Paste Karein (https://github.com/...): "
echo.
echo Connecting to GitHub...
git remote remove origin 2>nul
git remote add origin %repo_url%
echo.
echo Staging files...
git add .
echo committing...
git commit -m "Deployment ready"
echo.
echo GitHub par bhej rahe hain (Pushing)...
git push -u origin master
echo.
echo Kaam ho gaya! Ab aap GitHub par check karein.
pause
