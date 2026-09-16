from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class LogAcessoResponse(BaseModel):
    id: int
    usuario_id: Optional[int]
    usuario_nome: Optional[str] = None
    email_tentado: str
    ip: Optional[str]
    tentativa_ok: bool
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
