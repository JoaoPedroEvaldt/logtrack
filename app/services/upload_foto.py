import mimetypes
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile

from app.config import settings

PROJETO_DIR = Path(__file__).resolve().parent.parent.parent
PASTA_UPLOADS = PROJETO_DIR / "uploads"
EXTENSAO_POR_TIPO = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024  # 5MB

def _tipo_real_da_imagem(conteudo: bytes) -> Optional[str]:
    """Confere a assinatura binária do arquivo — o Content-Type do multipart é
    informado pelo cliente e sozinho não garante que o conteúdo é mesmo uma imagem."""
    if conteudo.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if conteudo.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP":
        return "image/webp"
    return None

def _r2_configurado() -> bool:
    """R2 é opcional: sem as 4 credenciais no .env, as fotos caem no disco local
    (uploads/) — funciona bem pra desenvolvimento, mas não sobrevive a um
    redeploy num host sem disco persistente (ver README.md > Deploy > Fotos)."""
    return bool(settings.R2_ACCOUNT_ID and settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY and settings.R2_BUCKET_NAME)

@lru_cache
def _cliente_r2():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )

async def salvar_foto(subpasta: str, entidade_id: int, foto: UploadFile) -> str:
    """Valida e grava a imagem enviada (no bucket R2 se configurado, senão em
    uploads/<subpasta>/ local), retornando o caminho público (/uploads/...)."""
    extensao = EXTENSAO_POR_TIPO.get(foto.content_type)
    if not extensao:
        raise HTTPException(status_code=400, detail="Formato de imagem inválido. Envie JPEG, PNG ou WebP.")

    if foto.size is not None and foto.size > TAMANHO_MAXIMO_FOTO:
        raise HTTPException(status_code=400, detail="A imagem deve ter no máximo 5MB.")

    conteudo = await foto.read()
    if len(conteudo) > TAMANHO_MAXIMO_FOTO:
        raise HTTPException(status_code=400, detail="A imagem deve ter no máximo 5MB.")

    if _tipo_real_da_imagem(conteudo) != foto.content_type:
        raise HTTPException(status_code=400, detail="O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP válida.")

    chave = f"{subpasta}/{entidade_id}_{uuid.uuid4().hex}{extensao}"
    if _r2_configurado():
        _cliente_r2().put_object(Bucket=settings.R2_BUCKET_NAME, Key=chave, Body=conteudo, ContentType=foto.content_type)
    else:
        caminho = PASTA_UPLOADS / chave
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_bytes(conteudo)
    return f"/uploads/{chave}"

def apagar_foto(foto_path: Optional[str]):
    if not foto_path:
        return
    chave = foto_path.removeprefix("/uploads/")
    if _r2_configurado():
        _cliente_r2().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=chave)
    else:
        caminho = PASTA_UPLOADS / chave
        if caminho.exists():
            caminho.unlink()

def buscar_foto(chave: str) -> Optional[Tuple[bytes, str]]:
    """Usado pelo router /uploads pra repassar a foto (com o gate de autenticação)
    sem tornar o bucket R2 público nem expor o disco local. Retorna (conteudo, content_type) ou None."""
    if _r2_configurado():
        try:
            objeto = _cliente_r2().get_object(Bucket=settings.R2_BUCKET_NAME, Key=chave)
        except ClientError as erro:
            if erro.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                return None
            raise
        return objeto["Body"].read(), objeto.get("ContentType") or "application/octet-stream"

    pasta_uploads = PASTA_UPLOADS.resolve()
    destino = (PASTA_UPLOADS / chave).resolve()
    if not destino.is_relative_to(pasta_uploads) or not destino.is_file():
        return None
    content_type = mimetypes.guess_type(destino.name)[0] or "application/octet-stream"
    return destino.read_bytes(), content_type
