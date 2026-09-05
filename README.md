# LogTrack

Sistema de gestão operacional para transportadoras de pequeno e médio porte: entregas, motoristas, veículos, manutenções, abastecimento, ocorrências e faturamento centralizados em um único lugar, com controle de acesso por perfil.

> Projeto acadêmico desenvolvido a partir de uma necessidade real de uma transportadora, hoje em uso operacional.

## O problema

Transportadoras pequenas costumam controlar entregas, motoristas e veículos por planilhas soltas, papel e WhatsApp. Sem um sistema central, informação se perde, prazos escapam do controle e decisões são tomadas sem dados confiáveis.

## Funcionalidades

- **Entregas** — acompanhamento por status (aguardando, em rota, entregue, atrasado, ocorrência, cancelado), com filtros e resumo por indicador.
- **Motoristas** — cadastro com validação de CPF/CNH, alerta automático de CNH prestes a vencer, login opcional.
- **Veículos e Conjuntos** — frota por tipo (cavalo-mecânico, semirreboque), montagem de conjuntos vinculados a um motorista.
- **Manutenções** — histórico por veículo com custo, quilometragem e exportação de relatório em PDF.
- **Abastecimento** — registro de abastecimentos com preço do diesel por estado.
- **Ocorrências** — registro de atrasos, acidentes e problemas vinculados à entrega e ao veículo.
- **Relatórios e Dashboard** — indicadores de desempenho por período, faturamento do mês, ranking de motoristas, exportação em PDF.
- **Usuários e Perfis** — administrador, operador e motorista, cada um com acesso restrito ao que precisa (ex.: motorista só vê Dashboard e as próprias entregas).

## Arquitetura

```
frontend/   HTML/CSS/JS puro (sem build tool), consumindo a API via fetch
app/
  routers/     endpoints FastAPI (um arquivo por domínio)
  models/      modelos SQLAlchemy
  schemas/     schemas Pydantic (validação de entrada/saída)
  repositories/ acesso a dados
  services/    regras de negócio
  auth.py      autenticação JWT + bcrypt
```

**Stack:** FastAPI · SQLAlchemy · PostgreSQL · JWT + bcrypt · Docker

O controle de acesso por perfil é reforçado tanto no frontend (itens de menu escondidos por perfil) quanto na API (cada endpoint sensível valida o perfil do usuário autenticado antes de responder).

## Como rodar

### Opção 1 — Docker

```bash
cp .env.example .env
# edite o .env: defina POSTGRES_PASSWORD, DOCKER_DATABASE_URL e SECRET_KEY
docker-compose up --build
```

A API sobe em `http://localhost:8000`.

### Opção 2 — Local (venv + Postgres nativo)

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

cp .env.example .env
# edite o .env: defina DATABASE_URL e SECRET_KEY

# crie o banco "logtrack" no Postgres e rode o schema:
psql -U postgres -d logtrack -f logtrack_banco.sql

uvicorn app.main:app --reload
```

### Frontend

O frontend é HTML/CSS/JS estático (sem build). Basta abrir `frontend/index.html` no navegador, ou servir a pasta com qualquer servidor estático — ele consome a API em `http://127.0.0.1:8000` (configurado em [frontend/js/api.js](frontend/js/api.js)).

## Documentação da API

Com o backend rodando, a documentação interativa (Swagger) fica disponível em `http://localhost:8000/docs`.
