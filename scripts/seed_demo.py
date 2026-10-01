"""Popula o banco do AMBIENTE DE DEMONSTRACAO do LogTrack com dados ficticios
realistas -- o ambiente que os professores da banca recebem para testar o
sistema sem tocar nos dados reais da transportadora.

O que e criado (tudo inventado, nenhum dado real):
  - 2 logins: administrador (banca) e operador;
  - 10 motoristas (8 com conjunto, 1 reserva, 1 inativo), CPFs validos gerados;
  - 8 conjuntos = 8 cavalos + 8 semirreboques (16 placas);
  - ~4 meses de historico de viagens por conjunto, encadeadas (o destino de
    uma e o ponto de partida da seguinte), com o deslocamento vazio entre
    elas, planejamento (km/tempo estimado), abastecimentos ao longo do caminho,
    manutencoes e ocorrencias;
  - o "agora": caminhoes em rota, um atrasado, um com ocorrencia aberta, um
    parado em manutencao e cargas aguardando saida.

Os dados vao direto pro banco (SQLAlchemy), nao pela API, porque a API marca
iniciado_em/concluido_em com o horario atual -- nao daria pra montar historico.
O schema precisa existir antes (`alembic upgrade head`, que o Dockerfile ja
roda a cada deploy).

SEGURANCA: o script so escreve num banco vazio ou num banco que so tenha os
logins de demonstracao (e-mails @logtrack.demo). Se encontrar qualquer outro
usuario -- como no banco real -- ele para sem mexer em nada, mesmo com --reset.

Uso:
    # popular um banco de demo vazio (pede confirmacao)
    python scripts/seed_demo.py --database-url "postgresql://..."

    # apagar tudo e popular de novo (entre uma banca e outra)
    python scripts/seed_demo.py --database-url "postgresql://..." --reset

    --senha define a senha dos logins (senao uma aleatoria e gerada e mostrada);
    --sim pula a confirmacao interativa. Sem --database-url usa o DATABASE_URL
    do .env.
"""
import argparse
import json
import math
import random
import secrets
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app import auth
from app.database import Base
from app.models import (  # noqa: F401 - registra todas as tabelas em Base.metadata
    Conjunto, Entrega, LogAcesso, Manutencao, Motorista, Ocorrencia, Usuario, Veiculo,
)
from app.models.abastecimento import Abastecimento
from app.models.deslocamento_vazio import DeslocamentoVazio

DOMINIO_DEMO = "@logtrack.demo"
EMAIL_ADMIN = "banca" + DOMINIO_DEMO
EMAIL_OPERADOR = "operador" + DOMINIO_DEMO

INICIO_HISTORICO = date(2026, 6, 1)

# ---------------------------------------------------------------- frota/pessoas

MOTORISTAS = [
    "Adair Schneider", "Valdir Kunz", "Rogério Becker", "Leandro Muniz",
    "Gilmar Fontoura", "Cleiton Rambo", "Sérgio Petry", "Daniel Wagner",
    "Paulo Ritter",      # reserva, sem conjunto
    "Ivo Hartmann",      # inativo (saiu da empresa)
]

# (placa, marca, modelo, ano, cor)
CAVALOS = [
    ("DMO1A11", "VOLVO", "FH-460 GLOBETROTTER 6X2", 2023, "Branco"),
    ("DMO2B22", "VOLVO", "FH-540 GLOBETROTTER 6X4", 2025, "Prata"),
    ("DMO3C33", "SCANIA", "R-450 A 6X2", 2022, "Vermelho"),
    ("DMO4D44", "VOLVO", "FH-500 GLOBETROTTER 4X2", 2026, "Azul"),
    ("DMO5E55", "SCANIA", "R-460 A 6X2", 2024, "Branco"),
    ("DMO6F66", "MERCEDES-BENZ", "ACTROS 2651 6X4", 2021, "Branco"),
    ("DMO7G77", "DAF", "XF 530 FTS 6X2", 2023, "Cinza"),
    ("DMO8H88", "VOLVO", "FH-460 GLOBETROTTER 6X2", 2019, "Verde"),
]

# (placa, marca, modelo, ano, subtipo, eixos, tipo_eixo, capacidade_kg)
SEMIRREBOQUES = [
    ("DMS1A11", "FACCHINI", "SR/FACCHINI SRF LO", 2022, "sider", 3, "ls", 33000),
    ("DMS2B22", "LIBRELATO", "SR/LIBRELATO BTLOENCR 3E", 2024, "sider", 3, "ls", 34000),
    ("DMS3C33", "RANDON", "SR/RANDON GRANELEIRO 4E", 2021, "graneleiro", 4, None, 40000),
    ("DMS4D44", "FACCHINI", "SR/FACCHINI SRF LO", 2026, "sider", 3, "vanderleia", 33000),
    ("DMS5E55", "GUERRA", "SR/GUERRA BAU 3E", 2023, "bau", 3, "ls", 30000),
    ("DMS6F66", "ESTRADA", "SR ESTRADA CG/4E", 2020, "graneleiro", 4, None, 40000),
    ("DMS7G77", "RODOFORT", "SR/RODOFORT SIDER 3E", 2022, "sider", 3, "ls", 33000),
    ("DMS8H88", "LIBRELATO", "SR/LIBRELATO BAU FRIGO 3E", 2018, "bau_frigorifico", 3, "ls", 28000),
]

# ---------------------------------------------------------------- mercado

# Cargas que saem do RS, e cargas de retorno de cada estado de volta (ou em
# triangulo). Cidades no formato "Cidade - UF" da lista do IBGE, igual o
# formulario de entregas usa.
SAIDAS_RS = [
    ("Calçados Vale do Sinos", "Novo Hamburgo - RS", "Calçados em caixas"),
    ("Moinho Sul Alimentos", "Canoas - RS", "Farinha de trigo ensacada"),
    ("Metalúrgica Gravataí", "Gravataí - RS", "Peças metálicas paletizadas"),
    ("Cooperativa Serra Gaúcha", "Caxias do Sul - RS", "Componentes automotivos"),
    ("Tabacos Santa Cruz", "Santa Cruz do Sul - RS", "Fumo em fardos"),
    ("Arroz Lagoa Dourada", "Viamão - RS", "Arroz ensacado 5kg"),
    ("Plásticos Sapucaia", "Sapucaia do Sul - RS", "Embalagens plásticas"),
    ("Móveis Litoral Norte", "Osório - RS", "Móveis desmontados"),
]
DESTINOS_SAIDA = [
    "Louveira - SP", "Cajamar - SP", "Guarulhos - SP", "Jundiaí - SP", "Campinas - SP",
    "Extrema - MG", "Contagem - MG", "Santa Luzia - MG",
    "Curitiba - PR", "São José dos Pinhais - PR", "Ponta Grossa - PR",
    "Joinville - SC", "Itajaí - SC",
    "Duque de Caxias - RJ", "Piraí - RJ",
    "João Pessoa - PB", "Recife - PE", "Feira de Santana - BA",
]
# estado -> [(cliente, origem, carga)]
RETORNOS = {
    "SP": [("Distribuidora Paulista", "Cajamar - SP", "Mercadoria de varejo"),
           ("Química Jundiaí", "Jundiaí - SP", "Produtos de limpeza"),
           ("Bebidas Campinas", "Campinas - SP", "Bebidas em fardos")],
    "MG": [("Siderúrgica Contagem", "Contagem - MG", "Bobinas de aço"),
           ("Cerâmica Santa Luzia", "Santa Luzia - MG", "Revestimento cerâmico")],
    "PR": [("Papel Campos Gerais", "Ponta Grossa - PR", "Papel em bobinas"),
           ("Autopeças Pinhais", "São José dos Pinhais - PR", "Autopeças")],
    "SC": [("Têxtil Vale do Itajaí", "Blumenau - SC", "Tecidos em rolos"),
           ("Porto Itajaí Logística", "Itajaí - SC", "Carga de importação")],
    "RJ": [("Aços Piraí", "Piraí - RJ", "Perfis de aço")],
    "PB": [("Cimento Paraíba", "João Pessoa - PB", "Cimento ensacado")],
    "PE": [("Gesso Araripe", "Recife - PE", "Gesso em placas")],
    "BA": [("Celulose Bahia", "Feira de Santana - BA", "Celulose em fardos")],
}
DESTINOS_RETORNO_RS = [
    "Sapucaia do Sul - RS", "Gravataí - RS", "Porto Alegre - RS", "Caxias do Sul - RS",
    "Canoas - RS", "Pelotas - RS", "Passo Fundo - RS", "Santa Maria - RS",
]
POSTOS = ["Posto Graal", "Posto Rota", "Posto Mazuco", "Posto JAM", "Posto Sinuelo", "Posto Trevão"]

# ---------------------------------------------------------------- geografia

_municipios = None


def coordenadas(cidade: str):
    """("Cidade - UF") -> (lat, lon), pela mesma lista que o frontend usa."""
    global _municipios
    if _municipios is None:
        lista = json.loads((RAIZ / "frontend/data/municipios.json").read_text(encoding="utf-8"))
        _municipios = {f"{nome} - {uf}": (lat, lon) for nome, uf, lat, lon in lista}
    return _municipios[cidade]


def km_rodoviario(a: str, b: str) -> float:
    """Distancia em linha reta x 1,22 (fator medio estrada/linha reta nas
    rotas da empresa) -- suficiente pra dado de demonstracao, sem depender do
    OSRM na hora de popular."""
    if a == b:
        return 0.0
    (la1, lo1), (la2, lo2) = coordenadas(a), coordenadas(b)
    p1, p2 = math.radians(la1), math.radians(la2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h)) * 1.22


def uf(cidade: str) -> str:
    return cidade.rsplit(" - ", 1)[1]


def tempo_viagem_h(km: float) -> float:
    """Mesma estimativa do formulario de entregas (estimarViagemCaminhao +
    simularViagemComParadasLegais em frontend/js/api.js): 90 km/h x 0,85,
    pausa de 30min a cada 5h30 de direcao, descanso de 11h a cada 8h no dia,
    abastecimento a cada 700 km e posto fiscal por divisa (aqui estimado
    em uma divisa a cada 450 km)."""
    restante = km / (90 * 0.85)
    decorrido = continua = dia = 0.0
    descansos = 0
    while restante > 1e-9:
        bloco = min(restante, 5.5 - continua, 8 - dia)
        decorrido += bloco
        restante -= bloco
        continua += bloco
        dia += bloco
        if restante <= 1e-9:
            break
        if dia >= 8 - 1e-9:
            decorrido += 11
            descansos += 1
            dia = continua = 0
        elif continua >= 5.5 - 1e-9:
            decorrido += 0.5
            continua = 0
    abastecimentos = max(0, int(km // 700) - descansos)
    divisas = int(km // 450)
    return decorrido + abastecimentos * 0.75 + divisas * 0.5


# ---------------------------------------------------------------- utilitarios

def gerar_cpf() -> str:
    digitos = [random.randint(0, 9) for _ in range(9)]
    for pos in (9, 10):
        soma = sum(digitos[i] * (pos + 1 - i) for i in range(pos))
        digitos.append((soma * 10 % 11) % 10)
    return "".join(str(d) for d in digitos)


def gerar_cnh() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(11))


def arredondar_hora(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1 if dt.minute >= 30 else 0)


def horario_de_saida(dt: datetime) -> datetime:
    """Carregamento libera o caminhao entre 6h e 20h."""
    dt = arredondar_hora(dt)
    if dt.hour < 6:
        return dt.replace(hour=6)
    if dt.hour > 20:
        return (dt + timedelta(days=1)).replace(hour=6)
    return dt


def host_do_banco(url: str) -> str:
    u = make_url(url)
    return f"{u.host or 'local'}/{u.database}"


# ---------------------------------------------------------------- seguranca

def conferir_banco_de_demo(db, reset: bool) -> None:
    """Para o script se o banco tiver qualquer sinal de dados reais."""
    emails = [e for (e,) in db.execute(text("SELECT email FROM usuarios"))]
    estranhos = [e for e in emails if not e.endswith(DOMINIO_DEMO)]
    if estranhos:
        sys.exit(f"ABORTADO: o banco tem usuarios que nao sao de demonstracao ({len(estranhos)}). "
                 "Isto parece o banco real -- nada foi alterado.")
    tem_dados = db.execute(text("SELECT EXISTS (SELECT 1 FROM motoristas) OR EXISTS (SELECT 1 FROM entregas)")).scalar()
    if tem_dados and not emails:
        sys.exit("ABORTADO: o banco tem dados mas nenhum login de demonstracao -- nada foi alterado.")
    if tem_dados and not reset:
        sys.exit("O banco de demonstracao ja tem dados. Use --reset para apagar e popular de novo.")


def apagar_tudo(db) -> None:
    tabelas = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tabelas} RESTART IDENTITY CASCADE"))


# ---------------------------------------------------------------- populacao

def criar_usuarios(db, senha: str):
    admin = Usuario(nome="Banca Avaliadora", email=EMAIL_ADMIN,
                    senha_hash=auth.gerar_hash_senha(senha), perfil="administrador")
    operador = Usuario(nome="Operador Demo", email=EMAIL_OPERADOR,
                       senha_hash=auth.gerar_hash_senha(senha), perfil="operador")
    db.add_all([admin, operador])
    db.flush()
    return admin, operador


def criar_frota(db, hoje: date):
    motoristas = []
    for i, nome in enumerate(MOTORISTAS):
        validade = hoje + timedelta(days=random.randint(200, 1500))
        if i == 3:
            validade = hoje + timedelta(days=18)  # aparece no alerta de vencimentos
        m = Motorista(
            nome=nome, cpf=gerar_cpf(), cnh_numero=gerar_cnh(), cnh_categoria="E",
            cnh_validade=validade, telefone=f"(51) 9{random.randint(8000, 9999)}-{random.randint(1000, 9999)}",
            status="inativo" if i == 9 else "disponivel",
        )
        motoristas.append(m)

    cavalos = []
    for i, (placa, marca, modelo, ano, cor) in enumerate(CAVALOS):
        cavalos.append(Veiculo(
            placa=placa, marca=marca, modelo=modelo, ano=ano, tipo="cavalo", cor=cor,
            capacidade_kg=1000, status="disponivel",
            crlv_validade=hoje + timedelta(days=25 if i == 5 else random.randint(90, 330)),
            seguro_validade=hoje - timedelta(days=4) if i == 7 else hoje + timedelta(days=random.randint(60, 360)),
        ))
    semis = []
    for placa, marca, modelo, ano, subtipo, eixos, tipo_eixo, cap in SEMIRREBOQUES:
        semis.append(Veiculo(
            placa=placa, marca=marca, modelo=modelo, ano=ano, tipo="semirreboque", subtipo=subtipo,
            eixos=eixos, tipo_eixo=tipo_eixo, capacidade_kg=cap, status="disponivel",
            crlv_validade=hoje + timedelta(days=random.randint(90, 330)),
        ))
    db.add_all(motoristas + cavalos + semis)
    db.flush()

    conjuntos = []
    for i in range(8):
        conjuntos.append(Conjunto(
            nome=f"Conjunto {i + 1:02d} — {cavalos[i].placa}",
            motorista_id=motoristas[i].id, cavalo_id=cavalos[i].id, semirreboque1_id=semis[i].id,
        ))
    db.add_all(conjuntos)
    db.flush()
    return motoristas, cavalos, semis, conjuntos


def proxima_carga(posicao: str):
    """Escolhe a proxima carga a partir de onde o caminhao esta."""
    estado = uf(posicao)
    if estado == "RS":
        cliente, origem, carga = random.choice(SAIDAS_RS)
        destino = random.choice(DESTINOS_SAIDA)
        return cliente, origem, destino, carga
    opcoes = RETORNOS.get(estado) or [c for lista in RETORNOS.values() for c in lista]
    cliente, origem, carga = min(opcoes, key=lambda c: km_rodoviario(posicao, c[1]) + random.uniform(0, 150))
    if random.random() < 0.2 and estado in ("SP", "MG", "PR"):
        destino = random.choice(["João Pessoa - PB", "Recife - PE", "Feira de Santana - BA"])  # triangulo
    else:
        destino = random.choice(DESTINOS_RETORNO_RS)
    return cliente, origem, destino, carga


def simular_conjunto(db, idx, conjunto, motorista, cavalo, operador, agora, em_manutencao):
    """Viagens encadeadas de um conjunto, do inicio do historico ate agora."""
    t = datetime.combine(INICIO_HISTORICO + timedelta(days=idx * 2), time(7, 0))
    posicao = random.choice(SAIDAS_RS)[1]
    km_odometro = random.randint(180_000, 520_000)
    anterior = None  # ultima entrega concluida deste cavalo
    resumo = {"entregas": 0}

    while True:
        cliente, origem, destino, carga = proxima_carga(posicao)
        if origem == destino:
            continue
        km_vazio = km_rodoviario(posicao, origem)
        km = km_rodoviario(origem, destino)
        estimado_h = tempo_viagem_h(km)
        saida = horario_de_saida(t + timedelta(hours=km_vazio / 65 + random.uniform(6, 30)))
        previsao = arredondar_hora(saida + timedelta(hours=estimado_h + random.uniform(4, 20)))
        chegada = saida + timedelta(hours=estimado_h * random.uniform(0.92, 1.12))
        atrasa = random.random() < 0.08
        if atrasa:
            chegada = previsao + timedelta(hours=random.uniform(3, 14))

        # Caminhao em manutencao: para depois da ultima viagem concluida.
        if em_manutencao and chegada > agora - timedelta(days=6):
            return anterior, km_odometro, resumo

        entrega = Entrega(
            cliente=cliente, origem=origem, destino=destino, descricao_carga=carga,
            peso_kg=random.randrange(24000, 37500, 500),
            valor_frete=max(4500, round(km * random.uniform(6.8, 9.0) / 50) * 50),
            motorista_id=motorista.id, veiculo_id=cavalo.id,
            previsao=previsao, saida_prevista=saida,
            distancia_km=round(km, 1), tempo_estimado_h=round(estimado_h, 1),
            criado_em=saida - timedelta(days=random.uniform(1, 4)),
        )

        if saida > agora:
            entrega.status = "aguardando"
            db.add(entrega)
            resumo["entregas"] += 1
            return anterior, km_odometro, resumo

        entrega.iniciado_em = saida
        if chegada <= agora:
            entrega.status = "entregue"
            entrega.concluido_em = chegada
        else:
            entrega.status = "atrasado" if agora > previsao else "em_rota"
        db.add(entrega)
        db.flush()
        resumo["entregas"] += 1

        # Deslocamento vazio: igual o sistema faz ao iniciar a rota.
        db.add(DeslocamentoVazio(
            entrega_id=entrega.id, entrega_anterior_id=anterior.id if anterior else None,
            km_vazio=round(km_vazio, 1) if anterior else None,
        ))

        # Abastecimentos: ~1 a cada 700 km percorridos (vazio + carregado),
        # ate onde o caminhao ja chegou.
        rodado_total = km_vazio + km
        fim_rodado = chegada if entrega.concluido_em else agora
        trecho_h = max(0.1, (fim_rodado - saida).total_seconds() / 3600)
        n = int(rodado_total // 700) if entrega.concluido_em else int(rodado_total * min(1, trecho_h / estimado_h) // 700)
        for k in range(n):
            frac = (k + 1) / (n + 1)
            litros = random.randrange(300, 620, 10)
            db.add(Abastecimento(
                veiculo_id=cavalo.id, motorista_id=motorista.id,
                data_abastecimento=(saida + timedelta(hours=trecho_h * frac)).date(),
                litros=litros, valor_total=round(litros * random.uniform(6.05, 6.55), 2),
                quilometragem=int(km_odometro + rodado_total * frac), posto=random.choice(POSTOS),
                estado=uf(origem) if frac < 0.5 else uf(destino),
            ))
        km_odometro += int(rodado_total)

        # Ocorrencias: atraso registrado nas viagens que atrasaram; de vez em
        # quando outro tipo, ja finalizado.
        if atrasa and entrega.concluido_em:
            db.add(Ocorrencia(entrega_id=entrega.id, usuario_id=operador.id, tipo="atraso",
                              descricao="Fila para descarga no cliente, motorista aguardou liberação da doca.",
                              status="finalizada", finalizado_em=chegada,
                              criado_em=previsao - timedelta(hours=2)))
        elif entrega.concluido_em and random.random() < 0.05:
            tipo, desc = random.choice([
                ("cliente_ausente", "Recebimento fechado na chegada, descarga feita no dia seguinte."),
                ("problema_mecanico", "Mangueira de ar rompida, troca feita em borracharia na rodovia."),
            ])
            db.add(Ocorrencia(entrega_id=entrega.id, usuario_id=operador.id, tipo=tipo, descricao=desc,
                              status="finalizada", finalizado_em=chegada,
                              criado_em=saida + timedelta(hours=estimado_h / 2)))

        if not entrega.concluido_em:
            return entrega, km_odometro, resumo

        anterior = entrega
        posicao = destino
        t = chegada + timedelta(hours=random.uniform(4, 30))


def criar_manutencoes(db, cavalos, odometros, hoje, idx_parado):
    for i, cavalo in enumerate(cavalos):
        km = odometros[i]
        db.add(Manutencao(
            veiculo_id=cavalo.id, data_manutencao=INICIO_HISTORICO + timedelta(days=random.randint(10, 60)),
            tipo="preventiva", descricao="Troca de óleo do motor, filtros de óleo, combustível e ar.",
            custo=round(random.uniform(2800, 4200), 2), mecanico="Oficina Diesel Center",
            quilometragem=km - random.randint(20_000, 40_000), status="concluida",
            proxima_revisao=hoje + timedelta(days=random.randint(15, 90)),
        ))
        if random.random() < 0.6:
            tipo, desc, custo = random.choice([
                ("pneus", "Troca de 4 pneus de tração e alinhamento.", (9000, 14000)),
                ("freios", "Substituição de lonas e tambores do 2º eixo.", (3500, 6000)),
                ("eletrica", "Revisão do alternador e troca das baterias.", (2500, 4800)),
            ])
            inicio = INICIO_HISTORICO + timedelta(days=random.randint(40, 110))
            db.add(Manutencao(
                veiculo_id=cavalo.id, data_manutencao=inicio, data_fim=inicio + timedelta(days=1),
                tipo=tipo, descricao=desc, custo=round(random.uniform(*custo), 2),
                mecanico="Auto Center Rodovia", quilometragem=km - random.randint(2_000, 15_000), status="concluida",
            ))

    # Um caminhao parado agora (corretiva em andamento) e uma revisao agendada.
    db.add(Manutencao(
        veiculo_id=cavalos[idx_parado].id, data_manutencao=hoje - timedelta(days=3), tipo="corretiva",
        descricao="Vazamento no sistema de arrefecimento — troca do radiador e mangueiras.",
        custo=7800, mecanico="Oficina Diesel Center", quilometragem=odometros[idx_parado], status="em_andamento",
    ))
    cavalos[idx_parado].status = "em_manutencao"
    db.add(Manutencao(
        veiculo_id=cavalos[0].id, data_manutencao=hoje + timedelta(days=9), tipo="revisao",
        descricao="Revisão dos 30 mil km na concessionária.", mecanico="Concessionária Volvo",
        status="agendada",
    ))


def popular(db, senha: str) -> dict:
    agora = datetime.now().replace(second=0, microsecond=0)
    hoje = agora.date()
    _, operador = criar_usuarios(db, senha)
    motoristas, cavalos, semis, conjuntos = criar_frota(db, hoje)

    idx_parado = 7
    odometros, ativas = [], []
    total = 0
    for i, conjunto in enumerate(conjuntos):
        ativa, km, resumo = simular_conjunto(db, i, conjunto, motoristas[i], cavalos[i], operador,
                                             agora, em_manutencao=(i == idx_parado))
        odometros.append(km)
        total += resumo["entregas"]
        if ativa is not None and ativa.status in ("em_rota", "atrasado"):
            ativas.append((i, ativa))

    # Uma das viagens em andamento com ocorrencia aberta agora.
    if ativas:
        _, entrega = ativas[0]
        entrega.status = "ocorrencia"
        db.add(Ocorrencia(entrega_id=entrega.id, usuario_id=operador.id, tipo="problema_mecanico",
                          descricao="Luz de advertência do motor acesa, motorista aguardando socorro mecânico no posto.",
                          status="aberta", criado_em=agora - timedelta(hours=3)))

    # E outra atrasada (passou da previsao e ainda nao chegou).
    if len(ativas) > 1:
        _, entrega = ativas[1]
        entrega.status = "atrasado"
        entrega.previsao = arredondar_hora(agora - timedelta(hours=5))

    # Status da frota e dos motoristas coerente com as viagens em andamento.
    for i, _ in ativas:
        motoristas[i].status = "em_rota"
        cavalos[i].status = "em_rota"
        semis[i].status = "em_rota"

    # Algumas cargas canceladas pelo cliente antes da saida.
    for _ in range(3):
        i = random.randrange(8)
        cliente, origem, carga = random.choice(SAIDAS_RS)
        destino = random.choice(DESTINOS_SAIDA)
        quando = datetime.combine(INICIO_HISTORICO + timedelta(days=random.randint(5, 100)), time(8, 0))
        db.add(Entrega(cliente=cliente, origem=origem, destino=destino, descricao_carga=carga,
                       peso_kg=30000, valor_frete=round(km_rodoviario(origem, destino) * 7.5 / 50) * 50,
                       motorista_id=motoristas[i].id, veiculo_id=cavalos[i].id, status="cancelado",
                       previsao=quando + timedelta(days=3), criado_em=quando - timedelta(days=2)))
        total += 1

    criar_manutencoes(db, cavalos, odometros, hoje, idx_parado)
    return {"entregas": total, "em_andamento": len(ativas)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", help="banco da DEMO (padrao: DATABASE_URL do .env)")
    parser.add_argument("--reset", action="store_true", help="apaga os dados de demo existentes antes de popular")
    parser.add_argument("--senha", help="senha dos logins de demo (padrao: gera uma aleatoria)")
    parser.add_argument("--sim", action="store_true", help="nao pede confirmacao")
    parser.add_argument("--semente", type=int, default=2026, help="semente do sorteio (mesma semente = mesmos dados)")
    args = parser.parse_args()

    url = args.database_url
    if not url:
        from app.config import settings
        url = settings.DATABASE_URL
    senha = args.senha or secrets.token_urlsafe(9)
    random.seed(args.semente)

    print(f"Banco alvo: {host_do_banco(url)}")
    if not args.sim:
        resp = input("Confirma que e o banco de DEMONSTRACAO (nao o real)? [digite 'sim']: ")
        if resp.strip().lower() != "sim":
            print("Cancelado.")
            return

    engine = create_engine(url)
    db = sessionmaker(bind=engine)()
    try:
        conferir_banco_de_demo(db, args.reset)
        if args.reset:
            apagar_tudo(db)
        resumo = popular(db, senha)
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"\nPronto: {resumo['entregas']} entregas ({resumo['em_andamento']} em andamento agora).")
    print(f"Login administrador: {EMAIL_ADMIN} / {senha}")
    print(f"Login operador:      {EMAIL_OPERADOR} / {senha}")


if __name__ == "__main__":
    main()
