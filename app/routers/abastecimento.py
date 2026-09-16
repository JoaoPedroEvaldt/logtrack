from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.abastecimento import Abastecimento
from app.models.veiculo import Veiculo
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.schemas.abastecimento import AbastecimentoCreate, AbastecimentoUpdate, AbastecimentoResponse
from app.routers.auth import exigir_admin, exigir_staff
from typing import List

router = APIRouter(prefix="/abastecimentos", tags=["Abastecimentos"])

def _com_relacoes(query):
    return query.options(joinedload(Abastecimento.veiculo), joinedload(Abastecimento.motorista))

def _validar_veiculo_e_motorista_existem(veiculo_id, motorista_id, db: Session):
    if veiculo_id and not db.query(Veiculo).filter(Veiculo.id == veiculo_id).first():
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    if motorista_id and not db.query(Motorista).filter(Motorista.id == motorista_id).first():
        raise HTTPException(status_code=404, detail="Motorista não encontrado")

@router.post("/", response_model=AbastecimentoResponse, include_in_schema=False)
@router.post("", response_model=AbastecimentoResponse)
def criar_abastecimento(dados: AbastecimentoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    _validar_veiculo_e_motorista_existem(dados.veiculo_id, dados.motorista_id, db)

    abastecimento = Abastecimento(**dados.model_dump())
    db.add(abastecimento)
    db.commit()
    db.refresh(abastecimento)
    return _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == abastecimento.id).first()

@router.get("/", response_model=List[AbastecimentoResponse], include_in_schema=False)
@router.get("", response_model=List[AbastecimentoResponse])
def listar_abastecimentos(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    return _com_relacoes(db.query(Abastecimento)).order_by(Abastecimento.data_abastecimento.desc()).all()

@router.get("/{id}", response_model=AbastecimentoResponse)
def buscar_abastecimento(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    abastecimento = _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    return abastecimento

@router.put("/{id}", response_model=AbastecimentoResponse)
def atualizar_abastecimento(id: int, dados: AbastecimentoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    abastecimento = db.query(Abastecimento).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")

    atualizacoes = dados.model_dump(exclude_unset=True)
    if "veiculo_id" in atualizacoes or "motorista_id" in atualizacoes:
        veiculo_id = atualizacoes.get("veiculo_id", abastecimento.veiculo_id)
        motorista_id = atualizacoes.get("motorista_id", abastecimento.motorista_id)
        _validar_veiculo_e_motorista_existem(veiculo_id, motorista_id, db)

    # exclude_unset (não exclude_none): o formulário manda motorista_id/
    # quilometragem/posto/estado explicitamente como null ao limpar o campo —
    # exclude_none descartaria esse null e deixaria o valor antigo preso, sem
    # erro nenhum pro usuário.
    for campo, valor in atualizacoes.items():
        setattr(abastecimento, campo, valor)
    db.commit()
    db.refresh(abastecimento)
    return _com_relacoes(db.query(Abastecimento)).filter(Abastecimento.id == id).first()

@router.delete("/{id}")
def deletar_abastecimento(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    abastecimento = db.query(Abastecimento).filter(Abastecimento.id == id).first()
    if not abastecimento:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    db.delete(abastecimento)
    db.commit()
    return {"message": "Abastecimento removido com sucesso"}
