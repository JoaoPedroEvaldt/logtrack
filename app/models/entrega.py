from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Entrega(Base):
    __tablename__ = "entregas"

    id              = Column(Integer, primary_key=True, index=True)
    motorista_id    = Column(Integer, ForeignKey("motoristas.id"), nullable=True)
    veiculo_id      = Column(Integer, ForeignKey("veiculos.id"), nullable=True)
    cliente         = Column(String(150), nullable=False)
    origem          = Column(Text, nullable=False)
    destino         = Column(Text, nullable=False)
    descricao_carga = Column(Text)
    peso_kg         = Column(Numeric(10, 2))
    valor_frete     = Column(Numeric(10, 2))
    status          = Column(String(20), nullable=False, default="aguardando")
    previsao        = Column(DateTime, nullable=False)
    iniciado_em     = Column(DateTime)
    concluido_em    = Column(DateTime)
    criado_em       = Column(DateTime, server_default=func.now())
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    ocorrencias     = relationship("Ocorrencia", backref="entrega")