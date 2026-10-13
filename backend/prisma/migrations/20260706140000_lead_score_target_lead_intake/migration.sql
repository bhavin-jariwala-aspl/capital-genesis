-- AlterTable
ALTER TABLE `lead_scores` ADD COLUMN `lead_intake_id` INTEGER NULL,
    MODIFY `lead_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `lead_scores_lead_intake_id_idx` ON `lead_scores`(`lead_intake_id`);

-- AddForeignKey
ALTER TABLE `lead_scores` ADD CONSTRAINT `lead_scores_lead_intake_id_fkey` FOREIGN KEY (`lead_intake_id`) REFERENCES `crm_lead_intake`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

