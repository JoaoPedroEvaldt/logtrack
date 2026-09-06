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
