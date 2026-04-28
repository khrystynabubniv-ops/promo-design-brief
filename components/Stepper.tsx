'use client';

import { Check } from 'lucide-react';
import type { AppStep } from '@/lib/types';

type StepperProps = {
  currentStep: AppStep;
};

const steps: { id: AppStep; label: string }[] = [
  { id: 1, label: 'Вакансії' },
  { id: 2, label: 'Бриф' },
  { id: 3, label: 'Notion' },
];

export function Stepper({ currentStep }: StepperProps) {
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-soft">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;

        return (
          <div
            className={[
              'relative flex min-h-16 items-center gap-3 px-5',
              isActive ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-700',
              isDone ? 'text-neutral-950' : '',
              index !== steps.length - 1 ? 'border-r border-neutral-200' : '',
            ].join(' ')}
            key={step.id}
          >
            <span
              className={[
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                isActive
                  ? 'border-white/70 bg-white text-neutral-950'
                  : isDone
                    ? 'border-neutral-950 bg-neutral-950 text-white'
                    : 'border-neutral-300 bg-neutral-50 text-neutral-600',
              ].join(' ')}
            >
              {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : step.id}
            </span>
            <span className="text-sm font-semibold">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
