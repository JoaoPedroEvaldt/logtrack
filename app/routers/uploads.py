from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.routers.auth import get_usuario_via_query_token
from app.services import upload_foto

router = APIRouter(prefix="/uploads", tags=["Uploads"])

@router.get("/{caminho:path}")
def servir_foto(caminho: str, usuario=Depends(get_usuario_via_query_token)):
    pasta_uploads = upload_foto.PASTA_UPLOADS.resolve()
    destino = (upload_foto.PASTA_UPLOADS / caminho).resolve()
    if not destino.is_relative_to(pasta_uploads) or not destino.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return FileResponse(destino)
