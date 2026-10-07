from pydantic import ConfigDict, BaseModel, Field, field_validator
from datetime import datetime
from typing import List, Optional

def _nao_negativo(v: Optional[float]) -> Optional[float]:
    if v is not None and v < 0:
        raise ValueError("não pode ser negativo")
    return v

class PontoVia(BaseModel):
    """Ponto de passagem obrigatório da rota (cidade escolhida pelo usuário
    ou ponto de uma rota alternativa do OSRM)."""
    nome: str = Field(max_length=150)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)

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
    saida_prevista: Optional[datetime] = None
    rota_via: Optional[List[PontoVia]] = Field(default=None, max_length=10)
    distancia_km: Optional[float] = None
    tempo_estimado_h: Optional[float] = None
    # Viagem já realizada, lançada depois: as datas reais de saída e entrega
    # (sem elas, saída e conclusão seriam gravadas com a hora do clique).
    iniciado_em: Optional[datetime] = None
    concluido_em: Optional[datetime] = None

    _validar_peso_kg = field_validator("peso_kg")(_nao_negativo)
    _validar_valor_frete = field_validator("valor_frete")(_nao_negativo)
    _validar_distancia_km = field_validator("distancia_km")(_nao_negativo)
    _validar_tempo_estimado_h = field_validator("tempo_estimado_h")(_nao_negativo)

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
    saida_prevista: Optional[datetime] = None
    rota_via: Optional[List[PontoVia]] = Field(default=None, max_length=10)
    distancia_km: Optional[float] = None
    tempo_estimado_h: Optional[float] = None

    _validar_peso_kg = field_validator("peso_kg")(_nao_negativo)
    _validar_valor_frete = field_validator("valor_frete")(_nao_negativo)
    _validar_distancia_km = field_validator("distancia_km")(_nao_negativo)
    _validar_tempo_estimado_h = field_validator("tempo_estimado_h")(_nao_negativo)

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
    saida_prevista: Optional[datetime] = None
    rota_via: Optional[List[PontoVia]] = None
    distancia_km: Optional[float] = None
    tempo_estimado_h: Optional[float] = None
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
