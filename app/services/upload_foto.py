import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

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

async def salvar_foto(subpasta: str, entidade_id: int, foto: UploadFile) -> str:
    """Valida e grava a imagem enviada em uploads/<subpasta>/, retornando o caminho público (/uploads/...)."""
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

    pasta = PASTA_UPLOADS / subpasta
    pasta.mkdir(parents=True, exist_ok=True)
    nome_arquivo = f"{entidade_id}_{uuid.uuid4().hex}{extensao}"
    (pasta / nome_arquivo).write_bytes(conteudo)
    return f"/uploads/{subpasta}/{nome_arquivo}"

def apagar_foto(foto_path: Optional[str]):
    if not foto_path:
        return
    caminho = PASTA_UPLOADS / foto_path.removeprefix("/uploads/")
    if caminho.exists():
        caminho.unlink()
