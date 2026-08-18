from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.conjunto import Conjunto
from app.models.usuario import Usuario
from app.models.entrega import Entrega
from app.models.veiculo import Veiculo
from app.schemas.conjunto import ConjuntoCreate, ConjuntoUpdate, ConjuntoResponse
from app.routers.auth import get_usuario_atual
from typing import List

router = APIRouter(prefix="/conjuntos", tags=["Conjuntos"])

def _validar_tipos_veiculo(cavalo_id, semi1_id, semi2_id, db: Session):
    if cavalo_id:
        v = db.query(Veiculo).filter(Veiculo.id == cavalo_id).first()
        if v and v.tipo != "cavalo":
            raise HTTPException(
                status_code=400,
                detail=f'Veículo {v.placa} é do tipo "{v.tipo}", não um cavalo mecânico.'
            )
    for semi_id in (semi1_id, semi2_id):
        if semi_id:
            v = db.query(Veiculo).filter(Veiculo.id == semi_id).first()
            if v and v.tipo != "semirreboque":
                raise HTTPException(
                    status_code=400,
                    detail=f'Veículo {v.placa} é do tipo "{v.tipo}", não um semirreboque.'
                )

def _validar_veiculos_disponiveis(cavalo_id, semi1_id, semi2_id, db: Session, excluir_id: int = None):
    ids_no_conjunto = [v for v in (cavalo_id, semi1_id, semi2_id) if v]
    if len(ids_no_conjunto) != len(set(ids_no_conjunto)):
        raise HTTPException(status_code=400, detail="Um mesmo veículo não pode ocupar duas posições no mesmo conjunto.")

    for veiculo_id in ids_no_conjunto:
        query = db.query(Conjunto).filter(
            Conjunto.status == "ativo",
            or_(
                Conjunto.cavalo_id == veiculo_id,
                Conjunto.semirreboque1_id == veiculo_id,
                Conjunto.semirreboque2_id == veiculo_id,
            )
        )
        if excluir_id:
            query = query.filter(Conjunto.id != excluir_id)
        conflito = query.first()
        if conflito:
            veiculo = db.query(Veiculo).filter(Veiculo.id == veiculo_id).first()
            placa = veiculo.placa if veiculo else f"#{veiculo_id}"
            raise HTTPException(
                status_code=400,
                detail=f'Veículo {placa} já está em uso no conjunto "{conflito.nome}". Desative aquele conjunto antes de reutilizá-lo aqui.'
            )

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
    _validar_tipos_veiculo(dados.cavalo_id, dados.semirreboque1_id, dados.semirreboque2_id, db)
    _validar_veiculos_disponiveis(dados.cavalo_id, dados.semirreboque1_id, dados.semirreboque2_id, db)
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

    cavalo_id = dados.cavalo_id if dados.cavalo_id is not None else conjunto.cavalo_id
    semi1_id = dados.semirreboque1_id if dados.semirreboque1_id is not None else conjunto.semirreboque1_id
    semi2_id = dados.semirreboque2_id if dados.semirreboque2_id is not None else conjunto.semirreboque2_id
    _validar_tipos_veiculo(cavalo_id, semi1_id, semi2_id, db)

    novo_status = dados.status if dados.status is not None else conjunto.status
    if novo_status == "ativo":
        _validar_veiculos_disponiveis(cavalo_id, semi1_id, semi2_id, db, excluir_id=conjunto.id)

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