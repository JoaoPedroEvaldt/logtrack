from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.manutencao import Manutencao
from app.models.veiculo import Veiculo
from app.models.usuario import Usuario
from app.schemas.manutencao import ManutencaoCreate, ManutencaoUpdate, ManutencaoResponse
from app.routers.auth import exigir_admin, exigir_staff
from typing import List

router = APIRouter(prefix="/manutencoes", tags=["Manutenções"])

def _validar_veiculo_fora_de_viagem(veiculo_id, status, data_manutencao, db: Session):
    """Caminhão (ou carreta engatada) na estrada não pode estar na oficina ao
    mesmo tempo. Agendar para depois pode: é marcar a próxima revisão."""
    from app.routers.dashboard import hoje_brasilia
    from app.routers.entregas import filtro_em_viagem
    from app.models.conjunto import Conjunto
    from app.models.entrega import Entrega
    if status != "em_andamento" and not (status == "agendada" and data_manutencao <= hoje_brasilia()):
        return
    cavalos = [veiculo_id] + [c.cavalo_id for c in db.query(Conjunto).filter(
        Conjunto.status == "ativo",
        (Conjunto.semirreboque1_id == veiculo_id) | (Conjunto.semirreboque2_id == veiculo_id),
    ).all() if c.cavalo_id]
    viagem = db.query(Entrega).filter(Entrega.veiculo_id.in_(cavalos), *filtro_em_viagem()).first()
    if viagem:
        raise HTTPException(
            status_code=400,
            detail=f"Veículo está em viagem na entrega #{viagem.id} ({viagem.cliente}). Encerre a viagem antes de "
                   "abrir a manutenção, ou registre o problema na estrada como ocorrência.",
        )

@router.post("/", response_model=ManutencaoResponse, include_in_schema=False)
@router.post("", response_model=ManutencaoResponse)
def criar_manutencao(dados: ManutencaoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == dados.veiculo_id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    _validar_veiculo_fora_de_viagem(dados.veiculo_id, dados.status, dados.data_manutencao, db)
    manutencao = Manutencao(**dados.model_dump())
    db.add(manutencao)
    db.commit()
    db.refresh(manutencao)
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == manutencao.id).first()

@router.get("/", response_model=List[ManutencaoResponse], include_in_schema=False)
@router.get("", response_model=List[ManutencaoResponse])
def listar_manutencoes(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).order_by(Manutencao.data_manutencao.desc()).all()

@router.get("/veiculo/{veiculo_id}", response_model=List[ManutencaoResponse])
def listar_por_veiculo(veiculo_id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.veiculo_id == veiculo_id).order_by(Manutencao.data_manutencao.desc()).all()

@router.get("/{id}", response_model=ManutencaoResponse)
def buscar_manutencao(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    manutencao = db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    return manutencao

@router.put("/{id}", response_model=ManutencaoResponse)
def atualizar_manutencao(id: int, dados: ManutencaoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    manutencao = db.query(Manutencao).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    # exclude_unset (não exclude_none): o formulário manda data_fim/mecanico/
    # quilometragem/proxima_revisao explicitamente como null ao limpar o campo —
    # exclude_none descartaria esse null e deixaria o valor antigo preso, sem
    # erro nenhum pro usuário.
    atualizacoes = dados.model_dump(exclude_unset=True)
    if atualizacoes.keys() & {"veiculo_id", "status", "data_manutencao"}:
        _validar_veiculo_fora_de_viagem(
            atualizacoes.get("veiculo_id") or manutencao.veiculo_id,
            atualizacoes.get("status") or manutencao.status,
            atualizacoes.get("data_manutencao") or manutencao.data_manutencao, db)
    for campo, valor in atualizacoes.items():
        setattr(manutencao, campo, valor)
    db.commit()
    db.refresh(manutencao)
    return db.query(Manutencao).options(joinedload(Manutencao.veiculo)).filter(Manutencao.id == id).first()

@router.delete("/{id}")
def deletar_manutencao(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    manutencao = db.query(Manutencao).filter(Manutencao.id == id).first()
    if not manutencao:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    db.delete(manutencao)
    db.commit()
    return {"message": "Manutenção removida com sucesso"}