"""Testes das novas contas do dashboard: comparação com o mês anterior no
faturamento, e a estimativa de custo por km rodado."""
from datetime import date

from app.models.abastecimento import Abastecimento
from app.models.manutencao import Manutencao

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


def criar_abastecimento_orm(db_session, veiculo_id, valor_total, quilometragem=None, data=None):
    a = Abastecimento(
        veiculo_id=veiculo_id,
        data_abastecimento=data or _hoje_no_mes_atual(),
        litros=100,
        valor_total=valor_total,
        quilometragem=quilometragem,
    )
    db_session.add(a)
    db_session.commit()
    return a


def criar_manutencao_com_custo(db_session, veiculo_id, custo, quilometragem=None, data=None):
    m = Manutencao(
        veiculo_id=veiculo_id,
        data_manutencao=data or _hoje_no_mes_atual(),
        tipo="corretiva",
        descricao="Troca de peça",
        status="concluida",
        custo=custo,
        quilometragem=quilometragem,
    )
    db_session.add(m)
    db_session.commit()
    return m


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


def test_custo_por_km_calcula_a_partir_das_leituras_de_quilometragem(client, db_session, admin):
    veiculo = criar_veiculo_orm(db_session)
    hoje = _hoje_no_mes_atual()

    # Duas leituras de km no mês (abastecimento em 50000, manutenção em 50500) e
    # custos de R$300 (combustível) + R$200 (manutenção) = R$500 pra 500 km rodados.
    criar_abastecimento_orm(db_session, veiculo.id, valor_total=300, quilometragem=50000, data=hoje)
    criar_manutencao_com_custo(db_session, veiculo.id, custo=200, quilometragem=50500, data=hoje)

    headers = auth_headers(client, "admin@teste.com")
    res = client.get("/dashboard/custo-por-km", headers=headers)
    assert res.status_code == 200, res.text
    dados = res.json()

    assert len(dados) == 1
    linha = dados[0]
    assert linha["placa"] == veiculo.placa
    assert linha["km_rodado"] == 500
    assert linha["custo_total"] == 500
    assert linha["custo_por_km"] == 1.0


def test_custo_por_km_ignora_veiculo_com_menos_de_duas_leituras(client, db_session, admin):
    veiculo = criar_veiculo_orm(db_session)
    hoje = _hoje_no_mes_atual()

    # Só uma leitura de quilometragem no período — não dá pra calcular km rodado.
    criar_abastecimento_orm(db_session, veiculo.id, valor_total=300, quilometragem=50000, data=hoje)

    headers = auth_headers(client, "admin@teste.com")
    res = client.get("/dashboard/custo-por-km", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json() == []
