from tests.conftest import SENHA_PADRAO


def test_login_com_credenciais_corretas_retorna_token(client, admin):
    resp = client.post("/auth/login", data={"username": admin.email, "password": SENHA_PADRAO})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["perfil"] == "administrador"


def test_login_com_senha_errada_retorna_401(client, admin):
    resp = client.post("/auth/login", data={"username": admin.email, "password": "senha_errada"})
    assert resp.status_code == 401


def test_login_com_email_inexistente_retorna_401(client):
    resp = client.post("/auth/login", data={"username": "ninguem@teste.com", "password": "qualquer"})
    assert resp.status_code == 401


def test_login_com_usuario_inativo_retorna_403(client, inativo):
    resp = client.post("/auth/login", data={"username": inativo.email, "password": SENHA_PADRAO})
    assert resp.status_code == 403


def test_endpoint_protegido_sem_token_retorna_401(client):
    resp = client.get("/motoristas/")
    assert resp.status_code == 401


def test_endpoint_protegido_com_token_invalido_retorna_401(client):
    resp = client.get("/motoristas/", headers={"Authorization": "Bearer token-invalido"})
    assert resp.status_code == 401
