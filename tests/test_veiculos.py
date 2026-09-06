import pytest

from app.services import upload_foto
from tests.conftest import JPEG_MINIMO, auth_headers, criar_veiculo_orm


@pytest.fixture(autouse=True)
def _pasta_fotos_isolada(tmp_path, monkeypatch):
    """Evita que os testes gravem arquivos de verdade dentro de uploads/ do projeto."""
    monkeypatch.setattr(upload_foto, "PASTA_UPLOADS", tmp_path)


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


def test_motorista_nao_pode_buscar_veiculo_por_id(client, motorista_usuario, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.get(f"/veiculos/{veiculo.id}", headers=headers)
    assert resp.status_code == 403


def test_admin_atualiza_veiculo(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    resp = client.put(f"/veiculos/{veiculo.id}", headers=headers, json={"modelo": "Novo Modelo"})
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_atualizar_veiculo(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.put(f"/veiculos/{veiculo.id}", headers=headers, json={"modelo": "X"})
    assert resp.status_code == 403


def test_admin_desativa_veiculo(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    resp = client.delete(f"/veiculos/{veiculo.id}", headers=headers)
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_desativar_veiculo(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.delete(f"/veiculos/{veiculo.id}", headers=headers)
    assert resp.status_code == 403


def test_veiculo_inativo_nao_aparece_na_listagem(client, admin, db_session):
    criar_veiculo_orm(db_session, placa="AAA1A11", status="disponivel")
    criar_veiculo_orm(db_session, placa="BBB2B22", status="inativo")
    headers = auth_headers(client, admin.email)
    resp = client.get("/veiculos/", headers=headers)
    assert resp.status_code == 200
    placas = [v["placa"] for v in resp.json()]
    assert "AAA1A11" in placas
    assert "BBB2B22" not in placas


def test_upload_foto_veiculo(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)

    resp = client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["foto_path"].startswith("/uploads/veiculos/")


def test_upload_foto_veiculo_formato_invalido_e_rejeitado(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)

    resp = client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("documento.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 400, resp.text


def test_upload_foto_veiculo_com_bytes_que_nao_sao_imagem_e_rejeitado(client, admin, db_session):
    """Content-Type dizendo image/jpeg não basta — o conteúdo real também é conferido."""
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)

    resp = client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", b"na verdade isso e so texto", "image/jpeg")},
    )
    assert resp.status_code == 400, resp.text


def test_operador_nao_pode_enviar_foto_de_veiculo(client, operador, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, operador.email)

    resp = client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )
    assert resp.status_code == 403


def test_remover_foto_veiculo(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )

    resp = client.delete(f"/veiculos/{veiculo.id}/foto", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["foto_path"] is None


def test_foto_do_veiculo_exige_autenticacao(client, admin, db_session):
    """A rota /uploads não pode ser pública — é a única exceção no app se não exigir token."""
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    upload = client.post(
        f"/veiculos/{veiculo.id}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )
    foto_path = upload.json()["foto_path"]

    sem_token = client.get(foto_path)
    assert sem_token.status_code == 401

    com_token = client.get(foto_path, params={"token": headers["Authorization"].split(" ")[1]})
    assert com_token.status_code == 200
