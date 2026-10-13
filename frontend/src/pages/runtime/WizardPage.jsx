import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
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

  // Post-completion navigation is deferred ~2s; clear the pending timer on
  // unmount so a user who navigates away first isn't yanked to another route.
  const navTimerRef = useRef(null);
  useEffect(() => () => { if (navTimerRef.current) clearTimeout(navTimerRef.current); }, []);

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

    let recordId = existingRecordId;
    if (existingRecordId) {
      // Update the existing record (created by "Apply Now")
      await runtimeService.updateRecord(existingRecordId, merged);
    } else {
      // Create a new record
      const result = await runtimeService.createRecord({ object_id: wizard.object_id, data: merged });
      recordId = result?.data?.id ?? result?.id ?? null;
    }
    queryClient.invalidateQueries({ queryKey: ['runtime-records', wizard.object_id] });
    // WizardRenderer internally shows the success screen after this resolves

    // For insurance applications, navigate to Document Collection as the next step
    // in the business process flow. For other insurance objects, go to the processing page.
    try {
      // Use MetadataStore first (instant), fallback to API
      let objName;
      const cachedObj = useMetadataStore.getState().getObject(wizard.object_id);
      if (cachedObj) {
        objName = cachedObj.name;
      } else {
        const obj = await runtimeService.getObject(wizard.object_id);
        objName = obj?.data?.name ?? obj?.name;
      }

      if (objName === 'application') {
        // Navigate to Send Declarations (Step 5) with the record_id so the
        // modal can auto-select the application and open immediately.
        navTimerRef.current = setTimeout(() => navigate(`/insurance/declarations${recordId ? `?record_id=${recordId}` : ''}`), 2000);
      } else {
        const INSURANCE_ROUTES = {
          policy: '/insurance/policies',
          claim:  '/insurance/claims',
        };
        const route = INSURANCE_ROUTES[objName];
        if (route) {
          navTimerRef.current = setTimeout(() => navigate(route), 2000);
        }
      }
    } catch (_) { /* non-critical */ }
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
