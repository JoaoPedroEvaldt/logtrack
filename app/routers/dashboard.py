from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timedelta
from app.database import get_db
from app.models.entrega import Entrega
from app.models.veiculo import Veiculo
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.usuario import Usuario
from app.models.conjunto import Conjunto
from app.models.manutencao import Manutencao
from app.models.abastecimento import Abastecimento
from app.routers.auth import get_usuario_atual

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/publico/resumo")
def resumo_publico(db: Session = Depends(get_db)):
    """Contagens agregadas sem autenticação, usadas só como vitrine na tela de login."""
    entregas_ativas = db.query(Entrega).filter(
        Entrega.status.in_(["aguardando", "em_rota", "atrasado", "ocorrencia"])
    ).count()
    motoristas = db.query(Motorista).filter(Motorista.status != "inativo").count()
    veiculos = db.query(Veiculo).filter(Veiculo.status != "inativo").count()

    return {
        "entregas_ativas": entregas_ativas,
        "motoristas": motoristas,
        "veiculos": veiculos
    }

@router.get("/resumo")
def resumo(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
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

    motoristas_em_rota = [m for (m,) in db.query(Entrega.motorista_id).filter(
        Entrega.status == "em_rota", Entrega.motorista_id.isnot(None)
    ).distinct()]
    veiculos_em_rota = [v for (v,) in db.query(Entrega.veiculo_id).filter(
        Entrega.status == "em_rota", Entrega.veiculo_id.isnot(None)
    ).distinct()]

    veiculos_disponiveis = db.query(Veiculo).filter(
        Veiculo.status == "disponivel", ~Veiculo.id.in_(veiculos_em_rota)
    ).count()
    motoristas_disponiveis = db.query(Motorista).filter(
        Motorista.status == "disponivel", ~Motorista.id.in_(motoristas_em_rota)
    ).count()

    return {
        "entregas_hoje": entregas_hoje,
        "em_rota": em_rota,
        "concluidas_hoje": concluidas_hoje,
        "atrasadas": atrasadas,
        "ocorrencias_abertas": ocorrencias_abertas,
        "veiculos_disponiveis": veiculos_disponiveis,
        "motoristas_disponiveis": motoristas_disponiveis
    }

@router.get("/vencimentos")
def vencimentos(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    """CNH de motoristas e CRLV/seguro de veículos vencidos ou vencendo nos próximos 30 dias."""
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    hoje = date.today()
    limite = hoje + timedelta(days=30)
    alertas = []

    motoristas = db.query(Motorista).filter(
        Motorista.status != "inativo", Motorista.cnh_validade <= limite
    ).all()
    for m in motoristas:
        alertas.append({
            "tipo": "cnh",
            "referencia": m.nome,
            "validade": str(m.cnh_validade),
            "vencido": m.cnh_validade < hoje
        })

    veiculos = db.query(Veiculo).filter(Veiculo.status != "inativo").all()
    for v in veiculos:
        if v.crlv_validade and v.crlv_validade <= limite:
            alertas.append({
                "tipo": "crlv",
                "referencia": v.placa,
                "validade": str(v.crlv_validade),
                "vencido": v.crlv_validade < hoje
            })
        if v.seguro_validade and v.seguro_validade <= limite:
            alertas.append({
                "tipo": "seguro",
                "referencia": v.placa,
                "validade": str(v.seguro_validade),
                "vencido": v.seguro_validade < hoje
            })

    alertas.sort(key=lambda a: a["validade"])
    return alertas

@router.get("/entregas-por-status")
def entregas_por_status(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    resultado = db.query(
        Entrega.status,
        func.count(Entrega.id).label("total")
    ).group_by(Entrega.status).all()

    return [{"status": r.status, "total": r.total} for r in resultado]

@router.get("/entregas-por-dia")
def entregas_por_dia(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    resultado = db.query(
        func.date(Entrega.criado_em).label("dia"),
        func.count(Entrega.id).label("total")
    ).group_by(func.date(Entrega.criado_em)).order_by("dia").all()

    return [{"dia": str(r.dia), "total": r.total} for r in resultado]

@router.get("/desempenho-motoristas")
def desempenho_motoristas(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    faturamento = func.coalesce(
        func.sum(Entrega.valor_frete).filter(Entrega.status == "entregue"), 0
    )
    resultado = db.query(
        Motorista.nome,
        func.count(Entrega.id).label("total"),
        func.count(Entrega.id).filter(Entrega.status == "entregue").label("concluidas"),
        func.count(Entrega.id).filter(Entrega.status == "atrasado").label("atrasadas"),
        faturamento.label("faturamento")
    ).join(Entrega, Entrega.motorista_id == Motorista.id)\
     .filter(Motorista.status != "inativo")\
     .group_by(Motorista.id, Motorista.nome)\
     .order_by(faturamento.desc())\
     .all()

    return [
        {"motorista": r.nome, "total": r.total, "concluidas": r.concluidas, "atrasadas": r.atrasadas, "faturamento": float(r.faturamento)}
        for r in resultado
    ]

@router.get("/faturamento")
def faturamento(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    """Faturamento líquido do mês atual: receita das entregas concluídas menos
    custos de manutenção e abastecimento no período, com detalhamento por
    conjunto (via veículos do conjunto) e por motorista (via entregas/abastecimentos)."""
    if atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Acesso negado")
    hoje = date.today()
    inicio_mes = date(hoje.year, hoje.month, 1)
    fim_mes = date(hoje.year + 1, 1, 1) if hoje.month == 12 else date(hoje.year, hoje.month + 1, 1)

    entregas = db.query(Entrega).filter(
        Entrega.status == "entregue",
        Entrega.concluido_em >= inicio_mes,
        Entrega.concluido_em < fim_mes
    ).all()
    manutencoes = db.query(Manutencao).filter(
        Manutencao.data_manutencao >= inicio_mes,
        Manutencao.data_manutencao < fim_mes
    ).all()
    abastecimentos = db.query(Abastecimento).filter(
        Abastecimento.data_abastecimento >= inicio_mes,
        Abastecimento.data_abastecimento < fim_mes
    ).all()
    conjuntos = db.query(Conjunto).filter(Conjunto.status != "inativo").all()
    motoristas = {m.id: m.nome for m in db.query(Motorista).filter(Motorista.status != "inativo").all()}

    receita_bruta = sum(float(e.valor_frete or 0) for e in entregas)
    custo_manutencao = sum(float(m.custo or 0) for m in manutencoes)
    custo_abastecimento = sum(float(a.valor_total or 0) for a in abastecimentos)

    def veiculos_do_conjunto(c):
        return {c.cavalo_id, c.semirreboque1_id, c.semirreboque2_id} - {None}

    def conjunto_da_entrega(e, mapa_veiculos):
        for c in conjuntos:
            if e.motorista_id and c.motorista_id == e.motorista_id:
                return c
            if e.veiculo_id and e.veiculo_id in mapa_veiculos[c.id]:
                return c
        return None

    mapa_veiculos = {c.id: veiculos_do_conjunto(c) for c in conjuntos}

    conjunto_por_entrega = {e.id: conjunto_da_entrega(e, mapa_veiculos) for e in entregas}

    por_conjunto = []
    for c in conjuntos:
        veic_ids = mapa_veiculos[c.id]
        receita = sum(
            float(e.valor_frete or 0) for e in entregas
            if conjunto_por_entrega[e.id] and conjunto_por_entrega[e.id].id == c.id
        )
        custo = sum(float(m.custo or 0) for m in manutencoes if m.veiculo_id in veic_ids) + \
                sum(float(a.valor_total or 0) for a in abastecimentos if a.veiculo_id in veic_ids)
        if receita or custo:
            por_conjunto.append({
                "conjunto_id": c.id,
                "conjunto": c.nome,
                "receita": receita,
                "custo": custo,
                "liquido": receita - custo
            })
    por_conjunto.sort(key=lambda x: x["liquido"], reverse=True)

    por_motorista = []
    motoristas_com_movimento = {e.motorista_id for e in entregas if e.motorista_id} | \
                                {a.motorista_id for a in abastecimentos if a.motorista_id}
    for mid in motoristas_com_movimento:
        nome = motoristas.get(mid)
        if not nome:
            continue
        receita = sum(float(e.valor_frete or 0) for e in entregas if e.motorista_id == mid)
        custo = sum(float(a.valor_total or 0) for a in abastecimentos if a.motorista_id == mid)
        por_motorista.append({
            "motorista_id": mid,
            "motorista": nome,
            "receita": receita,
            "custo": custo,
            "comissao": receita * 0.13,
            "liquido": receita - custo
        })
    por_motorista.sort(key=lambda x: x["liquido"], reverse=True)

    return {
        "periodo": f"{hoje.year}-{hoje.month:02d}",
        "receita_bruta": receita_bruta,
        "custo_manutencao": custo_manutencao,
        "custo_abastecimento": custo_abastecimento,
        "faturamento_liquido": receita_bruta - custo_manutencao - custo_abastecimento,
        "por_conjunto": por_conjunto,
        "por_motorista": por_motorista
    }