from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from app.database import get_db
from app.models.entrega import Entrega
from app.models.veiculo import Veiculo
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.usuario import Usuario
from app.routers.auth import get_usuario_atual

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/resumo")
def resumo(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    hoje = date.today()

    entregas_hoje = db.query(Entrega).filter(
        func.date(Entrega.criado_em) == hoje
    ).count()

    em_rota = db.query(Entrega).filter(Entrega.status == "em_rota").count()

    concluidas_hoje = db.query(Entrega).filter(
        Entrega.status == "entregue",
        func.date(Entrega.concluido_em) == hoje
    ).count()

    atrasadas = db.query(Entrega).filter(Entrega.status == "atrasado").count()

    ocorrencias_abertas = db.query(Ocorrencia).filter(
        func.date(Ocorrencia.criado_em) == hoje
    ).count()

    veiculos_disponiveis = db.query(Veiculo).filter(Veiculo.status == "disponivel").count()
    motoristas_disponiveis = db.query(Motorista).filter(Motorista.status == "disponivel").count()

    return {
        "entregas_hoje": entregas_hoje,
        "em_rota": em_rota,
        "concluidas_hoje": concluidas_hoje,
        "atrasadas": atrasadas,
        "ocorrencias_abertas": ocorrencias_abertas,
        "veiculos_disponiveis": veiculos_disponiveis,
        "motoristas_disponiveis": motoristas_disponiveis
    }

@router.get("/entregas-por-status")
def entregas_por_status(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    resultado = db.query(
        Entrega.status,
        func.count(Entrega.id).label("total")
    ).group_by(Entrega.status).all()

    return [{"status": r.status, "total": r.total} for r in resultado]

@router.get("/entregas-por-dia")
def entregas_por_dia(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    resultado = db.query(
        func.date(Entrega.criado_em).label("dia"),
        func.count(Entrega.id).label("total")
    ).group_by(func.date(Entrega.criado_em)).order_by("dia").all()

    return [{"dia": str(r.dia), "total": r.total} for r in resultado]

@router.get("/desempenho-motoristas")
def desempenho_motoristas(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    from app.models.motorista import Motorista
    from app.models.usuario import Usuario as UsuarioModel

    resultado = db.query(
        UsuarioModel.nome,
        func.count(Entrega.id).label("total"),
        func.count(Entrega.id).filter(Entrega.status == "entregue").label("concluidas"),
        func.count(Entrega.id).filter(Entrega.status == "atrasado").label("atrasadas")
    ).join(Motorista, Motorista.usuario_id == UsuarioModel.id)\
     .join(Entrega, Entrega.motorista_id == Motorista.id)\
     .group_by(UsuarioModel.nome).all()

    return [{"motorista": r.nome, "total": r.total, "concluidas": r.concluidas, "atrasadas": r.atrasadas} for r in resultado] 