from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verificar_senha(senha_plana, senha_hash):
    return pwd_context.verify(senha_plana, senha_hash)

def gerar_hash_senha(senha):
    return pwd_context.hash(senha)

def criar_token(data: dict):
    dados = data.copy()
    expira = datetime.utcnow() + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    dados.update({"exp": expira})
    return jwt.encode(dados, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verificar_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None 