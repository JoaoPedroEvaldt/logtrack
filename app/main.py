from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, usuarios, motoristas, veiculos, entregas, ocorrencias, dashboard
from app.routers import conjunto as conjuntos_router

app = FastAPI(
    title="LogTrack API",
    description="Sistema Inteligente de Gestão Operacional para Transportadoras",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(motoristas.router)
app.include_router(veiculos.router)
app.include_router(entregas.router)
app.include_router(ocorrencias.router)
app.include_router(dashboard.router)
app.include_router(conjuntos_router.router)

@app.get("/")
def root():
    return {"message": "LogTrack API funcionando!", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}