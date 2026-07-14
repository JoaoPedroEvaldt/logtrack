from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Ocorrencia(Base):
    __tablename__ = "ocorrencias"

    id          = Column(Integer, primary_key=True, index=True)
    entrega_id  = Column(Integer, ForeignKey("entregas.id"), nullable=False)
    usuario_id  = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo        = Column(String(30), nullable=False)
    descricao   = Column(Text, nullable=False)
    foto_path   = Column(String(255))
    criado_em   = Column(DateTime, server_default=func.now())

    usuario     = relationship("Usuario", backref="ocorrencias")