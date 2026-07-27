from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

class ManutencaoCreate(BaseModel):
    veiculo_id: int
    data_manutencao: date
    tipo: str
    descricao: str
    custo: Optional[float] = None
    mecanico: Optional[str] = None
    quilometragem: Optional[int] = None
    status: Optional[str] = "concluida"
    proxima_revisao: Optional[date] = None

class ManutencaoUpdate(BaseModel):
    data_manutencao: Optional[date] = None
    tipo: Optional[str] = None
    descricao: Optional[str] = None
    custo: Optional[float] = None
    mecanico: Optional[str] = None
    quilometragem: Optional[int] = None
    status: Optional[str] = None
    proxima_revisao: Optional[date] = None

class VeiculoInfo(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str

    class Config:
        from_attributes = True

class ManutencaoResponse(BaseModel):
    id: int
    veiculo_id: int
    veiculo: Optional[VeiculoInfo] = None
    data_manutencao: date
    tipo: str
    descricao: str
    custo: Optional[float]
    mecanico: Optional[str]
    quilometragem: Optional[int]
    status: str
    proxima_revisao: Optional[date]
    criado_em: datetime

    class Config:
        from_attributes = True