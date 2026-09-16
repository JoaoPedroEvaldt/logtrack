from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import auth, usuarios, motoristas, veiculos, entregas, ocorrencias, dashboard, uploads
from app.routers import conjunto as conjuntos_router
from app.routers import manutencao as manutencoes
from app.routers import abastecimento as abastecimentos
from app.routers import log_acesso

app = FastAPI(
    title="LogTrack API",
    description="Sistema Inteligente de Gestão Operacional para Transportadoras",
    version="1.0.0"
)

# allow_origins=["*"] existe pro dev local (frontend aberto via Live Server numa
# porta qualquer, API sempre na 8000 — ver app.js) fazer requisição cross-origin
# pra API. allow_credentials fica False (padrão) porque a autenticação é toda via
# Bearer token no header, nunca cookie — não há necessidade real de credenciais
# de CORS, e "*" + allow_credentials=True é uma combinação que o próprio
# navegador rejeitaria se as origens fossem mesmo diferentes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(uploads.router)
app.include_router(usuarios.router)
app.include_router(motoristas.router)
app.include_router(veiculos.router)
app.include_router(entregas.router)
app.include_router(ocorrencias.router)
app.include_router(dashboard.router)
app.include_router(conjuntos_router.router)
app.include_router(manutencoes.router)
app.include_router(abastecimentos.router)
app.include_router(log_acesso.router)

@app.get("/health")
def health():
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")