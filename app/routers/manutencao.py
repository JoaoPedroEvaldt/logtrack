from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.manutencao import Manutencao
from app.models.veiculo import Veiculo
from app.models.usuario import Usuario
from app.schemas.manutencao import ManutencaoCreate, ManutencaoUpdate, ManutencaoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/manutencoes", tags=["Manutenções"])

@router.post("/", response_model=ManutencaoResponse)
def criar_manutencao(dados: ManutencaoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    veiculo = db.query(Veiculo).filter(Veiculo.id == dados.veiculo_id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    manutencao = Manutencao(**dados.model_dump())
    db.add(manutencao)
    db.commit()
    db.refresh(manutencao)
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == manutencao.id).first()

@router.get("/", response_model=List[ManutencaoResponse])
def listar_manutencoes(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).order_by(Manutencao.data_manutencao.desc()).all()

@router.get("/veiculo/{veiculo_id}", response_model=List[ManutencaoResponse])
def listar_por_veiculo(veiculo_id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.veiculo_id == veiculo_id).order_by(Manutencao.data_manutencao.desc()).all()

@router.get("/{id}", response_model=ManutencaoResponse)
def buscar_manutencao(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    manutencao = db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    return manutencao

@router.put("/{id}", response_model=ManutencaoResponse)
def atualizar_manutencao(id: int, dados: ManutencaoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    manutencao = db.query(Manutencao).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(manutencao, campo, valor)
    db.commit()
    db.refresh(manutencao)
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == id).first()

@router.delete("/{id}")
def deletar_manutencao(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    manutencao = db.query(Manutencao).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    db.delete(manutencao)
    db.commit()
    return {"message": "Manutenção removida com sucesso"}