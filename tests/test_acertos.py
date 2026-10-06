"""Acerto do motorista: comissão de 13% do frete + 1/3 das diárias -
adiantamentos, com viagens/diárias/adiantamentos presos ao acerto que os pagou."""
from datetime import date, datetime, timedelta

import pytest

from app.routers.acertos import dividir_diaria
from app.routers.dashboard import hoje_brasilia, inicio_do_dia_utc
from tests.conftest import auth_headers, criar_entrega_orm, criar_motorista_orm, criar_veiculo_orm

HOJE = hoje_brasilia()
INICIO = HOJE - timedelta(days=29)


def _entrega_concluida(db_session, motorista_id, frete, dia, veiculo_id=None):
    e = criar_entrega_orm(db_session, motorista_id=motorista_id, veiculo_id=veiculo_id, status="entregue")
    e.valor_frete = frete
    e.concluido_em = inicio_do_dia_utc(dia) + timedelta(hours=12)
    db_session.commit()
    return e


def _cenario(client, db_session, admin):
    """Frete de R$22.000, diária de R$3.000 e vales de R$1.500 nos dias 5 e 15."""
    motorista = criar_motorista_orm(db_session)
    headers = auth_headers(client, admin.email)
    entrega = _entrega_concluida(db_session, motorista.id, 22000, HOJE - timedelta(days=10))
    r = client.post("/diarias", headers=headers, json={
        "entrega_id": entrega.id, "data": str(HOJE - timedelta(days=10)), "dias": 2, "valor": 3000})
    assert r.status_code == 200, r.text
    for dias_atras in (20, 8):
        r = client.post("/adiantamentos", headers=headers, json={
            "motorista_id": motorista.id, "data": str(HOJE - timedelta(days=dias_atras)), "valor": 1500})
        assert r.status_code == 200, r.text
    return motorista, entrega, headers


def _previa(client, headers, motorista_id, inicio=INICIO, fim=HOJE):
    r = client.get("/acertos/previa", headers=headers,
                   params={"motorista_id": motorista_id, "periodo_inicio": str(inicio), "periodo_fim": str(fim)})
    assert r.status_code == 200, r.text
    return r.json()


def test_diaria_dividida_em_tres_e_centavo_fica_com_a_empresa():
    assert [float(x) for x in dividir_diaria(3000)] == [1000, 1000, 1000]
    assert [float(x) for x in dividir_diaria(100)] == [33.33, 33.33, 33.34]


def test_previa_soma_comissao_diaria_e_desconta_adiantamentos(client, db_session, admin):
    motorista, _, headers = _cenario(client, db_session, admin)
    p = _previa(client, headers, motorista.id)

    assert len(p["viagens"]) == 1
    assert p["comissao"] == pytest.approx(2860)            # 13% de 22.000
    assert p["total_diarias"] == pytest.approx(3000)
    assert p["diarias_motorista"] == pytest.approx(1000)   # 1/3 da diária
    assert p["total_adiantamentos"] == pytest.approx(3000) # dia 5 + dia 15
    assert p["saldo"] == pytest.approx(860)
    assert p["diarias"][0]["parte_caminhao"] == pytest.approx(1000)


def test_fechar_acerto_congela_e_nao_paga_duas_vezes(client, db_session, admin):
    motorista, _, headers = _cenario(client, db_session, admin)
    r = client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(INICIO), "periodo_fim": str(HOJE)})
    assert r.status_code == 200, r.text
    acerto = r.json()
    assert acerto["saldo"] == pytest.approx(860)
    assert acerto["qtd_viagens"] == 1

    # Tudo já está preso ao acerto: nada pendente e não dá pra fechar de novo.
    p = _previa(client, headers, motorista.id)
    assert p["viagens"] == [] and p["diarias"] == [] and p["adiantamentos"] == []
    r = client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(INICIO), "periodo_fim": str(HOJE)})
    assert r.status_code == 400

    detalhe = client.get(f"/acertos/{acerto['id']}", headers=headers).json()
    assert len(detalhe["viagens"]) == 1 and len(detalhe["adiantamentos"]) == 2


def test_viagem_concluida_depois_do_fechamento_entra_no_proximo_acerto(client, db_session, admin):
    motorista, _, headers = _cenario(client, db_session, admin)
    fim_primeiro = HOJE - timedelta(days=5)
    client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(INICIO), "periodo_fim": str(fim_primeiro)})

    # Viagem lançada atrasada, com data dentro do período já fechado.
    _entrega_concluida(db_session, motorista.id, 10000, HOJE - timedelta(days=7))

    p = _previa(client, headers, motorista.id, inicio=fim_primeiro + timedelta(days=1))
    assert [v["valor_frete"] for v in p["viagens"]] == [10000]
    assert p["comissao"] == pytest.approx(1300)


def test_nao_exclui_item_ja_acertado_mas_admin_pode_reabrir(client, db_session, admin, operador):
    motorista, _, headers = _cenario(client, db_session, admin)
    acerto = client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(INICIO), "periodo_fim": str(HOJE)}).json()
    diaria_id = client.get("/diarias", headers=headers, params={"motorista_id": motorista.id}).json()[0]["id"]
    adiantamento_id = client.get("/adiantamentos", headers=headers, params={"motorista_id": motorista.id}).json()[0]["id"]

    assert client.delete(f"/diarias/{diaria_id}", headers=headers).status_code == 400
    assert client.delete(f"/adiantamentos/{adiantamento_id}", headers=headers).status_code == 400

    headers_operador = auth_headers(client, operador.email)
    assert client.delete(f"/acertos/{acerto['id']}", headers=headers_operador).status_code == 403

    assert client.delete(f"/acertos/{acerto['id']}", headers=headers).status_code == 200
    p = _previa(client, headers, motorista.id)
    assert p["saldo"] == pytest.approx(860)
    assert client.delete(f"/diarias/{diaria_id}", headers=headers).status_code == 200


def test_nao_fecha_acerto_com_data_futura_nem_vazio(client, db_session, admin):
    motorista = criar_motorista_orm(db_session)
    headers = auth_headers(client, admin.email)
    r = client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(HOJE), "periodo_fim": str(HOJE + timedelta(days=3))})
    assert r.status_code == 400
    r = client.post("/acertos", headers=headers, json={
        "motorista_id": motorista.id, "periodo_inicio": str(INICIO), "periodo_fim": str(HOJE)})
    assert r.status_code == 400


def test_diaria_exige_entrega_valida_com_motorista(client, db_session, admin):
    headers = auth_headers(client, admin.email)
    sem_motorista = criar_entrega_orm(db_session)
    r = client.post("/diarias", headers=headers, json={"entrega_id": sem_motorista.id, "data": str(HOJE), "valor": 900})
    assert r.status_code == 400
    r = client.post("/diarias", headers=headers, json={"entrega_id": 9999, "data": str(HOJE), "valor": 900})
    assert r.status_code == 404
    r = client.post("/diarias", headers=headers, json={"entrega_id": sem_motorista.id, "data": str(HOJE), "valor": 0})
    assert r.status_code == 422


def test_motorista_nao_acessa_acertos(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    assert client.get("/acertos", headers=headers).status_code == 403
    assert client.get("/adiantamentos", headers=headers).status_code == 403


def test_painel_soma_diaria_na_receita_e_parte_do_motorista_no_custo(client, db_session, admin):
    veiculo = criar_veiculo_orm(db_session)
    motorista = criar_motorista_orm(db_session)
    headers = auth_headers(client, admin.email)
    entrega = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    entrega.valor_frete = 22000
    entrega.concluido_em = datetime.utcnow()
    db_session.commit()
    client.post("/diarias", headers=headers, json={"entrega_id": entrega.id, "data": str(HOJE), "valor": 3000})

    fat = client.get("/dashboard/faturamento", headers=headers).json()
    assert fat["receita_bruta"] == pytest.approx(25000)
    assert fat["receita_diarias"] == pytest.approx(3000)
    assert fat["comissao"] == pytest.approx(2860 + 1000)
    assert fat["faturamento_liquido"] == pytest.approx(25000 - 3860)
