from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Abastecimento(Base):
    __tablename__ = "abastecimentos"

    id                 = Column(Integer, primary_key=True, index=True)
    veiculo_id         = Column(Integer, ForeignKey("veiculos.id"), nullable=False)
    motorista_id       = Column(Integer, ForeignKey("motoristas.id"), nullable=True)
    data_abastecimento = Column(Date, nullable=False)
    litros             = Column(Numeric(10, 2), nullable=False)
    valor_total        = Column(Numeric(10, 2), nullable=False)
    quilometragem      = Column(Integer, nullable=True)
    posto              = Column(String(100), nullable=True)
    estado             = Column(String(2), nullable=True)
    criado_em          = Column(DateTime, server_default=func.now())

    veiculo            = relationship("Veiculo")
    motorista          = relationship("Motorista")
