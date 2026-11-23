-- Adiciona o documento Consolidado à lista de documentos assinados.
ALTER TABLE `inventoryDocuments` MODIFY COLUMN `documentType` enum('opening_minutes','responsibility_term','closing_minutes','consolidated') NOT NULL;
