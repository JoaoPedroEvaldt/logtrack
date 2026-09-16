from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8

    # Storage das fotos (veículos/conjuntos) no Cloudflare R2 — ver app/services/upload_foto.py.
    # Sem valor default proposital: se faltar alguma, o erro deve aparecer só ao tentar
    # enviar/ver uma foto (upload_foto._cliente_r2), não quebrar o app inteiro no boot.
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""

    # extra="ignore": .env também guarda POSTGRES_PASSWORD/DOCKER_DATABASE_URL, usadas só pelo docker-compose.yml
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()