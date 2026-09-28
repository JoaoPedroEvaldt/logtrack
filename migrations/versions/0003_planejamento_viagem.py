"""planejamento da viagem nas entregas

Colunas preenchidas pelo formulário de entrega a partir da rota calculada
(OSRM) e da estimativa de tempo de caminhão: saída prevista, pontos de
passagem escolhidos pelo usuário, distância e tempo estimado de viagem.
Todas opcionais — entregas antigas continuam válidas sem elas.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("entregas", sa.Column("saida_prevista", sa.DateTime))
    op.add_column("entregas", sa.Column("rota_via", sa.JSON))
    op.add_column("entregas", sa.Column("distancia_km", sa.Numeric(10, 1)))
    op.add_column("entregas", sa.Column("tempo_estimado_h", sa.Numeric(7, 1)))
    op.create_check_constraint("entregas_distancia_km_check", "entregas", "distancia_km >= 0")
    op.create_check_constraint("entregas_tempo_estimado_h_check", "entregas", "tempo_estimado_h >= 0")


def downgrade() -> None:
    op.drop_constraint("entregas_tempo_estimado_h_check", "entregas", type_="check")
    op.drop_constraint("entregas_distancia_km_check", "entregas", type_="check")
    op.drop_column("entregas", "tempo_estimado_h")
    op.drop_column("entregas", "distancia_km")
    op.drop_column("entregas", "rota_via")
    op.drop_column("entregas", "saida_prevista")
