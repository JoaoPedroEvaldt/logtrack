from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class DeslocamentoVazio(Base):
    """Km rodado sem carga entre o destino da última entrega concluída de um
    veículo e a origem da entrega seguinte. Tabela própria, separada de
    entregas, para que nenhum cálculo de faturamento (valor_frete) possa
    somar km_vazio por engano — são conceitos diferentes."""
    __tablename__ = "deslocamentos_vazios"

    id                  = Column(Integer, primary_key=True)
    entrega_id          = Column(Integer, ForeignKey("entregas.id", ondelete="CASCADE"), nullable=False, unique=True)
    entrega_anterior_id = Column(Integer, ForeignKey("entregas.id", ondelete="SET NULL"), nullable=True)
    km_vazio            = Column(Numeric(10, 2))
    criado_em           = Column(DateTime, nullable=False, server_default=func.now())
