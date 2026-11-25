"""carga pela cooperativa: taxa retida e controle do recebimento

A cooperativa emite CT-e e manifesto, fica com um percentual do frete e paga
depois de um prazo contado da emissão do CT-e. Entregas que já existem ficam
com percentual nulo (frete direto), sem nenhum valor alterado.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entregas", sa.Column("cooperativa_pct", sa.Numeric(5, 2)))
    op.add_column("entregas", sa.Column("cte_emitido_em", sa.Date))
    op.add_column("entregas", sa.Column("prazo_recebimento_dias", sa.Integer))
    op.add_column("entregas", sa.Column("recebido_em", sa.Date))


def downgrade() -> None:
    for coluna in ("recebido_em", "prazo_recebimento_dias", "cte_emitido_em", "cooperativa_pct"):
        op.drop_column("entregas", coluna)
