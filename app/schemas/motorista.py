from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import Optional
import re

def _cpf_valido(digitos: str) -> bool:
    if len(digitos) != 11 or digitos == digitos[0] * 11:
        return False
    for pos in (9, 10):
        soma = sum(int(digitos[i]) * (pos + 1 - i) for i in range(pos))
        digito_esperado = (soma * 10 % 11) % 10
        if digito_esperado != int(digitos[pos]):
            return False
    return True

class MotoristaCreate(BaseModel):
    nome: str
    cpf: str
    cnh_numero: str
    cnh_categoria: str
    cnh_validade: date
    telefone: Optional[str] = None
    email: Optional[EmailStr] = None
    senha: Optional[str] = Field(default=None, min_length=8)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, v: str) -> str:
        digitos = re.sub(r"\D", "", v or "")
        if not _cpf_valido(digitos):
            raise ValueError("CPF inválido. Informe os 11 dígitos numéricos de um CPF real")
        return digitos

    @field_validator("cnh_numero")
    @classmethod
    def validar_cnh_numero(cls, v: str) -> str:
        digitos = re.sub(r"\D", "", v or "")
        if len(digitos) != 11:
            raise ValueError("Número da CNH deve conter 11 dígitos numéricos")
        return digitos

class MotoristaUpdate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    cnh_categoria: Optional[str] = None
    cnh_validade: Optional[date] = None
    status: Optional[str] = None

class MotoristaResponse(BaseModel):
    id: int
    nome: str
    cpf: str
    cnh_numero: str
    cnh_categoria: str
    cnh_validade: date
    telefone: Optional[str]
    status: str
    possui_login: bool
    email: Optional[str] = None
    criado_em: datetime

    class Config:
        from_attributes = True