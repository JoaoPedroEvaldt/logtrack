from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional

class DeslocamentoVazioResponse(BaseModel):
    id: int
    entrega_id: int
    entrega_anterior_id: Optional[int]
    km_vazio: Optional[float]
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)

class KmVazioUpdate(BaseModel):
    km_vazio: float
