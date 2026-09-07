"""Testes das novas contas do dashboard: comparação do faturamento com o mês
anterior, usando a mesma quantidade de dias decorridos em ambos os meses."""
from datetime import date

from tests.conftest import (
    auth_headers,
    criar_entrega_orm,
    criar_motorista_orm,
    criar_veiculo_orm,
)


def _hoje_no_mes_atual():
    return date.today()


def _mes_anterior(d):
    """Dia 1 do mês anterior — sempre dentro da janela comparável, que só cobre os
    mesmos N dias já decorridos no mês atual (ver comentário em dashboard.py)."""
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


def test_faturamento_compara_com_mes_anterior(client, db_session, admin):
    veiculo = criar_veiculo_orm(db_session)
    motorista = criar_motorista_orm(db_session)

    hoje = _hoje_no_mes_atual()
    anterior = _mes_anterior(hoje)

    # Mês atual: uma entrega de R$1000, sem custos.
    e1 = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    e1.valor_frete = 1000
    e1.concluido_em = hoje
    db_session.commit()

    # Mês anterior: uma entrega de R$500.
    e2 = criar_entrega_orm(db_session, motorista_id=motorista.id, veiculo_id=veiculo.id, status="entregue")
    e2.valor_frete = 500
    e2.concluido_em = anterior
    db_session.commit()

    headers = auth_headers(client, "admin@teste.com")
    res = client.get("/dashboard/faturamento", headers=headers)
    assert res.status_code == 200, res.text
    dados = res.json()

    assert dados["receita_bruta"] == 1000
    assert dados["mes_anterior"]["receita_bruta"] == 500
    assert dados["mes_anterior"]["faturamento_liquido"] == 500
    # mês anterior não deve vazar pro total do mês atual
    assert dados["faturamento_liquido"] == 1000
