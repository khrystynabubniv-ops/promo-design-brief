import { articleHouseCard, companyPrCard, forbiddenGlobal, pressReleaseForbiddenGlobal } from '../config/styleCards';
import type { Brief, SpeakerCard } from '../types';

export function getForbiddenForBrief(brief: Brief, speaker?: SpeakerCard | null) {
  if (brief.format === 'press_release') {
    return [
      ...pressReleaseForbiddenGlobal,
      ...companyPrCard.forbidden,
    ];
  }

  if (brief.format === 'comment') {
    return [
      ...forbiddenGlobal,
      ...(speaker?.lexiconNo ?? []),
    ];
  }

  return [
    ...forbiddenGlobal,
    ...articleHouseCard.forbidden,
    ...(speaker?.lexiconNo ?? []),
  ];
}
