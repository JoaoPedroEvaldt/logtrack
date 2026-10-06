@echo off
REM Liga o LogTrack local: aplica migracoes pendentes no banco local e sobe a
REM API na porta 8000 (o frontend aberto pelo Live Server busca os dados aqui).
cd /d "%~dp0"
call venv\Scripts\activate.bat
alembic upgrade head
echo.
echo LogTrack local em http://127.0.0.1:8000  (feche esta janela para desligar)
echo.
uvicorn app.main:app --reload --port 8000
pause
