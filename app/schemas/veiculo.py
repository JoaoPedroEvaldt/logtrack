from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class VeiculoCreate(BaseModel):
    placa: str
    modelo: str
    marca: str
    ano: int
    tipo: str
    subtipo: Optional[str] = None
    eixos: Optional[int] = None
    tipo_eixo: Optional[str] = None
    cor: Optional[str] = None
    capacidade_kg: float
    crlv_validade: Optional[date] = None
    seguro_validade: Optional[date] = None

class VeiculoUpdate(BaseModel):
    modelo: Optional[str] = None
    marca: Optional[str] = None
    ano: Optional[int] = None
    tipo: Optional[str] = None
    subtipo: Optional[str] = None
    eixos: Optional[int] = None
    tipo_eixo: Optional[str] = None
    cor: Optional[str] = None
    capacidade_kg: Optional[float] = None
    status: Optional[str] = None
    crlv_validade: Optional[date] = None
    seguro_validade: Optional[date] = None

class VeiculoResponse(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str
    ano: int
    tipo: str
    subtipo: Optional[str]
    eixos: Optional[int]
    tipo_eixo: Optional[str]
    cor: Optional[str]
    capacidade_kg: float
    status: str
    crlv_validade: Optional[date]
    seguro_validade: Optional[date]
    criado_em: datetime

    class Config:
        from_attributes = True