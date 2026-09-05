export type EmailWork = {
  task: { name: string; target: string; location: string; requiredCrew: number; detail: string };
  slot: { time: string; feelsLike: number; rain: number; wind: number };
  endTime: string;
  decision: string;
  assignedWorkers: { name: string }[];
};

export function createScheduleEmail(date: string, works: EmailWork[]) {
  const ordered = [...works].sort((a, b) => a.slot.time.localeCompare(b.slot.time));
  const needsReview = (work: EmailWork) => work.decision === '중단 검토' || work.decision === '내부 우선'
    || work.assignedWorkers.length !== work.task.requiredCrew;
  const planned = ordered.filter((work) => !needsReview(work));
  const review = ordered.filter(needsReview);
  const describe = (work: EmailWork, index: number, pending: boolean) => {
    const notes: string[] = [];
    if (work.task.location === 'outside') {
      if (work.slot.wind > 6) notes.push('바람이 강할 수 있으므로 작업 전 현장 풍속을 확인해 주십시오.');
      if (work.slot.rain > 0) notes.push('강수가 예상되므로 외부 작업 가능 여부를 확인해 주십시오.');
      if (work.slot.feelsLike >= 30) notes.push('더위에 대비해 휴식 및 수분 섭취를 챙겨 주십시오.');
    }
    if (work.decision === '주의' && !notes.length) notes.push('작업 전 현장 조건을 확인한 후 진행해 주십시오.');
    if (work.decision === '중단 검토') notes.push('작업 중단 여부 검토가 필요합니다. 진행 확정 전 확인해 주십시오.');
    if (work.decision === '내부 우선') notes.push('내부 작업을 우선하고 해당 작업의 진행 시간을 재검토해 주십시오.');
    if (work.assignedWorkers.length !== work.task.requiredCrew) notes.push(`필요 ${work.task.requiredCrew}명 중 ${work.assignedWorkers.length}명 배정으로, 인력 배정을 확인해 주십시오.`);
    return [
      `${index + 1}. ${work.task.name} | ${pending ? '검토 시간 ' : ''}${work.slot.time}–${work.endTime}`,
      `- 작업 장소: ${work.task.target} (${work.task.location === 'outside' ? '외부' : '내부'})`,
      `- 배정 인원: ${work.assignedWorkers.map((worker) => worker.name).join(', ') || '미배정'} (총 ${work.assignedWorkers.length}명)`,
      `- 작업 내용: ${work.task.detail}`,
      ...notes.map((note) => `- ${pending ? '확인 사항' : '주의사항'}: ${note}`),
    ].join('\n');
  };
  const overlaps = planned.some((work, index) => planned.slice(index + 1).some((other) => work.slot.time < other.endTime && other.slot.time < work.endTime));
  return {
    subject: `[여수 사업장] ${date} 작업 일정(안) 공유`,
    body: [
      '안녕하십니까, 반장님.\n한화시스템 김동훈 연구원입니다.',
      `${date} 예정된 작업 일정을 아래와 같이 공유드립니다.`,
      '■ 예정 작업 일정',
      planned.length ? planned.map((work, index) => describe(work, index, false)).join('\n\n') : '현재 진행 예정으로 공유할 작업이 없습니다. 아래 확인 필요 사항을 검토해 주십시오.',
      overlaps ? '※ 시간이 겹치는 작업은 배정된 인력별로 병렬 진행할 예정입니다.' : '',
      review.length ? `■ 확인 필요 사항\n아래 작업은 진행 확정 전 검토가 필요합니다.\n\n${review.map((work, index) => describe(work, index, true)).join('\n\n')}` : '',
      '※ 기상 상황 및 현장 여건에 따라 일정이 조정될 수 있습니다.',
      '검토 후 조정이 필요한 사항을 말씀해 주시면 반영하겠습니다.',
      '감사합니다.\n\n김동훈 올림',
    ].filter(Boolean).join('\n\n'),
  };
}
