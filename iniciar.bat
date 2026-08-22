@echo off
cd /d "%~dp0"
if not exist node_modules\xlsx call npm install
start "Wander" http://localhost:3000
npm start
