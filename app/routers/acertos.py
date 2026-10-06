"""Acerto do motorista: a cada 30 dias (na entrega do envelope) o motorista
recebe a comissão de 13% sobre o frete das viagens concluídas + a parte dele
nas diárias (1/3) - os adiantamentos (vales do dia 5 e do dia 15). A empresa
paga o diesel e não há outras despesas nem descontos.

Viagens, diárias e adiantamentos pagos ficam ligados ao acerto (acerto_id):
nada entra em dois acertos, e o que ficou de fora de um fechamento (viagem
concluída depois, vale lançado atrasado) entra automaticamente no próximo."""
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.acerto import Acerto, Adiantamento, Diaria
from app.models.entrega import Entrega
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.routers.auth import exigir_admin, exigir_staff
from app.routers.dashboard import COMISSAO_MOTORISTA, FUSO_BRASILIA, hoje_brasilia, inicio_do_dia_utc
from app.schemas.acerto import (
    AcertoCreate, AcertoDetalhe, AcertoResponse, AcertoUpdate, AdiantamentoCreate, AdiantamentoResponse,
    AdiantamentoUpdate, DiariaCreate, DiariaResponse, DiariaUpdate, PreviaAcerto, ViagemAcerto,
)

router = APIRouter(tags=["Acerto do motorista"])

CENTAVO = Decimal("0.01")
TAXA_COMISSAO = Decimal(str(COMISSAO_MOTORISTA))


def _dinheiro(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def dividir_diaria(valor) -> tuple:
    """Regra "33/33/33": motorista, caminhão e empresa ficam com um terço
    cada. O centavo que sobra da divisão fica com a empresa."""
    total = _dinheiro(valor)
    terco = (total / 3).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    return terco, terco, total - 2 * terco


def _dia_brasilia(momento_utc: datetime) -> date:
    return (momento_utc + FUSO_BRASILIA).date()


def _motorista_ou_404(motorista_id: int, db: Session) -> Motorista:
    motorista = db.query(Motorista).filter(Motorista.id == motorista_id).first()
    if not motorista:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    return motorista


def _serializar_diaria(d: Diaria) -> DiariaResponse:
    motorista, caminhao, empresa = dividir_diaria(d.valor)
    entrega = d.entrega
    return DiariaResponse(
        id=d.id, entrega_id=d.entrega_id, data=d.data, dias=d.dias, valor=float(d.valor),
        descricao=d.descricao, acerto_id=d.acerto_id,
        parte_motorista=float(motorista), parte_caminhao=float(caminhao), parte_empresa=float(empresa),
        motorista_id=entrega.motorista_id if entrega else None,
        rota=f"{entrega.origem} → {entrega.destino}" if entrega else None,
    )


def _serializar_viagem(e: Entrega) -> ViagemAcerto:
    frete = _dinheiro(e.valor_frete)
    return ViagemAcerto(
        id=e.id, data=_dia_brasilia(e.concluido_em), origem=e.origem, destino=e.destino,
        valor_frete=float(frete), comissao=float((frete * TAXA_COMISSAO).quantize(CENTAVO, rounding=ROUND_HALF_UP)),
    )


def _inicio_do_controle(motorista_id: int, inicio_pedido: date, db: Session) -> date:
    """A partir de quando procurar coisas ainda não acertadas. Depois do 1º
    acerto vale a data em que o controle começou no sistema — assim uma viagem
    concluída depois de um fechamento ainda entra no acerto seguinte. Antes
    disso, vale o início pedido (o que é mais antigo foi acertado fora)."""
    primeiro = db.query(Acerto).filter(Acerto.motorista_id == motorista_id).order_by(Acerto.periodo_inicio).first()
    return min(primeiro.periodo_inicio, inicio_pedido) if primeiro else inicio_pedido


def _pendencias(motorista_id: int, inicio: date, fim: date, db: Session):
    """Viagens concluídas, diárias e adiantamentos do motorista ainda sem
    acerto, com data entre o início do controle e o fim do período."""
    desde = _inicio_do_controle(motorista_id, inicio, db)
    viagens = db.query(Entrega).filter(
        Entrega.motorista_id == motorista_id,
        Entrega.status == "entregue",
        Entrega.acerto_id.is_(None),
        Entrega.concluido_em >= inicio_do_dia_utc(desde),
        Entrega.concluido_em < inicio_do_dia_utc(fim + timedelta(days=1)),
    ).order_by(Entrega.concluido_em).all()
    diarias = db.query(Diaria).join(Entrega, Entrega.id == Diaria.entrega_id).filter(
        Entrega.motorista_id == motorista_id,
        Entrega.status != "cancelado",
        Diaria.acerto_id.is_(None),
        Diaria.data >= desde,
        Diaria.data <= fim,
    ).order_by(Diaria.data).all()
    adiantamentos = db.query(Adiantamento).filter(
        Adiantamento.motorista_id == motorista_id,
        Adiantamento.acerto_id.is_(None),
        Adiantamento.data >= desde,
        Adiantamento.data <= fim,
    ).order_by(Adiantamento.data).all()
    return viagens, diarias, adiantamentos


def _totais(viagens, diarias, adiantamentos) -> dict:
    total_frete = sum((_dinheiro(e.valor_frete) for e in viagens), Decimal("0"))
    comissao = sum(
        ((_dinheiro(e.valor_frete) * TAXA_COMISSAO).quantize(CENTAVO, rounding=ROUND_HALF_UP) for e in viagens),
        Decimal("0"),
    )
    total_diarias = sum((_dinheiro(d.valor) for d in diarias), Decimal("0"))
    diarias_motorista = sum((dividir_diaria(d.valor)[0] for d in diarias), Decimal("0"))
    total_adiantamentos = sum((_dinheiro(a.valor) for a in adiantamentos), Decimal("0"))
    return {
        "total_frete": total_frete,
        "comissao": comissao,
        "total_diarias": total_diarias,
        "diarias_motorista": diarias_motorista,
        "total_adiantamentos": total_adiantamentos,
        "saldo": comissao + diarias_motorista - total_adiantamentos,
    }


def recalcular_acerto(acerto_id: int, db: Session) -> None:
    """Refaz os totais de um acerto já fechado a partir do que está preso a
    ele — usado quando um vale, uma diária ou o frete de uma viagem do acerto
    é corrigido depois do fechamento. O recibo gerado de novo sai certo."""
    acerto = db.query(Acerto).filter(Acerto.id == acerto_id).first()
    if not acerto:
        return
    db.flush()
    viagens = db.query(Entrega).filter(Entrega.acerto_id == acerto_id).all()
    diarias = db.query(Diaria).filter(Diaria.acerto_id == acerto_id).all()
    adiantamentos = db.query(Adiantamento).filter(Adiantamento.acerto_id == acerto_id).all()
    for campo, valor in _totais(viagens, diarias, adiantamentos).items():
        setattr(acerto, campo, valor)
    acerto.qtd_viagens = len(viagens)


def _pode_mexer(item, atual: Usuario, acao: str):
    """Item ainda pendente: qualquer usuário da equipe. Item de um acerto já
    fechado mexe num pagamento feito — só o administrador."""
    if item.acerto_id and atual.perfil != "administrador":
        raise HTTPException(
            status_code=403,
            detail=f"Este lançamento já está no acerto #{item.acerto_id}, que foi fechado. Só um administrador pode {acao}.",
        )


def _acerto_response(a: Acerto, classe=AcertoResponse, **extra):
    return classe(
        id=a.id, motorista_id=a.motorista_id, motorista=a.motorista.nome if a.motorista else None,
        periodo_inicio=a.periodo_inicio, periodo_fim=a.periodo_fim, qtd_viagens=a.qtd_viagens,
        total_frete=float(a.total_frete), comissao=float(a.comissao), total_diarias=float(a.total_diarias),
        diarias_motorista=float(a.diarias_motorista), total_adiantamentos=float(a.total_adiantamentos),
        saldo=float(a.saldo), observacao=a.observacao,
        fechado_por=a.fechado_por.nome if a.fechado_por else None, criado_em=a.criado_em, **extra,
    )


# ===================== ACERTOS =====================

@router.get("/acertos/previa", response_model=PreviaAcerto)
def previa_acerto(motorista_id: int, periodo_inicio: date, periodo_fim: date,
                  db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    motorista = _motorista_ou_404(motorista_id, db)
    if periodo_fim < periodo_inicio:
        raise HTTPException(status_code=400, detail="O fim do período não pode ser antes do início")
    viagens, diarias, adiantamentos = _pendencias(motorista_id, periodo_inicio, periodo_fim, db)
    totais = {k: float(v) for k, v in _totais(viagens, diarias, adiantamentos).items()}
    return PreviaAcerto(
        motorista_id=motorista.id, motorista=motorista.nome,
        periodo_inicio=periodo_inicio, periodo_fim=periodo_fim,
        viagens=[_serializar_viagem(e) for e in viagens],
        diarias=[_serializar_diaria(d) for d in diarias],
        adiantamentos=[AdiantamentoResponse.model_validate(a) for a in adiantamentos],
        **totais,
    )


@router.post("/acertos", response_model=AcertoResponse)
def fechar_acerto(dados: AcertoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    _motorista_ou_404(dados.motorista_id, db)
    if dados.periodo_fim > hoje_brasilia():
        raise HTTPException(status_code=400, detail="Não dá para fechar um acerto com data futura.")
    viagens, diarias, adiantamentos = _pendencias(dados.motorista_id, dados.periodo_inicio, dados.periodo_fim, db)
    if not (viagens or diarias or adiantamentos):
        raise HTTPException(status_code=400, detail="Nada a acertar nesse período: nenhuma viagem, diária ou adiantamento pendente.")

    totais = _totais(viagens, diarias, adiantamentos)
    acerto = Acerto(
        motorista_id=dados.motorista_id, periodo_inicio=dados.periodo_inicio, periodo_fim=dados.periodo_fim,
        qtd_viagens=len(viagens), observacao=dados.observacao, fechado_por_id=atual.id, **totais,
    )
    db.add(acerto)
    db.flush()
    for item in [*viagens, *diarias, *adiantamentos]:
        item.acerto_id = acerto.id
    db.commit()
    db.refresh(acerto)
    return _acerto_response(acerto)


@router.get("/acertos", response_model=List[AcertoResponse])
def listar_acertos(motorista_id: Optional[int] = None, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    query = db.query(Acerto)
    if motorista_id:
        query = query.filter(Acerto.motorista_id == motorista_id)
    return [_acerto_response(a) for a in query.order_by(Acerto.periodo_fim.desc(), Acerto.id.desc()).all()]


@router.get("/acertos/{id}", response_model=AcertoDetalhe)
def buscar_acerto(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    acerto = db.query(Acerto).filter(Acerto.id == id).first()
    if not acerto:
        raise HTTPException(status_code=404, detail="Acerto não encontrado")
    viagens = db.query(Entrega).filter(Entrega.acerto_id == id).order_by(Entrega.concluido_em).all()
    diarias = db.query(Diaria).filter(Diaria.acerto_id == id).order_by(Diaria.data).all()
    adiantamentos = db.query(Adiantamento).filter(Adiantamento.acerto_id == id).order_by(Adiantamento.data).all()
    return _acerto_response(
        acerto, AcertoDetalhe,
        viagens=[_serializar_viagem(e) for e in viagens],
        diarias=[_serializar_diaria(d) for d in diarias],
        adiantamentos=[AdiantamentoResponse.model_validate(a) for a in adiantamentos],
    )


@router.put("/acertos/{id}", response_model=AcertoResponse)
def atualizar_acerto(id: int, dados: AcertoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    """Corrige a observação que sai no recibo."""
    acerto = db.query(Acerto).filter(Acerto.id == id).first()
    if not acerto:
        raise HTTPException(status_code=404, detail="Acerto não encontrado")
    acerto.observacao = (dados.observacao or "").strip() or None
    db.commit()
    db.refresh(acerto)
    return _acerto_response(acerto)


@router.delete("/acertos/{id}")
def reabrir_acerto(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    """Desfaz um fechamento lançado errado: tudo volta a ficar pendente."""
    acerto = db.query(Acerto).filter(Acerto.id == id).first()
    if not acerto:
        raise HTTPException(status_code=404, detail="Acerto não encontrado")
    for modelo in (Entrega, Diaria, Adiantamento):
        db.query(modelo).filter(modelo.acerto_id == id).update({"acerto_id": None}, synchronize_session=False)
    db.delete(acerto)
    db.commit()
    return {"message": "Acerto reaberto: viagens, diárias e adiantamentos voltaram a ficar pendentes."}


# ===================== DIÁRIAS =====================

@router.get("/diarias", response_model=List[DiariaResponse])
def listar_diarias(motorista_id: Optional[int] = None, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    query = db.query(Diaria).join(Entrega, Entrega.id == Diaria.entrega_id)
    if motorista_id:
        query = query.filter(Entrega.motorista_id == motorista_id)
    return [_serializar_diaria(d) for d in query.order_by(Diaria.data.desc()).all()]


@router.post("/diarias", response_model=DiariaResponse)
def criar_diaria(dados: DiariaCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    entrega = db.query(Entrega).filter(Entrega.id == dados.entrega_id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    if entrega.status == "cancelado":
        raise HTTPException(status_code=400, detail="Entrega cancelada não recebe diária.")
    if not entrega.motorista_id:
        raise HTTPException(status_code=400, detail="Vincule um motorista à entrega antes de lançar a diária.")
    diaria = Diaria(**dados.model_dump())
    db.add(diaria)
    db.commit()
    db.refresh(diaria)
    return _serializar_diaria(diaria)


@router.put("/diarias/{id}", response_model=DiariaResponse)
def atualizar_diaria(id: int, dados: DiariaUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    diaria = db.query(Diaria).filter(Diaria.id == id).first()
    if not diaria:
        raise HTTPException(status_code=404, detail="Diária não encontrada")
    _pode_mexer(diaria, atual, "corrigir")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        if campo in ("data", "valor") and valor is None:
            continue  # obrigatórios: null não apaga
        setattr(diaria, campo, valor)
    if diaria.acerto_id:
        recalcular_acerto(diaria.acerto_id, db)
    db.commit()
    db.refresh(diaria)
    return _serializar_diaria(diaria)


@router.delete("/diarias/{id}")
def excluir_diaria(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    diaria = db.query(Diaria).filter(Diaria.id == id).first()
    if not diaria:
        raise HTTPException(status_code=404, detail="Diária não encontrada")
    _pode_mexer(diaria, atual, "excluir")
    acerto_id = diaria.acerto_id
    db.delete(diaria)
    if acerto_id:
        recalcular_acerto(acerto_id, db)
    db.commit()
    return {"message": "Diária excluída"}


# ===================== ADIANTAMENTOS =====================

@router.get("/adiantamentos", response_model=List[AdiantamentoResponse])
def listar_adiantamentos(motorista_id: Optional[int] = None, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    query = db.query(Adiantamento)
    if motorista_id:
        query = query.filter(Adiantamento.motorista_id == motorista_id)
    return query.order_by(Adiantamento.data.desc()).all()


@router.post("/adiantamentos", response_model=AdiantamentoResponse)
def criar_adiantamento(dados: AdiantamentoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    _motorista_ou_404(dados.motorista_id, db)
    adiantamento = Adiantamento(**dados.model_dump())
    db.add(adiantamento)
    db.commit()
    db.refresh(adiantamento)
    return adiantamento


@router.put("/adiantamentos/{id}", response_model=AdiantamentoResponse)
def atualizar_adiantamento(id: int, dados: AdiantamentoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    adiantamento = db.query(Adiantamento).filter(Adiantamento.id == id).first()
    if not adiantamento:
        raise HTTPException(status_code=404, detail="Adiantamento não encontrado")
    _pode_mexer(adiantamento, atual, "corrigir")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        if campo in ("data", "valor") and valor is None:
            continue  # obrigatórios: null não apaga
        setattr(adiantamento, campo, valor)
    if adiantamento.acerto_id:
        recalcular_acerto(adiantamento.acerto_id, db)
    db.commit()
    db.refresh(adiantamento)
    return adiantamento


@router.delete("/adiantamentos/{id}")
def excluir_adiantamento(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    adiantamento = db.query(Adiantamento).filter(Adiantamento.id == id).first()
    if not adiantamento:
        raise HTTPException(status_code=404, detail="Adiantamento não encontrado")
    _pode_mexer(adiantamento, atual, "excluir")
    acerto_id = adiantamento.acerto_id
    db.delete(adiantamento)
    if acerto_id:
        recalcular_acerto(acerto_id, db)
    db.commit()
    return {"message": "Adiantamento excluído"}
