from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.usuario import Usuario
from app import auth

router = APIRouter(prefix="/auth", tags=["Autenticação"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == form.username).first()
    if not usuario or not auth.verificar_senha(form.password, usuario.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos"
        )
    if not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo"
        )
    token = auth.criar_token({"sub": str(usuario.id), "perfil": usuario.perfil})
    return {"access_token": token, "token_type": "bearer", "perfil": usuario.perfil}

def get_usuario_atual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth.verificar_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado"
        )
    usuario = db.query(Usuario).filter(Usuario.id == int(payload["sub"])).first()
    if not usuario or not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado"
        )
    return usuario