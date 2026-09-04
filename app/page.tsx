'use client';

import { FormEvent, useMemo, useState } from 'react';

type LocationType = 'outside' | 'inside';
type Decision = '진행' | '주의' | '내부 우선' | '중단 검토';

type Task = {
  id: number;
  name: string;
  target: string;
  location: LocationType;
  duration: number;
  requiredCrew: number;
  priority: number;
  detail: string;
};

type WeatherSlot = {
  time: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  rain: number;
  wind: number;
};

type ScheduledTask = {
  task: Task;
  slot: WeatherSlot;
  endTime: string;
  decision: Decision;
  riskScore: number;
  remainingCrew: number;
  reason: string;
};

const initialTasks: Task[] = [
  {
    id: 1,
    name: '외부 설비 점검',
    target: '공조 설비',
    location: 'outside',
    duration: 2,
    requiredCrew: 4,
    priority: 1,
    detail: '외부 설비 상태 확인, 이상음 및 누수 여부 점검',
  },
  {
    id: 2,
    name: '설비 보수 작업',
    target: '현장 펌프',
    location: 'outside',
    duration: 2,
    requiredCrew: 3,
    priority: 1,
    detail: '장비 분리 후 원인 확인이 필요한 외부 보수 작업',
  },
  {
    id: 3,
    name: '내부 설비 점검',
    target: '전기실',
    location: 'inside',
    duration: 2,
    requiredCrew: 3,
    priority: 2,
    detail: '분전반, 배선, 차단기 상태 점검',
  },
  {
    id: 4,
    name: '자재 및 작업 기록 정리',
    target: '정비실',
    location: 'inside',
    duration: 1,
    requiredCrew: 2,
    priority: 3,
    detail: '자재 재고 확인, 점검 결과 정리, 다음 작업 준비',
  },
];

const weatherSlots: WeatherSlot[] = [
  { time: '09:00', temp: 28, feelsLike: 31, humidity: 68, rain: 0, wind: 2 },
  { time: '10:00', temp: 30, feelsLike: 33, humidity: 70, rain: 0, wind: 3 },
  { time: '11:00', temp: 31, feelsLike: 35, humidity: 74, rain: 0, wind: 4 },
  { time: '13:00', temp: 32, feelsLike: 37, humidity: 78, rain: 2, wind: 5 },
  { time: '14:00', temp: 33, feelsLike: 39, humidity: 82, rain: 5, wind: 6 },
  { time: '15:00', temp: 32, feelsLike: 38, humidity: 84, rain: 8, wind: 7 },
  { time: '16:00', temp: 30, feelsLike: 34, humidity: 76, rain: 1, wind: 4 },
];

const emptyTask = {
  name: '',
  target: '',
  location: 'outside' as LocationType,
  duration: 1,
  requiredCrew: 2,
  priority: 2,
  detail: '',
};

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour + hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getDecision(task: Task, weather: WeatherSlot): Decision {
  if (task.location === 'inside') return '진행';
  if (weather.rain >= 5 || weather.feelsLike >= 38) return '중단 검토';
  if (weather.rain > 0 || weather.feelsLike >= 35) return '내부 우선';
  if (weather.wind >= 6) return '주의';
  return '진행';
}

function calculateRisk(task: Task, weather: WeatherSlot) {
  if (task.location === 'inside') {
    return weather.rain > 0 || weather.feelsLike >= 35 ? 18 : 10;
  }

  let score = 18;
  score += Math.max(0, weather.feelsLike - 30) * 5;
  score += weather.rain * 7;
  score += Math.max(0, weather.wind - 3) * 5;
  score += Math.max(0, weather.humidity - 70) * 0.8;
  return Math.min(Math.round(score), 100);
}

function makeReason(task: Task, weather: WeatherSlot, decision: Decision) {
  if (task.location === 'inside') {
    if (weather.rain > 0 || weather.feelsLike >= 35) {
      return `비 또는 체감온도 ${weather.feelsLike}도 조건 때문에 외부 작업보다 내부 작업을 먼저 배치했습니다.`;
    }
    return '내부 작업이라 기상 영향이 낮고 남는 공수를 안정적으로 투입할 수 있습니다.';
  }

  if (decision === '진행') {
    return `체감온도 ${weather.feelsLike}도, 강수 ${weather.rain}mm로 외부 작업 진행이 가능한 시간대입니다.`;
  }

  if (decision === '주의') {
    return `풍속 ${weather.wind}m/s 조건을 고려해 안전 확인 후 진행이 필요합니다.`;
  }

  if (decision === '내부 우선') {
    return `체감온도 ${weather.feelsLike}도 또는 강수 조건 때문에 내부 작업을 먼저 배치하는 것이 적절합니다.`;
  }

  return `체감온도 ${weather.feelsLike}도, 강수 ${weather.rain}mm로 외부 작업 중단 또는 시간 변경 검토가 필요합니다.`;
}

function createSchedule(tasks: Task[], totalCrew: number) {
  const orderedTasks = [...tasks].sort((a, b) => a.priority - b.priority);
  const availableSlots = [...weatherSlots];
  const schedule: ScheduledTask[] = [];

  for (const task of orderedTasks) {
    if (availableSlots.length === 0) break;

    const ranked = availableSlots
      .map((slot, index) => {
        const decision = getDecision(task, slot);
        const riskScore = calculateRisk(task, slot);
        const crewPenalty = task.requiredCrew > totalCrew ? 100 : 0;
        const outsidePenalty =
          task.location === 'outside' && (decision === '내부 우선' || decision === '중단 검토')
            ? 60
            : 0;

        return {
          slot,
          index,
          decision,
          riskScore,
          sortScore: riskScore + crewPenalty + outsidePenalty,
        };
      })
      .sort((a, b) => {
        if (a.sortScore !== b.sortScore) return a.sortScore - b.sortScore;
        return a.index - b.index;
      });

    const selected = ranked[0];
    const remainingCrew = totalCrew - task.requiredCrew;
    schedule.push({
      task,
      slot: selected.slot,
      endTime: addHours(selected.slot.time, task.duration),
      decision: task.requiredCrew > totalCrew ? '중단 검토' : selected.decision,
      riskScore: selected.riskScore,
      remainingCrew,
      reason:
        task.requiredCrew > totalCrew
          ? `필요 인원 ${task.requiredCrew}명이 현재 가능 인원 ${totalCrew}명보다 많아 인력 조정이 필요합니다.`
          : makeReason(task, selected.slot, selected.decision),
    });

    availableSlots.splice(selected.index, Math.min(task.duration, availableSlots.length));
  }

  return schedule.sort((a, b) => a.slot.time.localeCompare(b.slot.time));
}

function decisionClass(decision: Decision) {
  if (decision === '진행') return 'text-[#16794c]';
  if (decision === '주의') return 'text-[#946200]';
  if (decision === '내부 우선') return 'text-[#c75d12]';
  return 'text-[#b42318]';
}

function priorityLabel(priority: number) {
  if (priority === 1) return '높음';
  if (priority === 2) return '보통';
  return '낮음';
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [totalCrew, setTotalCrew] = useState(12);
  const [form, setForm] = useState(emptyTask);
  const [selectedId, setSelectedId] = useState<number>(initialTasks[0].id);
  const schedule = useMemo(() => createSchedule(tasks, totalCrew), [tasks, totalCrew]);
  const selected = schedule.find((item) => item.task.id === selectedId) ?? schedule[0];
  const assignedCrew = schedule.reduce((sum, item) => sum + item.task.requiredCrew, 0);
  const outsideBlocked = schedule.filter(
    (item) => item.task.location === 'outside' && item.decision !== '진행',
  ).length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.target.trim()) return;

    const nextTask: Task = {
      id: Date.now(),
      name: form.name.trim(),
      target: form.target.trim(),
      location: form.location,
      duration: Number(form.duration),
      requiredCrew: Number(form.requiredCrew),
      priority: Number(form.priority),
      detail: form.detail.trim() || '상세 내용 없음',
    };

    setTasks((current) => [...current, nextTask]);
    setSelectedId(nextTask.id);
    setForm(emptyTask);
  }

  function removeTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  return (
    <main className="min-h-screen bg-[#f5f3ef] text-[#171717]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f15b2a]">
              Field Workforce Scheduler
            </p>
            <h1 className="mt-1 text-xl font-semibold md:text-2xl">
              현장 작업 공수 및 일정 관리
            </h1>
          </div>
          <div className="hidden items-center gap-7 text-sm font-medium text-black/60 md:flex">
            <span>공수 관리</span>
            <span>작업 판단</span>
            <span>일정 전달</span>
          </div>
        </div>
      </header>

      <section className="border-b border-black/10 bg-[#202124] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.08fr_0.92fr] md:px-8 md:py-16">
          <div>
            <p className="text-sm font-semibold text-[#f15b2a]">
              체감온도 35도와 강수 여부를 기준으로 작업 순서를 조정합니다
            </p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              오늘 투입할 인원과 작업 가능 시간을 한 화면에서 결정합니다.
            </h2>
          </div>
          <div className="self-end border-l border-white/20 pl-6 text-sm leading-7 text-white/72">
            외부 작업은 체감온도와 비의 영향을 먼저 보고, 위험한 시간대에는 내부 작업을 우선 배치합니다.
            10~12명 규모의 현장직 공수를 기준으로 작업별 필요 인원과 남는 인원도 함께 계산합니다.
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:grid-cols-[360px_1fr_320px] md:px-8">
        <aside className="space-y-5">
          <section className="border border-black/10 bg-white p-5">
            <h3 className="text-lg font-semibold">현장 인원</h3>
            <label className="mt-4 block text-sm font-medium">
              작업 가능 인원
              <input
                type="number"
                min={1}
                max={20}
                value={totalCrew}
                onChange={(event) => setTotalCrew(Number(event.target.value))}
                className="mt-2 w-full border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
              />
            </label>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="border border-black/10 p-3">
                <p className="text-black/45">총원</p>
                <p className="mt-1 text-xl font-semibold">{totalCrew}</p>
              </div>
              <div className="border border-black/10 p-3">
                <p className="text-black/45">작업</p>
                <p className="mt-1 text-xl font-semibold">{tasks.length}</p>
              </div>
              <div className="border border-black/10 p-3">
                <p className="text-black/45">주의</p>
                <p className="mt-1 text-xl font-semibold">{outsideBlocked}</p>
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="border border-black/10 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">작업 입력</h3>
              <span className="text-sm text-black/50">{tasks.length}개 작업</span>
            </div>

            <label className="block text-sm font-medium">
              작업명
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-2 w-full border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                placeholder="예: 외부 설비 점검"
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              설비명 또는 대상
              <input
                value={form.target}
                onChange={(event) => setForm({ ...form, target: event.target.value })}
                className="mt-2 w-full border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                placeholder="예: 공조 설비"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                장소
                <select
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value as LocationType })
                  }
                  className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                >
                  <option value="outside">외부</option>
                  <option value="inside">내부</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                필요 인원
                <select
                  value={form.requiredCrew}
                  onChange={(event) =>
                    setForm({ ...form, requiredCrew: Number(event.target.value) })
                  }
                  className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                >
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count}명
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                소요 시간
                <select
                  value={form.duration}
                  onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })}
                  className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                >
                  <option value={1}>1시간</option>
                  <option value={2}>2시간</option>
                  <option value={3}>3시간</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                우선순위
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                  className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                >
                  <option value={1}>높음</option>
                  <option value={2}>보통</option>
                  <option value={3}>낮음</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium">
              작업 내용
              <textarea
                value={form.detail}
                onChange={(event) => setForm({ ...form, detail: event.target.value })}
                className="mt-2 min-h-20 w-full resize-none border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
                placeholder="작업 내용과 주의 사항"
              />
            </label>

            <button className="mt-5 w-full bg-[#f15b2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d9491d]">
              작업 추가
            </button>
          </form>
        </aside>

        <section className="border border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
                Daily Dispatch
              </p>
              <h3 className="mt-1 text-xl font-semibold">현장직 전달용 작업 일정</h3>
            </div>
            <span className="bg-[#202124] px-3 py-1.5 text-sm font-semibold text-white">
              누적 투입 {assignedCrew}명
            </span>
          </div>

          <div className="divide-y divide-black/10">
            {schedule.map((item) => (
              <button
                key={item.task.id}
                onClick={() => setSelectedId(item.task.id)}
                className={`grid w-full gap-4 px-5 py-4 text-left transition md:grid-cols-[120px_1fr_112px] ${
                  selected?.task.id === item.task.id ? 'bg-[#fff7f2]' : 'bg-white hover:bg-black/[0.03]'
                }`}
              >
                <div>
                  <p className="text-xl font-semibold">{item.slot.time}</p>
                  <p className="text-sm text-black/50">{item.endTime} 종료</p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold">{item.task.name}</h4>
                    <span className="border border-black/15 px-2 py-1 text-xs">
                      {item.task.location === 'outside' ? '외부' : '내부'}
                    </span>
                    <span className="border border-black/15 px-2 py-1 text-xs">
                      {item.task.requiredCrew}명 투입
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-black/62">{item.reason}</p>
                </div>
                <div className="md:text-right">
                  <p className={`text-sm font-semibold ${decisionClass(item.decision)}`}>
                    {item.decision}
                  </p>
                  <p className="mt-1 text-sm text-black/50">남는 인원</p>
                  <p className="text-2xl font-semibold">{Math.max(0, item.remainingCrew)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-black/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
              Weather Standard
            </p>
            <h3 className="mt-1 text-lg font-semibold">기상 판단 기준</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-t border-black/10 pt-3">
                <span className="text-black/55">체감온도</span>
                <strong>35도 이상 주의</strong>
              </div>
              <div className="flex justify-between border-t border-black/10 pt-3">
                <span className="text-black/55">비 예보</span>
                <strong>내부 작업 우선</strong>
              </div>
              <div className="flex justify-between border-t border-black/10 pt-3">
                <span className="text-black/55">외부 작업</span>
                <strong>날씨 영향 큼</strong>
              </div>
            </div>
          </section>

          <section className="border border-black/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
              Forecast
            </p>
            <h3 className="mt-1 text-lg font-semibold">시간대별 기상</h3>
            <div className="mt-4 space-y-3">
              {weatherSlots.map((slot) => (
                <div key={slot.time} className="grid grid-cols-[54px_1fr_auto] items-center gap-3">
                  <span className="text-sm font-semibold">{slot.time}</span>
                  <div>
                    <div className="h-2 bg-black/10">
                      <div
                        className={`h-2 ${slot.feelsLike >= 35 ? 'bg-[#b42318]' : 'bg-[#f15b2a]'}`}
                        style={{ width: `${Math.min(100, slot.feelsLike * 2.3)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-black/45">
                      비 {slot.rain}mm · 바람 {slot.wind}m/s
                    </p>
                  </div>
                  <span className="text-sm text-black/60">{slot.feelsLike}도</span>
                </div>
              ))}
            </div>
          </section>

          {selected ? (
            <section className="border border-black/10 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
                Selected Work
              </p>
              <h3 className="mt-1 text-lg font-semibold">{selected.task.name}</h3>
              <p className="mt-3 text-sm leading-6 text-black/62">{selected.task.detail}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">대상</dt>
                  <dd className="mt-1 font-semibold">{selected.task.target}</dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">우선순위</dt>
                  <dd className="mt-1 font-semibold">{priorityLabel(selected.task.priority)}</dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">필요 인원</dt>
                  <dd className="mt-1 font-semibold">{selected.task.requiredCrew}명</dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">판단</dt>
                  <dd className={`mt-1 font-semibold ${decisionClass(selected.decision)}`}>
                    {selected.decision}
                  </dd>
                </div>
              </dl>
              <button
                onClick={() => removeTask(selected.task.id)}
                className="mt-5 w-full border border-black/15 px-4 py-2.5 text-sm font-semibold transition hover:border-[#f15b2a] hover:text-[#f15b2a]"
              >
                선택 작업 삭제
              </button>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
