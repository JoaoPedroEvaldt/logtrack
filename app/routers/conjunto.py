from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.conjunto import Conjunto
from app.models.usuario import Usuario
from app.models.entrega import Entrega
from app.schemas.conjunto import ConjuntoCreate, ConjuntoUpdate, ConjuntoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/conjuntos", tags=["Conjuntos"])

def _enriquecer_conjuntos(conjuntos: List[Conjunto], db: Session) -> List[Conjunto]:
    motorista_ids = [c.motorista_id for c in conjuntos if c.motorista_id]
    usuario_ids = [c.motorista.usuario_id for c in conjuntos if c.motorista]

    nomes = {}
    if usuario_ids:
        usuarios = db.query(Usuario).filter(Usuario.id.in_(usuario_ids)).all()
        nomes = {u.id: u.nome for u in usuarios}

    viagem_por_motorista = {}
    if motorista_ids:
        viagens = db.query(Entrega).filter(
            Entrega.motorista_id.in_(motorista_ids),
            Entrega.status.in_(["aguardando", "em_rota"])
        ).all()
        for v in viagens:
            atual = viagem_por_motorista.get(v.motorista_id)
            if not atual or (v.status == "em_rota" and atual.status != "em_rota"):
                viagem_por_motorista[v.motorista_id] = v

    for c in conjuntos:
        if c.motorista:
            c.motorista.nome = nomes.get(c.motorista.usuario_id)
        c.viagem_atual = viagem_por_motorista.get(c.motorista_id)

    return conjuntos

@router.post("/", response_model=ConjuntoResponse)
def criar_conjunto(dados: ConjuntoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    conjunto = Conjunto(**dados.model_dump())
    db.add(conjunto)
    db.commit()
    db.refresh(conjunto)
    conjunto = db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.id == conjunto.id).first()
    return _enriquecer_conjuntos([conjunto], db)[0]

@router.get("/", response_model=List[ConjuntoResponse])
def listar_conjuntos(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    conjuntos = db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.status == "ativo").all()
    return _enriquecer_conjuntos(conjuntos, db)

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
    return _enriquecer_conjuntos([conjunto], db)[0]

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
    conjunto = db.query(Conjunto).options(
        joinedload(Conjunto.motorista),
        joinedload(Conjunto.cavalo),
        joinedload(Conjunto.semirreboque1),
        joinedload(Conjunto.semirreboque2)
    ).filter(Conjunto.id == id).first()
    return _enriquecer_conjuntos([conjunto], db)[0]

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