from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Motorista(Base):
    __tablename__ = "motoristas"

    id              = Column(Integer, primary_key=True, index=True)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    cpf             = Column(String(14), nullable=False, unique=True)
    cnh_numero      = Column(String(20), nullable=False, unique=True)
    cnh_categoria   = Column(String(5), nullable=False)
    cnh_validade    = Column(Date, nullable=False)
    telefone        = Column(String(20))
    status          = Column(String(20), nullable=False, default="disponivel")
    criado_em       = Column(DateTime, server_default=func.now())
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    usuario         = relationship("Usuario", backref="motorista")
    entregas        = relationship("Entrega", backref="motorista")