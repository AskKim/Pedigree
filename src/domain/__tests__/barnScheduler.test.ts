import { describe, expect, it } from 'vitest';
import {
  buildBarnGanttTimeline,
  buildPriorityEscalationUpdates,
  evaluateTaskPriorityEscalation,
  resizeTaskStartDateByDays,
  shiftTaskDatesByDays,
} from '../barnScheduler';
import { BarnTask, BreedingRecord } from '../models';
import { makeSpeciesProfile } from './testFixtures';

const TS = '2026-04-10T10:00:00.000Z';

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: 'Sample Chore',
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-04-12',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    _rev: 1,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('barnScheduler — Smart Priority Escalation & Drag-and-Drop Gantt Timeline', () => {
  it('escalates overdue/due-today/tomorrow Nestbox and Birth Check tasks to High priority', () => {
    const todayIso = '2026-04-10';

    const nestboxTomorrow = makeTask('t1', {
      category: 'Nestbox',
      priority: 'Normal',
      dueDateIso: '2026-04-11',
    });
    const birthOverdue = makeTask('t2', {
      category: 'Birth Check',
      priority: 'Low',
      dueDateIso: '2026-04-08',
    });
    const routineFuture = makeTask('t3', {
      category: 'Care',
      priority: 'Normal',
      dueDateIso: '2026-04-18',
    });
    const completedNestbox = makeTask('t4', {
      category: 'Nestbox',
      priority: 'Low',
      dueDateIso: '2026-04-05',
      completed: true,
    });
    const severelyOverdueGeneral = makeTask('t5', {
      category: 'Care',
      priority: 'Low',
      dueDateIso: '2026-04-06',
    });

    const e1 = evaluateTaskPriorityEscalation(nestboxTomorrow, todayIso);
    expect(e1.isEscalated).toBe(true);
    expect(e1.effectivePriority).toBe('High');
    expect(e1.isCriticalTimeWindow).toBe(true);

    const e2 = evaluateTaskPriorityEscalation(birthOverdue, todayIso);
    expect(e2.isEscalated).toBe(true);
    expect(e2.isOverdue).toBe(true);
    expect(e2.daysUntilDue).toBe(-2);
    expect(e2.effectivePriority).toBe('High');

    const e3 = evaluateTaskPriorityEscalation(routineFuture, todayIso);
    expect(e3.isEscalated).toBe(false);
    expect(e3.effectivePriority).toBe('Normal');

    const e4 = evaluateTaskPriorityEscalation(completedNestbox, todayIso);
    expect(e4.isEscalated).toBe(false);

    const e5 = evaluateTaskPriorityEscalation(severelyOverdueGeneral, todayIso);
    expect(e5.isEscalated).toBe(true);
    expect(e5.effectivePriority).toBe('High');

    const updates = buildPriorityEscalationUpdates(
      [nestboxTomorrow, birthOverdue, routineFuture, completedNestbox, severelyOverdueGeneral],
      todayIso,
      TS
    );
    expect(updates.map((u) => u.id)).toEqual(['t1', 't2', 't5']);
    expect(updates[0].priority).toBe('High');
    expect(updates[0]._rev).toBe(2);
  });

  it('shifts and resizes task calendar spans cleanly in pure UTC across month boundaries', () => {
    const task = makeTask('span-1', {
      startDateIso: '2026-03-30',
      dueDateIso: '2026-04-01',
      _rev: 3,
    });

    const shifted = shiftTaskDatesByDays(task, 3, '2026-04-11T00:00:00.000Z');
    expect(shifted).not.toBeNull();
    expect(shifted?.startDateIso).toBe('2026-04-02');
    expect(shifted?.dueDateIso).toBe('2026-04-04');
    expect(shifted?._rev).toBe(4);

    // Resize start forward by +5 days clamps cleanly at dueDateIso (collapsing to milestone '')
    const collapsed = resizeTaskStartDateByDays(task, 5, '2026-04-11T00:00:00.000Z');
    expect(collapsed).not.toBeNull();
    expect(collapsed?.startDateIso).toBe('');
    expect(collapsed?.dueDateIso).toBe('2026-04-01');
    expect(collapsed?._rev).toBe(4);
  });

  it('builds Gantt lanes, multi-day spans, overdue tails, and unscheduled tasks', () => {
    const species = makeSpeciesProfile('Rabbit');
    const breeding: BreedingRecord = {
      id: 'b1',
      species: 'Rabbit',
      sireId: 's1',
      damId: 'd1',
      sireName: 'Buck One',
      damName: 'Doe One',
      bredDateIso: '2026-03-10',
      expectedDueDateIso: '2026-04-10',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Palpated Positive',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const tOverdue = makeTask('t-over', {
      title: 'Place Nestbox',
      category: 'Nestbox',
      priority: 'Normal',
      dueDateIso: '2026-04-08',
      linkedBreedingId: 'b1',
    });
    const tMulti = makeTask('t-multi', {
      title: 'Wean Transition',
      category: 'Weaning',
      startDateIso: '2026-04-12',
      dueDateIso: '2026-04-15',
      linkedBreedingId: 'b1',
    });
    const tUnsched = makeTask('t-unsched', {
      title: 'Clean Feed Bins',
      dueDateIso: '',
    });

    const timeline = buildBarnGanttTimeline({
      tasks: [tOverdue, tMulti, tUnsched],
      breedings: [breeding],
      speciesProfile: species,
      windowStartIso: '2026-04-06',
      windowDays: 14,
      grouping: 'breeding_or_animal',
      includeCompleted: false,
      todayIso: '2026-04-10',
    });

    expect(timeline.days).toHaveLength(14);
    expect(timeline.summary.totalOpenCount).toBe(3);
    expect(timeline.summary.overdueCount).toBe(1);
    expect(timeline.summary.escalatedCount).toBe(1);
    expect(timeline.summary.criticalNestboxOrBirthCount).toBe(1);
    expect(timeline.unscheduledTasks).toHaveLength(1);
    expect(timeline.lanes).toHaveLength(1);

    const lane = timeline.lanes[0];
    expect(lane.label).toBe('Doe One × Buck One');
    expect(lane.hasOverdueTask).toBe(true);
    expect(lane.hasEscalatedTask).toBe(true);
    expect(lane.bars[0].overdueTailCols).toBe(2); // Apr 9 & Apr 10
    expect(lane.bars[1].durationDays).toBe(4); // Apr 12..Apr 15
    expect(lane.bars[1].spanCols).toBe(4);
  });
});
