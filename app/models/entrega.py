from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Entrega(Base):
    __tablename__ = "entregas"
    __table_args__ = (
        Index("idx_entregas_motorista", "motorista_id"),
        Index("idx_entregas_previsao", "previsao"),
        Index("idx_entregas_status", "status"),
        Index("idx_entregas_veiculo", "veiculo_id"),
    )

    id              = Column(Integer, primary_key=True)
    motorista_id    = Column(Integer, ForeignKey("motoristas.id", ondelete="SET NULL"), nullable=True)
    veiculo_id      = Column(Integer, ForeignKey("veiculos.id", ondelete="SET NULL"), nullable=True)
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
    criado_em       = Column(DateTime, nullable=False, server_default=func.now())
    atualizado_em   = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    ocorrencias     = relationship("Ocorrencia", backref="entrega")

    # Deslocamento vazio (km rodado sem carga antes desta entrega) vive numa
    # tabela própria (deslocamento_vazio.py) — nunca como coluna aqui, pra não
    # ter risco de um cálculo de faturamento (que usa valor_frete/entregas)
    # somar km_vazio sem querer. Ver DeslocamentoVazio.