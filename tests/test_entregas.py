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


def test_criar_entrega_com_motorista_inexistente_retorna_404(client, admin):
    """Sem essa checagem, um id que não existe só estoura como erro de FK do
    Postgres na hora do commit (500 feio) — o SQLite dos testes não pega isso
    sozinho porque não faz enforcement de FK por padrão."""
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(motorista_id=999999))
    assert resp.status_code == 404, resp.text


def test_criar_entrega_com_veiculo_inexistente_retorna_404(client, admin):
    headers = auth_headers(client, admin.email)
    resp = client.post("/entregas/", headers=headers, json=_payload(veiculo_id=999999))
    assert resp.status_code == 404, resp.text


def test_atualizar_entrega_com_veiculo_inexistente_retorna_404(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"veiculo_id": 999999})
    assert resp.status_code == 404, resp.text


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


def _deslocamento_vazio_de(db_session, entrega_id):
    from app.models.deslocamento_vazio import DeslocamentoVazio
    return db_session.query(DeslocamentoVazio).filter(DeslocamentoVazio.entrega_id == entrega_id).first()


def test_iniciar_rota_vincula_entrega_anterior_do_mesmo_veiculo(client, admin, db_session):
    """O deslocamento vazio (tabela própria, separada de entregas) deve apontar
    pra última entrega concluída do mesmo veículo — é o ponto de partida do
    trecho vazio até a origem desta."""
    from datetime import datetime
    veiculo = criar_veiculo_orm(db_session)
    anterior = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="entregue")
    anterior.concluido_em = datetime(2026, 1, 1)
    db_session.commit()
    nova = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="aguardando")

    headers = auth_headers(client, admin.email)
    resp = client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["entrega_anterior_id"] == anterior.id

    dv = _deslocamento_vazio_de(db_session, nova.id)
    assert dv.entrega_anterior_id == anterior.id
    assert dv.km_vazio is None


def test_iniciar_rota_sem_entrega_anterior_nao_vincula(client, admin, db_session):
    """Primeira entrega de um veículo novo não tem deslocamento vazio pra medir."""
    veiculo = criar_veiculo_orm(db_session)
    nova = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="aguardando")

    headers = auth_headers(client, admin.email)
    resp = client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["entrega_anterior_id"] is None

    dv = _deslocamento_vazio_de(db_session, nova.id)
    assert dv.entrega_anterior_id is None


def test_salvar_km_vazio_com_entrega_anterior(client, admin, db_session):
    veiculo = criar_veiculo_orm(db_session)
    criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="entregue")
    nova = criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="aguardando")
    headers = auth_headers(client, admin.email)
    client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})

    resp = client.put(f"/deslocamentos-vazios/{nova.id}", headers=headers, json={"km_vazio": 187.5})
    assert resp.status_code == 200, resp.text

    dv = _deslocamento_vazio_de(db_session, nova.id)
    assert float(dv.km_vazio) == 187.5


def test_salvar_km_vazio_sem_entrega_anterior_retorna_400(client, admin, db_session):
    """Sem entrega_anterior_id não há trecho vazio pra associar a distância."""
    entrega = criar_entrega_orm(db_session, status="em_rota")
    headers = auth_headers(client, admin.email)
    resp = client.put(f"/deslocamentos-vazios/{entrega.id}", headers=headers, json={"km_vazio": 50})
    assert resp.status_code == 400


def test_entrega_anterior_e_por_veiculo_nao_por_motorista(client, admin, db_session):
    """O km vazio é do CAMINHÃO, não do motorista: se o mesmo motorista troca de
    veículo entre uma entrega e outra, a entrega nova não pode "herdar" o destino
    de uma viagem que outro veículo fez. Cada veículo tem sua própria sequência."""
    motorista = criar_motorista_orm(db_session)
    veiculo_a = criar_veiculo_orm(db_session, placa="AAA0001")
    veiculo_b = criar_veiculo_orm(db_session, placa="BBB0002")

    # Motorista entrega com o veículo A (ex.: chega em Natal) — não tem nenhuma relação
    # com o que o veículo B vai fazer a seguir, mesmo sendo o mesmo motorista.
    criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo_a.id, status="entregue")

    # Mesmo motorista, mas agora no veículo B, numa entrega nova sem nenhuma
    # entrega anterior registrada para esse veículo específico.
    nova = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo_b.id, status="aguardando")

    headers = auth_headers(client, admin.email)
    resp = client.put(f"/entregas/{nova.id}/status", headers=headers, params={"status": "em_rota"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["entrega_anterior_id"] is None

    dv = _deslocamento_vazio_de(db_session, nova.id)
    assert dv.entrega_anterior_id is None


def test_motorista_pode_salvar_km_vazio_da_propria_entrega(client, db_session, motorista_usuario):
    from app.models.motorista import Motorista
    meu_motorista = db_session.query(Motorista).filter(Motorista.usuario_id == motorista_usuario.id).first()
    veiculo = criar_veiculo_orm(db_session)
    criar_entrega_orm(db_session, veiculo_id=veiculo.id, status="entregue")
    minha_entrega = criar_entrega_orm(db_session, motorista_id=meu_motorista.id, veiculo_id=veiculo.id, status="aguardando")

    headers = auth_headers(client, motorista_usuario.email)
    client.put(f"/entregas/{minha_entrega.id}/status", headers=headers, params={"status": "em_rota"})
    resp = client.put(f"/deslocamentos-vazios/{minha_entrega.id}", headers=headers, json={"km_vazio": 42})
    assert resp.status_code == 200, resp.text


def test_cria_entrega_com_planejamento_de_viagem(client, admin):
    headers = auth_headers(client, admin.email)
    payload = {
        **_payload(),
        "saida_prevista": "2029-12-28T07:00:00",
        "rota_via": [{"nome": "Curitiba - PR", "lat": -25.43, "lon": -49.27}],
        "distancia_km": 4005.3,
        "tempo_estimado_h": 131.5,
    }
    resp = client.post("/entregas/", headers=headers, json=payload)
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["saida_prevista"].startswith("2029-12-28T07:00")
    assert corpo["rota_via"] == [{"nome": "Curitiba - PR", "lat": -25.43, "lon": -49.27}]
    assert corpo["distancia_km"] == 4005.3
    assert corpo["tempo_estimado_h"] == 131.5


def test_editar_rota_via_e_depois_voltar_para_rota_direta(client, admin, db_session):
    entrega = criar_entrega_orm(db_session)
    headers = auth_headers(client, admin.email)
    via = [{"nome": "Uberlândia - MG", "lat": -18.91, "lon": -48.27}]
    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"rota_via": via, "tempo_estimado_h": 50})
    assert resp.status_code == 200, resp.text
    assert resp.json()["rota_via"] == via

    resp = client.put(f"/entregas/{entrega.id}", headers=headers, json={"rota_via": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["rota_via"] is None


def test_planejamento_rejeita_valores_invalidos(client, admin):
    headers = auth_headers(client, admin.email)
    for extra in (
        {"distancia_km": -1},
        {"tempo_estimado_h": -5},
        {"rota_via": [{"nome": "X", "lat": 120, "lon": 0}]},
    ):
        resp = client.post("/entregas/", headers=headers, json={**_payload(), **extra})
        assert resp.status_code == 422, (extra, resp.text)
