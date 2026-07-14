from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Conjunto(Base):
    __tablename__ = "conjuntos"

    id                = Column(Integer, primary_key=True, index=True)
    nome              = Column(String(100), nullable=False)
    motorista_id      = Column(Integer, ForeignKey("motoristas.id"), nullable=True)
    cavalo_id         = Column(Integer, ForeignKey("veiculos.id"), nullable=True)
    semirreboque1_id  = Column(Integer, ForeignKey("veiculos.id"), nullable=True)
    semirreboque2_id  = Column(Integer, ForeignKey("veiculos.id"), nullable=True)
    status            = Column(String(20), nullable=False, default="ativo")
    criado_em         = Column(DateTime, server_default=func.now())
    atualizado_em     = Column(DateTime, server_default=func.now(), onupdate=func.now())

    motorista         = relationship("Motorista", backref="conjuntos", foreign_keys=[motorista_id])
    cavalo            = relationship("Veiculo", foreign_keys=[cavalo_id])
    semirreboque1     = relationship("Veiculo", foreign_keys=[semirreboque1_id])
    semirreboque2     = relationship("Veiculo", foreign_keys=[semirreboque2_id])