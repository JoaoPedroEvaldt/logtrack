from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class LogAcesso(Base):
    __tablename__ = "log_acesso"

    id             = Column(Integer, primary_key=True, index=True)
    usuario_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    email_tentado  = Column(String(150), nullable=False)
    ip             = Column(String(45), nullable=True)
    tentativa_ok   = Column(Boolean, nullable=False)
    # default no Python (nao server_default=func.now()) de proposito: o
    # bloqueio por forca bruta compara criado_em contra datetime.now() no
    # auth.py, e func.now() do Postgres devolve hora local (America/Sao_Paulo)
    # enquanto o do SQLite (usado nos testes) devolve UTC - descasando os dois
    # em 3h dependendo do banco. Gerar o timestamp em Python garante que quem
    # grava a linha e quem calcula a janela de bloqueio usam o mesmo relogio.
    criado_em      = Column(DateTime, default=datetime.now)

    usuario        = relationship("Usuario")

    @property
    def usuario_nome(self):
        return self.usuario.nome if self.usuario else None
