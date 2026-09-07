from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.log_acesso import LogAcesso
from app.models.usuario import Usuario
from app.schemas.log_acesso import LogAcessoResponse
from app.routers.auth import exigir_admin

router = APIRouter(prefix="/log-acesso", tags=["Log de Acesso"])

@router.get("/", response_model=List[LogAcessoResponse])
def listar_log_acesso(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    return db.query(LogAcesso)\
        .options(joinedload(LogAcesso.usuario))\
        .order_by(LogAcesso.criado_em.desc())\
        .limit(200)\
        .all()
