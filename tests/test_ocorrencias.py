"""Cobre o controle de acesso de /ocorrencias/ para atualizar e excluir
(staff-only: administrador ou operador) — criar/listar-por-entrega usam
ownership via _garantir_acesso_entrega e já têm outra lógica."""
from tests.conftest import auth_headers, criar_entrega_orm


def _criar_ocorrencia(client, headers, entrega_id):
    resp = client.post("/ocorrencias/", headers=headers, json={
        "entrega_id": entrega_id,
        "tipo": "atraso",
        "descricao": "Trânsito intenso na BR-101",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_admin_atualiza_ocorrencia(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers, entrega.id)

    resp = client.put(f"/ocorrencias/{ocorrencia['id']}", headers=headers, json={"descricao": "Atualizado"})
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_atualizar_ocorrencia(client, admin, db_session, motorista_usuario):
    entrega = criar_entrega_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers_admin, entrega.id)

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/ocorrencias/{ocorrencia['id']}", headers=headers_motorista, json={"descricao": "X"})
    assert resp.status_code == 403


def test_operador_pode_excluir_ocorrencia(client, admin, operador, db_session):
    entrega = criar_entrega_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers_admin, entrega.id)

    headers_operador = auth_headers(client, operador.email)
    resp = client.delete(f"/ocorrencias/{ocorrencia['id']}", headers=headers_operador)
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_excluir_ocorrencia(client, admin, db_session, motorista_usuario):
    entrega = criar_entrega_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers_admin, entrega.id)

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.delete(f"/ocorrencias/{ocorrencia['id']}", headers=headers_motorista)
    assert resp.status_code == 403


def test_motorista_nao_pode_finalizar_ocorrencia(client, admin, db_session, motorista_usuario):
    entrega = criar_entrega_orm(db_session)
    headers_admin = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers_admin, entrega.id)

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/ocorrencias/{ocorrencia['id']}/finalizar", headers=headers_motorista)
    assert resp.status_code == 403


def test_finalizar_ocorrencia_marca_status_e_revalida_entrega(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers, entrega.id)

    resp_entrega = client.get(f"/entregas/{entrega.id}", headers=headers)
    assert resp_entrega.json()["status"] == "ocorrencia"

    resp = client.put(f"/ocorrencias/{ocorrencia['id']}/finalizar", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "finalizada"
    assert body["finalizado_em"] is not None

    resp_entrega = client.get(f"/entregas/{entrega.id}", headers=headers)
    assert resp_entrega.json()["status"] == "aguardando"


def test_finalizar_ocorrencia_ja_finalizada_e_rejeitado(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    ocorrencia = _criar_ocorrencia(client, headers, entrega.id)

    resp = client.put(f"/ocorrencias/{ocorrencia['id']}/finalizar", headers=headers)
    assert resp.status_code == 200, resp.text

    resp2 = client.put(f"/ocorrencias/{ocorrencia['id']}/finalizar", headers=headers)
    assert resp2.status_code == 400


def test_entrega_continua_em_ocorrencia_se_sobrar_outra_aberta(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    ocorrencia1 = _criar_ocorrencia(client, headers, entrega.id)
    _criar_ocorrencia(client, headers, entrega.id)

    resp = client.put(f"/ocorrencias/{ocorrencia1['id']}/finalizar", headers=headers)
    assert resp.status_code == 200, resp.text

    resp_entrega = client.get(f"/entregas/{entrega.id}", headers=headers)
    assert resp_entrega.json()["status"] == "ocorrencia"
