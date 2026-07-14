from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UsuarioCreate(BaseModel):
    nome: str
    email: str
    senha: str
    perfil: str

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    ativo: Optional[bool] = None

class UsuarioResponse(BaseModel):
    id: int
    nome: str
    email: str
    perfil: str
    ativo: bool
    criado_em: datetime

    class Config:
        from_attributes = True