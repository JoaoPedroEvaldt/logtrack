from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.entrega import Entrega
from app.models.deslocamento_vazio import DeslocamentoVazio
from app.models.motorista import Motorista
from app.models.usuario import Usuario
from app.schemas.deslocamento_vazio import DeslocamentoVazioResponse, KmVazioUpdate
from app.routers.auth import exigir_staff, get_usuario_atual
from app.routers.entregas import _garantir_acesso_entrega

router = APIRouter(prefix="/deslocamentos-vazios", tags=["Deslocamento Vazio"])

@router.get("", response_model=List[DeslocamentoVazioResponse])
def listar_deslocamentos_vazios(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    query = db.query(DeslocamentoVazio)
    if atual.perfil == "motorista":
        motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
        if not motorista:
            return []
        query = query.join(Entrega, Entrega.id == DeslocamentoVazio.entrega_id).filter(Entrega.motorista_id == motorista.id)
    return query.all()

@router.post("/sincronizar")
def sincronizar_deslocamentos_vazios(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    """O vínculo "viagem anterior -> esta" nasce quando a entrega entra em rota
    (atualizar_status). Viagens lançadas antes de existir a tabela, ou que
    entraram em rota sem passar por ali, ficavam sem vazio e a tela mostrava
    só uma ou outra. Aqui o vínculo é refeito pela cronologia de cada veículo:
    a anterior é a última entrega concluída dele até o início desta. Vínculos
    já existentes não são tocados; o km de cada novo é calculado pela tela."""
    existentes = db.query(DeslocamentoVazio.entrega_id, DeslocamentoVazio.entrega_anterior_id).all()
    ja_tem = {e for e, _ in existentes}
    # Cada viagem é "anterior" de uma só: com viagens lançadas depois do fato,
    # duas podem se sobrepor e o mesmo vazio seria contado duas vezes.
    ja_usadas = {a for _, a in existentes if a}
    viagens = db.query(Entrega).filter(
        Entrega.veiculo_id.isnot(None),
        Entrega.iniciado_em.isnot(None),
        Entrega.status != "cancelado",
    ).all()
    concluidas_por_veiculo = {}
    for e in viagens:
        if e.status == "entregue" and e.concluido_em:
            concluidas_por_veiculo.setdefault(e.veiculo_id, []).append(e)
    criados = 0
    for e in sorted(viagens, key=lambda v: (v.iniciado_em, v.id)):
        if e.id in ja_tem:
            continue
        anteriores = [a for a in concluidas_por_veiculo.get(e.veiculo_id, [])
                      if a.id != e.id and a.concluido_em <= e.iniciado_em]
        if not anteriores:
            continue  # primeira viagem do veículo: não há de onde ter vindo vazio
        anterior = max(anteriores, key=lambda a: a.concluido_em)
        if anterior.id in ja_usadas:
            continue  # viagem sobreposta: o vazio desse trecho já foi contado
        db.add(DeslocamentoVazio(entrega_id=e.id, entrega_anterior_id=anterior.id))
        ja_usadas.add(anterior.id)
        criados += 1
    db.commit()
    return {"criados": criados}

@router.put("/{entrega_id}")
def atualizar_km_vazio(entrega_id: int, dados: KmVazioUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == entrega_id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    dv = db.query(DeslocamentoVazio).filter(DeslocamentoVazio.entrega_id == entrega_id).first()
    if not dv or not dv.entrega_anterior_id:
        raise HTTPException(status_code=400, detail="Esta entrega não tem deslocamento vazio associado.")
    if dados.km_vazio < 0:
        raise HTTPException(status_code=400, detail="km_vazio não pode ser negativo.")
    dv.km_vazio = dados.km_vazio
    db.commit()
    return {"message": "km_vazio atualizado"}
