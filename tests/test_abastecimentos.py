"""Cobre o controle de acesso de /abastecimentos/: criar/editar são staff-only
(administrador ou operador), excluir é admin-only."""
from tests.conftest import auth_headers, criar_veiculo_orm


def _payload(veiculo_id):
    return {
        "veiculo_id": veiculo_id,
        "data_abastecimento": "2026-01-10",
        "litros": 300,
        "valor_total": 2100,
    }


def test_operador_pode_criar_abastecimento(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id))
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_criar_abastecimento(client, motorista_usuario, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id))
    assert resp.status_code == 403


def test_criar_abastecimento_com_veiculo_inexistente_retorna_404(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/abastecimentos/", headers=headers, json=_payload(999999))
    assert resp.status_code == 404, resp.text


def test_criar_abastecimento_com_motorista_inexistente_retorna_404(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    payload = _payload(veiculo.id)
    payload["motorista_id"] = 999999
    resp = client.post("/abastecimentos/", headers=headers, json=payload)
    assert resp.status_code == 404, resp.text


def test_atualizar_abastecimento_com_veiculo_inexistente_retorna_404(client, admin, db_session):
    """Sem essa checagem, trocar pra um veiculo_id que não existe só estoura como
    erro de FK do Postgres na hora do commit (500 feio) em produção — o SQLite dos
    testes não pega isso sozinho porque não faz enforcement de FK por padrão."""
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id)).json()

    resp = client.put(f"/abastecimentos/{abastecimento['id']}", headers=headers, json={"veiculo_id": 999999})
    assert resp.status_code == 404, resp.text


def test_admin_atualiza_abastecimento(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id)).json()

    resp = client.put(f"/abastecimentos/{abastecimento['id']}", headers=headers, json={"litros": 350})
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_atualizar_abastecimento(client, admin, motorista_usuario, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers_admin, json=_payload(veiculo.id)).json()

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/abastecimentos/{abastecimento['id']}", headers=headers_motorista, json={"litros": 1})
    assert resp.status_code == 403


def test_atualizar_abastecimento_limpa_campo_enviado_como_null(client, admin, db_session):
    """PUT precisa usar exclude_unset (não exclude_none) no model_dump: o
    formulário manda posto=None explicitamente pra limpar o campo, e isso não
    pode ser descartado silenciosamente."""
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id)).json()

    resp = client.put(f"/abastecimentos/{abastecimento['id']}", headers=headers, json={"posto": "Posto Ipiranga"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["posto"] == "Posto Ipiranga"

    resp = client.put(f"/abastecimentos/{abastecimento['id']}", headers=headers, json={"posto": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["posto"] is None


def test_admin_exclui_abastecimento(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers, json=_payload(veiculo.id)).json()

    resp = client.delete(f"/abastecimentos/{abastecimento['id']}", headers=headers)
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_excluir_abastecimento(client, admin, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    abastecimento = client.post("/abastecimentos/", headers=headers_admin, json=_payload(veiculo.id)).json()

    headers_operador = auth_headers(client, operador.email)
    resp = client.delete(f"/abastecimentos/{abastecimento['id']}", headers=headers_operador)
    assert resp.status_code == 403
