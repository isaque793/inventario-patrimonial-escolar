-- Separa pré-inventário e inventário oficial.
-- Todos os ciclos existentes passam a ser pré-inventário (valor padrão da coluna).
ALTER TABLE `inventoryCycles` ADD COLUMN `type` enum('pre_inventory','official') NOT NULL DEFAULT 'pre_inventory';--> statement-breakpoint
-- A nova chave é mais ampla que a antiga, então não pode haver conflito com os dados atuais.
CREATE UNIQUE INDEX `cycle_school_year_type_unique` ON `inventoryCycles` (`schoolId`,`year`,`type`);--> statement-breakpoint
DROP INDEX `cycle_school_year_unique` ON `inventoryCycles`;--> statement-breakpoint
-- Origem e conferência dos bens importados (nulos nos registros antigos).
ALTER TABLE `inventoryItems` ADD COLUMN `sourceCycleId` int NULL;--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD COLUMN `sourceItemId` int NULL;--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD COLUMN `importStatus` enum('pending_confirmation','confirmed') NULL;--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD COLUMN `confirmedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `inventoryItems` ADD COLUMN `confirmedBy` int NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `item_cycle_source_unique` ON `inventoryItems` (`cycleId`,`sourceItemId`);--> statement-breakpoint
CREATE INDEX `item_cycle_import_status_idx` ON `inventoryItems` (`cycleId`,`importStatus`);
