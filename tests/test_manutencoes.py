"""Cobre o controle de acesso de /manutencoes/: criar/editar são staff-only
(administrador ou operador), excluir é admin-only."""
from tests.conftest import auth_headers, criar_manutencao_orm, criar_veiculo_orm


def _payload(veiculo_id):
    return {
        "veiculo_id": veiculo_id,
        "data_manutencao": "2026-01-10",
        "tipo": "preventiva",
        "descricao": "Troca de óleo",
    }


def test_operador_pode_criar_manutencao(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.post("/manutencoes/", headers=headers, json=_payload(veiculo.id))
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_criar_manutencao(client, motorista_usuario, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/manutencoes/", headers=headers, json=_payload(veiculo.id))
    assert resp.status_code == 403


def test_admin_atualiza_manutencao(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    manutencao = criar_manutencao_orm(db_session, veiculo.id)
    headers = auth_headers(client, admin.email)

    resp = client.put(f"/manutencoes/{manutencao.id}", headers=headers, json={"descricao": "Atualizada"})
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_atualizar_manutencao(client, motorista_usuario, db_session):
    veiculo = criar_veiculo_orm(db_session)
    manutencao = criar_manutencao_orm(db_session, veiculo.id)
    headers = auth_headers(client, motorista_usuario.email)

    resp = client.put(f"/manutencoes/{manutencao.id}", headers=headers, json={"descricao": "X"})
    assert resp.status_code == 403


def test_atualizar_manutencao_limpa_campo_enviado_como_null(client, admin, db_session):
    """PUT precisa usar exclude_unset (não exclude_none) no model_dump: o
    formulário manda mecanico=None explicitamente pra limpar o campo, e isso
    não pode ser descartado silenciosamente."""
    veiculo = criar_veiculo_orm(db_session)
    manutencao = criar_manutencao_orm(db_session, veiculo.id)
    headers = auth_headers(client, admin.email)

    resp = client.put(f"/manutencoes/{manutencao.id}", headers=headers, json={"mecanico": "Oficina do Zé"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["mecanico"] == "Oficina do Zé"

    resp = client.put(f"/manutencoes/{manutencao.id}", headers=headers, json={"mecanico": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["mecanico"] is None


def test_admin_exclui_manutencao(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    manutencao = criar_manutencao_orm(db_session, veiculo.id)
    headers = auth_headers(client, admin.email)

    resp = client.delete(f"/manutencoes/{manutencao.id}", headers=headers)
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_excluir_manutencao(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    manutencao = criar_manutencao_orm(db_session, veiculo.id)
    headers = auth_headers(client, operador.email)

    resp = client.delete(f"/manutencoes/{manutencao.id}", headers=headers)
    assert resp.status_code == 403
