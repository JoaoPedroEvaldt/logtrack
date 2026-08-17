CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('administrador', 'operador', 'motorista')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS motoristas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    cpf VARCHAR(14) NOT NULL,
    cnh_numero VARCHAR(20) NOT NULL,
    cnh_categoria VARCHAR(5) NOT NULL,
    cnh_validade DATE NOT NULL,
    telefone VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'em_rota', 'inativo')),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- CPF e CNH só precisam ser únicos entre motoristas ativos: um motorista
-- desativado ("excluído") libera seu CPF/CNH para um novo cadastro.
CREATE UNIQUE INDEX IF NOT EXISTS motoristas_cpf_ativo_idx ON motoristas (cpf) WHERE status <> 'inativo';
CREATE UNIQUE INDEX IF NOT EXISTS motoristas_cnh_numero_ativo_idx ON motoristas (cnh_numero) WHERE status <> 'inativo';

CREATE TABLE IF NOT EXISTS veiculos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(10) NOT NULL UNIQUE,
    modelo VARCHAR(80) NOT NULL,
    marca VARCHAR(60) NOT NULL,
    ano INTEGER NOT NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('cavalo', 'semirreboque', 'van', 'utilitario', 'moto', 'caminhao', 'carro')),
    subtipo VARCHAR(50),
    eixos INTEGER,
    tipo_eixo VARCHAR(20),
    cor VARCHAR(50),
    capacidade_kg DECIMAL(10,2) NOT NULL CHECK (capacidade_kg > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'em_rota', 'em_manutencao', 'inativo')),
    crlv_validade DATE,
    seguro_validade DATE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manutencoes (
    id SERIAL PRIMARY KEY,
    veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
    data_manutencao DATE NOT NULL,
    data_fim DATE,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('preventiva', 'corretiva', 'revisao', 'pneus', 'eletrica', 'freios', 'outro')),
    descricao TEXT NOT NULL,
    custo DECIMAL(10,2) CHECK (custo >= 0),
    mecanico VARCHAR(100),
    quilometragem INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'concluida' CHECK (status IN ('agendada', 'em_andamento', 'concluida')),
    proxima_revisao DATE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entregas (
    id SERIAL PRIMARY KEY,
    motorista_id INTEGER REFERENCES motoristas(id) ON DELETE SET NULL,
    veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
    cliente VARCHAR(150) NOT NULL,
    origem TEXT NOT NULL,
    destino TEXT NOT NULL,
    descricao_carga TEXT,
    peso_kg DECIMAL(10,2) CHECK (peso_kg > 0),
    valor_frete DECIMAL(10,2) CHECK (valor_frete >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'em_rota', 'entregue', 'atrasado', 'ocorrencia', 'cancelado')),
    previsao TIMESTAMP NOT NULL,
    iniciado_em TIMESTAMP,
    concluido_em TIMESTAMP,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ocorrencias (
    id SERIAL PRIMARY KEY,
    entrega_id INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('atraso', 'acidente', 'cliente_ausente', 'problema_mecanico', 'extravio', 'outro')),
    descricao TEXT NOT NULL,
    foto_path VARCHAR(255),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS log_acesso (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ip VARCHAR(45) NOT NULL,
    tentativa_ok BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conjuntos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    motorista_id INTEGER REFERENCES motoristas(id) ON DELETE SET NULL,
    cavalo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
    semirreboque1_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
    semirreboque2_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Bancos já criados antes destas colunas existirem: adiciona sem perder dados.
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS data_fim DATE;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS mecanico VARCHAR(100);
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS quilometragem INTEGER;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'concluida';
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS proxima_revisao DATE;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS valor_frete DECIMAL(10,2) CHECK (valor_frete >= 0);

INSERT INTO usuarios (nome, email, senha_hash, perfil)
VALUES (
    'Administrador',
    'admin@logtrack.com',
    '$2b$12$b7KVO4FgURsxljgDR0Swjeh7u0.7gVMD50Rdg90Iv2MItvHiKngba',
    'administrador'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO usuarios (nome, email, senha_hash, perfil)
VALUES (
    'Operador Padrão',
    'operador@logtrack.com',
    '$2b$12$b7KVO4FgURsxljgDR0Swjeh7u0.7gVMD50Rdg90Iv2MItvHiKngba',
    'operador'
) ON CONFLICT (email) DO NOTHING;