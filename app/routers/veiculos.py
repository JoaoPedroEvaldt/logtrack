from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.veiculo import Veiculo
from app.models.usuario import Usuario
from app.schemas.veiculo import VeiculoCreate, VeiculoUpdate, VeiculoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/veiculos", tags=["Veículos"])

@router.post("/", response_model=VeiculoResponse)
def criar_veiculo(dados: VeiculoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    if db.query(Veiculo).filter(Veiculo.placa == dados.placa).first():
        raise HTTPException(status_code=400, detail="Placa já cadastrada")
    veiculo = Veiculo(**dados.model_dump())
    db.add(veiculo)
    db.commit()
    db.refresh(veiculo)
    return veiculo

@router.get("/", response_model=List[VeiculoResponse])
def listar_veiculos(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    return db.query(Veiculo).filter(Veiculo.status != "inativo").all()

@router.get("/{id}", response_model=VeiculoResponse)
def buscar_veiculo(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return veiculo

@router.put("/{id}", response_model=VeiculoResponse)
def atualizar_veiculo(id: int, dados: VeiculoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(veiculo, campo, valor)
    db.commit()
    db.refresh(veiculo)
    return veiculo

@router.delete("/{id}")
def deletar_veiculo(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    veiculo.status = "inativo"
    db.commit()
    return {"message": "Veículo desativado com sucesso"}