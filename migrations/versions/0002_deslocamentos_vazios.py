"""cria deslocamentos_vazios

Tabela do rastreio de deslocamento vazio (commit 5842f8a). Na época ela foi
criada à mão só no banco local; o de produção nunca a recebeu — esta migração
é o que leva a tabela pra lá.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Deslocamento vazio (km rodado sem carga antes de uma entrega) fica numa
    # tabela própria, fora de entregas, pra nenhum cálculo de faturamento
    # (que soma valor_frete de entregas) misturar km_vazio por engano.
    op.create_table(
        "deslocamentos_vazios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entrega_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entrega_anterior_id", sa.Integer, sa.ForeignKey("entregas.id", ondelete="SET NULL")),
        sa.Column("km_vazio", sa.Numeric(10, 2)),
        sa.Column("criado_em", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entrega_id", name="deslocamentos_vazios_entrega_id_key"),
        sa.CheckConstraint("km_vazio >= 0", name="deslocamentos_vazios_km_vazio_check"),
    )


def downgrade() -> None:
    op.drop_table("deslocamentos_vazios")
