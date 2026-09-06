"""
Cobre o controle de acesso de /usuarios/: só administrador cria, lista ou
edita usuários (buscar por id também libera o próprio usuário, mas isso não
muda no refactor de exigir_perfil e por isso não é o foco aqui).
"""
from tests.conftest import auth_headers


def _payload_usuario(email="novo@teste.com"):
    return {
        "nome": "Fulano",
        "email": email,
        "senha": "senha12345",
        "perfil": "operador",
    }


def test_admin_cria_usuario(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/usuarios/", headers=headers, json=_payload_usuario())
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_criar_usuario(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.post("/usuarios/", headers=headers, json=_payload_usuario())
    assert resp.status_code == 403


def test_motorista_nao_pode_criar_usuario(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/usuarios/", headers=headers, json=_payload_usuario())
    assert resp.status_code == 403


def test_admin_lista_usuarios(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.get("/usuarios/", headers=headers)
    assert resp.status_code == 200


def test_operador_nao_pode_listar_usuarios(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.get("/usuarios/", headers=headers)
    assert resp.status_code == 403


def test_admin_atualiza_usuario(client, admin, operador):
    headers = auth_headers(client, admin.email)
    resp = client.put(f"/usuarios/{operador.id}", headers=headers, json={"nome": "Operador Renomeado"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["nome"] == "Operador Renomeado"


def test_operador_nao_pode_atualizar_outro_usuario(client, operador, admin):
    headers = auth_headers(client, operador.email)
    resp = client.put(f"/usuarios/{admin.id}", headers=headers, json={"nome": "Hackeado"})
    assert resp.status_code == 403
