from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Diaria(Base):
    """Estadia paga pelo cliente quando o caminhão fica parado esperando
    carregar/descarregar. Dividida em três partes iguais: motorista,
    caminhão e empresa (regra "33/33/33" da transportadora)."""
    __tablename__ = "diarias"
    __table_args__ = (Index("idx_diarias_entrega", "entrega_id"),)

    id          = Column(Integer, primary_key=True)
    entrega_id  = Column(Integer, ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False)
    data        = Column(Date, nullable=False)
    dias        = Column(Integer)
    valor       = Column(Numeric(10, 2), nullable=False)
    descricao   = Column(String(200))
    # Preenchido quando o acerto que pagou a parte do motorista é fechado.
    acerto_id   = Column(Integer, ForeignKey("acertos.id", ondelete="SET NULL"))
    criado_em   = Column(DateTime, nullable=False, server_default=func.now())

    entrega     = relationship("Entrega")


class Adiantamento(Base):
    """Vale pago ao motorista antes do acerto (na prática, dia 5 e dia 15) —
    descontado do saldo no fechamento."""
    __tablename__ = "adiantamentos"
    __table_args__ = (Index("idx_adiantamentos_motorista", "motorista_id"),)

    id           = Column(Integer, primary_key=True)
    motorista_id = Column(Integer, ForeignKey("motoristas.id", ondelete="CASCADE"), nullable=False)
    data         = Column(Date, nullable=False)
    valor        = Column(Numeric(10, 2), nullable=False)
    descricao    = Column(String(200))
    acerto_id    = Column(Integer, ForeignKey("acertos.id", ondelete="SET NULL"))
    criado_em    = Column(DateTime, nullable=False, server_default=func.now())


class Acerto(Base):
    """Fechamento do motorista (a cada 30 dias, na entrega do envelope). As
    viagens, diárias e adiantamentos pagos apontam pra cá (acerto_id), então
    nada entra em dois acertos e o que ficou de fora (viagem concluída depois
    do fechamento) cai no próximo. Os totais ficam congelados aqui: editar uma
    entrega depois não muda um acerto já pago."""
    __tablename__ = "acertos"
    __table_args__ = (Index("idx_acertos_motorista", "motorista_id"),)

    id                  = Column(Integer, primary_key=True)
    motorista_id        = Column(Integer, ForeignKey("motoristas.id", ondelete="CASCADE"), nullable=False)
    periodo_inicio      = Column(Date, nullable=False)
    periodo_fim         = Column(Date, nullable=False)
    qtd_viagens         = Column(Integer, nullable=False)
    total_frete         = Column(Numeric(12, 2), nullable=False)
    comissao            = Column(Numeric(12, 2), nullable=False)
    total_diarias       = Column(Numeric(12, 2), nullable=False)
    diarias_motorista   = Column(Numeric(12, 2), nullable=False)
    total_adiantamentos = Column(Numeric(12, 2), nullable=False)
    saldo               = Column(Numeric(12, 2), nullable=False)
    observacao          = Column(Text)
    fechado_por_id      = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    criado_em           = Column(DateTime, nullable=False, server_default=func.now())

    motorista           = relationship("Motorista")
    fechado_por         = relationship("Usuario")
