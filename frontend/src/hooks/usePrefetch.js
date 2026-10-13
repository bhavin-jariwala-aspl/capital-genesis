import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runtimeService } from '../services/metadata.service';
import { useMetadataStore } from '../store/metadataStore';

/**
 * usePrefetch — prefetches metadata for related routes in the background.
 *
 * Call this from pages that naturally lead to known next steps.
 * For example, from InsuranceQuotePage, prefetch the application wizard.
 *
 * Only fetches if the data is not already in MetadataStore.
 */
function usePrefetchObject(objectName) {
  const queryClient = useQueryClient();
  const cached = useMetadataStore((s) => s.getResolved(objectName));

  useEffect(() => {
    if (cached) return; // Already in store
    // Prefetch in background — low priority, doesn't block UI
    queryClient.prefetchQuery({
      queryKey: ['resolve-object', objectName],
      queryFn: () => runtimeService.resolveObject(objectName),
      staleTime: 300_000,
    });
  }, [objectName, cached, queryClient]);
}

/**
 * usePrefetchInsuranceFlow — prefetches the full insurance workflow
 * metadata chain: application → wizard → declarations → underwriting.
 * Call from the InsuranceQuotePage so that Apply Now navigates instantly.
 */
export function usePrefetchInsuranceFlow() {
  usePrefetchObject('application');
  usePrefetchObject('declaration');
  usePrefetchObject('underwriting_case');
  usePrefetchObject('application_document');
}
