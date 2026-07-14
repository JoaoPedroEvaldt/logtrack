from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class MotoristaCreate(BaseModel):
    nome: str
    email: str
    senha: str
    cpf: str
    cnh_numero: str
    cnh_categoria: str
    cnh_validade: date
    telefone: Optional[str] = None

class MotoristaUpdate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    cnh_categoria: Optional[str] = None
    cnh_validade: Optional[date] = None
    status: Optional[str] = None

class MotoristaResponse(BaseModel):
    id: int
    nome: Optional[str] = None
    cpf: str
    cnh_numero: str
    cnh_categoria: str
    cnh_validade: date
    telefone: Optional[str]
    status: str
    criado_em: datetime

    class Config:
        from_attributes = True