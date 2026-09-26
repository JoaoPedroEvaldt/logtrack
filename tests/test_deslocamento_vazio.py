"""
Cobre o router deslocamento_vazio.py que a suíte de test_entregas.py não
exercitava: listagem (com filtro por perfil) e as validações do PUT que não
dependem de iniciar uma rota (km negativo, entrega inexistente, acesso negado).
"""
from app.models.motorista import Motorista
from tests.conftest import (
    auth_headers,
    criar_entrega_orm,
    criar_motorista_orm,
    criar_veiculo_orm,
)


def test_admin_lista_todos_os_deslocamentos_vazios(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="entregue")
    nova = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="aguardando")

    headers = auth_headers(client, admin.email)
    client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})

    resp = client.get("/deslocamentos-vazios", headers=headers)
    assert resp.status_code == 200, resp.text
    entregas_ids = [item["entrega_id"] for item in resp.json()]
    assert nova.id in entregas_ids


def test_motorista_so_ve_deslocamento_vazio_da_propria_entrega(client, admin, db_session, motorista_usuario):
    meu_motorista = db_session.query(Motorista).filter(Motorista.usuario_id == motorista_usuario.id).first()
    outro_motorista = criar_motorista_orm(db_session, cpf="52998224725", cnh_numero="98765432100")

    veiculo_meu = criar_veiculo_orm(db_session, placa="AAA1111")
    veiculo_outro = criar_veiculo_orm(db_session, placa="BBB2222")

    criar_entrega_orm(db_session, veiculo_id=veiculo_meu.id, status="entregue")
    minha_entrega = criar_entrega_orm(db_session, motorista_id=meu_motorista.id, veiculo_id=veiculo_meu.id, status="aguardando")

    criar_entrega_orm(db_session, veiculo_id=veiculo_outro.id, status="entregue")
    entrega_do_outro = criar_entrega_orm(db_session, motorista_id=outro_motorista.id, veiculo_id=veiculo_outro.id, status="aguardando")

    headers_admin = auth_headers(client, admin.email)
    client.put(f"/entregas/{minha_entrega.id}/status", headers=headers_admin, params={"status": "em_rota"})
    client.put(f"/entregas/{entrega_do_outro.id}/status", headers=headers_admin, params={"status": "em_rota"})

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.get("/deslocamentos-vazios", headers=headers_motorista)
    assert resp.status_code == 200, resp.text
    entregas_ids = [item["entrega_id"] for item in resp.json()]
    assert minha_entrega.id in entregas_ids
    assert entrega_do_outro.id not in entregas_ids


def test_km_vazio_negativo_e_rejeitado(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="entregue")
    nova = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="aguardando")

    headers = auth_headers(client, admin.email)
    client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})

    resp = client.put(f"/deslocamentos-vazios/{nova.id}", headers=headers, json={"km_vazio": -10})
    assert resp.status_code == 400, resp.text


def test_atualizar_km_vazio_de_entrega_inexistente_retorna_404(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.put("/deslocamentos-vazios/999999", headers=headers, json={"km_vazio": 10})
    assert resp.status_code == 404


def test_motorista_nao_pode_atualizar_km_vazio_de_entrega_alheia(client, db_session, motorista_usuario):
    outro_motorista = criar_motorista_orm(db_session, cpf="52998224725", cnh_numero="98765432100")
    veiculo = criar_veiculo_orm(db_session)
    entrega_do_outro = criar_entrega_orm(db_session, motorista_id=outro_motorista.id, veiculo_id=veiculo.id, status="em_rota")

    headers_motorista = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/deslocamentos-vazios/{entrega_do_outro.id}", headers=headers_motorista, json={"km_vazio": 10})
    assert resp.status_code == 403
