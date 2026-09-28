"""
Ambiente do Alembic. A URL do banco vem de app.config.settings (mesma do app:
.env local ou variável de ambiente DATABASE_URL), nunca do alembic.ini — assim
dá pra apontar pra outro banco só trocando a variável, ex.:

    DATABASE_URL="postgresql://..." alembic upgrade head
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import settings
from app.database import Base
import app.models  # noqa: F401 - registra as tabelas em Base.metadata
from app.models import abastecimento, deslocamento_vazio  # noqa: F401 - idem (fora do __init__)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Gera o SQL das migrações (alembic upgrade head --sql) sem conectar no banco."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(settings.DATABASE_URL, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
