from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# O Neon (plano gratuito) desliga o banco depois de ~5 min sem uso e derruba
# as conexões abertas; sem pool_pre_ping, a 1ª requisição depois de uma pausa
# pegava uma conexão morta do pool e dava erro 500. O ping testa a conexão
# antes de usar e abre outra se ela tiver caído.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=300)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()