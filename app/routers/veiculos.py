from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.veiculo import Veiculo
from app.models.usuario import Usuario
from app.schemas.veiculo import VeiculoCreate, VeiculoUpdate, VeiculoResponse
from app.routers.auth import exigir_admin, exigir_staff
from app.services.upload_foto import apagar_foto, salvar_foto
from typing import List

router = APIRouter(prefix="/veiculos", tags=["Veículos"])

@router.post("/", response_model=VeiculoResponse, include_in_schema=False)
@router.post("", response_model=VeiculoResponse)
def criar_veiculo(dados: VeiculoCreate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    if db.query(Veiculo).filter(Veiculo.placa == dados.placa).first():
        raise HTTPException(status_code=400, detail="Placa já cadastrada")
    veiculo = Veiculo(**dados.model_dump())
    db.add(veiculo)
    db.commit()
    db.refresh(veiculo)
    return veiculo

@router.get("/", response_model=List[VeiculoResponse], include_in_schema=False)
@router.get("", response_model=List[VeiculoResponse])
def listar_veiculos(db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    return db.query(Veiculo).filter(Veiculo.status != "inativo").all()

@router.get("/{id}", response_model=VeiculoResponse)
def buscar_veiculo(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_staff)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return veiculo

@router.put("/{id}", response_model=VeiculoResponse)
def atualizar_veiculo(id: int, dados: VeiculoUpdate, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    if dados.placa and db.query(Veiculo).filter(Veiculo.placa == dados.placa, Veiculo.id != id).first():
        raise HTTPException(status_code=400, detail="Placa já cadastrada para outro veículo")
    # exclude_unset (não exclude_none): o formulário manda subtipo/eixos/tipo_eixo
    # explicitamente como null ao trocar o tipo do veículo — exclude_none descartaria
    # esse null e deixaria o valor antigo preso, sem erro nenhum pro usuário.
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(veiculo, campo, valor)
    db.commit()
    db.refresh(veiculo)
    return veiculo

@router.delete("/{id}")
def deletar_veiculo(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    veiculo.status = "inativo"
    db.commit()
    return {"message": "Veículo desativado com sucesso"}

@router.post("/{id}/foto", response_model=VeiculoResponse)
async def enviar_foto_veiculo(id: int, foto: UploadFile = File(...), db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")

    novo_caminho = await salvar_foto("veiculos", id, foto)
    caminho_antigo = veiculo.foto_path
    veiculo.foto_path = novo_caminho
    db.commit()
    db.refresh(veiculo)
    # Só apaga o arquivo antigo depois do commit confirmado — se o commit falhar,
    # o rollback mantém foto_path apontando pro arquivo antigo, que ainda existe.
    apagar_foto(caminho_antigo)
    return veiculo

@router.delete("/{id}/foto", response_model=VeiculoResponse)
def remover_foto_veiculo(id: int, db: Session = Depends(get_db), atual: Usuario = Depends(exigir_admin)):
    veiculo = db.query(Veiculo).filter(Veiculo.id == id).first()
    if not veiculo:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")

    caminho_antigo = veiculo.foto_path
    veiculo.foto_path = None
    db.commit()
    db.refresh(veiculo)
    apagar_foto(caminho_antigo)
    return veiculo