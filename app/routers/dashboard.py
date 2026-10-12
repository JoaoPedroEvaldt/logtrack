from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Date, func
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from app.database import get_db
from app.models.entrega import Entrega
from app.models.veiculo import Veiculo
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.usuario import Usuario
from app.models.conjunto import Conjunto
from app.models.manutencao import Manutencao
from app.models.abastecimento import Abastecimento
from app.models.acerto import Diaria
from app.routers.auth import exigir_staff
from app.routers.entregas import filtro_em_viagem

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# criado_em/concluido_em ficam em UTC no banco e o servidor do Render roda em
# UTC; sem converter, o "dia" virava às 21h de Brasília (entrega concluída à
# noite contava como de amanhã). Brasil sem horário de verão desde 2019.
FUSO_BRASILIA = timedelta(hours=-3)

# Comissão do motorista: 13% do frete de cada entrega concluída, sem descontar
# abastecimento — vai somando frete a frete. Para a empresa ela é custo.
COMISSAO_MOTORISTA = 0.13
# Diária (estadia paga pelo cliente): 1/3 motorista (ver parte_motorista_diaria), 1/3 caminhão, 1/3 empresa.

def _centavos(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def comissao_frete(valor) -> float:
    """13% do frete arredondado ao centavo por viagem — igual ao acerto, para os
    as duas telas fecharem no centavo."""
    return float((_centavos(valor) * Decimal(str(COMISSAO_MOTORISTA))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def parte_motorista_diaria(valor) -> float:
    """1/3 da diária por lançamento, igual a dividir_diaria() do acerto."""
    return float((_centavos(valor) / 3).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def hoje_brasilia() -> date:
    return (datetime.utcnow() + FUSO_BRASILIA).date()

class dia_brasilia(FunctionElement):
    """Data (no fuso de Brasília) de uma coluna gravada em UTC. Compilado por
    banco porque o SQLite dos testes não sabe somar intervalo a timestamp."""
    type = Date()
    inherit_cache = True

@compiles(dia_brasilia)
def _dia_brasilia_pg(element, compiler, **kw):
    return "CAST((%s - INTERVAL '3 hours') AS DATE)" % compiler.process(element.clauses, **kw)

@compiles(dia_brasilia, "sqlite")
def _dia_brasilia_sqlite(element, compiler, **kw):
    return "date(%s, '-3 hours')" % compiler.process(element.clauses, **kw)

def inicio_do_dia_utc(dia: date) -> datetime:
    return datetime.combine(dia, time()) - FUSO_BRASILIA

@router.get("/resumo")
def resumo(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    hoje = hoje_brasilia()

    entregas_hoje = db.query(Entrega).filter(
        dia_brasilia(Entrega.criado_em) == hoje
    ).count()

    em_rota = db.query(Entrega).filter(Entrega.status == "em_rota").count()

    concluidas_hoje = db.query(Entrega).filter(
        Entrega.status == "entregue",
        dia_brasilia(Entrega.concluido_em) == hoje
    ).count()

    atrasadas = db.query(Entrega).filter(Entrega.status == "atrasado").count()

    ocorrencias_abertas = db.query(Ocorrencia).filter(Ocorrencia.status == "aberta").count()

    motoristas_em_rota = [m for (m,) in db.query(Entrega.motorista_id).filter(
        *filtro_em_viagem(), Entrega.motorista_id.isnot(None)
    ).distinct()]
    veiculos_em_rota = {v for (v,) in db.query(Entrega.veiculo_id).filter(
        *filtro_em_viagem(), Entrega.veiculo_id.isnot(None)
    ).distinct()}
    # A entrega guarda só o cavalo; a carreta engatada nele (conjunto ativo)
    # viaja junto e também não está disponível.
    for c in db.query(Conjunto).filter(Conjunto.status == "ativo", Conjunto.cavalo_id.in_(veiculos_em_rota)):
        veiculos_em_rota.update(v for v in (c.semirreboque1_id, c.semirreboque2_id) if v)

    veiculos_disponiveis = db.query(Veiculo).filter(
        Veiculo.status == "disponivel", ~Veiculo.id.in_(list(veiculos_em_rota))
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

DIAS_VIAGEM_ESQUECIDA = 2  # dias depois da previsão de entrega para avisar

@router.get("/vencimentos")
def vencimentos(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    """CNH de motoristas e CRLV/seguro de veículos vencidos ou vencendo nos
    próximos 30 dias, e viagens esquecidas abertas (ver DIAS_VIAGEM_ESQUECIDA)."""
    hoje = hoje_brasilia()
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

    # Viagem que ninguém fechou: continua "em rota" dias depois da previsão de
    # entrega e prende o motorista e o caminhão (não aparecem livres para uma
    # nova entrega). Ex.: uma viagem de teste ficou aberta de julho a outubro.
    limite_viagem = hoje - timedelta(days=DIAS_VIAGEM_ESQUECIDA)
    abertas = db.query(Entrega).filter(Entrega.status.in_(["em_rota", "atrasado", "ocorrencia"])).all()
    nomes = {m.id: m.nome for m in db.query(Motorista).all()}
    for e in abertas:
        if e.previsao and e.previsao.date() < limite_viagem:
            motorista = nomes.get(e.motorista_id, "sem motorista")
            alertas.append({
                "tipo": "viagem",
                "referencia": f"Entrega #{e.id} — {e.cliente} ({motorista})",
                "validade": str(e.previsao.date()),
                "vencido": True,
            })

    alertas.sort(key=lambda a: a["validade"])
    return alertas

@router.get("/entregas-por-status")
def entregas_por_status(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    resultado = db.query(
        Entrega.status,
        func.count(Entrega.id).label("total")
    ).group_by(Entrega.status).all()

    return [{"status": r.status, "total": r.total} for r in resultado]

@router.get("/entregas-por-dia")
def entregas_por_dia(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    dia = dia_brasilia(Entrega.criado_em)
    resultado = db.query(
        dia.label("dia"),
        func.count(Entrega.id).label("total")
    ).group_by(dia).order_by(dia).all()

    return [{"dia": str(r.dia), "total": r.total} for r in resultado]

@router.get("/desempenho-motoristas")
def desempenho_motoristas(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    faturamento = func.coalesce(
        func.sum(Entrega.valor_frete).filter(Entrega.status == "entregue"), 0
    )
    resultado = db.query(
        Motorista.id,
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
        {"motorista_id": r.id, "motorista": r.nome, "total": r.total, "concluidas": r.concluidas, "atrasadas": r.atrasadas, "faturamento": float(r.faturamento),
         "comissao": float(r.faturamento) * COMISSAO_MOTORISTA}
        for r in resultado
    ]

def _totais_periodo(db: Session, inicio: date, fim: date):
    """Receita e custos brutos do período, sem detalhamento — usado pra comparar
    o mês atual com o anterior sem duplicar a query inteira de novo."""
    entregas = db.query(Entrega).filter(
        Entrega.status == "entregue",
        Entrega.concluido_em >= inicio_do_dia_utc(inicio),
        Entrega.concluido_em < inicio_do_dia_utc(fim)
    ).all()
    manutencoes = db.query(Manutencao).filter(
        Manutencao.data_manutencao >= inicio,
        Manutencao.data_manutencao < fim
    ).all()
    abastecimentos = db.query(Abastecimento).filter(
        Abastecimento.data_abastecimento >= inicio,
        Abastecimento.data_abastecimento < fim
    ).all()
    diarias = db.query(Diaria).join(Entrega, Entrega.id == Diaria.entrega_id).filter(
        Entrega.status != "cancelado",
        Diaria.data >= inicio,
        Diaria.data < fim
    ).all()
    receita_fretes = sum(float(e.valor_frete or 0) for e in entregas)
    receita_diarias = sum(float(d.valor) for d in diarias)
    receita_bruta = receita_fretes + receita_diarias
    custo_manutencao = sum(float(m.custo or 0) for m in manutencoes)
    custo_abastecimento = sum(float(a.valor_total or 0) for a in abastecimentos)
    # Pago aos motoristas: 13% do frete + a parte deles (1/3) nas diárias.
    comissao = sum(comissao_frete(e.valor_frete) for e in entregas) + sum(parte_motorista_diaria(d.valor) for d in diarias)
    return entregas, manutencoes, abastecimentos, receita_bruta, custo_manutencao, custo_abastecimento, comissao, diarias

@router.get("/faturamento")
def faturamento(inicio: date | None = None, fim: date | None = None,
                db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    """Faturamento líquido de um período (visão da empresa): receita das entregas
    concluídas + diárias, menos manutenção, abastecimento e o que vai para o
    motorista (13% do frete + 1/3 das diárias), detalhado por conjunto (veículo + motorista fixo). Movimento que
    não pertence a nenhum conjunto cadastrado entra como linha "Sem conjunto".
    `inicio` e `fim` (inclusive) escolhem o período; sem eles vale o mês atual.
    Inclui também os totais do período anterior de MESMA DURAÇÃO, só pra comparação
    (sem detalhamento). No mês atual, o mês passado também é cortado nos mesmos
    dias decorridos — senão, no dia 7, seria "7 dias vs 31 dias" e a variação
    refletiria o tempo, não o desempenho."""
    hoje = hoje_brasilia()
    if inicio is None and fim is None:
        inicio = date(hoje.year, hoje.month, 1)
        fim_mes = date(hoje.year + 1, 1, 1) if hoje.month == 12 else date(hoje.year, hoje.month + 1, 1)
        fim = fim_mes - timedelta(days=1)
        inicio_ant = date(hoje.year - 1, 12, 1) if hoje.month == 1 else date(hoje.year, hoje.month - 1, 1)
        dias = (hoje - inicio).days + 1
        fim_ant_excl = min(inicio_ant + timedelta(days=dias), inicio)
    else:
        inicio = inicio or fim
        fim = fim or inicio
        if fim < inicio:
            raise HTTPException(status_code=400, detail="A data final não pode ser anterior à inicial")
        if (fim - inicio).days > 366:
            raise HTTPException(status_code=400, detail="Período máximo de 1 ano")
        dias = (fim - inicio).days + 1
        inicio_ant = inicio - timedelta(days=dias)
        fim_ant_excl = inicio
    fim_excl = fim + timedelta(days=1)

    entregas, manutencoes, abastecimentos, receita_bruta, custo_manutencao, custo_abastecimento, comissao_total, diarias =         _totais_periodo(db, inicio, fim_excl)
    _, _, _, receita_bruta_ant, custo_manutencao_ant, custo_abastecimento_ant, comissao_ant, _ =         _totais_periodo(db, inicio_ant, fim_ant_excl)

    conjuntos = db.query(Conjunto).filter(Conjunto.status != "inativo").all()
    # Todos os motoristas (inclusive inativos): quem trabalhou no mês e foi
    # desativado depois ainda tem movimento a mostrar.
    motoristas = {m.id: m.nome for m in db.query(Motorista).all()}
    placas_veiculos = {v.id: v.placa for v in db.query(Veiculo).all()}

    def placas_do_conjunto(c):
        return " / ".join(filter(None, (
            placas_veiculos.get(c.cavalo_id),
            placas_veiculos.get(c.semirreboque1_id),
            placas_veiculos.get(c.semirreboque2_id),
        )))

    mapa_veiculos = {c.id: {c.cavalo_id, c.semirreboque1_id, c.semirreboque2_id} - {None} for c in conjuntos}
    todos_veic_ids = set().union(*mapa_veiculos.values()) if mapa_veiculos else set()

    def conjunto_da_entrega(e):
        """O veículo manda: o caminhão que rodou pertence a um conjunto, mesmo
        com um motorista reserva no volante. Só sem veículo conhecido vale o
        motorista fixo. Assim cada entrega cai em UM conjunto, sem depender da
        ordem da lista."""
        if e.veiculo_id:
            for c in conjuntos:
                if e.veiculo_id in mapa_veiculos[c.id]:
                    return c
        if e.motorista_id:
            for c in conjuntos:
                if c.motorista_id == e.motorista_id:
                    return c
        return None

    conjunto_por_entrega = {e.id: conjunto_da_entrega(e) for e in entregas}
    conjunto_por_diaria = {d.id: conjunto_da_entrega(d.entrega) for d in diarias}

    def linha(receita_fretes, comissao_fretes, receita_diarias, comissao_diarias, abastecimento, manutencao, qtd_entregas, **ident):
        receita = receita_fretes + receita_diarias
        comissao = comissao_fretes + comissao_diarias
        return {
            **ident,
            "entregas": qtd_entregas,
            "receita": receita,
            "abastecimento": abastecimento,
            "manutencao": manutencao,
            "comissao": comissao,
            "liquido": receita - abastecimento - manutencao - comissao,
        }

    def soma_entregas(lista):
        return sum(float(e.valor_frete or 0) for e in lista), sum(comissao_frete(e.valor_frete) for e in lista)

    def soma_diarias(lista):
        return sum(float(d.valor) for d in lista), sum(parte_motorista_diaria(d.valor) for d in lista)

    # Uma linha por conjunto: receita das entregas do conjunto, abastecimento e
    # manutenção dos veículos dele, e a comissão paga sobre essa receita (a de
    # quem dirigiu de fato). Mostra o "quanto esse caminhão deu de lucro".
    por_conjunto = []
    for c in conjuntos:
        veic_ids = mapa_veiculos[c.id]
        ents = [e for e in entregas if conjunto_por_entrega[e.id] is c]
        dias = [d for d in diarias if conjunto_por_diaria[d.id] is c]
        abastecimento = sum(float(a.valor_total or 0) for a in abastecimentos if a.veiculo_id in veic_ids)
        manutencao = sum(float(m.custo or 0) for m in manutencoes if m.veiculo_id in veic_ids)
        if ents or dias or abastecimento or manutencao:
            por_conjunto.append(linha(
                *soma_entregas(ents), *soma_diarias(dias), abastecimento, manutencao, len(ents),
                conjunto_id=c.id, conjunto=c.nome, placas=placas_do_conjunto(c),
                motorista_id=c.motorista_id, motorista=motoristas.get(c.motorista_id),
            ))

    # Tudo que não caiu em nenhum conjunto (motorista avulso, veículo fora de
    # conjunto, conjunto inativo, manutenção sem motorista) vira linha "Sem
    # conjunto", por motorista — assim a soma da tabela fecha com os cards.
    def sem_conjunto(mid):
        ents = [e for e in entregas if conjunto_por_entrega[e.id] is None and e.motorista_id == mid]
        dias = [d for d in diarias if conjunto_por_diaria[d.id] is None and d.entrega.motorista_id == mid]
        abast = sum(float(a.valor_total or 0) for a in abastecimentos
                    if a.veiculo_id not in todos_veic_ids and a.motorista_id == mid)
        manut = sum(float(m.custo or 0) for m in manutencoes
                    if m.veiculo_id not in todos_veic_ids) if mid is None else 0
        return ents, dias, abast, manut

    chaves = {e.motorista_id for e in entregas if conjunto_por_entrega[e.id] is None} |              {d.entrega.motorista_id for d in diarias if conjunto_por_diaria[d.id] is None} |              {a.motorista_id for a in abastecimentos if a.veiculo_id not in todos_veic_ids} |              ({None} if any(m.veiculo_id not in todos_veic_ids for m in manutencoes) else set())
    for mid in chaves:
        ents, dias, abast, manut = sem_conjunto(mid)
        if ents or dias or abast or manut:
            por_conjunto.append(linha(
                *soma_entregas(ents), *soma_diarias(dias), abast, manut, len(ents),
                conjunto_id=None, conjunto="Sem conjunto", placas="",
                motorista_id=mid, motorista=motoristas.get(mid),
            ))

    por_conjunto.sort(key=lambda x: x["liquido"], reverse=True)

    return {
        "periodo": f"{inicio.year}-{inicio.month:02d}",
        "inicio": str(inicio),
        "fim": str(fim),
        "entregas": len(entregas),
        "receita_bruta": receita_bruta,
        "custo_manutencao": custo_manutencao,
        "custo_abastecimento": custo_abastecimento,
        "comissao": comissao_total,
        "receita_diarias": sum(float(d.valor) for d in diarias),
        "faturamento_liquido": receita_bruta - custo_manutencao - custo_abastecimento - comissao_total,
        "por_conjunto": por_conjunto,
        "por_entrega": [
            {
                "id": e.id,
                "concluido_em": e.concluido_em.isoformat() if e.concluido_em else None,
                "cliente": e.cliente,
                "origem": e.origem,
                "destino": e.destino,
                "motorista": motoristas.get(e.motorista_id),
                "conjunto": conjunto_por_entrega[e.id].nome if conjunto_por_entrega[e.id] else None,
                "placas": placas_do_conjunto(conjunto_por_entrega[e.id]) if conjunto_por_entrega[e.id] else "",
                "valor_frete": float(e.valor_frete or 0),
                "comissao": comissao_frete(e.valor_frete),
            }
            for e in sorted(entregas, key=lambda e: e.concluido_em or datetime.min, reverse=True)
        ],
        "mes_anterior": {
            "receita_bruta": receita_bruta_ant,
            "custo_total": custo_manutencao_ant + custo_abastecimento_ant,
            "comissao": comissao_ant,
            "faturamento_liquido": receita_bruta_ant - custo_manutencao_ant - custo_abastecimento_ant - comissao_ant
        }
    }