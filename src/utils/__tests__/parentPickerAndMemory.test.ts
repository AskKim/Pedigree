/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Animal } from '../../domain/models';
import { computeVirtualWindow } from '../useVirtualWindow';

const reactHarness = vi.hoisted(() => {
  interface HookState {
    cursor: number;
    idCounter: number;
    states: unknown[];
    refs: Array<{ current: unknown }>;
    memos: Array<{ value: unknown; deps: unknown[] | undefined }>;
    callbacks: Array<{ fn: unknown; deps: unknown[] | undefined }>;
    effects: Array<{
      create: () => void | (() => void);
      deps: unknown[] | undefined;
      cleanup?: () => void;
    }>;
  }

  const state: HookState = {
    cursor: 0,
    idCounter: 0,
    states: [],
    refs: [],
    memos: [],
    callbacks: [],
    effects: [],
  };

  function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  return {
    state,
    depsChanged,
    reset() {
      state.cursor = 0;
      state.idCounter = 0;
      state.states = [];
      state.refs = [];
      state.memos = [];
      state.callbacks = [];
      state.effects = [];
    },
    beginRender() {
      state.cursor = 0;
      state.idCounter = 0;
    },
    runEffects() {
      for (const eff of state.effects) {
        eff.cleanup?.();
        const cleanup = eff.create();
        eff.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    },
  };
});

vi.mock('react', () => ({
  default: { Fragment: Symbol.for('react.fragment') },
  Fragment: Symbol.for('react.fragment'),
  useId() {
    return `picker-id-${++reactHarness.state.idCounter}`;
  },
  useState<T>(initial: T | (() => T)) {
    const idx = reactHarness.state.cursor++;
    if (!(idx in reactHarness.state.states)) {
      reactHarness.state.states[idx] =
        typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      const prev = reactHarness.state.states[idx] as T;
      reactHarness.state.states[idx] =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    };
    return [reactHarness.state.states[idx] as T, setState] as const;
  },
  useRef<T>(initial: T) {
    const idx = reactHarness.state.cursor++;
    if (!(idx in reactHarness.state.refs)) {
      reactHarness.state.refs[idx] = { current: initial };
    }
    return reactHarness.state.refs[idx] as { current: T };
  },
  useMemo<T>(factory: () => T, deps: unknown[] | undefined) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.memos[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.memos[idx] = { value: factory(), deps };
    }
    return reactHarness.state.memos[idx].value as T;
  },
  useCallback<T extends Function>(fn: T, deps: unknown[] | undefined) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.callbacks[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.callbacks[idx] = { fn, deps };
    }
    return reactHarness.state.callbacks[idx].fn as T;
  },
  useEffect(create: () => void | (() => void), deps?: unknown[]) {
    const idx = reactHarness.state.cursor++;
    const existing = reactHarness.state.effects[idx];
    if (!existing || reactHarness.depsChanged(existing.deps, deps)) {
      reactHarness.state.effects[idx] = {
        create,
        deps,
        cleanup: existing?.cleanup,
      };
    }
  },
}));

vi.mock('react/jsx-runtime', () => {
  const createNode = (type: unknown, props: Record<string, unknown>, key?: string) => ({
    type,
    props: props ?? {},
    key,
  });
  return {
    Fragment: Symbol.for('react.fragment'),
    jsx: createNode,
    jsxs: createNode,
  };
});

vi.mock('lucide-react', () => ({
  Check: () => null,
  Search: () => null,
  X: () => null,
}));

import { SearchableParentPicker } from '../../components/SearchableParentPicker';

interface VNodeLike {
  type: unknown;
  props: Record<string, unknown>;
}

function collectNodes(
  root: unknown,
  predicate: (node: VNodeLike) => boolean,
  out: VNodeLike[] = []
): VNodeLike[] {
  if (!root || typeof root !== 'object') return out;
  if (Array.isArray(root)) {
    for (const item of root) collectNodes(item, predicate, out);
    return out;
  }
  const node = root as Partial<VNodeLike>;
  if (node.props && typeof node.props === 'object') {
    if ('type' in node && predicate(node as VNodeLike)) {
      out.push(node as VNodeLike);
    }
    if ('children' in node.props) {
      collectNodes(node.props.children, predicate, out);
    }
  }
  return out;
}

function makeCandidates(count: number): Animal[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `cand-${idx}`,
    species: 'Rabbit',
    name: idx === 2499 ? 'Starlight Target' : `Buck ${idx}`,
    tattoo: `T${String(idx).padStart(4, '0')}`,
    breed: idx % 2 === 0 ? 'Holland Lop' : 'Rex',
    variety: idx === 2499 ? 'Blue Tort' : 'Black',
    sex: 'Male',
    birthDateIso: '2024-01-01',
    sireId: '',
    damId: '',
    weightGrams: 1700,
    status: 'Active',
    archived: false,
    needsAttention: false,
    legsCount: 0,
    registrationNumber: idx === 2499 ? 'REG-9988' : '',
    grandChampionNumber: '',
    cageLocation: `C-${idx}`,
    breederName: 'Tester',
    ownerName: 'Tester',
    genotype: [],
    genotypeRaw: '',
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }));
}

describe('SearchableParentPicker virtualization & constrained memory bounds', () => {
  beforeEach(() => {
    reactHarness.reset();
  });

  it('caps rendered option nodes for 2,500+ candidates in standard and constrained modes and finds deep query matches', () => {
    const candidates = makeCandidates(2500);
    const onChange = vi.fn();

    const renderPicker = (isConstrained: boolean) => {
      reactHarness.beginRender();
      return SearchableParentPicker({
        label: 'Sire',
        value: '',
        candidates,
        unknownLabel: 'Unknown Sire',
        isConstrained,
        onChange,
      });
    };

    // Closed initially -> 0 option nodes rendered
    let tree = renderPicker(false);
    expect(collectNodes(tree, (n) => n.props.role === 'option')).toHaveLength(0);

    // Open combobox via focus
    const input = collectNodes(tree, (n) => n.props.role === 'combobox')[0];
    expect(input).toBeDefined();
    (input.props.onFocus as () => void)();

    // Standard mode: bounded to initialFallbackCount = 16 out of 2,501 options
    tree = renderPicker(false);
    const standardOptions = collectNodes(tree, (n) => n.props.role === 'option');
    expect(standardOptions).toHaveLength(16);

    // Constrained mode: bounded to initialFallbackCount = 10 out of 2,501 options
    tree = renderPicker(true);
    const constrainedOptions = collectNodes(tree, (n) => n.props.role === 'option');
    expect(constrainedOptions).toHaveLength(10);

    // Querying by registration number or tattoo finds deep match #2499
    const openInput = collectNodes(tree, (n) => n.props.role === 'combobox')[0];
    (openInput.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'REG-9988' },
    });
    tree = renderPicker(true);
    const filteredOptions = collectNodes(tree, (n) => n.props.role === 'option');
    // Unknown option + 1 matched animal
    expect(filteredOptions).toHaveLength(2);
    const matchText = JSON.stringify(filteredOptions[1]);
    expect(matchText).toContain('Starlight Target');
  });

  it('bounds HerdScreen virtual windows tightly on constrained vs standard devices', () => {
    const constrained = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 112,
      overscan: 3,
      initialFallbackCount: 20,
    });
    const standard = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 112,
      overscan: 8,
      initialFallbackCount: 50,
    });

    expect(constrained.endIndex - constrained.startIndex + 1).toBe(20);
    expect(standard.endIndex - standard.startIndex + 1).toBe(50);

    const scrolledConstrained = computeVirtualWindow({
      itemCount: 2200,
      scrollTop: 112 * 500,
      viewportHeight: 600,
      estimateSize: 112,
      overscan: 3,
      initialFallbackCount: 20,
    });
    expect(scrolledConstrained.endIndex - scrolledConstrained.startIndex + 1).toBeLessThan(15);
  });
});
