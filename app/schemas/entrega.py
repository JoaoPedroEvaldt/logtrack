from pydantic import ConfigDict, BaseModel, field_validator
from datetime import datetime
from typing import Optional

def _nao_negativo(v: Optional[float]) -> Optional[float]:
    if v is not None and v < 0:
        raise ValueError("não pode ser negativo")
    return v

class EntregaCreate(BaseModel):
    cliente: str
    origem: str
    destino: str
    descricao_carga: Optional[str] = None
    peso_kg: Optional[float] = None
    valor_frete: Optional[float] = None
    motorista_id: Optional[int] = None
    veiculo_id: Optional[int] = None
    previsao: datetime

    _validar_peso_kg = field_validator("peso_kg")(_nao_negativo)
    _validar_valor_frete = field_validator("valor_frete")(_nao_negativo)

class EntregaUpdate(BaseModel):
    cliente: Optional[str] = None
    origem: Optional[str] = None
    destino: Optional[str] = None
    descricao_carga: Optional[str] = None
    peso_kg: Optional[float] = None
    valor_frete: Optional[float] = None
    motorista_id: Optional[int] = None
    veiculo_id: Optional[int] = None
    status: Optional[str] = None
    previsao: Optional[datetime] = None

    _validar_peso_kg = field_validator("peso_kg")(_nao_negativo)
    _validar_valor_frete = field_validator("valor_frete")(_nao_negativo)

class EntregaResponse(BaseModel):
    id: int
    cliente: str
    origem: str
    destino: str
    descricao_carga: Optional[str]
    peso_kg: Optional[float]
    valor_frete: Optional[float]
    motorista_id: Optional[int]
    veiculo_id: Optional[int]
    status: str
    previsao: datetime
    iniciado_em: Optional[datetime]
    concluido_em: Optional[datetime]
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
