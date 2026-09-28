"""baseline: schema do banco real em 2026-09-28

Espelha exatamente o schema do Postgres em uso (extraído com pg_dump
--schema-only do banco real), não o antigo logtrack_banco.sql — que já tinha
divergido dele (faltavam índices, CHECKs e as views).

Bancos que já existiam antes do Alembic NÃO rodam esta migração: são só
marcados com `alembic stamp 0001`. Ela serve pra criar um banco novo do zero
(`alembic upgrade head`).

Revision ID: 0001
Revises:
Create Date: 2026-09-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _check_in(nome, coluna, valores):
    lista = ", ".join(f"'{v}'" for v in valores)
    return sa.CheckConstraint(f"{coluna} IN ({lista})", name=nome)


def _agora():
    return sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("email", sa.String(150), nullable=False),
        sa.Column("senha_hash", sa.String(255), nullable=False),
        sa.Column("perfil", sa.String(20), nullable=False),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("atualizado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.UniqueConstraint("email", name="usuarios_email_key"),
        _check_in("usuarios_perfil_check", "perfil", ["administrador", "operador", "motorista"]),
    )

    op.create_table(
        "motoristas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="CASCADE")),
        sa.Column("cpf", sa.String(14), nullable=False),
        sa.Column("cnh_numero", sa.String(20), nullable=False),
        sa.Column("cnh_categoria", sa.String(5), nullable=False),
        sa.Column("cnh_validade", sa.Date, nullable=False),
        sa.Column("telefone", sa.String(20)),
        sa.Column("status", sa.String(20), nullable=False, server_default="disponivel"),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("atualizado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.UniqueConstraint("usuario_id", name="motoristas_usuario_id_key"),
        _check_in("motoristas_cnh_categoria_check", "cnh_categoria",
                  ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"]),
        _check_in("motoristas_status_check", "status", ["disponivel", "em_rota", "inativo"]),
    )
    op.create_index("idx_motoristas_status", "motoristas", ["status"])
    # CPF e CNH só precisam ser únicos entre motoristas ativos: um motorista
    # desativado ("excluído") libera seu CPF/CNH para um novo cadastro.
    op.create_index("motoristas_cpf_ativo_idx", "motoristas", ["cpf"], unique=True,
                    postgresql_where=sa.text("status <> 'inativo'"))
    op.create_index("motoristas_cnh_numero_ativo_idx", "motoristas", ["cnh_numero"], unique=True,
                    postgresql_where=sa.text("status <> 'inativo'"))

    op.create_table(
        "veiculos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("placa", sa.String(10), nullable=False),
        sa.Column("modelo", sa.String(80), nullable=False),
        sa.Column("marca", sa.String(60), nullable=False),
        sa.Column("ano", sa.Integer, nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("capacidade_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="disponivel"),
        sa.Column("crlv_validade", sa.Date),
        sa.Column("seguro_validade", sa.Date),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("atualizado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("subtipo", sa.String(50)),
        sa.Column("eixos", sa.Integer),
        sa.Column("tipo_eixo", sa.String(20)),
        sa.Column("cor", sa.String(50)),
        sa.Column("foto_path", sa.String(255)),
        sa.UniqueConstraint("placa", name="veiculos_placa_key"),
        sa.CheckConstraint("ano >= 1990 AND ano <= EXTRACT(year FROM now()) + 1", name="veiculos_ano_check"),
        sa.CheckConstraint("capacidade_kg > 0", name="veiculos_capacidade_kg_check"),
        _check_in("veiculos_status_check", "status", ["disponivel", "em_rota", "em_manutencao", "inativo"]),
        _check_in("veiculos_tipo_check", "tipo", ["cavalo", "semirreboque"]),
    )
    op.create_index("idx_veiculos_status", "veiculos", ["status"])

    op.create_table(
        "manutencoes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("veiculo_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_manutencao", sa.Date, nullable=False),
        sa.Column("tipo", sa.String(50), nullable=False),
        sa.Column("descricao", sa.Text, nullable=False),
        sa.Column("custo", sa.Numeric(10, 2)),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("mecanico", sa.String(100)),
        sa.Column("quilometragem", sa.Integer),
        sa.Column("status", sa.String(20), nullable=False, server_default="concluida"),
        sa.Column("proxima_revisao", sa.Date),
        sa.Column("data_fim", sa.Date),
        sa.CheckConstraint("custo >= 0", name="manutencoes_custo_check"),
        _check_in("manutencoes_status_check", "status", ["agendada", "em_andamento", "concluida"]),
        _check_in("manutencoes_tipo_check", "tipo",
                  ["preventiva", "corretiva", "revisao", "pneus", "eletrica", "freios", "outro"]),
    )

    op.create_table(
        "entregas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("motorista_id", sa.Integer, sa.ForeignKey("motoristas.id", ondelete="SET NULL")),
        sa.Column("veiculo_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="SET NULL")),
        sa.Column("cliente", sa.String(150), nullable=False),
        sa.Column("origem", sa.Text, nullable=False),
        sa.Column("destino", sa.Text, nullable=False),
        sa.Column("descricao_carga", sa.Text),
        sa.Column("peso_kg", sa.Numeric(10, 2)),
        sa.Column("status", sa.String(20), nullable=False, server_default="aguardando"),
        sa.Column("previsao", sa.DateTime, nullable=False),
        sa.Column("iniciado_em", sa.DateTime),
        sa.Column("concluido_em", sa.DateTime),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("atualizado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("valor_frete", sa.Numeric(10, 2)),
        sa.CheckConstraint("peso_kg > 0", name="entregas_peso_kg_check"),
        _check_in("entregas_status_check", "status",
                  ["aguardando", "em_rota", "entregue", "atrasado", "ocorrencia", "cancelado"]),
        sa.CheckConstraint("valor_frete >= 0", name="entregas_valor_frete_check"),
    )
    op.create_index("idx_entregas_motorista", "entregas", ["motorista_id"])
    op.create_index("idx_entregas_previsao", "entregas", ["previsao"])
    op.create_index("idx_entregas_status", "entregas", ["status"])
    op.create_index("idx_entregas_veiculo", "entregas", ["veiculo_id"])

    op.create_table(
        "ocorrencias",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entrega_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("descricao", sa.Text, nullable=False),
        sa.Column("foto_path", sa.String(255)),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("status", sa.String(20), nullable=False, server_default="aberta"),
        sa.Column("finalizado_em", sa.DateTime),
        _check_in("ocorrencias_status_check", "status", ["aberta", "finalizada"]),
        _check_in("ocorrencias_tipo_check", "tipo",
                  ["atraso", "acidente", "cliente_ausente", "problema_mecanico", "extravio", "outro"]),
    )
    op.create_index("idx_ocorrencias_entrega", "ocorrencias", ["entrega_id"])

    # Registra toda tentativa de login (certa ou errada) — usado pra detectar
    # força bruta (bloqueio temporário em app/routers/auth.py) e pra dar
    # visibilidade de acesso pro administrador. usuario_id fica NULL quando o
    # e-mail tentado nem existe.
    op.create_table(
        "log_acesso",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("usuario_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="SET NULL")),
        sa.Column("ip", sa.String(45)),
        sa.Column("tentativa_ok", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("email_tentado", sa.String(150), nullable=False),
    )
    op.create_index("idx_log_acesso_usuario", "log_acesso", ["usuario_id"])
    op.create_index("log_acesso_email_criado_idx", "log_acesso", ["email_tentado", "criado_em"])

    op.create_table(
        "conjuntos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("motorista_id", sa.Integer, sa.ForeignKey("motoristas.id", ondelete="SET NULL")),
        sa.Column("cavalo_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="SET NULL")),
        sa.Column("semirreboque1_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="SET NULL")),
        sa.Column("semirreboque2_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="ativo"),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("atualizado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("foto_path", sa.String(255)),
        _check_in("conjuntos_status_check", "status", ["ativo", "inativo"]),
    )
    op.create_index("idx_conjuntos_cavalo", "conjuntos", ["cavalo_id"])
    op.create_index("idx_conjuntos_motorista", "conjuntos", ["motorista_id"])

    op.create_table(
        "abastecimentos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("veiculo_id", sa.Integer, sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("motorista_id", sa.Integer, sa.ForeignKey("motoristas.id", ondelete="SET NULL")),
        sa.Column("data_abastecimento", sa.Date, nullable=False),
        sa.Column("litros", sa.Numeric(10, 2), nullable=False),
        sa.Column("valor_total", sa.Numeric(10, 2), nullable=False),
        sa.Column("quilometragem", sa.Integer),
        sa.Column("posto", sa.String(100)),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.Column("estado", sa.String(2)),
        sa.CheckConstraint("litros > 0", name="abastecimentos_litros_check"),
        sa.CheckConstraint("valor_total >= 0", name="abastecimentos_valor_total_check"),
    )

    # Deslocamento vazio (km rodado sem carga antes de uma entrega) fica numa
    # tabela própria, fora de entregas, pra nenhum cálculo de faturamento
    # (que soma valor_frete de entregas) misturar km_vazio por engano.
    op.create_table(
        "deslocamentos_vazios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entrega_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entrega_anterior_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="SET NULL")),
        sa.Column("km_vazio", sa.Numeric(10, 2)),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=_agora()),
        sa.UniqueConstraint("entrega_id", name="deslocamentos_vazios_entrega_id_key"),
        sa.CheckConstraint("km_vazio >= 0", name="deslocamentos_vazios_km_vazio_check"),
    )

    # Views que existem no banco real (criadas na primeira versão do projeto,
    # hoje não usadas pelo app) — mantidas aqui só pro baseline refletir o
    # banco fielmente.
    op.execute("""
        CREATE VIEW vw_alertas_vencimento AS
         SELECT 'CNH'::text AS tipo,
            m.id AS referencia_id,
            u.nome AS descricao,
            m.cnh_validade AS vencimento,
            (m.cnh_validade - CURRENT_DATE) AS dias_restantes
           FROM motoristas m
             JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.cnh_validade <= (CURRENT_DATE + '30 days'::interval) AND m.status <> 'inativo'
        UNION ALL
         SELECT 'CRLV'::text AS tipo,
            v.id AS referencia_id,
            (v.placa || ' - ' || v.modelo) AS descricao,
            v.crlv_validade AS vencimento,
            (v.crlv_validade - CURRENT_DATE) AS dias_restantes
           FROM veiculos v
          WHERE v.crlv_validade IS NOT NULL AND v.crlv_validade <= (CURRENT_DATE + '30 days'::interval) AND v.status <> 'inativo'
        UNION ALL
         SELECT 'Seguro'::text AS tipo,
            v.id AS referencia_id,
            (v.placa || ' - ' || v.modelo) AS descricao,
            v.seguro_validade AS vencimento,
            (v.seguro_validade - CURRENT_DATE) AS dias_restantes
           FROM veiculos v
          WHERE v.seguro_validade IS NOT NULL AND v.seguro_validade <= (CURRENT_DATE + '30 days'::interval) AND v.status <> 'inativo'
          ORDER BY 5
    """)
    op.execute("""
        CREATE VIEW vw_resumo_dia AS
         SELECT count(*) FILTER (WHERE date(criado_em) = CURRENT_DATE) AS entregas_hoje,
            count(*) FILTER (WHERE status = 'em_rota') AS em_rota,
            count(*) FILTER (WHERE status = 'entregue' AND date(concluido_em) = CURRENT_DATE) AS concluidas_hoje,
            count(*) FILTER (WHERE status = 'atrasado') AS atrasadas,
            count(*) FILTER (WHERE status = 'ocorrencia') AS com_ocorrencia
           FROM entregas
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS vw_resumo_dia")
    op.execute("DROP VIEW IF EXISTS vw_alertas_vencimento")
    for tabela in ["deslocamentos_vazios", "abastecimentos", "conjuntos", "log_acesso",
                   "ocorrencias", "entregas", "manutencoes", "veiculos", "motoristas", "usuarios"]:
        op.drop_table(tabela)
