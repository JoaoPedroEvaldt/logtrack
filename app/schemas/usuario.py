from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Literal, Optional

Perfil = Literal["administrador", "operador", "motorista"]

class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str = Field(min_length=8)
    perfil: Perfil

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = Field(default=None, min_length=8)
    perfil: Optional[Perfil] = None
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