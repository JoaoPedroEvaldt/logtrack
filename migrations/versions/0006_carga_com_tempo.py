"""carga com tempo: saída para a estrada depois da carga

O caminhão carrega (entrega em rota, ocupado) mas só pega a estrada depois,
por exemplo após a folga do motorista, quando a agenda do cliente é longa.
Opcional: sem ela a estrada começa na hora em que a viagem foi iniciada.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entregas", sa.Column("parte_em", sa.DateTime))


def downgrade() -> None:
    op.drop_column("entregas", "parte_em")
