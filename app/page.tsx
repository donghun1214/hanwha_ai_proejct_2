'use client';

import { FormEvent, useMemo, useState } from 'react';

type LocationType = 'outdoor' | 'indoor';
type RiskLevel = '적합' | '주의' | '비추천' | '위험';

type Task = {
  id: number;
  name: string;
  category: string;
  location: LocationType;
  duration: number;
  priority: number;
  detail: string;
};

type WeatherSlot = {
  time: string;
  temp: number;
  humidity: number;
  rain: number;
  wind: number;
};

type ScheduledTask = {
  task: Task;
  slot: WeatherSlot;
  riskScore: number;
  riskLevel: RiskLevel;
  reason: string;
  endTime: string;
};

const initialTasks: Task[] = [
  {
    id: 1,
    name: '옥외 배관 점검',
    category: '설비 점검',
    location: 'outdoor',
    duration: 2,
    priority: 1,
    detail: '외부 배관 누수 및 연결부 상태 확인',
  },
  {
    id: 2,
    name: '지붕 시설 점검',
    category: '안전 점검',
    location: 'outdoor',
    duration: 1,
    priority: 2,
    detail: '지붕 구조물, 배수로, 고정 장치 확인',
  },
  {
    id: 3,
    name: '실내 전기설비 점검',
    category: '전기 점검',
    location: 'indoor',
    duration: 2,
    priority: 1,
    detail: '분전반, 배선, 차단기 작동 상태 점검',
  },
  {
    id: 4,
    name: '점검 결과 정리',
    category: '문서 작업',
    location: 'indoor',
    duration: 1,
    priority: 3,
    detail: '점검 결과 취합 및 보고서 초안 작성',
  },
];

const weatherSlots: WeatherSlot[] = [
  { time: '09:00', temp: 24, humidity: 62, rain: 0, wind: 2 },
  { time: '10:00', temp: 26, humidity: 65, rain: 0, wind: 3 },
  { time: '11:00', temp: 28, humidity: 70, rain: 0, wind: 4 },
  { time: '13:00', temp: 31, humidity: 76, rain: 2, wind: 5 },
  { time: '14:00', temp: 33, humidity: 80, rain: 4, wind: 6 },
  { time: '15:00', temp: 32, humidity: 82, rain: 8, wind: 7 },
  { time: '16:00', temp: 30, humidity: 78, rain: 3, wind: 5 },
];

const emptyTask = {
  name: '',
  category: '',
  location: 'outdoor' as LocationType,
  duration: 1,
  priority: 2,
  detail: '',
};

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return '위험';
  if (score >= 58) return '비추천';
  if (score >= 34) return '주의';
  return '적합';
}

function calculateRisk(task: Task, weather: WeatherSlot) {
  let score = task.location === 'outdoor' ? 18 : 8;

  if (task.location === 'outdoor') {
    score += Math.max(0, weather.temp - 27) * 4;
    score += Math.max(0, weather.humidity - 65) * 0.9;
    score += weather.rain * 5;
    score += Math.max(0, weather.wind - 3) * 5;
  } else {
    score += Math.max(0, weather.temp - 30) * 1.2;
    score += weather.rain > 0 ? 4 : 0;
  }

  return Math.min(Math.round(score), 100);
}

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour + hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function makeReason(task: Task, weather: WeatherSlot, riskLevel: RiskLevel) {
  if (task.location === 'outdoor') {
    if (riskLevel === '적합') {
      return `${weather.time}은 강수와 풍속 부담이 낮아 ${task.name}을 진행하기 적절합니다.`;
    }
    return `${weather.time}은 기온 ${weather.temp}도, 습도 ${weather.humidity}%, 강수 ${weather.rain}mm 조건을 고려해 옥외 작업 주의가 필요합니다.`;
  }

  if (weather.rain > 0 || weather.temp >= 30) {
    return `기상 조건이 악화되는 시간대라 외부 작업 대신 ${task.name}을 배치했습니다.`;
  }

  return `${task.name}은 실내 작업이므로 기상 영향이 적고 일정 사이에 안정적으로 배치할 수 있습니다.`;
}

function createSchedule(tasks: Task[]) {
  const orderedTasks = [...tasks].sort((a, b) => a.priority - b.priority);
  const availableSlots = [...weatherSlots];
  const schedule: ScheduledTask[] = [];

  for (const task of orderedTasks) {
    if (availableSlots.length === 0) break;

    const rankedSlots = availableSlots
      .map((slot, index) => ({
        slot,
        index,
        score: calculateRisk(task, slot),
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.index - b.index;
      });

    const selected = rankedSlots[0];
    const riskLevel = getRiskLevel(selected.score);

    schedule.push({
      task,
      slot: selected.slot,
      riskScore: selected.score,
      riskLevel,
      reason: makeReason(task, selected.slot, riskLevel),
      endTime: addHours(selected.slot.time, task.duration),
    });

    availableSlots.splice(selected.index, task.duration);
  }

  return schedule.sort((a, b) => a.slot.time.localeCompare(b.slot.time));
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [form, setForm] = useState(emptyTask);
  const [selectedId, setSelectedId] = useState<number>(initialTasks[0].id);
  const schedule = useMemo(() => createSchedule(tasks), [tasks]);
  const selected = schedule.find((item) => item.task.id === selectedId) ?? schedule[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;

    const nextTask: Task = {
      id: Date.now(),
      name: form.name.trim(),
      category: form.category.trim(),
      location: form.location,
      duration: Number(form.duration),
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
              Weather Risk Scheduler
            </p>
            <h1 className="mt-1 text-xl font-semibold md:text-2xl">
              AI 기반 작업 일정 최적화
            </h1>
          </div>
          <div className="hidden items-center gap-7 text-sm font-medium text-black/60 md:flex">
            <span>작업 관리</span>
            <span>위험도 분석</span>
            <span>추천 일정</span>
          </div>
        </div>
      </header>

      <section className="border-b border-black/10 bg-[#202124] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:py-16">
          <div>
            <p className="text-sm font-semibold text-[#f15b2a]">
              현장 작업을 날씨에 맞춰 다시 배열합니다
            </p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
              기상 조건을 읽고, 오늘의 작업 순서를 결정합니다.
            </h2>
          </div>
          <div className="self-end border-l border-white/20 pl-6 text-sm leading-7 text-white/72">
            옥외 작업은 오전 안전 시간대에 우선 배치하고, 기온과 강수 위험이 높아지는 시간대에는 실내 작업을 배정합니다.
            작업 우선순위와 예상 소요 시간도 함께 반영합니다.
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 md:grid-cols-[360px_1fr_320px] md:px-8">
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
              placeholder="예: 옥외 배관 점검"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            작업 종류
            <input
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className="mt-2 w-full border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
              placeholder="예: 설비 점검"
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
                <option value="outdoor">옥외</option>
                <option value="indoor">실내</option>
              </select>
            </label>
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
          </div>

          <label className="mt-4 block text-sm font-medium">
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

          <label className="mt-4 block text-sm font-medium">
            작업 내용
            <textarea
              value={form.detail}
              onChange={(event) => setForm({ ...form, detail: event.target.value })}
              className="mt-2 min-h-24 w-full resize-none border border-black/15 px-3 py-2.5 outline-none focus:border-[#f15b2a]"
              placeholder="작업에 필요한 세부 내용을 입력"
            />
          </label>

          <button className="mt-5 w-full bg-[#f15b2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d9491d]">
            작업 추가
          </button>
        </form>

        <section className="border border-black/10 bg-white">
          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
                Recommended Plan
              </p>
              <h3 className="mt-1 text-xl font-semibold">오늘의 추천 일정</h3>
            </div>
            <span className="bg-[#202124] px-3 py-1.5 text-sm font-semibold text-white">
              {schedule.length}개 배치
            </span>
          </div>

          <div className="divide-y divide-black/10">
            {schedule.map((item) => (
              <button
                key={item.task.id}
                onClick={() => setSelectedId(item.task.id)}
                className={`grid w-full gap-4 px-5 py-4 text-left transition md:grid-cols-[120px_1fr_100px] ${
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
                      {item.task.location === 'outdoor' ? '옥외' : '실내'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-black/62">{item.reason}</p>
                </div>
                <div className="md:text-right">
                  <p className={`text-sm font-semibold ${riskColor(item.riskLevel)}`}>
                    {item.riskLevel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{item.riskScore}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-black/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
              Weather
            </p>
            <h3 className="mt-1 text-lg font-semibold">시간대별 기상</h3>
            <div className="mt-4 space-y-3">
              {weatherSlots.map((slot) => (
                <div key={slot.time} className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
                  <span className="text-sm font-semibold">{slot.time}</span>
                  <div className="h-2 bg-black/10">
                    <div
                      className="h-2 bg-[#f15b2a]"
                      style={{ width: `${Math.min(100, slot.temp * 2.4)}%` }}
                    />
                  </div>
                  <span className="text-sm text-black/60">{slot.temp}도</span>
                </div>
              ))}
            </div>
          </section>

          {selected ? (
            <section className="border border-black/10 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
                Selected Task
              </p>
              <h3 className="mt-1 text-lg font-semibold">{selected.task.name}</h3>
              <p className="mt-3 text-sm leading-6 text-black/62">{selected.task.detail}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">구분</dt>
                  <dd className="mt-1 font-semibold">{selected.task.category}</dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">소요</dt>
                  <dd className="mt-1 font-semibold">{selected.task.duration}시간</dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">위험도</dt>
                  <dd className={`mt-1 font-semibold ${riskColor(selected.riskLevel)}`}>
                    {selected.riskLevel}
                  </dd>
                </div>
                <div className="border-t border-black/10 pt-3">
                  <dt className="text-black/45">우선순위</dt>
                  <dd className="mt-1 font-semibold">{priorityLabel(selected.task.priority)}</dd>
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

function riskColor(level: RiskLevel) {
  if (level === '위험') return 'text-[#b42318]';
  if (level === '비추천') return 'text-[#c75d12]';
  if (level === '주의') return 'text-[#946200]';
  return 'text-[#16794c]';
}

function priorityLabel(priority: number) {
  if (priority === 1) return '높음';
  if (priority === 2) return '보통';
  return '낮음';
}
