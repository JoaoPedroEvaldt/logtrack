"""acerto do motorista: diárias, adiantamentos e acertos

Diária = estadia paga pelo cliente, dividida em 3 (motorista, caminhão,
empresa). Adiantamento = vale do dia 5 e do dia 15. Acerto = fechamento a
cada 30 dias: comissão de 13% do frete + parte do motorista nas diárias -
adiantamentos, com os totais congelados no momento do fechamento.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "acertos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("motorista_id", sa.Integer, sa.ForeignKey("motoristas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("periodo_inicio", sa.Date, nullable=False),
        sa.Column("periodo_fim", sa.Date, nullable=False),
        sa.Column("qtd_viagens", sa.Integer, nullable=False),
        sa.Column("total_frete", sa.Numeric(12, 2), nullable=False),
        sa.Column("comissao", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_diarias", sa.Numeric(12, 2), nullable=False),
        sa.Column("diarias_motorista", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_adiantamentos", sa.Numeric(12, 2), nullable=False),
        sa.Column("saldo", sa.Numeric(12, 2), nullable=False),
        sa.Column("observacao", sa.Text),
        sa.Column("fechado_por_id", sa.Integer, sa.ForeignKey("usuarios.id", ondelete="SET NULL")),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("periodo_fim >= periodo_inicio", name="acertos_periodo_check"),
    )
    op.create_index("idx_acertos_motorista", "acertos", ["motorista_id"])

    # Viagem paga num acerto aponta pra ele — nunca entra em dois.
    op.add_column("entregas", sa.Column("acerto_id", sa.Integer, sa.ForeignKey("acertos.id", ondelete="SET NULL")))

    op.create_table(
        "diarias",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entrega_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data", sa.Date, nullable=False),
        sa.Column("dias", sa.Integer),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("descricao", sa.String(200)),
        sa.Column("acerto_id", sa.Integer, sa.ForeignKey("acertos.id", ondelete="SET NULL")),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("valor > 0", name="diarias_valor_check"),
        sa.CheckConstraint("dias > 0", name="diarias_dias_check"),
    )
    op.create_index("idx_diarias_entrega", "diarias", ["entrega_id"])

    op.create_table(
        "adiantamentos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("motorista_id", sa.Integer, sa.ForeignKey("motoristas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data", sa.Date, nullable=False),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("descricao", sa.String(200)),
        sa.Column("acerto_id", sa.Integer, sa.ForeignKey("acertos.id", ondelete="SET NULL")),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("valor > 0", name="adiantamentos_valor_check"),
    )
    op.create_index("idx_adiantamentos_motorista", "adiantamentos", ["motorista_id"])


def downgrade() -> None:
    op.drop_index("idx_adiantamentos_motorista", "adiantamentos")
    op.drop_table("adiantamentos")
    op.drop_index("idx_diarias_entrega", "diarias")
    op.drop_table("diarias")
    op.drop_column("entregas", "acerto_id")
    op.drop_index("idx_acertos_motorista", "acertos")
    op.drop_table("acertos")
