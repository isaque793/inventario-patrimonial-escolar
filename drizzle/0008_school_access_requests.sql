CREATE TABLE `schoolAccessRequests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `schoolId` int NOT NULL,
  `userId` int NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `reviewedAt` timestamp NULL,
  `reviewedByUserId` int NULL,
  CONSTRAINT `schoolAccessRequests_id` PRIMARY KEY(`id`),
  CONSTRAINT `access_request_school_user_unique` UNIQUE(`schoolId`,`userId`)
);
--> statement-breakpoint
CREATE INDEX `access_request_school_status_idx` ON `schoolAccessRequests` (`schoolId`,`status`);
--> statement-breakpoint
CREATE INDEX `access_request_user_status_idx` ON `schoolAccessRequests` (`userId`,`status`);
