from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Ocorrencia(Base):
    __tablename__ = "ocorrencias"
    __table_args__ = (
        Index("idx_ocorrencias_entrega", "entrega_id"),
    )

    id            = Column(Integer, primary_key=True)
    entrega_id    = Column(Integer, ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=False)
    tipo          = Column(String(30), nullable=False)
    descricao     = Column(Text, nullable=False)
    foto_path     = Column(String(255))
    status        = Column(String(20), nullable=False, default="aberta")
    finalizado_em = Column(DateTime, nullable=True)
    criado_em     = Column(DateTime, nullable=False, server_default=func.now())

    usuario     = relationship("Usuario", backref="ocorrencias")