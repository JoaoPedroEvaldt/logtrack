from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import Column, Date, Integer, String, DateTime, Numeric, ForeignKey, Text, Index, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

# Comissão do motorista: 13% do frete, sem descontar abastecimento. Na carga
# feita pela cooperativa incide sobre o que sobra da taxa dela.
COMISSAO_MOTORISTA = 0.13

def _centavos(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

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
    # Planejamento da viagem, calculado no navegador ao cadastrar a entrega
    # (rota do OSRM + estimativa de caminhão com as paradas obrigatórias — ver
    # estimarViagemCaminhao em entregas.js). rota_via guarda os pontos de
    # passagem escolhidos pelo usuário ([{nome, lat, lon}, ...]) pra rota ser
    # redesenhada igual depois; vazio = rota mais rápida direta.
    saida_prevista   = Column(DateTime)
    rota_via         = Column(JSON)
    distancia_km     = Column(Numeric(10, 1))
    tempo_estimado_h = Column(Numeric(7, 1))
    # "Carga com tempo": carregou (em rota, caminhão ocupado) mas só pega a
    # estrada depois, ex. após a folga do motorista. A posição estimada no
    # mapa conta a partir daqui; acerto, vazio e relatórios seguem iniciado_em.
    parte_em         = Column(DateTime)
    # Acerto do motorista que pagou a comissão desta viagem (ver acerto.py).
    acerto_id       = Column(Integer, ForeignKey("acertos.id", ondelete="SET NULL"))
    # Carga feita pela cooperativa: ela emite CT-e e manifesto, recolhe os
    # impostos, fica com cooperativa_pct do frete e paga o resto depois do
    # prazo, contado da emissão do CT-e. Percentual nulo = frete direto. Fica
    # gravado por viagem para uma mudança de taxa não alterar as antigas.
    cooperativa_pct        = Column(Numeric(5, 2))
    cte_emitido_em         = Column(Date)
    prazo_recebimento_dias = Column(Integer)
    recebido_em            = Column(Date)
    criado_em       = Column(DateTime, nullable=False, server_default=func.now())
    atualizado_em   = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    @property
    def taxa_cooperativa(self) -> Decimal:
        return _centavos(_centavos(self.valor_frete) * Decimal(str(self.cooperativa_pct or 0)) / 100)

    @property
    def frete_liquido(self) -> Decimal:
        """O que a transportadora recebe: o frete menos a taxa da cooperativa."""
        return _centavos(self.valor_frete) - self.taxa_cooperativa

    @property
    def comissao(self) -> Decimal:
        """Comissão do motorista, arredondada ao centavo por viagem."""
        return _centavos(self.frete_liquido * Decimal(str(COMISSAO_MOTORISTA)))

    @property
    def previsao_recebimento(self) -> date | None:
        """Quando a cooperativa paga. Sem a data do CT-e vale a da saída."""
        if self.cooperativa_pct is None:
            return None
        base = self.cte_emitido_em
        if base is None and self.iniciado_em:
            base = (self.iniciado_em - timedelta(hours=3)).date()  # UTC -> Brasília
        return base + timedelta(days=self.prazo_recebimento_dias or 0) if base else None

    ocorrencias     = relationship("Ocorrencia", backref="entrega")

    # Deslocamento vazio (km rodado sem carga antes desta entrega) vive numa
    # tabela própria (deslocamento_vazio.py) — nunca como coluna aqui, pra não
    # ter risco de um cálculo de faturamento (que usa valor_frete/entregas)
    # somar km_vazio sem querer. Ver DeslocamentoVazio.