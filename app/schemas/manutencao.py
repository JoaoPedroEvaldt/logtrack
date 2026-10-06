from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from datetime import date, datetime
from typing import Optional

def _nao_negativo(v):
    if v is not None and v < 0:
        raise ValueError("não pode ser negativo")
    return v

def _validar_datas_coerentes(modelo):
    # Só compara os campos que vieram nesta requisição — num PUT parcial que só
    # manda um dos dois, a comparação contra o valor já salvo é feita pelo router.
    if modelo.data_fim is not None and modelo.data_manutencao is not None and modelo.data_fim < modelo.data_manutencao:
        raise ValueError("A data de término não pode ser anterior à data da manutenção")
    if modelo.proxima_revisao is not None and modelo.data_manutencao is not None and modelo.proxima_revisao < modelo.data_manutencao:
        raise ValueError("A próxima revisão não pode ser anterior à data da manutenção")
    return modelo

class ManutencaoCreate(BaseModel):
    veiculo_id: int
    data_manutencao: date
    data_fim: Optional[date] = None
    tipo: str
    descricao: str
    custo: Optional[float] = None
    mecanico: Optional[str] = None
    quilometragem: Optional[int] = None
    status: Optional[str] = "concluida"
    proxima_revisao: Optional[date] = None

    _validar_custo = field_validator("custo")(_nao_negativo)
    _validar_quilometragem = field_validator("quilometragem")(_nao_negativo)
    _validar_datas = model_validator(mode="after")(_validar_datas_coerentes)

class ManutencaoUpdate(BaseModel):
    data_manutencao: Optional[date] = None
    data_fim: Optional[date] = None
    tipo: Optional[str] = None
    descricao: Optional[str] = None
    custo: Optional[float] = None
    mecanico: Optional[str] = None
    quilometragem: Optional[int] = None
    status: Optional[str] = None
    proxima_revisao: Optional[date] = None

    _validar_custo = field_validator("custo")(_nao_negativo)
    _validar_quilometragem = field_validator("quilometragem")(_nao_negativo)
    _validar_datas = model_validator(mode="after")(_validar_datas_coerentes)

class VeiculoInfo(BaseModel):
    id: int
    placa: str
    modelo: str
    marca: str

    model_config = ConfigDict(from_attributes=True)

class ManutencaoResponse(BaseModel):
    id: int
    veiculo_id: int
    veiculo: Optional[VeiculoInfo] = None
    data_manutencao: date
    data_fim: Optional[date]
    tipo: str
    descricao: str
    custo: Optional[float]
    mecanico: Optional[str]
    quilometragem: Optional[int]
    status: str
    proxima_revisao: Optional[date]
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)