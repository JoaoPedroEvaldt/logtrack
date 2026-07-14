from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Veiculo(Base):
    __tablename__ = "veiculos"

    id              = Column(Integer, primary_key=True, index=True)
    placa           = Column(String(10), nullable=False, unique=True)
    modelo          = Column(String(80), nullable=False)
    marca           = Column(String(60), nullable=False)
    ano             = Column(Integer, nullable=False)
    tipo            = Column(String(30), nullable=False)
    subtipo         = Column(String(50), nullable=True)
    eixos           = Column(Integer, nullable=True)
    tipo_eixo       = Column(String(20), nullable=True)
    cor             = Column(String(50), nullable=True)
    capacidade_kg   = Column(Numeric(10, 2), nullable=False)
    status          = Column(String(20), nullable=False, default="disponivel")
    crlv_validade   = Column(Date)
    seguro_validade = Column(Date)
    criado_em       = Column(DateTime, server_default=func.now())
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    manutencoes     = relationship("Manutencao", backref="veiculo")
    entregas        = relationship("Entrega", backref="veiculo")