from sqlalchemy import Column, Integer, String, DateTime, Date, Numeric, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Manutencao(Base):
    __tablename__ = "manutencoes"

    id              = Column(Integer, primary_key=True, index=True)
    veiculo_id      = Column(Integer, ForeignKey("veiculos.id"), nullable=False)
    data_manutencao = Column(Date, nullable=False)
    tipo            = Column(String(50), nullable=False)
    descricao       = Column(Text, nullable=False)
    custo           = Column(Numeric(10, 2))
    mecanico        = Column(String(100))
    quilometragem   = Column(Integer)
    status          = Column(String(20), nullable=False, default="concluida")
    proxima_revisao = Column(Date)
    criado_em       = Column(DateTime, server_default=func.now())

    veiculo         = relationship("Veiculo", back_populates="manutencoes")