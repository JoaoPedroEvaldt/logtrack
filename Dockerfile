FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Aplica as migrações pendentes (Alembic) antes de subir a API — em todo
# deploy, o banco é levado até a versão que o código espera.
# --forwarded-allow-ips: no Render toda requisição chega pelo proxy deles, e
# sem confiar no X-Forwarded-For o Log de Acesso gravava o IP interno do
# proxy (10.x.x.x) em vez do IP de quem fez login. O container só é
# alcançável através desse proxy, então aceitar o cabeçalho é seguro.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --forwarded-allow-ips="*"