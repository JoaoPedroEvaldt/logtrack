"""
Fixtures compartilhadas dos testes. Usa um banco SQLite isolado em memória
(via override de app.database.get_db) — nunca toca no Postgres real.
"""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app import auth as auth_module
from app.models.usuario import Usuario
from app.models.motorista import Motorista
from app.models import abastecimento as _abastecimento  # noqa: F401 - registra a tabela em Base.metadata

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _criar_usuario(db_session, nome, email, senha, perfil, ativo=True):
    usuario = Usuario(
        nome=nome,
        email=email,
        senha_hash=auth_module.gerar_hash_senha(senha),
        perfil=perfil,
        ativo=ativo,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


SENHA_PADRAO = "senha123"


@pytest.fixture()
def admin(db_session):
    return _criar_usuario(db_session, "Admin Teste", "admin@teste.com", SENHA_PADRAO, "administrador")


@pytest.fixture()
def operador(db_session):
    return _criar_usuario(db_session, "Operador Teste", "operador@teste.com", SENHA_PADRAO, "operador")


@pytest.fixture()
def motorista_usuario(db_session):
    usuario = _criar_usuario(db_session, "Motorista Teste", "motorista@teste.com", SENHA_PADRAO, "motorista")
    motorista = Motorista(
        usuario_id=usuario.id,
        nome=usuario.nome,
        cpf="123.456.789-00",
        cnh_numero="12345678900",
        cnh_categoria="E",
        cnh_validade=date(2030, 1, 1),
        status="disponivel",
    )
    db_session.add(motorista)
    db_session.commit()
    return usuario


@pytest.fixture()
def inativo(db_session):
    return _criar_usuario(db_session, "Ex Funcionario", "inativo@teste.com", SENHA_PADRAO, "operador", ativo=False)


def auth_headers(client, email, senha=SENHA_PADRAO):
    resp = client.post("/auth/login", data={"username": email, "password": senha})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
