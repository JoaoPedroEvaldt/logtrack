from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.usuario import Usuario
from app.models.log_acesso import LogAcesso
from app import auth

router = APIRouter(prefix="/auth", tags=["Autenticação"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Protecao basica contra forca bruta: depois de N tentativas erradas seguidas
# pro mesmo e-mail dentro da janela, bloqueia novas tentativas por um tempo -
# sem isso, nada impedia alguem de tentar milhares de senhas por segundo.
MAX_TENTATIVAS_LOGIN = 5
JANELA_BLOQUEIO_MINUTOS = 15

@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # datetime.now() (hora local), nao utcnow() - o Postgres grava criado_em via
    # func.now() na timezone da sessao (America/Sao_Paulo aqui), e comparar contra
    # um limite em UTC deixava a janela sempre 3h "no futuro", nunca disparando.
    limite = datetime.now() - timedelta(minutes=JANELA_BLOQUEIO_MINUTOS)
    tentativas_recentes = db.query(LogAcesso).filter(
        LogAcesso.email_tentado == form.username,
        LogAcesso.tentativa_ok.is_(False),
        LogAcesso.criado_em >= limite
    ).count()
    if tentativas_recentes >= MAX_TENTATIVAS_LOGIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Muitas tentativas de login com esse e-mail. Tente novamente em {JANELA_BLOQUEIO_MINUTOS} minutos."
        )

    usuario = db.query(Usuario).filter(Usuario.email == form.username).first()
    senha_ok = bool(usuario and auth.verificar_senha(form.password, usuario.senha_hash))
    sucesso = senha_ok and usuario.ativo

    db.add(LogAcesso(
        usuario_id=usuario.id if usuario else None,
        email_tentado=form.username,
        ip=request.client.host if request.client else None,
        tentativa_ok=sucesso
    ))
    db.commit()

    if not senha_ok:
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
    return {"access_token": token, "token_type": "bearer", "perfil": usuario.perfil, "nome": usuario.nome}

def _resolver_usuario_do_token(token: str, db: Session) -> Usuario:
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

def get_usuario_atual(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    return _resolver_usuario_do_token(token, db)

# Fotos (<img src>) não conseguem mandar um header Authorization — usado pela
# rota estática de uploads (app/routers/uploads.py), que recebe o token via
# querystring em vez do header Bearer padrão.
def get_usuario_via_query_token(token: Optional[str] = None, db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    return _resolver_usuario_do_token(token, db)

def exigir_perfil(*perfis_permitidos: str):
    """Fábrica de dependency pra checagem de permissão por perfil — substitui o
    `if atual.perfil not in [...]: raise HTTPException(403, "Acesso negado")`
    que estava copiado à mão em cada router. Uso: Depends(exigir_perfil("administrador")).
    """
    def verificador(atual: Usuario = Depends(get_usuario_atual)) -> Usuario:
        if atual.perfil not in perfis_permitidos:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        return atual
    return verificador

# As duas combinações usadas em todo o app: qualquer endpoint de staff
# (administrador ou operador — motorista fica de fora) e os admin-only.
exigir_staff = exigir_perfil("administrador", "operador")
exigir_admin = exigir_perfil("administrador")