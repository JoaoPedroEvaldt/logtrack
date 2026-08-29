from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class AbastecimentoCreate(BaseModel):
    veiculo_id: int
    motorista_id: Optional[int] = None
    data_abastecimento: date
    litros: float
    valor_total: float
    quilometragem: Optional[int] = None
    posto: Optional[str] = None
    estado: Optional[str] = None

class AbastecimentoUpdate(BaseModel):
    veiculo_id: Optional[int] = None
    motorista_id: Optional[int] = None
    data_abastecimento: Optional[date] = None
    litros: Optional[float] = None
    valor_total: Optional[float] = None
    quilometragem: Optional[int] = None
    posto: Optional[str] = None
    estado: Optional[str] = None

class VeiculoInfo(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str

    class Config:
        from_attributes = True

class MotoristaInfo(BaseModel):
    id: int
    nome: str

    class Config:
        from_attributes = True

class AbastecimentoResponse(BaseModel):
    id: int
    veiculo_id: int
    veiculo: Optional[VeiculoInfo] = None
    motorista_id: Optional[int]
    motorista: Optional[MotoristaInfo] = None
    data_abastecimento: date
    litros: float
    valor_total: float
    quilometragem: Optional[int]
    posto: Optional[str]
    estado: Optional[str] = None
    criado_em: datetime

    class Config:
        from_attributes = True
