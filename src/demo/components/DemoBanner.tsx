import { resetDemoScenario } from '../scenario/resetDemoScenario';
import { useDemoGuideStore } from '../guide/demoGuideStore';
import './DemoBanner.css';

export const DemoBanner = (): React.JSX.Element => {
  const restart = useDemoGuideStore((state) => state.restart);

  const handleRestart = (): void => {
    resetDemoScenario();
    restart();
  };

  return (
    <aside className="demo-banner" aria-label="Simulation demo status">
      <span className="demo-banner__badge">SIMULATION DEMO</span>
      <span className="demo-banner__description">Synthetic data only</span>
      <button className="demo-banner__restart" type="button" onClick={handleRestart}>
        Restart tour
      </button>
    </aside>
  );
};
