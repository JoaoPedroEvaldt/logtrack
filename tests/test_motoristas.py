from tests.conftest import CPF_VALIDO_1, CPF_VALIDO_2, auth_headers, criar_motorista_orm


def _payload(cpf=CPF_VALIDO_1, cnh_numero="12345678901"):
    return {
        "nome": "João Motorista",
        "cpf": cpf,
        "cnh_numero": cnh_numero,
        "cnh_categoria": "E",
        "cnh_validade": "2030-01-01",
    }


def test_admin_cria_motorista_com_cpf_valido(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload())
    assert resp.status_code == 200, resp.text
    assert resp.json()["cpf"] == CPF_VALIDO_1


def test_operador_pode_criar_motorista(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload())
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_criar_motorista(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload())
    assert resp.status_code == 403


def test_criar_motorista_com_cpf_invalido_retorna_422(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload(cpf="11111111111"))
    assert resp.status_code == 422


def test_criar_motorista_com_cnh_incompleta_retorna_422(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload(cnh_numero="123"))
    assert resp.status_code == 422


def test_criar_motorista_com_cpf_ja_cadastrado_retorna_400(client, admin, db_session):
    criar_motorista_orm(db_session, cpf=CPF_VALIDO_1)
    headers = auth_headers(client, admin.email)
    resp = client.post("/motoristas/", headers=headers, json=_payload(cpf=CPF_VALIDO_1, cnh_numero="99999999999"))
    assert resp.status_code == 400
    assert "CPF" in resp.json()["detail"]


def test_criar_motorista_com_email_sem_senha_retorna_400(client, admin):
    headers = auth_headers(client, admin.email)
    payload = _payload()
    payload["email"] = "novo@teste.com"
    resp = client.post("/motoristas/", headers=headers, json=payload)
    assert resp.status_code == 400


def test_atualizar_motorista_com_cpf_de_outro_retorna_400(client, admin, db_session):
    m1 = criar_motorista_orm(db_session, cpf=CPF_VALIDO_1, cnh_numero="11111111111")
    criar_motorista_orm(db_session, cpf=CPF_VALIDO_2, cnh_numero="22222222222")
    headers = auth_headers(client, admin.email)
    resp = client.put(f"/motoristas/{m1.id}", headers=headers, json={"cpf": CPF_VALIDO_2})
    assert resp.status_code == 400


def test_apenas_admin_pode_deletar_motorista(client, admin, operador, db_session):
    m = criar_motorista_orm(db_session)
    headers_operador = auth_headers(client, operador.email)
    resp = client.delete(f"/motoristas/{m.id}", headers=headers_operador)
    assert resp.status_code == 403

    headers_admin = auth_headers(client, admin.email)
    resp = client.delete(f"/motoristas/{m.id}", headers=headers_admin)
    assert resp.status_code == 200
