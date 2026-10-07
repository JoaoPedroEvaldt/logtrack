"""
Cobre o router deslocamento_vazio.py que a suíte de test_entregas.py não
exercitava: listagem (com filtro por perfil) e as validações do PUT que não
dependem de iniciar uma rota (km negativo, entrega inexistente, acesso negado).
"""
from datetime import datetime, timedelta

from app.models.deslocamento_vazio import DeslocamentoVazio
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


def _viagem(db_session, veiculo_id, inicio, fim=None, status="entregue"):
    e = criar_entrega_orm(db_session, veiculo_id=veiculo_id, status=status)
    e.iniciado_em = inicio
    e.concluido_em = fim
    db_session.commit()
    return e


def test_sincronizar_liga_viagens_antigas_a_anterior_do_mesmo_veiculo(client, admin, operador, db_session):
    """Viagens lançadas antes de existir a tabela ficavam sem vazio (a tela
    mostrava um trecho só). A sincronização refaz o vínculo pela cronologia."""
    t0 = datetime(2026, 8, 1, 8)
    cav1 = criar_veiculo_orm(db_session, placa="AAA1A11")
    cav2 = criar_veiculo_orm(db_session, placa="BBB2B22")
    v1 = _viagem(db_session, cav1.id, t0, t0 + timedelta(days=2))
    v2 = _viagem(db_session, cav1.id, t0 + timedelta(days=3), t0 + timedelta(days=5))
    v3 = _viagem(db_session, cav1.id, t0 + timedelta(days=6), None, status="em_rota")
    w1 = _viagem(db_session, cav2.id, t0 + timedelta(days=1), t0 + timedelta(days=4))
    w2 = _viagem(db_session, cav2.id, t0 + timedelta(days=4, hours=1), t0 + timedelta(days=6))
    cancelada = _viagem(db_session, cav2.id, t0 + timedelta(days=7), None, status="cancelado")
    # Vínculo já gravado quando a viagem entrou em rota: não pode ser mexido.
    db_session.add(DeslocamentoVazio(entrega_id=v2.id, entrega_anterior_id=v1.id, km_vazio=120))
    db_session.commit()

    r = client.post("/deslocamentos-vazios/sincronizar", headers=auth_headers(client, operador.email))
    assert r.status_code == 200, r.text
    assert r.json()["criados"] == 2  # v3 e w2

    vinculos = {d.entrega_id: d for d in db_session.query(DeslocamentoVazio).all()}
    assert vinculos[v3.id].entrega_anterior_id == v2.id and vinculos[v3.id].km_vazio is None
    assert vinculos[w2.id].entrega_anterior_id == w1.id
    assert float(vinculos[v2.id].km_vazio) == 120          # o que já existia ficou igual
    assert v1.id not in vinculos and w1.id not in vinculos  # primeira viagem de cada caminhão
    assert cancelada.id not in vinculos

    # Rodar de novo não duplica nada.
    r = client.post("/deslocamentos-vazios/sincronizar", headers=auth_headers(client, admin.email))
    assert r.json()["criados"] == 0


def test_motorista_nao_sincroniza_deslocamentos(client, motorista_usuario):
    r = client.post("/deslocamentos-vazios/sincronizar", headers=auth_headers(client, motorista_usuario.email))
    assert r.status_code == 403


def test_sincronizar_nao_conta_o_mesmo_vazio_duas_vezes_em_viagens_sobrepostas(client, admin, db_session):
    t0 = datetime(2026, 8, 1, 8)
    cav = criar_veiculo_orm(db_session, placa="CCC3C33")
    base = _viagem(db_session, cav.id, t0, t0 + timedelta(days=1))
    # Lançadas depois do fato: as duas começam depois de "base" e se sobrepõem.
    primeira = _viagem(db_session, cav.id, t0 + timedelta(days=2), t0 + timedelta(days=5))
    sobreposta = _viagem(db_session, cav.id, t0 + timedelta(days=3), t0 + timedelta(days=4))

    r = client.post("/deslocamentos-vazios/sincronizar", headers=auth_headers(client, admin.email))
    assert r.json()["criados"] == 1
    vinculos = {d.entrega_id: d.entrega_anterior_id for d in db_session.query(DeslocamentoVazio).all()}
    assert vinculos == {primeira.id: base.id}
    assert sobreposta.id not in vinculos
