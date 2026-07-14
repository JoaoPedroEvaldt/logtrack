from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class OcorrenciaCreate(BaseModel):
    entrega_id: int
    tipo: str
    descricao: str

class OcorrenciaResponse(BaseModel):
    id: int
    entrega_id: int
    usuario_id: int
    tipo: str
    descricao: str
    foto_path: Optional[str]
    criado_em: datetime

    class Config:
        from_attributes = True