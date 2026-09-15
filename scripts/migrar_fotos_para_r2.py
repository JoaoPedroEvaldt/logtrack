"""Envia as fotos que hoje só existem em uploads/ (disco local) pro bucket R2.
Rodar uma vez, depois de configurar R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/
R2_BUCKET_NAME no .env — sem isso as fotos de veículos/conjuntos continuam
funcionando só localmente (não aparecem no site publicado no Render).

Uso: python scripts/migrar_fotos_para_r2.py
"""
import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.upload_foto import _cliente_r2, _r2_configurado
from app.config import settings

PASTA_UPLOADS = Path(__file__).resolve().parent.parent / "uploads"

def main():
    if not _r2_configurado():
        print("R2 não configurado — defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME no .env antes de rodar este script.")
        return

    arquivos = [p for p in PASTA_UPLOADS.rglob("*") if p.is_file()]
    if not arquivos:
        print("Nenhum arquivo encontrado em uploads/.")
        return

    cliente = _cliente_r2()
    print(f"Enviando {len(arquivos)} arquivo(s) para o bucket '{settings.R2_BUCKET_NAME}'...")
    for caminho in arquivos:
        chave = caminho.relative_to(PASTA_UPLOADS).as_posix()
        content_type = mimetypes.guess_type(caminho.name)[0] or "application/octet-stream"
        cliente.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=chave,
            Body=caminho.read_bytes(),
            ContentType=content_type,
        )
        print(f"  ok: {chave}")
    print("Concluído.")

if __name__ == "__main__":
    main()
