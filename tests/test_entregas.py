"""
Cobre as validações de conflito ao criar entregas: motorista ou veículo já
em rota, ou veículo em manutenção, não podem ser atribuídos a uma nova
entrega. Ver commit "Impede motorista ou veiculo ja ocupado (em rota ou
manutencao) em nova entrega".
"""
from tests.conftest import (
    auth_headers,
    criar_entrega_orm,
    criar_manutencao_orm,
    criar_motorista_orm,
    criar_veiculo_orm,
)


def _payload(motorista_id=None, veiculo_id=None):
    return {
        "cliente": "Cliente Teste",
        "origem": "Origem",
        "destino": "Destino",
        "previsao": "2030-01-01T00:00:00",
        "motorista_id": motorista_id,
        "veiculo_id": veiculo_id,
    }


def test_admin_cria_entrega_simples(client, admin, db_session):
    motorista = criar_motorista_orm(db_session)
    veiculo = criar_veiculo_orm(db_session)
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(motorista.id, veiculo.id))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "aguardando"


def test_bloqueia_motorista_ja_em_rota(client, admin, db_session):
    motorista = criar_motorista_orm(db_session)
    criar_entrega_orm(db_session, motorista_id=motorista.id, status="em_rota")
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(motorista_id=motorista.id))
    assert resp.status_code == 400
    assert "em rota" in resp.json()["detail"]


def test_bloqueia_veiculo_ja_em_rota(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="em_rota")
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(veiculo_id=veiculo.id))
    assert resp.status_code == 400
    assert "em rota" in resp.json()["detail"]


def test_bloqueia_veiculo_em_manutencao(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_manutencao_orm(db_session, veiculo_id=veiculo.id, status="em_andamento")
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(veiculo_id=veiculo.id))
    assert resp.status_code == 400
    assert "manutenção" in resp.json()["detail"]


def test_veiculo_com_manutencao_concluida_nao_bloqueia(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_manutencao_orm(db_session, veiculo_id=veiculo.id, status="concluida")
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(veiculo_id=veiculo.id))
    assert resp.status_code == 200, resp.text


def test_cria_entrega_em_standby_sem_motorista_nem_veiculo(client, admin):
    """Frete cadastrado antes de saber qual conjunto vai atender — motorista_id
    e veiculo_id ficam em branco até serem definidos depois."""
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["motorista_id"] is None
    assert body["veiculo_id"] is None
    assert body["status"] == "aguardando"


def test_atribui_motorista_e_veiculo_depois_via_edicao(client, admin, db_session):
    headers = auth_headers(client, admin.email)
    entrega = client.post("/entregas/", headers=headers, json=_payload()).json()

    motorista = criar_motorista_orm(db_session)
    veiculo = criar_veiculo_orm(db_session)
    resp = client.put(
        f"/entregas/{entrega['id']}",
        headers=headers,
        json={"motorista_id": motorista.id, "veiculo_id": veiculo.id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["motorista_id"] == motorista.id
    assert body["veiculo_id"] == veiculo.id


def test_motorista_so_ve_a_propria_entrega_por_id(client, db_session, motorista_usuario):
    from app.models.motorista import Motorista
    meu_motorista = db_session.query(Motorista).filter(Motorista.usuario_id == motorista_usuario.id).first()
    minha_entrega = criar_entrega_orm(db_session, motorista_id=meu_motorista.id)
    outro_motorista = criar_motorista_orm(db_session, cpf="52998224725", cnh_numero="99999999999")
    entrega_alheia = criar_entrega_orm(db_session, motorista_id=outro_motorista.id)

    headers = auth_headers(client, motorista_usuario.email)
    resp_propria = client.get(f"/entregas/{minha_entrega.id}", headers=headers)
    assert resp_propria.status_code == 200

    resp_alheia = client.get(f"/entregas/{entrega_alheia.id}", headers=headers)
    assert resp_alheia.status_code == 403


def test_motorista_nao_pode_cancelar_a_propria_entrega(client, db_session, motorista_usuario):
    """Cancelar é decisão operacional — só admin cancela via DELETE, então o
    endpoint de status não pode virar um atalho pro motorista fazer o mesmo."""
    from app.models.motorista import Motorista
    meu_motorista = db_session.query(Motorista).filter(Motorista.usuario_id == motorista_usuario.id).first()
    minha_entrega = criar_entrega_orm(db_session, motorista_id=meu_motorista.id)

    headers = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/entregas/{minha_entrega.id}/status", headers=headers, params={"status": "cancelado"})
    assert resp.status_code == 403


def test_motorista_pode_marcar_a_propria_entrega_como_entregue(client, db_session, motorista_usuario):
    """O fluxo normal do motorista (avançar o status da própria entrega) continua liberado."""
    from app.models.motorista import Motorista
    meu_motorista = db_session.query(Motorista).filter(Motorista.usuario_id == motorista_usuario.id).first()
    minha_entrega = criar_entrega_orm(db_session, motorista_id=meu_motorista.id)

    headers = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/entregas/{minha_entrega.id}/status", headers=headers, params={"status": "entregue"})
    assert resp.status_code == 200, resp.text


def test_operador_pode_atualizar_entrega(client, operador, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"cliente": "Cliente Novo"})
    assert resp.status_code == 200, resp.text


def test_motorista_nao_pode_atualizar_entrega_via_put(client, db_session, motorista_usuario):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, motorista_usuario.email)
    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"cliente": "X"})
    assert resp.status_code == 403


def test_admin_cancela_entrega_via_delete(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    resp = client.delete(f"/entregas/{entrega.id}", headers=headers)
    assert resp.status_code == 200, resp.text


def test_operador_nao_pode_cancelar_entrega_via_delete(client, operador, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, operador.email)
    resp = client.delete(f"/entregas/{entrega.id}", headers=headers)
    assert resp.status_code == 403


def test_editar_entrega_com_motorista_id_null_desvincula_motorista(client, admin, db_session):
    """model_dump(exclude_unset=True): mandar motorista_id=null precisa realmente
    limpar o vínculo, não ser descartado silenciosamente como exclude_none fazia."""
    motorista = criar_motorista_orm(db_session)
    entrega = criar_entrega_orm(db_session, motorista_id=motorista.id)
    headers = auth_headers(client, admin.email)

    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"motorista_id": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["motorista_id"] is None
