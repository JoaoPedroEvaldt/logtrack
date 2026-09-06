import pytest

from app.services import upload_foto
from tests.conftest import JPEG_MINIMO, PNG_MINIMO, auth_headers


@pytest.fixture(autouse=True)
def _pasta_fotos_isolada(tmp_path, monkeypatch):
    """Evita que os testes gravem arquivos de verdade dentro de uploads/ do projeto."""
    monkeypatch.setattr(upload_foto, "PASTA_UPLOADS", tmp_path)


def _criar_conjunto(client, headers, nome="Conjunto Teste"):
    resp = client.post("/conjuntos/", headers=headers, json={"nome": nome})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_upload_foto_conjunto(client, admin):
    headers = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers)
    assert conjunto["foto_path"] is None

    resp = client.post(
        f"/conjuntos/{conjunto['id']}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["foto_path"].startswith("/uploads/conjuntos/")

    # A troca por uma nova foto deve substituir o caminho anterior, sem acumular arquivos,
    # e o arquivo antigo deve realmente sumir do disco.
    resp2 = client.post(
        f"/conjuntos/{conjunto['id']}/foto",
        headers=headers,
        files={"foto": ("nova.png", PNG_MINIMO, "image/png")},
    )
    assert resp2.status_code == 200, resp2.text
    novo_caminho = resp2.json()["foto_path"]
    assert novo_caminho != body["foto_path"]
    assert not (upload_foto.PASTA_UPLOADS / body["foto_path"].removeprefix("/uploads/")).exists()
    assert (upload_foto.PASTA_UPLOADS / novo_caminho.removeprefix("/uploads/")).exists()


def test_upload_foto_formato_invalido_e_rejeitado(client, admin):
    headers = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers)

    resp = client.post(
        f"/conjuntos/{conjunto['id']}/foto",
        headers=headers,
        files={"foto": ("documento.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 400, resp.text


def test_upload_foto_com_bytes_que_nao_sao_imagem_e_rejeitado(client, admin):
    """Content-Type dizendo image/jpeg não basta — o conteúdo real também é conferido."""
    headers = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers)

    resp = client.post(
        f"/conjuntos/{conjunto['id']}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", b"na verdade isso e so texto", "image/jpeg")},
    )
    assert resp.status_code == 400, resp.text


def test_operador_pode_criar_conjunto(client, operador):
    headers = auth_headers(client, operador.email)
    resp = client.post("/conjuntos/", headers=headers, json={"nome": "Conjunto Operador"})
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_criar_conjunto(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/conjuntos/", headers=headers, json={"nome": "Conjunto Motorista"})
    assert resp.status_code == 403


def test_motorista_nao_pode_atualizar_conjunto(client, admin, motorista_usuario):
    headers_admin = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers_admin)

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/conjuntos/{conjunto['id']}", headers=headers_motorista, json={"nome": "X"})
    assert resp.status_code == 403


def test_admin_desativa_conjunto(client, admin):
    headers = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers)

    resp = client.delete(f"/conjuntos/{conjunto['id']}", headers=headers)
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_desativar_conjunto(client, admin, operador):
    headers_admin = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers_admin)

    headers_operador = auth_headers(client, operador.email)
    resp = client.delete(f"/conjuntos/{conjunto['id']}", headers=headers_operador)
    assert resp.status_code == 403


def test_editar_conjunto_com_cavalo_id_null_desvincula_veiculo(client, admin, db_session):
    """model_dump(exclude_unset=True): mandar cavalo_id=null (opção "Sem cavalo" no
    modal) precisa realmente limpar o vínculo, não ser descartado como antes."""
    from tests.conftest import criar_veiculo_orm

    cavalo = criar_veiculo_orm(db_session, placa="CAV1A11", tipo="cavalo")
    headers = auth_headers(client, admin.email)
    conjunto = client.post("/conjuntos/", headers=headers, json={"nome": "C1", "cavalo_id": cavalo.id}).json()
    assert conjunto["cavalo_id"] == cavalo.id

    resp = client.put(f"/conjuntos/{conjunto['id']}", headers=headers, json={"cavalo_id": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["cavalo_id"] is None


def test_remover_foto_conjunto(client, admin):
    headers = auth_headers(client, admin.email)
    conjunto = _criar_conjunto(client, headers)
    client.post(
        f"/conjuntos/{conjunto['id']}/foto",
        headers=headers,
        files={"foto": ("foto.jpg", JPEG_MINIMO, "image/jpeg")},
    )

    resp = client.delete(f"/conjuntos/{conjunto['id']}/foto", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["foto_path"] is None
