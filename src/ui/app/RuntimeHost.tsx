import { useEffect, useState } from 'react';
import { uiScope } from '../shared/lifecycle';
import { disposeRegions } from '../shared/regions';
import { session } from '../shared/session';
/** Start after React commits the native controls. Strict Mode's discarded mount never starts resources. */
export function RuntimeHost({ start }: { start: () => void }) {
  const [failure, setFailure] = useState<unknown>(null);
  useEffect(() => {
    uiScope.begin();
    session.reset();
    const generation = uiScope.generation;
    queueMicrotask(() => {
      if (!uiScope.isCurrent(generation)) return;
      try {
        start();
      } catch (error) {
        setFailure(error);
      }
    });
    return () => {
      uiScope.dispose();
      queueMicrotask(disposeRegions);
    };
  }, [start]);
  if (failure) throw failure;
  return null;
}
