from pydantic import BaseModel, ConfigDict, field_validator
from datetime import date, datetime
from typing import Optional

def _litros_positivo(v: Optional[float]) -> Optional[float]:
    if v is not None and v <= 0:
        raise ValueError("litros deve ser maior que zero")
    return v

def _nao_negativo(v):
    if v is not None and v < 0:
        raise ValueError("não pode ser negativo")
    return v

class AbastecimentoCreate(BaseModel):
    veiculo_id: int
    motorista_id: Optional[int] = None
    data_abastecimento: date
    litros: float
    valor_total: float
    quilometragem: Optional[int] = None
    posto: Optional[str] = None
    estado: Optional[str] = None

    _validar_litros = field_validator("litros")(_litros_positivo)
    _validar_valor_total = field_validator("valor_total")(_nao_negativo)
    _validar_quilometragem = field_validator("quilometragem")(_nao_negativo)

class AbastecimentoUpdate(BaseModel):
    veiculo_id: Optional[int] = None
    motorista_id: Optional[int] = None
    data_abastecimento: Optional[date] = None
    litros: Optional[float] = None
    valor_total: Optional[float] = None
    quilometragem: Optional[int] = None
    posto: Optional[str] = None
    estado: Optional[str] = None

    _validar_litros = field_validator("litros")(_litros_positivo)
    _validar_valor_total = field_validator("valor_total")(_nao_negativo)
    _validar_quilometragem = field_validator("quilometragem")(_nao_negativo)

class VeiculoInfo(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str

    model_config = ConfigDict(from_attributes=True)

class MotoristaInfo(BaseModel):
    id: int
    nome: str

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)
