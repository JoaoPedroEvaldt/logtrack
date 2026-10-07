"""trava no banco: um veículo em um só conjunto ativo

A API e a tela já recusam montar um conjunto com cavalo/carreta que está em
outro conjunto ativo, mas a carreta TRF6J53 ficou em dois (criados antes
dessa validação existir). O gatilho garante a regra no próprio banco, mesmo
para dois cadastros salvos ao mesmo tempo (o lock serializa a checagem).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("""
        CREATE OR REPLACE FUNCTION conjuntos_veiculo_unico() RETURNS trigger AS $$
        DECLARE
            vid integer;
            conflito text;
        BEGIN
            IF NEW.status <> 'ativo' THEN
                RETURN NEW;
            END IF;
            PERFORM pg_advisory_xact_lock(hashtext('conjuntos_veiculo_unico'));
            FOREACH vid IN ARRAY ARRAY[NEW.cavalo_id, NEW.semirreboque1_id, NEW.semirreboque2_id] LOOP
                CONTINUE WHEN vid IS NULL;
                SELECT nome INTO conflito FROM conjuntos
                 WHERE status = 'ativo' AND id <> NEW.id
                   AND vid IN (cavalo_id, semirreboque1_id, semirreboque2_id)
                 LIMIT 1;
                IF conflito IS NOT NULL THEN
                    RAISE EXCEPTION 'Veículo % já está no conjunto ativo "%"', vid, conflito;
                END IF;
            END LOOP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_conjuntos_veiculo_unico
        BEFORE INSERT OR UPDATE ON conjuntos
        FOR EACH ROW EXECUTE FUNCTION conjuntos_veiculo_unico();
    """)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("DROP TRIGGER IF EXISTS trg_conjuntos_veiculo_unico ON conjuntos")
    op.execute("DROP FUNCTION IF EXISTS conjuntos_veiculo_unico()")
