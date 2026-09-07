from tests.conftest import auth_headers


def test_admin_ve_log_de_acesso(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.get("/log-acesso/", headers=headers)
    assert resp.status_code == 200, resp.text
    lista = resp.json()
    assert len(lista) >= 1
    assert any(item["email_tentado"] == admin.email and item["tentativa_ok"] for item in lista)


def test_operador_nao_ve_log_de_acesso(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.get("/log-acesso/", headers=headers)
    assert resp.status_code == 403


def test_motorista_nao_ve_log_de_acesso(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.get("/log-acesso/", headers=headers)
    assert resp.status_code == 403
