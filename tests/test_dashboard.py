"""Testes das contas do dashboard: resumo, vencimentos, agrupamentos por
status/dia, desempenho por motorista, e a comparação do faturamento com o mês
anterior, usando a mesma quantidade de dias decorridos em ambos os meses."""
from datetime import date, datetime, timedelta

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
    return date.today()


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
    e1.concluido_em = hoje
    db_session.commit()

    # Mês anterior: uma entrega de R$500.
    e2 = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    e2.valor_frete = 500
    e2.concluido_em = anterior
    db_session.commit()

    headers = auth_headers(client, "admin@teste.com")
    res = client.get("/dashboard/faturamento", headers=headers)
    assert res.status_code == 200, res.text
    dados = res.json()

    assert dados["receita_bruta"] == 1000
    assert dados["mes_anterior"]["receita_bruta"] == 500
    assert dados["mes_anterior"]["faturamento_liquido"] == 500
    # mês anterior não deve vazar pro total do mês atual
    assert dados["faturamento_liquido"] == 1000


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
    """criado_em setado explicitamente (mesmo motivo do teste de /resumo acima):
    isola o agrupamento por dia da hora exata em que o teste roda."""
    agora = datetime.now()
    for _ in range(3):
        e = criar_entrega_orm(db_session)
        e.criado_em = agora
        db_session.commit()

    headers = auth_headers(client, admin.email)
    resp = client.get("/dashboard/entregas-por-dia", headers=headers)
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    assert len(dados) == 1  # todas criadas "agora", no mesmo dia
    assert dados[0]["dia"] == str(date.today())
    assert dados[0]["total"] == 3


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
