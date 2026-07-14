from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate, UsuarioResponse
from app.routers.auth import get_usuario_atual
from app import auth
from typing import List

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

@router.post("/", response_model=UsuarioResponse)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    if db.query(Usuario).filter(Usuario.email == dados.email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        senha_hash=auth.gerar_hash_senha(dados.senha),
        perfil=dados.perfil
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario

@router.get("/", response_model=List[UsuarioResponse])
def listar_usuarios(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return db.query(Usuario).all()

@router.get("/{id}", response_model=UsuarioResponse)
def buscar_usuario(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    usuario = db.query(Usuario).filter(Usuario.id == id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

@router.put("/{id}", response_model=UsuarioResponse)
def atualizar_usuario(id: int, dados: UsuarioUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil != "administrador":
        raise HTTPException(status_code=403, detail="Acesso negado")
    usuario = db.query(Usuario).filter(Usuario.id == id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    for campo, valor in dados.model_dump(exclude_none=True).items():
        setattr(usuario, campo, valor)
    db.commit()
    db.refresh(usuario)
    return usuario 