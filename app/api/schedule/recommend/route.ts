import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TaskInput = {
  id: number;
  name: string;
  target: string;
  location: 'outside' | 'inside';
  duration: number;
  requiredCrew: number;
  priority: number;
  detail: string;
  minSkill: number;
};

type WeatherSlotInput = {
  time: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  rain: number;
  wind: number;
};

type WorkerInput = { id: number; name: string; level: number };

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId', 'startTime', 'endTime', 'decision', 'riskScore', 'reason', 'assignedWorkerIds'],
  properties: {
    taskId: { type: 'number' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    decision: { type: 'string', enum: ['진행', '주의', '내부 우선', '중단 검토'] },
    riskScore: { type: 'number', minimum: 0, maximum: 100 },
    reason: { type: 'string' },
    assignedWorkerIds: { type: 'array', items: { type: 'number' } },
  },
} as const;

// Required task keys prevent omissions and duplicates; enums enforce actual forecast slots.
function responseSchema(tasks: TaskInput[], slots: WeatherSlotInput[]) {
  return {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'object',
      additionalProperties: false,
      required: tasks.map((task) => String(task.id)),
      properties: Object.fromEntries(tasks.map((task) => [String(task.id), {
        ...itemSchema,
        properties: {
          ...itemSchema.properties,
          taskId: { type: 'number', enum: [task.id] },
          startTime: { type: 'string', enum: slots.filter((slot) => timeToMinutes(slot.time) + task.duration * 60 <= 1080).map((slot) => slot.time) },
        },
      }])),
    },
  },
  };
}

function isTask(value: unknown): value is TaskInput {
  if (!value || typeof value !== 'object') return false;
  const task = value as TaskInput;
  return typeof task.id === 'number' && typeof task.name === 'string' &&
    (task.location === 'outside' || task.location === 'inside') &&
    Number.isFinite(task.duration) && task.duration > 0 && Number.isInteger(task.duration * 60) &&
    Number.isInteger(task.requiredCrew) && task.requiredCrew > 0 && Number.isFinite(task.priority) && Number.isFinite(task.minSkill);
}

function isWeatherSlot(value: unknown): value is WeatherSlotInput {
  if (!value || typeof value !== 'object') return false;
  const slot = value as WeatherSlotInput;
  return typeof slot.time === 'string' && Number.isFinite(timeToMinutes(slot.time)) && [slot.temp, slot.feelsLike, slot.humidity, slot.rain, slot.wind].every(Number.isFinite);
}

function isWorker(value: unknown): value is WorkerInput {
  if (!value || typeof value !== 'object') return false;
  const worker = value as WorkerInput;
  return typeof worker.id === 'number' && typeof worker.name === 'string' && Number.isFinite(worker.level);
}

function outputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };

  if (typeof response.output_text === 'string') return response.output_text;
  for (const message of response.output ?? []) {
    for (const content of message.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return undefined;
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: 'AI 일정 분석 키가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const body = await request.json() as { tasks?: unknown; weatherSlots?: unknown; totalCrew?: unknown; workers?: unknown };
    const tasks = Array.isArray(body.tasks) ? body.tasks.filter(isTask).slice(0, 20) : [];
    const weatherSlots = Array.isArray(body.weatherSlots) ? body.weatherSlots.filter(isWeatherSlot).slice(0, 24) : [];
    const workers = Array.isArray(body.workers) ? body.workers.filter(isWorker).slice(0, 30) : [];
    const totalCrew = typeof body.totalCrew === 'number' ? body.totalCrew : 0;

    if (!tasks.length || !weatherSlots.length || !Number.isInteger(totalCrew) || totalCrew < 1 || !workers.length) {
      return NextResponse.json({ message: 'AI 분석에 필요한 작업·기상·인원 정보가 부족합니다.' }, { status: 400 });
    }

    if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
      return NextResponse.json({ message: '작업 번호가 중복되었습니다. 작업 목록을 확인해주세요.' }, { status: 400 });
    }
    if (tasks.some((task) => !weatherSlots.some((slot) => timeToMinutes(slot.time) + task.duration * 60 <= 1080))) {
      return NextResponse.json({ message: '18시까지 완료할 수 없는 작업이 있습니다. 예상 작업시간을 확인해주세요.' }, { status: 400 });
    }

    const prompt = [
      '당신은 한화에어로스페이스 여수 사업장의 현장 작업 일정 안전 분석가입니다.',
      '내일의 작업을 기상, 작업 위치, 위험도, 필요 인원, 작업시간, 우선순위를 함께 고려해 배치하세요.',
      '반드시 각 작업을 한 번씩만 배치하고, startTime은 제공된 기상 시간대 중 하나를 사용하세요.',
      '동일 시간대에는 서로 다른 작업자를 배정할 수 있고, 총 가용 인원 및 최소 작업 역량 조건을 충족하면 작업을 병렬 배치하세요.',
      '각 작업에는 requiredCrew와 같은 수의 assignedWorkerIds를 넣고, 최소 작업 역량을 만족하는 작업자만 배정하세요. 동일 작업자를 시간이 겹치는 다른 작업에 배정하면 안 됩니다.',
      'endTime은 작업시간을 반영한 HH:MM 형식으로 작성하세요.',
      '외부 작업은 강수, 체감온도, 풍속이 높을수록 보수적으로 판단하고, 필요 인원이 총 가용 인원을 넘으면 중단 검토로 판단하세요.',
      'reason은 현장 작업자가 이해할 수 있는 한국어 한 문장으로, 기상·작업특성·인원·위험도 중 최소 세 가지 근거를 포함하세요.',
      `총 가용 인원: ${totalCrew}명`,
      `작업자 작업 역량: ${JSON.stringify(workers)}`,
      `작업 목록: ${JSON.stringify(tasks)}`,
      `시간대별 기상: ${JSON.stringify(weatherSlots)}`,
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        text: {
          format: {
            type: 'json_schema',
            name: 'work_schedule_recommendation',
            strict: true,
            schema: responseSchema(tasks, weatherSlots),
          },
        },
      }),
    });
    const payload = await response.json() as { error?: { message?: string } };
    const text = outputText(payload);

    if (!response.ok || !text) {
      throw new Error(payload.error?.message || 'AI 일정 분석 응답을 받지 못했습니다.');
    }

    const parsed = JSON.parse(text) as {
      summary: string;
      items: Record<string, { taskId: number; startTime: string; endTime: string; decision: string; riskScore: number; reason: string; assignedWorkerIds: number[] }>;
    };
    if (!parsed || typeof parsed.summary !== 'string' || !parsed.items || typeof parsed.items !== 'object') {
      throw new Error('AI 일정 응답에 요약 또는 작업 목록이 없습니다. 다시 분석해주세요.');
    }
    const result = { summary: parsed.summary, items: Object.values(parsed.items) };
    const taskIds = new Set(tasks.map((task) => task.id));
    const slotTimes = new Set(weatherSlots.map((slot) => slot.time));
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const issues: string[] = [];
    if (result.items.length !== tasks.length) issues.push('작업 수 불일치');
    for (const item of result.items) {
      if (!item || !taskIds.has(item.taskId)) { issues.push('알 수 없는 작업 번호'); continue; }
      if (typeof item.startTime === 'string') item.startTime = item.startTime.trim().replace(/^(\d):/, '0$1:');
      if (!slotTimes.has(item.startTime)) issues.push(`작업 ${item.taskId}: 허용되지 않은 시작 시간`);
      if (!['진행', '주의', '내부 우선', '중단 검토'].includes(item.decision)) issues.push(`작업 ${item.taskId}: 판단 값 오류`);
      if (!Number.isFinite(item.riskScore) || item.riskScore < 0 || item.riskScore > 100) issues.push(`작업 ${item.taskId}: 위험 점수 범위 오류`);
      if (typeof item.reason !== 'string' || !item.reason.trim()) issues.push(`작업 ${item.taskId}: 배치 근거 누락`);
      if (timeToMinutes(item.startTime) + taskById.get(item.taskId)!.duration * 60 > 1080) issues.push(`작업 ${item.taskId}: 근무 종료 시간 초과`);
    }
    if (new Set(result.items.map((item) => item?.taskId)).size !== tasks.length) issues.push('작업 누락 또는 중복');
    if (issues.length) {
      console.warn('AI schedule validation failed', { issues });
      throw new Error(`AI 일정 검증 실패: ${issues.join(', ')}. 다시 분석해주세요.`);
    }

    const bookings = new Map<number, Array<{ start: number; end: number }>>();
    const repairedItems = [...result.items]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((item) => {
        const task = taskById.get(item.taskId)!;
        const start = timeToMinutes(item.startTime);
        const end = start + task.duration * 60;
        const endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
        const assignedWorkers = workers.slice(0, totalCrew)
          .filter((worker) => worker.level >= task.minSkill && !(bookings.get(worker.id) ?? []).some((booking) => start < booking.end && end > booking.start))
          .sort((a, b) => b.level - a.level)
          .slice(0, task.requiredCrew);
        const fullyAssigned = assignedWorkers.length === task.requiredCrew;
        if (fullyAssigned) {
          assignedWorkers.forEach((worker) => bookings.set(worker.id, [...(bookings.get(worker.id) ?? []), { start, end }]));
        }
        return { ...item, endTime, decision: fullyAssigned ? item.decision : '중단 검토', assignedWorkerIds: fullyAssigned ? assignedWorkers.map((worker) => worker.id) : [] };
      });

    return NextResponse.json({ ...result, items: repairedItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 일정 분석 중 오류가 발생했습니다.';
    return NextResponse.json({ message }, { status: 502 });
  }
}
