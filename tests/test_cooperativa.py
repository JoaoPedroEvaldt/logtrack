"""Carga pela cooperativa: 7% ficam com ela, a comissão incide sobre o que sobra
e o recebimento vence 120 dias depois da emissão do CT-e."""
from datetime import timedelta

import pytest

from app.routers.dashboard import hoje_brasilia, inicio_do_dia_utc
from tests.conftest import auth_headers, criar_entrega_orm, criar_motorista_orm

HOJE = hoje_brasilia()
PERIODO = {"periodo_inicio": str(HOJE - timedelta(days=29)), "periodo_fim": str(HOJE)}


def _concluida(db_session, motorista, frete=20000, pct=7):
    e = criar_entrega_orm(db_session, motorista_id=motorista.id, status="entregue")
    e.valor_frete = frete
    e.cooperativa_pct = pct
    e.prazo_recebimento_dias = 120 if pct else None
    e.concluido_em = inicio_do_dia_utc(HOJE) + timedelta(hours=1)
    db_session.commit()
    return e


def test_taxa_comissao_e_prazo_no_cadastro(client, admin):
    h = auth_headers(client, admin.email)
    base = {"cliente": "C", "origem": "A", "destino": "B", "previsao": "2026-10-10T10:00:00", "valor_frete": 20000}
    e = client.post("/entregas", headers=h, json={**base, "cooperativa_pct": 7, "cte_emitido_em": "2026-10-01"}).json()
    assert (e["taxa_cooperativa"], e["frete_liquido"], e["comissao"]) == (1400, 18600, 2418)
    assert e["prazo_recebimento_dias"] == 120
    assert e["previsao_recebimento"] == "2027-01-29"
    direto = client.post("/entregas", headers=h, json=base).json()
    assert (direto["taxa_cooperativa"], direto["comissao"], direto["previsao_recebimento"]) == (0, 2600, None)
    for pct in (0, -1, 100):
        assert client.post("/entregas", headers=h, json={**base, "cooperativa_pct": pct}).status_code == 422
    # Desmarcar a cooperativa apaga os dados dela.
    e = client.put(f"/entregas/{e['id']}", headers=h, json={"cooperativa_pct": None}).json()
    assert e["cte_emitido_em"] is None and e["previsao_recebimento"] is None and e["comissao"] == 2600


def test_acerto_painel_e_desempenho_usam_a_mesma_conta(client, db_session, admin):
    h = auth_headers(client, admin.email)
    m = criar_motorista_orm(db_session)
    _concluida(db_session, m)
    _concluida(db_session, m, frete=10000, pct=None)
    p = client.get("/acertos/previa", headers=h, params={"motorista_id": m.id, **PERIODO}).json()
    assert p["total_frete"] == 30000
    assert p["comissao"] == pytest.approx(2418 + 1300)
    fat = client.get("/dashboard/faturamento", headers=h).json()
    assert fat["receita_bruta"] == 30000 and fat["taxa_cooperativa"] == 1400
    assert fat["faturamento_liquido"] == pytest.approx(30000 - 1400 - 3718)
    assert sum(c["liquido"] for c in fat["por_conjunto"]) == pytest.approx(fat["faturamento_liquido"])
    d = client.get("/dashboard/desempenho-motoristas", headers=h).json()
    assert d[0]["comissao"] == pytest.approx(3718)


def test_mudar_taxa_em_viagem_acertada(client, db_session, admin, operador):
    h = auth_headers(client, admin.email)
    ho = auth_headers(client, operador.email)
    m = criar_motorista_orm(db_session)
    e = _concluida(db_session, m)
    a = client.post("/acertos", headers=h, json={"motorista_id": m.id, **PERIODO}).json()
    assert a["comissao"] == 2418
    assert client.put(f"/entregas/{e.id}", headers=ho, json={"cooperativa_pct": 5}).status_code == 403
    assert client.put(f"/entregas/{e.id}", headers=ho, json={"cooperativa_pct": 7}).status_code == 200
    # Receber não altera o acerto, então o operador pode.
    assert client.put(f"/entregas/{e.id}/recebimento?recebido_em={HOJE}", headers=ho).status_code == 200
    assert client.put(f"/entregas/{e.id}", headers=h, json={"cooperativa_pct": None}).status_code == 200
    assert client.get(f"/acertos/{a['id']}", headers=h).json()["comissao"] == 2600


def test_recebimento(client, db_session, admin):
    h = auth_headers(client, admin.email)
    m = criar_motorista_orm(db_session)
    e = _concluida(db_session, m)
    url = f"/entregas/{e.id}/recebimento"
    assert client.put(f"{url}?recebido_em={HOJE + timedelta(days=1)}", headers=h).status_code == 400
    assert client.put(f"{url}?recebido_em={HOJE}", headers=h).json()["recebido_em"] == str(HOJE)
    assert client.put(url, headers=h).json()["recebido_em"] is None
    direto = _concluida(db_session, m, pct=None)
    assert client.put(f"/entregas/{direto.id}/recebimento?recebido_em={HOJE}", headers=h).status_code == 400
