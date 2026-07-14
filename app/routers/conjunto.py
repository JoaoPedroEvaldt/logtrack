from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.conjunto import Conjunto
from app.models.usuario import Usuario
from app.schemas.conjunto import ConjuntoCreate, ConjuntoUpdate, ConjuntoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/conjuntos", tags=["Conjuntos"])

@router.post("/", response_model=ConjuntoResponse)
def criar_conjunto(dados: ConjuntoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    conjunto = Conjunto(**dados.model_dump())
    db.add(conjunto)
    db.commit()
    db.refresh(conjunto)
    return db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.id == conjunto.id).first()

@router.get("/", response_model=List[ConjuntoResponse])
def listar_conjuntos(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    return db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.status == "ativo").all()

@router.get("/{id}", response_model=ConjuntoResponse)
def buscar_conjunto(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    conjunto = db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.id == id).first()
    if not conjunto:
        raise HTTPException(status_code=404, detail="Conjunto não encontrado")
    return conjunto

@router.put("/{id}", response_model=ConjuntoResponse)
def atualizar_conjunto(id: int, dados: ConjuntoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    conjunto = db.query(Conjunto).filter(Conjunto.id == id).first()
    if not conjunto:
        raise HTTPException(status_code=404, detail="Conjunto não encontrado")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(conjunto, campo, valor)
    db.commit()
    db.refresh(conjunto)
    return db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.id == id).first()

@router.delete("/{id}")
def deletar_conjunto(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    conjunto = db.query(Conjunto).filter(Conjunto.id == id).first()
    if not conjunto:
        raise HTTPException(status_code=404, detail="Conjunto não encontrado")
    conjunto.status = "inativo"
    db.commit()
    return {"message": "Conjunto desativado com sucesso"}