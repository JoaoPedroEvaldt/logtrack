from tests.conftest import auth_headers, criar_veiculo_orm


def _payload(placa="ABC1D23"):
    return {
        "placa": placa,
        "modelo": "FH 540",
        "marca": "Volvo",
        "ano": 2022,
        "tipo": "cavalo",
        "capacidade_kg": 30000,
    }


def test_admin_cria_veiculo(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/veiculos/", headers=headers, json=_payload())
    assert resp.status_code == 200, resp.text
    assert resp.json()["placa"] == "ABC1D23"


def test_operador_nao_pode_criar_veiculo(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.post("/veiculos/", headers=headers, json=_payload())
    assert resp.status_code == 403


def test_motorista_nao_pode_criar_veiculo(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/veiculos/", headers=headers, json=_payload())
    assert resp.status_code == 403


def test_criar_veiculo_com_placa_duplicada_retorna_400(client, admin, db_session):
    criar_veiculo_orm(db_session, placa="XYZ9K88")
    headers = auth_headers(client, admin.email)
    resp = client.post("/veiculos/", headers=headers, json=_payload(placa="XYZ9K88"))
    assert resp.status_code == 400


def test_veiculo_inativo_nao_aparece_na_listagem(client, admin, db_session):
    criar_veiculo_orm(db_session, placa="AAA1A11", status="disponivel")
    criar_veiculo_orm(db_session, placa="BBB2B22", status="inativo")
    headers = auth_headers(client, admin.email)
    resp = client.get("/veiculos/", headers=headers)
    assert resp.status_code == 200
    placas = [v["placa"] for v in resp.json()]
    assert "AAA1A11" in placas
    assert "BBB2B22" not in placas
