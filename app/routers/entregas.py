from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.entrega import Entrega
from app.models.manutencao import Manutencao
from app.models.motorista import Motorista
from app.models.veiculo import Veiculo
from app.models.usuario import Usuario
from app.models.deslocamento_vazio import DeslocamentoVazio
from app.schemas.entrega import EntregaCreate, EntregaUpdate, EntregaResponse
from app.routers.auth import exigir_admin, exigir_staff, get_usuario_atual
from typing import List

router = APIRouter(prefix="/entregas", tags=["Entregas"])

def _validar_motorista_e_veiculo_existem(motorista_id, veiculo_id, db: Session):
    # Sem isso, mandar um id que não existe (ou de um cadastro nunca criado)
    # só estoura na hora do commit como erro de FK do Postgres — um 500 feio
    # em vez de um 404 claro. No SQLite dos testes esse erro nem aparece
    # (FK não é enforced por padrão), então só se manifestava em produção.
    if motorista_id and not db.query(Motorista).filter(Motorista.id == motorista_id).first():
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    if veiculo_id and not db.query(Veiculo).filter(Veiculo.id == veiculo_id).first():
        raise HTTPException(status_code=404, detail="Veículo não encontrado")

def _validar_motorista_veiculo_livres(motorista_id, veiculo_id, db: Session, excluir_id: int = None):
    if motorista_id:
        query = db.query(Entrega).filter(Entrega.motorista_id == motorista_id, Entrega.status == "em_rota")
        if excluir_id:
            query = query.filter(Entrega.id != excluir_id)
        conflito = query.first()
        if conflito:
            raise HTTPException(
                status_code=400,
                detail=f'Motorista já está em rota na entrega #{conflito.id} ({conflito.cliente}). Finalize aquela entrega antes de iniciar outra.'
            )
    if veiculo_id:
        query = db.query(Entrega).filter(Entrega.veiculo_id == veiculo_id, Entrega.status == "em_rota")
        if excluir_id:
            query = query.filter(Entrega.id != excluir_id)
        conflito = query.first()
        if conflito:
            raise HTTPException(
                status_code=400,
                detail=f'Veículo já está em rota na entrega #{conflito.id} ({conflito.cliente}). Finalize aquela entrega antes de iniciar outra.'
            )

def _buscar_entrega_anterior(veiculo_id, excluir_id: int, db: Session):
    # Última entrega concluída do mesmo veículo antes desta — é o ponto de partida
    # do deslocamento vazio (destino dela até a origem da entrega que está iniciando).
    if not veiculo_id:
        return None
    return (
        db.query(Entrega)
        .filter(Entrega.veiculo_id == veiculo_id, Entrega.status == "entregue", Entrega.id != excluir_id)
        .order_by(Entrega.concluido_em.desc())
        .first()
    )

def _validar_veiculo_sem_manutencao(veiculo_id, db: Session):
    if not veiculo_id:
        return
    manutencao = db.query(Manutencao).filter(
        Manutencao.veiculo_id == veiculo_id, Manutencao.status != "concluida"
    ).first()
    if manutencao:
        raise HTTPException(
            status_code=400,
            detail=f'Veículo está em manutenção (#{manutencao.id} — {manutencao.tipo}). Finalize a manutenção antes de usá-lo em uma entrega.'
        )

def _travar_viagem_acertada(entrega: Entrega, atual: Usuario, status_novo=None, motorista_novo=..., muda_frete=False):
    """Viagem já paga num acerto fechado: trocar o motorista ou tirá-la de
    "entregue" deixaria o pagamento errado, então exige reabrir o acerto.
    Corrigir o frete recalcula o acerto — como vale e diária, só o admin."""
    if not entrega.acerto_id:
        return
    reabrir = f"Esta viagem já foi paga no acerto #{entrega.acerto_id}. Reabra o acerto antes de"
    if status_novo is not None and status_novo != "entregue":
        raise HTTPException(status_code=400, detail=f"{reabrir} mudar o status.")
    if motorista_novo is not ... and motorista_novo != entrega.motorista_id:
        raise HTTPException(status_code=400, detail=f"{reabrir} trocar o motorista.")
    if muda_frete and atual.perfil != "administrador":
        raise HTTPException(
            status_code=403,
            detail=f"Esta viagem já foi paga no acerto #{entrega.acerto_id}. Só um administrador pode corrigir o frete.",
        )

@router.post("/", response_model=EntregaResponse, include_in_schema=False)
@router.post("", response_model=EntregaResponse)
def criar_entrega(dados: EntregaCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    _validar_motorista_e_veiculo_existem(dados.motorista_id, dados.veiculo_id, db)
    _validar_motorista_veiculo_livres(dados.motorista_id, dados.veiculo_id, db)
    _validar_veiculo_sem_manutencao(dados.veiculo_id, db)
    entrega = Entrega(**dados.model_dump())
    db.add(entrega)
    db.commit()
    db.refresh(entrega)
    return entrega

@router.get("/", response_model=List[EntregaResponse], include_in_schema=False)
@router.get("", response_model=List[EntregaResponse])
def listar_entregas(db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    if atual.perfil == "motorista":
        from app.models.motorista import Motorista
        motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
        if not motorista:
            return []
        return db.query(Entrega).filter(Entrega.motorista_id == motorista.id).all()
    return db.query(Entrega).all()

def _garantir_acesso_entrega(entrega: Entrega, atual: Usuario, db: Session):
    if atual.perfil != "motorista":
        return
    from app.models.motorista import Motorista
    motorista = db.query(Motorista).filter(Motorista.usuario_id == atual.id).first()
    if not motorista or entrega.motorista_id != motorista.id:
        raise HTTPException(status_code=403, detail="Acesso negado")

@router.get("/{id}", response_model=EntregaResponse)
def buscar_entrega(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    return entrega

@router.put("/{id}/status")
def atualizar_status(id: int, status: str, db: Session = Depends(get_db), atual: Usuario = Depends(get_usuario_atual)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _garantir_acesso_entrega(entrega, atual, db)
    status_validos = ["aguardando", "em_rota", "entregue", "atrasado", "ocorrencia", "cancelado"]
    if status not in status_validos:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {status_validos}")
    if status == "cancelado" and atual.perfil == "motorista":
        raise HTTPException(status_code=403, detail="Motorista não pode cancelar uma entrega. Peça a um operador ou administrador.")
    _travar_viagem_acertada(entrega, atual, status_novo=status)
    if status == "em_rota":
        _validar_motorista_veiculo_livres(entrega.motorista_id, entrega.veiculo_id, db, excluir_id=entrega.id)
        _validar_veiculo_sem_manutencao(entrega.veiculo_id, db)
    status_anterior = entrega.status
    entrega.status = status
    entrega_anterior_id = None
    if status == "em_rota":
        entrega.iniciado_em = datetime.utcnow()
        # Deslocamento vazio vive numa tabela própria (ver DeslocamentoVazio) —
        # nunca como coluna em Entrega, pra não ter risco de um cálculo de
        # faturamento (que usa valor_frete/entregas) somar km_vazio por engano.
        # Recalculado do zero a cada novo início de rota: o veículo pode ter
        # feito outras entregas desde a última vez que essa aqui esteve em rota.
        anterior = _buscar_entrega_anterior(entrega.veiculo_id, entrega.id, db)
        entrega_anterior_id = anterior.id if anterior else None
        dv = db.query(DeslocamentoVazio).filter(DeslocamentoVazio.entrega_id == entrega.id).first()
        if not dv:
            dv = DeslocamentoVazio(entrega_id=entrega.id)
            db.add(dv)
        dv.entrega_anterior_id = entrega_anterior_id
        dv.km_vazio = None
    # Marcar "entregue" de novo não muda a data de conclusão (é a que sai no recibo do acerto).
    if status == "entregue" and not (status_anterior == "entregue" and entrega.concluido_em):
        entrega.concluido_em = datetime.utcnow()
    db.commit()
    db.refresh(entrega)
    return {"message": f"Status atualizado para {status}", "entrega_anterior_id": entrega_anterior_id}

@router.put("/{id}", response_model=EntregaResponse)
def atualizar_entrega(id: int, dados: EntregaUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")

    # exclude_unset (não exclude_none): o formulário manda motorista_id/veiculo_id
    # explicitamente como null pra "desvincular" — exclude_none descartaria esse
    # null e deixaria o vínculo antigo preso, sem erro nenhum pro usuário.
    atualizacoes = dados.model_dump(exclude_unset=True)
    motorista_id = atualizacoes.get("motorista_id", entrega.motorista_id)
    veiculo_id = atualizacoes.get("veiculo_id", entrega.veiculo_id)
    status_final = atualizacoes.get("status", entrega.status)
    _travar_viagem_acertada(
        entrega, atual, status_novo=atualizacoes.get("status"),
        motorista_novo=atualizacoes.get("motorista_id", ...),
        muda_frete="valor_frete" in atualizacoes and atualizacoes["valor_frete"] != float(entrega.valor_frete or 0),
    )
    if "motorista_id" in atualizacoes or "veiculo_id" in atualizacoes:
        _validar_motorista_e_veiculo_existem(motorista_id, veiculo_id, db)
    if status_final == "em_rota":
        _validar_motorista_veiculo_livres(motorista_id, veiculo_id, db, excluir_id=entrega.id)
        _validar_veiculo_sem_manutencao(veiculo_id, db)

    for campo, valor in atualizacoes.items():
        setattr(entrega, campo, valor)
    # Frete corrigido numa viagem já paga num acerto: o acerto acompanha.
    if entrega.acerto_id and "valor_frete" in atualizacoes:
        from app.routers.acertos import recalcular_acerto
        recalcular_acerto(entrega.acerto_id, db)
    db.commit()
    db.refresh(entrega)
    return entrega

@router.delete("/{id}")
def deletar_entrega(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    entrega = db.query(Entrega).filter(Entrega.id == id).first()
    if not entrega:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    _travar_viagem_acertada(entrega, atual, status_novo="cancelado")
    entrega.status = "cancelado"
    db.commit()
    return {"message": "Entrega cancelada com sucesso"}