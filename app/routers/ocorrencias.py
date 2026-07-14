from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ocorrencia import Ocorrencia
from app.models.entrega import Entrega
from app.models.usuario import Usuario
from app.schemas.ocorrencia import OcorrenciaCreate, OcorrenciaResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/ocorrencias", tags=["Ocorrências"])

@router.post("/", response_model=OcorrenciaResponse)
def criar_ocorrencia(dados: OcorrenciaCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == dados.entrega_id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    ocorrencia = Ocorrencia(
        entrega_id=dados.entrega_id,
        usuario_id=atual.id,
        tipo=dados.tipo,
        descricao=dados.descricao
    )
    entrega.status = "ocorrencia"
    db.add(ocorrencia)
    db.commit()
    db.refresh(ocorrencia)
    return ocorrencia

@router.get("/entrega/{entrega_id}", response_model=List[OcorrenciaResponse])
def listar_ocorrencias_entrega(entrega_id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    return db.query(Ocorrencia).filter(Ocorrencia.entrega_id == entrega_id).all()

@router.get("/", response_model=List[OcorrenciaResponse])
def listar_ocorrencias(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    return db.query(Ocorrencia).all() 