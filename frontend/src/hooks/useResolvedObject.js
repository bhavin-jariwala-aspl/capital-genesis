import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { runtimeService } from '../services/metadata.service';
import { useMetadataStore } from '../store/metadataStore';

/**
 * useResolvedObject — resolves an object name to its metadata using
 * MetadataStore (instant) with React Query fallback.
 *
 * Returns { objectId, objectData, fields, resolved, isLoading }
 *
 * Replaces the common pattern of:
 *   useQuery(['resolve-object', name]) → objectId → useQuery(['runtime-object', objectId])
 *
 * With a single hook that reads from local cache first.
 */
export function useResolvedObject(objectName) {
  // 1. Try MetadataStore for resolved name → object_id
  const cachedResolved = useMetadataStore((s) => s.getResolved(objectName));

  const { data: resolvedData, isLoading: resolveLoading } = useQuery({
    queryKey: ['resolve-object', objectName],
    queryFn: () => runtimeService.resolveObject(objectName),
    staleTime: 300_000,
    enabled: !!objectName && !cachedResolved,
  });

  const resolved = cachedResolved ?? resolvedData?.data ?? resolvedData;
  const objectId = resolved?.object_id;

  // 2. Try MetadataStore for object data (fields, pipelines, etc.)
  const cachedObject = useMetadataStore((s) => objectId ? s.getObject(objectId) : null);

  const { data: objectData, isLoading: objectLoading } = useQuery({
    queryKey: ['runtime-object', objectId],
    queryFn: () => runtimeService.getObject(objectId),
    enabled: !!objectId && !cachedObject,
    staleTime: 300_000,
  });

  const object = cachedObject ?? objectData?.data;
  const fields = useMemo(() => object?.fields ?? [], [object]);

  return {
    objectId,
    objectData: object,
    fields,
    resolved,
    isLoading: (!cachedResolved && resolveLoading) || (!cachedObject && objectLoading),
  };
}
