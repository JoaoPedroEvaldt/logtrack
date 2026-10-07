"""Testes das contas do dashboard: resumo, vencimentos, agrupamentos por
status/dia, desempenho por motorista, e a comparação do faturamento com o mês
anterior, usando a mesma quantidade de dias decorridos em ambos os meses."""
import pytest
from datetime import date, datetime, time, timedelta

from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from tests.conftest import (
    CPF_VALIDO_1,
    CPF_VALIDO_2,
    auth_headers,
    criar_entrega_orm,
    criar_motorista_orm,
    criar_veiculo_orm,
)


def _hoje_no_mes_atual():
    # "Hoje" no fuso de Brasilia, como o dashboard calcula.
    return (datetime.utcnow() - timedelta(hours=3)).date()


def _mes_anterior(d):
    """Dia 1 do mês anterior — sempre dentro da janela comparável, que só cobre os
    mesmos N dias já decorridos no mês atual (ver comentário em dashboard.py)."""
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


def test_faturamento_compara_com_mes_anterior(client, db_session, admin):
    veiculo = criar_veiculo_orm(db_session)
    motorista = criar_motorista_orm(db_session)

    hoje = _hoje_no_mes_atual()
    anterior = _mes_anterior(hoje)

    # Mês atual: uma entrega de R$1000, sem custos.
    e1 = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    e1.valor_frete = 1000
    e1.concluido_em = datetime.utcnow()  # concluido_em e gravado em UTC
    db_session.commit()

    # Mês anterior: uma entrega de R$500.
    e2 = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    e2.valor_frete = 500
    e2.concluido_em = datetime.combine(anterior, time(12))
    db_session.commit()

    headers = auth_headers(client, "admin@teste.com")
    res = client.get("/dashboard/faturamento", headers=headers)
    assert res.status_code == 200, res.text
    dados = res.json()

    assert dados["receita_bruta"] == 1000
    assert dados["mes_anterior"]["receita_bruta"] == 500
    # Visão da empresa: líquido já descontada a comissão de 13% do motorista.
    assert dados["mes_anterior"]["comissao"] == 65
    assert dados["mes_anterior"]["faturamento_liquido"] == 435
    # mês anterior não deve vazar pro total do mês atual
    assert dados["comissao"] == 130
    assert dados["faturamento_liquido"] == 870


def test_resumo_conta_entregas_e_disponibilidade(client, admin, db_session):
    """Cobre /dashboard/resumo: contagens de em_rota/atrasadas/concluídas hoje/
    ocorrências abertas, e que um motorista ou veículo "disponível" no cadastro
    não entra em motoristas_disponiveis/veiculos_disponiveis se estiver numa
    entrega em_rota agora (status efetivo, não o campo status bruto).

    criado_em é setado explicitamente em vez de confiar no server_default
    (func.now()) do banco: perto da virada do dia, o "agora" do SQLite (sempre
    UTC) e o "hoje" em horário local que o endpoint usa (date.today(), mesmo
    fuso do processo Python) podem cair em datas diferentes — não é isso que
    este teste quer cobrir, então fixamos o dado pra não ficar refém do relógio."""
    agora = datetime.now()
    motorista_livre = criar_motorista_orm(db_session, cpf=CPF_VALIDO_1, cnh_numero="11111111111")
    motorista_em_rota = criar_motorista_orm(db_session, cpf=CPF_VALIDO_2, cnh_numero="22222222222")
    veiculo_livre = criar_veiculo_orm(db_session, placa="LIV1R33")
    veiculo_em_rota = criar_veiculo_orm(db_session, placa="ROT1A22")

    e_hoje = criar_entrega_orm(db_session, status="entregue")
    e_hoje.criado_em = agora
    e_hoje.concluido_em = agora
    e_em_rota = criar_entrega_orm(db_session, motorista_id=motorista_em_rota.id, veiculo_id=veiculo_em_rota.id, status="em_rota")
    e_em_rota.criado_em = agora
    e_atrasada = criar_entrega_orm(db_session, status="atrasado")
    e_atrasada.criado_em = agora
    db_session.commit()

    entrega_com_ocorrencia = criar_entrega_orm(db_session)
    entrega_com_ocorrencia.criado_em = agora
    db_session.add(Ocorrencia(entrega_id=entrega_com_ocorrencia.id, usuario_id=admin.id, tipo="atraso", descricao="X"))
    db_session.commit()

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/resumo", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["entregas_hoje"] == 4
    assert body["em_rota"] == 1
    assert body["atrasadas"] == 1
    assert body["concluidas_hoje"] == 1
    assert body["ocorrencias_abertas"] == 1
    assert body["motoristas_disponiveis"] == 1
    assert body["veiculos_disponiveis"] == 1


def test_vencimentos_retorna_cnh_crlv_seguro_na_janela_de_30_dias(client, admin, db_session):
    """Cobre /dashboard/vencimentos: CNH vencida entra com vencido=True, CRLV
    vencendo dentro de 30 dias entra com vencido=False, e nada fora da janela
    de 30 dias aparece."""
    hoje = date.today()

    motorista_vencido = Motorista(
        nome="CNH Vencida", cpf=CPF_VALIDO_1, cnh_numero="11111111111",
        cnh_categoria="E", cnh_validade=hoje - timedelta(days=5), status="disponivel",
    )
    motorista_em_dia = Motorista(
        nome="CNH Em Dia", cpf=CPF_VALIDO_2, cnh_numero="22222222222",
        cnh_categoria="E", cnh_validade=hoje + timedelta(days=365), status="disponivel",
    )
    db_session.add_all([motorista_vencido, motorista_em_dia])

    veiculo = criar_veiculo_orm(db_session)
    veiculo.crlv_validade = hoje + timedelta(days=10)
    veiculo.seguro_validade = hoje + timedelta(days=365)  # fora da janela, não deve aparecer
    db_session.commit()

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/vencimentos", headers=headers)
    assert resp.status_code == 200, resp.text
    alertas = resp.json()

    tipos_referencias = {(a["tipo"], a["referencia"]) for a in alertas}
    assert ("cnh", "CNH Vencida") in tipos_referencias
    assert ("cnh", "CNH Em Dia") not in tipos_referencias
    assert ("crlv", veiculo.placa) in tipos_referencias
    assert ("seguro", veiculo.placa) not in tipos_referencias

    alerta_cnh_vencida = next(a for a in alertas if a["tipo"] == "cnh" and a["referencia"] == "CNH Vencida")
    assert alerta_cnh_vencida["vencido"] is True
    alerta_crlv = next(a for a in alertas if a["tipo"] == "crlv")
    assert alerta_crlv["vencido"] is False


def test_entregas_por_status_agrupa_corretamente(client, admin, db_session):
    criar_entrega_orm(db_session, status="aguardando")
    criar_entrega_orm(db_session, status="aguardando")
    criar_entrega_orm(db_session, status="entregue")

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/entregas-por-status", headers=headers)
    assert resp.status_code == 200, resp.text
    contagem = {item["status"]: item["total"] for item in resp.json()}
    assert contagem["aguardando"] == 2
    assert contagem["entregue"] == 1


def test_entregas_por_dia_agrupa_por_data_de_criacao(client, admin, db_session):
    """criado_em e gravado em UTC; o dia e o de Brasilia (UTC-3). Uma entrega
    criada as 23h30 de Brasilia (02h30 UTC do dia seguinte) conta no proprio
    dia, nao no seguinte -- era o bug de "virar o dia as 21h"."""
    for criado_utc in (datetime(2026, 9, 30, 12, 0),   # 09h00 de 30/09
                       datetime(2026, 10, 1, 2, 30),   # 23h30 de 30/09
                       datetime(2026, 10, 1, 3, 30)):  # 00h30 de 01/10
        e = criar_entrega_orm(db_session)
        e.criado_em = criado_utc
        db_session.commit()

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/entregas-por-dia", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == [{"dia": "2026-09-30", "total": 2}, {"dia": "2026-10-01", "total": 1}]


def test_desempenho_motoristas_calcula_faturamento_e_ignora_sem_entrega_ou_inativo(client, admin, db_session):
    """Cobre /dashboard/desempenho-motoristas: soma faturamento só de entregas
    "entregue", ordena por faturamento desc, não lista motorista sem nenhuma
    entrega (INNER JOIN) nem motorista inativo (mesmo tendo entrega)."""
    veiculo = criar_veiculo_orm(db_session)

    top = criar_motorista_orm(db_session, nome="Top", cpf=CPF_VALIDO_1, cnh_numero="11111111111")
    e1 = criar_entrega_orm(db_session, motorista_id=top.id, veiculo_id=veiculo.id, status="entregue")
    e1.valor_frete = 1000
    criar_entrega_orm(db_session, motorista_id=top.id, veiculo_id=veiculo.id, status="atrasado")
    db_session.commit()

    segundo = criar_motorista_orm(db_session, nome="Segundo", cpf=CPF_VALIDO_2, cnh_numero="22222222222")
    e3 = criar_entrega_orm(db_session, motorista_id=segundo.id, status="entregue")
    e3.valor_frete = 500
    db_session.commit()

    criar_motorista_orm(db_session, nome="Sem Entrega", cpf="99988877766", cnh_numero="33333333333")

    inativo = criar_motorista_orm(
        db_session, nome="Inativo Com Entrega", cpf="11122233344", cnh_numero="44444444444", status="inativo"
    )
    e4 = criar_entrega_orm(db_session, motorista_id=inativo.id, status="entregue")
    e4.valor_frete = 9999
    db_session.commit()

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/desempenho-motoristas", headers=headers)
    assert resp.status_code == 200, resp.text
    dados = resp.json()

    nomes = [d["motorista"] for d in dados]
    assert "Sem Entrega" not in nomes
    assert "Inativo Com Entrega" not in nomes
    assert nomes == ["Top", "Segundo"]  # ordenado por faturamento desc

    linha_top = dados[0]
    assert linha_top["total"] == 2
    assert linha_top["concluidas"] == 1
    assert linha_top["atrasadas"] == 1
    assert linha_top["faturamento"] == 1000.0


def test_liquido_da_empresa_desconta_comissao_e_abastecimento(client, db_session, admin):
    """Frete de R$22.000: motorista ganha 13% (R$2.860) sem descontar o diesel;
    a empresa fica com o frete menos a comissão e o abastecimento."""
    from app.models.abastecimento import Abastecimento

    veiculo = criar_veiculo_orm(db_session)
    motorista = criar_motorista_orm(db_session)
    entrega = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    entrega.valor_frete = 22000
    entrega.concluido_em = datetime.utcnow()
    db_session.add(Abastecimento(veiculo_id=veiculo.id, motorista_id=motorista.id, data_abastecimento=_hoje_no_mes_atual(),
                                 litros=500, valor_total=3000))
    db_session.commit()

    headers = auth_headers(client, "admin@teste.com")
    fat = client.get("/dashboard/faturamento", headers=headers).json()
    assert fat["comissao"] == pytest.approx(2860)
    assert fat["faturamento_liquido"] == pytest.approx(22000 - 2860 - 3000)

    desempenho = client.get("/dashboard/desempenho-motoristas", headers=headers).json()
    assert desempenho[0]["faturamento"] == 22000
    assert desempenho[0]["comissao"] == pytest.approx(2860)
    assert desempenho[0]["motorista_id"] == motorista.id  # link pra ficha do motorista



def test_viagem_esquecida_aberta_vira_alerta(client, admin, db_session):
    """Uma viagem de teste ficou "em rota" de julho a outubro e prendia o
    motorista e o caminhão sem ninguém perceber: agora ela aparece nos alertas."""
    from datetime import datetime, timedelta
    from tests.conftest import criar_entrega_orm, criar_motorista_orm
    motorista = criar_motorista_orm(db_session, nome="Joao Pedro")
    esquecida = criar_entrega_orm(db_session, motorista_id=motorista.id, status="em_rota")
    esquecida.previsao = datetime.now() - timedelta(days=10)
    no_prazo = criar_entrega_orm(db_session, status="em_rota")
    no_prazo.previsao = datetime.now() - timedelta(days=1)   # atrasou só um pouco: ainda sem alerta
    entregue = criar_entrega_orm(db_session, status="entregue")
    entregue.previsao = datetime.now() - timedelta(days=30)
    db_session.commit()

    alertas = client.get("/dashboard/vencimentos", headers=auth_headers(client, admin.email)).json()
    viagens = [a for a in alertas if a["tipo"] == "viagem"]
    assert len(viagens) == 1
    assert viagens[0]["referencia"].startswith(f"Entrega #{esquecida.id}")
    assert "Joao Pedro" in viagens[0]["referencia"] and viagens[0]["vencido"] is True



def test_carreta_engatada_em_cavalo_em_viagem_nao_conta_como_disponivel(client, admin, db_session):
    """A entrega guarda só o cavalo: o painel dizia "5 de 11 disponíveis"
    quando os 5 eram as carretas engatadas nos cavalos em viagem."""
    from app.models.conjunto import Conjunto
    from tests.conftest import criar_entrega_orm, criar_veiculo_orm
    cavalo = criar_veiculo_orm(db_session, placa="CAV1A11", tipo="cavalo")
    carreta = criar_veiculo_orm(db_session, placa="SEM1A11", tipo="semirreboque")
    solta = criar_veiculo_orm(db_session, placa="SEM2B22", tipo="semirreboque")
    db_session.add(Conjunto(nome="FH + Facchini", cavalo_id=cavalo.id, semirreboque1_id=carreta.id))
    db_session.commit()
    headers = auth_headers(client, admin.email)
    antes = client.get("/dashboard/resumo", headers=headers).json()["veiculos_disponiveis"]
    assert antes == 3

    criar_entrega_orm(db_session, veiculo_id=cavalo.id, status="em_rota")
    depois = client.get("/dashboard/resumo", headers=headers).json()["veiculos_disponiveis"]
    assert depois == 1  # só a carreta solta
