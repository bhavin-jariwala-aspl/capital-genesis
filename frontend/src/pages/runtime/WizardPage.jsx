import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import { useMetadataStore } from '../../store/metadataStore';
import WizardRenderer from '../../components/runtime/WizardRenderer';
import Button from '../../components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export default function WizardPage() {
  const { wizardId } = useParams();
  const [searchParams] = useSearchParams();
  const existingRecordId = searchParams.get('record_id');
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  // Load wizard — MetadataStore first, fallback to API
  const cachedWizard = useMetadataStore((s) => wizardId ? s.getWizard(Number(wizardId)) : null);
  const { data: wizardData } = useQuery({
    queryKey: ['wizard', Number(wizardId)],
    queryFn:  () => runtimeService.getWizard(Number(wizardId)),
    enabled:  !!wizardId && !cachedWizard,
  });
  const wizard = cachedWizard ?? wizardData?.data;

  // If editing an existing record, load its current data as defaults
  const { data: existingData } = useQuery({
    queryKey: ['runtime-record', existingRecordId],
    queryFn:  () => runtimeService.getRecord(existingRecordId),
    enabled:  !!existingRecordId,
  });
  const existingValues = existingData?.data?.data ?? null;

  const handleComplete = async (allStepData) => {
    if (!wizard?.object_id) return;
    // Merge all step form data into a single flat object
    const merged = Object.values(allStepData).reduce((acc, d) => ({ ...acc, ...d }), {});

    if (existingRecordId) {
      // Update the existing record passed via ?record_id=
      await runtimeService.updateRecord(existingRecordId, merged);
    } else {
      // Create a new record
      await runtimeService.createRecord({ object_id: wizard.object_id, data: merged });
    }
    queryClient.invalidateQueries({ queryKey: ['runtime-records', wizard.object_id] });
    // WizardRenderer internally shows the success screen after this resolves
  };

  return (
    <div className="flex flex-col h-full">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-night-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-gray-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <WizardRenderer
          wizardId={Number(wizardId)}
          onComplete={handleComplete}
          onCancel={() => navigate(-1)}
          defaultValues={existingValues ?? undefined}
        />
      </div>
    </div>
  );
}
