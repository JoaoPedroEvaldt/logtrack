from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base

class LogAcesso(Base):
    __tablename__ = "log_acesso"
    __table_args__ = (
        Index("idx_log_acesso_usuario", "usuario_id"),
        Index("log_acesso_email_criado_idx", "email_tentado", "criado_em"),
    )

    id             = Column(Integer, primary_key=True)
    usuario_id     = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    email_tentado  = Column(String(150), nullable=False)
    ip             = Column(String(45), nullable=True)
    tentativa_ok   = Column(Boolean, nullable=False)
    # default no Python (nao server_default=func.now()) de proposito: o
    # bloqueio por forca bruta compara criado_em contra datetime.utcnow() no
    # auth.py, e o func.now() depende da timezone de cada banco. Gerar o
    # timestamp em Python garante que quem grava a linha e quem calcula a
    # janela de bloqueio usam o mesmo relogio. Em UTC, como os demais
    # timestamps do sistema (a tela converte para Brasilia ao exibir).
    criado_em      = Column(DateTime, nullable=False, default=datetime.utcnow)

    usuario        = relationship("Usuario")

    @property
    def usuario_nome(self):
        return self.usuario.nome if self.usuario else None
