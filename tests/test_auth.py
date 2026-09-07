from app.models.log_acesso import LogAcesso
from tests.conftest import SENHA_PADRAO


def test_login_certo_registra_tentativa_ok_no_log(client, admin, db_session):
    client.post("/auth/login", data={"username": admin.email, "password": SENHA_PADRAO})
    log = db_session.query(LogAcesso).filter(LogAcesso.email_tentado == admin.email).first()
    assert log is not None
    assert log.tentativa_ok is True
    assert log.usuario_id == admin.id


def test_login_errado_registra_tentativa_falha_no_log(client, admin, db_session):
    client.post("/auth/login", data={"username": admin.email, "password": "senha_errada"})
    log = db_session.query(LogAcesso).filter(LogAcesso.email_tentado == admin.email).first()
    assert log is not None
    assert log.tentativa_ok is False
    assert log.usuario_id == admin.id


def test_login_com_email_inexistente_registra_log_sem_usuario(client, db_session):
    client.post("/auth/login", data={"username": "ninguem@teste.com", "password": "qualquer"})
    log = db_session.query(LogAcesso).filter(LogAcesso.email_tentado == "ninguem@teste.com").first()
    assert log is not None
    assert log.tentativa_ok is False
    assert log.usuario_id is None


def test_muitas_tentativas_erradas_bloqueia_login_temporariamente(client, admin):
    for _ in range(5):
        resp = client.post("/auth/login", data={"username": admin.email, "password": "senha_errada"})
        assert resp.status_code == 401

    # a 6a tentativa (mesmo com a senha certa) deve ser bloqueada por forca bruta
    resp_bloqueado = client.post("/auth/login", data={"username": admin.email, "password": SENHA_PADRAO})
    assert resp_bloqueado.status_code == 429


def test_bloqueio_por_forca_bruta_e_por_email_nao_afeta_outro_usuario(client, admin, operador):
    for _ in range(5):
        client.post("/auth/login", data={"username": admin.email, "password": "senha_errada"})

    resp_outro_usuario = client.post("/auth/login", data={"username": operador.email, "password": SENHA_PADRAO})
    assert resp_outro_usuario.status_code == 200


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
