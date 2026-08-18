from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.entrega import Entrega
from app.models.usuario import Usuario
from app.schemas.entrega import EntregaCreate, EntregaUpdate, EntregaResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/entregas", tags=["Entregas"])

@router.post("/", response_model=EntregaResponse)
def criar_entrega(dados: EntregaCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    entrega = Entrega(**dados.model_dump())
    db.add(entrega)
    db.commit()
    db.refresh(entrega)
    return entrega

@router.get("/", response_model=List[EntregaResponse])
def listar_entregas(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        from app.models.motorista import Motorista
        motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
        if not motorista:
            return []
        return db.query(Entrega).filter(Entrega.motorista_id == motorista.id).all()
    return db.query(Entrega).all()

def _garantir_acesso_entrega(entrega: Entrega, atual: Usuario, db: Session):
    if atual.perfil != "motorista":
        return
    from app.models.motorista import Motorista
    motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
    if not motorista or entrega.motorista_id != motorista.id:
        raise HTTPException(status_code=403, detail="Acesso negado")

@router.get("/{id}", response_model=EntregaResponse)
def buscar_entrega(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    return entrega

@router.put("/{id}/status")
def atualizar_status(id: int, status: str, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    status_validos = ["aguardando", "em_rota", "entregue", "atrasado", "ocorrencia", "cancelado"]
    if status not in status_validos:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {status_validos}")
    entrega.status = status
    if status == "em_rota":
        entrega.iniciado_em = datetime.utcnow()
    if status == "entregue":
        entrega.concluido_em = datetime.utcnow()
    db.commit()
    db.refresh(entrega)
    return {"message": f"Status atualizado para {status}"}

@router.put("/{id}", response_model=EntregaResponse)
def atualizar_entrega(id: int, dados: EntregaUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(entrega, campo, valor)
    db.commit()
    db.refresh(entrega)
    return entrega

@router.delete("/{id}")
def deletar_entrega(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    entrega.status = "cancelado"
    db.commit()
    return {"message": "Entrega cancelada com sucesso"}