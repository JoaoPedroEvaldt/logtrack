from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ocorrencia import Ocorrencia
from app.models.entrega import Entrega
from app.models.usuario import Usuario
from app.schemas.ocorrencia import OcorrenciaCreate, OcorrenciaUpdate, OcorrenciaResponse
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

@router.put("/{id}", response_model=OcorrenciaResponse)
def atualizar_ocorrencia(id: int, dados: OcorrenciaUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    ocorrencia = db.query(Ocorrencia).filter(Ocorrencia.id == id).first()
    if not ocorrencia:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(ocorrencia, campo, valor)
    db.commit()
    db.refresh(ocorrencia)
    return ocorrencia

@router.delete("/{id}")
def deletar_ocorrencia(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    ocorrencia = db.query(Ocorrencia).filter(Ocorrencia.id == id).first()
    if not ocorrencia:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada")

    entrega_id = ocorrencia.entrega_id
    db.delete(ocorrencia)
    db.flush()

    restantes = db.query(Ocorrencia).filter(Ocorrencia.entrega_id == entrega_id).count()
    if restantes == 0:
        entrega = db.query(Entrega).filter(Entrega.id == entrega_id).first()
        if entrega and entrega.status == "ocorrencia":
            entrega.status = "em_rota" if entrega.iniciado_em else "aguardando"

    db.commit()
    return {"message": "Ocorrência excluída com sucesso"}