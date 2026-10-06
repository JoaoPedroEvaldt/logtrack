from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date, datetime
from typing import List, Optional


class DiariaCreate(BaseModel):
    entrega_id: int
    data: date
    dias: Optional[int] = Field(default=None, gt=0, le=60)
    valor: float = Field(gt=0, le=1_000_000)
    descricao: Optional[str] = Field(default=None, max_length=200)


class DiariaResponse(BaseModel):
    id: int
    entrega_id: int
    data: date
    dias: Optional[int]
    valor: float
    descricao: Optional[str]
    acerto_id: Optional[int]
    parte_motorista: float
    parte_caminhao: float
    parte_empresa: float
    motorista_id: Optional[int] = None
    rota: Optional[str] = None


class AdiantamentoCreate(BaseModel):
    motorista_id: int
    data: date
    valor: float = Field(gt=0, le=1_000_000)
    descricao: Optional[str] = Field(default=None, max_length=200)


class AdiantamentoResponse(BaseModel):
    id: int
    motorista_id: int
    data: date
    valor: float
    descricao: Optional[str]
    acerto_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class AcertoCreate(BaseModel):
    motorista_id: int
    periodo_inicio: date
    periodo_fim: date
    observacao: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _periodo_coerente(self):
        if self.periodo_fim < self.periodo_inicio:
            raise ValueError("O fim do período não pode ser antes do início")
        return self


class ViagemAcerto(BaseModel):
    id: int
    data: date
    origem: str
    destino: str
    valor_frete: float
    comissao: float


class PreviaAcerto(BaseModel):
    motorista_id: int
    motorista: str
    periodo_inicio: date
    periodo_fim: date
    viagens: List[ViagemAcerto]
    diarias: List[DiariaResponse]
    adiantamentos: List[AdiantamentoResponse]
    total_frete: float
    comissao: float
    total_diarias: float
    diarias_motorista: float
    total_adiantamentos: float
    saldo: float


class AcertoResponse(BaseModel):
    id: int
    motorista_id: int
    motorista: Optional[str] = None
    periodo_inicio: date
    periodo_fim: date
    qtd_viagens: int
    total_frete: float
    comissao: float
    total_diarias: float
    diarias_motorista: float
    total_adiantamentos: float
    saldo: float
    observacao: Optional[str]
    fechado_por: Optional[str] = None
    criado_em: datetime


class AcertoDetalhe(AcertoResponse):
    viagens: List[ViagemAcerto]
    diarias: List[DiariaResponse]
    adiantamentos: List[AdiantamentoResponse]
