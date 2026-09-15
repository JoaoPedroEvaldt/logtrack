-- Adiciona o campo de finalizar ocorrência (status aberta/finalizada + data).
-- Rodar uma vez em cada banco (local e o do Render em produção).
-- Idempotente: pode rodar de novo sem erro se as colunas já existirem.

ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'aberta';
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ocorrencias_status_check'
    ) THEN
        ALTER TABLE ocorrencias ADD CONSTRAINT ocorrencias_status_check CHECK (status IN ('aberta', 'finalizada'));
    END IF;
END $$;
