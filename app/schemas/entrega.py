from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class EntregaCreate(BaseModel):
    cliente: str
    origem: str
    destino: str
    descricao_carga: Optional[str] = None
    peso_kg: Optional[float] = None
    motorista_id: Optional[int] = None
    veiculo_id: Optional[int] = None
    previsao: datetime

class EntregaUpdate(BaseModel):
    cliente: Optional[str] = None
    origem: Optional[str] = None
    destino: Optional[str] = None
    descricao_carga: Optional[str] = None
    peso_kg: Optional[float] = None
    motorista_id: Optional[int] = None
    veiculo_id: Optional[int] = None
    status: Optional[str] = None
    previsao: Optional[datetime] = None

class EntregaResponse(BaseModel):
    id: int
    cliente: str
    origem: str
    destino: str
    descricao_carga: Optional[str]
    peso_kg: Optional[float]
    motorista_id: Optional[int]
    veiculo_id: Optional[int]
    status: str
    previsao: datetime
    iniciado_em: Optional[datetime]
    concluido_em: Optional[datetime]
    criado_em: datetime

    class Config:
        from_attributes = True