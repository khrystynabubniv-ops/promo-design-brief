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
    <div className="ct-app-panel grid grid-cols-1 overflow-hidden sm:grid-cols-3">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;

        return (
          <div
            className={[
              'relative flex min-h-[62px] items-center gap-3 px-5',
              isActive ? 'bg-[#1d4ed8] text-white' : 'bg-white text-[#5b6472]',
              isDone ? 'bg-[#f7f9ff] text-[#1d4ed8]' : '',
              index !== steps.length - 1 ? 'border-b border-[#e7e9ee] sm:border-b-0 sm:border-r' : '',
            ].join(' ')}
            key={step.id}
          >
            <span
              className={[
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                isActive
                  ? 'border-white/70 bg-white text-[#1d4ed8]'
                  : isDone
                    ? 'border-[#c9d8fb] bg-[#1d4ed8] text-white'
                    : 'border-[#d6dae0] bg-[#fafbfc] text-[#5b6472]',
              ].join(' ')}
            >
              {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : step.id}
            </span>
            <span className="text-sm font-bold">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
