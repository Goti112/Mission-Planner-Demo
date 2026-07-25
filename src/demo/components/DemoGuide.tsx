import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import { useUIStore } from '../../shared/store/uiStore';
import { DEMO_GUIDE_CONTENT } from '../guide/demoGuideContent';
import { useDemoGuideStore } from '../guide/demoGuideStore';
import './DemoGuide.css';

const STEP_NUMBER: Readonly<Record<keyof typeof DEMO_GUIDE_CONTENT, number>> = {
  WELCOME: 1,
  PLAN: 2,
  FLY: 3,
  INSPECT: 4,
  REVIEW: 5,
};

const useHighlightedTarget = (target: string | null): void => {
  useEffect(() => {
    if (target === null) {
      return undefined;
    }

    let highlightedElement: HTMLElement | null = null;

    const updateHighlightedElement = (): void => {
      const nextElement = document.querySelector<HTMLElement>(target);

      if (nextElement === highlightedElement) {
        return;
      }

      highlightedElement?.removeAttribute('data-demo-active-target');
      nextElement?.setAttribute('data-demo-active-target', 'true');
      highlightedElement = nextElement;
    };

    updateHighlightedElement();

    const observer = new MutationObserver(updateHighlightedElement);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      highlightedElement?.removeAttribute('data-demo-active-target');
    };
  }, [target]);
};

export const DemoGuide = (): React.JSX.Element | null => {
  const step = useDemoGuideStore((state) => state.step);
  const isOpen = useDemoGuideStore((state) => state.isOpen);
  const advance = useDemoGuideStore((state) => state.advance);
  const skip = useDemoGuideStore((state) => state.skip);
  const close = useDemoGuideStore((state) => state.close);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const dialogRef = useRef<HTMLElement>(null);
  const content = step === 'FREE' ? null : DEMO_GUIDE_CONTENT[step];

  useHighlightedTarget(content?.target ?? null);

  useEffect(() => {
    if (isOpen && step !== 'FREE') {
      dialogRef.current?.focus();
    }
  }, [isOpen, step]);

  if (!isOpen || step === 'FREE' || content === null) {
    return null;
  }

  const handleReviewMission = (): void => {
    setCurrentView('PLAN');
    advance();
  };

  const handleGuideOnlyAdvance = (): void => {
    advance();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      close();
    }
  };

  return (
    <div className={`demo-guide-layer demo-guide-layer--${step.toLowerCase()}`}>
      <section
        ref={dialogRef}
        className="demo-guide"
        role="dialog"
        aria-modal={step === 'WELCOME'}
        aria-labelledby="demo-guide-title"
        aria-describedby="demo-guide-body"
        data-demo-target-selector={content.target ?? undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <button
          className="demo-guide__close"
          type="button"
          aria-label="Close tour"
          onClick={close}
        >
          <X size={16} aria-hidden="true" />
        </button>

        <span className="demo-guide__step">Step {STEP_NUMBER[step]} of 5</span>
        <h2 id="demo-guide-title">{content.title}</h2>
        <p id="demo-guide-body">{content.body}</p>

        {step === 'WELCOME' ? (
          <div className="demo-guide__actions">
            <button
              className="demo-guide__button demo-guide__button--primary"
              type="button"
              onClick={handleReviewMission}
            >
              {content.actionLabel}
            </button>
            <button className="demo-guide__button" type="button" onClick={skip}>
              Explore freely
            </button>
          </div>
        ) : step === 'FLY' ? (
          <div className="demo-guide__actions">
            <button
              className="demo-guide__button demo-guide__button--primary"
              type="button"
              onClick={handleGuideOnlyAdvance}
            >
              {content.actionLabel}
            </button>
            <button className="demo-guide__button" type="button" onClick={skip}>
              Skip tour
            </button>
          </div>
        ) : (
          <>
            <p className="demo-guide__target-instruction">
              Use the highlighted control: <strong>{content.actionLabel}</strong>
            </p>
            <div className="demo-guide__actions demo-guide__actions--end">
              <button className="demo-guide__button" type="button" onClick={skip}>
                Skip tour
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
