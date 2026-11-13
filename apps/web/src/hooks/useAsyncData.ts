import { useState, useEffect, useCallback } from 'react';

export interface AsyncQueryState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<T>;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

/**
 * Reusable Production Async Query Hook (`useAsyncQuery`)
 * Starts with `initialData` for zero layout shift, then resolves the async service call.
 */
export function useAsyncQuery<T>(
  queryFn: () => Promise<T>,
  initialData: T,
  deps: React.DependencyList = []
): AsyncQueryState<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      setData(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu từ máy chủ';
      setError(msg);
      return initialData;
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void execute();
  }, [execute]);

  return {
    data,
    isLoading,
    error,
    refetch: execute,
    setData,
  };
}

/**
 * Universal `useAsyncData` hook supporting both `(queryFn, deps)` and `(queryFn, initialData, deps)` signatures.
 */
export function useAsyncData<T>(
  queryFn: () => Promise<T>,
  depsOrInitialData?: React.DependencyList | T,
  maybeDeps?: React.DependencyList
): AsyncQueryState<T> {
  const hasExplicitInitialData = maybeDeps !== undefined;
  const initialData = (hasExplicitInitialData ? depsOrInitialData : undefined) as T;
  const deps: React.DependencyList = hasExplicitInitialData
    ? maybeDeps
    : Array.isArray(depsOrInitialData)
    ? depsOrInitialData
    : [];

  return useAsyncQuery<T>(queryFn, initialData, deps);
}

export interface AsyncMutationState<TArgs extends unknown[], TResult> {
  mutate: (...args: TArgs) => Promise<TResult>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Reusable Production Async Mutation Hook (`useAsyncMutation`)
 */
export function useAsyncMutation<TArgs extends unknown[], TResult>(
  mutationFn: (...args: TArgs) => Promise<TResult>
): AsyncMutationState<TArgs, TResult> {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      setIsLoading(true);
      setError(null);
      try {
        return await mutationFn(...args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Thao tác không thành công';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [mutationFn]
  );

  return {
    mutate,
    isLoading,
    error,
  };
}
