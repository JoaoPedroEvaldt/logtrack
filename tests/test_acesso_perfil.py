"""
Cobre a restrição de acesso por perfil: motorista só pode ver Dashboard
(nada) e as próprias entregas — todo o resto retorna 403. Ver memória
[[logtrack_acesso_motorista]] sobre por que esse padrão existe.
"""
import pytest
from tests.conftest import auth_headers

ENDPOINTS_BLOQUEADOS_PARA_MOTORISTA = [
    "/motoristas/",
    "/veiculos/",
    "/conjuntos/",
    "/manutencoes/",
    "/abastecimentos/",
    "/ocorrencias/",
    "/dashboard/resumo",
    "/dashboard/vencimentos",
    "/dashboard/entregas-por-status",
    "/dashboard/entregas-por-dia",
    "/dashboard/desempenho-motoristas",
    "/dashboard/faturamento",
]


@pytest.mark.parametrize("endpoint", ENDPOINTS_BLOQUEADOS_PARA_MOTORISTA)
def test_motorista_nao_acessa_endpoint(client, motorista_usuario, endpoint):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.get(endpoint, headers=headers)
    assert resp.status_code == 403, f"{endpoint} deveria bloquear motorista, retornou {resp.status_code}"


@pytest.mark.parametrize("endpoint", ENDPOINTS_BLOQUEADOS_PARA_MOTORISTA)
def test_admin_acessa_endpoint(client, admin, endpoint):
    headers = auth_headers(client, admin.email)
    resp = client.get(endpoint, headers=headers)
    assert resp.status_code == 200, f"{endpoint} deveria permitir admin, retornou {resp.status_code}"


@pytest.mark.parametrize("endpoint", ENDPOINTS_BLOQUEADOS_PARA_MOTORISTA)
def test_operador_acessa_endpoint(client, operador, endpoint):
    headers = auth_headers(client, operador.email)
    resp = client.get(endpoint, headers=headers)
    assert resp.status_code == 200, f"{endpoint} deveria permitir operador, retornou {resp.status_code}"


def test_motorista_ve_apenas_proprias_entregas(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.get("/entregas/", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_motorista_sem_permissao_para_criar_entrega(client, motorista_usuario):
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.post("/entregas/", headers=headers, json={
        "cliente": "Cliente X",
        "origem": "Origem",
        "destino": "Destino",
        "previsao": "2030-01-01T00:00:00",
    })
    assert resp.status_code == 403
