from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.entrega import Entrega
from app.models.deslocamento_vazio import DeslocamentoVazio
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.schemas.deslocamento_vazio import DeslocamentoVazioResponse, KmVazioUpdate
from app.routers.auth import get_usuario_atual
from app.routers.entregas import _garantir_acesso_entrega

router = APIRouter(prefix="/deslocamentos-vazios", tags=["Deslocamento Vazio"])

@router.get("", response_model=List[DeslocamentoVazioResponse])
def listar_deslocamentos_vazios(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    query = db.query(DeslocamentoVazio)
    if atual.perfil == "motorista":
        motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
        if not motorista:
            return []
        query = query.join(Entrega, Entrega.id == DeslocamentoVazio.entrega_id).filter(Entrega.motorista_id == motorista.id)
    return query.all()

@router.put("/{entrega_id}")
def atualizar_km_vazio(entrega_id: int, dados: KmVazioUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == entrega_id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    dv = db.query(DeslocamentoVazio).filter(DeslocamentoVazio.entrega_id == entrega_id).first()
    if not dv or not dv.entrega_anterior_id:
        raise HTTPException(status_code=400, detail="Esta entrega não tem deslocamento vazio associado.")
    if dados.km_vazio < 0:
        raise HTTPException(status_code=400, detail="km_vazio não pode ser negativo.")
    dv.km_vazio = dados.km_vazio
    db.commit()
    return {"message": "km_vazio atualizado"}
