from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.schemas.motorista import MotoristaCreate, MotoristaUpdate, MotoristaResponse
from app.routers.auth import get_usuario_atual
from app import auth
from typing import List

router = APIRouter(prefix="/motoristas", tags=["Motoristas"])

@router.post("/", response_model=MotoristaResponse)
def criar_motorista(dados: MotoristaCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")

    usuario_existente = db.query(Usuario).filter(Usuario.email == dados.email).first()
    motorista_reativar = None
    if usuario_existente:
        motorista_reativar = db.query(Motorista).filter(Motorista.usuario_id == usuario_existente.id).first()
        if usuario_existente.perfil != "motorista" or not motorista_reativar or motorista_reativar.status != "inativo":
            raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    if db.query(Motorista).filter(Motorista.cpf == dados.cpf, Motorista.status != "inativo").first():
        raise HTTPException(status_code=400, detail="CPF já cadastrado")
    if db.query(Motorista).filter(Motorista.cnh_numero == dados.cnh_numero, Motorista.status != "inativo").first():
        raise HTTPException(status_code=400, detail="CNH já cadastrada")
    try:
        if motorista_reativar:
            usuario_existente.nome = dados.nome
            usuario_existente.senha_hash = auth.gerar_hash_senha(dados.senha)
            motorista_reativar.cpf = dados.cpf
            motorista_reativar.cnh_numero = dados.cnh_numero
            motorista_reativar.cnh_categoria = dados.cnh_categoria
            motorista_reativar.cnh_validade = dados.cnh_validade
            motorista_reativar.telefone = dados.telefone
            motorista_reativar.status = "disponivel"
            db.commit()
            motorista = motorista_reativar
        else:
            usuario = Usuario(
                nome=dados.nome,
                email=dados.email,
                senha_hash=auth.gerar_hash_senha(dados.senha),
                perfil="motorista"
            )
            db.add(usuario)
            db.flush()
            motorista = Motorista(
                usuario_id=usuario.id,
                cpf=dados.cpf,
                cnh_numero=dados.cnh_numero,
                cnh_categoria=dados.cnh_categoria,
                cnh_validade=dados.cnh_validade,
                telefone=dados.telefone
            )
            db.add(motorista)
            db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Não foi possível cadastrar o motorista. Verifique os dados informados.")
    db.refresh(motorista)
    return _motorista_com_nome(motorista, db)

@router.get("/", response_model=List[MotoristaResponse])
def listar_motoristas(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    motoristas = db.query(Motorista).filter(Motorista.status != "inativo").all()
    return [_motorista_com_nome(m, db) for m in motoristas]

@router.get("/{id}", response_model=MotoristaResponse)
def buscar_motorista(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    motorista = db.query(Motorista).filter(Motorista.id == id).first()
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    return _motorista_com_nome(motorista, db)

@router.put("/{id}", response_model=MotoristaResponse)
def atualizar_motorista(id: int, dados: MotoristaUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil not in ["administrador", "operador"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    motorista = db.query(Motorista).filter(Motorista.id == id).first()
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        if campo == "nome":
            usuario = db.query(Usuario).filter(Usuario.id == motorista.usuario_id).first()
            if usuario:
                usuario.nome = valor
        else:
            setattr(motorista, campo, valor)
    db.commit()
    db.refresh(motorista)
    return _motorista_com_nome(motorista, db)

@router.delete("/{id}")
def deletar_motorista(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    motorista = db.query(Motorista).filter(Motorista.id == id).first()
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    motorista.status = "inativo"
    db.commit()
    return {"message": "Motorista desativado com sucesso"}

def _motorista_com_nome(motorista, db):
    usuario = db.query(Usuario).filter(Usuario.id == motorista.usuario_id).first()
    result = MotoristaResponse(
        id=motorista.id,
        nome=usuario.nome if usuario else None,
        cpf=motorista.cpf,
        cnh_numero=motorista.cnh_numero,
        cnh_categoria=motorista.cnh_categoria,
        cnh_validade=motorista.cnh_validade,
        telefone=motorista.telefone,
        status=motorista.status,
        criado_em=motorista.criado_em
    )
    return result