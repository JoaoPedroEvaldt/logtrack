from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.routers.auth import get_usuario_via_query_token
from app.services import upload_foto

router = APIRouter(prefix="/uploads", tags=["Uploads"])

@router.get("/{caminho:path}")
def servir_foto(caminho: str, usuario=Depends(get_usuario_via_query_token)):
    resultado = upload_foto.buscar_foto(caminho)
    if not resultado:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    conteudo, content_type = resultado
    return Response(content=conteudo, media_type=content_type)
