"""Popula um banco LogTrack vazio (schema aplicado via logtrack_banco.sql) com
dados ficticios, para demonstracao/apresentacao academica.

NUNCA rode isto contra o banco de producao real da transportadora -- e so
para uma base de demonstracao vazia (local ou a do ambiente de deploy). O
script pede confirmacao explicita, mostrando o DATABASE_URL atual, antes de
escrever qualquer coisa.

O usuario administrador de demonstracao e criado direto no banco (mesma
logica do INSERT em logtrack_banco.sql -- nao ha rota publica de cadastro,
o primeiro admin sempre precisa ser inserido diretamente). O resto dos dados
(motoristas, veiculos, conjuntos, entregas, abastecimentos, ocorrencia) e
criado pelos endpoints reais da API, exercitando a mesma validacao que o
frontend usa.

Uso:
    docker-compose up -d        # ou uvicorn app.main:app --reload
    pip install -r requirements-dev.txt   # ja traz o httpx usado aqui
    python scripts/seed_demo.py [--base-url http://localhost:8000]
"""
import argparse
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.config import settings
from app.database import SessionLocal
from app.models.usuario import Usuario
from app import auth

DEMO_ADMIN_EMAIL = "demo@logtrack.com"
DEMO_ADMIN_SENHA = "DemoLogTrack@2026"


def gerar_cpf() -> str:
    """Gera um CPF com digitos verificadores validos (mesmo algoritmo usado
    para validar em app/schemas/motorista.py, aqui rodado "para frente")."""
    digitos = [random.randint(0, 9) for _ in range(9)]
    for pos in (9, 10):
        soma = sum(digitos[i] * (pos + 1 - i) for i in range(pos))
        digitos.append((soma * 10 % 11) % 10)
    return "".join(str(d) for d in digitos)


def gerar_cnh() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(11))


def garantir_admin_demo() -> None:
    db = SessionLocal()
    try:
        if db.query(Usuario).filter(Usuario.email == DEMO_ADMIN_EMAIL).first():
            print(f"Usuario demo '{DEMO_ADMIN_EMAIL}' ja existe, pulando criacao.")
            return
        db.add(Usuario(
            nome="Admin Demo",
            email=DEMO_ADMIN_EMAIL,
            senha_hash=auth.gerar_hash_senha(DEMO_ADMIN_SENHA),
            perfil="administrador",
        ))
        db.commit()
        print(f"Usuario demo criado: {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_SENHA}")
    finally:
        db.close()


def login(client: httpx.Client) -> str:
    resp = client.post("/auth/login", data={"username": DEMO_ADMIN_EMAIL, "password": DEMO_ADMIN_SENHA})
    resp.raise_for_status()
    return resp.json()["access_token"]


def criar_motoristas(client: httpx.Client) -> list:
    nomes = ["Carlos Souza", "Marta Lima", "Roberto Alves"]
    motoristas = []
    for i, nome in enumerate(nomes):
        payload = {
            "nome": nome,
            "cpf": gerar_cpf(),
            "cnh_numero": gerar_cnh(),
            "cnh_categoria": "AE",
            "cnh_validade": str(date.today() + timedelta(days=365)),
            "telefone": f"(51) 9{9000 + i:04d}-{1000 + i:04d}",
        }
        resp = client.post("/motoristas", json=payload)
        resp.raise_for_status()
        motoristas.append(resp.json())
    print(f"{len(motoristas)} motoristas criados.")
    return motoristas


def criar_veiculos(client: httpx.Client) -> list:
    specs = [
        ("cavalo", "DEM1A23", "FH 540", "Volvo", 30000),
        ("cavalo", "DEM2B34", "Actros", "Mercedes-Benz", 30000),
        ("semirreboque", "DEM3C45", "Graneleiro", "Randon", 25000),
        ("semirreboque", "DEM4D56", "Sider", "Facchini", 25000),
    ]
    veiculos = []
    for tipo, placa, modelo, marca, capacidade in specs:
        payload = {
            "placa": placa,
            "modelo": modelo,
            "marca": marca,
            "ano": 2022,
            "tipo": tipo,
            "capacidade_kg": capacidade,
        }
        resp = client.post("/veiculos", json=payload)
        resp.raise_for_status()
        veiculos.append(resp.json())
    print(f"{len(veiculos)} veiculos criados.")
    return veiculos


def criar_conjuntos(client: httpx.Client, motoristas: list, cavalos: list, semis: list) -> list:
    conjuntos = []
    for i in range(2):
        payload = {
            "nome": f"Conjunto Demo {i + 1}",
            "motorista_id": motoristas[i]["id"],
            "cavalo_id": cavalos[i]["id"],
            "semirreboque1_id": semis[i]["id"],
        }
        resp = client.post("/conjuntos", json=payload)
        resp.raise_for_status()
        conjuntos.append(resp.json())
    print(f"{len(conjuntos)} conjuntos criados.")
    return conjuntos


def criar_entregas(client: httpx.Client, motoristas: list, cavalos: list) -> None:
    # (cliente, origem, destino, motorista, veiculo, status_alvo) -- indices
    # escolhidos a dedo pra nunca colocar o mesmo motorista/veiculo em duas
    # entregas "em_rota" ao mesmo tempo (a API bloqueia isso).
    m0, m1, m2 = (m["id"] for m in motoristas)
    v0, v1 = (v["id"] for v in cavalos)
    entregas_spec = [
        ("Mercado Boa Compra", "Porto Alegre, RS", "Caxias do Sul, RS", m0, v0, "aguardando"),
        ("Distribuidora Sul", "Curitiba, PR", "Florianopolis, SC", m1, v1, "em_rota"),
        ("Atacado Rio Grande", "Pelotas, RS", "Rio Grande, RS", m2, v0, "entregue"),
        ("Comercial Norte", "Sao Paulo, SP", "Campinas, SP", m0, v0, "atrasado"),
        ("Industria Vale Verde", "Joinville, SC", "Blumenau, SC", m1, v1, "ocorrencia"),
    ]

    # Passo 1: cria todas ainda "aguardando" (nenhuma em_rota ainda, entao
    # nenhuma combinacao motorista/veiculo pode dar conflito na criacao).
    entregas = []
    for i, (cliente, origem, destino, motorista_id, veiculo_id, status_alvo) in enumerate(entregas_spec):
        payload = {
            "cliente": cliente,
            "origem": origem,
            "destino": destino,
            "descricao_carga": "Carga geral (dado de demonstracao)",
            "peso_kg": 8000 + i * 500,
            "valor_frete": 2500 + i * 300,
            "motorista_id": motorista_id,
            "veiculo_id": veiculo_id,
            "previsao": str(datetime.now() + timedelta(days=2)),
        }
        resp = client.post("/entregas", json=payload)
        resp.raise_for_status()
        entregas.append((resp.json()["id"], status_alvo))

    # Passo 2: aplica os status finais.
    for entrega_id, status_alvo in entregas:
        if status_alvo == "aguardando":
            continue
        if status_alvo == "entregue":
            client.put(f"/entregas/{entrega_id}/status", params={"status": "em_rota"}).raise_for_status()
            client.put(f"/entregas/{entrega_id}/status", params={"status": "entregue"}).raise_for_status()
        elif status_alvo == "ocorrencia":
            client.post("/ocorrencias", json={
                "entrega_id": entrega_id,
                "tipo": "problema_mecanico",
                "descricao": "Pane eletrica na estrada (dado de demonstracao)",
            }).raise_for_status()
        else:
            client.put(f"/entregas/{entrega_id}/status", params={"status": status_alvo}).raise_for_status()
    print(f"{len(entregas)} entregas criadas (status variados).")


def criar_abastecimentos(client: httpx.Client, cavalos: list) -> None:
    for v in cavalos:
        client.post("/abastecimentos", json={
            "veiculo_id": v["id"],
            "data_abastecimento": str(date.today()),
            "litros": 250,
            "valor_total": 1500,
            "quilometragem": 120000,
            "posto": "Posto Demo",
            "estado": "RS",
        }).raise_for_status()
    print(f"{len(cavalos)} abastecimentos criados.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="URL onde a API esta rodando")
    args = parser.parse_args()

    print(f"DATABASE_URL atual: {settings.DATABASE_URL}")
    print(f"API alvo: {args.base_url}")
    confirmacao = input("Confirma que este e' um banco de DEMONSTRACAO (NAO o banco real da transportadora)? [digite 'sim']: ")
    if confirmacao.strip().lower() != "sim":
        print("Cancelado.")
        return

    garantir_admin_demo()

    with httpx.Client(base_url=args.base_url, timeout=10) as client:
        token = login(client)
        client.headers["Authorization"] = f"Bearer {token}"

        motoristas = criar_motoristas(client)
        veiculos = criar_veiculos(client)
        cavalos = [v for v in veiculos if v["tipo"] == "cavalo"]
        semis = [v for v in veiculos if v["tipo"] == "semirreboque"]

        criar_conjuntos(client, motoristas, cavalos, semis)
        criar_entregas(client, motoristas, cavalos)
        criar_abastecimentos(client, cavalos)

    print("\nSeed de demonstracao concluido.")
    print(f"Login: {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_SENHA}")


if __name__ == "__main__":
    main()
