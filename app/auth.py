import hashlib
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verificar_senha(senha_plana, senha_hash):
    return pwd_context.verify(senha_plana, senha_hash)

def gerar_hash_senha(senha):
    return pwd_context.hash(senha)

# "Lembrar-me" no login: o token vale 30 dias em vez das horas normais, e fica
# só naquele navegador (outro computador ou o celular pedem login de novo).
LEMBRAR_DIAS = 30

def selo_da_senha(senha_hash: str) -> str:
    """Pedaço de um hash do hash da senha, gravado no token. Trocar a senha muda
    o selo, então todo token antigo (inclusive os de 30 dias) deixa de valer."""
    return hashlib.sha256(senha_hash.encode()).hexdigest()[:16]

def criar_token(data: dict, lembrar: bool = False):
    dados = data.copy()
    duracao = timedelta(days=LEMBRAR_DIAS) if lembrar else timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    expira = datetime.utcnow() + duracao
    dados.update({"exp": expira})
    return jwt.encode(dados, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verificar_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None 