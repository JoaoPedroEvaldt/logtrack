from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8

    class Config:
        env_file = ".env"
        extra = "ignore"  # .env também guarda POSTGRES_PASSWORD/DOCKER_DATABASE_URL, usadas só pelo docker-compose.yml

settings = Settings()