FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Aplica as migrações pendentes (Alembic) antes de subir a API — em todo
# deploy, o banco é levado até a versão que o código espera.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}