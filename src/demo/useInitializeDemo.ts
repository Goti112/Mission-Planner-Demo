import { useEffect, useRef } from 'react';
import { resetDemoScenario } from './scenario/resetDemoScenario';

export const useInitializeDemo = (): void => {
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (initializedRef.current) return;

    initializedRef.current = true;
    resetDemoScenario();
  }, []);
};
