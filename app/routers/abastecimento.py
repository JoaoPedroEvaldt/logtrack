from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.abastecimento import Abastecimento
from app.models.veiculo import Veiculo
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.schemas.abastecimento import AbastecimentoCreate, AbastecimentoUpdate, AbastecimentoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/abastecimentos", tags=["Abastecimentos"])

def _com_relacoes(query):
    return query.options(joinedload(Abastecimento.veiculo), joinedload(Abastecimento.motorista))

@router.post("/", response_model=AbastecimentoResponse)
def criar_abastecimento(dados: AbastecimentoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if not db.query(Veiculo).filter(Veiculo.id == dados.veiculo_id).first():
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    if dados.motorista_id and not db.query(Motorista).filter(Motorista.id == dados.motorista_id).first():
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

    abastecimento = Abastecimento(**dados.model_dump())
    db.add(abastecimento)
    db.commit()
    db.refresh(abastecimento)
    return _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == abastecimento.id).first()

@router.get("/", response_model=List[AbastecimentoResponse])
def listar_abastecimentos(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return _com_relacoes(db.query(Abastecimento)).order_by(Abastecimento.data_abastecimento.desc()).all()

@router.get("/{id}", response_model=AbastecimentoResponse)
def buscar_abastecimento(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    abastecimento = _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    return abastecimento

@router.put("/{id}", response_model=AbastecimentoResponse)
def atualizar_abastecimento(id: int, dados: AbastecimentoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    abastecimento = db.query(Abastecimento).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(abastecimento, campo, valor)
    db.commit()
    db.refresh(abastecimento)
    return _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == id).first()

@router.delete("/{id}")
def deletar_abastecimento(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    abastecimento = db.query(Abastecimento).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    db.delete(abastecimento)
    db.commit()
    return {"message": "Abastecimento removido com sucesso"}
