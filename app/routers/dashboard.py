from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Date, func
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement
from datetime import date, datetime, time, timedelta
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
# Diária (estadia paga pelo cliente): 1/3 motorista, 1/3 caminhão, 1/3 empresa.
PARTE_MOTORISTA_DIARIA = 1 / 3

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
    comissao = receita_fretes * COMISSAO_MOTORISTA + receita_diarias * PARTE_MOTORISTA_DIARIA
    return entregas, manutencoes, abastecimentos, receita_bruta, custo_manutencao, custo_abastecimento, comissao, diarias

@router.get("/faturamento")
def faturamento(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    """Faturamento líquido do mês atual (visão da empresa): receita das entregas
    concluídas + diárias, menos manutenção, abastecimento e o que vai para o
    motorista (13% do frete + 1/3 das diárias) no período, detalhado por conjunto (veículo + motorista fixo). Movimento que
    não pertence a nenhum conjunto cadastrado entra como linha "Sem conjunto".
    Inclui também os totais do mês anterior, só pra comparação (sem detalhamento) —
    usando o MESMO NÚMERO DE DIAS decorridos, não o mês anterior inteiro. Sem isso,
    no dia 7 do mês a comparação seria "7 dias vs 31 dias", inflando/distorcendo a
    variação por pura diferença de tempo decorrido, não de desempenho real."""
    hoje = hoje_brasilia()
    inicio_mes = date(hoje.year, hoje.month, 1)
    fim_mes = date(hoje.year + 1, 1, 1) if hoje.month == 12 else date(hoje.year, hoje.month + 1, 1)
    inicio_mes_anterior = date(hoje.year - 1, 12, 1) if hoje.month == 1 else date(hoje.year, hoje.month - 1, 1)

    dias_decorridos = (hoje - inicio_mes).days + 1
    fim_mes_anterior_comparavel = min(inicio_mes_anterior + timedelta(days=dias_decorridos), inicio_mes)

    entregas, manutencoes, abastecimentos, receita_bruta, custo_manutencao, custo_abastecimento, comissao_total, diarias = \
        _totais_periodo(db, inicio_mes, fim_mes)
    _, _, _, receita_bruta_ant, custo_manutencao_ant, custo_abastecimento_ant, comissao_ant, _ = \
        _totais_periodo(db, inicio_mes_anterior, fim_mes_anterior_comparavel)

    conjuntos = db.query(Conjunto).filter(Conjunto.status != "inativo").all()
    motoristas = {m.id: m.nome for m in db.query(Motorista).filter(Motorista.status != "inativo").all()}
    placas_veiculos = {v.id: v.placa for v in db.query(Veiculo).all()}

    def placas_do_conjunto(c):
        return " / ".join(filter(None, (
            placas_veiculos.get(c.cavalo_id),
            placas_veiculos.get(c.semirreboque1_id),
            placas_veiculos.get(c.semirreboque2_id),
        )))

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
    conjunto_por_diaria = {d.id: conjunto_da_entrega(d.entrega, mapa_veiculos) for d in diarias}

    def diarias_do(conjunto_id=None, motorista_id=None):
        """Diárias do conjunto — ou, sem conjunto_id, as do motorista que não
        caem em conjunto nenhum (linha "Sem conjunto")."""
        if conjunto_id is not None:
            return sum(float(d.valor) for d in diarias
                       if conjunto_por_diaria[d.id] and conjunto_por_diaria[d.id].id == conjunto_id)
        return sum(float(d.valor) for d in diarias
                   if conjunto_por_diaria[d.id] is None and d.entrega.motorista_id == motorista_id)

    # Uma linha por conjunto (veículo + motorista fixo): receita das entregas
    # daquele conjunto, custo de abastecimento/manutenção dos veículos dele, e
    # comissão do motorista sobre essa receita. É o "quanto esse caminhão deu
    # de lucro pra transportadora", já considerando quem dirige ele.
    por_conjunto = []
    for c in conjuntos:
        veic_ids = mapa_veiculos[c.id]
        receita = sum(
            float(e.valor_frete or 0) for e in entregas
            if conjunto_por_entrega[e.id] and conjunto_por_entrega[e.id].id == c.id
        )
        receita_diarias = diarias_do(conjunto_id=c.id)
        abastecimento = sum(float(a.valor_total or 0) for a in abastecimentos if a.veiculo_id in veic_ids)
        manutencao = sum(float(m.custo or 0) for m in manutencoes if m.veiculo_id in veic_ids)
        comissao = receita * COMISSAO_MOTORISTA + receita_diarias * PARTE_MOTORISTA_DIARIA
        receita += receita_diarias
        if receita or abastecimento or manutencao:
            por_conjunto.append({
                "conjunto_id": c.id,
                "conjunto": c.nome,
                "placas": placas_do_conjunto(c),
                "motorista_id": c.motorista_id,
                "motorista": motoristas.get(c.motorista_id),
                "receita": receita,
                "abastecimento": abastecimento,
                "manutencao": manutencao,
                "comissao": comissao,
                "liquido": receita - abastecimento - manutencao - comissao
            })

    # Movimento que não pertence a nenhum conjunto: entrega feita por motorista/veículo
    # fora de qualquer conjunto cadastrado, ou abastecimento de um veículo avulso.
    # Sem isso esse faturamento e custo simplesmente desapareceriam do relatório.
    todos_veic_ids = set().union(*mapa_veiculos.values()) if mapa_veiculos else set()
    motoristas_com_movimento = {e.motorista_id for e in entregas if e.motorista_id} | \
                                {a.motorista_id for a in abastecimentos if a.motorista_id} | \
                                {d.entrega.motorista_id for d in diarias if d.entrega.motorista_id}
    for mid in motoristas_com_movimento:
        nome = motoristas.get(mid)
        if not nome:
            continue
        receita = sum(
            float(e.valor_frete or 0) for e in entregas
            if e.motorista_id == mid and conjunto_por_entrega[e.id] is None
        )
        abastecimento = sum(
            float(a.valor_total or 0) for a in abastecimentos
            if a.motorista_id == mid and a.veiculo_id not in todos_veic_ids
        )
        receita_diarias = diarias_do(motorista_id=mid)
        if receita or abastecimento or receita_diarias:
            comissao = receita * COMISSAO_MOTORISTA + receita_diarias * PARTE_MOTORISTA_DIARIA
            receita += receita_diarias
            por_conjunto.append({
                "conjunto_id": None,
                "conjunto": "Sem conjunto",
                "placas": "",
                "motorista_id": mid,
                "motorista": nome,
                "receita": receita,
                "abastecimento": abastecimento,
                "manutencao": 0,
                "comissao": comissao,
                "liquido": receita - abastecimento - comissao
            })

    por_conjunto.sort(key=lambda x: x["liquido"], reverse=True)

    return {
        "periodo": f"{hoje.year}-{hoje.month:02d}",
        "receita_bruta": receita_bruta,
        "custo_manutencao": custo_manutencao,
        "custo_abastecimento": custo_abastecimento,
        "comissao": comissao_total,
        "receita_diarias": sum(float(d.valor) for d in diarias),
        "faturamento_liquido": receita_bruta - custo_manutencao - custo_abastecimento - comissao_total,
        "por_conjunto": por_conjunto,
        "mes_anterior": {
            "receita_bruta": receita_bruta_ant,
            "custo_total": custo_manutencao_ant + custo_abastecimento_ant,
            "comissao": comissao_ant,
            "faturamento_liquido": receita_bruta_ant - custo_manutencao_ant - custo_abastecimento_ant - comissao_ant
        }
    }