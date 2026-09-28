"""Cria o primeiro usuario administrador num banco LogTrack recem-criado.

Nao ha rota publica de cadastro: o primeiro admin sempre precisa ser inserido
direto no banco. Antes isso vinha de um INSERT com senha fixa no antigo
logtrack_banco.sql; agora a senha e digitada na hora e nunca fica no repo.

Uso (depois de `alembic upgrade head`):
    python scripts/criar_admin.py
"""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import auth
from app.config import settings
from app.database import SessionLocal
from app.models.usuario import Usuario


def main() -> None:
    print(f"Banco: {settings.DATABASE_URL.rsplit('@', 1)[-1]}")
    nome = input("Nome: ").strip()
    email = input("E-mail: ").strip().lower()
    senha = getpass.getpass("Senha: ")
    if not nome or not email or len(senha) < 8:
        sys.exit("Nome e e-mail sao obrigatorios e a senha precisa ter pelo menos 8 caracteres.")
    if senha != getpass.getpass("Confirme a senha: "):
        sys.exit("As senhas nao conferem.")

    db = SessionLocal()
    try:
        if db.query(Usuario).filter(Usuario.email == email).first():
            sys.exit(f"Ja existe um usuario com o e-mail {email}.")
        db.add(Usuario(nome=nome, email=email, senha_hash=auth.gerar_hash_senha(senha), perfil="administrador"))
        db.commit()
    finally:
        db.close()
    print(f"Administrador {email} criado.")


if __name__ == "__main__":
    main()
