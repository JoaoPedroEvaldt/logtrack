from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ConjuntoCreate(BaseModel):
    nome: str
    motorista_id: Optional[int] = None
    cavalo_id: Optional[int] = None
    semirreboque1_id: Optional[int] = None
    semirreboque2_id: Optional[int] = None

class ConjuntoUpdate(BaseModel):
    nome: Optional[str] = None
    motorista_id: Optional[int] = None
    cavalo_id: Optional[int] = None
    semirreboque1_id: Optional[int] = None
    semirreboque2_id: Optional[int] = None
    status: Optional[str] = None

class VeiculoInfo(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str

    class Config:
        from_attributes = True

class MotoristaInfo(BaseModel):
    id: int
    cpf: str
    cnh_numero: str

    class Config:
        from_attributes = True

class ConjuntoResponse(BaseModel):
    id: int
    nome: str
    motorista_id: Optional[int]
    cavalo_id: Optional[int]
    semirreboque1_id: Optional[int]
    semirreboque2_id: Optional[int]
    status: str
    motorista: Optional[MotoristaInfo]
    cavalo: Optional[VeiculoInfo]
    semirreboque1: Optional[VeiculoInfo]
    semirreboque2: Optional[VeiculoInfo]
    criado_em: datetime

    class Config:
        from_attributes = True